import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import https from "node:https";
import net from "node:net";
import { X509Certificate } from "node:crypto";
import { spawnSync } from "node:child_process";
import { startWeb } from "../src/web/server.js";
import { loadConfig } from "../src/config.js";

const HAS_OPENSSL = spawnSync("openssl", ["version"]).status === 0;
const captchas = { create: () => ({ id: "c", code: "0000" }), verify: () => true };
const deps = { captchas };

function newDir() { return mkdtempSync(join(tmpdir(), "ff-tls-")); }
function newCfg(dir) { const p = join(dir, "config.json"); writeFileSync(p, "{}"); return p; }

function mkServer(dir, extra = {}) {
  const cfg = join(dir, "config.json");
  if (!existsSync(cfg)) writeFileSync(cfg, "{}");
  return startWeb({ port: 0, httpsPort: 0, tls: true, tlsCertDir: join(dir, "certs"), services: [], databases: [], configPath: cfg, sslSites: [] }, { ...deps, ...extra });
}

function httpsReq(port, path, { method = "GET", body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = https.request(
      { host: "127.0.0.1", port, path, method, rejectUnauthorized: false, headers: data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {} },
      (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ code: res.statusCode, cookie: res.headers["set-cookie"], body: b })); }
    );
    r.on("error", reject); if (data) r.write(data); r.end();
  });
}

test("1. 默认配置启用 TLS，且 httpsPort 默认 8443", () => {
  const dir = newDir();
  const p = join(dir, "config.json");
  writeFileSync(p, "{}");
  const c = loadConfig({ filePath: p });
  assert.equal(c.tls, true);
  assert.equal(c.httpsPort, 8443);
  writeFileSync(p, JSON.stringify({ tls: false, httpsPort: 9443 }));
  const c2 = loadConfig({ filePath: p });
  assert.equal(c2.tls, false);
  assert.equal(c2.httpsPort, 9443);
});

test("2. tls:false 时不启动 HTTPS，HTTP 正常", async () => {
  const dir = newDir();
  const cfg = newCfg(dir);
  const w = await startWeb({ port: 0, tls: false, services: [], databases: [], configPath: cfg, sslSites: [] }, deps);
  assert.equal(w.httpsServer, null);
  const r = await fetch(`http://127.0.0.1:${w.server.address().port}/`);
  assert.equal(r.status, 200);
  await w.close();
});

test("3. HTTPS 启动时自动生成自签证书（CN=fixflow）", async (t) => {
  if (!HAS_OPENSSL) return t.skip("无 openssl");
  const dir = newDir();
  const w = await mkServer(dir);
  assert.ok(w.httpsServer, "应启动 HTTPS");
  const certPath = join(dir, "certs", "cert.pem");
  const keyPath = join(dir, "certs", "key.pem");
  assert.ok(existsSync(certPath) && existsSync(keyPath));
  assert.match(new X509Certificate(readFileSync(certPath)).subject, /CN=fixflow/);
  await w.close();
});

test("4. HTTPS 首页可访问", async (t) => {
  if (!HAS_OPENSSL) return t.skip("无 openssl");
  const dir = newDir();
  const w = await mkServer(dir);
  const r = await httpsReq(w.httpsServer.address().port, "/");
  assert.equal(r.code, 200);
  assert.match(r.body, /id="auth-mask"/);
  await w.close();
});

test("5. HTTP 与 HTTPS 并存（不同端口均可访问）", async (t) => {
  if (!HAS_OPENSSL) return t.skip("无 openssl");
  const dir = newDir();
  const w = await mkServer(dir);
  const hp = w.server.address().port;
  const sp = w.httpsServer.address().port;
  assert.notEqual(hp, sp);
  const [a, b] = await Promise.all([fetch(`http://127.0.0.1:${hp}/`), httpsReq(sp, "/")]);
  assert.equal(a.status, 200);
  assert.equal(b.code, 200);
  await w.close();
});

test("6. TLS 登录 cookie 带 Secure", async (t) => {
  if (!HAS_OPENSSL) return t.skip("无 openssl");
  const dir = newDir();
  const w = await mkServer(dir);
  const sp = w.httpsServer.address().port;
  const creds = { username: "admin", password: "Secret123!", captchaCode: "0000" };
  assert.equal((await httpsReq(sp, "/api/register", { method: "POST", body: creds })).code, 200);
  const login = await httpsReq(sp, "/api/login", { method: "POST", body: creds });
  assert.equal(login.code, 200);
  assert.match(login.cookie[0], /Secure/);
  await w.close();
});

test("7. HTTP 登录 cookie 不带 Secure", async (t) => {
  if (!HAS_OPENSSL) return t.skip("无 openssl");
  const dir = newDir();
  const w = await mkServer(dir);
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const creds = { username: "admin", password: "Secret123!", captchaCode: "0000" };
  const H = { "Content-Type": "application/json" };
  assert.equal((await fetch(`${base}/api/register`, { method: "POST", headers: H, body: JSON.stringify(creds) })).status, 200);
  const login = await fetch(`${base}/api/login`, { method: "POST", headers: H, body: JSON.stringify(creds) });
  assert.equal(login.status, 200);
  assert.doesNotMatch(login.headers.get("set-cookie"), /Secure/);
  await w.close();
});

test("8. HTTPS 下 panelPath 前缀生效（无前缀 404）", async (t) => {
  if (!HAS_OPENSSL) return t.skip("无 openssl");
  const dir = newDir();
  const cfg = newCfg(dir);
  const w = await startWeb({ port: 0, httpsPort: 0, tls: true, tlsCertDir: join(dir, "certs"), panelPath: "abc123", services: [], databases: [], configPath: cfg, sslSites: [] }, deps);
  const sp = w.httpsServer.address().port;
  assert.equal((await httpsReq(sp, "/abc123/")).code, 200);
  assert.equal((await httpsReq(sp, "/")).code, 404);
  await w.close();
});

test("9. 已有证书复用，不重复生成", async (t) => {
  if (!HAS_OPENSSL) return t.skip("无 openssl");
  const dir = newDir();
  const w1 = await mkServer(dir);
  await w1.close();
  const certPath = join(dir, "certs", "cert.pem");
  const before = readFileSync(certPath, "utf8");
  const w2 = await mkServer(dir);
  await w2.close();
  assert.equal(readFileSync(certPath, "utf8"), before);
});

test("10. HTTPS 端口被占用时回退仅 HTTP，不崩溃", async (t) => {
  if (!HAS_OPENSSL) return t.skip("无 openssl");
  const blocker = net.createServer();
  await new Promise((r) => blocker.listen(0, "0.0.0.0", r));
  const busy = blocker.address().port;
  const dir = newDir();
  const cfg = newCfg(dir);
  const w = await startWeb({ port: 0, httpsPort: busy, tls: true, tlsCertDir: join(dir, "certs"), services: [], databases: [], configPath: cfg, sslSites: [] }, deps);
  assert.equal(w.httpsServer, null);
  const r = await fetch(`http://127.0.0.1:${w.server.address().port}/`);
  assert.equal(r.status, 200);
  await w.close();
  blocker.close();
});
