import test from "node:test";
import assert from "node:assert/strict";
import { parseDf, parseFree, assessHealth } from "../src/health.js";

const DF = `Filesystem 1K-blocks Used Available Use% Mounted on
/dev/sda1 50000000 45000000 5000000 90% /
/dev/sda2 10000000 2000000 8000000 20% /data`;

const FREE = `              total        used        free      shared  buff/cache   available
Mem:       16000000     10000000     2000000      100000     4000000     5000000`;

test("parseDf 解析挂载点使用率", () => {
  const r = parseDf(DF);
  assert.deepEqual(r, [{ mount: "/", usedPct: 90 }, { mount: "/data", usedPct: 20 }]);
});

test("parseFree 排除 buffer/cache 计算 usedPct", () => {
  const r = parseFree(FREE);
  assert.equal(Math.round(r.usedPct), 38);
});

test("assessHealth 分级与建议", () => {
  const r = assessHealth({ df: [{ mount: "/", usedPct: 91 }, { mount: "/data", usedPct: 20 }], free: 82, load: 3, cpuCount: 8 });
  const disk = r.items.find((i) => i.name.includes("/"));
  assert.equal(disk.status, "bad");
  assert.match(disk.advice, /91/);
  const mem = r.items.find((i) => i.name === "内存");
  assert.equal(mem.status, "warn");
  assert.ok(r.risks.length >= 2);
});
