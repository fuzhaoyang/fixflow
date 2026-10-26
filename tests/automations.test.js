import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeAutomation, writeAutomations, readAutomations, evaluateTrigger, executeAutomation, runAutomationNow, runLocalTest, buildVmTestScript, createAutomationEngine, readRuns } from "../src/automations.js";

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

test("本机测试执行注入、动作、断言和恢复，并在用户拒绝时不执行", async () => {
  const rule = normalizeAutomation(baseRule()).rule;
  const calls = [];
  let active = false;
  const exec = async (cmd) => {
    calls.push(cmd);
    if (cmd.startsWith("systemctl stop")) active = false;
    if (cmd.startsWith("systemctl restart")) active = true;
    if (cmd.includes("is-active")) return { exitCode: 0, stdout: active ? "active" : "inactive" };
    return { exitCode: 0, stdout: "" };
  };
  const rejected = await runLocalTest(rule, { confirm: async () => false, exec });
  assert.equal(rejected.rejected, true);
  assert.equal(calls.length, 0);
  const run = await runLocalTest(rule, { confirm: async () => true, exec });
  assert.equal(run.ok, true);
  assert.equal(run.restored, true);
  assert.ok(calls.includes("systemctl stop nginx"));
  assert.ok(calls.includes("systemctl restart nginx"));
  assert.ok(calls.includes("systemctl start nginx"));
});

test("禁止本机测试停止面板/SSH 等关键服务", async () => {
  for (const service of ["fixflow", "sshd", "systemd"]) {
    const rule = normalizeAutomation({ name: "x", trigger: { type: "service_down", service }, action: { type: "restart_service", service } }).rule;
    const r = await runLocalTest(rule, { confirm: async () => true, exec: async () => ({ exitCode: 0, stdout: "" }) });
    assert.match(r.error, /不允许/);
  }
});

test("KVM 脚本只生成，不执行，并包含清理与断言", () => {
  const script = buildVmTestScript(normalizeAutomation(baseRule()).rule);
  assert.match(script, /qemu-system-x86_64/);
  assert.match(script, /cloud-localds/);
  assert.match(script, /trap cleanup EXIT/);
  const b64 = script.match(/echo '([A-Za-z0-9+/=]+)' \| base64 -d/)[1];
  const guest = Buffer.from(b64, "base64").toString("utf8");
  assert.match(guest, /systemctl restart nginx/);
  assert.match(guest, /systemctl is-active --quiet nginx/);
  assert.match(guest, /systemctl start nginx/);
  assert.match(script, /base64 -d/);
});

test("executeAutomation 汇总动作与断言", async () => {
  const rule = normalizeAutomation(baseRule()).rule;
  const run = await executeAutomation(rule, { exec: async (cmd) => ({ exitCode: cmd.includes("is-active") ? 3 : 0, stdout: "" }), now: () => 1 });
  assert.equal(run.ok, false);
  assert.equal(run.checks[0].ok, false);
});
