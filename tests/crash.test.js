import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";

const SERVER_HREF = new URL("../src/web/server.js", import.meta.url).href;
const ENTRY_SCRIPT = `import { startWeb } from ${JSON.stringify(SERVER_HREF)};
const { server } = await startWeb({ port: Number(process.env.FF_PORT || 0), configPath: process.env.FF_CFG, services: [], databases: [], pingTargets: [], sslSites: [] }, {
  captchas: { create: () => ({ id: "t", code: "0000" }), verify: (i, c) => String(c) === "0000" },
});
console.log("READY", server.address().port);`;

let child = null;
let base = "";
let cookie = "";

async function login(b) {
  await fetch(`${b}/api/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "secret123", captchaCode: "0000" }),
  }).catch(() => {});
  const r = await fetch(`${b}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "secret123", captchaCode: "0000" }),
  });
  return r.headers.get("set-cookie").split(";")[0];
}

async function startServer() {
  const dir = mkdtempSync(join(tmpdir(), "ff-crash-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, "{}");
  child = spawn(process.execPath, ["--input-type=module", "-e", ENTRY_SCRIPT], {
    env: { ...process.env, FF_CFG: cfg, FF_PORT: "0" },
    stdio: ["ignore", "pipe", "ignore"],
  });
  const port = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("启动超时")), 15000);
    child.stdout.on("data", (d) => { const m = String(d).match(/READY (\d+)/); if (m) { clearTimeout(t); res(Number(m[1])); } });
    child.on("exit", (code) => { clearTimeout(t); rej(new Error(`退出 code=${code}`)); });
  });
  base = `http://127.0.0.1:${port}`;
  cookie = await login(base);
}

async function aliveOk() {
  try {
    const r = await fetch(`${base}/`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}

const post = (url, body, ck) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(ck ? { Cookie: ck } : {}) }, body }).catch(() => {});

test.before(async () => { await startServer(); });
test.after(() => { if (child) child.kill(); });

test("畸形输入与超限请求不导致崩溃", async () => {
  await post(`${base}/api/chat`, "not-json");
  await post(`${base}/api/firewall/close`, "[[[[");
  await fetch(`${base}/api/metrics?x=${"a".repeat(8000)}`, { headers: { Cookie: cookie } }).catch(() => {});
  await post(`${base}/api/chat`, "x".repeat(5 * 1024 * 1024), cookie);
  await fetch(`${base}/api/nginx/conf?path=${encodeURIComponent("/etc/passwd")}`, { headers: { Cookie: cookie } }).catch(() => {});
  await post(`${base}/api/nginx/conf`, JSON.stringify({ path: "/etc/passwd", content: "x", password: "secret123" }), cookie);
  await post(`${base}/api/firewall/close`, JSON.stringify({ port: 99999, mode: "x", proto: "tcp", password: "secret123" }), cookie);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await aliveOk(), true);
});

test("并发、SSE 断开与未认证请求不导致崩溃", async () => {
  await Promise.all(Array.from({ length: 50 }, () => fetch(`${base}/api/metrics`, { headers: { Cookie: cookie } }).catch(() => {})));
  await Promise.all(["/api/metrics", "/api/config", "/api/process"].map((p) => fetch(`${base}${p}`, { method: "POST", body: "{}" }).catch(() => {})));
  const aborts = [];
  for (let i = 0; i < 30; i++) {
    const ac = new AbortController();
    aborts.push(ac);
    fetch(`${base}/api/stream`, { headers: { Cookie: cookie }, signal: ac.signal })
      .then((r) => r.body.getReader().cancel()).catch(() => {});
  }
  await Promise.all(aborts.map((a) => a.abort()));
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await aliveOk(), true);
});

test("畸形/超长请求行不导致崩溃", async () => {
  const u = new URL(base);
  await new Promise((res) => {
    const s = net.connect(u.port, "127.0.0.1", () => {
      s.write(`GET / HTTP/1.1\r\nHost: x\r\nX-A: ${"a".repeat(20000)}\r\n\r\n`);
      setTimeout(() => s.destroy(), 400);
    });
    s.on("error", () => res());
    s.on("close", () => res());
  });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await aliveOk(), true);
});

test("端口占用时二次启动退出码为 1（主进程不受影响）", async () => {
  const p = new URL(base).port;
  const dir = mkdtempSync(join(tmpdir(), "ff-crash2-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, "{}");
  const code = await new Promise((res) => {
    const c2 = spawn(process.execPath, ["--input-type=module", "-e", ENTRY_SCRIPT], {
      env: { ...process.env, FF_CFG: cfg, FF_PORT: p },
      stdio: "ignore",
    });
    c2.on("exit", (c) => res(c));
  });
  assert.equal(code, 1);
  assert.equal(await aliveOk(), true);
});

test("/api/restart 触发进程退出（exit 0）", async () => {
  const exited = new Promise((res) => { child.once("exit", (code) => res(code)); });
  await post(`${base}/api/restart`, "{}", cookie);
  assert.equal(await exited, 0);
}, { timeout: 10000 });
