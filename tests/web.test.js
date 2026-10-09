import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import https from "node:https";
import { spawnSync } from "node:child_process";
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
  return startWeb({ port: 0, services: [], databases: [], configPath: cfg, termHistoryPath: join(dir, "term-history.json"), ...extra }, { captchas: testCaptchas, ...extraDeps });
}

async function registerAndLogin(base) {
  const reg = await fetch(`${base}/api/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "Secret123!", captchaCode: "0000" }),
  });
  assert.equal(reg.status, 200);
  const login = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "Secret123!", captchaCode: "0000" }),
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
    body: JSON.stringify({ username: "admin", password: "Secret123!" }),
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
    body: JSON.stringify({ username: "admin2", password: "Secret123!", captchaCode: "0000" }),
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

test("登录失败多次触发限流返回 429", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  await registerAndLogin(base);
  const tryLogin = (password) => fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password, captchaCode: "0000" }),
  });
  for (let i = 0; i < 5; i++) assert.equal((await tryLogin("wrongpass")).status, 401);
  assert.equal((await tryLogin("Secret123!")).status, 429);
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

test("自绘图表：页面不再加载 echarts", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const html = await (await fetch(`${base}/`)).text();
  assert.doesNotMatch(html, /echarts/);
  const css = await (await fetch(`${base}/app.css`)).text();
  assert.match(css, /conic-gradient/);
  const app = await (await fetch(`${base}/app.js`)).text();
  assert.match(app, /drawLineChart/);
  assert.doesNotMatch(app, /echarts\.init/);
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
  const w = await makeServer({}, { runCommand: async (cmd) => { calls.push(cmd); return { exitCode: 1, stdout: "", stderr: "" }; } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const res = await fetch(`${base}/api/firewall/close`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ port: 3306, proto: "tcp", mode: "deny", password: "wrong" }),
  });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /密码错误/);
  assert.ok(!calls.some((c) => c.includes("ufw")));
  w.close();
});

test("/api/firewall/close 正确密码执行 deny 与 delete", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("sudo -S -p '' true")) return { exitCode: 0, stdout: "", stderr: "" };
    return { exitCode: 0, stdout: "ok", stderr: "" };
  } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const deny = await fetch(`${base}/api/firewall/close`, {
    method: "POST", headers,
    body: JSON.stringify({ port: 3306, proto: "tcp", mode: "deny", password: "Secret123!" }),
  });
  assert.equal(deny.status, 200);
  assert.equal((await deny.json()).ok, true);
  assert.ok(calls.some((c) => c.includes("ufw deny 3306/tcp")));
  const del = await fetch(`${base}/api/firewall/close`, {
    method: "POST", headers,
    body: JSON.stringify({ port: 80, proto: "tcp", mode: "delete", password: "Secret123!" }),
  });
  assert.equal(del.status, 200);
  assert.ok(calls.some((c) => c.includes("ufw delete allow 80/tcp")));
  w.close();
});

test("/api/firewall/close 无效参数返回 400", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("sudo -S -p '' true")) return { exitCode: 0, stdout: "", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "" };
  } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const badPort = await fetch(`${base}/api/firewall/close`, {
    method: "POST", headers,
    body: JSON.stringify({ port: 70000, proto: "tcp", mode: "deny", password: "Secret123!" }),
  });
  assert.equal(badPort.status, 400);
  const badMode = await fetch(`${base}/api/firewall/close`, {
    method: "POST", headers,
    body: JSON.stringify({ port: 22, proto: "tcp", mode: "open", password: "Secret123!" }),
  });
  assert.equal(badMode.status, 400);
  assert.ok(!calls.some((c) => c.includes("ufw")));
  w.close();
});

test("/api/firewall/open 密码错误返回 403", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => { calls.push(cmd); return { exitCode: 1, stdout: "", stderr: "" }; } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const res = await fetch(`${base}/api/firewall/open`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ port: "8080", proto: "tcp", password: "wrong" }),
  });
  assert.equal(res.status, 403);
  assert.ok(!calls.some((c) => c.includes("ufw")));
  w.close();
});

test("/api/firewall/open 正确密码执行 ufw allow，支持逗号分隔", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("sudo -S -p '' true")) return { exitCode: 0, stdout: "", stderr: "" };
    return { exitCode: 0, stdout: "Rule added", stderr: "" };
  } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const one = await fetch(`${base}/api/firewall/open`, {
    method: "POST", headers,
    body: JSON.stringify({ port: "8080", proto: "tcp", password: "Secret123!" }),
  });
  assert.equal(one.status, 200);
  assert.ok(calls.some((c) => c.includes("ufw allow 8080/tcp")));
  const multi = await fetch(`${base}/api/firewall/open`, {
    method: "POST", headers,
    body: JSON.stringify({ port: "80,443", proto: "udp", password: "Secret123!" }),
  });
  assert.equal(multi.status, 200);
  assert.ok(calls.some((c) => c.includes("ufw allow 80,443/udp")));
  w.close();
});

test("/api/firewall/open 无效端口/协议返回 400", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("sudo -S -p '' true")) return { exitCode: 0, stdout: "", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "" };
  } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const badPort = await fetch(`${base}/api/firewall/open`, {
    method: "POST", headers,
    body: JSON.stringify({ port: "70000", proto: "tcp", password: "Secret123!" }),
  });
  assert.equal(badPort.status, 400);
  const badProto = await fetch(`${base}/api/firewall/open`, {
    method: "POST", headers,
    body: JSON.stringify({ port: "22", proto: "icmp", password: "Secret123!" }),
  });
  assert.equal(badProto.status, 400);
  assert.ok(!calls.some((c) => c.includes("ufw")));
  w.close();
});

test("/api/firewall/open firewalld 后端走 firewall-cmd", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("sudo -S -p '' true")) return { exitCode: 0, stdout: "", stderr: "" };
    if (cmd.includes("firewall-cmd --state")) return { exitCode: 0, stdout: "running\n", stderr: "" };
    if (cmd.includes("--get-active-zones")) return { exitCode: 0, stdout: "public\n  interfaces: eth0\n", stderr: "" };
    if (cmd.includes("firewall-cmd --reload")) return { exitCode: 0, stdout: "success", stderr: "" };
    if (cmd.includes("firewall-cmd --zone")) return { exitCode: 0, stdout: "success", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "" };
  } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const r = await fetch(`${base}/api/firewall/open`, {
    method: "POST", headers,
    body: JSON.stringify({ port: "8080", proto: "tcp", password: "Secret123!" }),
  });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.ok, true);
  assert.ok(calls.some((c) => c.includes("firewall-cmd --zone=public --add-port=8080/tcp --permanent")));
  assert.ok(calls.some((c) => c.includes("firewall-cmd --reload")));
  w.close();
});

test("/api/firewall/close firewalld 后端 deny 走 rich-rule", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("sudo -S -p '' true")) return { exitCode: 0, stdout: "", stderr: "" };
    if (cmd.includes("firewall-cmd --state")) return { exitCode: 0, stdout: "running\n", stderr: "" };
    if (cmd.includes("--get-active-zones")) return { exitCode: 0, stdout: "public\n", stderr: "" };
    if (cmd.includes("firewall-cmd --reload")) return { exitCode: 0, stdout: "success", stderr: "" };
    if (cmd.includes("firewall-cmd --zone")) return { exitCode: 0, stdout: "success", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "" };
  } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const r = await fetch(`${base}/api/firewall/close`, {
    method: "POST", headers,
    body: JSON.stringify({ port: 3306, proto: "tcp", mode: "deny", password: "Secret123!" }),
  });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.ok, true);
  assert.ok(calls.some((c) => c.includes("--add-rich-rule='rule family=ipv4 port port=") && c.includes("3306") && c.includes("protocol=tcp reject'") && c.includes("--permanent")));
  w.close();
});

test("/api/firewall/control firewalld 后端走 systemctl", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("sudo -S -p '' true")) return { exitCode: 0, stdout: "", stderr: "" };
    if (cmd.includes("firewall-cmd --state")) return { exitCode: 0, stdout: "running\n", stderr: "" };
    if (cmd.includes("ufw status")) return { exitCode: 0, stdout: "Status: active\n", stderr: "" };
    return { exitCode: 0, stdout: "ok", stderr: "" };
  } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const r = await fetch(`${base}/api/firewall/control`, {
    method: "POST", headers,
    body: JSON.stringify({ action: "disable", password: "Secret123!" }),
  });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.ok, true);
  assert.ok(calls.some((c) => c.includes("systemctl stop firewalld")));
  w.close();
});

test("/api/firewall/open 支持来源 IP 与无效来源校验", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("sudo -S -p '' true")) return { exitCode: 0, stdout: "", stderr: "" };
    return { exitCode: 0, stdout: "Rule added", stderr: "" };
  } });
  const base = `http://127.0.0.1:${w.server.address().port}`;  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const withFrom = await fetch(`${base}/api/firewall/open`, {
    method: "POST", headers,
    body: JSON.stringify({ port: "22", proto: "tcp", from: "192.168.1.0/24", password: "Secret123!" }),
  });
  assert.equal(withFrom.status, 200);
  assert.ok(calls.some((c) => c.includes("ufw allow from 192.168.1.0/24 to any port 22 proto tcp")));
  const badFrom = await fetch(`${base}/api/firewall/open`, {
    method: "POST", headers,
    body: JSON.stringify({ port: "22", proto: "tcp", from: "not-an-ip", password: "Secret123!" }),
  });
  assert.equal(badFrom.status, 400);
  assert.ok(!calls.some((c) => c.includes("allow from not-an-ip")));
  w.close();
});

test("/api/firewall/control enable/disable 提权执行", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("sudo -S -p '' true")) return { exitCode: 0, stdout: "", stderr: "" };
    return { exitCode: 0, stdout: "ok", stderr: "" };
  } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const en = await fetch(`${base}/api/firewall/control`, {
    method: "POST", headers,
    body: JSON.stringify({ action: "enable", password: "Secret123!" }),
  });
  assert.equal(en.status, 200);
  assert.ok(calls.some((c) => c.includes("ufw enable")));
  const bad = await fetch(`${base}/api/firewall/control`, {
    method: "POST", headers,
    body: JSON.stringify({ action: "reboot", password: "Secret123!" }),
  });
  assert.equal(bad.status, 400);
  w.close();
});

test("/api/firewall/ops 返回操作记录且成功操作写入审计", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("sudo -S -p '' true")) return { exitCode: 0, stdout: "", stderr: "" };
    return { exitCode: 0, stdout: "ok", stderr: "" };
  } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  await fetch(`${base}/api/firewall/open`, {
    method: "POST", headers,
    body: JSON.stringify({ port: "8080", proto: "tcp", password: "Secret123!" }),
  });
  const ops = await (await fetch(`${base}/api/firewall/ops`, { headers: { Cookie: cookie } })).json();
  assert.ok(Array.isArray(ops.ops));
  assert.ok(ops.ops.some((o) => o.op === "open" && o.target.includes("8080")));
  w.close();
});

function aclMockRun(calls, numbered = "Status: active\n\nTo                         Action      From\n--                         ------      ----\n[ 1] 0/tcp                 ALLOW IN    Anywhere\n") {
  return async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("sudo -S -p '' true")) return { exitCode: 0, stdout: "", stderr: "" };
    if (cmd.includes("ufw status numbered")) return { exitCode: 0, stdout: numbered, stderr: "" };
    if (cmd.includes("ufw status 2>/dev/null")) return { exitCode: 0, stdout: "Status: active\n", stderr: "" };
    if (cmd.includes("firewall-cmd --state")) return { exitCode: 1, stdout: "", stderr: "" };
    return { exitCode: 0, stdout: "ok", stderr: "" };
  };
}

test("/api/acl/list 未登录返回 401", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const res = await fetch(`${base}/api/acl/list`);
  assert.equal(res.status, 401);
  w.close();
});

test("/api/acl/add 密码错误返回 403 且不执行 ufw", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => { calls.push(cmd); return { exitCode: 1, stdout: "", stderr: "" }; } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const res = await fetch(`${base}/api/acl/add`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ list: "black", ip: "9.9.9.9", password: "wrong" }),
  });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /密码错误/);
  assert.ok(!calls.some((c) => c.includes("ufw insert")));
  w.close();
});

test("/api/acl/add 无效名单类型/IP 返回 400", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: aclMockRun(calls) });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const badList = await fetch(`${base}/api/acl/add`, {
    method: "POST", headers,
    body: JSON.stringify({ list: "gray", ip: "9.9.9.9", password: "Secret123!" }),
  });
  assert.equal(badList.status, 400);
  const badIp = await fetch(`${base}/api/acl/add`, {
    method: "POST", headers,
    body: JSON.stringify({ list: "black", ip: "not-an-ip", password: "Secret123!" }),
  });
  assert.equal(badIp.status, 400);
  assert.ok(!calls.some((c) => c.includes("ufw insert")));
  w.close();
});

test("/api/acl/add 正确添加黑名单、同步 ufw 并持久化", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: aclMockRun(calls) });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const res = await fetch(`${base}/api/acl/add`, {
    method: "POST", headers,
    body: JSON.stringify({ list: "black", ip: "9.9.9.9", comment: "hacker", password: "Secret123!" }),
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  assert.ok(calls.some((c) => c.includes("ufw delete 1")));
  assert.ok(calls.some((c) => c.includes("ufw insert 1 deny from 9.9.9.9 to any port 0 proto tcp")));
  const list = await (await fetch(`${base}/api/acl/list`, { headers: { Cookie: cookie } })).json();
  assert.equal(list.blacklist.length, 1);
  assert.equal(list.blacklist[0].ip, "9.9.9.9");
  assert.equal(list.blacklist[0].comment, "hacker");
  assert.equal(list.whitelist.length, 0);
  assert.equal(list.backend, "ufw");
  const dup = await fetch(`${base}/api/acl/add`, {
    method: "POST", headers,
    body: JSON.stringify({ list: "black", ip: "9.9.9.9", password: "Secret123!" }),
  });
  assert.equal(dup.status, 400);
  w.close();
});

test("/api/acl/add 白名单可添加（本机访问不受锁死护栏限制）", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: aclMockRun(calls) });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const res = await fetch(`${base}/api/acl/add`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ list: "white", ip: "1.2.3.4", password: "Secret123!" }),
  });
  assert.equal(res.status, 200);
  assert.ok(calls.some((c) => c.includes("ufw insert 1 deny 0/tcp")));
  assert.ok(calls.some((c) => c.includes("ufw insert 1 allow from 1.2.3.4 to any port 0 proto tcp")));
  const list = await (await fetch(`${base}/api/acl/list`, { headers: { Cookie: cookie } })).json();
  assert.equal(list.whitelist.length, 1);
  w.close();
});

test("/api/acl/remove 移除并重建规则", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: aclMockRun(calls) });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  await fetch(`${base}/api/acl/add`, {
    method: "POST", headers,
    body: JSON.stringify({ list: "black", ip: "9.9.9.9", password: "Secret123!" }),
  });
  calls.length = 0;
  const res = await fetch(`${base}/api/acl/remove`, {
    method: "POST", headers,
    body: JSON.stringify({ list: "black", ip: "9.9.9.9", password: "Secret123!" }),
  });
  assert.equal(res.status, 200);
  assert.ok(calls.some((c) => c.includes("ufw insert 1 allow 0/tcp")));
  const list = await (await fetch(`${base}/api/acl/list`, { headers: { Cookie: cookie } })).json();
  assert.equal(list.blacklist.length, 0);
  const miss = await fetch(`${base}/api/acl/remove`, {
    method: "POST", headers,
    body: JSON.stringify({ list: "black", ip: "8.8.8.8", password: "Secret123!" }),
  });
  assert.equal(miss.status, 400);
  w.close();
});

test("/api/docker/op 未登录返回 401", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const res = await fetch(`${base}/api/docker/op`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "web", action: "stop", password: "x" }),
  });
  assert.equal(res.status, 401);
  w.close();
});

test("/api/docker/op 密码错误返回 403 且不执行命令", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => { calls.push(cmd); return { exitCode: 1, stdout: "", stderr: "" }; } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const res = await fetch(`${base}/api/docker/op`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: "web", action: "stop", password: "wrong" }),
  });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /密码错误/);
  assert.ok(!calls.some((c) => c.includes("docker stop")));
  w.close();
});

test("/api/docker/op 正确密码执行 docker 命令", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("sudo -S -p '' true")) return { exitCode: 0, stdout: "", stderr: "" };
    return { exitCode: 0, stdout: "ok", stderr: "" };
  } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const stop = await fetch(`${base}/api/docker/op`, {
    method: "POST", headers,
    body: JSON.stringify({ name: "web", action: "stop", password: "Secret123!" }),
  });
  assert.equal(stop.status, 200);
  assert.equal((await stop.json()).ok, true);
  assert.ok(calls.some((c) => c.includes("docker stop web")));
  const rm = await fetch(`${base}/api/docker/op`, {
    method: "POST", headers,
    body: JSON.stringify({ name: "web", action: "rm", password: "Secret123!" }),
  });
  assert.equal(rm.status, 200);
  assert.ok(calls.some((c) => c.includes("docker rm -f web")));
  w.close();
});

test("/api/docker/op 无效参数返回 400", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("sudo -S -p '' true")) return { exitCode: 0, stdout: "", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "" };
  } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const bad = await fetch(`${base}/api/docker/op`, {
    method: "POST", headers,
    body: JSON.stringify({ name: "web", action: "kill", password: "Secret123!" }),
  });
  assert.equal(bad.status, 400);
  assert.ok(!calls.some((c) => c.includes("docker")));
  w.close();
});

test("/api/docker/prune 密码错误 403 / 正确执行清理", async () => {
  const calls = [];
  const mock = (failSudo = false) => async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("sudo -S -p '' true")) return { exitCode: failSudo ? 1 : 0, stdout: "", stderr: "" };
    return { exitCode: 0, stdout: "Deleted sha256:abc", stderr: "" };
  };
  const w1 = await makeServer({}, { runCommand: mock(true) });
  const base1 = `http://127.0.0.1:${w1.server.address().port}`;
  const cookie1 = await registerAndLogin(base1);
  const bad = await fetch(`${base1}/api/docker/prune`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie1 },
    body: JSON.stringify({ password: "wrong" }),
  });
  assert.equal(bad.status, 403);
  w1.close();
  const w = await makeServer({}, { runCommand: mock(false) });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const ok = await fetch(`${base}/api/docker/prune`, {
    method: "POST", headers,
    body: JSON.stringify({ password: "Secret123!" }),
  });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).ok, true);
  assert.ok(calls.some((c) => c.includes("docker image prune -f")));
  w.close();
});

test("/api/docker/stats 返回解析后的资源行", async () => {
  const w = await makeServer({}, { runCommand: async (cmd) => cmd.includes("docker stats")
    ? { exitCode: 0, stdout: "NAME\tCPU %\tMEM USAGE / LIMIT\nweb\t0.10%\t12.3MiB / 1GiB\n", stderr: "" }
    : { exitCode: 0, stdout: "", stderr: "" } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const data = await (await fetch(`${base}/api/docker/stats`, { headers: { Cookie: cookie } })).json();
  assert.ok(Array.isArray(data.rows));
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].name, "web");
  assert.match(data.rows[0].mem, /12\.3MiB \/ 1GiB/);
  w.close();
});

test("/api/docker/inspect 返回容器详情（不含环境变量）", async () => {
  const w = await makeServer({}, { runCommand: async (cmd) => cmd.includes("docker inspect")
    ? { exitCode: 0, stdout: JSON.stringify([{ Name: "/web", Config: { Image: "nginx:latest", Env: ["SECRET=abc123"] }, State: { Running: true }, RestartCount: 2, NetworkSettings: { Networks: { bridge: { IPAddress: "172.17.0.2" } } }, Mounts: [{ Source: "/data", Destination: "/var/data" }] }]), stderr: "" }
    : { exitCode: 0, stdout: "", stderr: "" } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const data = await (await fetch(`${base}/api/docker/inspect?name=web`, { headers: { Cookie: cookie } })).json();
  assert.equal(data.ok, true);
  assert.equal(data.detail.name, "web");
  assert.equal(data.detail.running, true);
  assert.equal(data.detail.restarts, 2);
  assert.equal(data.detail.ip, "172.17.0.2");
  assert.equal(data.detail.mounts[0], "/data → /var/data");
  assert.ok(!JSON.stringify(data).includes("SECRET"));
  w.close();
});

test("/api/logs/sources 返回 systemd 与 docker 列表", async () => {
  const w = await makeServer({}, { runCommand: async (cmd) => cmd.startsWith("systemctl")
    ? { exitCode: 0, stdout: "nginx.service active\n", stderr: "" }
    : { exitCode: 0, stdout: "web | Up\n", stderr: "" } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const data = await (await fetch(`${base}/api/logs/sources`, { headers: { Cookie: cookie } })).json();
  assert.ok(Array.isArray(data.systemd));
  assert.ok(data.systemd.some((s) => s.name === "nginx"));
  assert.ok(data.docker.some((c) => c.name === "web"));
  w.close();
});

test("/api/logs 拉取 service 日志（journalctl）", async () => {
  const calls = [];
  const w = await makeServer({}, { runCommand: async (cmd) => {
    calls.push(cmd);
    return { exitCode: 0, stdout: "log line\n", stderr: "" };
  } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const headers = { "Content-Type": "application/json", Cookie: cookie };
  const r = await fetch(`${base}/api/logs`, { method: "POST", headers, body: JSON.stringify({ service: "nginx", lines: 50 }) });
  const data = await r.json();
  assert.equal(r.status, 200);
  assert.equal(data.content, "log line\n");
  assert.ok(calls.some((c) => c.includes("journalctl -u nginx.service -n 50")));
  w.close();
});

test("/api/logs 缺参返回 400", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const r = await fetch(`${base}/api/logs`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({}) });
  assert.equal(r.status, 400);
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
  const notLocal = await fetch(`${base}/api/ssl/renew`, { method: "POST", headers: H, body: JSON.stringify({ id: remoteEntry.id, password: "Secret123!" }) });
  assert.equal(notLocal.status, 400);

  w.close();
});

test("首页包含 SSL 管理所需元素", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const body = await (await fetch(`${base}/`)).text();
  for (const id of ["ssl-add-mask", "ssl-renew-mask"]) {
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
    body: JSON.stringify({ action: "restart", password: "Secret123!" }),
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
    const res = await fetch(`${base}/api/nginx/reload`, { method: "POST", headers, body: JSON.stringify({ action, password: "Secret123!" }) });
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

test("/api/usage 未登录返回 401，登录后返回 days 数组", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const noauth = await fetch(`${base}/api/usage`);
  assert.equal(noauth.status, 401);
  const cookie = await registerAndLogin(base);
  const res = await fetch(`${base}/api/usage?days=7`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.days));
  assert.equal(data.days.length, 7);
  assert.ok("total" in data.days[0]);
  w.close();
});

test("/api/overview 返回 usage 数组", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const res = await fetch(`${base}/api/overview`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.usage));
  w.close();
});

test("首页包含 Token 用量 tab 与容器", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const body = await (await fetch(`${base}/`)).text();
  for (const id of ["tab-token", "token-chart", "token-kpi", "token-today", "token-total30", "token-unit-select"]) {
    assert.match(body, new RegExp(`id="${id}"`), `缺少 ${id}`);
  }
  w.close();
});

test("/api/term 鉴权与 TTY 会话生命周期", async () => {
  const writes = [];
  let spawned = 0;
  const shell = new EventEmitter();
  shell.stdin = { write: (d) => { writes.push(d); return true; } };
  shell.stdout = new EventEmitter();
  shell.stderr = new EventEmitter();
  shell.exitCode = null;
  shell.killed = false;
  shell.kill = () => { shell.killed = true; shell.exitCode = 0; };
  const w = await makeServer({}, { spawnShell: () => { spawned++; return shell; } });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const noauth = await fetch(`${base}/api/term/input`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: "x" }),
  });
  assert.equal(noauth.status, 401);
  assert.equal(spawned, 0);
  const cookie = await registerAndLogin(base);
  await fetch(`${base}/api/term/open`, { method: "POST", headers: { Cookie: cookie } });
  assert.equal(spawned, 1);
  const input = await fetch(`${base}/api/term/input`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ data: "ls\r" }),
  });
  assert.equal(input.status, 200);
  assert.deepEqual(writes, ["ls\r"]);
  const close = await fetch(`${base}/api/term/close`, { method: "POST", headers: { Cookie: cookie } });
  assert.equal(close.status, 200);
  assert.equal(shell.killed, true);
  w.close();
});

test("/api/term 会话恢复与操作记录", async () => {
  const shell = new EventEmitter();
  shell.stdin = { write: () => true };
  shell.stdout = new EventEmitter();
  shell.stderr = new EventEmitter();
  shell.exitCode = null;
  shell.killed = false;
  shell.kill = () => { shell.killed = true; shell.exitCode = 0; };
  const w = await makeServer({}, { spawnShell: () => shell });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  await fetch(`${base}/api/term/open`, { method: "POST", headers: { Cookie: cookie } });
  shell.stdout.emit("data", "prompt$ ");
  const open2 = await fetch(`${base}/api/term/open`, { method: "POST", headers: { Cookie: cookie } });
  assert.equal((await open2.json()).history, "prompt$ ");
  const noauth = await fetch(`${base}/api/term/history`);
  assert.equal(noauth.status, 401);
  const post = await fetch(`${base}/api/term/history`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ command: "ls -la" }),
  });
  assert.equal(post.status, 200);
  const get = await fetch(`${base}/api/term/history`, { headers: { Cookie: cookie } });
  const data = await get.json();
  assert.equal(data.records.length, 1);
  assert.equal(data.records[0].command, "ls -la");
  assert.equal(data.records[0].user, "admin");
  w.close();
});

test("/api/fs 浏览与路径校验", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-fs-"));
  writeFileSync(join(dir, "a.txt"), "hello");
  mkdirSync(join(dir, "sub"));
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const H = { Cookie: cookie };
  const list = await fetch(`${base}/api/fs/list?path=${encodeURIComponent(dir)}`, { headers: H });
  assert.equal(list.status, 200);
  const data = await list.json();
  const names = data.children.map((c) => c.name);
  assert.ok(names.includes("a.txt") && names.includes("sub"));
  const file = data.children.find((c) => c.name === "a.txt");
  assert.equal(file.isDir, false);
  assert.equal(file.size, 5);
  assert.ok(file.mode.startsWith("-"));
  assert.ok(file.user);
  const bad = await fetch(`${base}/api/fs/list?path=${encodeURIComponent("/no/such/dir-xyz")}`, { headers: H });
  assert.equal(bad.status, 400);
  const noauth = await fetch(`${base}/api/fs/list?path=/`);
  assert.equal(noauth.status, 401);
  w.close();
});

test("/api/fs 写操作鉴权与执行", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-fs-"));
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  const noauth = await fetch(`${base}/api/fs/mkdir`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: dir, name: "x" }) });
  assert.equal(noauth.status, 401);
  const badPw = await fetch(`${base}/api/fs/mkdir`, { method: "POST", headers: H, body: JSON.stringify({ path: dir, name: "x", password: "wrong" }) });
  assert.equal(badPw.status, 403);
  assert.ok(!existsSync(join(dir, "x")));
  const mk = await fetch(`${base}/api/fs/mkdir`, { method: "POST", headers: H, body: JSON.stringify({ path: dir, name: "sub", password: "Secret123!" }) });
  assert.equal(mk.status, 200);
  assert.ok(existsSync(join(dir, "sub")));
  const wr = await fetch(`${base}/api/fs/write`, { method: "POST", headers: H, body: JSON.stringify({ path: join(dir, "a.txt"), content: "hi", password: "Secret123!" }) });
  assert.equal(wr.status, 200);
  assert.equal(readFileSync(join(dir, "a.txt"), "utf8"), "hi");
  const rd = await fetch(`${base}/api/fs/read`, { method: "POST", headers: H, body: JSON.stringify({ path: join(dir, "a.txt") }) });
  assert.equal((await rd.json()).content, "hi");
  const rn = await fetch(`${base}/api/fs/rename`, { method: "POST", headers: H, body: JSON.stringify({ path: join(dir, "a.txt"), newName: "b.txt", password: "Secret123!" }) });
  assert.equal(rn.status, 200);
  assert.ok(existsSync(join(dir, "b.txt")));
  const del = await fetch(`${base}/api/fs/delete`, { method: "POST", headers: H, body: JSON.stringify({ path: join(dir, "sub"), password: "Secret123!" }) });
  assert.equal(del.status, 200);
  assert.ok(!existsSync(join(dir, "sub")));
  w.close();
});

test("/api/fs/upload multipart 上传", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-fs-"));
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const boundary = "----TestBoundary123";
  const body = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="path"\r\n\r\n${dir}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="password"\r\n\r\nSecret123!\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="up.txt"\r\nContent-Type: text/plain\r\n\r\nhello-up\r\n` +
    `--${boundary}--\r\n`,
  );
  const res = await fetch(`${base}/api/fs/upload`, { method: "POST", headers: { Cookie: cookie, "Content-Type": `multipart/form-data; boundary=${boundary}` }, body });
  assert.equal(res.status, 200);
  assert.equal(readFileSync(join(dir, "up.txt"), "utf8"), "hello-up");
  w.close();
});

test("config 接口 lang 持久化", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-web-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, "{}");
  const w = await startWeb({ port: 0, services: [], databases: [], configPath: cfg, sslSites: [] }, deps);
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  const get = await fetch(`${base}/api/config`, { headers: { Cookie: cookie } });
  assert.equal((await get.json()).lang, "zh");
  const post = await fetch(`${base}/api/config`, { method: "POST", headers: H, body: JSON.stringify({ lang: "en" }) });
  assert.equal((await post.json()).lang, "en");
  assert.equal(JSON.parse(readFileSync(cfg, "utf8")).lang, "en");
  w.close();
});

test("config 接口 theme 持久化", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-web-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, "{}");
  const w = await startWeb({ port: 0, services: [], databases: [], configPath: cfg, sslSites: [] }, deps);
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  const get = await fetch(`${base}/api/config`, { headers: { Cookie: cookie } });
  assert.equal((await get.json()).theme, "dark");
  const post = await fetch(`${base}/api/config`, { method: "POST", headers: H, body: JSON.stringify({ theme: "light" }) });
  assert.equal((await post.json()).theme, "light");
  assert.equal(JSON.parse(readFileSync(cfg, "utf8")).theme, "light");
  const bad = await fetch(`${base}/api/config`, { method: "POST", headers: H, body: JSON.stringify({ theme: "rainbow" }) });
  assert.equal((await bad.json()).theme, "light");
  w.close();
});

test("HTTPS：自签证书启动，TLS 登录 cookie 带 Secure", async (t) => {
  if (spawnSync("openssl", ["version"]).status !== 0) return t.skip("系统无 openssl");
  const dir = mkdtempSync(join(tmpdir(), "ff-tls-"));
  const w = await makeServer({ tls: true, httpsPort: 0, tlsCertDir: join(dir, "certs") });
  assert.ok(w.httpsServer, "应启动 HTTPS 服务");
  const port = w.httpsServer.address().port;
  const req = (path, body) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = https.request({ host: "127.0.0.1", port, path, method: body ? "POST" : "GET", rejectUnauthorized: false, headers: data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {} }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ code: res.statusCode, cookie: res.headers["set-cookie"], body: b }));
    });
    r.on("error", reject); if (data) r.write(data); r.end();
  });
  const status = await req("/api/status");
  assert.equal(status.code, 200);
  assert.equal((await req("/api/register", { username: "admin", password: "Secret123!", captchaCode: "0000" })).code, 200);
  const login = await req("/api/login", { username: "admin", password: "Secret123!", captchaCode: "0000" });
  assert.equal(login.code, 200);
  assert.match(login.cookie[0], /Secure/);
  // 同一实例的 HTTP 明文登录 cookie 不带 Secure
  const httpBase = `http://127.0.0.1:${w.server.address().port}`;
  const httpLogin = await fetch(`${httpBase}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "Secret123!", captchaCode: "0000" }) });
  assert.equal(httpLogin.status, 200);
  assert.doesNotMatch(httpLogin.headers.get("set-cookie"), /Secure/);
  await w.close();
});

test("/api/alerts 增删改查与鉴权", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  assert.equal((await fetch(`${base}/api/alerts`)).status, 401);
  const cookie = await registerAndLogin(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  const add = await fetch(`${base}/api/alerts`, { method: "POST", headers: H, body: JSON.stringify({ name: "日报", instruction: "生成日报", time: "09:00", recipients: ["a@x.com"] }) });
  assert.equal(add.status, 200);
  const { alert } = await add.json();
  const bad = await fetch(`${base}/api/alerts`, { method: "POST", headers: H, body: JSON.stringify({ name: "", instruction: "", time: "", recipients: [] }) });
  assert.equal(bad.status, 400);
  const patch = await fetch(`${base}/api/alerts`, { method: "PATCH", headers: H, body: JSON.stringify({ id: alert.id, enabled: false }) });
  assert.equal(patch.status, 200);
  const list = await (await fetch(`${base}/api/alerts`, { headers: { Cookie: cookie } })).json();
  assert.equal(list.alerts[0].enabled, false);
  assert.equal(list.smtp.hasPass, false);
  const del = await fetch(`${base}/api/alerts`, { method: "DELETE", headers: H, body: JSON.stringify({ id: alert.id }) });
  assert.equal(del.status, 200);
  const run = await fetch(`${base}/api/alerts/run`, { method: "POST", headers: H, body: JSON.stringify({ id: "none" }) });
  assert.equal(run.status, 400);
  w.close();
});

test("/api/alerts/run 手动执行成功（mock 会话与 sendmail）", async () => {
  const calls = [];
  const w = await makeServer({}, {
    sessionFactory: () => ({ send: async () => "模拟日报" }),
    runCommand: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: cmd.includes("command -v sendmail") ? "/usr/sbin/sendmail\n" : "ok", stderr: "" }; },
  });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  const { alert } = await (await fetch(`${base}/api/alerts`, { method: "POST", headers: H, body: JSON.stringify({ name: "日报", instruction: "x", time: "09:00", recipients: ["a@x.com"] }) })).json();
  const r = await (await fetch(`${base}/api/alerts/run`, { method: "POST", headers: H, body: JSON.stringify({ id: alert.id }) })).json();
  assert.equal(r.ok, true);
  assert.ok(calls.some((c) => c.includes("sendmail")));
  w.close();
});

test("首页包含告警铃铛与弹窗元素", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const body = await (await fetch(`${base}/`)).text();
  for (const id of ["bell-btn", "alert-mask", "alert-list", "alert-form", "alert-hist", "alert-tabs", "alert-list-pager", "alert-hist-pager"]) assert.match(body, new RegExp(`id="${id}"`), `缺少 ${id}`);
  w.close();
});

test("/api/metric-alerts 增删改查与鉴权", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  assert.equal((await fetch(`${base}/api/metric-alerts`)).status, 401);
  const cookie = await registerAndLogin(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  const add = await fetch(`${base}/api/metric-alerts`, { method: "POST", headers: H, body: JSON.stringify({ name: "CPU", metric: "cpu", op: ">=", threshold: 80, duration: 5, level: 1, recipients: ["a@x.com"] }) });
  assert.equal(add.status, 200);
  const { rule } = await add.json();
  const bad = await fetch(`${base}/api/metric-alerts`, { method: "POST", headers: H, body: JSON.stringify({ name: "", metric: "x" }) });
  assert.equal(bad.status, 400);
  const patch = await fetch(`${base}/api/metric-alerts`, { method: "PATCH", headers: H, body: JSON.stringify({ id: rule.id, enabled: false }) });
  assert.equal(patch.status, 200);
  const list = await (await fetch(`${base}/api/metric-alerts`, { headers: { Cookie: cookie } })).json();
  assert.equal(list.rules[0].enabled, false);
  assert.ok(Array.isArray(list.incidents));
  const del = await fetch(`${base}/api/metric-alerts`, { method: "DELETE", headers: H, body: JSON.stringify({ id: rule.id }) });
  assert.equal(del.status, 200);
  w.close();
});

test("首页包含指标告警 UI 元素", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const body = await (await fetch(`${base}/`)).text();
  for (const id of ["alert-top-tabs", "alert-metric", "ma-rules", "ma-incidents", "ma-form", "ma-rules-pager", "ma-incidents-pager"]) assert.match(body, new RegExp(`id="${id}"`), `缺少 ${id}`);
  w.close();
});

test("登录遮罩默认隐藏 + 启动遮罩兜底，双场景无闪烁", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const body = await (await fetch(`${base}/`)).text();
  const css = await (await fetch(`${base}/app.css`)).text();
  assert.match(css, /#auth-mask \{[^}]*display: none/);
  assert.match(body, /id="boot-mask"/);
  w.close();
});

test("终端 cd 同步：app.js 使用 onTitleChange 而非仅 cd 解析", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const js = await (await fetch(`${base}/app.js`)).text();
  assert.match(js, /onTitleChange/);
  assert.doesNotMatch(js, /if \(cd\) fsRevealPath/);
  w.close();
});

test("终端初始化防丢帧：app.js 增量写入历史并补拉二次 open", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const js = await (await fetch(`${base}/app.js`)).text();
  assert.match(js, /writeHistory/);
  assert.match(js, /h\.slice\(written\)/);
  assert.match(js, /fetch\("api\/term\/open"/);
  const hintIdx = js.indexOf('hintTimer = setTimeout(() => termSetLoading(true, t("term.starting"))');
  const readyWriteIdx = js.indexOf("writeHistory(r.history)");
  assert.ok(hintIdx !== -1 && readyWriteIdx !== -1 && hintIdx < readyWriteIdx, "hintTimer 必须先于可同步触发 ready 的 writeHistory 赋值");
  w.close();
});

test("关闭终端时旧会话的死亡输出不泄漏到新会话", async () => {
  const spawnShell = () => {
    const sh = new EventEmitter();
    sh.exitCode = null;
    sh.killed = false;
    sh.stdout = new EventEmitter();
    sh.stderr = new EventEmitter();
    sh.stdin = { write: () => {} };
    sh.kill = () => {
      sh.killed = true;
      setTimeout(() => {
        sh.stdout.emit("data", "Session terminated, killing shell...\n...killed.\n");
        sh.exitCode = 1;
        sh.emit("exit");
      }, 30);
    };
    return sh;
  };
  const w = await makeServer({}, { spawnShell });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };

  const ac = new AbortController();
  const sseRes = await fetch(`${base}/api/stream`, { headers: { Cookie: cookie }, signal: ac.signal });
  const reader = sseRes.body.getReader();
  let sseText = "";
  (async () => {
    const dec = new TextDecoder();
    while (true) { const { done, value } = await reader.read(); if (done) break; sseText += dec.decode(value); }
  })().catch(() => {});

  await fetch(`${base}/api/term/open`, { method: "POST", headers: H });
  await new Promise((r) => setTimeout(r, 50));
  await fetch(`${base}/api/term/close`, { method: "POST", headers: H });
  await new Promise((r) => setTimeout(r, 120));
  assert.ok(!sseText.includes("Session terminated"), "旧会话死亡输出不应被广播");
  assert.ok(!sseText.includes("会话已结束"), "旧会话结束提示不应被广播");

  const reopen = await (await fetch(`${base}/api/term/open`, { method: "POST", headers: H })).json();
  assert.ok(!String(reopen.history || "").includes("Session terminated"), "旧会话死亡输出不应写入新会话历史");
  ac.abort();
  w.close();
});

test("panelPath 前缀路由：带前缀可访问，无前缀 404", async () => {
  const w = await makeServer({ panelPath: "abcdef123456" });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  assert.equal((await fetch(`${base}/abcdef123456/`)).status, 200);
  assert.equal((await fetch(`${base}/abcdef123456/api/status`)).status, 200);
  assert.equal((await fetch(`${base}/`)).status, 404);
  assert.equal((await fetch(`${base}/api/status`)).status, 404);
  assert.equal((await fetch(`${base}/app.js`)).status, 404);
  w.close();
});

test("数据库连接 CRUD 与测试接口", async () => {
  const runCommand = async (cmd) => {
    if (cmd.startsWith("command -v psql")) return { exitCode: 0, stdout: "/usr/bin/psql", stderr: "" };
    if (cmd.startsWith("psql")) return { exitCode: 0, stdout: "1\n", stderr: "" };
    return { exitCode: 1, stdout: "", stderr: "" };
  };
  const w = await makeServer({}, { runCommand });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };

  const add = await fetch(`${base}/api/db/connections`, { method: "POST", headers: H, body: JSON.stringify({ name: "pg1", type: "postgres", host: "127.0.0.1", user: "postgres", password: "pw" }) });
  assert.equal(add.status, 200);
  const addData = await add.json();
  assert.equal(addData.entry.password, "");
  assert.equal(addData.entry.hasPass, true);
  const id = addData.entry.id;

  const list = await (await fetch(`${base}/api/db/connections`, { headers: { Cookie: cookie } })).json();
  assert.equal(list.connections.length, 1);
  assert.equal(list.connections[0].password, "");
  assert.equal(list.connections[0].hasPass, true);

  const t = await fetch(`${base}/api/db/test`, { method: "POST", headers: H, body: JSON.stringify({ id }) });
  const td = await t.json();
  assert.equal(td.ok, true);
  assert.match(td.detail, /1/);

  const del = await fetch(`${base}/api/db/connections`, { method: "DELETE", headers: H, body: JSON.stringify({ id }) });
  assert.equal(del.status, 200);
  const list2 = await (await fetch(`${base}/api/db/connections`, { headers: { Cookie: cookie } })).json();
  assert.equal(list2.connections.length, 0);
  w.close();
});

test("数据库连接接口校验：非法类型 400", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const res = await fetch(`${base}/api/db/connections`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ name: "x", type: "oracle" }) });
  assert.equal(res.status, 400);
  w.close();
});

test("数据库页前端：renderDb 相关钩子存在", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const js = await (await fetch(`${base}/app.js`)).text();
  const html = await (await fetch(`${base}/`)).text();
  assert.match(js, /loadDbConnections/);
  assert.match(js, /renderDbConnections/);
  assert.match(js, /api\/db\/connections/);
  assert.match(js, /api\/db\/test/);
  assert.match(html, /id="db-add-mask"/);
  assert.match(html, /id="db-add-type"/);
  w.close();
});

test("服务操作接口：鉴权/危险保护/执行", async () => {
  const runCommand = async (cmd) => ({ exitCode: cmd.startsWith("systemctl restart nginx.service") ? 0 : 1, stdout: "", stderr: "" });
  const w = await makeServer({}, { runCommand });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };

  const bad = await fetch(`${base}/api/systemd/op`, { method: "POST", headers: H, body: JSON.stringify({ unit: "nginx", action: "restart", password: "wrong" }) });
  assert.equal(bad.status, 403);

  const danger = await fetch(`${base}/api/systemd/op`, { method: "POST", headers: H, body: JSON.stringify({ unit: "dbus", action: "restart", password: "Secret123!" }) });
  assert.equal(danger.status, 403);

  const ok = await fetch(`${base}/api/systemd/op`, { method: "POST", headers: H, body: JSON.stringify({ unit: "nginx", action: "restart", password: "Secret123!" }) });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).ok, true);
  w.close();
});

test("服务日志接口", async () => {
  const runCommand = async (cmd) => cmd.startsWith("journalctl -u nginx.service")
    ? { exitCode: 0, stdout: "line1\nline2\n", stderr: "" }
    : { exitCode: 1, stdout: "", stderr: "" };
  const w = await makeServer({}, { runCommand });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const res = await fetch(`${base}/api/systemd/logs`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ unit: "nginx", lines: 500 }) });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.ok, true);
  assert.match(d.content, /line1/);
  w.close();
});
