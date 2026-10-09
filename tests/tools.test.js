import test from "node:test";
import assert from "node:assert/strict";
import { runCommand, readFile, applyFix, isWriteCommand, redactSecrets } from "../src/tools.js";

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

test("isWriteCommand：只读诊断命令（含 2>/dev/null、docker 只读）放行", () => {
  for (const c of [
    "du -xh -d1 / 2>/dev/null | sort -rh | head -20",
    "ls -lh /var/log 2>/dev/null | head -30",
    "journalctl --disk-usage 2>/dev/null",
    "find / -xdev -type f -size +100M 2>/dev/null | head -30",
    "docker system df 2>/dev/null",
    "docker ps 2>/dev/null",
    "ls -lh /var/lib/docker 2>/dev/null",
    "ls -lSh /var/lib/dnf 2>/dev/null | head",
    "du -sh /var/log 2>/dev/null; du -sh /var/lib 2>/dev/null",
    "df -h", "free -m",
  ]) assert.ok(!isWriteCommand(c), `只读命令被误判: ${c}`);
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

test("runCommand 并发受信号量限制且全部完成", async () => {
  const jobs = Array.from({ length: 20 }, () => runCommand("sleep 0.15"));
  const rs = await Promise.all(jobs);
  assert.equal(rs.length, 20);
  for (const r of rs) assert.equal(r.exitCode, 0);
});

test("applyFix：非 root 环境拒绝执行（沙箱限制）", async () => {
  let asked = false;
  const r = await applyFix({ command: "touch /tmp/x", reason: "测试" }, async () => { asked = true; return true; });
  assert.equal(r.confirmed, false);
  assert.equal(r.blocked, true);
  assert.equal(asked, false);
});

test("applyFix：危险命令被拦截且不询问", async () => {
  let asked = false;
  const r = await applyFix({ command: "rm -rf /", reason: "t" }, async () => { asked = true; return true; });
  assert.equal(r.blocked, true);
  assert.equal(asked, false);
});

test("redactSecrets：脱敏各类敏感凭证", () => {
  assert.equal(redactSecrets("key sk-abcdef1234567890 end"), "key ****** end");
  assert.equal(redactSecrets("Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234567890"), "Authorization: ******");
  assert.equal(redactSecrets("password=supersecretvalue"), "******");
  assert.equal(redactSecrets("-----BEGIN RSA PRIVATE KEY-----\nABC\n-----END RSA PRIVATE KEY-----"), "******");
  assert.equal(redactSecrets("普通文本没有密钥"), "普通文本没有密钥");
});

test("runCommand 输出自动脱敏敏感凭证", async () => {
  const r = await runCommand("printf 'sk-abcdef1234567890 secret'");
  assert.ok(!r.stdout.includes("sk-abcdef1234567890"));
  assert.match(r.stdout, /\*\*\*\*\*\*/);
});

test("runCommand 支持 env 注入且不回显到命令串", async () => {
  const r = await runCommand('echo "$DB_PASS"', { env: { DB_PASS: "s3cret!" } });
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /s3cret!/);
});
test("runCommand 支持 maxOutput 提高截断上限", async () => {
  const small = await runCommand("yes aaaa | head -c 100000");
  assert.equal(small.exitCode, 1);
  const big = await runCommand("yes aaaa | head -c 100000", { maxOutput: 256 * 1024 });
  assert.equal(big.exitCode, 0);
  assert.ok(big.stdout.length >= 100000);
});
