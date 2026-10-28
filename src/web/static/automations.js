// ---------- 自动化 ----------
const autoSearch = document.getElementById("auto-search");
const autoRefresh = document.getElementById("auto-refresh");
const autoCount = document.getElementById("auto-count");
const autoRulesEl = document.getElementById("auto-rules");
const autoRunsEl = document.getElementById("auto-runs");
const autoCommandsWrap = document.getElementById("auto-commands-wrap");
const autoCommands = document.getElementById("auto-commands");
const autoCommandsSave = document.getElementById("auto-commands-save");
const autoMask = document.getElementById("auto-mask");
const autoFormTitle = document.getElementById("auto-form-title");
const autoClose = document.getElementById("auto-close");
const autoCancel = document.getElementById("auto-cancel");
const autoSave = document.getElementById("auto-save");
const autoModeBanner = document.getElementById("auto-mode-banner");
const autoModeExit = document.getElementById("auto-mode-exit");
const autoModeNew = document.getElementById("auto-mode-new");
const autoModeBtn = document.getElementById("auto-mode-btn");
const autoModalStatus = document.getElementById("auto-modal-status");
const autoScriptEl = document.getElementById("auto-script");
const autoScriptCopy = document.getElementById("auto-script-copy");
const autoManager = document.getElementById("auto-manager");
const autoDetect = document.getElementById("auto-detect");
const autoStatusCommand = document.getElementById("auto-status-command");
const autoActionScriptEl = document.getElementById("auto-action-script");
const autoActionCopy = document.getElementById("auto-action-copy");
const autoRunTest = document.getElementById("auto-run-test");
const autoAiFix = document.getElementById("auto-ai-fix");
const autoRunStatus = document.getElementById("auto-run-status");
const autoRunResult = document.getElementById("auto-run-result");
const autoRunDeleteMask = document.getElementById("auto-run-delete-mask");
const autoRunDeleteTitle = document.getElementById("auto-run-delete-title");
const autoRunDeleteText = document.getElementById("auto-run-delete-text");
const autoRunDeletePw = document.getElementById("auto-run-delete-password");
const autoRunDeleteErr = document.getElementById("auto-run-delete-err");
const autoRunDeleteClose = document.getElementById("auto-run-delete-close");
const autoRunDeleteCancel = document.getElementById("auto-run-delete-cancel");
const autoRunDeleteConfirm = document.getElementById("auto-run-delete-confirm");

let autoRules = [];
let autoRuns = [];
let autoCommandsList = [];
let autoQuery = "";
let autoTab = "rules";
let autoEditing = null;
let autoDraft = null;
let autoEditingVerify = [];
let autoScript = "";
let autoBusy = false;
let autoMode = false;
let autoRunPage = 1;
let autoRunSelected = new Set();
let autoRunDeleteIds = [];
let autoDeleteMode = "run";
let autoDeleteRuleName = "";
const AUTO_RUN_PAGE_SIZE = 15;
let autoRunPageSize = readPageSize("runs", AUTO_RUN_PAGE_SIZE);

const autoTime = (ts) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(curLang === "en" ? "en-US" : "zh-CN", { hour12: false });
};

function autoTriggerTextSafe(rule) {
  const tr = rule.trigger || {};
  if (tr.type === "service_down") return `${t("auto.tService")} ${tr.service}`;
  if (tr.type === "metric") return `${tr.metric} ${tr.op} ${tr.threshold}${tr.metric === "disk" ? " @ " + (tr.mount || "/") : ""}`;
  if (tr.type === "http") return `${tr.method} ${tr.url} → ${tr.expectStatus}`;
  return tr.everySec ? `${t("auto.every")} ${tr.everySec}s` : `${t("auto.daily")} ${tr.dailyAt}`;
}

function autoActionText(rule) {
  const a = rule.action || {};
  if (a.type === "restart_service") return `${t("auto.aRestart")} ${a.service}`;
  if (a.type === "reload_service") return `${t("auto.aReload")} ${a.service}`;
  if (a.type === "run_command") return `${t("auto.aCommand")}: ${a.command}`;
  if (a.type === "webhook") return `${t("auto.aWebhook")}: ${a.url}`;
  return "—";
}

function autoStatusBadge(ok, label) {
  return `<span class="tag ${ok ? "ok" : "bad"}">${escapeHtml(label)}</span>`;
}

function latestRun(ruleId) {
  return autoRuns.find((r) => r.automationId === ruleId);
}

function renderAutoRules() {
  const q = autoQuery.trim().toLowerCase();
  const list = q ? autoRules.filter((r) => [r.name, r.description, autoActionText(r), autoTriggerTextSafe(r)].join(" ").toLowerCase().includes(q)) : autoRules;
  if (autoCount) autoCount.textContent = t("auto.count").replace("{n}", list.length);
  if (!list.length) {
    autoRulesEl.innerHTML = `<div class="retro-empty">${escapeHtml(autoRules.length ? t("auto.emptyMatch") : t("auto.empty"))}</div>`;
    return;
  }
  autoRulesEl.innerHTML = list.map((r) => {
    const last = latestRun(r.id);
    return `<div class="auto-card ${r.enabled ? "" : "off"}" data-auto-id="${escapeHtml(r.id)}">
      <div class="auto-card-head">
        <span class="tag ${r.enabled ? "ok" : ""}">${escapeHtml(r.enabled ? t("auto.enabled") : t("auto.disabled"))}</span>
        <span class="tag ${r.risk === "high" ? "bad" : r.risk === "low" ? "ok" : "warn"}">${escapeHtml(t("auto.risk"))} ${escapeHtml(r.risk || "medium")}</span>
        <label class="auto-switch" title="${escapeHtml(t("auto.toggle"))}"><input type="checkbox" data-auto-toggle ${r.enabled ? "checked" : ""}><span></span></label>
      </div>
      <div class="auto-card-title">${escapeHtml(r.name)}</div>
      ${r.description ? `<div class="auto-card-desc">${escapeHtml(r.description)}</div>` : ""}
      <div class="auto-card-line"><span>${escapeHtml(t("auto.trigger"))}</span>${escapeHtml(autoTriggerTextSafe(r))}</div>
      <div class="auto-card-line"><span>${escapeHtml(t("auto.action"))}</span>${escapeHtml(autoActionText(r))}</div>
      <div class="auto-card-meta">
        <span>${escapeHtml(t("auto.cooldown"))}: ${r.cooldownSec || 0}s</span>
        <span>${escapeHtml(t("auto.maxRuns"))}: ${r.maxRunsPerHour || 3}/h</span>
        <span>${last ? escapeHtml(t("auto.lastRun")) + ": " + escapeHtml(autoTime(last.at)) : escapeHtml(t("auto.neverRun"))}</span>
        ${last ? autoStatusBadge(last.ok, last.ok ? t("auto.runOk") : t("auto.runFail")) : ""}
        ${last?.test ? `<span class="tag">${escapeHtml(t("auto.testBadge"))}</span>` : ""}
        ${last?.manual ? `<span class="tag">${escapeHtml(t("auto.manualBadge"))}</span>` : ""}
      </div>
      <div class="auto-card-actions">
        <button class="btn small" data-auto-run="${escapeHtml(r.id)}">${escapeHtml(t("auto.runNow"))}</button>
        <button class="btn small" data-auto-edit="${escapeHtml(r.id)}">${escapeHtml(t("auto.edit"))}</button>
        <button class="btn small danger" data-auto-del="${escapeHtml(r.id)}">${escapeHtml(t("auto.delete"))}</button>
      </div>
    </div>`;
  }).join("");
}

function autoRunFiltered() {
  const q = autoQuery.trim().toLowerCase();
  const nameOf = (id) => autoRules.find((r) => r.id === id)?.name || id;
  return q ? autoRuns.filter((r) => [nameOf(r.automationId), r.output, r.stdout, r.stderr, r.script, JSON.stringify(r.checks || [])].join(" ").toLowerCase().includes(q)) : autoRuns;
}

function autoRunPageItems() {
  return autoRunFiltered().slice((autoRunPage - 1) * autoRunPageSize, autoRunPage * autoRunPageSize);
}

function updateAutoRunSelection() {
  const ids = autoRunPageItems().map((r) => r.id);
  const selected = ids.filter((id) => autoRunSelected.has(id)).length;
  const all = document.getElementById("auto-run-select-all");
  if (all) {
    all.checked = ids.length > 0 && selected === ids.length;
    all.indeterminate = selected > 0 && selected < ids.length;
  }
  const del = document.getElementById("auto-run-delete");
  if (del) {
    del.disabled = autoRunSelected.size === 0;
    del.textContent = t("auto.deleteSelected") + (autoRunSelected.size ? ` (${autoRunSelected.size})` : "");
  }
}

function renderAutoRunPager(pages, total) {
  return `<div class="incident-pager">${pagerHtml("auto-run", autoRunPageSize, autoRunPage, pages, total)}</div>`;
}

function renderAutoRuns() {
  const list = autoRunFiltered();
  const nameOf = (id) => autoRules.find((r) => r.id === id)?.name || id;
  const pages = Math.max(1, Math.ceil(list.length / autoRunPageSize));
  if (autoRunPage > pages) autoRunPage = pages;
  if (autoRunPage < 1) autoRunPage = 1;
  if (autoCount) autoCount.textContent = `${t("auto.count").replace("{n}", list.length)} · ${t("auto.page").replace("{p}", autoRunPage).replace("{n}", pages)}`;
  const items = list.slice((autoRunPage - 1) * autoRunPageSize, autoRunPage * autoRunPageSize);
  const selectedOnPage = items.filter((r) => autoRunSelected.has(r.id)).length;
  const toolbar = `<div class="auto-runs-toolbar"><label class="inc-select-all"><input type="checkbox" id="auto-run-select-all" ${items.length > 0 && selectedOnPage === items.length ? "checked" : ""}><span>${t("auto.selectAll")}</span></label><button class="btn small danger" id="auto-run-delete" ${autoRunSelected.size ? "" : "disabled"}>${t("auto.deleteSelected")}${autoRunSelected.size ? ` (${autoRunSelected.size})` : ""}</button></div>`;
  if (!list.length) {
    autoRunsEl.innerHTML = toolbar + `<div class="retro-empty">${escapeHtml(t("auto.noRuns"))}</div>`;
    updateAutoRunSelection();
    return;
  }
  autoRunsEl.innerHTML = toolbar + items.map((r) => {
    const scriptTest = r.kind === "script-test";
    const title = scriptTest ? t("auto.scriptTest") : nameOf(r.automationId);
    const meta = `${autoTime(r.at)} · ${r.durationMs || 0}ms${scriptTest ? " · " + t("auto.exitCode") + " " + (r.exitCode ?? "—") : ""}${r.test ? " · " + t("auto.testBadge") : ""}${r.manual ? " · " + t("auto.manualBadge") : ""}`;
    const body = scriptTest ? `
      <div class="auto-run-line"><span>${escapeHtml(t("auto.scriptTitle"))}</span></div>
      <pre>${escapeHtml(r.script || "")}</pre>
      ${r.stdout ? `<div class="auto-run-line"><span>stdout</span></div><pre>${escapeHtml(r.stdout)}</pre>` : ""}
      ${r.stderr ? `<div class="auto-run-line"><span>stderr</span></div><pre>${escapeHtml(r.stderr)}</pre>` : ""}`
      : `
      <div class="auto-run-line"><span>${escapeHtml(t("auto.action"))}</span><code>${escapeHtml(autoActionText(r))}</code></div>
      ${(r.checks || []).map((c) => `<div class="auto-run-check">${autoStatusBadge(c.ok, c.type)} ${escapeHtml(c.detail || "")}</div>`).join("")}
      ${(r.steps || []).map((s) => `<div class="auto-run-check">${autoStatusBadge(s.ok, s.label)} <code>${escapeHtml(s.command)}</code><pre>${escapeHtml(s.output || "")}</pre></div>`).join("")}
      <pre class="auto-run-out">${escapeHtml(r.output || "")}</pre>`;
    return `<details class="auto-run">
      <summary>
        <label class="incident-check"><input type="checkbox" data-auto-run-select="${escapeHtml(r.id)}" ${autoRunSelected.has(r.id) ? "checked" : ""}></label>
        ${autoStatusBadge(r.ok, r.ok ? t("auto.runOk") : t("auto.runFail"))}
        <b>${escapeHtml(title)}</b>
        <span class="auto-run-meta">${escapeHtml(meta)}</span>
        <button class="btn small danger auto-run-del" data-auto-run-del="${escapeHtml(r.id)}">${escapeHtml(t("auto.delete"))}</button>
      </summary>
      <div class="auto-run-body">${body}</div>
    </details>`;
  }).join("") + renderAutoRunPager(pages, list.length);
  updateAutoRunSelection();
}

function askAutoRunDelete(ids) {
  autoDeleteMode = "run";
  autoRunDeleteIds = ids.filter(Boolean);
  if (!autoRunDeleteIds.length) return;
  autoRunDeleteTitle.textContent = t("auto.deleteRunTitle");
  autoRunDeleteText.textContent = t("auto.deleteRunText").replace("{n}", autoRunDeleteIds.length);
  autoRunDeleteErr.textContent = "";
  autoRunDeletePw.value = "";
  autoRunDeleteMask.classList.add("show");
  setTimeout(() => autoRunDeletePw.focus(), 50);
}

function askAutoRuleDelete(rule) {
  autoDeleteMode = "rule";
  autoRunDeleteIds = [rule.id];
  autoDeleteRuleName = rule.name;
  autoRunDeleteTitle.textContent = t("auto.deleteRuleTitle");
  autoRunDeleteText.textContent = t("auto.delConfirm").replace("{name}", rule.name);
  autoRunDeleteErr.textContent = "";
  autoRunDeletePw.value = "";
  autoRunDeleteMask.classList.add("show");
  setTimeout(() => autoRunDeletePw.focus(), 50);
}

async function confirmAutoRunDelete() {
  const password = autoRunDeletePw.value.trim();
  if (!password) { autoRunDeleteErr.textContent = t("auto.rootPwdRequired"); return; }
  const isRule = autoDeleteMode === "rule";
  autoRunDeleteConfirm.disabled = true;
  try {
    const res = await fetch(isRule ? "api/automations" : "api/automations/runs", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(isRule ? { id: autoRunDeleteIds[0], password } : { ids: autoRunDeleteIds, password }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) { autoRunDeleteErr.textContent = data.error || t("auto.deleteRunFail"); return; }
    if (!isRule) for (const id of autoRunDeleteIds) autoRunSelected.delete(id);
    autoRunDeleteMask.classList.remove("show");
    if (typeof showSaveMsg === "function") showSaveMsg(isRule ? t("auto.ruleDeleted").replace("{name}", autoDeleteRuleName) : t("auto.runsDeleted").replace("{n}", data.deleted ?? autoRunDeleteIds.length), "ok");
    await loadAutomations();
  } finally {
    autoRunDeleteConfirm.disabled = false;
  }
}

function renderAutoAll() {
  if (autoTab === "runs") { autoRulesEl.style.display = "none"; autoRunsEl.style.display = "flex"; autoCommandsWrap.style.display = "none"; renderAutoRuns(); return; }
  if (autoTab === "commands") { autoRulesEl.style.display = "none"; autoRunsEl.style.display = "none"; autoCommandsWrap.style.display = "block"; autoCommands.value = autoCommandsList.join("\n"); return; }
  autoRulesEl.style.display = "grid"; autoRunsEl.style.display = "none"; autoCommandsWrap.style.display = "none";
  renderAutoRules();
}

async function loadAutomations() {
  if (autoTab !== "commands" && !(autoTab === "runs" ? autoRuns.length : autoRules.length)) {
    (autoTab === "runs" ? autoRunsEl : autoRulesEl).innerHTML = listLoadingHtml(t("auto.loading"));
  }
  try {
    const res = await fetch("api/automations");
    const data = await res.json();
    autoRules = Array.isArray(data.rules) ? data.rules : [];
    autoRuns = Array.isArray(data.runs) ? data.runs : [];
    autoCommandsList = Array.isArray(data.commands) ? data.commands : [];
  } catch {
    autoRules = [];
    autoRuns = [];
  }
  const runIds = new Set(autoRuns.map((r) => r.id));
  autoRunSelected = new Set([...autoRunSelected].filter((id) => runIds.has(id)));
  renderAutoAll();
}

function setAutoTab(tab) {
  autoTab = tab;
  document.querySelectorAll("[data-auto-tab]").forEach((b) => b.classList.toggle("active", b.dataset.autoTab === tab));
  renderAutoAll();
}

const autoField = (id) => document.getElementById(id);
const autoTr = (id) => { const e = autoField(id); return e ? e.value.trim() : ""; };

function setTriggerType(type) {
  autoField("auto-trigger-type").value = type;
  document.querySelectorAll("[data-trigger]").forEach((p) => { p.style.display = p.dataset.trigger === type ? "block" : "none"; });
  autoField("auto-mount").closest(".field").style.display = type === "metric" && autoField("auto-metric").value === "disk" ? "" : "none";
}

function setActionType(type) {
  autoField("auto-action-type").value = type;
  document.querySelectorAll("[data-action]").forEach((p) => {
    const show = p.dataset.action === "service" ? (type === "restart_service" || type === "reload_service") : p.dataset.action === type;
    p.style.display = show ? "block" : "none";
  });
}

function setManager(type) {
  const manager = AUTO_MANAGERS.has(type) ? type : "systemd";
  autoManager.value = manager;
  document.querySelectorAll("[data-manager]").forEach((p) => { p.style.display = p.dataset.manager === manager ? "block" : "none"; });
  if (manager === "custom") {
    const at = autoField("auto-action-type").value;
    if (at === "restart_service" || at === "reload_service") setActionType("run_command");
  }
}

async function detectAutoManager() {
  const raw = autoTr("auto-trig-service") || autoTr("auto-act-service");
  const service = raw.replace(/\/+$/, "").split("/").pop();
  if (!service) { autoModalStatus.textContent = t("auto.serviceRequired"); return; }
  autoDetect.disabled = true;
  autoModalStatus.textContent = t("auto.detecting");
  try {
    const res = await fetch("api/automations/detect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) { autoModalStatus.textContent = data.error || t("auto.detectFail"); return; }
    setManager(data.manager);
    autoModalStatus.textContent = t("auto.detected").replace("{manager}", data.manager);
    if (data.manager === "custom" && !autoStatusCommand.value.trim()) autoStatusCommand.focus();
  } finally {
    autoDetect.disabled = false;
  }
}

function applyRuleToForm(rule) {
  const tr = rule.trigger || { type: "service_down" };
  autoField("auto-name").value = rule.name || "";
  autoField("auto-desc").value = rule.description || "";
  autoField("auto-risk").value = rule.risk || "medium";
  autoField("auto-cooldown").value = rule.cooldownSec ?? 300;
  autoField("auto-max").value = rule.maxRunsPerHour ?? 3;
  setManager(rule.manager || "systemd");
  if (autoStatusCommand) autoStatusCommand.value = tr.statusCommand || "";
  setTriggerType(tr.type || "service_down");
  autoField("auto-trig-service").value = tr.service || "";
  autoField("auto-metric").value = tr.metric || "cpu";
  autoField("auto-op").value = tr.op || ">=";
  autoField("auto-threshold").value = tr.threshold ?? "";
  autoField("auto-mount").value = tr.mount || "/";
  autoField("auto-duration").value = tr.durationSec ?? 0;
  autoField("auto-url").value = tr.url || "";
  autoField("auto-method").value = tr.method || "GET";
  autoField("auto-expect").value = tr.expectStatus ?? 200;
  autoField("auto-consecutive").value = tr.consecutiveFailures ?? 2;
  autoField("auto-to").value = tr.timeoutSec ?? 10;
  autoField("auto-every").value = tr.everySec ?? "";
  autoField("auto-daily").value = tr.dailyAt || "";
  const a = rule.action || { type: "restart_service" };
  setActionType(a.type || "restart_service");
  if (autoManager.value === "custom" && ["restart_service", "reload_service"].includes(autoField("auto-action-type").value)) setActionType("run_command");
  autoField("auto-act-service").value = a.service || "";
  autoField("auto-act-command").value = a.command || "";
  autoField("auto-act-url").value = a.url || "";
  renderAutoActionScript();
}

const autoShq = (v) => "'" + String(v ?? "").replace(/'/g, "'\\''") + "'";

const AUTO_MANAGERS = new Set(["systemd", "pm2", "docker", "supervisor", "custom"]);
const autoManagerOf = (rule) => AUTO_MANAGERS.has(rule?.manager) ? rule.manager : "systemd";
function autoManagerAction(rule) {
  const a = rule.action || {};
  const manager = autoManagerOf(rule);
  if (a.type === "run_command") return a.command || "# 未配置命令";
  if (a.type === "webhook") return `curl -fsS -X POST --max-time ${a.timeoutSec || 10} ${autoShq(a.url || "")}`;
  const verb = a.type === "reload_service" ? "reload" : "restart";
  const svc = a.service || "?";
  if (manager === "systemd") return `systemctl ${verb} ${svc}`;
  if (manager === "pm2") return `pm2 ${verb} ${svc}`;
  if (manager === "docker") return `docker restart ${svc}`;
  if (manager === "supervisor") return `supervisorctl restart ${svc}`;
  return "# 自定义管理器请使用 run_command";
}
function autoManagerVerify(v) {
  if (v.type === "service_active") return `systemctl is-active --quiet ${v.service || "?"}`;
  if (v.type === "pm2_online") return `pm2 describe ${v.service || "?"} | grep -q online`;
  if (v.type === "docker_running") return `test "$(docker inspect -f '{{.State.Running}}' ${v.service || "?"})" = "true"`;
  if (v.type === "supervisor_running") return `supervisorctl status ${v.service || "?"} | grep -q RUNNING`;
  if (v.type === "custom_active") return v.command || "# 未配置状态检查命令";
  if (v.type === "http_status") return `test "$(curl -s -o /dev/null -w '%{http_code}' ${autoShq(v.url || "")})" = "${v.expectStatus ?? 200}"`;
  if (v.type === "command_exit") return v.command || "# 未配置断言命令";
  return "# 未知断言";
}
function autoManagerStop(manager, service) {
  if (manager === "systemd") return `systemctl stop ${service}`;
  if (manager === "pm2") return `pm2 stop ${service}`;
  if (manager === "docker") return `docker stop ${service}`;
  if (manager === "supervisor") return `supervisorctl stop ${service}`;
  return "";
}
function autoManagerStart(manager, service) {
  if (manager === "systemd") return `systemctl start ${service}`;
  if (manager === "pm2") return `pm2 start ${service}`;
  if (manager === "docker") return `docker start ${service}`;
  if (manager === "supervisor") return `supervisorctl start ${service}`;
  return "";
}

function buildAutomationScript(rule) {
  const manager = autoManagerOf(rule);
  const lines = ["#!/usr/bin/env bash", `# 自动化：${rule.name || "未命名"}（${manager}）`];
  const tr = rule.trigger || {};
  if (tr.type === "service_down") lines.push(`# 触发：${manager} 服务 ${tr.service || "?"} 不是运行中`);
  else if (tr.type === "metric") lines.push(`# 触发：${tr.metric || "?"} ${tr.op || ">="} ${tr.threshold ?? "?"}${tr.durationSec ? `，持续 ${tr.durationSec}s` : ""}`);
  else if (tr.type === "http") lines.push(`# 触发：${tr.method || "GET"} ${tr.url || "?"} 状态码不等于 ${tr.expectStatus ?? 200}（连续 ${tr.consecutiveFailures ?? 2} 次）`);
  else if (tr.type === "cron") lines.push(`# 触发：${tr.everySec ? `每 ${tr.everySec}s` : `每天 ${tr.dailyAt || "?"}`}`);
  lines.push("", "# 动作", autoManagerAction(rule));
  if (Array.isArray(rule.verify) && rule.verify.length) {
    lines.push("", "# 断言");
    for (const v of rule.verify) lines.push(autoManagerVerify(v));
  }
  return lines.join("\n") + "\n";
}

function buildDefaultTestScript(rule) {
  const manager = autoManagerOf(rule);
  const tr = rule.trigger || {};
  const a = rule.action || {};
  const svc = manager !== "custom" && tr.type === "service_down" ? (tr.service || "") : "";
  const verify = Array.isArray(rule.verify) ? rule.verify.slice() : [];
  if (!verify.length && a.service) {
    const type = { systemd: "service_active", pm2: "pm2_online", docker: "docker_running", supervisor: "supervisor_running" }[manager];
    if (type) verify.push({ type, service: a.service });
  }
  const lines = ["#!/usr/bin/env bash", "set -euo pipefail", `# 默认测试脚本：${rule.name || "自动化"}（${manager}）`];
  if (svc) {
    lines.push(`restore() { ${autoManagerStart(manager, svc)} || true; }`, "trap restore EXIT");
    lines.push(`echo "[1/4] 停止 ${svc}"`, autoManagerStop(manager, svc));
  } else {
    lines.push(`echo "[1/4] 准备测试（该触发类型无需注入故障）"`);
  }
  lines.push(`echo "[2/4] 执行动作"`, autoManagerAction(rule));
  lines.push(`echo "[3/4] 断言"`);
  if (verify.length) for (const v of verify) lines.push(autoManagerVerify(v));
  else lines.push("true");
  lines.push(`echo "[4/4] 清理"`);
  if (svc) lines.push(autoManagerStart(manager, svc));
  lines.push(`echo "测试通过"`);
  return lines.join("\n") + "\n";
}

function renderAutoActionScript() {
  autoActionScriptEl.textContent = buildAutomationScript({ ...collectAutoRule(), verify: autoEditingVerify });
}

function renderAutoScript() {
  autoScriptEl.value = autoScript;
}

function isAutoMode() { return autoMode; }

function resetAutoModeDraft() { autoDraft = null; }

function enterAutoMode() {
  autoMode = true;
  document.getElementById("view-chat")?.classList.add("auto-mode");
  if (autoModeBanner) autoModeBanner.style.display = "flex";
  autoModeBtn?.classList.add("active");
  if (ctx?.input) ctx.input.placeholder = t("auto.modePlaceholder");
  const last = [...chatHistory].reverse().find((m) => m.role === "assistant" && m.kind === "automation");
  if (last?.rule) autoDraft = { rule: last.rule, script: last.script || last.rule.testScript || "" };
  loadAutomations();
  if (location.hash !== "#/chat") location.hash = "/chat";
  ctx?.input?.focus();
}

function exitAutoMode() {
  autoMode = false;
  document.getElementById("view-chat")?.classList.remove("auto-mode");
  if (autoModeBanner) autoModeBanner.style.display = "none";
  autoModeBtn?.classList.remove("active");
  if (ctx?.input) ctx.input.placeholder = t("chat.inputPh");
}

function notifyAutoSaved(rule) {
  if (!autoMode) return;
  addMsg(t("auto.savedNotice").replace("{name}", rule.name), "assistant");
}

function renderAutomationCard(rule, script, persist = true) {
  if (persist) {
    chatHistory.push({ role: "assistant", text: t("auto.cardText").replace("{name}", rule.name), kind: "automation", rule, script });
    saveHistory();
  }
  const item = document.createElement("div");
  item.className = "message-item bot auto-card-msg";
  item.innerHTML = `
    <div class="msg-header"><span class="avatar bot">${icon("robot")}</span><span class="msg-role">Fixflow</span></div>
    <div class="bubble">
      <div class="auto-chat-card">
        <div class="auto-chat-card-head"><b>${escapeHtml(rule.name)}</b><span class="tag">${escapeHtml(autoTriggerTextSafe(rule))}</span></div>
        <div class="auto-chat-card-meta">${escapeHtml(autoActionText(rule))}</div>
        <div class="auto-code">
          <div class="auto-code-head"><span class="auto-code-lang">bash</span></div>
          <pre class="auto-chat-script">${escapeHtml(script)}</pre>
        </div>
        <div class="auto-chat-card-actions"><button class="btn small" data-auto-apply>${escapeHtml(t("auto.apply"))}</button></div>
      </div>
    </div>`;
  item.querySelector("[data-auto-apply]")?.addEventListener("click", () => openAutoDetail({ ...rule, testScript: script }));
  ctx.log.appendChild(item);
  scrollLog();
}

function renderAutomationHistory(msg) {
  renderAutomationCard(msg.rule, msg.script, false);
}

async function sendAutoModeMessage() {
  const text = ctx.input.value.trim();
  if (!text) return;
  const history = chatHistory
    .filter((m) => m.role && typeof m.text === "string" && !m.kind)
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.text }));
  ctx.input.value = "";
  if (ctx.preview) ctx.preview.innerHTML = "";
  if (ctx.charCount) ctx.charCount.textContent = "";
  addMsg(text, "user");
  stickToBottom = true;
  setBusy(true);
  showTyping();
  try {
    const res = await fetch("api/automations/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, rule: autoDraft?.rule, script: autoDraft?.script, history }),
    });
    const data = await res.json().catch(() => ({}));
    hideTyping();
    if (!res.ok || data.error) { addMsg(data.error || t("auto.chatFail"), "assistant"); return; }
    autoDraft = { rule: data.rule, script: data.script || data.rule.testScript || "" };
    autoDraft.rule.testScript = autoDraft.script;
    renderAutomationCard(autoDraft.rule, autoDraft.script);
  } catch (e) {
    hideTyping();
    addMsg(String(e?.message || e), "assistant");
  } finally {
    setBusy(false);
    hideTyping();
  }
}

function openAutoDetail(rule) {
  const persisted = Boolean(rule?.id && autoRules.some((r) => r.id === rule.id));
  autoEditing = persisted ? rule : null;
  autoDraft = rule ? { ...rule } : null;
  autoEditingVerify = Array.isArray(rule?.verify) ? rule.verify : [];
  autoScript = rule?.testScript || "";
  if (!autoScript && rule?.id) {
    const card = [...chatHistory].reverse().find((m) => m.kind === "automation" && m.rule?.id === rule.id && typeof m.script === "string");
    if (card) autoScript = card.script;
  }
  let generatedScript = false;
  if (!autoScript && rule) { autoScript = buildDefaultTestScript(rule); generatedScript = true; }
  autoFormTitle.textContent = persisted ? t("auto.edit") : t("auto.applyTitle");
  applyRuleToForm(rule || {});
  renderAutoScript();
  autoLastRun = null;
  if (autoAiFix) autoAiFix.style.display = "none";
  autoRunResult.innerHTML = "";
  autoRunStatus.textContent = "";
  autoModalStatus.textContent = generatedScript ? t("auto.scriptGenerated") : "";
  autoMask.classList.add("show");
  const body = autoMask.querySelector(".auto-modal-body");
  if (body) body.scrollTop = 0;
}

function collectAutoRule() {
  const type = autoField("auto-trigger-type").value;
  let trigger;
  if (type === "service_down") trigger = { type, service: autoTr("auto-trig-service"), ...(autoManager.value === "custom" ? { statusCommand: autoTr("auto-status-command") } : {}) };
  else if (type === "metric") trigger = { type, metric: autoField("auto-metric").value, op: autoField("auto-op").value, threshold: Number(autoTr("auto-threshold")), mount: autoTr("auto-mount") || "/", durationSec: Number(autoTr("auto-duration")) || 0 };
  else if (type === "http") trigger = { type, url: autoTr("auto-url"), method: autoField("auto-method").value, expectStatus: Number(autoTr("auto-expect")), consecutiveFailures: Number(autoTr("auto-consecutive")), timeoutSec: Number(autoTr("auto-to")) };
  else {
    const everySec = Number(autoTr("auto-every"));
    trigger = everySec ? { type, everySec } : { type, dailyAt: autoTr("auto-daily") };
  }
  const at = autoField("auto-action-type").value;
  const action = at === "run_command" ? { type: at, command: autoTr("auto-act-command") }
    : at === "webhook" ? { type: at, url: autoTr("auto-act-url") }
    : { type: at, service: autoTr("auto-act-service") };
  return {
    name: autoTr("auto-name"),
    description: autoTr("auto-desc"),
    manager: autoManager.value,
    risk: autoField("auto-risk").value,
    trigger,
    action,
    cooldownSec: Number(autoTr("auto-cooldown")) || 0,
    maxRunsPerHour: Number(autoTr("auto-max")) || 3,
  };
}

async function saveAutoRule(keepOpen = false) {
  const body = collectAutoRule();
  if (!body.name) { autoModalStatus.textContent = t("auto.nameRequired"); return null; }
  const oldService = autoDraft?.action?.service || autoEditing?.action?.service;
  const verify = autoEditingVerify.filter((v) => !(v.type === "service_active" && oldService && v.service === oldService));
  body.testScript = autoScript;
  body.verify = verify;
  if (autoEditing?.id) body.id = autoEditing.id;
  else if (autoDraft?.id) body.id = autoDraft.id;
  autoSave.disabled = true;
  try {
    const send = (method) => fetch("api/automations", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    let res = await send(autoEditing ? "PATCH" : "POST");
    let data = await res.json().catch(() => ({}));
    if (!res.ok && !autoEditing && res.status === 409 && body.id) {
      res = await send("PATCH");
      data = await res.json().catch(() => ({}));
    }
    if (!res.ok || data.error) { autoModalStatus.textContent = data.error || t("auto.saveFail"); return null; }
    autoEditing = data.rule;
    autoDraft = data.rule;
    autoEditingVerify = Array.isArray(data.rule.verify) ? data.rule.verify : [];
    autoScript = data.rule.testScript || autoScript;
    renderAutoScript();
    autoModalStatus.textContent = t("auto.saved");
    await loadAutomations();
    if (!keepOpen) {
      autoMask.classList.remove("show");
      notifyAutoSaved(data.rule);
    }
    return data.rule;
  } finally {
    autoSave.disabled = false;
  }
}

function appendAutoTestLog(id, line) {
  if (!autoMask.classList.contains("show")) return;
  const current = autoEditing?.id || autoDraft?.id;
  if (id && current && id !== current) return;
  const box = document.getElementById("auto-run-log");
  if (!box) return;
  box.textContent += String(line ?? "") + "\n";
  box.scrollTop = box.scrollHeight;
}

function renderRunResult(run) {
  autoLastRun = run;
  if (autoAiFix) autoAiFix.style.display = run?.kind === "script-test" && run.ok === false ? "" : "none";
  if (run.kind === "script-test") {
    const out = (label, text) => text ? `<div class="auto-run-line"><span>${escapeHtml(label)}</span></div><pre>${escapeHtml(text)}</pre>` : "";
    autoRunResult.innerHTML = `<div class="auto-card-line"><span>${escapeHtml(t("auto.runResult"))}</span>${autoStatusBadge(run.ok, run.ok ? t("auto.runOk") : t("auto.runFail"))}</div>
      <div class="auto-run-meta">${escapeHtml(t("auto.exitCode"))}: ${escapeHtml(run.exitCode ?? "—")} · ${escapeHtml(t("auto.duration"))}: ${run.durationMs || 0}ms</div>
      ${out("stdout", run.stdout)}${out("stderr", run.stderr)}`;
    return;
  }
  const checks = (run.checks || []).map((c) => `<div class="auto-run-check">${autoStatusBadge(c.ok, c.type)} ${escapeHtml(c.detail || "")}</div>`).join("");
  autoRunResult.innerHTML = `<div class="auto-card-line"><span>${escapeHtml(t("auto.runResult"))}</span>${autoStatusBadge(run.ok, run.ok ? t("auto.runOk") : t("auto.runFail"))}</div>
    <div class="auto-run-line"><span>${escapeHtml(t("auto.action"))}</span><code>${escapeHtml(autoActionText(run))}</code></div>
    ${checks}<pre class="auto-run-out">${escapeHtml(run.output || "")}</pre>`;
}

function handleAutoConfirm(ev) {
  const riskLabel = { low: t("risk.low"), medium: t("risk.mid"), high: t("risk.high") }[ev.riskLevel] || t("risk.mid");
  autoRunStatus.textContent = "";
  autoRunResult.innerHTML = `<div class="auto-confirm">
    <div class="auto-card-line"><span>${escapeHtml(t("risk.approval"))}</span><span class="tag warn">${escapeHtml(riskLabel)}</span></div>
    ${ev.reason ? `<div class="auto-run-line"><span>${escapeHtml(t("risk.reason"))}</span>${escapeHtml(ev.reason)}</div>` : ""}
    ${ev.impact ? `<div class="auto-run-line"><span>${escapeHtml(t("risk.impact"))}</span>${escapeHtml(ev.impact)}</div>` : ""}
    <pre>${escapeHtml(ev.command || "")}</pre>
    <div class="auto-confirm-actions">
      <button class="btn small" id="auto-confirm-yes">${escapeHtml(t("proc.confirm"))}</button>
      <button class="btn small" id="auto-confirm-no">${escapeHtml(t("risk.reject"))}</button>
    </div>
  </div>`;
  const answer = (ok) => fetch("api/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ev.id, ok }) });
  document.getElementById("auto-confirm-yes").onclick = () => { autoRunStatus.textContent = t("auto.running"); autoRunResult.innerHTML = `<pre id="auto-run-log" class="auto-run-log"></pre>`; answer(true); };
  document.getElementById("auto-confirm-no").onclick = () => { autoRunStatus.textContent = t("auto.rejected"); autoRunResult.innerHTML = ""; answer(false); };
}

async function runAutoFix() {
  if (!autoLastRun || !autoScript.trim() || autoAiFix.disabled) return;
  autoAiFix.disabled = true;
  autoRunStatus.textContent = t("auto.aiFixing");
  try {
    const base = autoEditing || autoDraft || {};
    const rule = { ...collectAutoRule(), id: base.id, createdAt: base.createdAt, state: base.state, verify: autoEditingVerify };
    const res = await fetch("api/automations/test-fix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule, script: autoScript, run: autoLastRun }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) { autoRunStatus.textContent = data.error || t("auto.aiFixFail"); return; }
    autoDraft = data.rule;
    autoScript = data.script || data.rule.testScript || "";
    autoEditingVerify = Array.isArray(data.rule.verify) ? data.rule.verify : [];
    applyRuleToForm(data.rule);
    renderAutoScript();
    if (autoAiFix) autoAiFix.style.display = "none";
    autoRunStatus.textContent = t("auto.aiFixApplied");
    autoRunResult.innerHTML = `<div class="auto-card-line"><span>${escapeHtml(t("auto.aiFixResult"))}</span>${autoStatusBadge(true, t("auto.aiFixed"))}</div>${data.explanation ? `<div class="auto-run-line"><span>${escapeHtml(t("auto.aiExplain"))}</span>${escapeHtml(data.explanation)}</div>` : ""}`;
  } finally {
    autoAiFix.disabled = false;
  }
}

async function runAutoScript() {
  if (!autoScript.trim()) { autoRunStatus.textContent = t("auto.needScript"); return; }
  autoBusy = true;
  autoRunTest.disabled = true;
  autoRunStatus.textContent = t("auto.runSaving");
  try {
    const saved = await saveAutoRule(true);
    if (!saved) { autoRunStatus.textContent = ""; return; }
    autoRunStatus.textContent = t("auto.runWaiting");
    const res = await fetch("api/automations/test-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: saved.id, script: autoScript }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.error) { autoRunStatus.textContent = data.error; return; }
    if (data.rejected) { autoRunStatus.textContent = t("auto.rejected"); return; }
    autoRunStatus.textContent = "";
    renderRunResult(data.run || {});
    await loadAutomations();
  } finally {
    autoBusy = false;
    autoRunTest.disabled = false;
  }
}

async function runAutoNow(rule) {
  openAutoDetail(rule);
  autoBusy = true;
  autoRunStatus.textContent = t("auto.running");
  try {
    const res = await fetch("api/automations/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.error) { autoRunStatus.textContent = data.error; return; }
    autoRunStatus.textContent = "";
    renderRunResult(data.run || {});
    await loadAutomations();
  } finally {
    autoBusy = false;
  }
}

autoSearch.addEventListener("input", () => { autoQuery = autoSearch.value; autoRunPage = 1; renderAutoAll(); });
autoRefresh.addEventListener("click", loadAutomations);
const closeAutoDetail = () => { if (!autoBusy) autoMask.classList.remove("show"); };
autoClose.addEventListener("click", closeAutoDetail);
autoCancel.addEventListener("click", closeAutoDetail);
autoSave.addEventListener("click", () => saveAutoRule(false));
autoScriptEl.addEventListener("input", () => { autoScript = autoScriptEl.value; });
autoRunTest.addEventListener("click", runAutoScript);
autoAiFix.addEventListener("click", runAutoFix);
autoScriptCopy.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(autoScript); autoRunStatus.textContent = t("auto.copied"); }
  catch { autoRunStatus.textContent = t("auto.copyFail"); }
});
autoActionCopy.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(autoActionScriptEl.textContent); autoModalStatus.textContent = t("auto.copied"); }
  catch { autoModalStatus.textContent = t("auto.copyFail"); }
});
autoMask.addEventListener("input", renderAutoActionScript);
autoMask.addEventListener("change", renderAutoActionScript);
autoModeBtn?.addEventListener("click", () => (autoMode ? exitAutoMode() : enterAutoMode()));
autoModeExit?.addEventListener("click", exitAutoMode);
autoModeNew?.addEventListener("click", () => { autoDraft = null; addMsg(t("auto.modeNewHint"), "assistant"); });
autoField("auto-trigger-type").addEventListener("change", (e) => setTriggerType(e.target.value));
autoField("auto-action-type").addEventListener("change", (e) => setActionType(e.target.value));
autoField("auto-metric").addEventListener("change", () => setTriggerType(autoField("auto-trigger-type").value));
autoManager.addEventListener("change", (e) => setManager(e.target.value));
autoDetect.addEventListener("click", detectAutoManager);
document.querySelectorAll("[data-auto-tab]").forEach((b) => b.addEventListener("click", () => setAutoTab(b.dataset.autoTab)));

autoCommandsSave.addEventListener("click", async () => {
  const commands = autoCommands.value.split("\n").map((s) => s.trim()).filter(Boolean);
  const res = await fetch("api/automations/commands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commands }) });
  const data = await res.json().catch(() => ({}));
  if (data.error) alert(data.error);
  else { autoCommandsList = data.commands || commands; autoCommands.value = autoCommandsList.join("\n"); }
});

autoRunsEl.addEventListener("click", (e) => {
  const batch = e.target.closest("#auto-run-delete");
  if (batch) { e.preventDefault(); e.stopPropagation(); askAutoRunDelete([...autoRunSelected]); return; }
  const del = e.target.closest("[data-auto-run-del]");
  if (del) { e.preventDefault(); e.stopPropagation(); askAutoRunDelete([del.dataset.autoRunDel]); return; }
  const cb = e.target.closest("[data-auto-run-select]");
  if (cb) {
    e.stopPropagation();
    if (cb.checked) autoRunSelected.add(cb.dataset.autoRunSelect); else autoRunSelected.delete(cb.dataset.autoRunSelect);
    updateAutoRunSelection();
    return;
  }
  const page = e.target.closest("[data-auto-run-page]");
  if (page) { e.preventDefault(); e.stopPropagation(); autoRunPage = Number(page.dataset.autoRunPage) || 1; renderAutoRuns(); }
});
autoRunsEl.addEventListener("change", (e) => {
  if (e.target.matches("[data-auto-run-size]")) {
    autoRunPageSize = Number(e.target.value) || AUTO_RUN_PAGE_SIZE;
    savePageSize("runs", autoRunPageSize);
    autoRunPage = 1;
    renderAutoRuns();
    return;
  }
  if (e.target.id !== "auto-run-select-all") return;
  const ids = autoRunPageItems().map((r) => r.id);
  for (const id of ids) { if (e.target.checked) autoRunSelected.add(id); else autoRunSelected.delete(id); }
  renderAutoRuns();
});
autoRunsEl.addEventListener("keydown", (e) => {
  const input = e.target.closest("[data-auto-run-jump]");
  if (!input || e.key !== "Enter") return;
  e.preventDefault();
  const max = Math.max(1, Number(input.max) || 1);
  const n = parseInt(input.value, 10);
  autoRunPage = Math.min(max, Math.max(1, Number.isFinite(n) ? n : 1));
  renderAutoRuns();
});

if (autoRunDeleteClose) autoRunDeleteClose.onclick = () => autoRunDeleteMask.classList.remove("show");
if (autoRunDeleteCancel) autoRunDeleteCancel.onclick = () => autoRunDeleteMask.classList.remove("show");
if (autoRunDeleteConfirm) autoRunDeleteConfirm.onclick = confirmAutoRunDelete;
if (autoRunDeletePw) autoRunDeletePw.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); confirmAutoRunDelete(); } });
if (autoRunDeleteMask) autoRunDeleteMask.addEventListener("click", (e) => { if (e.target === autoRunDeleteMask) autoRunDeleteMask.classList.remove("show"); });

autoRulesEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const card = btn.closest("[data-auto-id]");
  const rule = card && autoRules.find((r) => r.id === card.dataset.autoId);
  if (!rule) return;
  if (btn.dataset.autoRun) runAutoNow(rule);
  else if (btn.dataset.autoEdit) openAutoDetail(rule);
  else if (btn.dataset.autoDel) askAutoRuleDelete(rule);
});
autoRulesEl.addEventListener("change", (e) => {
  const input = e.target.closest("[data-auto-toggle]");
  if (!input) return;
  const card = input.closest("[data-auto-id]");
  fetch("api/automations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: card.dataset.autoId, enabled: input.checked }) }).then(loadAutomations);
});
