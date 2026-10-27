import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeAlertPayload, createOrMergeIncidents, readIncidents, deleteIncidents } from "../src/incidents.js";
import { readRetros } from "../src/retros.js";
import { addDeployment, readDeployments } from "../src/deployments.js";
import { collectEvidence, normalizePlaybooks } from "../src/incidents-playbook.js";
import { analyzeIncident } from "../src/incidents-rca.js";
import { startWeb } from "../src/web/server.js";

test("normalizeAlertPayload 支持 Alertmanager 与通用格式", () => {
  const now = Date.now();
  const list = normalizeAlertPayload({
    status: "firing",
    alerts: [{
      status: "firing",
      labels: { alertname: "HighErrorRate", service: "order", instance: "web-01", severity: "critical" },
      annotations: { summary: "订单服务 502" },
      startsAt: new Date(now).toISOString(),
      fingerprint: "fp-1",
    }],
  }, { now });
  assert.equal(list.length, 1);
  assert.equal(list[0].service, "order");
  assert.equal(list[0].host, "web-01");
  assert.equal(list[0].title, "订单服务 502");
  assert.equal(list[0].severity, 1);
  assert.equal(list[0].fingerprint, "fp-1");
  assert.equal(list[0].status, "firing");

  const generic = normalizeAlertPayload({ service: "db", host: "db-01", severity: "warning", title: "连接数过高", startedAt: now });
  assert.equal(generic[0].service, "db");
  assert.equal(generic[0].severity, 3);
});

test("createOrMergeIncidents 去重与恢复", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-inc-"));
  const file = join(dir, "incidents.json");
  const alert = { fingerprint: "fp", source: "generic", service: "order", host: "h", alertname: "A", title: "T", severity: 2, status: "firing", startedAt: Date.now() - 1000, labels: {} };
  const first = await createOrMergeIncidents({ filePath: file, alerts: [alert] });
  assert.equal(first.results[0].created, true);
  const second = await createOrMergeIncidents({ filePath: file, alerts: [{ ...alert, title: "T2" }] });
  assert.equal(second.results[0].created, false);
  assert.equal(second.incidents.length, 1);
  const resolved = await createOrMergeIncidents({ filePath: file, alerts: [{ ...alert, status: "resolved" }] });
  assert.equal(resolved.results[0].resolved, true);
  assert.equal(resolved.incidents[0].status, "resolved");
  assert.ok(resolved.incidents[0].resolvedAt);
  const state = await readIncidents(file);
  assert.equal(state.incidents.length, 1);
});

test("deployments 追加与读取", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-dep-"));
  const file = join(dir, "deployments.jsonl");
  await addDeployment(file, { service: "order", version: "1.2.3", commit: "abc", rollback: "deploy order 1.2.2" });
  await addDeployment(file, { service: "other", version: "9" });
  const rows = await readDeployments(file, { service: "order" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].version, "1.2.3");
  assert.equal(rows[0].rollback, "deploy order 1.2.2");
});

test("collectEvidence 并行采集状态、日志、发布、上游", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-play-"));
  const dep = join(dir, "deployments.jsonl");
  await addDeployment(dep, { service: "order", version: "2.0.0" });
  const evidence = await collectEvidence({
    config: { playbooks: { order: { logs: ["echo log-ok"], upstreams: ["http://up/health"], releaseService: "order", kb: false } }, knowledge: { enabled: false } },
    incident: { service: "order", title: "订单服务 502" },
    deploymentsPath: dep,
    exec: async (cmd) => ({ stdout: cmd.includes("systemctl") ? "active" : "log-ok", stderr: "", exitCode: 0 }),
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });
  const kinds = evidence.map((e) => e.kind);
  assert.ok(kinds.includes("service"));
  assert.ok(kinds.includes("log"));
  assert.ok(kinds.includes("deploy"));
  assert.ok(kinds.includes("upstream"));
  assert.match(evidence.find((e) => e.kind === "deploy").output, /2\.0\.0/);
});

test("analyzeIncident 解析结构化 RCA", async () => {
  const r = await analyzeIncident({
    config: { apiKey: "x", baseUrl: "http://llm", model: "m" },
    incident: { service: "order", host: "h", title: "502", severity: 2, startedAt: Date.now(), labels: {} },
    evidence: [{ kind: "log", command: "logs", output: "timeout" }],
    llmChat: async () => ({ text: '```json\n{"summary":"上游超时","rootCause":"网关连接池过小","confidence":0.8,"evidenceRefs":["log"],"suggestedAction":"扩容连接池","rollback":"回滚上一版","missing":"发布记录"}\n```' }),
  });
  assert.equal(r.summary, "上游超时");
  assert.equal(r.rootCause, "网关连接池过小");
  assert.equal(r.confidence, 0.8);
  assert.equal(r.rollback, "回滚上一版");
  const none = await analyzeIncident({ config: {}, incident: {}, evidence: [], llmChat: async () => ({ text: "" }) });
  assert.equal(none, null);
});

const testCaptchas = { create: () => ({ id: "t", code: "0000" }), verify: (i, c) => String(c) === "0000" };
const live = [];
after(async () => { await Promise.allSettled(live.map((s) => s.close())); });

test("/api/incidents 列表、详情、动作与复盘联动", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-inc-api-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, "{}");
  const now = Date.now();
  const inc = {
    id: "INC-test01", fingerprint: "service:test", source: "service", service: "order", host: "web-01",
    alertname: "订单服务 502", title: "订单服务 502", severity: 2, status: "resolved",
    startedAt: now - 600000, lastSeen: now, resolvedAt: now, labels: {}, annotations: {},
    timeline: [{ ts: now - 600000, text: "告警接入" }, { ts: now, text: "告警恢复" }],
    evidence: [{ kind: "log", command: "journalctl -u order", output: "upstream timeout", ts: now, ok: false }],
    rca: { summary: "上游网关超时", rootCause: "网关连接池过小", confidence: 0.8, evidenceRefs: ["log"], suggestedAction: "扩容连接池", rollback: "回滚上一版", missing: "发布记录" },
    actions: [], retroId: "INC-test01",
  };
  const card = {
    id: "INC-test01", incidentId: "INC-test01", title: "[P2] web-01 订单服务 502 复盘", host: "web-01",
    metric: "incident", metricLabel: "order", ruleName: "订单服务 502", level: 2,
    startedAt: inc.startedAt, recoveredAt: now, durationMin: 10, peak: "", threshold: "", op: "",
    summary: inc.rca.summary, rootCause: inc.rca.rootCause, ai: true, createdAt: new Date(now).toISOString(),
    markdown: "# 测试复盘\n\n内容",
  };
  writeFileSync(join(dir, "incidents.json"), JSON.stringify({ incidents: [inc] }));
  writeFileSync(join(dir, "retros.json"), JSON.stringify([card]));
  const playbooks = { order: { actions: { restart: { command: "echo restarted", label: "重启服务", risk: "medium" } } } };
  const runCommand = async (cmd) => cmd.includes("sudo -S")
    ? { exitCode: 0, stdout: "", stderr: "" }
    : { exitCode: 0, stdout: "restarted\n", stderr: "" };
  const w = await startWeb({ port: 0, services: [], databases: [], configPath: cfg, playbooks }, { captchas: testCaptchas, runCommand });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const H = { "Content-Type": "application/json" };
  await fetch(`${base}/api/register`, { method: "POST", headers: H, body: JSON.stringify({ username: "admin", password: "Secret123!", captchaCode: "0000" }) });
  const login = await fetch(`${base}/api/login`, { method: "POST", headers: H, body: JSON.stringify({ username: "admin", password: "Secret123!", captchaCode: "0000" }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const auth = { Cookie: cookie };

  const list = await (await fetch(`${base}/api/incidents`, { headers: auth })).json();
  assert.equal(list.incidents.length, 1);
  assert.equal(list.incidents[0].id, inc.id);
  assert.equal(list.incidents[0].actions, undefined);

  const detail = await (await fetch(`${base}/api/incidents/${inc.id}`, { headers: auth })).json();
  assert.equal(detail.id, inc.id);
  assert.equal(detail.evidence.length, 1);
  assert.ok(detail.allowedActions.some((a) => a.key === "restart"));

  const run = await fetch(`${base}/api/incidents/${inc.id}/action`, {
    method: "POST", headers: { ...H, Cookie: cookie },
    body: JSON.stringify({ action: "restart", password: "Secret123!" }),
  });
  const runData = await run.json();
  assert.equal(run.status, 200);
  assert.equal(runData.ok, true);
  assert.match(runData.output, /restarted/);
  const ran = await (await fetch(`${base}/api/incidents/${inc.id}`, { headers: auth })).json();
  assert.equal(ran.actions.at(-1).key, "restart");

  const retros = await (await fetch(`${base}/api/retros`, { headers: auth })).json();
  assert.ok(retros.cards.some((c) => c.incidentId === inc.id));

  await w.close();
});

test("normalizePlaybooks 校验与规范化", () => {
  const ok = normalizePlaybooks({
    nginx: { logs: [" echo nginx ", ""], upstreams: ["http://127.0.0.1/"], releaseService: "nginx", kb: true, actions: { restart: { command: " systemctl restart nginx ", label: "重启 Nginx", risk: "high" } } },
    host: { logs: [], actions: {} },
  });
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.playbooks.nginx.logs, ["echo nginx"]);
  assert.deepEqual(ok.playbooks.nginx.actions.restart, { command: "systemctl restart nginx", label: "重启 Nginx", risk: "high" });
  assert.equal(ok.playbooks.host.kb, true);
  assert.ok(normalizePlaybooks({ "bad name": {} }).error);
  assert.ok(normalizePlaybooks({ nginx: { actions: { restart: { command: "" } } } }).error);
  assert.ok(normalizePlaybooks({ nginx: { actions: { "bad key": { command: "x" } } } }).error);
  assert.ok(normalizePlaybooks([]).error);
});

test("/api/playbooks 保存、持久化与立即生效", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-pb-api-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, "{}");
  const w = await startWeb({ port: 0, services: [], databases: [], configPath: cfg }, { captchas: testCaptchas });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const H = { "Content-Type": "application/json" };
  await fetch(`${base}/api/register`, { method: "POST", headers: H, body: JSON.stringify({ username: "admin", password: "Secret123!", captchaCode: "0000" }) });
  const login = await fetch(`${base}/api/login`, { method: "POST", headers: H, body: JSON.stringify({ username: "admin", password: "Secret123!", captchaCode: "0000" }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const auth = { Cookie: cookie };

  const playbooks = {
    nginx: { logs: ["journalctl -u nginx -n 200"], upstreams: ["http://127.0.0.1/"], releaseService: "nginx", kb: true, actions: { restart: { command: "systemctl restart nginx", label: "重启 Nginx", risk: "medium" } } },
    host: { logs: ["journalctl -p err -n 200"], actions: {} },
  };
  const save = await fetch(`${base}/api/playbooks`, { method: "POST", headers: { ...H, Cookie: cookie }, body: JSON.stringify({ playbooks }) });
  assert.equal(save.status, 200);
  const saved = await save.json();
  assert.equal(saved.ok, true);
  assert.equal(saved.playbooks.nginx.actions.restart.command, "systemctl restart nginx");
  const got = await (await fetch(`${base}/api/playbooks`, { headers: auth })).json();
  assert.equal(got.playbooks.nginx.releaseService, "nginx");
  const persisted = JSON.parse(readFileSync(cfg, "utf8"));
  assert.equal(persisted.playbooks.nginx.actions.restart.risk, "medium");

  const bad = await fetch(`${base}/api/playbooks`, { method: "POST", headers: { ...H, Cookie: cookie }, body: JSON.stringify({ playbooks: { nginx: { actions: { restart: { command: "" } } } } }) });
  assert.equal(bad.status, 400);

  await w.close();
});

test("启动时对账：服务已恢复的 open 事件自动 resolved 并生成复盘", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-inc-reconcile-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, "{}");
  const now = Date.now();
  const inc = {
    id: "INC-open-001", fingerprint: "service:down:nginx", source: "service", service: "nginx", host: "h",
    alertname: "服务 nginx 异常关闭", title: "服务 nginx 异常关闭", severity: 2, status: "open",
    startedAt: now - 60000, lastSeen: now - 60000, resolvedAt: 0, labels: { unit: "nginx", kind: "down", state: "inactive" },
    annotations: {}, timeline: [{ ts: now - 60000, text: "告警接入" }],
    evidence: [{ kind: "service", command: "systemctl is-active nginx", output: "inactive", ts: now - 59000, ok: false }],
    rca: null, playbookAt: 0, rcaAt: 0, retroId: null,
  };
  writeFileSync(join(dir, "incidents.json"), JSON.stringify({ incidents: [inc] }));
  const w = await startWeb({ port: 0, services: [], databases: [], configPath: cfg }, {
    captchas: testCaptchas,
    runCommand: async () => ({ stdout: "active\n", stderr: "", exitCode: 0 }),
  });
  await new Promise((r) => setTimeout(r, 4500));
  const after = JSON.parse(readFileSync(join(dir, "incidents.json"), "utf8")).incidents.find((x) => x.id === inc.id);
  assert.equal(after.status, "resolved");
  assert.ok(after.retroId);
  const retros = JSON.parse(readFileSync(join(dir, "retros.json"), "utf8"));
  assert.ok(retros.some((c) => c.incidentId === inc.id));
  await w.close();
});

test("只有 resolved 的告警不创建新事件", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-inc-resolved-"));
  const file = join(dir, "incidents.json");
  const r = await createOrMergeIncidents({
    filePath: file,
    alerts: [{ fingerprint: "fp-resolved", source: "service", service: "s", host: "h", alertname: "a", title: "t", severity: 2, status: "resolved", startedAt: Date.now() - 1000, labels: {} }],
  });
  assert.equal(r.results[0]?.skipped, true);
  assert.equal((await readIncidents(file)).incidents.length, 0);
});

test("deleteIncidents 支持单个和批量删除", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-inc-del-"));
  const file = join(dir, "incidents.json");
  const mk = (id, ts) => ({ id, fingerprint: "fp-" + id, source: "generic", service: "s", host: "h", alertname: "a", title: id, severity: 2, status: "resolved", startedAt: ts, lastSeen: ts, resolvedAt: ts, labels: {}, annotations: {}, timeline: [], evidence: [], rca: null, retroId: null });
  writeFileSync(file, JSON.stringify({ incidents: [mk("INC-1", 3), mk("INC-2", 2), mk("INC-3", 1)] }));
  const one = await deleteIncidents({ filePath: file, ids: ["INC-1"] });
  assert.equal(one.deleted, 1);
  assert.deepEqual((await readIncidents(file)).incidents.map((i) => i.id), ["INC-2", "INC-3"]);
  const rest = await deleteIncidents({ filePath: file, ids: ["INC-2", "INC-3", "INC-missing"] });
  assert.equal(rest.deleted, 2);
  assert.equal((await readIncidents(file)).incidents.length, 0);
});

test("/api/incidents DELETE 需要 root 密码，支持单个和批量", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-inc-del-api-"));
  const cfg = join(dir, "config.json");
  const incidentsPath = join(dir, "incidents.json");
  const retrosPath = join(dir, "retros.json");
  writeFileSync(cfg, "{}");
  const mk = (id, ts) => ({ id, fingerprint: "fp-" + id, source: "generic", service: "s", host: "h", alertname: "a", title: id, severity: 2, status: "resolved", startedAt: ts, lastSeen: ts, resolvedAt: ts, labels: {}, annotations: {}, timeline: [], evidence: [], rca: null, retroId: null });
  writeFileSync(incidentsPath, JSON.stringify({ incidents: [mk("INC-1", 3), mk("INC-2", 2), mk("INC-3", 1)] }));
  writeFileSync(retrosPath, JSON.stringify([{ id: "R-1", incidentId: "INC-1" }, { id: "R-2", incidentId: "INC-2" }]));
  const exec = async (cmd) => {
    if (/su -c true root|sudo -S/.test(cmd)) return { exitCode: cmd.includes("badpass") ? 1 : 0, stdout: "", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  const w = await startWeb({ port: 0, services: [], databases: [], configPath: cfg, incidentsPath, retrosPath }, { captchas: testCaptchas, noAlertsTimer: true, noAutomationTimer: true, runCommand: exec });
  live.push(w);
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const H = { "Content-Type": "application/json" };
  await fetch(`${base}/api/register`, { method: "POST", headers: H, body: JSON.stringify({ username: "admin", password: "Secret123!", captchaCode: "0000" }) });
  const login = await fetch(`${base}/api/login`, { method: "POST", headers: H, body: JSON.stringify({ username: "admin", password: "Secret123!", captchaCode: "0000" }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const auth = { Cookie: cookie, "Content-Type": "application/json" };

  const noPw = await fetch(`${base}/api/incidents`, { method: "DELETE", headers: auth, body: JSON.stringify({ ids: ["INC-1"] }) });
  assert.equal(noPw.status, 403);

  const bad = await fetch(`${base}/api/incidents`, { method: "DELETE", headers: auth, body: JSON.stringify({ ids: ["INC-1"], password: "badpass" }) });
  assert.equal(bad.status, 403);
  assert.equal((await readIncidents(incidentsPath)).incidents.length, 3);

  const one = await fetch(`${base}/api/incidents`, { method: "DELETE", headers: auth, body: JSON.stringify({ ids: ["INC-1"], password: "rootpw" }) });
  assert.equal(one.status, 200);
  const oneData = await one.json();
  assert.equal(oneData.deleted, 1);
  assert.equal(oneData.retrosDeleted, 1);
  assert.equal((await readIncidents(incidentsPath)).incidents.length, 2);
  assert.deepEqual((await readRetros(retrosPath)).map((c) => c.id), ["R-2"]);

  const batch = await fetch(`${base}/api/incidents`, { method: "DELETE", headers: auth, body: JSON.stringify({ ids: ["INC-2", "INC-3"], password: "rootpw" }) });
  assert.equal(batch.status, 200);
  assert.equal((await batch.json()).deleted, 2);
  assert.equal((await readIncidents(incidentsPath)).incidents.length, 0);
  assert.equal((await readRetros(retrosPath)).length, 0);
  await w.close();
});

test("事件页支持每页 5 条和单个/批量删除入口", () => {
  const stat = join(import.meta.dirname, "..", "src", "web", "static");
  const html = readFileSync(join(stat, "index.html"), "utf8");
  const js = readFileSync(join(stat, "incidents.js"), "utf8");
  assert.match(js, /INCIDENT_PAGE_SIZE = 5/);
  assert.match(js, /incidentSelected/);
  assert.match(html, /id="incident-delete-btn"/);
  assert.match(html, /id="incident-delete-mask"/);
  assert.match(html, /id="incident-pager"/);
});

test("failed 服务检查命令失败时不误判恢复", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-failed-check-"));
  const cfg = join(dir, "config.json");
  const incidentsPath = join(dir, "incidents.json");
  writeFileSync(cfg, "{}");
  const inc = { id: "INC-fail", fingerprint: "service:failed:deepin-defender-scanner.service", source: "service", service: "deepin-defender-scanner.service", host: "PECI1484", alertname: "服务 deepin-defender-scanner.service 进入 failed 状态", title: "服务 deepin-defender-scanner.service 进入 failed 状态", severity: 2, status: "open", startedAt: 1, lastSeen: 1, resolvedAt: 0, labels: { unit: "deepin-defender-scanner.service", kind: "failed" }, annotations: {}, timeline: [], evidence: [], rca: null, retroId: null };
  writeFileSync(incidentsPath, JSON.stringify({ incidents: [inc] }));
  const out = [
    { exitCode: 0, stdout: "● deepin-defender-scanner.service loaded failed failed deepin defender scanner\n", stderr: "" },
    { exitCode: 1, stdout: "", stderr: "systemctl temporarily failed" },
    { exitCode: 0, stdout: "● deepin-defender-scanner.service loaded failed failed deepin defender scanner\n", stderr: "" },
  ];
  let i = 0;
  const exec = async (cmd) => {
    if (cmd.startsWith("systemctl --state=failed")) return out[Math.min(i++, out.length - 1)];
    if (cmd.startsWith("systemctl is-active")) return { exitCode: 3, stdout: "failed", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  const w = await startWeb({ port: 0, services: [], databases: [], configPath: cfg, incidentsPath }, { captchas: testCaptchas, noAlertsTimer: true, noAutomationTimer: true, runCommand: exec });
  live.push(w);
  await w.checkFailedServices();
  await w.checkFailedServices();
  await w.checkFailedServices();
  const items = (await readIncidents(incidentsPath)).incidents;
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "open");
  await w.close();
});
