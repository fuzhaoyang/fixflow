import test from "node:test";
import assert from "node:assert/strict";
import { parseDf, parseDfInodes, parseFree, parseLoad, assessHealth, isRealDisk, realDisks } from "../src/health.js";

const DF = `Filesystem 1K-blocks Used Available Use% Mounted on
/dev/sda1 50000000 45000000 5000000 90% /
/dev/sda2 10000000 2000000 8000000 20% /data
tmpfs 1600000 0 1600000 0% /run
overlay 5000000 1000 4999000 1% /var/lib/docker/overlay2/abc`;

const FREE = `              total        used        free      shared  buff/cache   available
Mem:       16000000     10000000     2000000      100000     4000000     5000000
Swap:       2000000       500000     1500000`;

test("parseDf 解析完整磁盘字段", () => {
  const r = parseDf(DF);
  assert.deepEqual(r[0], { fs: "/dev/sda1", size: "50000000", used: "45000000", avail: "5000000", mount: "/", usedPct: 90 });
  assert.equal(r.length, 4);
});

test("realDisks 过滤虚拟挂载点", () => {
  const r = realDisks(parseDf(DF));
  assert.deepEqual(r.map((d) => d.mount), ["/", "/data"]);
  assert.equal(isRealDisk({ fs: "tmpfs", mount: "/run" }), false);
  assert.equal(isRealDisk({ fs: "/dev/sda1", mount: "/" }), true);
});

test("parseDfInodes 解析 inode 使用率", () => {
  const r = parseDfInodes(`Filesystem Inodes IUsed IFree IUse% Mounted on
/dev/sda1 3276800 100000 3176800 4% /`);
  assert.deepEqual(r, [{ fs: "/dev/sda1", mount: "/", usedPct: 4 }]);
});

test("parseFree 排除 buffer/cache 计算 usedPct 并解析 swap", () => {
  const r = parseFree(FREE);
  assert.equal(Math.round(r.usedPct), 38);
  assert.equal(r.swapUsedPct, 25);
  assert.equal(r.swapTotal, 2000000);
});

test("parseFree 兼容中文 locale 的 free 输出", () => {
  const r = parseFree(`              total        used        free      shared  buff/cache   available
内存：       16000000    10000000     2000000      100000    4000000     5000000
交换：       2000000      500000     1500000`);
  assert.equal(Math.round(r.usedPct), 38);
  assert.equal(r.swapUsedPct, 25);
  assert.equal(r.swapTotal, 2000000);
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

test("assessHealth 增加 swap 与 inode 检查项", () => {
  const r = assessHealth({ df: [], free: 10, load: 0, cpuCount: 8, swap: 95, inodes: [{ mount: "/", usedPct: 85 }] });
  const swap = r.items.find((i) => i.name === "Swap");
  assert.equal(swap.status, "bad");
  const inode = r.items.find((i) => i.name.startsWith("inode"));
  assert.equal(inode.status, "warn");
});

test("parseLoad 解析 uptime 输出的 load average", () => {
  const r = parseLoad(" 09:53:13 up 18:45,  1 user,  load average: 2.38, 1.93, 1.57\n");
  assert.equal(r.load, 2.38);
  assert.equal(r.load1, 2.38);
  assert.equal(r.load5, 1.93);
  assert.equal(r.load15, 1.57);
});

test("parseLoad 兼容 loadavg 行首格式", () => {
  const r = parseLoad("2.38 1.93 1.57 3/512 12345");
  assert.equal(r.load, 2.38);
  assert.equal(r.load1, 2.38);
  assert.equal(r.load5, 2.38);
  assert.equal(r.load15, 2.38);
});

test("parseLoad 空输出返回 0", () => {
  assert.equal(parseLoad("").load, 0);
});
