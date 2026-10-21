import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aggregateMinute, createMonitorHistory } from "../src/monitor-history.js";

const dir = () => mkdtempSync(join(tmpdir(), "ff-mh-"));

test("aggregateMinute 按网卡平均速率、IO 合计平均、趋势取最后一条", () => {
  const net = [
    { t: 1, up: { eth0: 100, eth1: 200 }, down: { eth0: 10, eth1: 20 } },
    { t: 2, up: { eth0: 300, eth1: 400 }, down: { eth0: 30, eth1: 40 } },
  ];
  const io = [
    { t: 1, read: { sda: 100, sdb: 200 }, write: { sda: 10 } },
    { t: 2, read: { sda: 300, sdb: 400 }, write: { sda: 30 } },
  ];
  const trend = [
    { t: 1, cpu: 5, mem: 10, disk: 20 },
    { t: 2, cpu: 15, mem: 20, disk: 30 },
  ];
  assert.deepEqual(aggregateMinute(net, io, trend), {
    t: 2,
    up: { eth0: 200, eth1: 300 },
    down: { eth0: 20, eth1: 30 },
    read: 500,
    write: 20,
    cpu: 15,
    mem: 20,
    disk: 30,
  });
});

test("aggregateMinute 无样本返回 null", () => {
  assert.equal(aggregateMinute([], [], []), null);
});

test("createMonitorHistory 落盘并在重载时裁剪超 7 天的数据", async () => {
  const file = join(dir(), "monitor-history.jsonl");
  const now = Date.now();
  const old = { t: Math.floor(now / 1000) - 8 * 24 * 3600, up: {}, down: {}, read: 0, write: 0, cpu: 0, mem: 0, disk: 0 };
  const fresh = { t: Math.floor(now / 1000) - 60, up: { eth0: 1 }, down: { eth0: 2 }, read: 3, write: 4, cpu: 5, mem: 6, disk: 7 };
  writeFileSync(file, [old, fresh].map((r) => JSON.stringify(r)).join("\n") + "\n");

  const h = await createMonitorHistory({ filePath: file });
  assert.deepEqual(h.query(60).net, [{ t: fresh.t, up: { eth0: 1 }, down: { eth0: 2 } }]);
  const lines = readFileSync(file, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
});

test("createMonitorHistory.add 追加并可按分钟窗口查询", async () => {
  const file = join(dir(), "monitor-history.jsonl");
  const now = Math.floor(Date.now() / 1000);
  const h = await createMonitorHistory({ filePath: file });
  await h.add({ t: now - 120, up: { eth0: 10 }, down: { eth0: 20 }, read: 30, write: 40, cpu: 1, mem: 2, disk: 3 });
  await h.add({ t: now - 30, up: { eth0: 11 }, down: { eth0: 21 }, read: 31, write: 41, cpu: 4, mem: 5, disk: 6 });

  const q = h.query(1);
  assert.deepEqual(q.net, [{ t: now - 30, up: { eth0: 11 }, down: { eth0: 21 } }]);
  assert.deepEqual(q.io, [{ t: now - 30, read: { all: 31 }, write: { all: 41 } }]);
  assert.deepEqual(q.trend, [{ t: now - 30, cpu: 4, mem: 5, disk: 6 }]);
  assert.equal(h.query(3).net.length, 2);
});
