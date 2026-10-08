import test from "node:test";
import assert from "node:assert/strict";
import { openFirewallPort, isRoot, verifySudo, sudoCmd, runPrivileged } from "../src/firewall.js";

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

test("firewalld 按活动区域放行端口（含 docker 区域）", async () => {
  const calls = [];
  const run = async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("command -v ufw")) return { exitCode: 1, stdout: "" };
    if (cmd.includes("command -v firewall-cmd")) return { exitCode: 0, stdout: "/usr/bin/firewall-cmd\n" };
    if (cmd.includes("firewall-cmd --state")) return { exitCode: 0, stdout: "running\n" };
    if (cmd.includes("--get-active-zones")) return { exitCode: 0, stdout: "docker\n  interfaces: eth0\n" };
    if (cmd.includes("--add-port")) return { exitCode: 0, stdout: "success" };
    if (cmd.includes("--reload")) return { exitCode: 0, stdout: "success" };
    return { exitCode: 1, stdout: "" };
  };
  const r = await openFirewallPort(1234, { getuid: () => 0, run });
  assert.equal(r.ok, true);
  assert.match(r.method, /firewalld/);
  assert.ok(calls.some((c) => c.includes("--zone=docker --add-port=1234/tcp --permanent")));
});

test("无防火墙时返回未放行", async () => {
  const run = async () => ({ exitCode: 1, stdout: "" });
  const r = await openFirewallPort(1234, { getuid: () => 0, run });
  assert.equal(r.ok, false);
  assert.match(r.reason, /未检测到/);
});

test("verifySudo root 进程用 su 校验，非 root 用 sudo -S", async () => {
  const calls = [];
  const run = async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: "" }; };
  assert.equal(await verifySudo("pw", { run, getuid: () => 0 }), true);
  assert.equal(await verifySudo("", { run, getuid: () => 0 }), false);
  assert.ok(calls.some((c) => c.includes("su -c true root")));
  calls.length = 0;
  assert.equal(await verifySudo("pw", { run, getuid: () => 1000 }), true);
  assert.ok(calls.some((c) => c.includes("sudo -S -p '' true")));
});

test("verifySudo 非 root 走 sudo 校验", async () => {
  let calls = [];
  const run = async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: "" }; };
  assert.equal(await verifySudo("pw", { run, getuid: () => 1000 }), true);
  assert.ok(calls.some((c) => c.includes("sudo -S -p '' true")));
  calls = [];
  const failRun = async () => ({ exitCode: 1, stdout: "" });
  assert.equal(await verifySudo("bad", { run: failRun, getuid: () => 1000 }), false);
});

test("sudoCmd root 直跑，非 root 包装 sudo -S", () => {
  assert.equal(sudoCmd("ufw allow 22/tcp", "pw", () => 0), "ufw allow 22/tcp");
  assert.equal(isRoot(() => 0), true);
  assert.equal(isRoot(() => 1000), false);
  assert.match(sudoCmd('ufw allow "8080"/tcp', "pw", () => 1000), /^echo "pw" \| sudo -S -p '' bash -c "ufw allow \\"8080\\"\/tcp"/);
});

test("runPrivileged 传递提权命令并带超时", async () => {
  let seenCmd = null, seenTimeout = null;
  const run = async (cmd, opts) => { seenCmd = cmd; seenTimeout = opts?.timeout; return { exitCode: 0, stdout: "ok", stderr: "" }; };
  const r = await runPrivileged("ufw deny 8080/tcp", "pw", { run, getuid: () => 1000 });
  assert.equal(r.exitCode, 0);
  assert.ok(seenCmd.includes("sudo"));
  assert.equal(seenTimeout, 15000);
});
