import test from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { runCommand, readFile, applyFix, isWriteCommand, isDangerousCommand, redactSecrets } from "../src/tools.js";
import { createSession } from "../src/core.js";

const MAX_OUTPUT = 50 * 1024;

// ============ 1. run_command 基础执行（20 条） ============
const RUN_BASIC = [
  ["printf 输出", "printf hello", (r) => { assert.equal(r.exitCode, 0); assert.equal(r.stdout.trim(), "hello"); }],
  ["echo 带空格", "echo a b c", (r) => assert.equal(r.stdout.trim(), "a b c")],
  ["多行输出", "printf 'a\\nb\\nc'", (r) => assert.equal(r.stdout, "a\nb\nc")],
  ["true 退出码 0", "true", (r) => assert.equal(r.exitCode, 0)],
  ["false 退出码 1", "false", (r) => assert.equal(r.exitCode, 1)],
  ["显式退出码 3", "sh -c 'exit 3'", (r) => assert.equal(r.exitCode, 3)],
  ["仅 stderr", "sh -c 'echo oops >&2'", (r) => { assert.match(r.stderr, /oops/); assert.equal(r.stdout, ""); }],
  ["stdout+stderr 并存", "sh -c 'echo out; echo err >&2'", (r) => { assert.match(r.stdout, /out/); assert.match(r.stderr, /err/); }],
  ["空输出", "printf ''", (r) => { assert.equal(r.stdout, ""); assert.equal(r.exitCode, 0); }],
  ["命令不存在 exit 127", "no_such_cmd_xyz", (r) => { assert.equal(r.exitCode, 127); }],
  ["ls / 成功", "ls /", (r) => { assert.equal(r.exitCode, 0); assert.ok(r.stdout.length > 0); }],
  ["cat 系统文件", "cat /etc/hostname", (r) => assert.equal(r.exitCode, 0)],
  ["中文输出", "printf '中文测试'", (r) => assert.match(r.stdout, /中文/)],
  ["算术求值", "echo $((2+3))", (r) => assert.equal(r.stdout.trim(), "5")],
  ["date 数字输出", "date +%s", (r) => assert.match(r.stdout.trim(), /^\d+$/)],
  ["中等长度输出", "seq 1 100", (r) => assert.equal(r.stdout.trim().split("\n").length, 100)],
  ["shell 内联拼接", "printf 'x'; printf 'y'", (r) => assert.equal(r.stdout, "xy")],
  ["/dev/zero 截取计数", "head -c 100 /dev/zero | wc -c", (r) => assert.equal(r.stdout.trim(), "100")],
  ["环境变量展开", "echo $HOME", (r) => assert.ok(r.stdout.trim().startsWith("/"))],
  ["引号内特殊字符", "printf '%s' 'a;b|c&d'", (r) => assert.equal(r.stdout, "a;b|c&d")],
];

// ============ 2. redactSecrets 脱敏（20 条） ============
const REDACT = [
  ["OpenAI sk-", "sk-abcdef1234567890", "******"],
  ["sk 超过 16 位", "sk-1234567890abcdefghij", "******"],
  ["AWS AKIA", "AKIAIOSFODNN7EXAMPLE", "******"],
  ["Google AIza（35 位）", "AIzaSyD12345678901234567890123456789012", "******"],
  ["RSA 私钥", "-----BEGIN RSA PRIVATE KEY-----\nABC\n-----END RSA PRIVATE KEY-----", "******"],
  ["EC 私钥", "-----BEGIN EC PRIVATE KEY-----\nXYZ\n-----END EC PRIVATE KEY-----", "******"],
  ["OPENSSH 私钥", "-----BEGIN OPENSSH PRIVATE KEY-----\nQWE\n-----END OPENSSH PRIVATE KEY-----", "******"],
  ["Bearer 令牌", "Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234", "Authorization: ******"],
  ["password= 赋值", "password=supersecretvalue", "******"],
  ["passwd: 冒号", "passwd: mypass123", "******"],
  ["secret= 赋值", "secret: hunter2secret", "******"],
  ["token= 赋值", "token=abcd1234efgh5678", "******"],
  ["api_key= 赋值", "api_key=kv_abcd1234", "******"],
  ["大小写混合", "Password=MixedCaseSecret", "******"],
  ["多模式混合", "sk-abcdef1234567890 Bearer xyzabc1234567890abcdefgh password=supersecret123", "****** ****** ******"],
  ["普通文本不变", "普通文本没有密钥", "普通文本没有密钥"],
  ["空字符串", "", ""],
  ["纯数字不变", "12345", "12345"],
  ["Api-Key 冒号形式", "Api-Key: abcd1234efgh5678", "******"],
  ["首尾带密钥", "start sk-abcdef1234567890 end", "start ****** end"],
];

// ============ 3. run_command 输出自动脱敏（10 条） ============
const RUN_REDACT = [
  ["sk- 输出", "printf 'sk-abcdef1234567890'", "sk-abcdef1234567890"],
  ["AKIA 输出", "printf 'AKIAIOSFODNN7EXAMPLE'", "AKIAIOSFODNN7EXAMPLE"],
  ["AIza 输出", "printf 'AIzaSyD12345678901234567890123456789012'", "AIzaSyD12345678901234567890123456789012"],
  ["私钥输出", "printf '-----BEGIN RSA PRIVATE KEY-----\\nA\\n-----END RSA PRIVATE KEY-----'", "-----BEGIN RSA PRIVATE KEY-----"],
  ["Bearer 输出", "printf 'Bearer abcdefghijklmnopqrstuvwxyz1234'", "abcdefghijklmnopqrstuvwxyz1234"],
  ["password 输出", "printf 'password=supersecretvalue'", "supersecretvalue"],
  ["token 输出", "printf 'token=abcd1234ef'", "abcd1234ef"],
  ["api_key 输出", "printf 'api_key=kv_abcd1234'", "kv_abcd1234"],
  ["混合输出", "printf 'sk-abcdef1234567890 Bearer abcdefghijklmnopqrstuvwxyz1234'", "sk-abcdef1234567890"],
  ["普通输出保持原样", "printf 'report: all ok'", "report: all ok"],
];

// ============ 4. 输出截断（5 条） ============
const TRUNCATE = [
  ["超长输出被截断到上限", "head -c 60000 /dev/zero | tr '\\0' 'a'", (r) => { assert.ok(r.stdout.length <= MAX_OUTPUT); assert.equal(r.exitCode, 1); }],
  ["恰好 51200 字节封顶", "head -c 60000 /dev/zero | tr '\\0' 'a'", (r) => { assert.ok(r.stdout.length <= MAX_OUTPUT); }],
  ["stderr 同样截断", "head -c 60000 /dev/zero | tr '\\0' 'a' 1>&2", (r) => { assert.ok(r.stderr.length <= MAX_OUTPUT); }],
  ["短输出完整保留", "printf ok", (r) => assert.equal(r.stdout.trim(), "ok")],
  ["边界长度不被截断", "head -c 51200 /dev/zero | tr '\\0' 'a'", (r) => assert.ok(r.stdout.length >= MAX_OUTPUT)],
];

// ============ 5. 中止 / 超时（5 条） ============
test("AbortSignal 中止后返回 aborted=true", async () => {
  const ctrl = new AbortController();
  const p = runCommand("sleep 30", { signal: ctrl.signal });
  setTimeout(() => ctrl.abort(), 100);
  const r = await p;
  assert.equal(r.aborted, true);
});
test("命令自带超时返回非零退出码", async () => {
  const r = await runCommand("sleep 5", { timeout: 300 });
  assert.equal(r.aborted, undefined);
  assert.notEqual(r.exitCode, 0);
});
test("已中止信号立即返回", async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  const r = await runCommand("sleep 30", { signal: ctrl.signal });
  assert.equal(r.aborted, true);
});
test("中止不阻塞后续命令", async () => {
  const ctrl = new AbortController();
  const p = runCommand("sleep 30", { signal: ctrl.signal });
  ctrl.abort();
  await p;
  const r2 = await runCommand("echo after");
  assert.equal(r2.stdout.trim(), "after");
});
test("短命令正常不受中止影响", async () => {
  const ctrl = new AbortController();
  const r = await runCommand("printf ok", { signal: ctrl.signal });
  assert.equal(r.stdout.trim(), "ok");
});

// ============ 6. isWriteCommand 写命令识别（40 条） ============
const WRITE_CMDS = [
  "rm -rf /tmp/x", "mv a b", "cp a b", "mkdir -p /opt/x", "rmdir /old",
  "touch /tmp/f", "truncate -s 0 /var/log/x", "sed -i s/a/b/ f",
  "chmod 777 f", "chown root f", "chgrp root f",
  "apt install nginx", "apt-get update", "yum install httpd", "dnf remove foo",
  "apk add curl", "pip install requests", "pip3 uninstall x", "npm install x",
  "gem install x", "composer install", "brew install x",
  "systemctl restart nginx", "systemctl stop nginx", "systemctl start nginx",
  "systemctl reload nginx", "service nginx restart", "service nginx start",
  "ufw allow 8080", "ufw deny 22", "ufw enable", "ufw delete allow 80",
  "iptables -A INPUT -j DROP", "iptables -I INPUT 1 -j ACCEPT", "iptables -D INPUT 1",
  "kill -9 1234", "pkill nginx", "killall chrome",
  "crontab -e", "tee /tmp/f", "dd if=/dev/zero of=/tmp/f",
];

// ============ 7. isWriteCommand 只读放行（40 条） ============
const WRITE_READONLY = [
  "df -h", "free -m", "ps aux", "ls -la", "cat /etc/nginx/nginx.conf",
  "curl http://example.com", "grep error /var/log/syslog", "ss -tulnp", "uptime",
  "nginx -t", "systemctl status nginx", "systemctl is-active nginx",
  "ufw status", "iptables -L -n", "journalctl -u nginx", "docker ps",
  "docker stats --no-stream", "docker logs nginx", "docker inspect nginx",
  "du -sh /var/log", "find / -name '*.log'", "tail -20 /var/log/syslog",
  "head -5 /etc/passwd", "getent hosts example.com", "ping -c 2 1.1.1.1",
  "docker system df", "docker network ls", "docker volume ls", "docker images",
  "vmstat 1 2", "uname -a", "hostname", "date", "whoami",
  "ps -eo pid,%cpu,%mem --no-headers", "docker ps -a --format '{{.Names}}'",
  "df -h 2>/dev/null", "ls -lh /var/log 2>/dev/null | head -30",
  "journalctl --disk-usage 2>/dev/null", "nginx -v 2>&1",
];

// ============ 9. isDangerousCommand（15 条） ============
const DANGEROUS = [
  ["rm -rf /", "rm -rf /", true],
  ["rm -fr /", "rm -fr /", true],
  ["带 sudo 的 rm", "sudo rm -rf /tmp/x", true],
  ["sudo 任意命令", "sudo apt update", true],
  ["chmod -R 777 /", "chmod -R 777 /", true],
  ["dd 写盘", "dd if=/dev/zero of=/dev/sda", true],
  ["mkfs 格式化", "mkfs.ext4 /dev/sdb", true],
  ["fdisk 分区", "fdisk /dev/sda", true],
  ["parted 分区", "parted /dev/sda", true],
  ["重定向到 /dev/null 不判危险", "echo x > /dev/null", false],
  ["普通写命令不危险", "rm -rf /tmp/x", false],
  ["ls / 不危险", "ls /", false],
  ["df -h 不危险", "df -h", false],
  ["cat 文件不危险", "cat /etc/hostname", false],
  ["普通 rm 单文件不危险", "rm /tmp/a", false],
];

// ============ 10. apply_fix 工具（12 条） ============
test("apply_fix 危险命令拦截且不询问", async () => {
  let asked = false;
  const r = await applyFix({ command: "rm -rf /", reason: "t", riskLevel: "high", impact: "x" }, async () => { asked = true; return true; });
  assert.equal(r.blocked, true);
  assert.equal(asked, false);
});
test("apply_fix 用户拒绝不执行", async () => {
  const r = await applyFix({ command: "touch /tmp/fx-reject-test", reason: "t", riskLevel: "low", impact: "x" }, async () => false);
  assert.equal(r.confirmed, false);
  assert.equal(r.blocked, undefined);
});
test("apply_fix 确认后沙箱执行成功", async () => {
  const r = await applyFix({ command: "echo hello-fix > /tmp/fx-e2e-test.txt", reason: "t", riskLevel: "low", impact: "x" }, async () => true);
  assert.equal(r.confirmed, true);
  assert.equal(r.exitCode, 0);
});
test("apply_fix 执行结果透出 stdout", async () => {
  const r = await applyFix({ command: "echo stdout-ok", reason: "t", riskLevel: "low", impact: "x" }, async () => true);
  assert.match(r.stdout, /stdout-ok/);
});
test("apply_fix 错误退出码透出", async () => {
  const r = await applyFix({ command: "exit 5", reason: "t", riskLevel: "low", impact: "x" }, async () => true);
  assert.equal(r.exitCode, 5);
});
test("apply_fix 输出脱敏", async () => {
  const r = await applyFix({ command: "echo password=supersecret", reason: "t", riskLevel: "low", impact: "x" }, async () => true);
  assert.ok(!r.stdout.includes("supersecret"));
});
test("apply_fix 确认回调收到风险参数", async () => {
  let got = null;
  await applyFix({ command: "echo x", reason: "因为测试", riskLevel: "high", impact: "影响全部" }, async (info) => { got = info; return false; });
  assert.equal(got.riskLevel, "high");
  assert.equal(got.reason, "因为测试");
  assert.equal(got.impact, "影响全部");
});
test("apply_fix 命令不存在返回 exit 127", async () => {
  const r = await applyFix({ command: "no_such_cmd_zzz", reason: "t", riskLevel: "low", impact: "x" }, async () => true);
  assert.equal(r.exitCode, 127);
});
test("apply_fix 沙箱内 mkdir", async () => {
  const r = await applyFix({ command: "mkdir -p /tmp/fixflow-mkdir-test", reason: "t", riskLevel: "low", impact: "x" }, async () => true);
  assert.equal(r.exitCode, 0);
});
test("apply_fix 两次顺序执行", async () => {
  const a = await applyFix({ command: "echo a > /tmp/fx-s1", reason: "t", riskLevel: "low", impact: "x" }, async () => true);
  const b = await applyFix({ command: "echo b > /tmp/fx-s2", reason: "t", riskLevel: "low", impact: "x" }, async () => true);
  assert.equal(a.exitCode, 0);
  assert.equal(b.exitCode, 0);
});
test("apply_fix stderr 传递", async () => {
  const r = await applyFix({ command: "sh -c 'echo boom >&2; exit 9'", reason: "t", riskLevel: "low", impact: "x" }, async () => true);
  assert.match(r.stderr, /boom/);
  assert.equal(r.exitCode, 9);
});
test("apply_fix 只读系统文件可读", async () => {
  const r = await applyFix({ command: "cat /etc/hostname", reason: "t", riskLevel: "low", impact: "x" }, async () => true);
  assert.equal(r.exitCode, 0);
});

// ============ 11. read_file 工具（20 条） ============
const READ_FILES = [
  ["读取 package.json", "package.json", (r) => { assert.equal(r.error, null); assert.match(r.content, /fixflow/); }],
  ["读取不存在文件", "/no/such/file/xyz", (r) => { assert.ok(r.error); }],
  ["读取目录报错", "/tmp", (r) => { assert.ok(r.error); }],
  ["读取 .gitignore", ".gitignore", (r) => { assert.equal(r.error, null); }],
  ["读 README", "README.md", (r) => { assert.equal(r.error, null); assert.match(r.content, /fixflow|Fixflow/); }],
  ["读系统文件", "/etc/hostname", (r) => { assert.equal(r.error, null); assert.ok(r.content.length > 0); }],
  ["读 /etc/passwd", "/etc/passwd", (r) => { assert.equal(r.error, null); assert.match(r.content, /root/); }],
  ["读 /proc/version", "/proc/version", (r) => { assert.equal(r.error, null); }],
  ["读二进制 /dev/null 不崩溃", "/dev/null", (r) => { assert.equal(r.content, ""); }],
  ["深层目录不存在", "/etc/fixflow-no-dir-xyz/a.conf", (r) => { assert.ok(r.error); }],
  ["绝对路径文件", "/etc/hostname", (r) => { assert.ok(r.content.trim().length > 0); }],
  ["空文件", null, (r) => { assert.equal(r.content, ""); assert.equal(r.error, null); }],
  ["含密钥文件被脱敏", null, (r) => { assert.ok(!r.content.includes("sk-1234567890abcdef")); assert.ok(!r.content.includes("abc123def456")); }],
  ["超大文件截断", null, (r) => { assert.ok(r.content.includes("[已截断]")); assert.ok(r.content.length < 70000); }],
  ["中文编码文件", null, (r) => { assert.equal(r.error, null); assert.ok(r.content.includes("中文")); }],
];

// ============ 12. Agent 会话工具集成（33 条） ============
function fakeLlm(plan) {
  let i = 0;
  return async () => plan[i++] || plan[plan.length - 1];
}

test("会话调用 run_command 只读工具", async () => {
  const s = createSession({
    config: {},
    llmChat: fakeLlm([
      { text: "", toolCalls: [{ id: "c1", name: "run_command", args: { command: "df -h" } }] },
      { text: "磁盘正常", toolCalls: [] },
    ]),
  });
  const out = await s.send("检查磁盘");
  assert.equal(out, "磁盘正常");
  const toolMsg = s.history.find((m) => m.role === "tool");
  assert.equal(JSON.parse(toolMsg.content).exitCode, 0);
});
test("会话调用 run_command 输出进历史", async () => {
  const s = createSession({
    config: {},
    llmChat: fakeLlm([
      { text: "", toolCalls: [{ id: "c1", name: "run_command", args: { command: "echo hello" } }] },
      { text: "done", toolCalls: [] },
    ]),
  });
  await s.send("hi");
  const toolMsg = s.history.find((m) => m.role === "tool");
  assert.match(JSON.parse(toolMsg.content).stdout, /hello/);
});
test("会话调用 read_file 工具", async () => {
  const s = createSession({
    config: {},
    llmChat: fakeLlm([
      { text: "", toolCalls: [{ id: "c1", name: "read_file", args: { path: "/etc/hostname" } }] },
      { text: "已读取", toolCalls: [] },
    ]),
  });
  await s.send("读文件");
  const toolMsg = s.history.find((m) => m.role === "tool");
  assert.equal(JSON.parse(toolMsg.content).error, null);
});
test("会话写命令触发确认流程", async () => {
  let asked = null;
  const s = createSession({
    config: {},
    onConfirm: async (info) => { asked = info; return true; },
    llmChat: fakeLlm([
      { text: "", toolCalls: [{ id: "c1", name: "run_command", args: { command: "touch /tmp/fx-session-test" } }] },
      { text: "已执行", toolCalls: [] },
    ]),
  });
  await s.send("建个文件");
  assert.ok(asked, "写命令必须询问确认");
  const toolMsg = s.history.find((m) => m.role === "tool");
  assert.equal(JSON.parse(toolMsg.content).confirmed, true);
});
test("会话写命令用户拒绝", async () => {
  const s = createSession({
    config: {},
    onConfirm: async () => false,
    llmChat: fakeLlm([
      { text: "", toolCalls: [{ id: "c1", name: "run_command", args: { command: "touch /tmp/fx-session-reject" } }] },
      { text: "好吧", toolCalls: [] },
    ]),
  });
  await s.send("建个文件");
  const toolMsg = s.history.find((m) => m.role === "tool");
  assert.equal(JSON.parse(toolMsg.content).confirmed, false);
});
test("会话调用 apply_fix 确认后执行", async () => {
  const s = createSession({
    config: {},
    onConfirm: async () => true,
    llmChat: fakeLlm([
      { text: "", toolCalls: [{ id: "c1", name: "apply_fix", args: { command: "echo fixed > /tmp/fx-apply-session", reason: "t", riskLevel: "low", impact: "x" } }] },
      { text: "修复完成", toolCalls: [] },
    ]),
  });
  const out = await s.send("修一下");
  assert.equal(out, "修复完成");
  const toolMsg = s.history.find((m) => m.role === "tool");
  assert.equal(JSON.parse(toolMsg.content).confirmed, true);
});
test("会话 apply_fix 危险命令被拦截", async () => {
  let asked = false;
  const s = createSession({
    config: {},
    onConfirm: async () => { asked = true; return true; },
    llmChat: fakeLlm([
      { text: "", toolCalls: [{ id: "c1", name: "apply_fix", args: { command: "rm -rf /", reason: "t", riskLevel: "high", impact: "x" } }] },
      { text: "已拦截", toolCalls: [] },
    ]),
  });
  await s.send("删根");
  assert.equal(asked, false);
  const toolMsg = s.history.find((m) => m.role === "tool");
  assert.equal(JSON.parse(toolMsg.content).blocked, true);
});
test("会话多工具循环执行", async () => {
  const s = createSession({
    config: {},
    llmChat: fakeLlm([
      { text: "", toolCalls: [{ id: "c1", name: "run_command", args: { command: "echo a" } }] },
      { text: "", toolCalls: [{ id: "c2", name: "run_command", args: { command: "echo b" } }] },
      { text: "最终结论", toolCalls: [] },
    ]),
  });
  const out = await s.send("多步");
  assert.equal(out, "最终结论");
  assert.equal(s.history.filter((m) => m.role === "tool").length, 2);
});
test("会话未知工具返回错误", async () => {
  const s = createSession({
    config: {},
    llmChat: fakeLlm([
      { text: "", toolCalls: [{ id: "c1", name: "no_such_tool", args: {} }] },
      { text: "知道了", toolCalls: [] },
    ]),
  });
  await s.send("未知工具");
  const toolMsg = s.history.find((m) => m.role === "tool");
  assert.match(JSON.parse(toolMsg.content).error, /未知工具/);
});
test("会话工具抛错仍写响应", async () => {
  const s = createSession({
    config: {},
    llmChat: fakeLlm([
      { text: "", toolCalls: [{ id: "c1", name: "read_file", args: { path: "/no/such" } }] },
      { text: "继续", toolCalls: [] },
    ]),
  });
  await s.send("hi");
  const toolMsg = s.history.find((m) => m.role === "tool");
  assert.ok(JSON.parse(toolMsg.content).error);
});
test("会话 clear_history 清空历史", async () => {
  const events = [];
  const s = createSession({
    config: {},
    onEvent: (e) => events.push(e),
    llmChat: fakeLlm([
      { text: "", toolCalls: [{ id: "c1", name: "clear_history", args: {} }] },
      { text: "已清空", toolCalls: [] },
    ]),
  });
  await s.send("清空");
  assert.ok(events.some((e) => e.type === "clear"));
  assert.equal(s.history.filter((m) => m.role !== "system").length, 2);
});
test("会话中止中断工具循环", async () => {
  const s = createSession({
    config: {},
    llmChat: async ({ signal }) => {
      await new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("请求已中止")), { once: true });
      });
    },
  });
  const p = s.send("慢");
  setTimeout(() => s.abort(), 50);
  await assert.rejects(p, /中止/);
});
test("send 串行化不交错", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const calls = [];
  const s = createSession({
    config: {},
    llmChat: async () => {
      calls.push(calls.length);
      if (calls.length === 1) await gate;
      return { text: "ok", toolCalls: [] };
    },
  });
  const pA = s.send("A");
  const pB = s.send("B");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(calls.length, 1);
  release();
  await Promise.all([pA, pB]);
  assert.equal(calls.length, 2);
});
test("配置热更新影响 llmChat", async () => {
  const config = { apiKey: "old", model: "m1" };
  let seen = {};
  const s = createSession({
    config,
    llmChat: async (opts) => { seen = opts; return { text: "ok", toolCalls: [] }; },
  });
  await s.send("a");
  config.model = "m2";
  await s.send("b");
  assert.equal(seen.model, "m2");
});

// ============ 13. 只读命令白名单边界（20 条） ============
const READONLY_EDGE = [
  "ls /tmp", "find /etc -maxdepth 1 -name '*.conf'", "stat /etc/hostname",
  "df -i", "lsblk", "blkid", "mount", "cat /proc/meminfo",
  "grep -c processor /proc/cpuinfo", "netstat -tulnp", "ss -s",
  "iptables -L -n --line-numbers", "systemctl list-units --type=service --no-pager",
  "nginx -T 2>&1 | head -50", "docker network ls 2>/dev/null",
  "docker volume ls 2>/dev/null", "ls /etc/nginx/sites-enabled/",
  "tail -50 /var/log/nginx/error.log 2>&1", "pgrep -fl python 2>/dev/null",
  "ps -eo stat,comm | awk '$1 ~ /Z/ {print $2}'",
];

for (const [name, cmd, fn] of RUN_BASIC) {
  test(`run_command 基础: ${name}`, async () => { const r = await runCommand(cmd); fn(r); });
}
for (const [name, input, expect] of REDACT) {
  test(`redactSecrets: ${name}`, () => assert.equal(redactSecrets(input), expect));
}
for (const [name, cmd, secret] of RUN_REDACT) {
  test(`run_command 脱敏: ${name}`, async () => {
    const r = await runCommand(cmd);
    if (name === "普通输出保持原样") {
      assert.equal(r.stdout.trim(), secret);
    } else {
      assert.ok(!r.stdout.includes(secret), `输出不应包含 ${secret}`);
    }
  });
}
for (const [name, cmd, fn] of TRUNCATE) {
  test(`截断: ${name}`, async () => { const r = await runCommand(cmd); fn(r); });
}
for (const cmd of WRITE_CMDS) {
  test(`isWriteCommand 写命令: ${cmd}`, () => assert.ok(isWriteCommand(cmd), `应识别为写命令: ${cmd}`));
}
for (const cmd of WRITE_READONLY) {
  test(`isWriteCommand 只读放行: ${cmd}`, () => assert.ok(!isWriteCommand(cmd), `不应识别为写命令: ${cmd}`));
}
for (const [name, cmd, expect] of DANGEROUS) {
  test(`isDangerousCommand: ${name}`, () => assert.equal(isDangerousCommand(cmd), expect));
}
for (const [name, path, fn] of READ_FILES) {
  test(`read_file: ${name}`, async () => {
    let p = path;
    if (path === null) {
      if (name === "空文件") { await writeFile("/tmp/fixflow-empty-test.txt", ""); p = "/tmp/fixflow-empty-test.txt"; }
      else if (name === "含密钥文件被脱敏") { await writeFile("/tmp/fixflow-secret-test.txt", "token=abc123def456\nsk-1234567890abcdef\n"); p = "/tmp/fixflow-secret-test.txt"; }
      else if (name === "超大文件截断") { await writeFile("/tmp/fixflow-big-test.txt", "x".repeat(70000)); p = "/tmp/fixflow-big-test.txt"; }
      else { await writeFile("/tmp/fixflow-utf8-test.txt", "中文测试内容"); p = "/tmp/fixflow-utf8-test.txt"; }
    }
    const r = await readFile(p);
    fn(r);
  });
}
for (const cmd of READONLY_EDGE) {
  test(`只读边界命令: ${cmd}`, () => assert.ok(!isWriteCommand(cmd), `不应误判写命令: ${cmd}`));
}