import test from "node:test";
import assert from "node:assert/strict";
import { parseInstalledDpkg, parseAptPct } from "../src/web/server.js";

test("parseInstalledDpkg 全量输出识别已装包（含超出 50KB 截断点的包与多架构后缀）", () => {
  const lines = [];
  for (let i = 0; i < 1200; i++) lines.push(`install ok installed libdep${i}`);
  lines.push("install ok installed nginx");
  lines.push("install ok installed libssl1.1:amd64");
  lines.push("install ok installed redis-server");
  const out = parseInstalledDpkg(lines.join("\n"));
  assert.ok(out.has("nginx"), "末尾的 nginx 应被识别（修复前被 50KB 截断丢失）");
  assert.ok(out.has("libdep1199"), "末尾 libdep1199 应被识别");
  assert.ok(out.has("libssl1.1"), "多架构 :amd64 后缀应被剥离");
  assert.ok(out.has("redis-server"));
  assert.ok(!out.has("nginx:amd64"), "不保留带架构后缀的键");
  assert.equal(out.size, 1203);
});

test("parseInstalledDpkg 只统计 install ok installed 行", () => {
  const out = parseInstalledDpkg("install ok installed git\ninstall ok not-installed nginx\ndeinstall ok config-files curl\n");
  assert.ok(out.has("git"));
  assert.ok(!out.has("nginx"));
  assert.ok(!out.has("curl"));
});

test("parseAptPct 识别 STATUS / Progress 行，普通行返回 null", () => {
  assert.equal(parseAptPct("STATUS: 42"), 42);
  assert.equal(parseAptPct("STATUS: 100"), 100);
  assert.equal(parseAptPct("Progress: [ 37%]"), 37);
  assert.equal(parseAptPct("Selecting previously unselected package nginx."), null);
  assert.equal(parseAptPct(""), null);
});
