import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createSession } from "../core.js";
import { collectAll, collectPorts, collectConnectivity, formatDateTime, listNginxConfs, readNginxConf, writeNginxConf, createTtlCache } from "../metrics.js";
import { loadConfig, normalizeSslSites } from "../config.js";
import { collectSslAll, detectRenewTool, renewCert, checkSslAlerts, sendWebhook, sendEmail } from "../ssl.js";
import { createUsageStore } from "../usage.js";
import { restart as restartService } from "../service.js";
import { hashPassword, verifyPassword, createSessionStore, parseCookie, createCaptchaStore, captchaSvg } from "../auth.js";
import { createMonitor, readProcStat, readNetDev, readDiskstats, nowTs, calcCpuUsage } from "../net.js";
import { parseDf, parseFree, parseLoad } from "../health.js";
import { runCommand } from "../tools.js";

const STATIC = join(fileURLToPath(new URL(".", import.meta.url)), "static");

function defaultConfigPath() {
  return join(homedir(), ".config", "fixflow", "config.json");
}

function defaultHistoryPath() {
  return join(homedir(), ".config", "fixflow", "history.json");
}

function defaultTermHistoryPath() {
  return join(homedir(), ".config", "fixflow", "term-history.json");
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
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`拉取模型列表失败: ${res.status}`);
  const data = await res.json();
  return (data.data || []).map((m) => m.id);
}

export async function startWeb(config = {}, deps = {}) {
  config.sslSites = normalizeSslSites(config.sslSites);
  config.sslAlerts = config.sslAlerts || { webhook: "", smtp: {} };
  config.pingTargets = config.pingTargets || [];
  const clients = new Set();
  const metricsCache = createTtlCache(3000);
  const statusCache = createTtlCache(2000);
  const renewToolCache = createTtlCache(30000);
  const waiters = new Map();
  let seq = 0;
  const configPath = config.configPath || defaultConfigPath();
  const historyPath = config.historyPath || defaultHistoryPath();
  const termHistoryPath = config.termHistoryPath || defaultTermHistoryPath();
  const sessions = typeof deps.sessions === "function" ? deps.sessions() : (deps.sessions || createSessionStore());
  const captchas = typeof deps.captchas === "function" ? deps.captchas() : (deps.captchas || createCaptchaStore());
  const readConfigFile = async () => {
    try { return JSON.parse(await readFile(configPath, "utf8")); } catch { return {}; }
  };
  const writeAuth = async (auth) => {
    const existing = await readConfigFile();
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify({ ...existing, auth }, null, 2));
  };
  const readAuth = async () => (await readConfigFile()).auth || null;
  const persistConfig = async () => {
    const existing = await readConfigFile();
    const saved = { ...existing, baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, sslSites: config.sslSites, pingTargets: config.pingTargets, sslAlerts: config.sslAlerts };
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(saved, null, 2));
  };
  const execCmd = deps.runCommand || runCommand;

  const procGuard = async (pid) => {
    if (!Number.isInteger(pid) || pid <= 1) return "系统级进程，禁止操作";
    try {
      const [stat, status] = await Promise.all([
        readFile(`/proc/${pid}/stat`, "utf8"),
        readFile(`/proc/${pid}/status`, "utf8"),
      ]);
      const m = stat.match(/\(([^)]*)\)\s*(\w)/);
      const name = m ? m[1] : "";
      const state = m ? m[2] : "";
      const uid = (status.match(/^Uid:\s+(\d+)/m) || [])[1];
      if (state === "D" || state === "Z") return "该进程状态不可操作（D/Z）";
      if (uid === "0" && /(daemon|systemd|dbus)/.test(name)) return "系统服务进程，禁止操作";
      if (/(^dde-|kwin|Xorg|lightdm)/.test(name)) return "系统组件进程，禁止操作";
      if (/^k/.test(name)) return "内核线程，禁止操作";
      return null;
    } catch { return "进程不存在或不可访问"; }
  };

  const authHeader = (req) => {
    const cookie = parseCookie(req.headers.cookie || "");
    const token = cookie.fixflow_token || "";
    return sessions.valid(token) ? token : "";
  };

  const send401 = (res, message = "未登录或会话已过期") => {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message }));
  };

  const broadcast = (event) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of clients) {
      if (res.destroyed || res.writableNeedDrain) { clients.delete(res); continue; }
      try { res.write(data); } catch { clients.delete(res); }
    }
  };
  const spawnShell = deps.spawnShell || (() => spawn("script", ["-qfc", "bash", "/dev/null"], { cwd: process.env.HOME || "/", env: process.env }));
  let termShell = null;
  let termBuffer = "";
  const MAX_TERM_BUFFER = 1024 * 1024;
  const ensureShell = () => {
    if (termShell && termShell.exitCode === null && !termShell.killed) return termShell;
    termShell = spawnShell();
    const push = (d) => {
      const s = String(d);
      termBuffer += s;
      if (termBuffer.length > MAX_TERM_BUFFER) termBuffer = termBuffer.slice(-MAX_TERM_BUFFER);
      broadcast({ type: "term", data: s });
    };
    termShell.stdout?.on("data", push);
    termShell.stderr?.on("data", push);
    termShell.on("exit", () => { broadcast({ type: "term", data: "\n[会话已结束]\n" }); termShell = null; });
    termShell.on("error", (e) => broadcast({ type: "term", data: `\n[shell 错误] ${e.message}\n` }));
    return termShell;
  };
  const sseGuard = setInterval(() => {
    for (const res of clients) if (res.writableNeedDrain) res.destroy();
  }, 15000);

  const usageStore = await createUsageStore({ filePath: join(dirname(configPath), "usage.json") });

  const session = createSession({
    config,
    onEvent: broadcast,
    onConfirm: (info) => new Promise((resolve) => {
      const id = String(++seq);
      waiters.set(id, resolve);
      broadcast({ type: "confirm", id, ...info });
    }),
    onUsage: (u) => usageStore.record(u),
  });

  const monitor = createMonitor();
  const monitorTimer = setInterval(() => monitor.tick(), 1000);

  async function collectStatus() {
    const [uptime, mem, df, nproc, osRelease, uname, procUptime] = await Promise.all([
      runCommand("uptime"),
      runCommand("free -m"),
      runCommand("df -h /"),
      runCommand("nproc"),
      runCommand("cat /etc/os-release"),
      runCommand("uname -m"),
      runCommand("cat /proc/uptime"),
    ]);
    const ncpu = parseInt(nproc.stdout.trim() || "1", 10) || 1;
    const p = parseLoad(uptime.stdout || "");
    const load = p.load;
    const memPct = parseFree(mem.stdout || "").usedPct;
    const disk = parseDf(df.stdout || "").find((d) => d.mount === "/")?.usedPct ?? 0;
    const osMatch = (osRelease.stdout || "").match(/PRETTY_NAME="?([^"\n]+)/);
    const uptimeSec = parseFloat(procUptime.stdout?.trim()?.split(/\s+/)[0] || "");
    return {
      sys: {
        os: osMatch?.[1] || "未知系统",
        arch: uname.stdout?.trim() || "unknown",
        uptime: Number.isFinite(uptimeSec) ? formatUptime(uptimeSec) : "—",
      },
      load: { pct: Math.min(100, Math.round((load / Math.max(1, ncpu)) * 100)), load, ncpu, load1: p.load1, load5: p.load5, load15: p.load15 },
      cpu: { pct: monitor.cpu() },
      mem: { pct: memPct },
      disk: { pct: disk },
    };
  }

function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}天${h}小时`;
  if (h > 0) return `${h}小时${m}分钟`;
  return `${m}分钟`;
}

  const captchaIdFromCookie = (req) => parseCookie(req.headers.cookie || "").fixflow_captcha || "";

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    try {
      const isPublic = url.pathname === "/api/login" || url.pathname === "/api/register" || url.pathname === "/api/status" || url.pathname === "/api/captcha";
      const needsAuth = url.pathname.startsWith("/api/") && !isPublic;
      if (needsAuth && !authHeader(req)) { send401(res); return; }

      if (url.pathname === "/api/captcha" && req.method === "GET") {
        const { id, code } = captchas.create();
        res.writeHead(200, {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "no-store",
          "Set-Cookie": `fixflow_captcha=${id}; Path=/; HttpOnly; Max-Age=300; SameSite=Lax`,
        });
        res.end(captchaSvg(code));
      } else if (url.pathname === "/api/status" && req.method === "GET") {
        const auth = await readAuth();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ registered: Boolean(auth), loggedIn: Boolean(authHeader(req)), username: authHeader(req) ? (auth?.username || "") : "" }));
      } else if (url.pathname === "/api/register" && req.method === "POST") {
        const existing = await readAuth();
        if (existing) { res.writeHead(409, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "已注册账号，请直接登录" })); return; }
        let body = "";
        for await (const chunk of req) body += chunk;
        const { username, password, captchaCode } = JSON.parse(body || "{}");
        if (!captchas.verify(captchaIdFromCookie(req), captchaCode)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "验证码错误或已过期" }));
          return;
        }
        if (!username || !password || password.length < 6) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "用户名和至少 6 位密码必填" }));
          return;
        }
        const { salt, hash } = hashPassword(password);
        await writeAuth({ username, salt, hash });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } else if (url.pathname === "/api/login" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { username, password, captchaCode } = JSON.parse(body || "{}");
        if (!captchas.verify(captchaIdFromCookie(req), captchaCode)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "验证码错误或已过期" }));
          return;
        }
        const auth = await readAuth();
        if (!auth || auth.username !== username || !verifyPassword(password, auth)) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "用户名或密码错误" }));
          return;
        }
        const token = sessions.create();
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Set-Cookie": `fixflow_token=${token}; HttpOnly; Path=/; Max-Age=43200; SameSite=Lax`,
        });
        res.end(JSON.stringify({ ok: true }));
      } else if (url.pathname === "/api/logout" && req.method === "POST") {
        sessions.revoke(authHeader(req));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } else if (url.pathname === "/api/metrics") {
        const q = url.searchParams;
        const data = await metricsCache("metrics", () => { if (process.env.FF_DEBUG_METRICS) console.log(`[metrics] ${Date.now()}`); return collectAll(config); });
        if (data.ssl) data.ssl.renewTool = (await renewToolCache("tool", () => detectRenewTool())).tool;
        if (data.ssl?.results) {
          try {
            const { alerts, lastNotified } = checkSslAlerts(data.ssl.results, config.sslAlerts);
            if (alerts.length) {
              config.sslAlerts.lastNotified = lastNotified;
              await persistConfig();
              for (const a of alerts) {
                await sendWebhook(config.sslAlerts.webhook, a);
                await sendEmail(config.sslAlerts.smtp, `[Fixflow] 证书即将到期：${a.label}`, `${a.label} 剩余 ${a.daysLeft} 天（${a.notAfter}）`);
              }
            }
          } catch {}
        }
        if (q.get("port")) data.portScan = await collectPorts(q.get("port"));
        if (q.get("ping")) data.pingResult = await collectConnectivity([q.get("ping")]);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      } else if (url.pathname === "/api/overview") {
        const net = monitor.net();
        const io = monitor.io();
        const nics = Object.keys(net.last || {}).filter((n) => n !== "lo");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: await statusCache("status", () => { if (process.env.FF_DEBUG_METRICS) console.log(`[status] ${Date.now()}`); return collectStatus(); }),
          nics,
          net: net.samples,
          io: io.samples,
          usage: usageStore.daily(30),
        }));
      } else if (url.pathname === "/api/usage" && req.method === "GET") {
        const days = parseInt(url.searchParams.get("days") || "30", 10);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ days: usageStore.daily(Number.isFinite(days) ? days : 30) }));
      } else if (url.pathname === "/api/report") {
        const data = await metricsCache("metrics", () => { if (process.env.FF_DEBUG_METRICS) console.log(`[metrics] ${Date.now()}`); return collectAll(config); });
        const s = data.system;
        const now = formatDateTime(new Date());
        let md = `# Fixflow 系统体检报告\n\n生成时间：${now}\n\n## 总览\n\n| 项目 | 状态 | 摘要 |\n|---|---|---|\n`;
        for (const it of s?.health?.items || []) {
          const icon = it.status === "ok" ? "✅ 正常" : it.status === "warn" ? "⚠️ 警告" : "❌ 异常";
          md += `| ${it.name} | ${icon} | ${it.detail} |\n`;
        }
        md += `\n## 风险项\n\n`;
        md += s?.health?.risks?.length
          ? s.health.risks.map((r) => `- ${r}`).join("\n") + "\n"
          : "未发现风险。\n";
        md += `\n## 系统详情\n\n`;
        for (const key of ["uptime", "memory", "disk"]) {
          const item = s?.[key];
          if (item) md += `### ${key}\n\n\`\`\`\n${item.detail}\n\`\`\`\n\n`;
        }
        res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
        res.end(md);
      } else if (url.pathname === "/api/models") {
        try {
          const baseUrl = url.searchParams.get("baseUrl") || config.baseUrl;
          const apiKey = url.searchParams.get("apiKey") || config.apiKey;
          const models = await fetchModels(baseUrl, apiKey);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ models }));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e.message }));
        }
      } else if (url.pathname === "/api/ssl" && req.method === "GET") {
        const data = await collectSslAll(config);
        const { tool } = await detectRenewTool();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ...data, renewTool: tool }));
      } else if (url.pathname === "/api/ssl" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { type, host, port, path, label } = JSON.parse(body || "{}");
        if (type === "local" ? !path : !host) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: type === "local" ? "缺少证书路径" : "缺少域名" }));
          return;
        }
        const entry = {
          id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          type: type === "local" ? "local" : "remote",
          host: host || "", port: port || "443", path: path || "",
          label: label || "", enabled: true, source: "manual",
        };
        config.sslSites.push(entry);
        await persistConfig();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, entry }));
      } else if (url.pathname === "/api/ssl" && req.method === "PATCH") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { id, label, enabled } = JSON.parse(body || "{}");
        const entry = config.sslSites.find((e) => e.id === id);
        if (!entry) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "条目不存在" })); return; }
        if (label !== undefined) entry.label = String(label);
        if (enabled !== undefined) entry.enabled = Boolean(enabled);
        await persistConfig();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } else if (url.pathname === "/api/ssl" && req.method === "DELETE") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { id } = JSON.parse(body || "{}");
        const entry = config.sslSites.find((e) => e.id === id);
        if (!entry || entry.source !== "manual") {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "自动发现的证书不可删除" }));
          return;
        }
        config.sslSites = config.sslSites.filter((e) => e.id !== id);
        await persistConfig();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } else if (url.pathname === "/api/ssl/renew" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { id, password } = JSON.parse(body || "{}");
        const auth = await readAuth();
        if (!auth || !verifyPassword(password || "", auth)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "密码错误，操作未执行" }));
          return;
        }
        const entry = config.sslSites.find((e) => e.id === id);
        if (!entry || entry.type !== "local") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "仅本机证书文件支持续签" }));
          return;
        }
        const data = await collectSslAll(config);
        const live = data.results.find((r) => r.id === id) || entry;
        const result = await renewCert({ ...entry, cn: live.cn });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } else if (url.pathname === "/api/config" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ baseUrl: config.baseUrl, model: config.model, apiKey: config.apiKey ? "••••" + config.apiKey.slice(-4) : "", sslSites: config.sslSites, pingTargets: config.pingTargets, serviceKeywords: config.serviceKeywords }));
      } else if (url.pathname === "/api/config" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { baseUrl, apiKey, model, sslSites, pingTargets, serviceKeywords } = JSON.parse(body || "{}");
        if (baseUrl) config.baseUrl = baseUrl;
        if (apiKey) config.apiKey = apiKey;
        if (model) config.model = model;
        if (Array.isArray(sslSites)) config.sslSites = sslSites;
        if (Array.isArray(pingTargets)) config.pingTargets = pingTargets;
        if (Array.isArray(serviceKeywords)) config.serviceKeywords = serviceKeywords.map((s) => String(s).trim()).filter(Boolean);
        let existing = {};
        try { existing = JSON.parse(await readFile(configPath, "utf8")); } catch {}
        const saved = { ...existing, baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, sslSites: config.sslSites, pingTargets: config.pingTargets, serviceKeywords: config.serviceKeywords };
        await mkdir(dirname(configPath), { recursive: true });
        await writeFile(configPath, JSON.stringify(saved, null, 2));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, baseUrl: config.baseUrl, model: config.model, apiKey: config.apiKey ? "••••" + config.apiKey.slice(-4) : "", sslSites: config.sslSites, pingTargets: config.pingTargets, serviceKeywords: config.serviceKeywords }));
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
      } else if (url.pathname === "/api/term/open" && req.method === "POST") {
        ensureShell();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ history: termBuffer }));
      } else if (url.pathname === "/api/term/input" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { data } = JSON.parse(body || "{}");
        const sh = ensureShell();
        try { sh.stdin.write(String(data ?? "")); } catch {}
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      } else if (url.pathname === "/api/term/close" && req.method === "POST") {
        if (termShell) { try { termShell.kill(); } catch {} termShell = null; }
        termBuffer = "";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      } else if (url.pathname === "/api/term/history" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ records: await readHistoryFile(termHistoryPath) }));
      } else if (url.pathname === "/api/term/history" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { command } = JSON.parse(body || "{}");
        const cmd = String(command || "").trim();
        if (cmd) {
          const auth = await readAuth();
          const rec = { time: new Date().toISOString().replace("T", " ").slice(0, 19), user: auth?.username || "?", command: cmd };
          const list = await readHistoryFile(termHistoryPath);
          list.push(rec);
          await writeHistoryFile(termHistoryPath, list);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      } else if (url.pathname === "/api/process" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { action, pid, service, password } = JSON.parse(body || "{}");
        const auth = await readAuth();
        if (!auth || !verifyPassword(password || "", auth)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "密码错误，操作未执行" }));
        } else if (!Number.isInteger(pid) || pid <= 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "无效的 PID" }));
        } else {
          const cmd = action === "restart" && service
            ? `systemctl restart ${service}`
            : action === "kill"
              ? `kill ${pid}`
              : "";
          if (!cmd) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "不支持的操作或缺少服务名" }));
          } else {
            const guardErr = action === "kill" ? await procGuard(pid) : null;
            if (guardErr) {
              res.writeHead(403, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: guardErr }));
            } else {
              const r = await execCmd(cmd, { timeout: 15000 });
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr }));
            }
          }
        }
      } else if (url.pathname === "/api/firewall/close" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { port, proto = "tcp", mode, password } = JSON.parse(body || "{}");
        const auth = await readAuth();
        if (!auth || !verifyPassword(password || "", auth)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "密码错误，操作未执行" }));
        } else if (!Number.isInteger(port) || port < 1 || port > 65535) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "无效的端口" }));
        } else if (!["tcp", "udp"].includes(proto)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "不支持的协议" }));
        } else if (!["deny", "delete"].includes(mode)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "不支持的关闭模式" }));
        } else {
          const cmd = mode === "deny" ? `ufw deny ${port}/${proto}` : `ufw delete allow ${port}/${proto}`;
          const r = await execCmd(cmd, { timeout: 15000 });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr }));
        }
      } else if (url.pathname === "/api/nginx/confs" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(await listNginxConfs()));
      } else if (url.pathname === "/api/nginx/conf" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(await readNginxConf(url.searchParams.get("path"))));
      } else if (url.pathname === "/api/nginx/conf" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { path, content, password } = JSON.parse(body || "{}");
        const auth = await readAuth();
        if (!auth || !verifyPassword(password || "", auth)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "密码错误，操作未执行" }));
        } else {
          const r = await writeNginxConf(path, content ?? "");
          res.writeHead(r.ok ? 200 : 400, { "Content-Type": "application/json" });
          res.end(JSON.stringify(r));
        }
      } else if (url.pathname === "/api/nginx/reload" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { action, password } = JSON.parse(body || "{}");
        const auth = await readAuth();
        if (!auth || !verifyPassword(password || "", auth)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "密码错误，操作未执行" }));
        } else {
          const cmds = { start: "systemctl start nginx", stop: "systemctl stop nginx", restart: "systemctl restart nginx", reload: "systemctl reload nginx" };
          const cmd = cmds[action] || cmds.reload;
          const r = await execCmd(cmd, { timeout: 15000 });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: r.exitCode === 0, output: (r.stdout || r.stderr || "").trim() }));
        }
      } else if (url.pathname === "/api/restart" && req.method === "POST") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        setTimeout(() => {
          const r = (config.restart || restartService)();
          console.log(`重启服务（${r.method}），进程即将退出。`);
          if (!config.restart) process.exit(0);
        }, 200);
      } else if (url.pathname === "/api/stream") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        res.write(": connected\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
      } else if (url.pathname === "/") {
        const html = await readFile(join(STATIC, "index.html"));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      } else if (url.pathname === "/app.js") {
        const js = await readFile(join(STATIC, "app.js"));
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        res.end(js);
      } else if (url.pathname === "/echarts.min.js") {
        const js = await readFile(join(STATIC, "echarts.min.js"));
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        res.end(js);
      } else if (url.pathname === "/xterm.min.js") {
        const js = await readFile(join(STATIC, "xterm.min.js"));
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        res.end(js);
      } else if (url.pathname === "/xterm.css") {
        const css = await readFile(join(STATIC, "xterm.css"));
        res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
        res.end(css);
      } else {
        res.writeHead(404); res.end("Not Found");
      }
    } catch (e) {
      console.error("请求处理失败:", e);
      try {
        if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(e) }));
      } catch {}
    }
  });

  const listenPort = config.port ?? 8080;
  await new Promise((resolve, reject) => {
    let attempts = 0;
    const tryListen = () => {
      const srv = server.listen(listenPort, "127.0.0.1", resolve);
      srv.once("error", (e) => {
        if (e.code === "EADDRINUSE" && attempts < 5) {
          attempts++;
          setTimeout(tryListen, 400);
        } else if (e.code === "EADDRINUSE") {
          console.error(`\n⚠ 端口 ${listenPort} 已被占用（面板可能已在运行）。`);
          console.error(`  直接访问 http://127.0.0.1:${listenPort}，或先停止旧进程再启动。`);
          process.exit(1);
        } else {
          reject(e);
        }
      });
    };
    tryListen();
  });
  const address = server.address();
  console.log(`fixflow 面板已启动：http://127.0.0.1:${address.port}`);
  return {
    server,
    close: () => new Promise((resolve) => { clearInterval(monitorTimer); clearInterval(sseGuard); server.close(resolve); }),
  };
}