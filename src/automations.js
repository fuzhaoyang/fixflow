import { readFile, writeFile, mkdir, appendFile, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { sampleMetrics, METRICS } from "./metric-alerts.js";
import { runCommand, redactSecrets } from "./tools.js";
import { normalizeManager, serviceStatus, actionCommand, verifyFor } from "./process-manager.js";

const SERVICE_RE = /^[A-Za-z0-9_.@-]+$/;
const MAX_RULES = 200;
const MAX_RUNS_READ = 500;
const MAX_SCRIPT = 20000;
const TRIGGER_TYPES = new Set(["service_down", "metric", "http", "cron"]);
const ACTION_TYPES = new Set(["restart_service", "reload_service", "run_command", "webhook"]);
const VERIFY_TYPES = new Set(["service_active", "http_status", "command_exit", "pm2_online", "docker_running", "supervisor_running", "custom_active"]);

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

function normalizeTrigger(t = {}, allowCommands, manager = "systemd") {
  const type = String(t.type || "");
  if (!TRIGGER_TYPES.has(type)) return { error: "触发类型不合法" };
  if (type === "service_down") {
    const service = safeService(t.service);
    if (!service) return { error: "服务名不合法" };
    const statusCommand = String(t.statusCommand || "").trim().slice(0, 1000);
    if (manager === "custom" && !statusCommand) return { error: "自定义管理器需要状态检查命令" };
    return { trigger: { type, service, intervalSec: clamp(t.intervalSec, 10, 3600, 30), ...(manager === "custom" ? { statusCommand } : {}) } };
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

function normalizeAction(a = {}, allowCommands = [], manager = "systemd") {
  const type = String(a.type || "");
  if (!ACTION_TYPES.has(type)) return { error: "动作类型不合法" };
  if (manager === "custom" && (type === "restart_service" || type === "reload_service")) return { error: "自定义管理器请使用 run_command 动作" };
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

function normalizeVerify(list = [], allowCommands = [], manager = "systemd") {
  return (Array.isArray(list) ? list : []).map((v) => {
    const type = String(v?.type || "");
    if (!VERIFY_TYPES.has(type)) return null;
    if (["service_active", "pm2_online", "docker_running", "supervisor_running"].includes(type)) {
      const service = safeService(v.service);
      return service ? { type, service } : null;
    }
    if (type === "custom_active") {
      const command = String(v.command || "").trim().slice(0, 1000);
      return command ? { type, command } : null;
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
  const manager = normalizeManager(input.manager);
  const t = normalizeTrigger(input.trigger || {}, allowCommands, manager);
  if (t.error) return { error: t.error };
  const a = normalizeAction(input.action || {}, allowCommands, manager);
  if (a.error) return { error: a.error };
  const verify = normalizeVerify(input.verify, allowCommands, manager);
  if (!verify.length) {
    const auto = verifyFor(manager, a.action.service, t.trigger.statusCommand);
    if (auto) verify.push(auto);
  }
  const isCron = t.trigger.type === "cron";
  const rule = {
    id: String(input.id || newId()),
    name,
    description: String(input.description || ""),
    enabled: input.enabled !== false,
    manager,
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
      try {
        const run = JSON.parse(l);
        if (run && typeof run === "object" && !run.id) run.id = "AR-L" + createHash("sha1").update(l).digest("hex").slice(0, 8);
        return run;
      } catch { return null; }
    }).filter(Boolean).slice(-MAX_RUNS_READ);
  } catch { return []; }
}

export async function appendRun(filePath, run) {
  await mkdir(dirname(filePath), { recursive: true });
  const row = run && typeof run === "object" && !run.id ? { ...run, id: newRunId() } : run;
  await appendFile(filePath, JSON.stringify(row) + "\n", { mode: 0o600 });
}

export async function deleteRuns({ filePath, ids = [] }) {
  const set = new Set((Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean));
  const runs = await readRuns(filePath);
  const remaining = runs.filter((r) => !set.has(r.id));
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, remaining.map((r) => JSON.stringify(r)).join("\n") + (remaining.length ? "\n" : ""), { mode: 0o600 });
  await chmod(filePath, 0o600).catch(() => {});
  return { deleted: runs.length - remaining.length, runs: remaining };
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
    const status = await serviceStatus(rule.manager, t.service, { run: exec, statusCommand: t.statusCommand });
    state.lastValue = status.detail;
    return { triggered: !status.up, value: status.detail, state };
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

async function runAction(action, { exec, fetchImpl, allowCommands, manager = "systemd" }) {
  const started = Date.now();
  try {
    if (action.type === "restart_service" || action.type === "reload_service") {
      const command = actionCommand(manager, action);
      if (!command) return { ok: false, output: `未配置 ${manager} 动作命令`, durationMs: Date.now() - started };
      const r = await exec(command, { timeout: action.timeoutSec * 1000 });
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
  const managerOf = { service_active: "systemd", pm2_online: "pm2", docker_running: "docker", supervisor_running: "supervisor" }[v.type];
  if (managerOf) {
    const status = await serviceStatus(managerOf, v.service, { run: exec });
    return { type: v.type, ok: status.up, detail: status.detail };
  }
  if (v.type === "custom_active") {
    const status = await serviceStatus("custom", "", { run: exec, statusCommand: v.command });
    return { type: v.type, ok: status.up, detail: status.detail };
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
  const action = await runAction(rule.action, { exec, fetchImpl, allowCommands, manager: rule.manager });
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
