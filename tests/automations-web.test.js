import test, { after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { startWeb } from "../src/web/server.js";
import { readIncidents } from "../src/incidents.js";
import { readRetros } from "../src/retros.js";

const testCaptchas = { create: () => ({ id: "c", code: "0000" }), verify: (id, code) => String(code) === "0000" };
const live = [];
after(async () => { await Promise.allSettled(live.map((s) => s.close())); });

function makeServer(extra = {}, extraDeps = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ff-auto-web-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, "{}");
  const w = startWeb({ port: 0, services: [], databases: [], configPath: cfg, ...extra }, { captchas: testCaptchas, noAutomationTimer: true, ...extraDeps });
  w.then((s) => live.push(s)).catch(() => {});
  return { promise: w, dir };
}

async function login(base) {
  await fetch(`${base}/api/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "Secret123!", captchaCode: "0000" }) });
  const res = await fetch(`${base}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: "Secret123!", captchaCode: "0000" }) });
  return res.headers.get("set-cookie").split(";")[0];
}

const ruleBody = {
  name: "nginx down",
  trigger: { type: "service_down", service: "nginx" },
  action: { type: "restart_service", service: "nginx" },
  cooldownSec: 60,
  maxRunsPerHour: 2,
};

test("自动化 API：增删改查、白名单持久化、KVM 脚本", async () => {
  const { promise, dir } = makeServer();
  const w = await promise;
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await login(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };

  const js = await fetch(`${base}/automations.js`, { headers: { Cookie: cookie } });
  assert.equal(js.status, 200);
  assert.match(await js.text(), /loadAutomations/);

  const created = await fetch(`${base}/api/automations`, { method: "POST", headers: H, body: JSON.stringify(ruleBody) });
  assert.equal(created.status, 200);
  const { rule } = await created.json();
  assert.equal(rule.verify[0].type, "service_active");

  const list = await (await fetch(`${base}/api/automations`, { headers: { Cookie: cookie } })).json();
  assert.equal(list.rules.length, 1);
  assert.equal(list.rules[0].name, "nginx down");

  const patched = await fetch(`${base}/api/automations`, { method: "PATCH", headers: H, body: JSON.stringify({ id: rule.id, enabled: false }) });
  assert.equal(patched.status, 200);
  assert.equal((await (await fetch(`${base}/api/automations`, { headers: { Cookie: cookie } })).json()).rules[0].enabled, false);

  const badCommand = await fetch(`${base}/api/automations`, { method: "POST", headers: H, body: JSON.stringify({ ...ruleBody, name: "cmd", action: { type: "run_command", command: "systemctl restart nginx" } }) });
  assert.equal(badCommand.status, 400);

  const cmd = await fetch(`${base}/api/automations/commands`, { method: "POST", headers: H, body: JSON.stringify({ commands: ["systemctl ", "  "] }) });
  assert.equal(cmd.status, 200);
  assert.deepEqual((await cmd.json()).commands, ["systemctl"]);
  const cfg = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
  assert.deepEqual(cfg.automationCommands, ["systemctl"]);

  const vm = await fetch(`${base}/api/automations/test`, { method: "POST", headers: H, body: JSON.stringify({ id: rule.id, mode: "vm" }) });
  assert.equal(vm.status, 200);
  assert.match((await vm.json()).script, /qemu-system-x86_64/);

  const parse = await fetch(`${base}/api/automations/parse`, { method: "POST", headers: H, body: JSON.stringify({ text: "nginx 挂了就重启" }) });
  assert.equal(parse.status, 400);

  const del = await fetch(`${base}/api/automations`, { method: "DELETE", headers: H, body: JSON.stringify({ id: rule.id }) });
  assert.equal(del.status, 200);
  assert.equal((await (await fetch(`${base}/api/automations`, { headers: { Cookie: cookie } })).json()).rules.length, 0);
  w.close();
});

test("本机测试通过 SSE 确认后执行并记录历史", async () => {
  let active = false;
  const calls = [];
  const exec = async (cmd) => {
    calls.push(cmd);
    if (cmd.startsWith("systemctl stop")) active = false;
    if (cmd.startsWith("systemctl restart") || cmd.startsWith("systemctl start")) active = true;
    if (cmd.includes("is-active")) return { exitCode: 0, stdout: active ? "active" : "inactive", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  const { promise } = makeServer({}, { runCommand: exec });
  const w = await promise;
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await login(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  const rule = (await (await fetch(`${base}/api/automations`, { method: "POST", headers: H, body: JSON.stringify(ruleBody) })).json()).rule;

  const sse = await fetch(`${base}/api/stream`, { headers: { Cookie: cookie } });
  const reader = sse.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const testPromise = fetch(`${base}/api/automations/test`, { method: "POST", headers: H, body: JSON.stringify({ id: rule.id, mode: "local" }) });
  while (!buf.includes('"type":"confirm"')) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
  }
  const line = buf.split("\n").find((l) => l.startsWith("data: ") && l.includes('"type":"confirm"'));
  assert.ok(line, "应收到确认事件");
  const confirmEvent = JSON.parse(line.slice(6));
  await fetch(`${base}/api/confirm`, { method: "POST", headers: H, body: JSON.stringify({ id: confirmEvent.id, ok: true }) });

  const res = await testPromise;
  assert.equal(res.status, 200);
  const run = await res.json();
  assert.equal(run.ok, true);
  assert.equal(run.mode, "local");
  assert.ok(calls.includes("systemctl stop nginx"));
  assert.ok(calls.includes("systemctl restart nginx"));

  const list = await (await fetch(`${base}/api/automations`, { headers: { Cookie: cookie } })).json();
  assert.equal(list.runs.length, 1);
  assert.equal(list.runs[0].test, true);

  reader.cancel().catch(() => {});
  w.close();
});

test("聊天生成规则和测试脚本（草稿不落盘）", async () => {
  const chat = async () => ({
    text: JSON.stringify({
      rule: { name: "nginx 挂了自动重启", description: "验证整条链路", trigger: { type: "service_down", service: "nginx" }, action: { type: "restart_service", service: "nginx" }, cooldownSec: 120 },
      script: "#!/usr/bin/env bash\nset -e\nsystemctl stop nginx\nsystemctl restart nginx\n",
    }),
  });
  const { promise } = makeServer({ apiKey: "k", baseUrl: "https://x", model: "m" }, { chat });
  const w = await promise;
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await login(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  const res = await fetch(`${base}/api/automations/chat`, { method: "POST", headers: H, body: JSON.stringify({ text: "nginx 挂了就重启，先停掉验证" }) });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.rule.name, "nginx 挂了自动重启");
  assert.equal(data.rule.testScript, "#!/usr/bin/env bash\nset -e\nsystemctl stop nginx\nsystemctl restart nginx");
  assert.equal(data.script, data.rule.testScript);
  const list = await (await fetch(`${base}/api/automations`, { headers: { Cookie: cookie } })).json();
  assert.equal(list.rules.length, 0);
  w.close();
});

test("运行测试脚本需 SSE 确认，执行后写入历史", async () => {
  const calls = [];
  const exec = async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("bash ")) return { exitCode: 0, stdout: "stopped\nrestarted\n", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  const { promise } = makeServer({}, { runCommand: exec });
  const w = await promise;
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await login(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  const script = "#!/usr/bin/env bash\nsystemctl stop nginx\nsystemctl restart nginx";
  const rule = (await (await fetch(`${base}/api/automations`, { method: "POST", headers: H, body: JSON.stringify({ ...ruleBody, testScript: script }) })).json()).rule;
  assert.equal(rule.testScript, script);

  const sse = await fetch(`${base}/api/stream`, { headers: { Cookie: cookie } });
  const reader = sse.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const runPromise = fetch(`${base}/api/automations/test-run`, { method: "POST", headers: H, body: JSON.stringify({ id: rule.id, script }) });
  while (!buf.includes('"type":"confirm"')) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
  }
  const line = buf.split("\n").find((l) => l.startsWith("data: ") && l.includes('"type":"confirm"'));
  assert.ok(line);
  const confirmEvent = JSON.parse(line.slice(6));
  assert.match(confirmEvent.command, /systemctl stop nginx/);
  await fetch(`${base}/api/confirm`, { method: "POST", headers: H, body: JSON.stringify({ id: confirmEvent.id, ok: true }) });

  const res = await runPromise;
  assert.equal(res.status, 200);
  const { run } = await res.json();
  assert.equal(run.ok, true);
  assert.equal(run.kind, "script-test");
  assert.match(run.stdout, /restarted/);
  assert.ok(calls.some((c) => c.includes("bash ") && c.includes(".sh")));

  const list = await (await fetch(`${base}/api/automations`, { headers: { Cookie: cookie } })).json();
  assert.equal(list.runs[0].kind, "script-test");
  assert.equal(list.runs[0].script, script);
  reader.cancel().catch(() => {});
  w.close();
});

test("自动化聊天会把同窗历史文本传给模型", async () => {
  let prompt = "";
  const chat = async ({ messages }) => {
    prompt = messages[0].content;
    return { text: JSON.stringify({ rule: { name: "历史规则", trigger: { type: "service_down", service: "nginx" }, action: { type: "restart_service", service: "nginx" } }, script: "#!/usr/bin/env bash\necho hi" }) };
  };
  const { promise } = makeServer({ apiKey: "k", baseUrl: "https://x", model: "m" }, { chat });
  const w = await promise;
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await login(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  const res = await fetch(`${base}/api/automations/chat`, {
    method: "POST", headers: H,
    body: JSON.stringify({ text: "把冷却改成 5 分钟", history: [{ role: "user", content: "nginx 挂了就重启" }, { role: "assistant", content: "已生成规则" }] }),
  });
  assert.equal(res.status, 200);
  assert.match(prompt, /nginx 挂了就重启/);
  assert.match(prompt, /已生成规则/);
  assert.match(prompt, /把冷却改成 5 分钟/);
  w.close();
});

test("对话内自动化模式接线", () => {
  const html = readFileSync(join(import.meta.dirname, "..", "src", "web", "static", "index.html"), "utf8");
  const chat = readFileSync(join(import.meta.dirname, "..", "src", "web", "static", "chat.js"), "utf8");
  const auto = readFileSync(join(import.meta.dirname, "..", "src", "web", "static", "automations.js"), "utf8");
  const css = readFileSync(join(import.meta.dirname, "..", "src", "web", "static", "app.css"), "utf8");
  assert.match(html, /id="auto-mode-btn"/);
  assert.match(html, /id="auto-mode-banner"/);
  assert.match(html, /id="auto-action-script"/);
  assert.match(chat, /sendAutoModeMessage/);
  assert.match(chat, /kind === "automation"/);
  assert.match(auto, /function enterAutoMode/);
  assert.match(auto, /function renderAutomationHistory/);
  assert.match(auto, /function buildAutomationScript/);
  assert.match(auto, /AUTO_RUN_PAGE_SIZE = 15/);
  assert.match(auto, /data-auto-run-del/);
  assert.match(auto, /data-auto-run-select/);
  assert.match(html, /id="auto-run-delete-mask"/);
  assert.match(auto, /function askAutoRunDelete/);
  assert.match(auto, /closest\("#auto-run-delete"\)/);
  assert.match(css, /\.input-actions\s*\{[^}]*margin-left:\s*auto/);
});

test("GET 自动化时从聊天历史回捞缺失的测试脚本", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-auto-hist-"));
  const cfg = join(dir, "config.json");
  const historyPath = join(dir, "history.json");
  writeFileSync(cfg, "{}");
  const w = await startWeb({ port: 0, services: [], databases: [], configPath: cfg, historyPath }, { captchas: testCaptchas, noAutomationTimer: true });
  live.push(w);
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await login(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  const rule = (await (await fetch(`${base}/api/automations`, { method: "POST", headers: H, body: JSON.stringify(ruleBody) })).json()).rule;
  assert.equal(rule.testScript, "");
  const script = "#!/usr/bin/env bash\necho from-history\n";
  writeFileSync(historyPath, JSON.stringify([{ role: "assistant", kind: "automation", rule: { id: rule.id }, script }]));
  const list = await (await fetch(`${base}/api/automations`, { headers: { Cookie: cookie } })).json();
  assert.equal(list.rules[0].testScript, script);
  w.close();
});

test("nginx 下线：先发告警，verify 通过后发修复成功邮件", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-auto-mail-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, JSON.stringify({ alertSmtp: { host: "smtp.test", port: "25", user: "u", pass: "p", from: "a@x.com", to: "ops@x.com" } }));
  const mails = [];
  const events = [];
  let active = false;
  const exec = async (cmd) => {
    if (cmd.startsWith("systemctl restart")) { events.push("action"); active = true; return { exitCode: 0, stdout: "", stderr: "" }; }
    if (cmd.includes("is-active")) { events.push("verify"); return { exitCode: 0, stdout: active ? "active" : "inactive", stderr: "" }; }
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  const w = await startWeb({ port: 0, services: [], databases: [], configPath: cfg }, {
    captchas: testCaptchas, noAutomationTimer: true, noAlertsTimer: true, runCommand: exec,
    sendEmail: async (smtp, subject, body) => { mails.push({ smtp, subject, body }); events.push(subject.includes("服务下线") ? "down" : "success"); return true; },
  });
  live.push(w);
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await login(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  await fetch(`${base}/api/automations`, { method: "POST", headers: H, body: JSON.stringify(ruleBody) });
  await w.automationEngine.tick();
  assert.equal(mails.length, 2);
  assert.ok(events.indexOf("down") >= 0 && events.indexOf("down") < events.indexOf("action"), `顺序应为告警→修复: ${events}`);
  assert.ok(events.indexOf("success") > events.indexOf("verify"), `顺序应为断言→修复成功: ${events}`);
  assert.match(mails[0].subject, /服务下线/);
  assert.match(mails[0].body, /开始修复/);
  assert.match(mails[1].subject, /自动化修复成功/);
  assert.match(mails[1].body, /nginx/);
  assert.match(mails[1].body, /通过/);
  const incs = (await readIncidents(join(dir, "incidents.json"))).incidents;
  assert.equal(incs.length, 1);
  assert.equal(incs[0].service, "nginx");
  assert.equal(incs[0].source, "automation");
  assert.equal(incs[0].status, "resolved");
  assert.equal(incs[0].automation?.ok, true);
  assert.ok(Array.isArray(incs[0].automation?.checks));
  let retros = [];
  for (let i = 0; i < 50; i++) {
    retros = await readRetros(join(dir, "retros.json"));
    if (retros.length) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(retros.length, 1);
  assert.equal(retros[0].incidentId, incs[0].id);
  assert.match(retros[0].markdown, /## 自动化/);
  assert.match(retros[0].markdown, /nginx/);
  w.close();
});

test("自动化修复后 verify 未通过：发修复失败邮件", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-auto-mail-fail-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, JSON.stringify({ alertSmtp: { host: "smtp.test", port: "25", user: "u", pass: "p", from: "a@x.com", to: "ops@x.com" } }));
  const mails = [];
  const exec = async (cmd) => {
    if (cmd.includes("is-active")) return { exitCode: 3, stdout: "inactive", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  const w = await startWeb({ port: 0, services: [], databases: [], configPath: cfg }, {
    captchas: testCaptchas, noAutomationTimer: true, noAlertsTimer: true, runCommand: exec,
    sendEmail: async (smtp, subject, body) => { mails.push({ smtp, subject, body }); return true; },
  });
  live.push(w);
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await login(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  await fetch(`${base}/api/automations`, { method: "POST", headers: H, body: JSON.stringify(ruleBody) });
  await w.automationEngine.tick();
  assert.equal(mails.length, 2);
  assert.match(mails[0].subject, /服务下线/);
  assert.match(mails[1].subject, /自动化修复失败/);
  assert.match(mails[1].body, /未达预期|失败/);
  const incs = (await readIncidents(join(dir, "incidents.json"))).incidents;
  assert.equal(incs.length, 1);
  assert.equal(incs[0].status, "open");
  assert.equal(incs[0].automation?.ok, false);
  w.close();
});

test("有自动化规则时监控不重复发下线/恢复邮件", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-auto-mon-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, JSON.stringify({ alertSmtp: { host: "smtp.test", port: "25", user: "u", pass: "p", from: "a@x.com", to: "ops@x.com" }, downServices: ["nginx"] }));
  const mails = [];
  let active = true;
  const exec = async (cmd) => {
    if (cmd.startsWith("systemctl is-active nginx")) return { exitCode: active ? 0 : 3, stdout: active ? "active" : "inactive", stderr: "" };
    if (cmd.startsWith("systemctl restart nginx")) { active = true; return { exitCode: 0, stdout: "", stderr: "" }; }
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  const w = await startWeb({ port: 0, services: [], databases: [], configPath: cfg }, {
    captchas: testCaptchas, noAutomationTimer: true, noAlertsTimer: true, runCommand: exec,
    sendEmail: async (smtp, subject, body) => { mails.push({ smtp, subject, body }); return true; },
  });
  live.push(w);
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await login(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  await fetch(`${base}/api/automations`, { method: "POST", headers: H, body: JSON.stringify(ruleBody) });
  await w.checkDownServices();
  active = false;
  await w.checkDownServices();
  assert.equal(mails.length, 0, "监控应让位给自动化发邮件");
  await w.automationEngine.tick();
  assert.equal(mails.length, 2);
  assert.match(mails[0].subject, /服务下线/);
  await w.checkDownServices();
  assert.equal(mails.length, 2, "自动化处理后不再发通用恢复邮件");
  w.close();
});

test("运行历史支持单个和批量删除，并分页展示", async () => {
  const exec = async (cmd) => ({ exitCode: cmd.includes("badpass") ? 1 : 0, stdout: "", stderr: "" });
  const { promise, dir } = makeServer({}, { noAutomationTimer: true, runCommand: exec });
  const w = await promise;
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await login(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  const runsPath = join(dir, "automation-runs.jsonl");
  const rows = [1, 2, 3].map((n) => ({ id: `AR-${n}`, automationId: "A-1", at: n, ok: true, checks: [], output: "" }));
  writeFileSync(runsPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const list = await (await fetch(`${base}/api/automations`, { headers: { Cookie: cookie } })).json();
  assert.equal(list.runs.length, 3);

  const bad = await fetch(`${base}/api/automations/runs`, { method: "DELETE", headers: H, body: JSON.stringify({ ids: ["AR-1"], password: "badpass" }) });
  assert.equal(bad.status, 403);
  const one = await fetch(`${base}/api/automations/runs`, { method: "DELETE", headers: H, body: JSON.stringify({ id: "AR-1", password: "rootpw" }) });
  assert.equal(one.status, 200);
  assert.equal((await one.json()).deleted, 1);
  const batch = await fetch(`${base}/api/automations/runs`, { method: "DELETE", headers: H, body: JSON.stringify({ ids: ["AR-2", "AR-3"], password: "rootpw" }) });
  assert.equal(batch.status, 200);
  assert.equal((await batch.json()).deleted, 2);
  const after = await (await fetch(`${base}/api/automations`, { headers: { Cookie: cookie } })).json();
  assert.equal(after.runs.length, 0);
  w.close();
});

test("旧版无 id 的失败运行记录可删除", async () => {
  const exec = async () => ({ exitCode: 0, stdout: "", stderr: "" });
  const { promise, dir } = makeServer({}, { noAutomationTimer: true, runCommand: exec });
  const w = await promise;
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await login(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  writeFileSync(join(dir, "automation-runs.jsonl"), JSON.stringify({ automationId: "A-1", at: 1, ok: false, test: true }) + "\n");
  const list = await (await fetch(`${base}/api/automations`, { headers: { Cookie: cookie } })).json();
  assert.equal(list.runs.length, 1);
  assert.match(list.runs[0].id, /^AR-L/);
  const del = await fetch(`${base}/api/automations/runs`, { method: "DELETE", headers: H, body: JSON.stringify({ ids: [list.runs[0].id], password: "rootpw" }) });
  assert.equal(del.status, 200);
  assert.equal((await del.json()).deleted, 1);
  const after = await (await fetch(`${base}/api/automations`, { headers: { Cookie: cookie } })).json();
  assert.equal(after.runs.length, 0);
  w.close();
});
