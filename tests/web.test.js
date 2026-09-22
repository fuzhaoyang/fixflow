import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { startWeb } from "../src/web/server.js";

const testCaptchas = {
  create: () => ({ id: "test-captcha", code: "0000" }),
  verify: (id, code) => String(code) === "0000",
};
const deps = { captchas: testCaptchas };

function makeServer(extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ff-web-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, "{}");
  return startWeb({ port: 0, services: [], databases: [], configPath: cfg, ...extra }, deps);
}

async function registerAndLogin(base) {
  const reg = await fetch(`${base}/api/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "secret123", captchaCode: "0000" }),
  });
  assert.equal(reg.status, 200);
  const login = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "secret123", captchaCode: "0000" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  return cookie;
}

test("首页始终可访问（登录由前端遮罩控制）", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  const body = await page.text();
  assert.match(body, /id="auth-mask"/);
  assert.match(body, /id="auth-captcha-img"/);

  const cookie = await registerAndLogin(base);
  const authed = await fetch(`${base}/`, { headers: { Cookie: cookie } });
  assert.equal(authed.status, 200);
  w.close();
});

test("验证码接口返回 SVG 并设置 cookie", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const res = await fetch(`${base}/api/captcha`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /<svg/);
  w.close();
});

test("未带验证码登录返回 400", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  await registerAndLogin(base);
  const res = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "secret123" }),
  });
  assert.equal(res.status, 400);
  w.close();
});

test("静态页与监控接口登录后返回 200", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const authHeaders = { Cookie: cookie };
  const [page, app, metrics] = await Promise.all([
    fetch(`${base}/`, { headers: authHeaders }),
    fetch(`${base}/app.js`, { headers: authHeaders }),
    fetch(`${base}/api/metrics`, { headers: authHeaders }),
  ]);
  assert.equal(page.status, 200);
  assert.equal(app.status, 200);
  assert.equal(metrics.status, 200);
  const data = await metrics.json();
  assert.ok("system" in data && "docker" in data);
  w.close();
});

test("config 接口：GET 返回脱敏 key，POST 保存并热更新", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-web-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, JSON.stringify({ port: 8888, services: [{ name: "s" }], apiKey: "old" }));
  const w = await startWeb({ port: 0, services: [], databases: [], configPath: cfg, apiKey: "old", baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k2.7-code" }, deps);
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const authHeaders = { Cookie: cookie };
  const get = await fetch(`${base}/api/config`, { headers: authHeaders });
  assert.equal(get.status, 200);
  const cfgGot = await get.json();
  assert.equal(cfgGot.baseUrl, "https://api.moonshot.cn/v1");
  assert.equal(cfgGot.model, "kimi-k2.7-code");

  const post = await fetch(`${base}/api/config`, {
    method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ baseUrl: "https://x/v1", apiKey: "secret123", model: "m1" }),
  });
  assert.equal(post.status, 200);
  const saved = await post.json();
  assert.equal(saved.model, "m1");
  assert.equal(saved.apiKey, "••••t123");

  const file = JSON.parse((await import("node:fs")).readFileSync(cfg, "utf8"));
  assert.equal(file.model, "m1");
  assert.equal(file.port, 8888);
  assert.equal(file.services.length, 1);
  assert.equal(file.apiKey, "secret123");
  w.close();
});

test("历史接口：append/read/clear 持久化到文件", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-web-"));
  const cfg = join(dir, "config.json");
  const hist = join(dir, "history.json");
  writeFileSync(cfg, "{}");
  const w = await startWeb({ port: 0, services: [], databases: [], configPath: cfg, historyPath: hist }, deps);
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const authHeaders = { Cookie: cookie };
  const post = async (body) => fetch(`${base}/api/history`, { method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await post({ messages: [{ role: "user", text: "hi" }] })).status, 200);
  assert.equal((await post({ messages: [{ role: "assistant", text: "ok" }] })).status, 200);
  const got = await (await fetch(`${base}/api/history`, { headers: authHeaders })).json();
  assert.equal(got.messages.length, 2);
  assert.equal(got.messages[1].role, "assistant");
  const clear = await fetch(`${base}/api/history/clear`, { method: "POST", headers: authHeaders });
  assert.equal(clear.status, 200);
  const empty = await (await fetch(`${base}/api/history`, { headers: authHeaders })).json();
  assert.deepEqual(empty.messages, []);
  w.close();
});

test("chat 与 abort 走通会话", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const authHeaders = { Cookie: cookie };
  const r1 = await fetch(`${base}/api/chat`, {
    method: "POST", headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ input: "检查系统" }),
  });
  assert.equal(r1.status, 200);
  const r2 = await fetch(`${base}/api/abort`, { method: "POST", headers: authHeaders });
  assert.equal(r2.status, 200);
  w.close();
});

test("/api/restart 触发重启流程", async () => {
  let restarted = false;
  const w = await makeServer({ restart: () => { restarted = true; return { method: "respawn" }; } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const authHeaders = { Cookie: cookie };
  const res = await fetch(`${base}/api/restart`, { method: "POST", headers: authHeaders });
  assert.equal(res.status, 200);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(restarted, true);
  w.close();
});

test("/api/restart 未登录返回 401", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const res = await fetch(`${base}/api/restart`, { method: "POST" });
  assert.equal(res.status, 401);
  w.close();
});

test("/api/restart 注入 restart 时不调用 process.exit", async () => {
  let exited = false;
  const orig = process.exit;
  process.exit = () => { exited = true; throw new Error("不应退出"); };
  try {
    const w = await makeServer({ restart: () => ({ method: "respawn" }) });
    const base = `http://127.0.0.1:${w.server.address().port}`;
    const cookie = await registerAndLogin(base);
    const res = await fetch(`${base}/api/restart`, { method: "POST", headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(exited, false);
    w.close();
  } finally {
    process.exit = orig;
  }
});

test("/api/report 返回 Markdown 报告", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const authHeaders = { Cookie: cookie };
  const res = await fetch(`${base}/api/report`, { headers: authHeaders });
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /# Fixflow 系统体检报告/);
  w.close();
});

test("未登录访问受保护接口返回 401，登录后可访问", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const anon = await fetch(`${base}/api/metrics`);
  assert.equal(anon.status, 401);
  const status = await (await fetch(`${base}/api/status`)).json();
  assert.equal(status.registered, false);
  assert.equal(status.loggedIn, false);

  const cookie = await registerAndLogin(base);
  const authed = await fetch(`${base}/api/metrics`, { headers: { Cookie: cookie } });
  assert.equal(authed.status, 200);
  const after = await (await fetch(`${base}/api/status`, { headers: { Cookie: cookie } })).json();
  assert.equal(after.loggedIn, true);
  assert.equal(after.username, "admin");
  w.close();
});

test("重复注册返回 409，错误密码返回 401，登出后 401", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);

  const dup = await fetch(`${base}/api/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin2", password: "secret123", captchaCode: "0000" }),
  });
  assert.equal(dup.status, 409);

  const bad = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "wrongpass", captchaCode: "0000" }),
  });
  assert.equal(bad.status, 401);

  await fetch(`${base}/api/logout`, { method: "POST", headers: { Cookie: cookie } });
  const after = await fetch(`${base}/api/metrics`, { headers: { Cookie: cookie } });
  assert.equal(after.status, 401);
  w.close();
});

test("注册密码过短返回 400", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const res = await fetch(`${base}/api/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "123", captchaCode: "0000" }),
  });
  assert.equal(res.status, 400);
  w.close();
});

test("overview 接口返回状态与流量/IO 采样结构", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  await new Promise((r) => setTimeout(r, 2100));
  const res = await fetch(`${base}/api/overview`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.nics));
  assert.equal(typeof data.status.load.pct, "number");
  assert.equal(typeof data.status.cpu.pct, "number");
  assert.equal(typeof data.status.mem.pct, "number");
  assert.equal(typeof data.status.disk.pct, "number");
  assert.ok(Array.isArray(data.net));
  assert.ok(Array.isArray(data.io));
  w.close();
});

test("overview 接口未登录返回 401", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const res = await fetch(`${base}/api/overview`);
  assert.equal(res.status, 401);
  w.close();
});

test("echarts.min.js 静态资源可访问", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const res = await fetch(`${base}/echarts.min.js`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /echarts/i);
  w.close();
});
