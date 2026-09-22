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

function makeServer(extra = {}, extraDeps = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ff-web-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, "{}");
  return startWeb({ port: 0, services: [], databases: [], configPath: cfg, ...extra }, { captchas: testCaptchas, ...extraDeps });
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
  assert.ok(data.status.sys, "overview 应包含 status.sys 字段");
  assert.ok(typeof data.status.sys.os === "string" && data.status.sys.os.length > 0);
  assert.ok(typeof data.status.sys.arch === "string");
  assert.ok(typeof data.status.sys.uptime === "string");
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

test("/api/process 未登录返回 401", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const res = await fetch(`${base}/api/process`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "kill", pid: 1, service: "", password: "x" }),
  });
  assert.equal(res.status, 401);
  w.close();
});

test("/api/process 密码错误返回 403 且不执行命令", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: "", stderr: "" }; } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const res = await fetch(`${base}/api/process`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ action: "kill", pid: 1, service: "", password: "wrong" }),
  });
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.match(data.error, /密码错误/);
  assert.equal(calls.length, 0);
  w.close();
});

test("/api/process 正确密码执行 kill 与 restart", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: "ok", stderr: "" }; } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const kill = await fetch(`${base}/api/process`, {
    method: "POST", headers,
    body: JSON.stringify({ action: "kill", pid: process.pid, service: "", password: "secret123" }),
  });
  assert.equal(kill.status, 200);
  assert.equal((await kill.json()).ok, true);
  assert.equal(calls[0], `kill ${process.pid}`);
  const restart = await fetch(`${base}/api/process`, {
    method: "POST", headers,
    body: JSON.stringify({ action: "restart", pid: 42, service: "nginx.service", password: "secret123" }),
  });
  assert.equal(restart.status, 200);
  assert.equal(calls[1], "systemctl restart nginx.service");
  w.close();
});

test("/api/process 禁止操作系统级与受保护进程", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: "", stderr: "" }; } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const pid1 = await fetch(`${base}/api/process`, {
    method: "POST", headers,
    body: JSON.stringify({ action: "kill", pid: 1, service: "", password: "secret123" }),
  });
  assert.equal(pid1.status, 403);
  const missing = await fetch(`${base}/api/process`, {
    method: "POST", headers,
    body: JSON.stringify({ action: "kill", pid: 999999999, service: "", password: "secret123" }),
  });
  assert.equal(missing.status, 403);
  assert.match((await missing.json()).error, /不存在|不可访问/);
  assert.equal(calls.length, 0);
  w.close();
});

test("/api/process 无效参数返回 400", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: "", stderr: "" }; } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const badPid = await fetch(`${base}/api/process`, {
    method: "POST", headers,
    body: JSON.stringify({ action: "kill", pid: -5, service: "", password: "secret123" }),
  });
  assert.equal(badPid.status, 400);
  const noSvc = await fetch(`${base}/api/process`, {
    method: "POST", headers,
    body: JSON.stringify({ action: "restart", pid: 1, service: "", password: "secret123" }),
  });
  assert.equal(noSvc.status, 400);
  assert.equal(calls.length, 0);
  w.close();
});

test("/api/firewall/close 未登录返回 401", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const res = await fetch(`${base}/api/firewall/close`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ port: 3306, proto: "tcp", mode: "deny", password: "x" }),
  });
  assert.equal(res.status, 401);
  w.close();
});

test("/api/firewall/close 密码错误返回 403 且不执行命令", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: "", stderr: "" }; } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const res = await fetch(`${base}/api/firewall/close`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ port: 3306, proto: "tcp", mode: "deny", password: "wrong" }),
  });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /密码错误/);
  assert.equal(calls.length, 0);
  w.close();
});

test("/api/firewall/close 正确密码执行 deny 与 delete", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: "ok", stderr: "" }; } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const deny = await fetch(`${base}/api/firewall/close`, {
    method: "POST", headers,
    body: JSON.stringify({ port: 3306, proto: "tcp", mode: "deny", password: "secret123" }),
  });
  assert.equal(deny.status, 200);
  assert.equal((await deny.json()).ok, true);
  assert.equal(calls[0], "ufw deny 3306/tcp");
  const del = await fetch(`${base}/api/firewall/close`, {
    method: "POST", headers,
    body: JSON.stringify({ port: 80, proto: "tcp", mode: "delete", password: "secret123" }),
  });
  assert.equal(del.status, 200);
  assert.equal(calls[1], "ufw delete allow 80/tcp");
  w.close();
});

test("/api/firewall/close 无效参数返回 400", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: "", stderr: "" }; } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const badPort = await fetch(`${base}/api/firewall/close`, {
    method: "POST", headers,
    body: JSON.stringify({ port: 70000, proto: "tcp", mode: "deny", password: "secret123" }),
  });
  assert.equal(badPort.status, 400);
  const badMode = await fetch(`${base}/api/firewall/close`, {
    method: "POST", headers,
    body: JSON.stringify({ port: 22, proto: "tcp", mode: "open", password: "secret123" }),
  });
  assert.equal(badMode.status, 400);
  assert.equal(calls.length, 0);
  w.close();
});

test("SSL 接口：增删改查与手动条目保护", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };

  const add = await fetch(`${base}/api/ssl`, { method: "POST", headers: H, body: JSON.stringify({ type: "local", path: "/no/such/cert.pem" }) });
  assert.equal(add.status, 200);
  const { entry } = await add.json();
  assert.ok(entry.id);

  const list = await fetch(`${base}/api/ssl`, { headers: { Cookie: cookie } });
  assert.equal(list.status, 200);
  const data = await list.json();
  assert.ok(data.results.some((r) => r.id === entry.id));
  assert.ok("renewTool" in data);

  const patch = await fetch(`${base}/api/ssl`, { method: "PATCH", headers: H, body: JSON.stringify({ id: entry.id, enabled: false, label: "测试" }) });
  assert.equal(patch.status, 200);

  const del = await fetch(`${base}/api/ssl`, { method: "DELETE", headers: H, body: JSON.stringify({ id: entry.id }) });
  assert.equal(del.status, 200);

  const delDiscovered = await fetch(`${base}/api/ssl`, { method: "DELETE", headers: H, body: JSON.stringify({ id: "d:/etc/nginx/ssl/x.pem" }) });
  assert.equal(delDiscovered.status, 403);

  w.close();
});

test("SSL 续签：密码错误 403，非 local 400", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };

  const add = await fetch(`${base}/api/ssl`, { method: "POST", headers: H, body: JSON.stringify({ type: "local", path: "/etc/nginx/ssl/a.pem" }) });
  const { entry } = await add.json();

  const bad = await fetch(`${base}/api/ssl/renew`, { method: "POST", headers: H, body: JSON.stringify({ id: entry.id, password: "wrong" }) });
  assert.equal(bad.status, 403);

  const remote = await fetch(`${base}/api/ssl`, { method: "POST", headers: H, body: JSON.stringify({ type: "remote", host: "a.com" }) });
  const remoteEntry = (await remote.json()).entry;
  const notLocal = await fetch(`${base}/api/ssl/renew`, { method: "POST", headers: H, body: JSON.stringify({ id: remoteEntry.id, password: "secret123" }) });
  assert.equal(notLocal.status, 400);

  w.close();
});

test("首页包含 SSL 管理所需元素", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const body = await (await fetch(`${base}/`)).text();
  for (const id of ["ssl-add-mask", "ssl-renew-mask", "cfg-ssl-webhook", "cfg-smtp-host"]) {
    assert.match(body, new RegExp(`id="${id}"`), `缺少 ${id}`);
  }
  w.close();
});

test("设置弹窗有 X 关闭按钮且不响应遮罩点击", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const page = await (await fetch(`${base}/`)).text();
  assert.match(page, /id="cfg-close"/);
  const js = await (await fetch(`${base}/app.js`)).text();
  assert.doesNotMatch(js, /settingsMask\.addEventListener\("click"/);
  w.close();
});

test("/api/models 透传前端传入的 baseUrl/apiKey", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const orig = globalThis.fetch;
  let seen = null;
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith("http://127.0.0.1:")) return orig(url, opts);
    seen = { url: String(url), auth: opts?.headers?.Authorization };
    return { ok: true, json: async () => ({ data: [{ id: "m1" }] }) };
  };
  try {
    const res = await orig(`${base}/api/models?baseUrl=${encodeURIComponent("https://x/v1")}&apiKey=secret`, { headers: { Cookie: cookie } });
    const data = await res.json();
    assert.deepEqual(data.models, ["m1"]);
    assert.match(seen.url, /https:\/\/x\/v1\/models/);
    assert.equal(seen.auth, "Bearer secret");
  } finally {
    globalThis.fetch = orig;
    w.close();
  }
});

test("config 接口保存 serviceKeywords 白名单", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-web-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, "{}");
  const w = await makeServer({ configPath: cfg });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const post = await fetch(`${base}/api/config`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ serviceKeywords: ["nginx", " pm2 ", "", "docker"] }),
  });
  assert.equal(post.status, 200);
  const saved = await post.json();
  assert.deepEqual(saved.serviceKeywords, ["nginx", "pm2", "docker"]);
  const file = JSON.parse((await import("node:fs")).readFileSync(cfg, "utf8"));
  assert.deepEqual(file.serviceKeywords, ["nginx", "pm2", "docker"]);
  w.close();
});

test("/api/nginx 接口鉴权与重载", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: "ok", stderr: "" }; } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const noauth = await fetch(`${base}/api/nginx/confs`);
  assert.equal(noauth.status, 401);
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const badSave = await fetch(`${base}/api/nginx/conf`, {
    method: "POST", headers,
    body: JSON.stringify({ path: "/etc/nginx/nginx.conf", content: "x", password: "wrong" }),
  });
  assert.equal(badSave.status, 403);
  const badReload = await fetch(`${base}/api/nginx/reload`, {
    method: "POST", headers,
    body: JSON.stringify({ action: "reload", password: "wrong" }),
  });
  assert.equal(badReload.status, 403);
  assert.equal(calls.length, 0);
  const okReload = await fetch(`${base}/api/nginx/reload`, {
    method: "POST", headers,
    body: JSON.stringify({ action: "restart", password: "secret123" }),
  });
  assert.equal(okReload.status, 200);
  assert.ok(calls.some((c) => c.includes("systemctl restart nginx")));
  w.close();
});

test("/api/nginx/reload 支持 start/stop/restart/reload", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: "", stderr: "" }; } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  for (const action of ["start", "stop", "restart", "reload"]) {
    const res = await fetch(`${base}/api/nginx/reload`, { method: "POST", headers, body: JSON.stringify({ action, password: "secret123" }) });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).ok, true);
  }
  assert.deepEqual(calls, ["systemctl start nginx", "systemctl stop nginx", "systemctl restart nginx", "systemctl reload nginx"]);
  w.close();
});

test("静态文件缺失时服务不崩溃（返回 500 且仍可服务）", async () => {
  const { renameSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const appPath = fileURLToPath(new URL("../src/web/static/app.js", import.meta.url));
  const bak = appPath + ".bak-test";
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  renameSync(appPath, bak);
  try {
    const res = await fetch(`${base}/app.js`);
    assert.equal(res.status, 500);
    const alive = await fetch(`${base}/`);
    assert.equal(alive.status, 200);
  } finally {
    renameSync(bak, appPath);
    w.close();
  }
});
