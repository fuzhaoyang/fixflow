import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createSession } from "../core.js";
import { collectAll } from "../metrics.js";
import { loadConfig } from "../config.js";

const STATIC = join(fileURLToPath(new URL(".", import.meta.url)), "static");

function defaultConfigPath() {
  return join(homedir(), ".config", "fixflow", "config.json");
}

function defaultHistoryPath() {
  return join(homedir(), ".config", "fixflow", "history.json");
}

async function readHistoryFile(path) {
  try {
    const data = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function writeHistoryFile(path, messages) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(messages.slice(-200), null, 2));
}

async function fetchModels(baseUrl, apiKey) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`拉取模型列表失败: ${res.status}`);
  const data = await res.json();
  return (data.data || []).map((m) => m.id);
}

export async function startWeb(config = {}) {
  config.sslSites = config.sslSites || [];
  config.pingTargets = config.pingTargets || [];
  const clients = new Set();
  const waiters = new Map();
  let seq = 0;
  const configPath = config.configPath || defaultConfigPath();
  const historyPath = config.historyPath || defaultHistoryPath();

  const broadcast = (event) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of clients) res.write(data);
  };

  const session = createSession({
    config,
    onEvent: broadcast,
    onConfirm: (command) => new Promise((resolve) => {
      const id = String(++seq);
      waiters.set(id, resolve);
      broadcast({ type: "confirm", id, command });
    }),
  });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    try {
      if (url.pathname === "/api/metrics") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(await collectAll(config)));
      } else if (url.pathname === "/api/models") {
        try {
          const models = await fetchModels(config.baseUrl, config.apiKey);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ models }));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
        }
      } else if (url.pathname === "/api/config" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ baseUrl: config.baseUrl, model: config.model, apiKey: config.apiKey ? "••••" + config.apiKey.slice(-4) : "" }));
      } else if (url.pathname === "/api/config" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { baseUrl, apiKey, model, sslSites, pingTargets } = JSON.parse(body || "{}");
        if (baseUrl) config.baseUrl = baseUrl;
        if (apiKey) config.apiKey = apiKey;
        if (model) config.model = model;
        if (Array.isArray(sslSites)) config.sslSites = sslSites;
        if (Array.isArray(pingTargets)) config.pingTargets = pingTargets;
        let existing = {};
        try { existing = JSON.parse(await readFile(configPath, "utf8")); } catch {}
        const saved = { ...existing, baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, sslSites: config.sslSites, pingTargets: config.pingTargets };
        await mkdir(dirname(configPath), { recursive: true });
        await writeFile(configPath, JSON.stringify(saved, null, 2));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, baseUrl: config.baseUrl, model: config.model, apiKey: config.apiKey ? "••••" + config.apiKey.slice(-4) : "" }));
      } else if (url.pathname === "/api/history" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ messages: await readHistoryFile(historyPath) }));
      } else if (url.pathname === "/api/history" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { messages } = JSON.parse(body || "{}");
        if (!Array.isArray(messages)) { res.writeHead(400); res.end("{}"); return; }
        const existing = await readHistoryFile(historyPath);
        await writeHistoryFile(historyPath, [...existing, ...messages]);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      } else if (url.pathname === "/api/history/clear" && req.method === "POST") {
        await writeHistoryFile(historyPath, []);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      } else if (url.pathname === "/api/chat" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { input, images = [] } = JSON.parse(body || "{}");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        session.send(input, images)
          .then(() => broadcast({ type: "done" }))
          .catch((e) => broadcast({ type: "error", text: String(e) }));
      } else if (url.pathname === "/api/confirm" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { id, ok } = JSON.parse(body || "{}");
        const resolve = waiters.get(id);
        if (resolve) { waiters.delete(id); resolve(Boolean(ok)); }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      } else if (url.pathname === "/api/abort" && req.method === "POST") {
        session.abort();
        broadcast({ type: "aborted" });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      } else if (url.pathname === "/api/stream") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        res.write(": connected\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
      } else if (url.pathname === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(await readFile(join(STATIC, "index.html")));
      } else if (url.pathname === "/app.js") {
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        res.end(await readFile(join(STATIC, "app.js")));
      } else {
        res.writeHead(404); res.end("Not Found");
      }
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
  });

  await new Promise((resolve) => server.listen(config.port ?? 8080, "127.0.0.1", resolve));
  const address = server.address();
  console.log(`fixflow 面板已启动：http://127.0.0.1:${address.port}`);
  return {
    server,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}