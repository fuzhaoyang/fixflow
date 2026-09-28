import test from "node:test";
import assert from "node:assert/strict";
import { openFirewallPort } from "../src/firewall.js";

test("非 root 跳过", async () => {
  let called = false;
  const r = await openFirewallPort(1234, { getuid: () => 1000, run: async () => { called = true; return { exitCode: 0, stdout: "" }; } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /非 root/);
  assert.equal(called, false);
});

test("ufw 存在时放行端口", async () => {
  const calls = [];
  const run = async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("command -v ufw")) return { exitCode: 0, stdout: "/usr/sbin/ufw\n" };
    if (cmd.startsWith("ufw allow")) return { exitCode: 0, stdout: "Rule added" };
    return { exitCode: 1, stdout: "" };
  };
  const r = await openFirewallPort(1234, { getuid: () => 0, run });
  assert.equal(r.ok, true);
  assert.equal(r.method, "ufw");
  assert.ok(calls.some((c) => c === "ufw allow 1234/tcp"));
});

test("firewalld 运行时放行端口", async () => {
  const calls = [];
  const run = async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("command -v ufw")) return { exitCode: 1, stdout: "" };
    if (cmd.includes("command -v firewall-cmd")) return { exitCode: 0, stdout: "/usr/bin/firewall-cmd\n" };
    if (cmd.includes("firewall-cmd --state")) return { exitCode: 0, stdout: "running\n" };
    if (cmd.includes("--add-port")) return { exitCode: 0, stdout: "success" };
    return { exitCode: 1, stdout: "" };
  };
  const r = await openFirewallPort(1234, { getuid: () => 0, run });
  assert.equal(r.ok, true);
  assert.equal(r.method, "firewalld");
  assert.ok(calls.some((c) => c.includes("--permanent --add-port=1234/tcp")));
});

test("无防火墙时返回未放行", async () => {
  const run = async () => ({ exitCode: 1, stdout: "" });
  const r = await openFirewallPort(1234, { getuid: () => 0, run });
  assert.equal(r.ok, false);
  assert.match(r.reason, /未检测到/);
});
