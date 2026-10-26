import test from "node:test";
import assert from "node:assert/strict";
import { openFirewallPort, isRoot, verifySudo, verifyAdminPassword, sudoCmd, runPrivileged, aclTargetRules, syncAclRules } from "../src/firewall.js";

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

test("aclTargetRules 按黑名单→白名单→兜底排序", () => {
  assert.deepEqual(aclTargetRules({ blacklist: [], whitelist: [] }, 8080), ["allow 8080/tcp"]);
  assert.deepEqual(aclTargetRules({ blacklist: [], whitelist: [{ ip: "1.2.3.4" }] }, 8080), [
    "allow from 1.2.3.4 to any port 8080 proto tcp",
    "deny 8080/tcp",
  ]);
  assert.deepEqual(aclTargetRules({ blacklist: [{ ip: "9.9.9.9" }], whitelist: [{ ip: "1.2.3.4" }] }, 8080), [
    "deny from 9.9.9.9 to any port 8080 proto tcp",
    "allow from 1.2.3.4 to any port 8080 proto tcp",
    "deny 8080/tcp",
  ]);
});

test("syncAclRules ufw 未启用返回错误", async () => {
  const run = async () => ({ exitCode: 0, stdout: "Status: inactive\n", stderr: "" });
  const r = await syncAclRules({ blacklist: [], whitelist: [] }, [8080], "pw", { run, getuid: () => 0 });
  assert.equal(r.ok, false);
  assert.match(r.error, /UFW 未启用/);
});

test("syncAclRules 清掉旧规则后按目标顺序插入", async () => {
  const calls = [];
  const numbered = `Status: active\n\nTo                         Action      From\n--                         ------      ----\n[ 1] 8080/tcp                 ALLOW IN    Anywhere\n[ 2] 8080/tcp                 DENY IN     9.9.9.9\n[ 3] 22/tcp                   ALLOW IN    Anywhere\n`;
  const run = async (cmd) => {
    calls.push(cmd);
    if (cmd.includes("ufw status numbered")) return { exitCode: 0, stdout: numbered, stderr: "" };
    if (cmd.includes("ufw status 2>/dev/null")) return { exitCode: 0, stdout: "Status: active\n", stderr: "" };
    return { exitCode: 0, stdout: "ok", stderr: "" };
  };
  const acl = { blacklist: [{ ip: "9.9.9.9" }], whitelist: [{ ip: "1.2.3.4" }] };
  const r = await syncAclRules(acl, [8080], "pw", { run, getuid: () => 0 });
  assert.equal(r.ok, true);
  const delCalls = calls.filter((c) => c.includes("ufw delete"));
  assert.deepEqual(delCalls, ["ufw delete 2", "ufw delete 1"]);
  const insCalls = calls.filter((c) => c.includes("ufw insert 1"));
  assert.deepEqual(insCalls, [
    "ufw insert 1 deny 8080/tcp",
    "ufw insert 1 allow from 1.2.3.4 to any port 8080 proto tcp",
    "ufw insert 1 deny from 9.9.9.9 to any port 8080 proto tcp",
  ]);
});

test("verifyAdminPassword root 进程降权校验管理员 sudo 密码", async () => {
  const calls = [];
  const run = async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: "" }; };
  assert.equal(await verifyAdminPassword("pw", { run, getuid: () => 0, user: "admin" }), true);
  assert.ok(calls.some((c) => c.includes("runuser -u 'admin' -- sudo -S -p '' true")));
  assert.equal(await verifyAdminPassword("", { run, getuid: () => 0, user: "admin" }), false);
  calls.length = 0;
  assert.equal(await verifyAdminPassword("pw", { run, getuid: () => 1000 }), true);
  assert.ok(calls.some((c) => c.includes("sudo -S -p '' true")));
});
