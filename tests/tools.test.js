import test from "node:test";
import assert from "node:assert/strict";
import { runCommand, readFile, applyFix, isWriteCommand } from "../src/tools.js";

test("isWriteCommand：识别写入/删除/修改类命令", () => {
  for (const c of [
    "rm -rf /tmp/x",
    "mv a b",
    "cp a b",
    "echo hi > /etc/f",
    "cat x >> y",
    "apt install nginx",
    "sed -i s/a/b/ f",
    "chmod 777 f",
    "chown root f",
    "systemctl restart nginx",
    "docker rm abc",
    "kill -9 1234",
    "mkdir -p /opt/x",
    "python3 -c 'open(\"/x\",\"w\")'",
  ]) assert.ok(isWriteCommand(c), `应识别为写入: ${c}`);

  for (const c of [
    "df -h",
    "ps aux",
    "ls -la",
    "cat /etc/nginx/nginx.conf",
    "curl http://x",
    "grep foo /var/log/a.log",
    "free -m",
  ]) assert.ok(!isWriteCommand(c), `不应识别为写入: ${c}`);
});

test("runCommand 返回标准输出", async () => {
  const r = await runCommand("printf hello");
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout.trim(), "hello");
});

test("runCommand 捕获非零退出码", async () => {
  const r = await runCommand("sh -c 'echo oops >&2; exit 3'");
  assert.equal(r.exitCode, 3);
  assert.match(r.stderr, /oops/);
});

test("readFile 读取成功与失败", async () => {
  const ok = await readFile("package.json");
  assert.equal(ok.error, null);
  assert.match(ok.content, /fixflow/);
  const bad = await readFile("/no/such/file");
  assert.ok(bad.error);
});

test("runCommand 支持 AbortSignal 中止", async () => {
  const ctrl = new AbortController();
  const p = runCommand("sleep 30", { signal: ctrl.signal });
  setTimeout(() => ctrl.abort(), 100);
  const r = await p;
  assert.equal(r.aborted, true);
});

test("applyFix：确认后执行，拒绝则不执行", async () => {
  const yes = await applyFix("printf fixed", async () => true);
  assert.equal(yes.confirmed, true);
  assert.equal(yes.stdout.trim(), "fixed");
  const no = await applyFix("printf bad", async () => false);
  assert.equal(no.confirmed, false);
  assert.equal(no.stdout, undefined);
});