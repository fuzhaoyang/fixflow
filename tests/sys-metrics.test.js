import test from "node:test";
import assert from "node:assert/strict";
import { parseSshRisk, parseWho, parseLast } from "../src/metrics.js";

test("parseSshRisk 标记 root 登录与空密码风险", () => {
  const r = parseSshRisk("PermitRootLogin yes\nPasswordAuthentication yes\nPermitEmptyPasswords no\n", ["guest"]);
  const by = (n) => r.items.find((i) => i.name === n);
  assert.equal(by("PermitRootLogin").ok, false);
  assert.equal(by("PasswordAuthentication").ok, false);
  assert.equal(by("PermitEmptyPasswords").ok, true);
  assert.equal(by("空密码账户").ok, false);
});

test("parseSshRisk 取最后一个匹配（drop-in 覆盖主配置）", () => {
  const r = parseSshRisk("PermitRootLogin yes\nPermitRootLogin prohibit-password\n");
  assert.equal(r.items.find((i) => i.name === "PermitRootLogin").ok, true);
});

test("parseWho 归一化空白并限制条数", () => {
  const r = parseWho("admin   pts/0   2026-10-08 10:00 (10.0.0.2)\nroot  tty1  2026-10-08 09:00\n");
  assert.equal(r.length, 2);
  assert.equal(r[0], "admin pts/0 2026-10-08 10:00 (10.0.0.2)");
});

test("parseLast 过滤空行与 btmp/wtmp 头", () => {
  const r = parseLast("admin pts/0 10.0.0.2 Wed Oct 8 10:00 - still logged in\n\nwtmp begins Wed Oct 1 00:00\n");
  assert.deepEqual(r, ["admin pts/0 10.0.0.2 Wed Oct 8 10:00 - still logged in"]);
});
