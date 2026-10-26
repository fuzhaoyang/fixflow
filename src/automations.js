import { readFile, writeFile, mkdir, appendFile, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { sampleMetrics, METRICS } from "./metric-alerts.js";
import { runCommand, redactSecrets } from "./tools.js";

const SERVICE_RE = /^[A-Za-z0-9_.@-]+$/;
const MAX_RULES = 200;
const MAX_RUNS_READ = 500;
const MAX_SCRIPT = 20000;
const TRIGGER_TYPES = new Set(["service_down", "metric", "http", "cron"]);
const ACTION_TYPES = new Set(["restart_service", "reload_service", "run_command", "webhook"]);
const VERIFY_TYPES = new Set(["service_active", "http_status", "command_exit"]);

const newId = () => "A-" + randomUUID().slice(0, 8);
const newRunId = () => "AR-" + randomUUID().slice(0, 8);
const clamp = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const truncate = (s, max = 4000) => {
  const t = String(s ?? "");
  return t.length > max ? t.slice(0, max) + "\n...[截断]" : t;
};
const safeService = (s) => SERVICE_RE.test(String(s || "")) ? String(s) : "";
const nowIso = (now) => new Date(now).toISOString();

function normalizeTrigger(t = {}, allowCommands) {
  const type = String(t.type || "");
  if (!TRIGGER_TYPES.has(type)) return { error: "触发类型不合法" };
  if (type === "service_down") {
    const service = safeService(t.service);
    if (!service) return { error: "服务名不合法" };
    return { trigger: { type, service, intervalSec: clamp(t.intervalSec, 10, 3600, 30) } };
  }
  if (type === "metric") {
    const metric = String(t.metric || "");
    if (!METRICS[metric]) return { error: "指标不合法" };
    const threshold = Number(t.threshold);
    if (!Number.isFinite(threshold)) return { error: "阈值不合法" };
    const mount = metric === "disk" ? (String(t.mount || "/").trim() || "/") : "";
    if (mount && !mount.startsWith("/")) return { error: "挂载点必须以 / 开头" };
    return { trigger: { type, metric, op: t.op === "<=" ? "<=" : ">=", threshold, mount, durationSec: clamp(t.durationSec, 0, 86400, 0) } };
  }
  if (type === "http") {
    const url = String(t.url || "").trim();
    if (!/^https?:\/\//i.test(url)) return { error: "HTTP URL 不合法" };
    return { trigger: { type, url, method: ["GET", "HEAD"].includes(String(t.method || "").toUpperCase()) ? String(t.method).toUpperCase() : "GET", expectStatus: clamp(t.expectStatus, 100, 599, 200), timeoutSec: clamp(t.timeoutSec, 1, 60, 10), consecutiveFailures: clamp(t.consecutiveFailures, 1, 10, 2) } };
  }
  const everySec = Number(t.everySec);
  if (Number.isFinite(everySec) && everySec >= 10) return { trigger: { type: "cron", everySec: clamp(everySec, 10, 604800, 300) } };
  const dailyAt = String(t.dailyAt || "").trim();
  if (/^\d{1,2}:\d{2}$/.test(dailyAt)) {
    const [h, m] = dailyAt.split(":").map(Number);
    if (h < 24 && m < 60) return { trigger: { type: "cron", dailyAt: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` } };
  }
  return { error: "cron 需要 everySec 或 dailyAt" };
}

function normalizeAction(a = {}, allowCommands = []) {
  const type = String(a.type || "");
  if (!ACTION_TYPES.has(type)) return { error: "动作类型不合法" };
  if (type === "restart_service" || type === "reload_service") {
    const service = safeService(a.service);
    if (!service) return { error: "服务名不合法" };
    return { action: { type, service, timeoutSec: clamp(a.timeoutSec, 5, 300, 60), risk: ["low", "medium", "high"].includes(a.risk) ? a.risk : "medium" } };
  }
  if (type === "run_command") {
    const command = String(a.command || "").trim();
    if (!command) return { error: "命令不能为空" };
    if (!Array.isArray(allowCommands) || !allowCommands.some((p) => command.startsWith(String(p)))) return { error: "命令不在自动化白名单中" };
    return { action: { type, command, timeoutSec: clamp(a.timeoutSec, 5, 300, 60), risk: ["low", "medium", "high"].includes(a.risk) ? a.risk : "high" } };
  }
  const url = String(a.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return { error: "Webhook URL 不合法" };
  return { action: { type, url, method: "POST", timeoutSec: clamp(a.timeoutSec, 1, 60, 10), risk: ["low", "medium", "high"].includes(a.risk) ? a.risk : "low" } };
}

function normalizeVerify(list = [], allowCommands = []) {
  return (Array.isArray(list) ? list : []).map((v) => {
    const type = String(v?.type || "");
    if (!VERIFY_TYPES.has(type)) return null;
    if (type === "service_active") {
      const service = safeService(v.service);
      return service ? { type, service } : null;
    }
    if (type === "http_status") {
      const url = String(v.url || "").trim();
      return /^https?:\/\//i.test(url) ? { type, url, expectStatus: clamp(v.expectStatus, 100, 599, 200) } : null;
    }
    const command = String(v.command || "").trim();
    if (!command || !Array.isArray(allowCommands) || !allowCommands.some((p) => command.startsWith(String(p)))) return null;
    return { type, command, expectExit: clamp(v.expectExit, -1, 255, 0) };
  }).filter(Boolean);
}

export function normalizeAutomation(input = {}, { allowCommands = [] } = {}) {
  const name = String(input.name || "").trim();
  if (!name) return { error: "名称不能为空" };
  const t = normalizeTrigger(input.trigger || {}, allowCommands);
  if (t.error) return { error: t.error };
  const a = normalizeAction(input.action || {}, allowCommands);
  if (a.error) return { error: a.error };
  const verify = normalizeVerify(input.verify, allowCommands);
  if (!verify.length && a.action.service) verify.push({ type: "service_active", service: a.action.service });
  const isCron = t.trigger.type === "cron";
  const rule = {
    id: String(input.id || newId()),
    name,
    description: String(input.description || ""),
    enabled: input.enabled !== false,
    trigger: t.trigger,
    action: a.action,
    verify,
    cooldownSec: clamp(input.cooldownSec, 0, 86400, isCron ? 0 : 300),
    maxRunsPerHour: clamp(input.maxRunsPerHour, 1, 60, isCron ? 60 : 3),
    risk: ["low", "medium", "high"].includes(input.risk) ? input.risk : "medium",
    scriptPreview: String(input.scriptPreview || "").slice(0, 4000),
    testScript: String(input.testScript || "").replace(/\0/g, "").slice(0, MAX_SCRIPT),
    testPlan: Array.isArray(input.testPlan) ? input.testPlan.map(String).slice(0, 20) : [],
    createdAt: input.createdAt || nowIso(Date.now()),
    updatedAt: nowIso(Date.now()),
    state: input.state && typeof input.state === "object" ? {
      lastRunAt: Number(input.state.lastRunAt) || 0,
      nextRunAt: Number(input.state.nextRunAt) || 0,
      backoffUntil: Number(input.state.backoffUntil) || 0,
      breachSince: Number(input.state.breachSince) || 0,
      failures: Number(input.state.failures) || 0,
      triggerFailures: Number(input.state.triggerFailures) || 0,
      runTimes: Array.isArray(input.state.runTimes) ? input.state.runTimes.map(Number).filter(Number.isFinite).slice(-200) : [],
      lastValue: input.state.lastValue ?? null,
    } : { lastRunAt: 0, nextRunAt: 0, backoffUntil: 0, breachSince: 0, failures: 0, triggerFailures: 0, runTimes: [], lastValue: null },
  };
  return { rule };
}

export async function readAutomations(filePath) {
  try {
    const data = JSON.parse(await readFile(filePath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

export async function writeAutomations(filePath, rules) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify((rules || []).slice(0, MAX_RULES), null, 2), { mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => {});
}

export async function readRuns(filePath) {
  try {
    return (await readFile(filePath, "utf8")).split("\n").filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean).slice(-MAX_RUNS_READ);
  } catch { return []; }
}

export async function appendRun(filePath, run) {
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, JSON.stringify(run) + "\n", { mode: 0o600 });
}

function triggerHit(op, value, threshold) {
  return op === "<=" ? value <= threshold : value >= threshold;
}

function nextDaily(now, dailyAt) {
  const [h, m] = dailyAt.split(":").map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

async function metricValue(rule, values) {
  if (!values) return null;
  if (rule.trigger.metric === "disk") return values.diskByMount?.[rule.trigger.mount || "/"]?.usedPct ?? null;
  return values[rule.trigger.metric] ?? null;
}

export async function evaluateTrigger(rule, { exec = runCommand, fetchImpl = fetch, metricValues = null, now = () => Date.now() } = {}) {
  const t = rule.trigger;
  const state = {};
  if (t.type === "service_down") {
    const r = await exec(`systemctl is-active ${t.service}`, { timeout: 10000 }).catch(() => ({ stdout: "", exitCode: 1 }));
    const value = String(r.stdout || "").trim();
    state.lastValue = value;
    return { triggered: value !== "active", value, state };
  }
  if (t.type === "metric") {
    const value = await metricValue(rule, metricValues);
    state.lastValue = value;
    if (value == null) return { triggered: false, value, state };
    const hit = triggerHit(t.op, value, t.threshold);
    if (!hit) { state.breachSince = 0; return { triggered: false, value, state }; }
    const since = Number(rule.state?.breachSince) || now();
    state.breachSince = since;
    return { triggered: now() - since >= (t.durationSec || 0) * 1000, value, state };
  }
  if (t.type === "http") {
    try {
      const res = await fetchImpl(t.url, { method: t.method, signal: AbortSignal.timeout(t.timeoutSec * 1000) });
      const ok = res.status === t.expectStatus;
      const failures = ok ? 0 : (Number(rule.state?.triggerFailures) || 0) + 1;
      state.lastValue = res.status;
      state.triggerFailures = failures;
      return { triggered: !ok && failures >= t.consecutiveFailures, value: res.status, state };
    } catch (e) {
      const failures = (Number(rule.state?.triggerFailures) || 0) + 1;
      state.triggerFailures = failures;
      state.lastValue = String(e?.message || e);
      return { triggered: failures >= t.consecutiveFailures, value: state.lastValue, state };
    }
  }
  // cron
  const next = Number(rule.state?.nextRunAt) || 0;
  if (!next) {
    state.nextRunAt = t.everySec ? now() + t.everySec * 1000 : nextDaily(now(), t.dailyAt);
    return { triggered: false, state };
  }
  if (now() < next) return { triggered: false, state };
  state.nextRunAt = t.everySec ? now() + t.everySec * 1000 : nextDaily(now(), t.dailyAt);
  return { triggered: true, state };
}

async function runAction(action, { exec, fetchImpl, allowCommands }) {
  const started = Date.now();
  try {
    if (action.type === "restart_service" || action.type === "reload_service") {
      const verb = action.type === "restart_service" ? "restart" : "reload";
      const r = await exec(`systemctl ${verb} ${action.service}`, { timeout: action.timeoutSec * 1000 });
      return { ok: r.exitCode === 0, output: redactSecrets((r.stdout || "") + (r.stderr || "")), durationMs: Date.now() - started };
    }
    if (action.type === "run_command") {
      if (!Array.isArray(allowCommands) || !allowCommands.some((p) => action.command.startsWith(String(p)))) return { ok: false, output: "命令不在自动化白名单中", durationMs: Date.now() - started };
      const r = await exec(action.command, { timeout: action.timeoutSec * 1000 });
      return { ok: r.exitCode === 0, output: redactSecrets((r.stdout || "") + (r.stderr || "")), durationMs: Date.now() - started };
    }
    if (action.type === "webhook") {
      const res = await fetchImpl(action.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "automation", at: new Date().toISOString() }), signal: AbortSignal.timeout(action.timeoutSec * 1000) });
      return { ok: res.ok, output: `HTTP ${res.status}`, durationMs: Date.now() - started };
    }
    return { ok: false, output: "未知动作", durationMs: Date.now() - started };
  } catch (e) {
    return { ok: false, output: String(e?.message || e), durationMs: Date.now() - started };
  }
}

async function verifyCheck(v, { exec, fetchImpl }) {
  if (v.type === "service_active") {
    const r = await exec(`systemctl is-active ${v.service}`, { timeout: 10000 }).catch(() => ({ stdout: "", exitCode: 1 }));
    const value = String(r.stdout || "").trim();
    return { type: v.type, ok: value === "active", detail: value };
  }
  if (v.type === "http_status") {
    try {
      const res = await fetchImpl(v.url, { signal: AbortSignal.timeout(10000) });
      return { type: v.type, ok: res.status === v.expectStatus, detail: `HTTP ${res.status}` };
    } catch (e) {
      return { type: v.type, ok: false, detail: String(e?.message || e) };
    }
  }
  const r = await exec(v.command, { timeout: 30000 }).catch(() => ({ stdout: "", stderr: "", exitCode: 1 }));
  return { type: v.type, ok: r.exitCode === v.expectExit, detail: String(r.stdout || r.stderr || "").slice(0, 500) };
}

export async function executeAutomation(rule, { exec = runCommand, fetchImpl = fetch, allowCommands = [], now = () => Date.now(), runId = newRunId() } = {}) {
  const at = now();
  const action = await runAction(rule.action, { exec, fetchImpl, allowCommands });
  const checks = [];
  for (const v of rule.verify || []) checks.push(await verifyCheck(v, { exec, fetchImpl }));
  const ok = action.ok && checks.every((c) => c.ok);
  return {
    id: runId,
    automationId: rule.id,
    at,
    trigger: rule.trigger,
    action: rule.action,
    ok,
    actionOk: action.ok,
    output: truncate(action.output),
    checks,
    durationMs: Math.max(action.durationMs, now() - at),
  };
}

function canRun(rule, now) {
  const state = rule.state || {};
  if (now < (Number(state.backoffUntil) || 0)) return false;
  if (now - (Number(state.lastRunAt) || 0) < (rule.cooldownSec || 0) * 1000) return false;
  const times = (state.runTimes || []).filter((t) => t > now - 3600e3);
  return times.length < (rule.maxRunsPerHour || 3);
}

function recordRun(rule, run, now) {
  const state = rule.state || {};
  const failures = run.ok ? 0 : (Number(state.failures) || 0) + 1;
  rule.state = {
    ...state,
    lastRunAt: run.at,
    runTimes: [...(state.runTimes || []), run.at].filter((t) => t > run.at - 3600e3).slice(-200),
    failures,
    backoffUntil: failures ? now + Math.min(3600, 60 * 2 ** Math.min(6, failures)) * 1000 : 0,
  };
}

export async function runAutomationNow({ filePath, runsPath, id, exec = runCommand, fetchImpl = fetch, allowCommands = [], now = () => Date.now() } = {}) {
  const rules = await readAutomations(filePath);
  const rule = rules.find((r) => r.id === id);
  if (!rule) return { error: "自动化不存在" };
  const run = await executeAutomation(rule, { exec, fetchImpl, allowCommands, now });
  run.manual = true;
  recordRun(rule, run, now());
  await writeAutomations(filePath, rules);
  await appendRun(runsPath, run);
  return { run };
}

const BLOCKED_TEST_SERVICE = /^(fixflow|sshd?|systemd|systemd-.*|dbus|NetworkManager|firewalld|networkd|resolved|journald|logind|udevd|lightdm|gdm|sddm|display-manager)$/i;

function actionCommandText(action) {
  if (action.type === "restart_service") return `systemctl restart ${action.service}`;
  if (action.type === "reload_service") return `systemctl reload ${action.service}`;
  if (action.type === "run_command") return action.command;
  return `POST ${action.url}`;
}

function verifyCommandText(list) {
  return (list || []).map((v) => v.type === "service_active" ? `systemctl is-active ${v.service}` : v.type === "http_status" ? `GET ${v.url} == ${v.expectStatus}` : v.command).join(" && ");
}

export async function runLocalTest(rule, { confirm, exec = runCommand, fetchImpl = fetch, allowCommands = [], now = () => Date.now() } = {}) {
  const at = now();
  const steps = [];
  const service = rule.trigger?.type === "service_down" ? rule.trigger.service : "";
  if (service && BLOCKED_TEST_SERVICE.test(service)) return { error: `为了安全，本机测试不允许停止 ${service}` };
  const inject = service ? `systemctl stop ${service}` : "";
  const command = [inject, actionCommandText(rule.action), verifyCommandText(rule.verify)].filter(Boolean).join(" && ");
  if (confirm) {
    const ok = await confirm({
      riskLevel: "high",
      reason: inject ? `本机测试会先停止 ${service}，触发规则后执行自动化动作` : "本机测试会直接执行自动化动作并校验结果",
      impact: inject ? `${service} 会短暂中断，测试结束后自动恢复；恢复失败会再尝试启动` : "动作将真实作用在当前服务器上",
      command,
    });
    if (!ok) return { ok: false, rejected: true, mode: "local", test: true, automationId: rule.id, at, steps: [], checks: [], output: "用户拒绝执行" };
  }
  if (inject) {
    const r = await exec(inject, { timeout: 30000 }).catch((e) => ({ exitCode: 1, stdout: "", stderr: String(e?.message || e) }));
    steps.push({ label: "注入故障", command: inject, ok: r.exitCode === 0, output: redactSecrets((r.stdout || "") + (r.stderr || "")) });
  }
  const run = await executeAutomation(rule, { exec, fetchImpl, allowCommands, now });
  let restored = true;
  if (service) {
    const r = await exec(`systemctl start ${service}`, { timeout: 30000 }).catch((e) => ({ exitCode: 1, stdout: "", stderr: String(e?.message || e) }));
    restored = r.exitCode === 0;
    steps.push({ label: "恢复服务", command: `systemctl start ${service}`, ok: restored, output: redactSecrets((r.stdout || "") + (r.stderr || "")) });
  }
  return {
    ...run,
    mode: "local",
    test: true,
    steps,
    restored,
    ok: run.ok && restored,
  };
}

const shq = (s) => "'" + String(s ?? "").replace(/'/g, "'\\''") + "'";

function guestStep(rule) {
  const action = rule.action;
  const cmd = action.type === "restart_service" ? `systemctl restart ${action.service}`
    : action.type === "reload_service" ? `systemctl reload ${action.service}`
    : action.type === "run_command" ? action.command
    : `curl -fsS -X POST --max-time ${action.timeoutSec} ${shq(action.url)}`;
  const checks = (rule.verify || []).map((v) => {
    if (v.type === "service_active") return `systemctl is-active --quiet ${v.service}`;
    if (v.type === "http_status") return `test "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 ${shq(v.url)})" = "${v.expectStatus}"`;
    return `if ( ${v.command} ); then __c=0; else __c=$?; fi; test "$__c" -eq ${v.expectExit}`;
  });
  const inject = rule.trigger?.type === "service_down" && !BLOCKED_TEST_SERVICE.test(rule.trigger.service) ? `systemctl stop ${rule.trigger.service}` : "";
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `echo ${shq("[1/4] 注入故障")}`,
    inject || "echo '(该触发类型无需注入，直接验证动作)'",
    `echo ${shq("[2/4] 执行动作")}`,
    cmd,
    `echo ${shq("[3/4] 断言")}`,
    ...(checks.length ? checks : ["true"]),
    `echo ${shq("[4/4] 清理")}`,
    inject ? `systemctl start ${rule.trigger.service}` : "true",
    `echo ${shq("测试通过")}`,
  ].join("\n") + "\n";
}

export function buildVmTestScript(rule) {
  const guest = guestStep(rule);
  const guestB64 = Buffer.from(guest, "utf8").toString("base64");
  const svc = rule.trigger?.type === "service_down" ? rule.trigger.service : "";
  const packages = ["openssh-server", "curl"];
  if (svc === "nginx") packages.push("nginx");
  const userData = [
    "#cloud-config",
    "users:",
    "  - name: tester",
    "    sudo: ALL=(ALL) NOPASSWD:ALL",
    "    shell: /bin/bash",
    "    ssh_authorized_keys:",
    "      - __SSH_PUB__",
    "disable_root: false",
    "ssh_pwauth: false",
    "packages:",
    ...packages.map((p) => `  - ${p}`),
    "runcmd:",
    "  - systemctl enable --now ssh",
    "  - systemctl enable --now nginx || true",
    "",
  ].join("\n");
  const seed = `#cloud-config\ninstance-id: fixflow-${rule.id}\nlocal-hostname: fixflow-test\n`;
  return `#!/usr/bin/env bash
# Fixflow 自动化 KVM 一次性测试脚本（生成，不自动执行）
# 依赖：qemu-system-x86_64、qemu-img、cloud-localds、ssh、scp、ssh-keygen、/dev/kvm
set -euo pipefail
IMAGE_URL="\${FIXFLOW_CLOUD_IMAGE:-https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img}"
WORK="$(mktemp -d "\${TMPDIR:-/tmp}/fixflow-auto.XXXXXX")"
SSH_PORT="\${FIXFLOW_SSH_PORT:-2222}"
mkdir -p "$WORK"
cleanup() {
  [ -f "$WORK/qemu.pid" ] && kill "$(cat "$WORK/qemu.pid")" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT
for bin in qemu-system-x86_64 qemu-img cloud-localds ssh scp ssh-keygen; do
  command -v "$bin" >/dev/null || { echo "缺少 $bin，请先安装 qemu-system-x86_64 qemu-utils cloud-image-utils openssh-client"; exit 1; }
done
[ -r /dev/kvm ] || { echo "没有 /dev/kvm，当前机器不支持 KVM 加速"; exit 1; }
if [ ! -f "$WORK/base.img" ]; then
  curl -fL --retry 3 -o "$WORK/base.img.tmp" "$IMAGE_URL"
  mv "$WORK/base.img.tmp" "$WORK/base.img"
fi
qemu-img create -f qcow2 -F qcow2 -b "$WORK/base.img" "$WORK/disk.qcow2" 8G >/dev/null
ssh-keygen -t ed25519 -N "" -f "$WORK/id" >/dev/null
PUB="$(cat "$WORK/id.pub")"
cat > "$WORK/user-data" <<CLOUD
${userData.replace("__SSH_PUB__", "$PUB")}CLOUD
cat > "$WORK/meta-data" <<'META'
${seed}META
cloud-localds "$WORK/seed.iso" "$WORK/user-data" "$WORK/meta-data"
qemu-system-x86_64 -enable-kvm -cpu host -m 2048 -smp 2 \\
  -drive file="$WORK/disk.qcow2",if=virtio \\
  -drive file="$WORK/seed.iso",media=cdrom \\
  -netdev user,id=n0,hostfwd=tcp:127.0.0.1:$SSH_PORT-:22 \\
  -device virtio-net-pci,netdev=n0 -display none -serial file:"$WORK/console.log" \\
  -daemonize -pidfile "$WORK/qemu.pid"
SSH_OPTS="-i $WORK/id -p $SSH_PORT -o PreferredAuthentications=publickey -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=3"
for _ in $(seq 1 60); do
  ssh $SSH_OPTS tester@127.0.0.1 true 2>/dev/null && break
  sleep 3
done
ssh $SSH_OPTS tester@127.0.0.1 true || { echo "VM SSH 未就绪，控制台日志：$WORK/console.log"; exit 1; }
ssh $SSH_OPTS tester@127.0.0.1 'sudo cloud-init status --wait || true'
echo ${shq(guestB64)} | base64 -d > "$WORK/guest-test.sh"
scp $SSH_OPTS "$WORK/guest-test.sh" tester@127.0.0.1:/tmp/guest-test.sh >/dev/null
ssh $SSH_OPTS tester@127.0.0.1 'sudo bash /tmp/guest-test.sh'
`;
}

export function createAutomationEngine({ filePath, runsPath, exec = runCommand, fetchImpl = fetch, monitor = null, allowCommands = [], onTrigger = async () => {}, onRun = async () => {}, logger = console, now = () => Date.now() } = {}) {
  let timer = null;
  let running = false;
  let appends = 0;
  async function tick() {
    if (running) return;
    running = true;
    try {
      const rules = await readAutomations(filePath);
      if (!rules.length) return;
      const needMetrics = rules.some((r) => r.enabled && r.trigger?.type === "metric");
      const metricValues = needMetrics ? await sampleMetrics({ monitor: monitor || undefined, run: exec }).catch(() => null) : null;
      let dirty = false;
      for (const rule of rules) {
        if (!rule.enabled) continue;
        const result = await evaluateTrigger(rule, { exec, fetchImpl, metricValues, now });
        const allowed = canRun(rule, now());
        if (result.state && Object.keys(result.state).length) {
          rule.state = { ...(rule.state || {}), ...result.state };
          dirty = true;
        }
        if (!result.triggered || !allowed) continue;
        try { await onTrigger(rule, result); } catch (e) { logger.error("[fixflow] 自动化触发通知失败:", e?.message || e); }
        const run = await executeAutomation(rule, { exec, fetchImpl, allowCommands, now });
        recordRun(rule, run, now());
        dirty = true;
        await appendRun(runsPath, run);
        if (++appends % 200 === 0) await trimRuns(runsPath);
        await onRun(run, rule);
      }
      if (dirty) {
        const latest = await readAutomations(filePath);
        for (const fresh of latest) {
          const current = rules.find((r) => r.id === fresh.id);
          if (current) fresh.state = current.state;
        }
        await writeAutomations(filePath, latest);
      }
    } catch (e) {
      logger.error("[fixflow] 自动化引擎失败:", e?.message || e);
    } finally {
      running = false;
    }
  }
  return {
    tick,
    start(intervalMs = 15000) { if (timer) return; timer = setInterval(() => tick().catch(() => {}), intervalMs); },
    stop() { if (timer) clearInterval(timer); timer = null; },
  };
}

async function trimRuns(filePath) {
  const all = await readFile(filePath, "utf8").catch(() => "");
  const lines = all.split("\n").filter(Boolean);
  if (lines.length <= 2000) return;
  await writeFile(filePath, lines.slice(-1000).join("\n") + "\n").catch(() => {});
}
