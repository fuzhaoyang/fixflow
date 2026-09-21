import test from "node:test";
import assert from "node:assert/strict";
import { readNetDev, readDiskstats, readProcStat, calcCpuUsage, createMonitor } from "../src/net.js";

test("readNetDev 解析 /proc/net/dev 输出", async () => {
  const nics = await readNetDev();
  assert.ok(Object.keys(nics).length > 0);
  for (const [name, v] of Object.entries(nics)) {
    assert.match(name, /^[\w@.-]+$/);
    assert.equal(typeof v.rxBytes, "number");
    assert.equal(typeof v.txBytes, "number");
    assert.ok(v.rxBytes >= 0);
    assert.ok(v.txBytes >= 0);
  }
});

test("readDiskstats 解析 /proc/diskstats 输出", async () => {
  const disks = await readDiskstats();
  assert.ok(Object.keys(disks).length > 0);
  for (const [name, v] of Object.entries(disks)) {
    assert.equal(typeof v.reads, "number");
    assert.equal(typeof v.readSectors, "number");
    assert.equal(typeof v.readMs, "number");
    assert.equal(typeof v.writes, "number");
    assert.equal(typeof v.writeSectors, "number");
    assert.equal(typeof v.writeMs, "number");
  }
});

test("readProcStat 解析 CPU 行", async () => {
  const s = await readProcStat();
  assert.ok(s.total > 0);
  assert.ok(s.idle >= 0);
  assert.ok(s.idle <= s.total);
});

test("calcCpuUsage 两次采样计算使用率", () => {
  const prev = { idle: 100, total: 1000 };
  const next = { idle: 150, total: 1250 };
  const usage = calcCpuUsage(prev, next);
  assert.equal(usage, 80);
});

test("calcCpuUsage 无 prev 返回 0", () => {
  assert.equal(calcCpuUsage(null, { idle: 0, total: 100 }), 0);
});

test("calcCpuUsage idle 不增则 100%", () => {
  const prev = { idle: 100, total: 1000 };
  const next = { idle: 100, total: 1100 };
  assert.equal(calcCpuUsage(prev, next), 100);
});

test("calcCpuUsage 结果封顶 100", () => {
  const prev = { idle: 1000, total: 1000 };
  const next = { idle: 100, total: 1010 };
  assert.ok(calcCpuUsage(prev, next) <= 100);
});

test("createMonitor tick 两次产生 net/io 采样", async () => {
  const m = createMonitor();
  await m.tick();
  await new Promise((r) => setTimeout(r, 30));
  await m.tick();
  assert.equal(m.net().samples.length, 1);
  assert.equal(m.io().samples.length, 1);
  assert.equal(typeof m.cpu(), "number");
});

test("createMonitor 采样包含时间戳", async () => {
  const m = createMonitor();
  await m.tick();
  await new Promise((r) => setTimeout(r, 30));
  await m.tick();
  const s = m.net().samples[0];
  assert.equal(typeof s.t, "number");
});

test("io 采样包含 iops 与 latency 字段", async () => {
  const m = createMonitor();
  await m.tick();
  await new Promise((r) => setTimeout(r, 30));
  await m.tick();
  const s = m.io().samples[0];
  assert.equal(typeof s.iops, "number");
  assert.equal(typeof s.latency, "number");
  assert.ok(s.iops >= 0);
});

test("createMonitor 采样最多保留 300 条", async () => {
  const m = createMonitor();
  await m.tick();
  for (let i = 0; i < 305; i++) {
    await m.tick();
  }
  assert.ok(m.net().samples.length <= 300);
});