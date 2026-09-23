import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAlertsManager } from "../src/alerts.js";

const dir = () => mkdtempSync(join(tmpdir(), "ff-alert-"));

async function mk(cfgPath, { sessionFactory, now, exec } = {}) {
  return createAlertsManager({
    config: { baseUrl: "https://x/v1", apiKey: "k", model: "m" },
    configPath: cfgPath,
    sessionFactory: sessionFactory || (() => ({ send: async () => "模拟报告" })),
    now: now || (() => new Date(2026, 8, 23, 10, 0, 0)),
    exec: exec || (async () => ({ exitCode: 0, stdout: "/usr/sbin/sendmail\n", stderr: "" })),
  });
}

test("save/list 持久化告警", async () => {
  const cfgPath = join(dir(), "config.json");
  writeFileSync(cfgPath, "{}");
  const am = await mk(cfgPath);
  await am.save([{ id: "a1", name: "日报", instruction: "生成日报", time: "09:00", recipients: ["a@x.com"], enabled: true }]);
  assert.equal((await (await mk(cfgPath)).list()).length, 1);
});

test("tick 到点后执行一次并去重", async () => {
  const cfgPath = join(dir(), "config.json");
  const alert = { id: "a1", name: "日报", instruction: "x", time: "09:30", recipients: ["a@x.com"], enabled: true };
  writeFileSync(cfgPath, JSON.stringify({ alerts: [alert] }));
  let runs = 0;
  const am = await mk(cfgPath, { sessionFactory: () => ({ send: async () => { runs++; return "r"; } }) });
  await am.tick();
  assert.equal(runs, 1);
  await am.tick();
  assert.equal(runs, 1);
});

test("tick 未到点不执行，enabled=false 不执行", async () => {
  const cfgPath = join(dir(), "config.json");
  writeFileSync(cfgPath, JSON.stringify({ alerts: [
    { id: "a1", name: "x", instruction: "x", time: "11:00", recipients: ["a@x.com"], enabled: true },
    { id: "a2", name: "y", instruction: "y", time: "09:00", recipients: ["a@x.com"], enabled: false },
  ] }));
  let runs = 0;
  const am = await mk(cfgPath, { sessionFactory: () => ({ send: async () => { runs++; return "r"; } }) });
  await am.tick();
  assert.equal(runs, 0);
});

test("run 成功写历史，保留 20 条", async () => {
  const cfgPath = join(dir(), "config.json");
  writeFileSync(cfgPath, JSON.stringify({ alerts: [{ id: "a1", name: "日报", instruction: "x", time: "09:00", recipients: ["a@x.com"], enabled: true }] }));
  const am = await mk(cfgPath);
  for (let i = 0; i < 25; i++) await am.runNow("a1");
  const h = await am.history("a1");
  assert.equal(h.length, 20);
  assert.equal(h[0].ok, true);
  assert.ok(h[0].summary.length <= 500);
});

test("run 失败（模型抛错）写 ok:false 与 error", async () => {
  const cfgPath = join(dir(), "config.json");
  writeFileSync(cfgPath, JSON.stringify({ alerts: [{ id: "a1", name: "日报", instruction: "x", time: "09:00", recipients: ["a@x.com"], enabled: true }] }));
  const am = await mk(cfgPath, { sessionFactory: () => ({ send: async () => { throw new Error("模型挂了"); } }) });
  const r = await am.runNow("a1");
  assert.equal(r.ok, false);
  assert.match(r.error, /模型挂了/);
});

test("无收件人时失败", async () => {
  const cfgPath = join(dir(), "config.json");
  writeFileSync(cfgPath, JSON.stringify({ alerts: [{ id: "a1", name: "日报", instruction: "x", time: "09:00", recipients: [], enabled: true }] }));
  const am = await mk(cfgPath);
  const r = await am.runNow("a1");
  assert.equal(r.ok, false);
});

test("saveSmtp 保留已有 pass，空 pass 不覆盖", async () => {
  const cfgPath = join(dir(), "config.json");
  writeFileSync(cfgPath, "{}");
  const am = await mk(cfgPath);
  await am.saveSmtp({ host: "s", user: "u", pass: "p1", from: "f" });
  await am.saveSmtp({ host: "s2" });
  const st = await am.smtp();
  assert.equal(st.pass, "p1");
  assert.equal(st.host, "s2");
});
test("未配置 SMTP 且无 sendmail 时给出明确错误", async () => {
  const cfgPath = join(dir(), "config.json");
  writeFileSync(cfgPath, JSON.stringify({ alerts: [{ id: "a1", name: "日报", instruction: "x", time: "09:00", recipients: ["a@x.com"], enabled: true }] }));
  const am = await mk(cfgPath, { exec: async () => ({ exitCode: 1, stdout: "", stderr: "" }) });
  const r = await am.runNow("a1");
  assert.equal(r.ok, false);
  assert.match(r.error, /未配置 SMTP/);
});
