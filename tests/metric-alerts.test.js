import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMetricAlerts, sampleMetrics, metricLabel } from "../src/metric-alerts.js";

const dir = () => mkdtempSync(join(tmpdir(), "ff-ma-"));

function fakeMonitor(values) {
  return { cpu: () => values.cpu, net: () => ({ samples: [{ up: { eth0: values.netBps / 2 }, down: { eth0: values.netBps / 2 } }] }) };
}

async function mk(cfgPath, values, nowRef) {
  const notified = [];
  const m = await createMetricAlerts({
    config: { baseUrl: "https://x", apiKey: "k", model: "m", metricAlerts: [], alertSmtp: { host: "h", from: "f@x.com" }, sslAlerts: { webhook: "" } },
    configPath: cfgPath,
    monitor: fakeMonitor(values),
    exec: async (cmd) => {
      if (cmd.includes("free")) return { exitCode: 0, stdout: "Mem: 16000 9000 7000 0 1000 6000", stderr: "" };
      if (cmd.includes("df")) return { exitCode: 0, stdout: "Filesystem Size Used Avail Use% Mounted on\n/dev/sda1 100G 90G 10G 90% /", stderr: "" };
      if (cmd.includes("ss -s")) return { exitCode: 0, stdout: "Total: 500\nTCP:   1234 (estab 10, closed 5)", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    },
    now: () => new Date(nowRef.t),
    onNotify: (e) => notified.push(e),
  });
  m._notified = notified;
  return m;
}

test("metricLabel 名称", () => {
  assert.equal(metricLabel("cpu"), "CPU使用率");
  assert.equal(metricLabel("sessions"), "TCP会话数");
});

test("sampleMetrics 解析", async () => {
  const s = await sampleMetrics({ monitor: fakeMonitor({ cpu: 42, netBps: 1250000 }), run: async (cmd) => {
    if (cmd.includes("free")) return { stdout: "Mem: 16000 8000 8000 0 2000 6000" };
    if (cmd.includes("df")) return { stdout: "Filesystem Size Used Avail Use% Mounted on\n/dev/sda1 100G 90G 10G 90% /" };
    if (cmd.includes("ss -s")) return { stdout: "TCP:   1234 (estab 10)" };
    return { stdout: "" };
  } });
  assert.equal(s.cpu, 42);
  assert.equal(s.disk, 90);
  assert.equal(s.sessions, 1234);
  assert.ok(s.net > 0);
});

test("持续未达时长不触发，达到后触发一次", async () => {
  const cfgPath = join(dir(), "config.json");
  writeFileSync(cfgPath, JSON.stringify({ metricAlerts: [{ id: "m1", name: "CPU", metric: "cpu", op: ">=", threshold: 80, duration: 2, level: 1, recipients: ["a@x.com"], enabled: true }] }));
  const nowRef = { t: new Date("2026-09-24T10:00:00").getTime() };
  const m = await mk(cfgPath, { cpu: 95, netBps: 0 }, nowRef);
  await m.tick();
  nowRef.t += 60 * 1000; await m.tick();
  assert.equal(m._notified.length, 0);
  nowRef.t += 60 * 1000; await m.tick();
  assert.equal(m._notified.filter((e) => e.kind === "firing").length, 1);
  nowRef.t += 60 * 1000; await m.tick();
  assert.equal(m._notified.filter((e) => e.kind === "firing").length, 1);
});

test("回落触发恢复", async () => {
  const cfgPath = join(dir(), "config.json");
  writeFileSync(cfgPath, JSON.stringify({ metricAlerts: [{ id: "m1", name: "CPU", metric: "cpu", op: ">=", threshold: 80, duration: 1, level: 1, recipients: ["a@x.com"], enabled: true }] }));
  const nowRef = { t: new Date("2026-09-24T10:00:00").getTime() };
  const values = { cpu: 95, netBps: 0 };
  const m = await mk(cfgPath, values, nowRef);
  await m.tick();
  nowRef.t += 60 * 1000; await m.tick();
  assert.equal(m._notified.filter((e) => e.kind === "firing").length, 1);
  values.cpu = 30;
  nowRef.t += 60 * 1000; await m.tick();
  assert.equal(m._notified.filter((e) => e.kind === "recovery").length, 1);
});