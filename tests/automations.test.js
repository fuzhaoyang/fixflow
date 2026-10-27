import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeAutomation, writeAutomations, readAutomations, evaluateTrigger, executeAutomation, runAutomationNow, createAutomationEngine, readRuns, appendRun, deleteRuns } from "../src/automations.js";

const dir = () => mkdtempSync(join(tmpdir(), "ff-auto-"));

const baseRule = (patch = {}) => ({
  name: "nginx down",
  trigger: { type: "service_down", service: "nginx" },
  action: { type: "restart_service", service: "nginx" },
  ...patch,
});

test("normalizeAutomation 校验触发与动作白名单", () => {
  assert.match(normalizeAutomation({ name: "x", trigger: { type: "nope" }, action: { type: "restart_service", service: "nginx" } }).error, /触发/);
  assert.match(normalizeAutomation(baseRule({ action: { type: "run_command", command: "rm -rf /" } }), { allowCommands: ["systemctl"] }).error, /白名单/);
  const ok = normalizeAutomation(baseRule({ action: { type: "run_command", command: "systemctl restart nginx" } }), { allowCommands: ["systemctl "] });
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.rule.verify, []);
});

test("verify 的 command_exit 也受命令白名单限制", () => {
  const bad = normalizeAutomation(baseRule({ verify: [{ type: "command_exit", command: "rm -rf /", expectExit: 0 }] }), { allowCommands: ["systemctl"] });
  assert.equal(bad.rule.verify.some((v) => v.type === "command_exit"), false);
  const good = normalizeAutomation(baseRule({ verify: [{ type: "command_exit", command: "systemctl is-active nginx", expectExit: 0 }] }), { allowCommands: ["systemctl"] });
  assert.equal(good.rule.verify.some((v) => v.type === "command_exit"), true);
});

test("normalizeAutomation 保存并截断 testScript", () => {
  const rule = normalizeAutomation(baseRule({ testScript: "#!/usr/bin/env bash\necho hi\n" })).rule;
  assert.equal(rule.testScript, "#!/usr/bin/env bash\necho hi\n");
  const long = normalizeAutomation(baseRule({ testScript: "x".repeat(30000) })).rule;
  assert.equal(long.testScript.length, 20000);
});

test("cron 首次只排期，到期后触发一次并顺延", async () => {
  const rule = normalizeAutomation({ name: "cron", trigger: { type: "cron", everySec: 10 }, action: { type: "restart_service", service: "nginx" } }).rule;
  let clock = 1000;
  const first = await evaluateTrigger(rule, { now: () => clock });
  assert.equal(first.triggered, false);
  assert.equal(first.state.nextRunAt, 11000);
  rule.state = { ...rule.state, ...first.state };
  clock = 12000;
  const second = await evaluateTrigger(rule, { now: () => clock });
  assert.equal(second.triggered, true);
  assert.equal(second.state.nextRunAt, 22000);
});

test("http 连续失败与动作失败分开计数", async () => {
  const rule = normalizeAutomation({ name: "http", trigger: { type: "http", url: "https://x.test/h", consecutiveFailures: 2 }, action: { type: "restart_service", service: "nginx" } }).rule;
  const fetchImpl = async () => ({ status: 500, ok: false });
  rule.state = { ...rule.state, failures: 5 };
  const one = await evaluateTrigger(rule, { fetchImpl });
  assert.equal(one.triggered, false);
  assert.equal(one.state.triggerFailures, 1);
  rule.state = { ...rule.state, ...one.state };
  const two = await evaluateTrigger(rule, { fetchImpl });
  assert.equal(two.triggered, true);
  assert.equal(two.state.triggerFailures, 2);
});

test("引擎遵守冷却时间", async () => {
  const d = dir();
  const file = join(d, "automations.json");
  const runs = join(d, "runs.jsonl");
  const rule = normalizeAutomation(baseRule({ cooldownSec: 300 })).rule;
  await writeAutomations(file, [rule]);
  const calls = [];
  const engine = createAutomationEngine({ filePath: file, runsPath: runs, exec: async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: cmd.includes("is-active") ? "inactive" : "" }; }, now: () => 1_000_000_000 });
  await engine.tick();
  await engine.tick();
  assert.equal(calls.filter((c) => c.startsWith("systemctl restart")).length, 1);
  assert.equal((await readRuns(runs)).length, 1);
});

test("手动运行会记录状态与历史", async () => {
  const d = dir();
  const file = join(d, "automations.json");
  const runs = join(d, "runs.jsonl");
  const rule = normalizeAutomation(baseRule()).rule;
  await writeAutomations(file, [rule]);
  const r = await runAutomationNow({ filePath: file, runsPath: runs, id: rule.id, exec: async (cmd) => ({ exitCode: 0, stdout: cmd.includes("is-active") ? "active" : "" }), now: () => 5000 });
  assert.equal(r.run.ok, true);
  assert.equal((await readRuns(runs)).length, 1);
  const saved = (await readAutomations(file))[0];
  assert.equal(saved.state.lastRunAt, 5000);
  assert.equal(saved.state.runTimes.at(-1), 5000);
});

test("pm2 管理器使用 pm2 动作和 pm2_online 断言", async () => {
  const rule = normalizeAutomation({ name: "pm2", manager: "pm2", trigger: { type: "service_down", service: "chatbot" }, action: { type: "restart_service", service: "chatbot" } }).rule;
  assert.equal(rule.manager, "pm2");
  assert.deepEqual(rule.verify, [{ type: "pm2_online", service: "chatbot" }]);
  let online = false;
  const calls = [];
  const exec = async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("pm2 jlist")) return { exitCode: 0, stdout: JSON.stringify([{ name: "chatbot", pm2_env: { status: online ? "online" : "stopped" } }]), stderr: "" };
    if (cmd.startsWith("pm2 restart")) { online = true; return { exitCode: 0, stdout: "", stderr: "" }; }
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  const ev = await evaluateTrigger(rule, { exec, now: () => 1e9 });
  assert.equal(ev.triggered, true);
  const run = await executeAutomation(rule, { exec, now: () => 1e9 });
  assert.equal(run.ok, true);
  assert.ok(calls.includes("pm2 restart chatbot"));
});

test("自定义管理器需要状态命令和 run_command", () => {
  assert.match(normalizeAutomation({ name: "x", manager: "custom", trigger: { type: "service_down", service: "x" }, action: { type: "run_command", command: "x" } }).error, /状态检查/);
  const ok = normalizeAutomation({ name: "x", manager: "custom", trigger: { type: "service_down", service: "x", statusCommand: "pgrep -f x" }, action: { type: "run_command", command: "systemctl" } }, { allowCommands: ["systemctl"] });
  assert.equal(ok.error, undefined);
  assert.equal(ok.rule.verify[0].type, "custom_active");
  assert.match(normalizeAutomation({ name: "x", manager: "custom", trigger: { type: "service_down", service: "x", statusCommand: "pgrep -f x" }, action: { type: "restart_service", service: "x" } }).error, /run_command/);
});

test("executeAutomation 汇总动作与断言", async () => {
  const rule = normalizeAutomation(baseRule()).rule;
  const run = await executeAutomation(rule, { exec: async (cmd) => ({ exitCode: cmd.includes("is-active") ? 3 : 0, stdout: "" }), now: () => 1 });
  assert.equal(run.ok, false);
  assert.equal(run.checks[0].ok, false);
});

test("readRuns 为旧记录生成稳定 ID，deleteRuns 可删除", async () => {
  const d = dir();
  const file = join(d, "runs.jsonl");
  writeFileSync(file, JSON.stringify({ automationId: "A-1", at: 1, ok: false }) + "\n" + JSON.stringify({ id: "AR-1", automationId: "A-1", at: 2, ok: true }) + "\n");
  const runs = await readRuns(file);
  assert.equal(runs.length, 2);
  assert.match(runs[0].id, /^AR-L/);
  const again = await readRuns(file);
  assert.equal(again[0].id, runs[0].id);
  const r = await deleteRuns({ filePath: file, ids: [runs[0].id] });
  assert.equal(r.deleted, 1);
  assert.deepEqual((await readRuns(file)).map((x) => x.id), ["AR-1"]);
});

test("deleteRuns 支持单个和批量删除", async () => {
  const d = dir();
  const file = join(d, "runs.jsonl");
  await appendRun(file, { id: "AR-1", automationId: "A-1" });
  await appendRun(file, { id: "AR-2", automationId: "A-1" });
  await appendRun(file, { id: "AR-3", automationId: "A-1" });
  const one = await deleteRuns({ filePath: file, ids: ["AR-1"] });
  assert.equal(one.deleted, 1);
  assert.deepEqual((await readRuns(file)).map((r) => r.id), ["AR-2", "AR-3"]);
  const rest = await deleteRuns({ filePath: file, ids: ["AR-2", "AR-3", "AR-missing"] });
  assert.equal(rest.deleted, 2);
  assert.equal((await readRuns(file)).length, 0);
});
