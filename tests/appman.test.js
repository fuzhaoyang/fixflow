import test from "node:test";
import assert from "node:assert/strict";
import { parseNginxStatus } from "../src/web/server.js";
import { parseAptPolicy } from "../src/pkgs.js";

test("parseNginxStatus 解析 stub_status 输出", () => {
  const out = parseNginxStatus("Active connections: 291 \nserver accepts handled requests\n 16630948 16630948 31070465 \nReading: 6 Writing: 179 Waiting: 106 ");
  assert.deepEqual(out, { active: 291, accepts: 16630948, handled: 16630948, requests: 31070465, reading: 6, writing: 179, waiting: 106 });
});

test("parseNginxStatus 空/损坏输入不报错", () => {
  assert.deepEqual(parseNginxStatus(""), {});
  assert.deepEqual(parseNginxStatus("garbage"), {});
  assert.deepEqual(parseNginxStatus("Active connections: 5\n"), { active: 5 });
});

test("parseAptPolicy 解析 LC_ALL=C 输出", () => {
  const text = "nginx:\n  Installed: 1.26.3-3+deb13u6\n  Candidate: 1.26.3-3+deb13u6\n  Version table:\n *** 1.26.3-3+deb13u6 500\n        500 https://a/main amd64 Packages\n        100 /usr/lib/dpkg/var/status\n";
  const out = parseAptPolicy(text);
  assert.equal(out.installed, "1.26.3-3+deb13u6");
  assert.equal(out.candidate, "1.26.3-3+deb13u6");
  assert.equal(out.versions.length, 1);
  assert.equal(out.versions[0].version, "1.26.3-3+deb13u6");
  assert.equal(out.versions[0].priority, 500);
  assert.equal(out.versions[0].isInstalled, true);
});

test("parseAptPolicy 未安装 + 多版本", () => {
  const text = "nginx:\n  Installed: (none)\n  Candidate: 1.25.0\n  Version table:\n     1.26.0 500\n     1.25.0 500\n";
  const out = parseAptPolicy(text);
  assert.equal(out.installed, null);
  assert.equal(out.candidate, "1.25.0");
  assert.deepEqual(out.versions, [
    { version: "1.26.0", priority: 500, isInstalled: false },
    { version: "1.25.0", priority: 500, isInstalled: false },
  ]);
});
