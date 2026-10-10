const cards = document.getElementById("cards");
const log = document.getElementById("log");
const welcome = document.getElementById("welcome");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const stopBtn = document.getElementById("stop");
const charCount = document.getElementById("char-count");
const attachBtn = document.getElementById("attach");
const fileInput = document.getElementById("file");
const preview = document.getElementById("preview");
const clearBtn = document.getElementById("clear-history");
const miniLog = document.getElementById("mini-log");
const miniWelcome = document.getElementById("mini-welcome");
const miniInput = document.getElementById("mini-input");
const miniSend = document.getElementById("mini-send");
const miniStop = document.getElementById("mini-stop");
const miniCount = document.getElementById("mini-count");
const miniFullscreen = document.getElementById("ai-fullscreen");
const miniClose = document.getElementById("ai-close");
const aiFab = document.getElementById("ai-fab");
const aiPopup = document.getElementById("ai-popup");
const aiPopupHead = document.getElementById("ai-popup-head");
const chatCtx = { log, welcome, input, sendBtn, stopBtn, charCount, preview, clearBtn };
const miniCtx = { log: miniLog, welcome: miniWelcome, input: miniInput, sendBtn: miniSend, stopBtn: miniStop, charCount: miniCount, preview: null, clearBtn: clearBtn };
let ctx = chatCtx;
let stickToBottom = true;
const scrollLog = () => { if (stickToBottom) ctx.log.scrollTop = ctx.log.scrollHeight; };
log.addEventListener("scroll", () => {
  stickToBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
});
miniLog.addEventListener("scroll", () => {
  stickToBottom = miniLog.scrollHeight - miniLog.scrollTop - miniLog.clientHeight < 40;
});
const searchBox = document.getElementById("search");
const netTools = document.getElementById("net-tools");
const viewTitle = document.getElementById("view-title");
const viewMonitor = document.getElementById("view-monitor");
const viewChat = document.getElementById("view-chat");
const viewLogs = document.getElementById("view-logs");
const overviewEl = document.getElementById("overview");

let pendingImages = [];
let chatHistory = [];

// ---------- 内联图标（统一 SVG，替代 emoji） ----------
const ICON_PATHS = {
  check: '<path d="M4 12.5l5 5 11-11"/>',
  warn: '<path d="M12 3l9 16H3z"/><path d="M12 9.5v4.5M12 17h.01"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  xCircle: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  wrench: '<path d="M15 6a4 4 0 00-5.2 5.2L4 17v3h3l5.8-5.8A4 4 0 0018 9l-2.4 2.4-1.8-1.8L15 6z"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h7V3M8 21v-6h8v6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h8"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 21a2 2 0 01-3.4 0"/>',
  refresh: '<path d="M21 12a9 9 0 11-2.6-6.3"/><path d="M21 3v5h-5"/>',
  door: '<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"/><path d="M10 12H3M6 8l-3 4 3 4"/>',
  lock: '<rect x="4.5" y="10" width="15" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
  shield: '<path d="M12 3l7 3v5c0 4.6-3 7.6-7 9-4-1.4-7-4.4-7-9V6l7-3z"/>',
  terminal: '<path d="M5 6h14v12H5z"/><path d="M8 10l2.5 2.5L8 15M13 15h3"/>',
  fileCode: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9.5 13l-2 2 2 2M14.5 13l2 2-2 2"/>',
  book: '<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/><path d="M4 5v14"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 00.34 1.88l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.88-.34 1.7 1.7 0 00-1 1.55V21a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1.1-1.55 1.7 1.7 0 00-1.88.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.88 1.7 1.7 0 00-1.55-1H3a2 2 0 110-4h.09a1.7 1.7 0 001.55-1.1 1.7 1.7 0 00-.34-1.88l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.88.34h.01a1.7 1.7 0 001-1.55V3a2 2 0 114 0v.09a1.7 1.7 0 001 1.55 1.7 1.7 0 001.88-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.88v.01a1.7 1.7 0 001.55 1H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.51 1z"/>',
  robot: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V4M9 19v2M15 19v2"/><circle cx="9" cy="13.5" r="1.3"/><circle cx="15" cy="13.5" r="1.3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-3.5 3.6-6 8-6s8 2.5 8 6"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  zap: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.8 2.6 15.2 0 18M12 3c-2.6 2.8-2.6 15.2 0 18"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12"/>',
  database: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  activity: '<path d="M3 12h4l2.5-7 4 14 2.5-7H21"/>',
  layers: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><rect x="3" y="10" width="18" height="5" rx="1.5"/><rect x="3" y="16" width="18" height="4" rx="1.5"/>',
  message: '<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-5.2A8 8 0 1121 12z"/>',
  sparkles: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
};
function icon(name) {
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ""}</svg>`;
}

const MODULES = [
  ["system", "menu.system"],
  ["network", "menu.network"],
  ["nginx", "menu.nginx"],
  ["firewall", "menu.firewall"],
  ["acl", "menu.acl"],
  ["databases", "menu.databases"],
  ["docker", "menu.docker"],
  ["ssl", "menu.ssl"],
  ["systemd", "menu.systemd"],
];

let currentFilter = "all";
let lastRoute = localStorage.getItem("fixflow_route") || "all";
let chatView = false;
let logsView = false;
let metrics = {};
let busy = false;

// ---------- 路由（hash：#/system、#/network、#/chat） ----------
function applyRoute() {
  const raw = (location.hash.replace(/^#\/?/, "") || "all").trim();
  const helpOpen = raw === "help";
  helpMask.classList.toggle("show", helpOpen);
  if (!helpOpen) { lastRoute = raw; localStorage.setItem("fixflow_route", raw); }
  if (authMask.style.display === "flex") return;
  const route = helpOpen ? lastRoute : raw;
  document.querySelectorAll(".menu-item").forEach((i) => {
    const hit = route === "chat" ? i.dataset.view === "chat" : route === "logs" ? i.dataset.view === "logs" : i.dataset.view === "monitor" && i.dataset.filter === route;
    i.classList.toggle("active", hit);
  });
  chatView = route === "chat";
  logsView = route === "logs";
  aiFab.style.display = chatView ? "none" : "flex";
  if (route !== "chat" && aiPopup.style.display === "flex") closeAiPopup();
  if (route === "chat") {
    viewMonitor.style.display = "none";
    viewChat.style.display = "flex";
    viewLogs.style.display = "none";
    viewTitle.dataset.i18nTitle = "title.chat";
    viewTitle.textContent = t("title.chat");
    searchBox.style.display = "none";
    netTools.style.display = "none";
  } else if (route === "logs") {
    viewMonitor.style.display = "none";
    viewChat.style.display = "none";
    viewLogs.style.display = "flex";
    viewTitle.dataset.i18nTitle = "title.logs";
    viewTitle.textContent = t("title.logs");
    searchBox.style.display = "none";
    netTools.style.display = "none";
    loadLogSources();
    if (document.getElementById("logs-pane-audit").style.display !== "none") loadAudit();
  } else {
    currentFilter = MODULES.some(([k]) => k === route) ? route : "all";
    viewMonitor.classList.toggle("single", currentFilter !== "all");
    viewMonitor.style.display = currentFilter === "all" ? "block" : "flex";
    viewChat.style.display = "none";
    viewLogs.style.display = "none";
    viewMonitor.style.display = "block";
    const titleKey = currentFilter === "all" ? "title.overview" : `menu.${currentFilter}`;
    viewTitle.dataset.i18nTitle = titleKey;
    viewTitle.textContent = t(titleKey);
    searchBox.style.display = currentFilter === "systemd" ? "" : "none";
    netTools.style.display = currentFilter === "network" ? "flex" : "none";
    overviewEl.style.display = currentFilter === "all" ? "flex" : "none";
    cards.style.display = currentFilter === "all" ? "none" : "";
    if (currentFilter === "all" || currentFilter === "system") refreshOverview();
    if (currentFilter === "network") refreshOverview();
    if (currentFilter !== "all") renderCards();
    refreshMetrics();
  }
}
document.querySelectorAll(".menu-item").forEach((item) => {
  item.addEventListener("click", () => {
    const v = item.dataset.view;
    location.hash = v === "chat" ? "/chat" : v === "logs" ? "/logs" : "/" + item.dataset.filter;
  });
});

// ---------- 日志页 ----------
let logSources = { systemd: [], docker: [], dockerAvailable: false };
let logTarget = null;
let logFollow = true;
const logsBody = document.getElementById("logs-body");
const logsList = document.getElementById("logs-list");
const logsFilter = document.getElementById("logs-filter");
const logsSearch = document.getElementById("logs-search");
const logsLines = document.getElementById("logs-lines");
const aiAnalyze = document.getElementById("ai-analyze");

async function loadLogSources() {
  try {
    const res = await fetch("api/logs/sources");
    logSources = await res.json();
  } catch {}
  renderLogList();
}
function renderLogList() {
  const kw = (logsFilter.value || "").trim().toLowerCase();
  const sys = logSources.systemd.filter((s) => !kw || s.name.toLowerCase().includes(kw));
  const dock = (logSources.docker || []).filter((c) => !kw || c.name.toLowerCase().includes(kw));
  const item = (s, src) => {
    const state = src === "docker" ? (s.status || "").toLowerCase() : (s.state || "").toLowerCase();
    const dot = /up|running/.test(state) ? "ok" : /exit|fail|error|degraded/.test(state) ? "err" : state === "active" ? "act" : "stop";
    const cls = logTarget && logTarget.source === src && logTarget.target === (src === "docker" ? s.name : s.name) ? " active" : "";
    return `<div class="logs-item${cls}" data-src="${src}" data-name="${escapeHtml(s.name)}" data-target="${escapeHtml(src === "docker" ? s.name : s.name)}"><span class="dot ${dot}"></span><span>${escapeHtml(s.name)}</span><span class="grp">${src === "docker" ? "docker" : "sys"}</span><span class="tail">${src === "docker" ? escapeHtml((s.status || "").slice(0, 12)) : ""}</span></div>`;
  };
  const head = (label) => `<div class="logs-item" style="cursor:default;font-weight:700;font-size:11px;color:var(--muted);pointer-events:none">${label}</div>`;
  logsList.innerHTML = (sys.length ? head(t("logs.sysGroup")) + sys.map((s) => item(s, "systemd")).join("") : "")
    + (dock.length ? head(t("logs.dockerGroup")) + dock.map((c) => item(c, "docker")).join("") : "");
  if (!sys.length && !dock.length) logsList.innerHTML = `<div class="logs-item" style="color:var(--muted)">${t("logs.none")}</div>`;
}
logsFilter.addEventListener("input", renderLogList);
logsList.addEventListener("click", (e) => {
  const it = e.target.closest("[data-name]");
  if (!it) return;
  const isDocker = it.dataset.src === "docker";
  logTarget = { source: isDocker ? "docker" : "systemd", target: it.dataset.name };
  document.getElementById("logs-target").textContent = (isDocker ? t("logs.dockerPrefix") : "") + it.dataset.name;
  logsBody.innerHTML = `<pre class="logs-empty">${t("logs.loading")}</pre>`;
  aiAnalyze.style.display = "none";
  renderLogList();
  loadLog();
});
async function loadLog() {
  if (!logTarget) return;
  try {
    const res = await fetch("api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(logTarget.source === "docker" ? { container: logTarget.target, lines: Number(logsLines.value) } : { service: logTarget.target, lines: Number(logsLines.value) }),
    });
    const data = await res.json();
    renderLog(data.content || (data.error || t("logs.empty")));
    aiAnalyze.style.display = data.content ? "" : "none";
  } catch { logsBody.innerHTML = `<pre>${t("op.fail")}</pre>`; }
}
function renderLog(text) {
  const kw = (logsSearch.value || "").trim();
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const html = String(text || "").split("\n").map((line) => {
    let cls = "";
    if (/ERROR|FATAL|CRIT|Exception|Traceback/i.test(line)) cls = " err";
    else if (/WARN|WARNING/i.test(line)) cls = " warn";
    const safe = kw ? esc(line).replace(new RegExp(esc(kw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (m) => `<mark>${m}</mark>`) : esc(line);
    return `<div class="log-line${cls}">${safe}</div>`;
  }).join("");
  logsBody.innerHTML = `<pre>${html}</pre>`;
  if (logFollow) logsBody.scrollTop = logsBody.scrollHeight;
}
logsLines.addEventListener("change", () => { if (logTarget) { logsBody.innerHTML = `<pre class="logs-empty">${t("logs.loading")}</pre>`; loadLog(); } });
logsSearch.addEventListener("input", () => { if (logTarget) loadLog(); });
document.getElementById("logs-follow").onclick = (e) => {
  logFollow = !logFollow;
  e.currentTarget.classList.toggle("btn-danger", !logFollow);
  e.currentTarget.textContent = logFollow ? t("logs.follow") : t("logs.paused");
  if (logFollow && logTarget) logsBody.scrollTop = logsBody.scrollHeight;
};
document.getElementById("logs-copy").onclick = async () => {
  const txt = logsBody.querySelector("pre")?.textContent || "";
  try { await navigator.clipboard.writeText(txt); showSaveMsg(t("logs.copied"), "ok"); } catch { showSaveMsg(t("logs.copyFail"), "warn"); }
};
aiAnalyze.onclick = () => {
  const txt = logsBody.querySelector("pre")?.textContent || "";
  if (!txt.trim()) return;
  const prompt = t("logs.aiAnalyzePrompt");
  miniInput.value = prompt + txt.slice(0, 5000 - prompt.length);
  openAiPopup();
  send();
};
document.getElementById("logs-export").onclick = () => {
  const txt = logsBody.querySelector("pre")?.textContent || "";
  if (!txt) return;
  const name = (logTarget ? logTarget.target : "logs") + ".log";
  const blob = new Blob([txt], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
};

// ---------- 面板操作日志 ----------
const auditBody = document.getElementById("audit-body");
const auditSearch = document.getElementById("audit-search");
const auditPageSize = document.getElementById("audit-page-size");
let auditRecords = [];
let auditQueue = [];
let auditTimer = null;
let auditPage = 0;

function auditEnabled() { return authMask.style.display !== "flex"; }

function currentPage() {
  const active = document.querySelector(".menu-item.active .menu-label");
  return (active?.textContent || viewTitle.textContent || "").trim();
}

function auditLog(action, target, detail = "", page = null) {
  if (!auditEnabled()) return;
  auditQueue.push({ page: page ?? currentPage(), action, target, detail });
  if (auditTimer) return;
  auditTimer = setTimeout(flushAudit, 1000);
}

function flushAudit() {
  auditTimer = null;
  if (!auditQueue.length) return;
  const records = auditQueue;
  auditQueue = [];
  fetch("api/panel-audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records }) }).catch(() => {});
}

function renderAudit() {
  const kw = (auditSearch.value || "").trim().toLowerCase();
  const rows = auditRecords.filter((r) => !kw || `${r.time} ${r.user} ${r.page} ${r.action} ${r.target} ${r.detail}`.toLowerCase().includes(kw));
  const size = Number(auditPageSize.value) || 20;
  const total = Math.max(1, Math.ceil(rows.length / size));
  if (auditPage >= total) auditPage = total - 1;
  const page = rows.slice(auditPage * size, (auditPage + 1) * size);
  if (!page.length) {
    auditBody.innerHTML = `<div class="audit-empty">${t("audit.empty")}</div>`;
  } else {
    auditBody.innerHTML = `<table class="audit-table"><thead><tr><th>${t("audit.time")}</th><th>${t("audit.user")}</th><th>${t("audit.page")}</th><th>${t("audit.action")}</th><th>${t("audit.target")}</th><th>${t("audit.detail")}</th></tr></thead><tbody>${page.map((r) => `<tr><td class="audit-time">${escapeHtml(r.time)}</td><td class="audit-user">${escapeHtml(r.user)}</td><td>${escapeHtml(r.page || "")}</td><td class="audit-action">${escapeHtml(r.action || "")}</td><td>${escapeHtml(r.target || "")}</td><td class="audit-detail">${escapeHtml(r.detail || "")}</td></tr>`).join("")}</tbody></table>`;
  }
  const pagerNav = document.getElementById("audit-pager-nav");
  auditPageSize.style.display = rows.length ? "" : "none";
  pagerNav.innerHTML = rows.length
    ? `<button class="btn small" id="audit-prev"${auditPage === 0 ? " disabled" : ""}>${t("fw.prev")}</button><span class="fw-pageinfo">${auditPage + 1} / ${total} · ${rows.length} ${t("term.records")}</span><button class="btn small" id="audit-next"${auditPage >= total - 1 ? " disabled" : ""}>${t("fw.next")}</button>`
    : "";
  document.getElementById("audit-prev")?.addEventListener("click", () => { auditPage--; renderAudit(); });
  document.getElementById("audit-next")?.addEventListener("click", () => { auditPage++; renderAudit(); });
}

async function loadAudit() {
  auditBody.innerHTML = auditSkeleton();
  try {
    const res = await fetch("api/panel-audit");
    auditRecords = (await res.json()).records || [];
  } catch {}
  renderAudit();
}

function auditSkeleton() {
  const cell = (w = "100%") => `<div class="skel-line" style="width:${w};margin:0"></div>`;
  const row = () => `<tr>${["70px", "60px", "80px", "70px", "90px", "160px"].map(cell).join("")}</tr>`;
  return `<table class="audit-table"><thead><tr><th>${t("audit.time")}</th><th>${t("audit.user")}</th><th>${t("audit.page")}</th><th>${t("audit.action")}</th><th>${t("audit.target")}</th><th>${t("audit.detail")}</th></tr></thead><tbody>${Array.from({ length: 8 }, row).join("")}</tbody></table>`;
}

document.querySelectorAll(".logs-tab").forEach((tab) => tab.addEventListener("click", () => {
  const which = tab.dataset.logsTab;
  document.querySelectorAll(".logs-tab").forEach((x) => x.classList.toggle("active", x === tab));
  document.getElementById("logs-pane-service").style.display = which === "service" ? "flex" : "none";
  document.getElementById("logs-pane-audit").style.display = which === "audit" ? "flex" : "none";
  if (which === "audit") loadAudit();
}));
auditSearch.addEventListener("input", () => { auditPage = 0; renderAudit(); });
auditPageSize.addEventListener("change", () => { auditPage = 0; renderAudit(); });
document.getElementById("audit-refresh").onclick = loadAudit;
document.getElementById("audit-export").onclick = () => {
  if (!auditRecords.length) { showSaveMsg(t("audit.empty"), "warn"); return; }
  openAuditModal("audit-export");
};
document.getElementById("audit-clear").onclick = () => openAuditModal("audit-clear");

function exportAudit(records) {
  if (!records.length) { showSaveMsg(t("audit.empty"), "warn"); return; }
  const lines = records.map((r) => `${r.time || ""}\t${r.user || ""}\t${r.page || ""}\t${r.action || ""}\t${r.target || ""}\t${r.detail || ""}`);
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "panel-audit.txt";
  a.click();
  URL.revokeObjectURL(a.href);
}

function openAuditModal(kind) {
  procTarget = { kind };
  document.getElementById("proc-title").textContent = kind === "audit-export" ? t("audit.export") : t("audit.clear");
  document.getElementById("proc-text").textContent = kind === "audit-export" ? t("audit.exportConfirm") : t("audit.clearConfirm");
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("fw");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
}

// ---------- 全局操作埋点 ----------
function elLabel(el) {
  const txt = (el.querySelector?.(".menu-label")?.textContent || el.textContent || "").trim();
  return (el.title || el.getAttribute?.("aria-label") || txt || el.id || "").slice(0, 80);
}
function fieldLabel(el) {
  return (el.closest(".field")?.querySelector("label")?.textContent
    || el.getAttribute?.("data-i18n") || el.getAttribute?.("aria-label")
    || el.placeholder || el.id || el.name || "").trim().slice(0, 60);
}
document.addEventListener("click", (e) => {
  if (!auditEnabled()) return;
  if (e.target.closest?.("#logs-pane-audit") || e.target.closest?.(".logs-tabs")) return;
  const menu = e.target.closest?.(".menu-item");
  if (menu) { auditLog(t("audit.nav"), elLabel(menu), "", elLabel(menu)); return; }
  const btn = e.target.closest?.("button");
  if (btn) auditLog(t("audit.btn"), elLabel(btn));
}, true);
document.addEventListener("change", (e) => {
  if (!auditEnabled()) return;
  const el = e.target;
  if (!el?.matches?.("input, select, textarea")) return;
  if (el.type === "password" || el.type === "file") return;
  if (!el.closest?.(".modal-mask")) return;
  const val = el.type === "checkbox" ? (el.checked ? "✓" : "✗") : String(el.value || "").slice(0, 200);
  auditLog(t("audit.edit"), fieldLabel(el), val);
}, true);
window.addEventListener("beforeunload", () => {
  if (auditQueue.length && navigator.sendBeacon) {
    navigator.sendBeacon("api/panel-audit", new Blob([JSON.stringify({ records: auditQueue })], { type: "application/json" }));
    auditQueue = [];
  }
});
document.querySelectorAll(".modal-mask").forEach((el) => {
  new MutationObserver(() => {
    const shown = el.classList.contains("show");
    const prev = el.dataset.auditShown === "1";
    if (shown === prev) return;
    el.dataset.auditShown = shown ? "1" : "0";
    const title = (el.querySelector("h2")?.textContent || el.id).trim().slice(0, 60);
    auditLog(t("audit.modal"), title, shown ? t("audit.open") : t("audit.close"));
  }).observe(el, { attributes: true, attributeFilter: ["class"] });
});
const aiPopupEl = document.getElementById("ai-popup");
new MutationObserver(() => {
  const shown = aiPopupEl.style.display === "flex";
  const prev = aiPopupEl.dataset.auditShown === "1";
  if (shown === prev) return;
  aiPopupEl.dataset.auditShown = shown ? "1" : "0";
  auditLog(t("audit.modal"), t("ai.title"), shown ? t("audit.open") : t("audit.close"));
}).observe(aiPopupEl, { attributes: true, attributeFilter: ["style"] });

window.addEventListener("hashchange", applyRoute);

// ---------- 总览：状态圆环 + 流量/磁盘IO ----------

let overviewData = null;
let nicFilter = "all";
let unitDivider = 1;
let tokenUnit = 1000000;
let trafficTab = "traffic";
let unitTouched = false;
let rangePoints = 900;

function fmtRate(v) {
  const x = (v || 0) / (unitDivider || 1);
  return x >= 100 ? Math.round(x) + (unitDivider >= 1024 * 1024 ? " MB/s" : " KB/s") : (x >= 10 ? x.toFixed(1) : x.toFixed(2)) + (unitDivider >= 1024 * 1024 ? " MB/s" : " KB/s");
}

function fmtBytes(b, dec = 2) {
  const v = b || 0;
  if (v >= 1024 * 1024) return (v / 1024 / 1024).toFixed(dec) + " MB";
  if (v >= 1024) return (v / 1024).toFixed(dec) + " KB";
  return v + " B";
}

function ringColor(pct) {
  if (pct >= 90) return "#fb7185";
  if (pct >= 80) return "#f5b942";
  return "#34d399";
}

function renderSysInfo(sys) {
  if (!sys) return;
  const osEl = document.querySelector("#sys-info .sys-os");
  const upEl = document.querySelector("#sys-info .sys-uptime");
  if (osEl) osEl.textContent = t("sys.os").replace("{os}", sys.os).replace("{arch}", sys.arch);
  if (upEl) upEl.textContent = t("sys.uptime").replace("{up}", sys.uptime);
}

function ringLabel(pct) {
  if (pct >= 90) return t("mon.danger");
  if (pct >= 80) return t("mon.guard");
  return t("mon.ok");
}

function initRings() {
}

function renderRings(status) {
  const map = {
    load: { label: t("ov.load"), val: status?.load?.pct ?? 0, sub: status?.load ? `1m ${status.load.load1 ?? status.load.load} / 5m ${status.load.load5 ?? "—"} / 15m ${status.load.load15 ?? "—"} · ${t("ov.cores").replace("{n}", status.load.ncpu)}` : "" },
    cpu: { label: t("ov.cpu"), val: status?.cpu?.pct ?? 0, sub: t("ov.realtime") },
    mem: { label: t("ov.mem"), val: status?.mem?.pct ?? 0, sub: "" },
    disk: { label: t("ov.disk"), val: status?.disk?.pct ?? 0, sub: t("ov.rootFs") },
  };
  for (const key of ["load", "cpu", "mem", "disk"]) {
    const it = map[key];
    const pct = Math.min(100, Math.max(0, it.val));
    const el = document.getElementById("ring-" + key);
    el.style.setProperty("--pct", pct);
    el.style.setProperty("--rc", ringColor(pct));
    const labelEl = el.parentElement?.querySelector(".label");
    if (labelEl) labelEl.textContent = it.label;
    document.getElementById("val-" + key).textContent = (Number.isInteger(pct) ? pct : pct.toFixed(1)) + "%";
    document.getElementById("val-" + key).style.color = ringColor(pct);
    document.getElementById("sub-" + key).textContent = it.sub + " · " + ringLabel(pct);
  }
}

function renderPanelMem(pm) {
  if (!pm || !pm.limitMB) return;
  const used = pm.usedMB || 0;
  const pct = Math.min(100, Math.max(0, used / pm.limitMB * 100));
  const el = document.getElementById("ring-panelmem");
  if (!el) return;
  el.style.setProperty("--pct", pct);
  el.style.setProperty("--rc", ringColor(pct));
  const val = document.getElementById("val-panelmem");
  val.textContent = `${used}MB`;
  val.style.color = ringColor(pct);
  document.getElementById("sub-panelmem").textContent = `${t("ov.panelMemLimit")} ${pm.limitMB}MB · ${ringLabel(pct)}`;
}

function healthPct(v) {
  return Math.min(100, Math.max(0, v || 0));
}

function renderHealth(data) {
  const status = data?.status || {};
  const panelMem = data?.panelMem;
  const extras = data?.extras || {};
  const items = [];
  const add = (ok, value, view) => items.push({ ok, value, view });
  add(healthPct(status.cpu?.pct) < 80, `${t("ov.cpu")} ${Math.round(healthPct(status.cpu?.pct))}%`, "system");
  add(healthPct(status.mem?.pct) < 80, `${t("ov.mem")} ${Math.round(healthPct(status.mem?.pct))}%`, "system");
  add(healthPct(status.disk?.pct) < 80, `${t("ov.disk")} ${Math.round(healthPct(status.disk?.pct))}%`, "system");
  add(healthPct(status.load?.pct) < 80, `${t("ov.load")} ${status.load?.load ?? "—"}`, "system");
  if (panelMem?.limitMB) add((panelMem.usedMB || 0) <= panelMem.limitMB, `${t("ov.panelMem")} ${panelMem.usedMB || 0}/${panelMem.limitMB}MB`, null);
  if (extras.failedSvcs > 0) add(false, `${t("ov.failedSvcs")} ${extras.failedSvcs}`, "systemd");
  const sslCount = (extras.sslWarn || []).length;
  if (sslCount > 0) add(false, `${t("ov.sslWarn")} ${sslCount}`, "ssl");
  const bad = items.filter((i) => !i.ok);
  const st = document.getElementById("health-status");
  const list = document.getElementById("health-items");
  st.classList.toggle("ok", bad.length === 0);
  st.classList.toggle("bad", bad.length > 0);
  if (bad.length === 0) {
    st.textContent = t("ov.healthOk");
    list.innerHTML = "";
  } else {
    st.textContent = t("ov.healthWarn").replace("{n}", bad.length);
    list.innerHTML = bad.map((i) => `<button class="health-item bad" data-view="${i.view || ""}">${escapeHtml(i.value)}</button>`).join("");
  }
  const card = document.getElementById("attention-card");
  if (bad.length) {
    card.style.display = "";
    document.getElementById("attention-list").innerHTML = bad.map((i) => `<button class="attention-item bad" data-view="${i.view || ""}"><span class="dot err"></span>${escapeHtml(i.value)}</button>`).join("");
  } else {
    card.style.display = "none";
  }
}

function renderOvKpis(extras) {
  const set = (id, v, suffix = "") => {
    const el = document.getElementById(id);
    if (el) el.textContent = v == null ? "--" : v + suffix;
  };
  const swap = extras?.swap;
  set("ovk-swap", swap && swap.total ? Math.round((swap.used / swap.total) * 100) : null, "%");
  set("ovk-tcp", extras?.tcp);
  set("ovk-procs", extras?.procs);
  set("ovk-docker", extras?.docker);
  set("ovk-users", extras?.users);
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".health-item, .attention-item");
  if (btn && btn.dataset.view) location.hash = "/" + btn.dataset.view;
});

function nicTotals() {
  if (!overviewData?.net?.length) return {};
  const last = overviewData.net[overviewData.net.length - 1];
  return last.totals || {};
}

function kpiOf(nic) {
  const totals = nicTotals();
  const last = overviewData?.net?.[overviewData.net.length - 1];
  let up = 0, down = 0;
  if (last) {
    for (const [name, v] of Object.entries(last.up || {})) {
      if (nic !== "all" && name !== nic) continue;
      up += v;
    }
    for (const [name, v] of Object.entries(last.down || {})) {
      if (nic !== "all" && name !== nic) continue;
      down += v;
    }
  }
  let tx = 0, rx = 0;
  for (const [name, v] of Object.entries(totals)) {
    if (nic !== "all" && name !== nic) continue;
    tx += v.tx || 0;
    rx += v.rx || 0;
  }
  return { up, down, tx, rx };
}

function renderKpi() {
  if (trafficTab === "io") {
    const last = overviewData?.io?.[overviewData.io.length - 1];
    let readB = 0, writeB = 0;
    for (const x of Object.values(last?.read || {})) readB += x;
    for (const x of Object.values(last?.write || {})) writeB += x;
    document.getElementById("kpi-up").textContent = fmtBytes(readB);
    document.getElementById("kpi-down").textContent = fmtBytes(writeB);
    document.getElementById("kpi-tx").textContent = `${last?.iops ?? 0} ${t("io.ops")}`;
    const lat = document.getElementById("kpi-rx");
    lat.textContent = `${last?.latency ?? 0} ms`;
    lat.style.color = "#22c55e";
    return;
  }
  const k = kpiOf(nicFilter);
  document.getElementById("kpi-up").textContent = fmtRate(k.up);
  document.getElementById("kpi-down").textContent = fmtRate(k.down);
  document.getElementById("kpi-tx").textContent = fmtBytes(k.tx, 1);
  document.getElementById("kpi-rx").textContent = fmtBytes(k.rx, 1);
  document.getElementById("kpi-rx").style.color = "";
}

function chartData(mode) {
  const points = mode === "traffic" ? overviewData?.net : overviewData?.io;
  if (!points?.length) return null;
  const pts = points.slice(-rangePoints);
  if (!pts.length) return null;
  const labels = pts.map((p) => {
    const d = new Date(p.t * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  });
  let upData, downData;
  if (mode === "traffic") {
    upData = pts.map((p) => {
      let v = 0;
      for (const [name, x] of Object.entries(p.up || {})) if (nicFilter === "all" || name === nicFilter) v += x;
      return v / (unitDivider || 1);
    });
    downData = pts.map((p) => {
      let v = 0;
      for (const [name, x] of Object.entries(p.down || {})) if (nicFilter === "all" || name === nicFilter) v += x;
      return v / (unitDivider || 1);
    });
  } else {
    upData = pts.map((p) => {
      let v = 0;
      for (const x of Object.values(p.read || {})) v += x;
      return v / (unitDivider || 1);
    });
    downData = pts.map((p) => {
      let v = 0;
      for (const x of Object.values(p.write || {})) v += x;
      return v / (unitDivider || 1);
    });
  }
  const [upName, downName, upColor, downColor] = mode === "traffic"
    ? [t("ov.up"), t("ov.down"), "#f97316", "#3b82f6"]
    : [t("io.read"), t("io.write"), "#ec4899", "#06b6d4"];
  return {
    labels,
    series: [
      { name: downName, color: downColor, data: downData },
      { name: upName, color: upColor, data: upData },
    ],
    fixedMax: unitDivider >= 1024 * 1024 ? null : (mode === "io" ? 2.5 : 50),
  };
}

function niceCeil(v) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, v))));
  return Math.ceil(v / p) * p;
}

function setupCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 400;
  const h = canvas.clientHeight || 200;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

let chartTip = null;
function ensureTip() {
  if (chartTip) return chartTip;
  chartTip = document.createElement("div");
  chartTip.className = "chart-tip";
  document.body.appendChild(chartTip);
  return chartTip;
}

function attachChartTip(canvas) {
  canvas.addEventListener("mousemove", (e) => {
    const meta = canvas._chart;
    if (!meta || !meta.n) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const idx = Math.min(meta.n - 1, Math.max(0, Math.round(((px - meta.padL) / meta.pw) * (meta.n - 1))));
    const tip = ensureTip();
    tip.innerHTML = `<b>${escapeHtml(meta.labels[idx])}</b><br>` + meta.series.map((s) => `<span style="color:${s.color}">● ${escapeHtml(s.name)} ${Math.round(s.data[idx] * 100) / 100}</span>`).join("<br>");
    tip.style.display = "block";
    const tw = tip.offsetWidth;
    let left = e.clientX - tw / 2;
    left = Math.max(6, Math.min(window.innerWidth - tw - 6, left));
    tip.style.left = left + "px";
    tip.style.top = (e.clientY - tip.offsetHeight - 10) + "px";
  });
  canvas.addEventListener("mouseleave", () => { if (chartTip) chartTip.style.display = "none"; });
}

function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function drawLineChart(canvas, { labels, series, fixedMax = null }) {
  const { ctx, w, h } = setupCanvas(canvas);
  const pad = { l: 44, r: 12, t: 30, b: 22 };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  let max = fixedMax;
  if (max == null) for (const s of series) for (const v of s.data) if (typeof v === "number" && (max == null || v > max)) max = v;
  const niceMax = Math.max(1, niceCeil(max || 1));
  const steps = 4;
  ctx.font = "10px sans-serif";
  for (let i = 0; i <= steps; i++) {
    const y = pad.t + ph - (i / steps) * ph;
    ctx.strokeStyle = cssVar("--grid"); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke();
    ctx.fillStyle = cssVar("--muted");
    ctx.fillText(String(Math.round((niceMax * i / steps) * 100) / 100), 4, y + 3);
  }
  const n = labels.length;
  const showIdx = n <= 8 ? labels.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  const X = (i) => (n <= 1 ? pad.l + pw / 2 : pad.l + (i / (n - 1)) * pw);
  const Y = (v) => pad.t + ph - (v / niceMax) * ph;
  for (const i of showIdx) {
    ctx.textAlign = i === 0 ? "left" : i === n - 1 ? "right" : "center";
    ctx.fillText(labels[i], i === 0 ? pad.l : i === n - 1 ? pad.l + pw : X(i), h - 6);
  }
  ctx.textAlign = "left";
  for (const s of series) {
    ctx.strokeStyle = s.color; ctx.lineWidth = 1.5;
    ctx.beginPath();
    s.data.forEach((v, i) => { const px = X(i), py = Y(v); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.stroke();
    const g = ctx.createLinearGradient(0, pad.t, 0, pad.t + ph);
    g.addColorStop(0, hexToRgba(s.color, 0.3));
    g.addColorStop(1, hexToRgba(s.color, 0.03));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(X(0), Y(s.data[0]));
    s.data.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
    ctx.lineTo(X(n - 1), pad.t + ph); ctx.lineTo(X(0), pad.t + ph); ctx.closePath(); ctx.fill();
  }
  canvas._chart = { labels, series, padL: pad.l, pw, n, niceMax };
  attachChartTip(canvas);
}

function drawNetTraffic() {
  const canvas = document.getElementById("net-traffic-chart");
  if (!canvas || !overviewData?.net?.length) return;
  const points = overviewData.net;
  const labels = points.map((p) => { const d = new Date(p.t * 1000); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`; });
  let up = points.map((p) => { let v = 0; for (const x of Object.values(p.up || {})) v += x; return v / (1024 * 1024); });
  let down = points.map((p) => { let v = 0; for (const x of Object.values(p.down || {})) v += x; return v / (1024 * 1024); });
  drawLineChart(canvas, {
    labels,
    series: [
      { name: t("ov.down"), color: "#3b82f6", data: down },
      { name: t("ov.up"), color: "#f97316", data: up },
    ],
  });
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function renderChart() {
  if (trafficTab === "trend") {
    drawTrendChart(document.getElementById("trend-chart"), overviewData?.trend || [], "ov-trend-legend");
    return;
  }
  if (trafficTab === "token") {
    const days = overviewData?.usage || [];
    drawTokenChart(document.getElementById("token-chart"), days);
    const last = days[days.length - 1];
    document.getElementById("token-today").textContent = last ? fmtNum(last.total / tokenUnit) : "--";
    document.getElementById("token-total30").textContent = fmtNum(days.reduce((s, d) => s + d.total, 0) / tokenUnit);
    return;
  }
  const data = chartData(trafficTab);
  const canvas = trafficTab === "traffic" ? document.getElementById("traffic-chart") : document.getElementById("io-chart");
  if (data) drawLineChart(canvas, data);
  renderKpi();
}

function fmtNum(n) {
  if (!Number.isFinite(n)) return "--";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function drawTokenChart(canvas, days) {
  const { ctx, w, h } = setupCanvas(canvas);
  const pad = { l: 44, r: 12, t: 30, b: 24 };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const labels = days.map((d) => d.date.slice(5));
  const totals = days.map((d) => d.total / tokenUnit);
  const max = niceCeil(Math.max(1, ...totals));
  ctx.font = "10px sans-serif";
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ph - (i / 4) * ph;
    ctx.strokeStyle = cssVar("--grid"); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + pw, y); ctx.stroke();
    ctx.fillStyle = cssVar("--muted");
    ctx.fillText(fmtNum(max * i / 4), 4, y + 3);
  }
  const n = days.length;
  const slot = pw / Math.max(1, n);
  const X = (i) => pad.l + (i + 0.5) * slot;
  const Y = (v) => pad.t + ph - (v / max) * ph;
  const bw = Math.min(22, Math.max(3, slot * 0.6));
  days.forEach((d, i) => {
    const x = X(i) - bw / 2;
    const p = d.prompt / tokenUnit, c = d.completion / tokenUnit;
    const yP = Y(p), yC = Y(p + c);
    ctx.fillStyle = "#3b82f6"; ctx.fillRect(x, yP, bw, (pad.t + ph) - yP);
    ctx.fillStyle = "#ec4899"; ctx.fillRect(x, yC, bw, yP - yC);
  });
  ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2; ctx.beginPath();
  totals.forEach((v, i) => { const px = X(i), py = Y(v); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
  ctx.stroke();
  const showIdx = n <= 8 ? labels.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
  for (const i of showIdx) {
    ctx.textAlign = i === 0 ? "left" : i === n - 1 ? "right" : "center";
    ctx.fillText(labels[i], i === 0 ? pad.l : i === n - 1 ? pad.l + pw : X(i), h - 6);
  }
  ctx.textAlign = "left";
  canvas._chart = {
    labels,
    series: [
      { name: t("ov.tokPrompt"), color: "#3b82f6", data: days.map((d) => d.prompt / tokenUnit) },
      { name: t("ov.tokCompletion"), color: "#ec4899", data: days.map((d) => d.completion / tokenUnit) },
      { name: t("ov.tokTotal"), color: "#fbbf24", data: totals },
    ],
    padL: pad.l, pw, n, niceMax: max,
  };
  attachChartTip(canvas);
}

async function refreshOverview() {
  if (!overviewData) setOverviewLoading(true);
  try {
    const res = await fetch("api/overview");
    overviewData = await res.json();
    renderSysInfo(overviewData.status?.sys);
    renderRings(overviewData.status);
    renderPanelMem(overviewData.panelMem);
    renderHealth(overviewData);
    renderOvKpis(overviewData.extras);
    const sel = document.getElementById("nic-select");
    const prev = sel.value;
    const nics = (overviewData.nics || []).filter((n) => n !== "lo");
    sel.innerHTML = `<option value="all" data-i18n="ov.all">${t("ov.all")}</option>` + nics.map((n) => `<option>${escapeHtml(n)}</option>`).join("");
    if (nics.includes(prev)) sel.value = prev;
    renderChart();
    if (currentFilter === "system") drawSystemTrend();
    if (currentFilter === "network") drawNetTraffic();
  } catch {}
  setOverviewLoading(false);
}

function setOverviewLoading(on) {
  const el = document.getElementById("overview");
  if (el) el.classList.toggle("loading", on);
}

document.getElementById("tab-traffic").onclick = () => switchTrafficTab("traffic");
document.getElementById("tab-io").onclick = () => switchTrafficTab("io");
document.getElementById("tab-token").onclick = () => switchTrafficTab("token");
document.getElementById("tab-trend").onclick = () => switchTrafficTab("trend");
function switchTrafficTab(mode) {
  trafficTab = mode;
  document.getElementById("tab-traffic").classList.toggle("active", mode === "traffic");
  document.getElementById("tab-io").classList.toggle("active", mode === "io");
  document.getElementById("tab-token").classList.toggle("active", mode === "token");
  document.getElementById("tab-trend").classList.toggle("active", mode === "trend");
  const isTraffic = mode === "traffic";
  const isToken = mode === "token";
  const isTrend = mode === "trend";
  document.getElementById("traffic-chart").style.display = isTraffic ? "" : "none";
  document.getElementById("io-chart").style.display = mode === "io" ? "" : "none";
  document.getElementById("token-chart").style.display = isToken ? "" : "none";
  document.getElementById("trend-chart").style.display = isTrend ? "" : "none";
  document.getElementById("ov-trend-legend").style.display = isTrend ? "" : "none";
  document.getElementById("nic-select").style.display = isTraffic ? "" : "none";
  document.getElementById("range-select").style.display = isTraffic || mode === "io" ? "" : "none";
  document.getElementById("unit-select").style.display = isToken || isTrend ? "none" : "";
  document.getElementById("token-unit-select").style.display = isToken ? "" : "none";
  document.getElementById("kpi-row").style.display = mode === "io" ? "" : "none";
  document.getElementById("token-kpi").style.display = isToken ? "" : "none";
  const dots = document.querySelectorAll("#kpi-row .dot");
  if (isToken) {
    document.getElementById("token-today").textContent = "--";
    document.getElementById("token-total30").textContent = "--";
  } else if (isTraffic) {
    document.getElementById("kpi-up-key").innerHTML = `<span class="dot up"></span>${t("ov.up")}`;
    document.getElementById("kpi-down-key").innerHTML = `<span class="dot down"></span>${t("ov.down")}`;
    document.getElementById("kpi-tx-key").textContent = t("ov.tx");
    document.getElementById("kpi-rx-key").textContent = t("ov.rx");
    dots[0].style.background = "#f97316";
    dots[1].style.background = "#3b82f6";
  } else if (!isTrend) {
    document.getElementById("kpi-up-key").innerHTML = `<span class="dot" style="background:#ec4899"></span>${t("io.read")}`;
    document.getElementById("kpi-down-key").innerHTML = `<span class="dot" style="background:#06b6d4"></span>${t("io.write")}`;
    document.getElementById("kpi-tx-key").textContent = t("io.iops");
    document.getElementById("kpi-rx-key").textContent = t("io.latency");
    dots[0].style.background = "#ec4899";
    dots[1].style.background = "#06b6d4";
  }
  if (!unitTouched && !isToken && !isTrend) {
    const unitSel = document.getElementById("unit-select");
    unitSel.value = "MB/s";
    unitDivider = 1024 * 1024;
  }
  renderChart();
}
document.getElementById("nic-select").onchange = (e) => { nicFilter = e.target.value; renderChart(); };
document.getElementById("range-select").onchange = (e) => { rangePoints = Number(e.target.value) || 900; renderChart(); };
document.getElementById("unit-select").onchange = (e) => {
  unitTouched = true;
  unitDivider = e.target.value === "MB/s" ? 1024 * 1024 : 1;
  renderChart();
};
document.getElementById("token-unit-select").onchange = (e) => {
  tokenUnit = Number(e.target.value) || 1;
  renderChart();
};

function initOverview() {
  initRings();
  switchTrafficTab("traffic");
  document.getElementById("unit-select").value = "MB/s";
  unitDivider = 1024 * 1024;
  refreshOverview();
}

// ---------- 监控 ----------
function renderCards() {
  cards.innerHTML = "";
  cards.classList.toggle("system-mode", currentFilter === "system");
  cards.classList.toggle("net-mode", currentFilter === "network");
  const items = currentFilter === "all" ? MODULES : MODULES.filter(([k]) => k === currentFilter);
  for (const [key, lkey] of items) {
    const label = t(lkey);
    const m = metrics[key];
    if (key === "system") {
      cards.innerHTML = renderSystem(m, label);
      bindSystemCards();
      const sdot = document.querySelector('.menu-item[data-filter="system"] .dot');
      if (sdot) sdot.className = "dot " + (m?.health && !(m.health.risks || []).length ? "ok" : m?.health ? "bad" : "na");
      continue;
    }
    const card = document.createElement("div");
    card.className = "card";
    if (key === "systemd") {
      card.innerHTML = `<h2>${label}</h2>${m ? renderSystemd({ ...m, userProcs: metrics.userProcs }) : renderSystemdSkeleton()}`;
    } else if (key === "network") {
      card.classList.add("net-card");
      card.innerHTML = renderNetwork(m, metrics);
    } else if (key === "ssl") {
      card.innerHTML = `<h2>${label}</h2>${m ? renderSsl(m) : renderSslSkeleton()}`;
    } else if (key === "nginx") {
      card.innerHTML = `<h2>${label}</h2>${m ? renderNginx(m, metrics.nginxLogs) : renderNginxSkeleton()}`;
      setTimeout(loadNginxConfs, 0);
    } else if (key === "firewall") {
      card.classList.add("fw-card");
      lastFwMetrics = m;
      card.innerHTML = `<h2>${label}</h2>${renderFirewall(m)}`;
      loadFwOps();
    } else if (key === "acl") {
      card.classList.add("acl-card");
      card.innerHTML = `<h2>${label}</h2>${renderAcl()}`;
      loadAcl();
    } else if (key === "docker") {
      card.innerHTML = `<h2>${label}</h2>${renderDocker(m)}`;
      refreshDockerStats();
    } else if (key === "databases") {
      const dbSkel = `<div class="db-grid">${Array.from({ length: 3 }, () => `<div class="db-card"><div class="db-head"><div class="skel-line" style="width:80px;margin:0"></div></div><div class="skel-line" style="width:100%"></div><div class="skel-line" style="width:60%"></div><div class="skel-line" style="width:45%"></div></div>`).join("")}</div>`;
      card.innerHTML = `<h2>${label} <button class="btn small" data-db-add style="margin-left:8px">${t("db.addBtn")}</button></h2><div id="db-list">${dbSkel}</div>`;
      loadDbConnections();
    } else {
      card.innerHTML = `<h2>${label}</h2><pre>${escapeHtml(detail(m))}</pre>`;
    }
    cards.appendChild(card);
    const reportBtn = card.querySelector("#report-btn");
    if (reportBtn) {
      reportBtn.onclick = async () => {
        const box = document.getElementById("report-box");
        const out = document.getElementById("report-out");
        const res = await fetch("api/report");
        const report = await res.text();
        out.textContent = report;
        box.style.display = "";
        document.getElementById("report-copy").onclick = () => navigator.clipboard.writeText(report);
        document.getElementById("report-dl").onclick = () => {
          const blob = new Blob([report], { type: "text/markdown" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `fixflow-report-${Date.now()}.md`;
          a.click();
          URL.revokeObjectURL(a.href);
        };
      };
    }
    const dot = document.querySelector(`.menu-item[data-filter="${key}"] .dot`);
    if (dot) {
      const ok = key === "systemd" ? !(m?.summary?.failed) : Array.isArray(m) ? m.every((x) => x.ok) : m?.ok;
      dot.className = "dot " + (ok === true ? "ok" : ok === false ? "bad" : "na");
    }
  }
}

function sysKv(label, value) {
  return `<div class="kv-item"><span class="k">${escapeHtml(label)}</span><span class="v">${escapeHtml(value ?? "—")}</span></div>`;
}

function sysStatusCls(status) {
  return status === "ok" ? "ok" : status === "warn" ? "na" : "bad";
}

function renderSystemSkeleton() {
  const skel = (n) => Array.from({ length: n }, () => `<div class="skel-line"></div>`).join("");
  const body = (inner) => `<div class="card-body">${inner}</div>`;
  const card = (title, inner, wide = false) => `<div class="card${wide ? " wide" : ""}"><h2>${title}</h2>${inner}</div>`;
  const kvSkel = `<div class="sys-kv">${Array.from({ length: 10 }, () => `<div class="kv-item"><div class="skel-line" style="width:100%"></div></div>`).join("")}</div>`;
  return [
    card(t("sys.infoTitle"), kvSkel, true),
    card(t("sys.healthTitle"), body(skel(4))),
    card(t("sys.loadTitle"), body(skel(3))),
    card(t("sys.diskTitle"), body(skel(4)), true),
    card(t("sys.trendTitle"), body(`<div class="skel-block"></div>`), true),
    card(t("sys.loginTitle"), body(skel(4))),
    card(t("sys.sshTitle"), body(skel(4))),
    card(t("sys.updateTitle"), body(skel(2))),
    card(t("sys.opTitle"), body(skel(3))),
  ].join("");
}

function renderSystem(m, label) {
  if (!m) return renderSystemSkeleton();
  if (m.error) return `<div class="card wide"><h2>${label}</h2><pre>${escapeHtml(m.error)}</pre></div>`;
  const info = m.info || {};
  const health = m.health || {};
  const out = [];

  out.push(`<div class="card wide"><h2>${icon("activity")} ${t("sys.infoTitle")} <button class="btn small" id="report-btn" style="margin-left:8px">${icon("file")} ${t("mon.report")}</button></h2>
    <div class="sys-kv">
      ${sysKv(t("sys.os"), info.os)}
      ${sysKv(t("sys.kernel"), info.kernel)}
      ${sysKv(t("sys.hostname"), info.hostname)}
      ${sysKv(t("sys.arch"), info.arch)}
      ${sysKv(t("sys.uptime"), info.uptime)}
      ${sysKv(t("sys.cpuModel"), info.cpuModel)}
      ${sysKv(t("sys.cpuCount"), info.cpuCount)}
      ${sysKv(t("sys.memTotal"), info.memTotal)}
      ${sysKv(t("sys.swapTotal"), info.swapTotal)}
      ${sysKv(t("sys.tz"), info.tz)}
    </div>
    <div id="report-box" style="display:none"><div style="margin:8px 0"><button class="btn small" id="report-copy">${t("mon.copy")}</button> <button class="btn small" id="report-dl">${t("mon.downloadMd")}</button></div><pre id="report-out"></pre></div>
  </div>`);

  const hrows = (health.items || []).map((h) => `<tr><td>${escapeHtml(h.name)}</td><td class="${sysStatusCls(h.status)}">${escapeHtml(h.status === "ok" ? t("mon.ok") : h.status === "warn" ? t("mon.warn") : t("mon.bad"))}</td><td>${escapeHtml(h.detail)}</td><td>${escapeHtml(h.advice || "—")}</td></tr>`).join("");
  out.push(`<div class="card"><h2>${t("sys.healthTitle")}</h2><div class="card-body"><table class="svc-table"><thead><tr><th>${t("mon.item")}</th><th>${t("mon.status")}</th><th>${t("mon.value")}</th><th>${t("mon.advice")}</th></tr></thead><tbody>${hrows || `<tr><td colspan="4">${t("mon.notConfigured")}</td></tr>`}</tbody></table></div></div>`);

  const ld = m.load || {};
  const bar = (label, v) => {
    const ncpu = ld.ncpu || 1;
    const pct = Math.min(100, Math.round(((v || 0) / ncpu) * 100));
    const cls = (v || 0) > ncpu ? "bad" : (v || 0) > ncpu * 0.7 ? "na" : "ok";
    return `<div class="load-row"><span class="k">${label}</span><div class="load-track"><div class="load-fill ${cls}" style="width:${pct}%"></div></div><span class="v">${v ?? "—"}</span></div>`;
  };
  out.push(`<div class="card"><h2>${t("sys.loadTitle")}</h2><div class="card-body">${bar("1 min", ld.load1)}${bar("5 min", ld.load5)}${bar("15 min", ld.load15)}<div class="sys-hint">${t("sys.loadHint").replace("{n}", ld.ncpu || "?")}</div></div></div>`);

  const drows = (m.disks || []).map((d) => `<tr><td>${escapeHtml(d.fs)}</td><td>${escapeHtml(d.size)}</td><td>${escapeHtml(d.used)}</td><td>${escapeHtml(d.avail)}</td><td class="${d.usedPct > 90 ? "bad" : d.usedPct > 80 ? "na" : "ok"}">${d.usedPct}%</td><td>${escapeHtml(d.mount)}</td></tr>`).join("");
  out.push(`<div class="card wide"><h2>${t("sys.diskTitle")}</h2><div class="card-body"><table class="svc-table"><thead><tr><th>${t("sys.fs")}</th><th>${t("sys.size")}</th><th>${t("sys.used")}</th><th>${t("sys.avail")}</th><th>${t("sys.usePct")}</th><th>${t("sys.mount")}</th></tr></thead><tbody>${drows || `<tr><td colspan="6">${t("mon.notConfigured")}</td></tr>`}</tbody></table></div></div>`);

  out.push(`<div class="card wide"><h2>${t("sys.trendTitle")}</h2><div class="chart-wrap" style="height:220px"><canvas id="sys-trend-chart" style="width:100%;height:220px;display:block"></canvas></div><div class="trend-legend" id="sys-trend-legend"></div></div>`);

  const lg = m.logins || {};
  const listBlock = (arr) => (arr && arr.length) ? `<pre class="sys-list">${escapeHtml(arr.join("\n"))}</pre>` : `<pre class="sys-list hint">${t("sys.none")}</pre>`;
  out.push(`<div class="card"><h2>${t("sys.loginTitle")}</h2><div class="card-body"><h3 class="sys-sub">${t("sys.loginCurrent")}</h3>${listBlock(lg.current)}<h3 class="sys-sub">${t("sys.loginRecent")}</h3>${listBlock(lg.recent)}<h3 class="sys-sub">${t("sys.loginFailed")}</h3>${listBlock(lg.failed)}</div></div>`);

  const srows = (m.ssh?.items || []).map((s) => `<tr><td>${escapeHtml(s.name)}</td><td class="${s.ok ? "ok" : "na"}">${s.ok ? t("mon.ok") : t("mon.warn")}</td><td>${escapeHtml(s.detail)}</td></tr>`).join("");
  out.push(`<div class="card"><h2>${t("sys.sshTitle")}</h2><div class="card-body"><table class="svc-table"><thead><tr><th>${t("sys.sshItem")}</th><th>${t("mon.status")}</th><th>${t("sys.sshValue")}</th></tr></thead><tbody>${srows || `<tr><td colspan="3">${t("sys.none")}</td></tr>`}</tbody></table></div></div>`);

  const up = m.updates;
  const upBody = up && up.count > 0
    ? `<div class="sys-hint">${t("sys.updateCount").replace("{n}", up.count)}${up.security ? " · " + t("sys.updateSecurity").replace("{n}", up.security) : ""}</div><pre class="sys-list">${escapeHtml((up.list || []).join("\n"))}</pre>`
    : `<div class="sys-hint">${t("sys.updateNone")}</div>`;
  out.push(`<div class="card"><h2>${t("sys.updateTitle")}</h2><div class="card-body">${upBody}<button class="btn small danger" data-sys-op="update" ${up && up.count > 0 ? "" : "disabled"}>${t("sys.updateBtn")}</button></div></div>`);

  out.push(`<div class="card"><h2>${t("sys.opTitle")}</h2><div class="card-body"><div class="sys-op-btns"><button class="btn small" data-sys-op="clean">${t("sys.cleanBtn")}</button><button class="btn small" data-sys-op="power" data-sys-action="reboot">${t("sys.rebootBtn")}</button><button class="btn small danger" data-sys-op="power" data-sys-action="shutdown">${t("sys.shutdownBtn")}</button></div><h3 class="sys-sub">${t("sys.opHistory")}</h3><div id="sys-ops-list"><pre class="sys-list hint">${t("fs.loading")}</pre></div></div></div>`);

  return out.join("");
}

function bindSystemCards() {
  drawSystemTrend();
  loadSysOps();
  const reportBtn = document.getElementById("report-btn");
  if (reportBtn) {
    reportBtn.onclick = async () => {
      const box = document.getElementById("report-box");
      const res = await fetch("api/report");
      const report = await res.text();
      document.getElementById("report-out").textContent = report;
      box.style.display = "";
      document.getElementById("report-copy").onclick = () => navigator.clipboard.writeText(report);
      document.getElementById("report-dl").onclick = () => {
        const blob = new Blob([report], { type: "text/markdown" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `fixflow-report-${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(a.href);
      };
    };
  }
}

function drawTrendChart(canvas, samples, legendId) {
  if (!canvas) return;
  if (!samples.length) {
    const { ctx, w, h } = setupCanvas(canvas);
    ctx.fillStyle = cssVar("--muted"); ctx.font = "12px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(t("sys.trendWait"), w / 2, h / 2); ctx.textAlign = "left";
    return;
  }
  const labels = samples.map((s) => { const d = new Date(s.t * 1000); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; });
  drawLineChart(canvas, {
    labels,
    series: [
      { name: "CPU", color: "#3b82f6", data: samples.map((s) => s.cpu || 0) },
      { name: t("sys.mem"), color: "#f59e0b", data: samples.map((s) => s.mem || 0) },
      { name: t("sys.disk"), color: "#10b981", data: samples.map((s) => (s.disk == null ? 0 : s.disk)) },
    ],
    fixedMax: 100,
  });
  const legend = document.getElementById(legendId);
  if (legend) legend.innerHTML = `<span style="color:#3b82f6">● CPU</span><span style="color:#f59e0b">● ${t("sys.mem")}</span><span style="color:#10b981">● ${t("sys.disk")}</span>`;
}

function drawSystemTrend() {
  drawTrendChart(document.getElementById("sys-trend-chart"), overviewData?.trend || [], "sys-trend-legend");
}

async function loadSysOps() {
  const el = document.getElementById("sys-ops-list");
  if (!el) return;
  try {
    const res = await fetch("api/system/ops");
    const data = await res.json();
    const ops = Array.isArray(data.ops) ? data.ops.slice(-8).reverse() : [];
    if (!ops.length) { el.innerHTML = `<pre class="sys-list hint">${t("sys.none")}</pre>`; return; }
    const labels = { update: t("sys.opUpdate"), clean: t("sys.opClean"), reboot: t("sys.opReboot"), shutdown: t("sys.opShutdown") };
    const rows = ops.map((o) => {
      const d = new Date(o.ts);
      const ts = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      return `<tr><td>${ts}</td><td>${escapeHtml(labels[o.op] || o.op)}</td><td class="${o.ok ? "ok" : "bad"}">${o.ok ? t("mon.ok") : t("mon.bad")}</td></tr>`;
    }).join("");
    el.innerHTML = `<table class="svc-table"><tbody>${rows}</tbody></table>`;
  } catch { el.innerHTML = `<pre class="sys-list hint">${t("fs.loadFail").replace("{e}", "")}</pre>`; }
}

let sysStateFilter = "all";
let sysTypeFilter = "all";
let openSdRows = new Set();
const SYS_DANGEROUS = /^(systemd|systemd-|dbus|NetworkManager|firewalld|networkd|resolved|journald|logind|udevd|sshd?|ssh|lightdm|gdm|sddm|display-manager|dde-|kwin|plymouth|getty|user@)/;

function opBtn(s, action) {
  const label = { start: t("srv.opStart"), stop: t("srv.opStop"), restart: t("srv.opRestart"), reload: t("srv.opReload"), enable: t("srv.opEnable"), disable: t("srv.opDisable") }[action];
  return `<a href="javascript:void(0)" data-sysop="${action}" data-unit="${escapeHtml(s.name)}">${label}</a>`;
}

function renderSdDetail(s) {
  const dep = (label, arr) => `<div class="sys-sub">${label}：${(arr || []).length ? arr.map(escapeHtml).join(", ") : "—"}</div>`;
  return `<div class="sys-detail">
    <div class="sys-sub">${t("srv.desc")}：${escapeHtml(s.desc || "—")}</div>
    <div class="sys-sub">${t("srv.loadState")}：${escapeHtml(s.loadState || "—")} · ${t("srv.unitFileState")}：${escapeHtml(s.unitFileState || "—")}</div>
    <div class="sys-sub">${t("srv.nRestarts")}：${s.nRestarts ?? "—"} · ${t("srv.exitStatus")}：${s.exitStatus ?? "—"} · ${t("srv.restartPolicy")}：${escapeHtml(s.restartPolicy || "—")}</div>
    ${dep(t("srv.depsAfter"), s.after)}
    ${dep(t("srv.depsRequires"), s.requires)}
    ${dep(t("srv.depsRequiredBy"), s.requiredBy)}
    <div style="margin-top:6px"><select class="fw-mode" data-syslog-lines><option value="50">50</option><option value="200" selected>200</option><option value="500">500</option><option value="1000">1000</option></select> <a href="javascript:void(0)" data-syslog="${escapeHtml(s.name)}">${t("srv.logs")}</a></div>
    <pre class="sys-log" id="syslog-${escapeHtml(s.name)}" style="display:none">${t("srv.logsHint")}</pre>
  </div>`;
}

function renderSystemd(m) {
  if (!m?.services) return `<pre>${escapeHtml(m?.error || "N/A")}</pre>`;
  const services = m.services || [];
  const summary = m.summary || {};
  const q = (searchBox.value || "").trim().toLowerCase();
  const list = services.filter((s) =>
    (sysStateFilter === "all" || s.state === sysStateFilter) &&
    (sysTypeFilter === "all" || s.unitType === sysTypeFilter) &&
    (!q || s.name.toLowerCase().includes(q))
  );
  const summaryHtml = `<div class="sys-summary">
    <span class="ok">${t("srv.summaryActive")} <b>${summary.active ?? 0}</b></span>
    <span class="bad">${t("srv.summaryFailed")} <b>${summary.failed ?? 0}</b></span>
    <span class="na">${t("srv.summaryInactive")} <b>${summary.inactive ?? 0}</b></span>
    <span>${t("srv.sumTotal")} <b>${services.length}</b></span>
  </div>`;
  const tabs = [["all", t("srv.filterAll")], ["active", t("srv.filterRunning")], ["failed", t("srv.filterFailed")], ["inactive", t("srv.filterStopped")]]
    .map(([v, label]) => `<button class="seg-tab${sysStateFilter === v ? " active" : ""}" data-sysfilter-state="${v}">${label}</button>`).join("");
  const typeOpts = [["all", t("srv.typeAll")], ["service", t("srv.typeService")], ["socket", t("srv.typeSocket")], ["timer", t("srv.typeTimer")]]
    .map(([v, label]) => `<option value="${v}"${sysTypeFilter === v ? " selected" : ""}>${label}</option>`).join("");
  const filterHtml = `<div class="sys-filters"><div class="seg-tabs">${tabs}</div><select class="fw-mode" data-sysfilter-type>${typeOpts}</select></div>`;
  if (!list.length) return summaryHtml + filterHtml + `<pre>${escapeHtml(q ? t("srv.noMatchQ").replace("{q}", q) : t("srv.noMatchCfg"))}</pre>`;
  const svcPids = new Set(services.map((s) => String(s.mainPid)));
  const procs = ((m.userProcs && m.userProcs.procs) || []).filter((p) => !svcPids.has(String(p.pid)));
  const procRows = procs.map((p) => `<tr><td>${t("srv.proc")}</td><td>${escapeHtml(p.name)}</td><td class="ok">${t("srv.running")}</td><td>${escapeHtml(p.cpu ?? "—")}</td><td>${escapeHtml(p.mem ?? "—")}</td><td>—</td><td>${p.pid}</td><td>—</td><td>—</td></tr>`).join("");
  const rows = list.map((s) => {
    const cls = s.state === "active" ? "ok" : s.state === "failed" ? "bad" : "na";
    const dangerous = SYS_DANGEROUS.test(s.name);
    const ops = [];
    if (!dangerous) {
      if (s.state === "active") ops.push(opBtn(s, "stop"), opBtn(s, "restart"), opBtn(s, "reload"));
      else ops.push(opBtn(s, "start"));
      ops.push(opBtn(s, s.unitFileState === "enabled" ? "disable" : "enable"));
    }
    const opHtml = ops.length ? `<span class="proc-ops">${ops.join("")}</span>` : (dangerous ? `<span class="tag">${t("srv.dangerous")}</span>` : "—");
    const typeTag = s.unitType === "service" ? "" : `<span class="tag">${s.unitType}</span>`;
    const open = openSdRows.has(s.name);
    return `<tr class="sys-row${open ? " open" : ""}">
      <td>${typeTag || t("srv.svc")}</td>
      <td><a href="javascript:void(0)" data-systoggle="${escapeHtml(s.name)}">${escapeHtml(s.name)}</a>${dangerous ? ` <span class="tag na">${t("srv.dangerous")}</span>` : ""}</td>
      <td class="${cls}">${escapeHtml(s.sub || s.state)}</td>
      <td>${escapeHtml(s.cpu ?? "—")}</td><td>${escapeHtml(s.mem ?? "—")}</td><td>${escapeHtml(s.memMb ?? "—")}</td>
      <td>${escapeHtml(s.mainPid || "—")}</td><td>${escapeHtml(s.started)}</td>
      <td>${opHtml}</td>
    </tr>${open ? `<tr class="sys-detail-row"><td colspan="9">${renderSdDetail(s)}</td></tr>` : ""}`;
  }).join("");
  return summaryHtml + filterHtml + `<div class="card-body"><table class="svc-table"><thead><tr><th>${t("srv.type")}</th><th>${t("srv.name")}</th><th>${t("srv.state")}</th><th>${t("srv.cpu")}</th><th>${t("srv.mem")}</th><th>${t("srv.memMb")}</th><th>PID</th><th>${t("srv.started")}</th><th>${t("srv.ops")}</th></tr></thead><tbody>${rows}${procRows}</tbody></table></div>`;
}

cards.addEventListener("click", (e) => {
  const stateBtn = e.target.closest("[data-sysfilter-state]");
  if (stateBtn) { sysStateFilter = stateBtn.dataset.sysfilterState; renderCards(); return; }
  const typeSel = e.target.closest("[data-sysfilter-type]");
  if (typeSel) { sysTypeFilter = typeSel.value; renderCards(); return; }
  const tg = e.target.closest("[data-systoggle]");
  if (tg) { const n = tg.dataset.systoggle; if (openSdRows.has(n)) openSdRows.delete(n); else openSdRows.add(n); renderCards(); return; }
  const lg = e.target.closest("[data-syslog]");
  if (lg) { loadSysLog(lg.dataset.syslog); return; }
  const op = e.target.closest("[data-sysop]");
  if (!op) return;
  const unit = op.dataset.unit, action = op.dataset.sysop;
  const label = { start: t("srv.opStart"), stop: t("srv.opStop"), restart: t("srv.opRestart"), reload: t("srv.opReload"), enable: t("srv.opEnable"), disable: t("srv.opDisable") }[action];
  procTarget = { kind: "systemd-op", unit, action };
  document.getElementById("proc-title").textContent = `${label} ${unit}`;
  document.getElementById("proc-text").textContent = t("srv.opConfirm").replace("{unit}", unit).replace("{op}", label);
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("proc");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
});

async function loadSysLog(unit) {
  const pre = document.getElementById(`syslog-${unit}`);
  if (!pre) return;
  const lines = pre.closest(".sys-detail")?.querySelector("[data-syslog-lines]")?.value || 200;
  pre.style.display = "";
  pre.textContent = t("srv.logsLoading");
  try {
    const res = await fetch("api/systemd/logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unit, lines: Number(lines) }) });
    const d = await res.json();
    pre.textContent = d.content || (d.error || t("srv.logsEmpty"));
  } catch (err) { pre.textContent = String(err); }
}

function renderSystemdSkeleton() {
  const line = (w) => `<div class="skel-line" style="width:${w}"></div>`;
  const summary = `<div class="sys-summary">${line("72px")}${line("52px")}${line("64px")}${line("42px")}</div>`;
  const filters = `<div class="sys-filters">${line("130px")}<div style="flex:1"></div>${line("90px")}</div>`;
  const row = () => `<div class="sys-skel-row">${["40px", "170px", "60px", "44px", "44px", "60px", "70px", "140px", "96px"].map(line).join("")}</div>`;
  return summary + filters + `<div class="card-body">${Array.from({ length: 6 }, row).join("")}</div>`;
}

function renderNginxSkeleton() {
  const skel = (n) => Array.from({ length: n }, () => `<div class="skel-line"></div>`).join("");
  return `<div class="card-body">${skel(2)}</div><h3 style="font-size:14px;margin:12px 0 4px">${t("nginx.confsTitle")}</h3><div class="card-body">${skel(4)}</div>`;
}

function renderNginx(m, logs) {
  if (m?.error) return `<pre>${escapeHtml(m.error)}</pre>`;
  const info = `<div class="sys-info" style="font-size:14px">
    <span class="${m.status?.ok ? "ok" : "bad"}">● ${escapeHtml(m.status?.detail || t("nginx.unknown"))}</span>
    <span class="sep"></span>${t("nginx.version")} ${escapeHtml(m.version || "—")}
    <span class="sep"></span>${t("nginx.configCheck")} <span class="${m.config?.ok ? "ok" : "bad"}">${m.config?.ok ? t("nginx.pass") : t("nginx.fail")}</span>
    <span class="sep"></span>${t("nginx.worker")} ${m.workers || 0}
    <span class="sep"></span>${t("nginx.running")} ${escapeHtml(m.uptime || "—")}
  </div>`;
  const running = Boolean(m.status?.ok);
  const ops = `<div style="display:flex;gap:8px;margin:10px 0">
    <button class="btn small" data-nginx-op="reload">${t("nginx.opReloadCfg")}</button>
    <button class="btn small" data-nginx-op="restart">${t("nginx.opRestartSvc")}</button>
    ${running
      ? `<button class="btn small" data-nginx-op="stop">${t("nginx.opStopSvc")}</button>`
      : `<button class="btn small" data-nginx-op="start">${t("nginx.opStartSvc")}</button>`}
  </div>`;
  const errLog = logs?.errorLog ? `<details style="margin-top:10px"><summary style="cursor:pointer">${t("nginx.errLog")}</summary><pre>${escapeHtml(logs.errorLog)}</pre></details>` : "";
  return `${info}${ops}<h3 style="font-size:14px;margin:12px 0 4px">${t("nginx.confsTitle")}</h3><div id="nginx-confs"><pre>${t("nginx.loading")}</pre></div>${errLog}`;
}

async function loadNginxConfs() {
  const box = document.getElementById("nginx-confs");
  if (!box) return;
  try {
    const res = await fetch("api/nginx/confs");
    const data = await res.json();
    const confs = data.confs || [];
    const listens = metrics.nginx?.listens || [];
    if (!confs.length && !listens.length) { box.innerHTML = `<pre>${escapeHtml(data.error || t("nginx.noConf"))}</pre>`; return; }
    const byFile = new Map();
    for (const l of listens) {
      if (!l.file) continue;
      if (!byFile.has(l.file)) byFile.set(l.file, []);
      byFile.get(l.file).push(l);
    }
    const seen = new Set();
    const entries = [];
    for (const c of confs) {
      if (seen.has(c.path)) continue;
      seen.add(c.path);
      entries.push({ name: c.name, path: c.path });
    }
    for (const file of byFile.keys()) {
      if (seen.has(file)) continue;
      seen.add(file);
      entries.push({ name: file.split("/").pop(), path: file });
    }
    const rows = entries.map((c) => {
      const ls = byFile.get(c.path) || [];
      const ports = [...new Set(ls.map((l) => l.port).filter(Boolean))].join(", ") || "—";
      const names = [...new Set(ls.map((l) => l.serverName).filter(Boolean))].join(", ") || "—";
      return `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.path)}</td><td>${escapeHtml(ports)}</td><td>${escapeHtml(names)}</td><td><span class="proc-ops"><a href="javascript:void(0)" data-nginx-conf="${escapeHtml(c.path)}">${t("nginx.view")}</a><a href="javascript:void(0)" data-nginx-conf="${escapeHtml(c.path)}" data-nginx-edit="1">${t("nginx.edit")}</a></span></td></tr>`;
    }).join("");
    box.innerHTML = `<div class="card-body"><table class="svc-table"><thead><tr><th>${t("nginx.file")}</th><th>${t("nginx.path")}</th><th>${t("nginx.listenPort")}</th><th>server_name</th><th>${t("proc.ops")}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  } catch (e) {
    box.innerHTML = `<pre>${t("nginx.loadFail").replace("{e}", escapeHtml(String(e)))}</pre>`;
  }
}

function sslLevel(daysLeft) {
  if (typeof daysLeft !== "number") return "na";
  if (daysLeft <= 7) return "bad";
  if (daysLeft <= 30) return "na";
  return "ok";
}

function sslBar(daysLeft) {
  const pct = typeof daysLeft !== "number" ? 0 : Math.max(0, Math.min(100, Math.round((daysLeft / 90) * 100)));
  const cls = sslLevel(daysLeft);
  return `<div class="ssl-bar"><div class="ssl-bar-fill ${cls}" style="width:${pct}%"></div></div>`;
}

async function loadDbConnections() {
  let data;
  try {
    const res = await fetch("api/db/connections");
    data = await res.json();
  } catch { data = null; }
  const el = document.getElementById("db-list");
  if (!el) return;
  if (data === null) { el.innerHTML = `<pre>${t("fs.loadFail").replace("{e}", "")}</pre>`; return; }
  renderDbConnections(data.connections || []);
}

function renderDbConnections(list) {
  const el = document.getElementById("db-list");
  if (!el) return;
  if (!list.length) { el.innerHTML = `<pre class="hint">${t("db.empty")}</pre>`; return; }
  const typeLabel = { postgres: t("db.typePostgres"), mysql: t("db.typeMysql"), redis: t("db.typeRedis"), mongodb: t("db.typeMongo"), sqlite: t("db.typeSqlite") };
  el.innerHTML = `<div class="db-grid">` + list.map((c) => {
    const addr = c.type === "sqlite" ? escapeHtml(c.path) : `${escapeHtml(c.host)}:${escapeHtml(c.port)}`;
    const db = c.type === "sqlite" ? "" : `<span class="db-sub">${t("db.database")} ${escapeHtml(c.database || "—")}</span>`;
    const user = c.type === "sqlite" ? "" : `<span class="db-sub">${t("db.user")} ${escapeHtml(c.user || "—")}</span>`;
    const pass = c.hasPass ? `<span class="tag ok">${t("db.hasPass")}</span>` : `<span class="tag">${t("db.noPass")}</span>`;
    const state = c.enabled ? "" : ` class="na"`;
    const ops = `<span class="proc-ops">
      <a href="javascript:void(0)" data-db-action="test" data-db-id="${escapeHtml(c.id)}">${t("db.testBtn")}</a>
      <a href="javascript:void(0)" data-db-action="edit" data-db-id="${escapeHtml(c.id)}">${t("db.editBtn")}</a>
      <a href="javascript:void(0)" data-db-action="toggle" data-db-id="${escapeHtml(c.id)}" data-db-enabled="${c.enabled !== false}">${c.enabled === false ? t("db.enableBtn") : t("db.disableBtn")}</a>
      <a href="javascript:void(0)" data-db-action="del" data-db-id="${escapeHtml(c.id)}" class="danger">${t("db.delBtn")}</a>
    </span>`;
    return `<div class="db-card"><div class="db-head"><b${state}>${escapeHtml(c.name)}</b><span class="tag">${typeLabel[c.type] || c.type}</span>${pass}</div>
      <div class="db-addr">${addr}</div>${db}${user}
      <div class="db-ops">${ops}</div>
      <div class="db-result" id="db-result-${escapeHtml(c.id)}"></div></div>`;
  }).join("") + `</div>`;
}

document.addEventListener("click", async (e) => {
  const add = e.target.closest("[data-db-add]");
  if (add) { openDbModal(); return; }
  const a = e.target.closest("[data-db-action]");
  if (!a) return;
  const id = a.dataset.dbId;
  const action = a.dataset.dbAction;
  if (action === "test") {
    const conn = await fetchDbConn(id);
    if (!conn) return;
    if (conn.hasPass) { runDbTest(id, ""); }
    else {
      procTarget = { kind: "db-test", id };
      document.getElementById("proc-title").textContent = t("db.testBtn");
      document.getElementById("proc-text").textContent = t("db.testingHint");
      document.getElementById("proc-err").textContent = "";
      const pw = document.getElementById("proc-password");
      pw.value = "";
      setProcPwdLabel("proc");
      procMask.classList.add("show");
      setTimeout(() => pw.focus(), 50);
    }
  } else if (action === "edit") {
    const conn = await fetchDbConn(id);
    if (conn) openDbModal(conn);
  } else if (action === "toggle") {
    await fetch("api/db/connections", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled: a.dataset.dbEnabled !== "true" }) });
    loadDbConnections();
  } else if (action === "del") {
    if (!confirm(t("db.delConfirm"))) return;
    await fetch("api/db/connections", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    loadDbConnections();
  }
});

async function fetchDbConn(id) {
  try {
    const res = await fetch("api/db/connections");
    const data = await res.json();
    return (data.connections || []).find((c) => c.id === id);
  } catch { return null; }
}

async function runDbTest(id, password) {
  const resEl = document.getElementById(`db-result-${id}`);
  if (resEl) resEl.innerHTML = `<span class="na">${t("db.testing")}</span>`;
  try {
    const res = await fetch("api/db/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(password ? { id, password } : { id }) });
    const d = await res.json();
    if (resEl) resEl.innerHTML = d.ok ? `<span class="ok">✓ ${t("db.testOk")}${Number.isFinite(d.latencyMs) ? `（${d.latencyMs}ms）` : ""}</span>` : `<span class="bad">✗ ${escapeHtml(d.detail || d.error || t("db.testFail"))}</span>`;
  } catch (err) {
    if (resEl) resEl.innerHTML = `<span class="bad">✗ ${escapeHtml(String(err))}</span>`;
  }
}

const dbAddMask = document.getElementById("db-add-mask");
function openDbModal(conn) {
  document.getElementById("db-add-id").value = conn?.id || "";
  document.getElementById("db-add-name").value = conn?.name || "";
  document.getElementById("db-add-type").value = conn?.type || "postgres";
  document.getElementById("db-add-host").value = conn?.host || "";
  document.getElementById("db-add-port").value = conn?.port || "";
  document.getElementById("db-add-database").value = conn?.database || "";
  document.getElementById("db-add-user").value = conn?.user || "";
  document.getElementById("db-add-password").value = "";
  document.getElementById("db-add-path").value = conn?.path || "";
  document.getElementById("db-add-err").textContent = "";
  document.getElementById("db-add-title").textContent = conn ? t("db.editBtn") : t("db.addBtn");
  dbSyncTypeFields();
  dbAddMask.classList.add("show");
  setTimeout(() => document.getElementById("db-add-name").focus(), 50);
}
function dbSyncTypeFields() {
  const isSqlite = document.getElementById("db-add-type").value === "sqlite";
  for (const f of ["db-add-host-field", "db-add-port-field", "db-add-database-field", "db-add-user-field", "db-add-password-field"]) {
    document.getElementById(f).style.display = isSqlite ? "none" : "";
  }
  document.getElementById("db-add-path-field").style.display = isSqlite ? "" : "none";
}
document.getElementById("db-add-close").onclick = () => dbAddMask.classList.remove("show");
document.getElementById("db-add-cancel").onclick = () => dbAddMask.classList.remove("show");
dbAddMask.addEventListener("click", (e) => { if (e.target === dbAddMask) dbAddMask.classList.remove("show"); });
document.getElementById("db-add-type").onchange = dbSyncTypeFields;
document.getElementById("db-add-save").onclick = async () => {
  const id = document.getElementById("db-add-id").value;
  const body = { name: document.getElementById("db-add-name").value.trim() };
  const isSqlite = document.getElementById("db-add-type").value === "sqlite";
  if (isSqlite) { body.type = "sqlite"; body.path = document.getElementById("db-add-path").value.trim(); }
  else {
    body.type = document.getElementById("db-add-type").value;
    body.host = document.getElementById("db-add-host").value.trim();
    body.port = document.getElementById("db-add-port").value.trim();
    body.database = document.getElementById("db-add-database").value.trim();
    body.user = document.getElementById("db-add-user").value.trim();
    const pw = document.getElementById("db-add-password").value;
    if (pw) body.password = pw;
  }
  const method = id ? "PATCH" : "POST";
  const payload = id ? { ...body, id } : body;
  const res = await fetch("api/db/connections", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) { document.getElementById("db-add-err").textContent = data.error || t("db.errSave"); return; }
  dbAddMask.classList.remove("show");
  loadDbConnections();
};

function renderSslSkeleton() {
  const skel = (n) => Array.from({ length: n }, () => `<div class="skel-line"></div>`).join("");
  const summary = `<div class="ssl-summary">${Array.from({ length: 4 }, () => `<div class="skel-line" style="width:90px;margin:0"></div>`).join("")}</div>`;
  return summary + `<div class="card-body">${skel(5)}</div>`;
}

function renderSsl(m) {
  const list = m?.results;
  if (!list) return `<pre>${escapeHtml(m?.error || "N/A")}</pre>`;
  const total = list.length;
  const warn = list.filter((s) => typeof s.daysLeft === "number" && s.daysLeft > 7 && s.daysLeft <= 30).length;
  const expired = list.filter((s) => typeof s.daysLeft === "number" && s.daysLeft <= 7).length;
  const tool = m.renewTool ? t("ssl.toolAvail").replace("{tool}", m.renewTool) : t("ssl.toolNone");
  const summary = `<div class="ssl-summary">
    <span>${t("ssl.sumTotal").replace("{n}", total)}</span>
    <span class="na">${t("ssl.sumWarn")} <b>${warn}</b></span>
    <span class="bad">${t("ssl.sumBad")} <b>${expired}</b></span>
    <span>${t("ssl.sumTool").replace("{tool}", escapeHtml(tool))}</span>
    <button class="btn small" id="ssl-add-btn">${t("ssl.addBtn")}</button>
  </div>`;
  if (!total) return summary + `<pre>${escapeHtml(t("ssl.empty"))}</pre>`;
  const rows = list.map((s) => {
    const cls = sslLevel(s.daysLeft);
    const expire = typeof s.daysLeft === "number" ? (s.daysLeft > 0 ? `${s.daysLeft} ${t("ssl.days")}` : t("ssl.expired")) : "—";
    const name = s.type === "local" ? escapeHtml(s.path) : `${escapeHtml(s.host)}:${escapeHtml(s.port)}`;
    const srcLabel = s.source === "discovered" ? `<span class="tag">${t("ssl.auto")}</span>` : `<span class="tag">${t("ssl.manual")}</span>`;
    const ops = [];
    if (s.type === "local" && s.enabled !== false && m.renewTool) ops.push(`<a href="javascript:void(0)" data-ssl-action="renew" data-ssl-id="${escapeHtml(s.id)}" data-ssl-name="${escapeHtml(s.cn || s.path)}">${t("ssl.renew")}</a>`);
    if (s.source === "manual") {
      ops.push(`<a href="javascript:void(0)" data-ssl-action="toggle" data-ssl-id="${escapeHtml(s.id)}" data-ssl-enabled="${s.enabled !== false}">${s.enabled === false ? t("ssl.enable") : t("ssl.disable")}</a>`);
      ops.push(`<a href="javascript:void(0)" data-ssl-action="del" data-ssl-id="${escapeHtml(s.id)}" class="danger">${t("ssl.del")}</a>`);
    }
    const opsHtml = ops.length ? `<span class="proc-ops ssl-ops">${ops.join("")}</span>` : "—";
    return `<tr><td>${name} ${srcLabel}</td><td>${escapeHtml(s.cn || "—")}</td><td>${escapeHtml(s.issuer || "—")}</td><td>${escapeHtml(s.notAfter || "—")}</td><td class="${cls}">${expire}${sslBar(s.daysLeft)}</td><td>${escapeHtml((s.san || []).join(", "))}</td><td>${escapeHtml(s.label || "—")}</td><td>${opsHtml}</td></tr>`;
  }).join("");
  return summary + `<div class="card-body"><table class="svc-table"><thead><tr><th>${t("ssl.hostPath")}</th><th>${t("ssl.cn")}</th><th>${t("ssl.issuer")}</th><th>${t("ssl.expire")}</th><th>${t("ssl.left")}</th><th>${t("ssl.san")}</th><th>${t("ssl.note")}</th><th>${t("ssl.ops")}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

const sslAddMask = document.getElementById("ssl-add-mask");
const sslRenewMask = document.getElementById("ssl-renew-mask");
let sslRenewTarget = null;

cards.addEventListener("click", async (e) => {
  if (e.target.id === "ssl-add-btn") {
    document.getElementById("ssl-add-err").textContent = "";
    sslAddMask.classList.add("show");
    return;
  }
  const a = e.target.closest("[data-ssl-action]");
  if (!a) return;
  const action = a.dataset.sslAction;
  const id = a.dataset.sslId;
  if (action === "renew") {
    sslRenewTarget = { id, name: a.dataset.sslName };
    document.getElementById("ssl-renew-text").textContent = t("ssl.renewText").replace("{name}", a.dataset.sslName);
    document.getElementById("ssl-renew-password").value = "";
    document.getElementById("ssl-renew-err").textContent = "";
    sslRenewMask.classList.add("show");
  } else if (action === "del") {
    if (!confirm(t("ssl.delConfirm"))) return;
    await fetch("api/ssl", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    refreshMetrics();
  } else if (action === "toggle") {
    await fetch("api/ssl", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled: a.dataset.sslEnabled !== "true" }) });
    refreshMetrics();
  }
});

document.getElementById("ssl-add-cancel").onclick = () => sslAddMask.classList.remove("show");
document.getElementById("ssl-add-close").onclick = () => sslAddMask.classList.remove("show");
document.getElementById("ssl-add-type").onchange = (e) => {
  const local = e.target.value === "local";
  document.getElementById("ssl-add-remote-fields").style.display = local ? "none" : "";
  document.getElementById("ssl-add-local-fields").style.display = local ? "" : "none";
};
document.getElementById("ssl-add-save").onclick = async () => {
  const type = document.getElementById("ssl-add-type").value;
  const body = { type, label: document.getElementById("ssl-add-label").value.trim() };
  if (type === "local") body.path = document.getElementById("ssl-add-path").value.trim();
  else { body.host = document.getElementById("ssl-add-host").value.trim(); body.port = document.getElementById("ssl-add-port").value.trim() || "443"; }
  const res = await fetch("api/ssl", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { document.getElementById("ssl-add-err").textContent = data.error || t("ssl.addFail"); return; }
  sslAddMask.classList.remove("show");
  refreshMetrics();
};

document.getElementById("ssl-renew-cancel").onclick = () => sslRenewMask.classList.remove("show");
document.getElementById("ssl-renew-close").onclick = () => sslRenewMask.classList.remove("show");
document.getElementById("ssl-renew-confirm").onclick = async () => {
  const errEl = document.getElementById("ssl-renew-err");
  const password = document.getElementById("ssl-renew-password").value.trim();
  if (!password) { errEl.textContent = t("proc.pwdRequired"); return; }
  errEl.textContent = "";
  const btn = document.getElementById("ssl-renew-confirm");
  btn.disabled = true;
  try {
    const res = await fetch("api/ssl/renew", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sslRenewTarget.id, password }) });
    const data = await res.json();
    if (!res.ok || !data.ok) { errEl.textContent = data.error || data.stderr || t("ssl.renewFail"); return; }
    sslRenewMask.classList.remove("show");
    refreshMetrics();
  } finally { btn.disabled = false; }
};

const FIREWALL_MODES = { delete: "删除放行规则", deny: "添加拒绝规则" };
const PORT_SERVICES = { 22: "ssh", 25: "smtp", 53: "dns", 80: "http", 110: "pop3", 143: "imap", 443: "https", 3306: "mysql", 5432: "postgres", 6379: "redis", 8080: "http-alt", 8443: "https-alt", 9090: "prometheus", 27017: "mongodb", 9000: "php-fpm", 9418: "git", 5000: "docker-registry", 2375: "docker", 11211: "memcached" };
const FW_PAGE_SIZE = 10;
let fwRiskPage = 0;
let fwRulesPage = 0;
let fwOpsPage = 0;
let fwOpsCache = null;
let lastFwMetrics = null;
const FW_SERVICE_NAMES = { 21: "FTP", 22: "SSH", 25: "SMTP", 53: "DNS", 80: "HTTP", 110: "POP3", 143: "IMAP", 443: "HTTPS", 3306: "MySQL", 5432: "PostgreSQL", 6379: "Redis", 27017: "MongoDB", 9200: "Elasticsearch", 2375: "Docker API", 2376: "Docker TLS", 8888: "管理面板", 9090: "监控面板", 9000: "管理面板", 8080: "HTTP 备用" };

function fwServiceTag(portStr) {
  const n = Number(String(portStr).split(",")[0].split("-")[0]);
  const name = FW_SERVICE_NAMES[n];
  return name ? `<span class="fw-svc">${escapeHtml(name)}</span>` : "";
}

function renderNetworkSkeleton() {
  const skel = (n) => Array.from({ length: n }, () => `<div class="skel-line"></div>`).join("");
  const cell = (w = "100%") => `<td><div class="skel-line" style="width:${w};margin:0"></div></td>`;
  const tableSkel = (cols, n) => {
    const th = Array.from({ length: cols }, () => "<th></th>").join("");
    const tr = Array.from({ length: n }, () => `<tr>${Array.from({ length: cols }, (_, i) => cell(i === 0 ? "100%" : "60%")).join("")}</tr>`).join("");
    return `<div class="card-body"><table class="svc-table"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
  };
  const card = (title, inner) => `<div class="card wide"><h2>${title}</h2>${inner}</div>`;
  const stat = (label) => `<div class="fw-stat"><span class="k">${label}</span><div class="skel-line" style="width:70%"></div></div>`;
  return [
    card(t("net.trafficTitle"), `<div class="chart-wrap" style="height:220px"><div class="skel-block" style="height:220px"></div></div>`),
    card(t("net.connTitle"), `<div class="fw-summary">${stat(t("net.listenCount"))}${stat(t("net.estTotal"))}${stat(t("net.topConn"))}</div>${tableSkel(3, 5)}`),
    card(t("net.nicTitle"), tableSkel(6, 3)),
    card(t("net.probeTitle"), `<div class="card-body">${skel(2)}</div>`),
    card(t("net.dnsTitle"), `<div class="card-body">${skel(3)}</div>`),
    card(t("net.listenTitle"), tableSkel(5, 6) + `<div class="card-body">${skel(2)}</div>`),
  ].join("");
}

function renderNetwork(m, all) {
  if (!m) return renderNetworkSkeleton();
  const items = m?.listeners?.items || [];
  const conns = all?.connSummary?.est || {};
  const nics = all?.nicHealth?.nics || [];
  const dns = all?.dnsRoute || {};
  const scan = all?.portScan?.results;
  const ping = all?.pingResult?.results;
  const probe = all?.probeResult;
  const card = (title, inner) => `<div class="card wide"><h2>${title}</h2>${inner}</div>`;
  const out = [];

  // 1. 流量曲线
  out.push(card(t("net.trafficTitle"), `<div class="chart-wrap" style="height:220px"><canvas id="net-traffic-chart" style="width:100%;height:220px;display:block"></canvas></div>`));

  // 2. 端口连接数（汇总级）
  const listenerPorts = [];
  for (const it of items) {
    const mm = it.local.match(/:(\d+)$/);
    if (mm) listenerPorts.push(Number(mm[1]));
  }
  const portConns = [...new Set(listenerPorts)].map((p) => ({ port: p, n: conns[p] || 0 })).sort((a, b) => b.n - a.n).slice(0, 15);
  const connTotal = Object.values(conns).reduce((a, b) => a + b, 0);
  const connRows = portConns.map((c) => `<tr><td>${c.port}</td><td>${PORT_SERVICES[c.port] || "—"}</td><td>${c.n}</td></tr>`).join("");
  out.push(card(t("net.connTitle"), `<div class="fw-summary">
    <div class="fw-stat"><span class="k">${t("net.listenCount")}</span><span class="v">${listenerPorts.length}</span></div>
    <div class="fw-stat"><span class="k">${t("net.estTotal")}</span><span class="v">${connTotal}</span></div>
    <div class="fw-stat"><span class="k">${t("net.topConn")}</span><span class="v">${portConns[0]?.port ?? "—"}</span></div>
  </div>${connRows ? `<div class="card-body"><table class="svc-table"><thead><tr><th>${t("net.port")}</th><th>${t("net.svcLabel")}</th><th>${t("net.conn")}</th></tr></thead><tbody>${connRows}</tbody></table></div>` : `<pre>${t("net.noConn")}</pre>`}`));

  // 3. 网卡健康
  const nicRows = nics.map((n) => `<tr><td>${escapeHtml(n.name)}</td><td>${escapeHtml(n.state)}</td><td>${fmtBytes(n.rxBytes)}</td><td>${fmtBytes(n.txBytes)}</td><td>${n.rxErr} / ${n.txErr}</td><td>${n.rxDrop} / ${n.txDrop}</td></tr>`).join("");
  out.push(card(t("net.nicTitle"), nicRows
    ? `<div class="card-body"><table class="svc-table"><thead><tr><th>${t("net.nic")}</th><th>${t("net.state")}</th><th>${t("net.rx")}</th><th>${t("net.tx")}</th><th>${t("net.err")}</th><th>${t("net.drop")}</th></tr></thead><tbody>${nicRows}</tbody></table></div>`
    : `<pre>${t("net.noNic")}</pre>`));

  // 4. 远端端口探测
  out.push(card(t("net.probeTitle"), probe
    ? `<pre>${escapeHtml(probe.host)}:${escapeHtml(probe.port)} → ${probe.ok ? t("net.probeOk") : t("net.probeFail")}${probe.detail ? "\n" + escapeHtml(probe.detail) : ""}</pre>`
    : `<pre>${t("net.probeHint")}</pre>`));

  // 5. DNS / 路由
  const dnsLines = (dns.nameservers || []).map((l) => escapeHtml(l)).join("\n");
  const routeLines = (dns.routes || []).map((l) => escapeHtml(l)).join("\n");
  out.push(card(t("net.dnsTitle"), `<pre>${dnsLines || t("net.noDns")}\n${t("net.routes")}\n${routeLines || t("net.noRoute")}</pre>`));

  // 6. 监听端口 + 端口扫描 + 连通性
  const listenHtml = items.length
    ? `<div class="card-body"><table class="svc-table"><thead><tr><th>${t("mon.proto")}</th><th>${t("mon.state")}</th><th>${t("mon.local")}</th><th>${t("mon.proc")}</th><th>PID</th></tr></thead><tbody>${items.map((i) => `<tr><td>${escapeHtml(i.proto)}</td><td>${escapeHtml(i.state)}</td><td>${escapeHtml(i.local)}</td><td>${escapeHtml(i.process || "—")}</td><td>${i.pid || "—"}</td></tr>`).join("")}</tbody></table></div>`
    : `<pre>${escapeHtml(m?.listeners?.detail || t("net.noListen"))}</pre>`;
  const scanHtml = scan?.length
    ? `<pre>${t("net.scanTitle")}${scan.map((p) => `${p.port} (${p.service}): ${p.ok ? t("net.listening") : t("net.notListening")}\n${p.detail}`).join("\n----\n")}</pre>`
    : "";
  const pingHtml = ping?.length
    ? `<pre>${t("net.pingTitle")}${ping.map((p) => `${escapeHtml(p.target)}: ${p.pingOk ? t("net.pingOk") : t("net.pingFail")} · ${escapeHtml(p.dns || "")}`).join("\n")}</pre>`
    : "";
  out.push(card(t("net.listenTitle"), listenHtml + scanHtml + pingHtml));

  return out.join("");
}

function renderFirewallSkeleton() {
  const skel = (n) => Array.from({ length: n }, () => `<div class="skel-line"></div>`).join("");
  const stat = (label) => `<div class="fw-stat"><span class="k">${label}</span><div class="skel-line" style="width:70%"></div></div>`;
  const riskRow = `<div class="fw-risk-row"><div class="skel-line" style="width:150px;margin:0"></div><div class="skel-line" style="width:80px;margin:0"></div><div class="skel-line" style="width:110px;margin:0"></div></div>`;
  const summary = `<div class="fw-summary">${stat(t("fw.state"))}${stat(t("fw.rules"))}${stat(t("fw.open"))}</div><div class="fw-policy"><div class="skel-line" style="width:200px;margin:0"></div></div>`;
  return `${summary}<h3 class="fw-sub">${t("fw.ruleSection")}</h3><div class="card-body">${skel(5)}</div><h3 class="fw-sub">${t("fw.riskSection")}</h3><div class="fw-risk">${riskRow}${riskRow}${riskRow}</div><h3 class="fw-sub">${t("fw.opSection")}</h3><div id="fw-ops">${skel(2)}</div>`;
}

function renderDockerSkeleton() {
  const cell = (w = "100%") => `<td><div class="skel-line" style="width:${w};margin:0"></div></td>`;
  const row = (cols) => `<tr>${cols}</tr>`;
  const cRows = Array.from({ length: 5 }, () => row(cell() + cell() + cell("60%") + cell("70%") + cell("50%") + cell("60%") + cell("80%"))).join("");
  const cHtml = `<div class="docker-table-wrap"><table class="svc-table"><thead><tr><th>${t("docker.name")}</th><th>${t("docker.image")}</th><th>${t("docker.state")}</th><th>${t("docker.status")}</th><th>${t("docker.ports")}</th><th>${t("docker.created")}</th><th></th></tr></thead><tbody>${cRows}</tbody></table></div>`;
  const statsHtml = `<h3 style="font-size:14px;margin:14px 0 6px">${t("docker.stats")}</h3><div id="docker-stats"><div class="card-body">${Array.from({ length: 3 }, () => `<div class="skel-line"></div>`).join("")}</div></div>`;
  const iRows = Array.from({ length: 3 }, () => row(cell() + cell("50%") + cell("70%") + cell("50%") + cell("60%"))).join("");
  const iHtml = `<h3 style="font-size:14px;margin:14px 0 6px">${t("docker.images")}</h3>
    <div style="margin:0 0 8px"><button class="btn small danger" id="docker-prune" disabled>${t("docker.prune")}</button></div>
    <div class="docker-table-wrap"><table class="svc-table"><thead><tr><th>${t("docker.repo")}</th><th>${t("docker.tag")}</th><th>${t("docker.id")}</th><th>${t("docker.size")}</th><th>${t("docker.since")}</th></tr></thead><tbody>${iRows}</tbody></table></div>`;
  return `${cHtml}${statsHtml}${iHtml}`;
}

function renderDocker(m) {
  if (!m) return renderDockerSkeleton();
  if (m.error) return `<pre>${escapeHtml(m.error)}</pre>`;
  const containers = Array.isArray(m.containers) ? m.containers : [];
  const images = Array.isArray(m.images) ? m.images : [];
  const opBtn = (action, label, danger = false) => (name) => `<button class="btn small${danger ? " danger" : ""}" data-docker-op="${action}" data-docker-name="${escapeHtml(name)}">${label}</button>`;
  const start = opBtn("start", t("docker.start"));
  const stop = opBtn("stop", t("docker.stop"));
  const restart = opBtn("restart", t("docker.restart"));
  const rm = opBtn("rm", t("docker.rm"), true);
  const cRows = containers.map((c) => `<tr>
    <td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.image)}</td>
    <td class="${c.state === "running" ? "ok" : "na"}">${escapeHtml(c.state)}</td>
    <td>${escapeHtml(c.status)}</td><td>${escapeHtml(c.ports)}</td><td>${escapeHtml(c.created)}</td>
    <td><div class="docker-ops">${c.state === "running" ? stop(c.name) : start(c.name)}${restart(c.name)}${rm(c.name)}<button class="btn small" data-docker-detail="${escapeHtml(c.name)}">${t("docker.detail")}</button><button class="btn small" data-docker-log="${escapeHtml(c.name)}">${t("docker.logs")}</button></div></td>
  </tr>`).join("");
  const cHtml = containers.length
    ? `<div class="docker-table-wrap"><table class="svc-table"><thead><tr><th>${t("docker.name")}</th><th>${t("docker.image")}</th><th>${t("docker.state")}</th><th>${t("docker.status")}</th><th>${t("docker.ports")}</th><th>${t("docker.created")}</th><th></th></tr></thead><tbody>${cRows}</tbody></table></div>`
    : `<pre>${t("docker.noContainers")}</pre>`;
  const statsHtml = `<h3 style="font-size:14px;margin:14px 0 6px">${t("docker.stats")}</h3><div id="docker-stats"><pre>${t("docker.loading")}</pre></div>`;
  const iRows = images.map((i) => `<tr><td>${escapeHtml(i.repository)}</td><td>${escapeHtml(i.tag)}</td><td>${escapeHtml(i.id)}</td><td>${escapeHtml(i.size)}</td><td>${escapeHtml(i.created)}</td></tr>`).join("");
  const iHtml = `<h3 style="font-size:14px;margin:14px 0 6px">${t("docker.images")}</h3>
    <div style="margin:0 0 8px"><button class="btn small danger" id="docker-prune">${t("docker.prune")}</button></div>
    <div class="docker-table-wrap"><table class="svc-table"><thead><tr><th>${t("docker.repo")}</th><th>${t("docker.tag")}</th><th>${t("docker.id")}</th><th>${t("docker.size")}</th><th>${t("docker.since")}</th></tr></thead><tbody>${iRows}</tbody></table></div>`;
  return `${cHtml}${statsHtml}${iHtml}`;
}

async function refreshDockerStats() {
  const box = document.getElementById("docker-stats");
  if (!box) return;
  try {
    const res = await fetch("api/docker/stats");
    const d = await res.json();
    if (d.error) { box.innerHTML = `<pre>${escapeHtml(d.error)}</pre>`; return; }
    const rows = (d.rows || []).map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.cpu)}</td><td>${escapeHtml(r.mem)}</td></tr>`).join("");
    box.innerHTML = rows ? `<div class="docker-table-wrap"><table class="svc-table"><thead><tr><th>${t("docker.name")}</th><th>${t("docker.cpu")}</th><th>${t("docker.mem")}</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<pre>${t("docker.noContainers")}</pre>`;
  } catch {}
}

async function openDockerDetail(name) {
  const mask = document.getElementById("docker-info-mask");
  const body = document.getElementById("docker-info-body");
  body.innerHTML = `<pre>${t("docker.loading")}</pre>`;
  mask.classList.add("show");
  try {
    const res = await fetch(`api/docker/inspect?name=${encodeURIComponent(name)}`);
    const d = await res.json();
    if (!res.ok || !d.ok) { body.innerHTML = `<pre>${escapeHtml(d.error || t("docker.inspectFail"))}</pre>`; return; }
    const it = d.detail;
    const kv = (k, v) => `<div class="kv-item"><span class="k">${k}</span><span class="v">${escapeHtml(v)}</span></div>`;
    body.innerHTML = kv(t("docker.name"), it.name)
      + kv(t("docker.detailRunning"), it.running ? t("docker.running") : t("docker.stopped"))
      + kv(t("docker.image"), it.image)
      + kv(t("docker.detailIp"), it.ip)
      + kv(t("docker.detailRestarts"), String(it.restarts))
      + kv(t("docker.detailMounts"), it.mounts.join("\n") || "—");
  } catch { body.innerHTML = `<pre>${t("docker.inspectFail")}</pre>`; }
}

function openContainerLog(name) {
  logTarget = { source: "docker", target: name };
  location.hash = "/logs";
  const iv = setInterval(() => {
    const hit = (logSources.docker || []).some((c) => c.name === name);
    if (hit) { clearInterval(iv); loadLog(); }
  }, 200);
  setTimeout(() => clearInterval(iv), 5000);
}

function renderFirewall(m) {
  if (!m) return renderFirewallSkeleton();
  if (m.error) return `<pre>${escapeHtml(m.error)}</pre>`;
  const rules = Array.isArray(m.rules) ? m.rules : [];
  const risky = Array.isArray(m.riskyPorts) ? m.riskyPorts : [];
  const dangerCount = risky.filter((p) => p.dangerous).length;
  const backend = m.backend || "ufw";
  const canClose = backend === "ufw" || backend === "firewalld";
  const stateLabel = backend === "firewalld" ? t("fw.bkFirewalld") : backend === "ufw" ? t("fw.bkUfw") : t("fw.bkIptables");
  const conns = m.connections || {};
  const policy = m.policy || "";
  const pager = (page, total, kind) => total > 1
    ? `<div class="fw-pager">
        <button class="btn small" data-fw-page="${kind}" data-fw-dir="prev"${page === 0 ? " disabled" : ""}>${t("fw.prev")}</button>
        <span class="fw-pageinfo">${page + 1} / ${total}</span>
        <button class="btn small" data-fw-page="${kind}" data-fw-dir="next"${page >= total - 1 ? " disabled" : ""}>${t("fw.next")}</button>
      </div>`
    : "";
  const summary = `<div class="fw-summary">
    <div class="fw-stat"><span class="k">${t("fw.state")}</span><span class="v">${stateLabel}</span></div>
    <div class="fw-stat"><span class="k">${t("fw.rules")}</span><span class="v">${rules.length}</span></div>
    <div class="fw-stat"><span class="k">${t("fw.open")}</span><span class="v ${dangerCount ? "bad" : ""}">${risky.length}${dangerCount ? t("fw.danger").replace("{n}", dangerCount) : ""}</span></div>
  </div>${policy ? `<div class="fw-policy"><span>${t("fw.policy")}</span><b>${escapeHtml(policy)}</b></div>` : ""}`;

  // 放行规则（分页）
  const rulesTotal = Math.max(1, Math.ceil(rules.length / FW_PAGE_SIZE));
  if (fwRulesPage >= rulesTotal) fwRulesPage = rulesTotal - 1;
  const pageRules = rules.slice(fwRulesPage * FW_PAGE_SIZE, (fwRulesPage + 1) * FW_PAGE_SIZE);
  let rulesHtml;
  if (rules.length) {
    const riskySet = new Set(risky.map((p) => `${p.proto}:${p.port}`));
    const rows = pageRules.map((r) => {
      const hit = String(r.port || "").split(",").some((p) => riskySet.has(`${r.proto}:${p.trim()}`));
      const style = hit ? " style='background:rgba(248,113,113,0.12)'" : "";
      const fromClass = /^Anywhere/.test(r.from) ? ' class="fw-from-open"' : ' class="fw-from-ip"';
      const conn = String(r.port || "").split(",").map((p) => conns[Number(p)] ?? 0).reduce((a, b) => a + b, 0);
      return `<tr${style}><td>${r.num ?? "—"}</td><td>${escapeHtml(r.action)}</td><td>${escapeHtml((r.proto || "").toUpperCase())}</td><td>${fwServiceTag(r.port)}<span>${escapeHtml(r.port)}</span></td><td><span${fromClass}>${escapeHtml(r.from)}</span></td><td>${conn}</td><td>${escapeHtml(r.comment || "—")}</td></tr>`;
    }).join("");
    rulesHtml = `<div class="card-body"><table class="svc-table"><thead><tr><th>${t("fw.num")}</th><th>${t("fw.action")}</th><th>${t("fw.proto")}</th><th>${t("fw.port")}</th><th>${t("fw.from")}</th><th>${t("fw.conn")}</th><th>${t("fw.comment")}</th></tr></thead><tbody>${rows}</tbody></table></div>${pager(fwRulesPage, rulesTotal, "rules")}`;
  } else {
    rulesHtml = `<pre>${escapeHtml(m.raw || t("fw.noRules"))}</pre>`;
  }

  // 对全网开放的端口（分页）
  const disabled = canClose ? "" : " disabled";
  const closeNote = canClose ? "" : `<div class="hint" style="margin-bottom:8px">${t("fw.noClose").replace("{backend}", escapeHtml(backend))}</div>`;
  const riskyTotal = Math.max(1, Math.ceil(risky.length / FW_PAGE_SIZE));
  if (fwRiskPage >= riskyTotal) fwRiskPage = riskyTotal - 1;
  const pageRisky = risky.slice(fwRiskPage * FW_PAGE_SIZE, (fwRiskPage + 1) * FW_PAGE_SIZE);
  const riskRows = pageRisky.map((p) => {
    const tag = p.dangerous ? `<span class="risk-badge risk-high">${t("fw.dangerTag")}</span>` : `<span class="risk-badge risk-low">${t("fw.normalTag")}</span>`;
    const opts = Object.entries(FIREWALL_MODES).map(([v]) => `<option value="${v}">${t(v === "delete" ? "fw.modeDelete" : "fw.modeDeny")}</option>`).join("");
    return `<div class="fw-risk-row"><input type="checkbox" class="fw-pick" data-fw-port="${p.port}" data-fw-proto="${p.proto}">${tag}<span class="fw-port">${fwServiceTag(p.port)}${p.port}/${p.proto}</span>
      <select class="fw-mode"${disabled}>${opts}</select>
      <button class="btn small" data-fw-close data-fw-port="${p.port}" data-fw-proto="${p.proto}"${disabled}>${t("fw.closeBtn")}</button></div>`;
  }).join("");
  // 工具条（唯一一份：停用/启用 + 新增端口 + 批量 + 加固），与分页同行（左分页右操作）
  const ctlBtns = canClose
    ? `<button class="btn small" data-fw-control data-action="disable">${t("fw.disableBtn")}</button>
       <button class="btn small" data-fw-control data-action="enable">${t("fw.enableBtn")}</button>`
    : "";
  const openBtn = `<button class="btn small" data-fw-open${disabled}>${t("fw.openBtn")}</button>`;
  const batchBtn = canClose && risky.length ? `<button class="btn small" data-fw-batch-close${disabled}>${t("fw.batchCloseBtn")}</button>
    <button class="btn small${dangerCount ? " danger" : ""}" data-fw-harden${disabled}>${t("fw.hardenBtn")}</button>` : "";
  const toolbar = `<div class="fw-toolbar">${ctlBtns}${openBtn}${batchBtn}</div>`;
  const riskHtml = risky.length
    ? `${closeNote}<div class="fw-risk">${riskRows}</div><div class="fw-footer">${pager(fwRiskPage, riskyTotal, "risk")}${toolbar}</div>`
    : `<pre>${t("fw.noRisk")}</pre><div class="fw-footer">${toolbar}</div>`;

  // 操作记录（分页）
  const opsTotal = Math.max(1, Math.ceil((fwOpsCache || []).length / FW_PAGE_SIZE));
  if (fwOpsPage >= opsTotal) fwOpsPage = opsTotal - 1;
  const pageOps = (fwOpsCache || []).slice(fwOpsPage * FW_PAGE_SIZE, (fwOpsPage + 1) * FW_PAGE_SIZE);
  const opsHtml = pageOps.length
    ? `<div class="card-body"><table class="svc-table"><thead><tr><th>${t("fw.opTime")}</th><th>${t("fw.opAction")}</th><th>${t("fw.opTarget")}</th></tr></thead><tbody>${pageOps.map((o) => {
        const time = new Date(o.ts).toLocaleString();
        const opLabel = { open: t("fw.opOpen"), deny: t("fw.opDeny"), close: t("fw.opClose"), enable: t("fw.opEnable"), disable: t("fw.opDisable") }[o.op] || o.op;
        return `<tr><td>${time}</td><td>${escapeHtml(opLabel)}</td><td>${escapeHtml(o.target)}</td></tr>`;
      }).join("")}</tbody></table></div>${pager(fwOpsPage, opsTotal, "ops")}`
    : `<pre class="hint">${t("fw.noOps")}</pre>`;

  return `${summary}<h3 class="fw-sub">${t("fw.ruleSection")}</h3>${rulesHtml}<h3 class="fw-sub">${t("fw.riskSection")}</h3>${riskHtml}<h3 class="fw-sub">${t("fw.opSection")}</h3>${opsHtml}`;
}

// ---------- 黑白名单（面板端口 IP 访问控制） ----------
let aclData = null;
function renderAclSkeleton() {
  const stat = (label) => `<div class="fw-stat"><span class="k">${label}</span><div class="skel-line" style="width:60%"></div></div>`;
  const addRow = `<div class="acl-add"><div class="skel-line" style="flex:1;margin:0;height:30px"></div><div class="skel-line" style="width:76px;margin:0;height:30px"></div><div class="skel-line" style="flex:1;margin:0;height:30px"></div><div class="skel-line" style="width:56px;margin:0;height:30px"></div></div>`;
  const cell = (w) => `<td><div class="skel-line" style="width:${w};margin:0"></div></td>`;
  const table = `<div class="card-body"><table class="svc-table"><thead><tr><th>${t("acl.ip")}</th><th>${t("acl.comment")}</th><th>${t("acl.time")}</th><th>${t("acl.op")}</th></tr></thead><tbody>${Array.from({ length: 3 }, () => `<tr>${cell("100%")}${cell("80%")}${cell("60%")}${cell("40px")}</tr>`).join("")}</tbody></table></div>`;
  const summary = `<div class="fw-summary">${stat(t("acl.port"))}${stat(t("acl.backend"))}${stat(t("acl.counts"))}</div>`;
  const hint = `<div class="acl-hint"><div class="skel-line" style="width:80%;margin:0"></div></div>`;
  return `${summary}${hint}<h3 class="fw-sub">${t("acl.wlTitle")}</h3>${addRow}${table}<h3 class="fw-sub">${t("acl.blTitle")}</h3>${addRow}${table}`;
}
function renderAcl() {
  if (!aclData) return renderAclSkeleton();
  if (aclData.error) return `<pre class="hint">${escapeHtml(aclData.error)}</pre>`;
  const { whitelist = [], blacklist = [], ports = [], backend } = aclData;
  const canEdit = backend === "ufw";
  const disabled = canEdit ? "" : " disabled";
  const disabledNote = canEdit ? "" : `<div class="hint" style="margin-bottom:8px">${t("acl.needUfw")}</div>`;
  const hint = whitelist.length
    ? `<div class="acl-hint danger">${t("acl.wlActive").replace("{n}", whitelist.length)}</div>`
    : `<div class="acl-hint">${t("acl.wlEmpty")}</div>`;
  const summary = `<div class="fw-summary">
    <div class="fw-stat"><span class="k">${t("acl.port")}</span><span class="v">${escapeHtml(ports.join(", "))}</span></div>
    <div class="fw-stat"><span class="k">${t("acl.backend")}</span><span class="v">${canEdit ? "UFW" : t("acl.unavailable")}</span></div>
    <div class="fw-stat"><span class="k">${t("acl.counts")}</span><span class="v">${blacklist.length} / ${whitelist.length}</span></div>
  </div>`;
  const addBox = (list) => `
    <div class="acl-add">
      <input class="acl-ip" placeholder="${t("acl.ipPh")}">
      <button class="btn small" data-acl-cur="${list}"${disabled}>${t("acl.curIp")}</button>
      <input class="acl-comment" placeholder="${t("acl.commentPh")}">
      <button class="btn small" data-acl-add="${list}"${disabled}>${t("acl.addBtn")}</button>
    </div>`;
  const table = (list, items) => {
    if (!items.length) return `<pre class="hint">${t("acl.empty")}</pre>`;
    const rows = items.map((x) => `<tr><td><span class="fw-from-ip">${escapeHtml(x.ip)}</span></td><td>${escapeHtml(x.comment || "—")}</td><td>${new Date(x.ts).toLocaleString()}</td><td><button class="btn small" data-acl-del="${list}" data-acl-ip="${escapeHtml(x.ip)}"${disabled}>${t("acl.del")}</button></td></tr>`).join("");
    return `<div class="card-body"><table class="svc-table"><thead><tr><th>${t("acl.ip")}</th><th>${t("acl.comment")}</th><th>${t("acl.time")}</th><th>${t("acl.op")}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  };
  return `${summary}${hint}
    <h3 class="fw-sub">${t("acl.wlTitle")}</h3>${addBox("white")}${table("white", whitelist)}
    <h3 class="fw-sub">${t("acl.blTitle")}</h3>${addBox("black")}${table("black", blacklist)}${disabledNote}`;
}
async function loadAcl() {
  try {
    const res = await fetch("api/acl/list");
    aclData = res.ok ? await res.json() : { error: t("acl.loadFail") };
  } catch { aclData = { error: t("acl.loadFail") }; }
  refreshAclCard();
}
function refreshAclCard() {
  const card = document.querySelector(".acl-card");
  if (card) {
    const h2 = card.querySelector("h2");
    card.innerHTML = h2 ? `<h2>${h2.innerHTML}</h2>${renderAcl()}` : renderAcl();
  }
}

function fmtVal(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function detail(m) {
  if (Array.isArray(m)) {
    if (!m.length) return t("mon.notConfigured");
    return m.map((x) => {
      if (typeof x !== "object" || x === null) return fmtVal(x);
      const status = x.ok === false ? icon("x") : x.ok === true ? icon("check") : "";
      const rest = Object.entries(x).filter(([k]) => !["ok"].includes(k))
        .map(([k, v]) => `${k}: ${fmtVal(v)}`).join(", ");
      return `${status} ${rest}`;
    }).join("\n");
  }
  if (!m) return "N/A";
  if (m.error) return m.error;
  return Object.entries(m).map(([k, v]) => {
    if (Array.isArray(v) && !v.length) return null;
    if (v && typeof v === "object") return null;
    return `${k}: ${fmtVal(v)}`;
  }).filter(Boolean).join("\n");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function refreshMetrics() {
  try {
    const res = await fetch("api/metrics");
    metrics = await res.json();
    renderCards();
    if (currentFilter === "network") drawNetTraffic();
  } catch {}
}

// ---------- Markdown 渲染（零依赖轻量实现） ----------
function escapeMdHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderMarkdown(md) {
  md = String(md).replace(/\r\n/g, "\n");
  let html = "";
  const lines = md.split("\n");
  let inCode = false;
  let codeLang = "";
  let codeLines = [];
  let inTable = false;
  let tableRows = [];
  let listType = null;

  const flushTable = () => {
    if (!tableRows.length) return;
    const header = tableRows[0];
    const body = tableRows.slice(1);
    const cols = header.length;
    html += "<table><thead><tr>" + header.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>";
    for (const row of body) {
      html += "<tr>" + Array.from({ length: cols }, (_, i) => `<td>${inline(row[i] || "")}</td>`).join("") + "</tr>";
    }
    html += "</tbody></table>";
    tableRows = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    // 代码块
    if (line.trim().startsWith("```")) {
      if (inCode) {
        html += `<pre><code>${escapeMdHtml(codeLines.join("\n"))}</code></pre>`;
        codeLines = []; inCode = false;
      } else {
        inCode = true; codeLang = line.trim().slice(3);
      }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }
    // 表格
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const cells = line.trim().slice(1, -1).split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // 分隔行
      tableRows.push(cells);
      inTable = true;
      continue;
    }
    if (inTable) { flushTable(); inTable = false; }
    // 空行
    if (!line.trim()) { flushList(); html += "\n"; continue; }
    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)/);
    if (h) { flushList(); html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; continue; }
    // 无序/有序列表
    const ul = line.match(/^\s*[-*]\s+(.*)/);
    const ol = line.match(/^\s*\d+\.\s+(.*)/);
    if (ul || ol) {
      const type = ul ? "ul" : "ol";
      if (listType !== type) { flushList(); html += `<${type}>`; listType = type; }
      html += `<li>${inline((ul || ol)[1])}</li>`;
      continue;
    }
    flushList();
    // 引用
    const bq = line.match(/^>\s?(.*)/);
    if (bq) { html += `<blockquote>${inline(bq[1])}</blockquote>`; continue; }
    // 分隔线
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) { html += "<hr>"; continue; }
    // 段落
    html += `<p>${inline(line)}</p>`;
  }
  if (inCode) html += `<pre><code>${escapeMdHtml(codeLines.join("\n"))}</code></pre>`;
  flushTable();
  flushList();
  return html;

  function flushList() {
    if (listType) { html += `</${listType}>`; listType = null; }
  }
}

function inline(text) {
  return escapeMdHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
}

// ---------- 图片上传 ----------
attachBtn.onclick = () => fileInput.click();

function addImage(dataUrl, name = t("fs.image"), size = 0) {
  pendingImages.push(dataUrl);
  const wrap = document.createElement("span");
  wrap.className = "thumb";
  const img = document.createElement("img");
  img.src = dataUrl;
  const nameEl = document.createElement("span");
  nameEl.className = "name";
  nameEl.textContent = name;
  const sizeEl = document.createElement("span");
  sizeEl.className = "size";
  sizeEl.textContent = size ? fmtBytes(size, 1) : "";
  const x = document.createElement("button");
  x.className = "x";
  x.textContent = "×";
  x.onclick = () => {
    const idx = pendingImages.indexOf(dataUrl);
    if (idx > -1) pendingImages.splice(idx, 1);
    wrap.remove();
  };
  wrap.append(img, nameEl, sizeEl, x);
  preview.appendChild(wrap);
}

fileInput.addEventListener("change", () => {
  for (const file of fileInput.files) {
    if (!file.type.startsWith("image/")) continue;
    const reader = new FileReader();
    reader.onload = () => addImage(reader.result, file.name, file.size);
    reader.readAsDataURL(file);
  }
  fileInput.value = "";
});

// Ctrl+V 粘贴图片
input.addEventListener("paste", (e) => {
  for (const item of e.clipboardData?.items || []) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (!file) continue;
    e.preventDefault();
    const reader = new FileReader();
    reader.onload = () => addImage(reader.result, file.name, file.size);
    reader.readAsDataURL(file);
  }
});

// ---------- 欢迎语 ----------
function renderWelcome() {
  ctx.welcome.innerHTML = `
  <h2>${t("chat.welcomeTitle")}</h2>
  <p>${t("chat.welcomeSub")}</p>
  <div class="tag-list">
    <span class="tag">${icon("monitor")} ${t("chat.tagSys")}</span><span class="tag">${icon("globe")} ${t("chat.tagNet")}</span><span class="tag">${icon("server")} ${t("chat.tagNginx")}</span><span class="tag">${icon("shield")} ${t("chat.tagFw")}</span><span class="tag">${icon("database")} ${t("chat.tagDb")}</span><span class="tag">${icon("box")} ${t("chat.tagDocker")}</span><span class="tag">${icon("sparkles")} ${t("chat.tagFix")}</span>
  </div>
  <p class="tip">${t("chat.welcomeTip")}</p>`;
}
renderWelcome();

function hideWelcome() { ctx.welcome.style.display = "none"; }

// ---------- 历史记录（服务端文件存储） ----------
async function loadHistory() {
  try {
    const res = await fetch("api/history");
    const data = await res.json();
    chatHistory = data.messages || [];
  } catch {}
}

function saveHistory() {
  const msgs = chatHistory.slice(-200);
  fetch("api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: msgs }) });
}

function restoreHistory() {
  for (const msg of chatHistory) {
    if (msg.role === "user") renderMsg(msg.text, "user", msg.images);
    else if (msg.role === "assistant") renderMsg(msg.text, "assistant");
  }
}

function renderMsg(text, cls, images) {
  hideWelcome();
  const item = document.createElement("div");
  item.className = "message-item " + (cls === "user" ? "user" : "bot");
  item.innerHTML = `
    <div class="msg-header">
      <span class="avatar ${cls === "user" ? "user" : "bot"}">${cls === "user" ? icon("user") : icon("robot")}</span>
      <span class="msg-name">${cls === "user" ? t("chat.me") : "Fixflow"}</span>
      <span class="msg-time">${now()}</span>
    </div>
    <div class="bubble ${cls === "user" ? "user" : "bot"}"></div>`;
  const imgs = (images || []).filter(Boolean).map((src) => `<img class="msg-img" src="${src}" alt="${t("fs.image")}">`).join("");
  item.querySelector(".bubble").innerHTML = cls === "user"
    ? imgs + (text ? `<div class="msg-text">${escapeHtml(text)}</div>` : "")
    : renderMarkdown(text);
  ctx.log.appendChild(item);
  scrollLog();
  return item;
}

function now() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

let typingEl = null;
let streamingEl = null;
let streamingText = "";
let streamRenderTimer = null;

function scheduleStreamRender() {
  if (streamRenderTimer) return;
  streamRenderTimer = setTimeout(() => {
    streamRenderTimer = null;
    if (streamingEl) {
      streamingEl.querySelector(".bubble").innerHTML = streamingText ? renderMarkdown(streamingText) : "";
      scrollLog();
    }
  }, 120);
}

function finishStreaming() {
  if (!streamingEl) return;
  if (streamRenderTimer) { clearTimeout(streamRenderTimer); streamRenderTimer = null; }
  const text = streamingText;
  streamingEl.querySelector(".bubble").innerHTML = text ? renderMarkdown(text) : "";
  if (text) { chatHistory.push({ role: "assistant", text }); saveHistory(); }
  streamingEl = null;
  streamingText = "";
}

function showTyping() {
  if (typingEl) return;
  typingEl = renderMsg("", "assistant");
  typingEl.querySelector(".bubble").innerHTML = `
    <div class="typing">
      ${[...t("chat.thinkingChars")].map((c) => `<span class="thinking">${c}</span>`).join("")}
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
    </div>`;
}

function hideTyping() {
  if (typingEl) { typingEl.remove(); typingEl = null; }
}

// ---------- 对话 ----------
function addMsg(text, cls, { raw = false, images } = {}) {
  hideWelcome();
  if (cls === "user" || cls === "assistant") {
    chatHistory.push({ role: cls, text, ...(images && images.length ? { images } : {}) });
    saveHistory();
  }
  if (cls === "assistant") hideTyping();
  return renderMsg(text, cls, images);
}

function setBusy(b) {
  busy = b;
  ctx.sendBtn.style.display = b ? "none" : "";
  ctx.stopBtn.style.display = b ? "" : "none";
}

function toolSummary(ev) {
  const args = ev.args || {};
  let cmd = args.command ?? args.path ?? "";
  if (ev.name === "read_file") cmd = `cat ${cmd}`;
  let out = "";
  const r = ev.result;
  if (r) {
    if (r.confirmed === false) out = "\n" + t("chat.rejected");
    else {
      if (r.stdout) out += "\n" + r.stdout.replace(/\n$/, "");
      if (r.stderr) out += "\n[stderr] " + r.stderr.replace(/\n$/, "");
      if (typeof r.exitCode === "number") out += `\n[exit ${r.exitCode}]`;
      if (r.error) out += "\n[error] " + r.error;
    }
  }
  return `${icon("wrench")} ${ev.name}${cmd ? "  " + cmd : ""}` + out;
}

const termPane = document.getElementById("term-pane");
const termSplitter = document.getElementById("term-splitter");
let termOpen = false;
let terminal = null;

let termOnOutput = null;
function termAppend(text) {
  if (terminal) terminal.write(text);
  if (termOnOutput) { const cb = termOnOutput; termOnOutput = null; cb(); }
}

function fitTerminal() {
  if (!terminal) return;
  const el = document.getElementById("term-terminal");
  const lineH = (terminal.options.fontSize || 13) * 1.4;
  const rows = Math.max(5, Math.floor((el.clientHeight - 6) / lineH));
  terminal.resize(80, rows);
}

function termSetLoading(show, text = "", error = false) {
  const el = document.getElementById("term-loading");
  const tx = document.getElementById("term-loading-text");
  if (el) { el.classList.toggle("show", show); el.classList.toggle("error", error); }
  if (tx && text) tx.textContent = text;
}

let xtermLoaded = null;
function loadXterm() {
  if (xtermLoaded) return xtermLoaded;
  xtermLoaded = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "xterm.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "xterm.min.js";
    s.onload = () => resolve();
    s.onerror = () => { xtermLoaded = null; reject(new Error("xterm load failed")); };
    document.head.appendChild(s);
  });
  return xtermLoaded;
}

async function termConnect() {
  if (terminal) { termSetLoading(false); return; }
  termSetLoading(true, t("term.connecting"));
  try { await loadXterm(); } catch { termSetLoading(true, t("term.fail"), true); setTimeout(() => termSetLoading(false), 2500); return; }
  let r = {};
  try {
    r = await fetch("api/term/open", { method: "POST" }).then((res) => res.json());
  } catch {
    termSetLoading(true, t("term.fail"), true);
    setTimeout(() => termSetLoading(false), 2500);
    return;
  }
  if (r.error) {
    termSetLoading(true, `${t("term.fail")}：${r.error}`, true);
    setTimeout(() => termSetLoading(false), 2500);
    return;
  }
  let settled = false;
  let hintTimer = null, safetyTimer = null;
  const ready = () => { if (settled) return; settled = true; clearTimeout(hintTimer); clearTimeout(safetyTimer); termOnOutput = null; termSetLoading(false); };
  hintTimer = setTimeout(() => termSetLoading(true, t("term.starting")), 5000);
  safetyTimer = setTimeout(ready, 120000);
  try {
  terminal = new Terminal({
    cols: 80,
    rows: 24,
    fontSize: 13,
    theme: { background: "#0f172a", foreground: "#e2e8f0", cursor: "#e2e8f0", selectionBackground: "#334155" },
  });
  terminal.open(document.getElementById("term-terminal"));
  terminal.onTitleChange((title) => {
    const t = String(title || "");
    const m = t.match(/(\/[^\s:]+)/);
    if (m) { ready(); if (m[1] !== fsPath) fsRevealPath(m[1]); }
  });
  termOnOutput = ready;
  let written = 0;
  const writeHistory = (hist) => {
    const h = String(hist || "");
    if (h.length > written) { terminal.write(h.slice(written)); written = h.length; }
    if (h) ready();
  };
  writeHistory(r.history);
  setTimeout(async () => {
    if (settled) return;
    try { writeHistory((await fetch("api/term/open", { method: "POST" }).then((res) => res.json())).history); } catch {}
  }, 400);
  let termCmdBuf = "";
  terminal.onData((data) => {
    fetch("api/term/input", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
    for (const ch of data) {
      if (ch === "\r" || ch === "\n") {
        const cmd = termCmdBuf.trim();
        if (cmd) fetch("api/term/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: cmd }) });
        termCmdBuf = "";
      } else if (ch === "\x7f") {
        termCmdBuf = termCmdBuf.slice(0, -1);
      } else if (ch >= " ") {
        termCmdBuf += ch;
      }
    }
  });
  terminal.focus();
  fitTerminal();
  } catch (e) {
    ready();
  }
}

async function termDisconnect() {
  if (!terminal) return;
  try { terminal.dispose(); } catch {}
  terminal = null;
  try { await fetch("api/term/close", { method: "POST" }); } catch {}
}

 function setTermOpen(open) {
   termOpen = open;
   localStorage.setItem("termOpen", open ? "1" : "0");
   termPane.classList.toggle("show", open);
   termSplitter.classList.toggle("show", open);
   if (open) { termConnect(); fsRefresh(); }
   else termDisconnect();
 }

// ---------- 文件管理器 ----------
const fsTree = document.getElementById("fs-tree");
const fsTbody = document.getElementById("fs-tbody");
const fsEditMask = document.getElementById("fs-edit-mask");
const fsEditContent = document.getElementById("fs-edit-content");
const fsNewdir = document.getElementById("fs-newdir");
const fsUploadBtn = document.getElementById("fs-upload-btn");
const fsFile = document.getElementById("fs-file");
const fsDownloadBtn = document.getElementById("fs-download");
const fsEditBtn = document.getElementById("fs-edit");
const fsRenameBtn = document.getElementById("fs-rename");
const fsDeleteBtn = document.getElementById("fs-delete");
let fsPath = "/";
let fsItems = [];
let fsSel = null;
let fsSort = { key: "name", dir: -1 };
let fsEditPath = "";
const fsTreeState = {};
const joinPath = (a, b) => (a === "/" ? "/" + b : a + "/" + b);

function fsFileType(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["txt", "log", "conf", "cfg", "ini", "json", "md", "yml", "yaml", "sh", "py", "js", "html", "css", "xml", "sql"].includes(ext)) return t("fs.text");
  if (["tgz", "gz", "zip", "tar", "rar", "7z", "bz2"].includes(ext)) return t("fs.archive");
  if (["exe", "bin", "so", "dll"].includes(ext)) return t("fs.binary");
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(ext)) return t("fs.image");
  return t("fs.file");
}
function fsFmtSize(n) {
  if (!Number.isFinite(n)) return "—";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
  if (n < 1073741824) return (n / 1048576).toFixed(1) + " MB";
  return (n / 1073741824).toFixed(1) + " GB";
}
async function fsFetch(path) {
  const res = await fetch(`api/fs/list?path=${encodeURIComponent(path)}`).catch(() => null);
  return res ? await res.json() : { error: t("fs.unreachable") };
}
async function fsEnsureTree(path) {
  if (fsTreeState[path]?.loaded) return fsTreeState[path];
  const data = await fsFetch(path);
  const dirs = (data.children || []).filter((c) => c.isDir && !c.isSymlink).map((c) => c.name).sort();
  fsTreeState[path] = { loaded: true, expanded: path === "/", dirs };
  return fsTreeState[path];
}
function fsRenderNode(path, depth, nameHint) {
  const st = fsTreeState[path];
  const name = nameHint || (path === "/" ? "/" : path.split("/").pop() || path);
  if (!st) {
    return `<div class="fs-tree-item" data-path="${escapeHtml(path)}" style="padding-left:${depth * 14 + 6}px"><span class="arrow"></span>${icon("folder")}<span>${escapeHtml(name)}</span></div>`;
  }
  const arrow = st.dirs.length ? (st.expanded ? "▼" : "▶") : "";
  let html = `<div class="fs-tree-item${path === fsPath ? " sel" : ""}" data-path="${escapeHtml(path)}" style="padding-left:${depth * 14 + 6}px"><span class="arrow">${arrow}</span>${icon("folder")}<span>${escapeHtml(name)}</span></div>`;
  if (st.expanded) for (const d of st.dirs) html += fsRenderNode(joinPath(path, d), depth + 1, d);
  return html;
}
async function fsRenderTree() {
  await fsEnsureTree("/");
  fsTree.innerHTML = fsRenderNode("/", 0);
}
async function fsRevealPath(p) {
  const raw = String(p || "").trim();
  const abs = raw.startsWith("/") ? raw : joinPath(fsPath, raw);
  const parts = abs.split("/").filter(Boolean);
  await fsEnsureTree("/");
  fsTreeState["/"].expanded = true;
  let cur = "/";
  for (const seg of parts) {
    cur = joinPath(cur, seg);
    await fsEnsureTree(cur);
    if (cur !== abs) fsTreeState[cur].expanded = true;
  }
  fsRenderTree();
  fsLoadList(abs);
}
function fsTermCd(path) {
  if (!terminal || !path) return;
  const q = "'" + String(path).replace(/'/g, `'\\''`) + "'";
  fetch("api/term/input", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: `cd ${q}\r` }) });
}
function fsRenderList() {
  const { key, dir } = fsSort;
  const sorted = [...fsItems].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    const va = a[key], vb = b[key];
    const cmp = typeof va === "number" ? va - vb : String(va ?? "").localeCompare(String(vb ?? ""));
    return cmp * dir;
  });
  fsTbody.innerHTML = sorted.map((it) => {
    const sel = fsSel && fsSel.name === it.name ? " sel" : "";
    const size = it.isDir ? "—" : fsFmtSize(it.size);
    const mtime = (it.mtime || "").replace("T", " ").slice(0, 16);
    return `<tr class="fs-row${sel}" data-name="${escapeHtml(it.name)}"><td>${it.isDir ? icon("folder") : icon("file")} ${escapeHtml(it.name)}</td><td>${size}</td><td>${it.isDir ? t("fs.dir") : it.isSymlink ? t("fs.symlink") : fsFileType(it.name)}</td><td>${mtime}</td><td>${escapeHtml(it.mode)}</td><td>${escapeHtml(it.user)}/${escapeHtml(it.group)}</td></tr>`;
  }).join("");
}
async function fsLoadList(path) {
  fsPath = path;
  fsSel = null;
  fsUpdateButtons();
  const data = await fsFetch(path);
  if (data.error) { fsTbody.innerHTML = `<tr><td colspan="6">${escapeHtml(data.error)}</td></tr>`; fsItems = []; return; }
  fsItems = data.children;
  fsRenderList();
}
function fsRefresh() { fsRenderTree(); fsLoadList(fsPath); }
function fsUpdateButtons() {
  const has = !!fsSel;
  const isFile = has && !fsSel.isDir;
  fsDownloadBtn.disabled = !isFile;
  fsEditBtn.disabled = !isFile;
  fsRenameBtn.disabled = !has;
  fsDeleteBtn.disabled = !has;
}
fsTree.addEventListener("click", async (e) => {
  const item = e.target.closest(".fs-tree-item");
  if (!item) return;
  const path = item.dataset.path;
  if (e.target.closest(".arrow")) {
    const st = fsTreeState[path];
    if (st && st.dirs.length) {
      st.expanded = !st.expanded;
      if (st.expanded) await fsEnsureTree(path);
      fsRenderTree();
    }
  } else {
    const st = await fsEnsureTree(path);
    if (!st.expanded && st.dirs.length) st.expanded = true;
    fsRenderTree();
    fsLoadList(path);
    fsTermCd(path);
  }
});
fsTbody.addEventListener("click", (e) => {
  const row = e.target.closest(".fs-row");
  if (!row) return;
  fsSel = fsItems.find((i) => i.name === row.dataset.name) || null;
  fsRenderList();
  fsUpdateButtons();
});
fsTbody.addEventListener("dblclick", (e) => {
  const row = e.target.closest(".fs-row");
  if (!row) return;
  const it = fsItems.find((i) => i.name === row.dataset.name);
  if (!it) return;
  if (it.isDir) { const np = joinPath(fsPath, it.name); fsLoadList(np); fsRenderTree(); fsTermCd(np); }
  else fsEditFile(joinPath(fsPath, it.name));
});
document.querySelectorAll("#fs-table th[data-sort]").forEach((th) => {
  th.onclick = () => {
    const key = th.dataset.sort;
    if (fsSort.key === key) fsSort.dir *= -1;
    else fsSort = { key, dir: key === "name" ? -1 : 1 };
    fsRenderList();
  };
});
function fsAskPassword(title, text, body, op) {
  procTarget = { kind: "fs", op, body };
  document.getElementById("proc-title").textContent = title;
  document.getElementById("proc-text").textContent = text;
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
}
fsNewdir.onclick = () => {
  const name = prompt(t("fs.mkdirPrompt"));
  if (!name || !name.trim()) return;
  fsAskPassword(t("fs.mkdirTitle"), t("fs.mkdirText").replace("{path}", fsPath).replace("{name}", name.trim()), { path: fsPath, name: name.trim() }, "mkdir");
};
fsRenameBtn.onclick = () => {
  if (!fsSel) return;
  const name = prompt(t("fs.renamePrompt"), fsSel.name);
  if (!name || !name.trim()) return;
  fsAskPassword(t("fs.renameTitle"), t("fs.renameText").replace("{old}", fsSel.name).replace("{new}", name.trim()), { path: joinPath(fsPath, fsSel.name), newName: name.trim() }, "rename");
};
fsDeleteBtn.onclick = () => {
  if (!fsSel) return;
  fsAskPassword(t("fs.deleteTitle"), t("fs.deleteText").replace("{name}", fsSel.name).replace("{note}", fsSel.isDir ? t("fs.dirRecursive") : ""), { path: joinPath(fsPath, fsSel.name) }, "delete");
};
fsDownloadBtn.onclick = () => {
  if (!fsSel || fsSel.isDir) return;
  const a = document.createElement("a");
  a.href = `api/fs/download?path=${encodeURIComponent(joinPath(fsPath, fsSel.name))}`;
  a.download = fsSel.name;
  a.click();
};
fsUploadBtn.onclick = () => fsFile.click();
fsFile.addEventListener("change", () => {
  const f = fsFile.files[0];
  fsFile.value = "";
  if (!f) return;
  if (f.size > 50 * 1024 * 1024) { alert(t("fs.sizeTooBig")); return; }
  fsAskPassword(t("fs.uploadTitle"), t("fs.uploadText").replace("{name}", f.name).replace("{size}", fsFmtSize(f.size)).replace("{path}", fsPath), { path: fsPath, file: f }, "upload");
});
[fsTree, document.querySelector(".fs-list-wrap")].forEach((el) => {
  el.addEventListener("dragover", (e) => e.preventDefault());
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    const f = files[0];
    if (files.length > 1) alert(t("fs.singleOnly"));
    if (f.size > 50 * 1024 * 1024) { alert(t("fs.sizeTooBig")); return; }
    const treeItem = e.target.closest(".fs-tree-item");
    const target = treeItem ? treeItem.dataset.path : fsPath;
    fsAskPassword(t("fs.uploadTitle"), t("fs.uploadText").replace("{name}", f.name).replace("{size}", fsFmtSize(f.size)).replace("{path}", target), { path: target, file: f }, "upload");
  });
});
async function fsEditFile(path) {
  const res = await fetch("api/fs/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) });
  const data = await res.json();
  fsEditPath = "";
  fsEditContent.value = "";
  document.getElementById("fs-edit-err").textContent = "";
  if (data.error) { document.getElementById("fs-edit-err").textContent = data.error; }
  else {
    fsEditPath = path;
    fsEditContent.value = data.content ?? "";
    document.getElementById("fs-edit-title").innerHTML = `${icon("pencil")} ${escapeHtml(path)}`;
  }
  fsEditMask.classList.add("show");
}
document.getElementById("fs-edit-cancel").onclick = () => fsEditMask.classList.remove("show");
document.getElementById("fs-edit-close").onclick = () => fsEditMask.classList.remove("show");
document.getElementById("fs-edit-save").onclick = () => {
  if (!fsEditPath) return;
  fsAskPassword(t("fs.writeTitle"), t("fs.writeText").replace("{path}", fsEditPath), { path: fsEditPath, content: fsEditContent.value }, "write");
};
fsEditMask.addEventListener("click", (e) => { if (e.target === fsEditMask) fsEditMask.classList.remove("show"); });
const fsSplitter = document.getElementById("term-fs-splitter");
let fsDrag = false, fsDragY = 0, fsDragH = 0;
fsSplitter.addEventListener("mousedown", (e) => {
  fsDrag = true; fsDragY = e.clientY; fsDragH = document.getElementById("term-terminal").offsetHeight; e.preventDefault();
});
document.addEventListener("mousemove", (e) => {
  if (!fsDrag) return;
  document.getElementById("term-terminal").style.height = Math.max(80, Math.min(fsDragH + (e.clientY - fsDragY), window.innerHeight * 0.8)) + "px";
});
document.addEventListener("mouseup", () => { fsDrag = false; });

document.getElementById("term-toggle").onclick = () => setTermOpen(!termOpen);
document.getElementById("term-close").onclick = () => setTermOpen(false);
document.getElementById("term-clear").onclick = () => { if (terminal) terminal.clear(); };
let fsCollapsed = true;
function applyFsCollapsed(collapsed) {
  fsCollapsed = !!collapsed;
  termPane.classList.toggle("fs-collapsed", fsCollapsed);
  const btn = document.getElementById("fs-toggle");
  if (btn) btn.classList.toggle("active", !fsCollapsed);
  if (termOpen) setTimeout(fitTerminal, 60);
}
document.getElementById("fs-toggle").onclick = () => {
  applyFsCollapsed(!fsCollapsed);
  fetch("api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fsCollapsed }) }).catch(() => {});
};
document.getElementById("fs-close").onclick = () => {
  applyFsCollapsed(true);
  fetch("api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fsCollapsed }) }).catch(() => {});
};
window.addEventListener("resize", () => { if (termOpen) fitTerminal(); });
const termLogMask = document.getElementById("term-log-mask");
let termRecs = [];
let termPage = 0;
let termSearch = "";
let termUserFilter = "";
let termRangeFilter = "all";
const TERM_PAGE_SIZE = 50;

function termIsDanger(cmd) {
  const words = String(cmd || "").trim().split(/\s+/);
  const head = (words[0] || "").toLowerCase();
  if (/^(rm|rmdir|mkfs|mkfs\.\w+|dd|reboot|shutdown|poweroff|halt|pkill|killall|shred|wipefs|mkpart|fdisk|truncate|pvremove|lvremove|vgremove)$/.test(head)) return true;
  if (head === "systemctl") return /\b(stop|disable|mask|reset-failed)\b/.test(String(cmd));
  if (head === "service") return /\b(stop|restart|reload|force-stop)\b/.test(String(cmd));
  if (head === "apt" || head === "apt-get") return /\b(remove|purge|autoremove)\b/.test(String(cmd));
  if (head === "yum" || head === "dnf") return /\b(remove|erase)\b/.test(String(cmd));
  if (head === "dpkg") return /(^|\s)(-r|--remove|-P|--purge)(\s|$)/.test(String(cmd));
  if (head === "kill") return true;
  if (head === "chmod" || head === "chown") return /-R/.test(String(cmd)) && /(777|666|nobody)/.test(String(cmd));
  return false;
}

function termFiltered() {
  const kw = termSearch.trim().toLowerCase();
  const now = Date.now();
  return (termRecs || []).filter((r) => {
    if (kw && !String(r.command || "").toLowerCase().includes(kw)) return false;
    if (termUserFilter && r.user !== termUserFilter) return false;
    const t = new Date(r.time).getTime();
    if (!Number.isFinite(t)) return termRangeFilter === "all";
    if (termRangeFilter === "today") { const d = new Date(r.time); if (d.toDateString() !== new Date().toDateString()) return false; }
    else if (termRangeFilter === "7d" && now - t > 7 * 864e5) return false;
    else if (termRangeFilter === "30d" && now - t > 30 * 864e5) return false;
    return true;
  });
}

function renderTermLog() {
  const box = document.getElementById("term-log-body");
  const filtered = termFiltered();
  const total = Math.max(1, Math.ceil(filtered.length / TERM_PAGE_SIZE));
  if (termPage >= total) termPage = total - 1;
  if (!filtered.length) {
    box.innerHTML = `<pre>${t("term.noHist")}</pre>`;
  } else {
    const page = filtered.slice(termPage * TERM_PAGE_SIZE, (termPage + 1) * TERM_PAGE_SIZE);
    box.innerHTML = `<table class="svc-table"><thead><tr><th>${t("term.time")}</th><th>${t("term.user")}</th><th>${t("term.command")}</th><th style="width:44px"></th></tr></thead><tbody>${page.map((r) => {
      const danger = termIsDanger(r.command);
      return `<tr><td>${escapeHtml(r.time)}</td><td>${escapeHtml(r.user)}</td><td><code class="${danger ? "term-cmd-danger" : ""}">${escapeHtml(r.command)}</code></td><td><button class="copy-btn" data-cmd="${escapeHtml(r.command)}" title="${t("term.copy")}"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg></button></td></tr>`;
    }).join("")}</tbody></table>`;
  }
  const pagerEl = document.getElementById("term-log-pager");
  pagerEl.innerHTML = total > 1
    ? `<button class="btn small" id="term-log-prev"${termPage === 0 ? " disabled" : ""}>${t("fw.prev")}</button><span class="fw-pageinfo">${termPage + 1} / ${total} · ${filtered.length} ${t("term.records")}</span><button class="btn small" id="term-log-next"${termPage >= total - 1 ? " disabled" : ""}>${t("fw.next")}</button>`
    : "";
  document.getElementById("term-log-prev")?.addEventListener("click", () => { termPage--; renderTermLog(); });
  document.getElementById("term-log-next")?.addEventListener("click", () => { termPage++; renderTermLog(); });
}

document.getElementById("term-log").onclick = async () => {
  termLogMask.classList.add("show");
  const box = document.getElementById("term-log-body");
  box.innerHTML = `<pre>${t("fs.loading")}</pre>`;
  try {
    const res = await fetch("api/term/history");
    const data = await res.json();
    termRecs = data.records || [];
    const users = [...new Set(termRecs.map((r) => r.user).filter(Boolean))].sort();
    const userSel = document.getElementById("term-log-user");
    userSel.innerHTML = `<option value="" data-i18n="term.userAll">${t("term.userAll")}</option>` + users.map((u) => `<option>${escapeHtml(u)}</option>`).join("");
    termPage = 0;
    termSearch = ""; termUserFilter = ""; termRangeFilter = "all";
    document.getElementById("term-log-search").value = "";
    userSel.value = "";
    document.getElementById("term-log-range").value = "all";
    renderTermLog();
  } catch (e) { box.innerHTML = `<pre>${t("fs.loadFail").replace("{e}", escapeHtml(String(e)))}</pre>`; }
};
document.getElementById("term-log-close").onclick = () => termLogMask.classList.remove("show");
termLogMask.addEventListener("click", (e) => { if (e.target === termLogMask) termLogMask.classList.remove("show"); });
document.getElementById("term-log-search").oninput = (e) => { termSearch = e.target.value; termPage = 0; renderTermLog(); };
document.getElementById("term-log-user").onchange = (e) => { termUserFilter = e.target.value; termPage = 0; renderTermLog(); };
document.getElementById("term-log-range").onchange = (e) => { termRangeFilter = e.target.value; termPage = 0; renderTermLog(); };
document.getElementById("term-log-body").addEventListener("click", async (e) => {
  const btn = e.target.closest(".copy-btn");
  if (!btn) return;
  try { await navigator.clipboard.writeText(btn.dataset.cmd || ""); showSaveMsg(t("term.copied"), "ok"); } catch { showSaveMsg(t("term.copyFail"), "warn"); }
});
document.getElementById("term-log-export").onclick = () => {
  const lines = termFiltered().map((r) => `${r.time} [${r.user}] ${r.command}`);
  if (!lines.length) { showSaveMsg(t("term.noHist"), "warn"); return; }
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "term-history.txt";
  a.click();
  URL.revokeObjectURL(a.href);
};

let termDragging = false;
termSplitter.addEventListener("mousedown", (e) => {
  e.preventDefault();
  termDragging = true;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
});
document.addEventListener("mousemove", (e) => {
  if (!termDragging) return;
  const rect = viewChat.getBoundingClientRect();
  const w = Math.max(220, Math.min(rect.width * 0.8, rect.right - e.clientX));
  termPane.style.width = w + "px";
});
document.addEventListener("mouseup", () => {
  if (!termDragging) return;
  termDragging = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
});

function connectStream() {
  const es = new EventSource("api/stream");
  es.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    if (ev.type === "term") termAppend(ev.data);
    else if (ev.type === "text") addMsg(ev.text, "assistant");
    else if (ev.type === "delta") {
      hideTyping();
      streamingText += ev.text;
      if (!streamingEl) streamingEl = renderMsg("", "assistant");
      scheduleStreamRender();
      scrollLog();
    }
    else if (ev.type === "tool") { finishStreaming(); addSimpleMsg(toolSummary(ev), "tool"); }
    else if (ev.type === "confirm") {
      const riskLabel = { low: t("risk.low"), medium: t("risk.mid"), high: t("risk.high") }[ev.riskLevel] || t("risk.mid");
      const riskCls = ev.riskLevel === "high" ? "risk-high" : ev.riskLevel === "low" ? "risk-low" : "risk-mid";
      const card = document.createElement("div");
      card.className = "msg confirm";
      card.innerHTML = `
        <div class="approval-card">
          <div class="approval-head"><b>${t("risk.approval")}</b><span class="risk-badge ${riskCls}">${t("risk.label")} ${riskLabel}${ev.riskLevel === "high" ? " " + icon("warn") : ""}</span></div>
          ${ev.reason ? `<div class="approval-row"><span class="lbl">${t("risk.reason")}</span><span>${escapeHtml(ev.reason)}</span></div>` : ""}
          ${ev.impact ? `<div class="approval-row"><span class="lbl">${t("risk.impact")}</span><span>${escapeHtml(ev.impact)}</span></div>` : ""}
          <div class="approval-row"><span class="lbl">${t("risk.command")}</span><code>${escapeHtml(ev.command || "")}</code></div>
        </div>`;
      const btnRow = document.createElement("div");
      btnRow.className = "confirm-row";
      const yes = document.createElement("button");
      yes.className = "btn btn-yes small"; yes.textContent = t("proc.confirm");
      const no = document.createElement("button");
      no.className = "btn btn-no small"; no.textContent = t("risk.reject");
      const finish = (label) => {
        card.querySelector(".confirm-row")?.remove();
        const span = document.createElement("div");
        span.textContent = label;
        card.appendChild(span);
      };
      yes.onclick = () => { finish(t("risk.confirmed")); fetch("api/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ev.id, ok: true }) }); };
      no.onclick = () => { finish(t("risk.rejected")); fetch("api/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ev.id, ok: false }) }); };
      btnRow.append(yes, no);
      card.appendChild(btnRow);
      ctx.log.appendChild(card);
      scrollLog();
    } else if (ev.type === "clearRequest") {
      openClearModal();
    } else if (ev.type === "clear") {
      clearHistory();
      addSimpleMsg(t("chat.cleared"), "system", { keepWelcome: true });
    } else if (ev.type === "done") {
      finishStreaming();
      setBusy(false);
      hideTyping();
    } else if (ev.type === "aborted") {
      finishStreaming();
      setBusy(false);
      hideTyping();
      addSimpleMsg(t("chat.aborted"), "system");
    } else if (ev.type === "error") {
      finishStreaming();
      setBusy(false);
      hideTyping();
      addSimpleMsg(ev.text, "error");
    } else if (ev.type === "memAlert") {
      showMemAlert(ev.usedMB, ev.limitMB);
    } else if (ev.type === "memOk") {
      hideMemAlert();
    }
  };
}

let memAlertEl = null;
function showMemAlert(usedMB, limitMB) {
  if (memAlertEl) return;
  memAlertEl = document.createElement("div");
  memAlertEl.className = "mem-alert";
  memAlertEl.innerHTML = `<span>${t("mem.alertText").replace("{used}", usedMB).replace("{limit}", limitMB)}</span><button class="btn small">${t("mem.close")}</button>`;
  memAlertEl.querySelector("button").onclick = () => hideMemAlert();
  document.body.appendChild(memAlertEl);
}
function hideMemAlert() {
  if (memAlertEl) { memAlertEl.remove(); memAlertEl = null; }
}

function addSimpleMsg(text, cls, { keepWelcome = false } = {}) {
  if (!keepWelcome) hideWelcome();
  const div = document.createElement("div");
  div.className = "msg " + cls;
  if (cls === "error") div.innerHTML = icon("xCircle") + "<span>" + escapeHtml(text) + "</span>";
  else div.textContent = text;
  ctx.log.appendChild(div);
  scrollLog();
}

function clearHistory() {
  chatHistory = [];
  ctx.log.innerHTML = "";
  ctx.welcome.style.display = "";
  hideTyping();
  ctx.log.appendChild(ctx.welcome);
}

async function send() {
  if (busy) {
    await fetch("api/abort", { method: "POST" });
    return;
  }
  const text = ctx.input.value.trim();
  const imgs = pendingImages;
  if (!text && !imgs.length) return;
  ctx.input.value = "";
  pendingImages = [];
  if (ctx.preview) ctx.preview.innerHTML = "";
  ctx.charCount.textContent = "";
  addMsg(text, "user", { images: imgs });
  stickToBottom = true;
  setBusy(true);
  showTyping();
  await fetch("api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: text, images: imgs }) });
}

sendBtn.onclick = send;
stopBtn.onclick = () => fetch("api/abort", { method: "POST" });
clearBtn.onclick = openClearModal;
input.addEventListener("input", () => { charCount.textContent = input.value.length ? input.value.length + "/5000" : ""; });
input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });

// ---------- 提问AI 迷你弹窗 ----------
function syncMiniFromHistory() {
  miniLog.innerHTML = "";
  miniWelcome.style.display = "";
  miniLog.appendChild(miniWelcome);
  for (const msg of chatHistory) {
    if (msg.role === "user") renderMsg(msg.text, "user", msg.images);
    else if (msg.role === "assistant") renderMsg(msg.text, "assistant");
  }
}

function openAiPopup() {
  if (aiPopup.style.display === "flex") return;
  ctx = miniCtx;
  renderWelcome();
  syncMiniFromHistory();
  aiPopup.style.display = "flex";
  miniInput.focus();
}

function closeAiPopup() {
  if (aiPopup.style.display !== "flex") return;
  aiPopup.style.display = "none";
  ctx = chatCtx;
  log.innerHTML = "";
  welcome.style.display = "";
  log.appendChild(welcome);
  renderWelcome();
  restoreHistory();
  if (streamingEl && miniLog.contains(streamingEl)) log.appendChild(streamingEl);
  if (typingEl && miniLog.contains(typingEl)) log.appendChild(typingEl);
}

aiFab.addEventListener("click", openAiPopup);
miniClose.addEventListener("click", closeAiPopup);
miniFullscreen.addEventListener("click", () => { closeAiPopup(); location.hash = "/chat"; });
miniSend.addEventListener("click", send);
miniStop.addEventListener("click", () => fetch("api/abort", { method: "POST" }));
miniInput.addEventListener("input", () => { miniCount.textContent = miniInput.value.length ? miniInput.value.length + "/5000" : ""; });
miniInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });

let aiDrag = null;
aiPopupHead.addEventListener("mousedown", (e) => {
  if (e.target.closest("button")) return;
  const r = aiPopup.getBoundingClientRect();
  aiDrag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
  e.preventDefault();
});
document.addEventListener("mousemove", (e) => {
  if (!aiDrag) return;
  const x = Math.min(Math.max(0, e.clientX - aiDrag.dx), window.innerWidth - aiPopup.offsetWidth);
  const y = Math.min(Math.max(0, e.clientY - aiDrag.dy), window.innerHeight - aiPopup.offsetHeight);
  aiPopup.style.left = x + "px";
  aiPopup.style.top = y + "px";
});
document.addEventListener("mouseup", () => { aiDrag = null; });
searchBox.addEventListener("input", () => { if (currentFilter === "systemd") renderCards(); });
const portBtn = document.getElementById("port-btn");
const pingBtn = document.getElementById("ping-btn");
portBtn.onclick = async () => {
  const port = document.getElementById("port-input").value.trim();
  if (!port) return;
  const res = await fetch(`api/metrics?port=${encodeURIComponent(port)}`);
  metrics.portScan = (await res.json()).portScan;
  renderCards();
};
pingBtn.onclick = async () => {
  const target = document.getElementById("ping-input").value.trim();
  if (!target) return;
  const res = await fetch(`api/metrics?ping=${encodeURIComponent(target)}`);
  metrics.pingResult = (await res.json()).pingResult;
  renderCards();
};
const probeBtn = document.getElementById("probe-btn");
probeBtn.onclick = async () => {
  const target = document.getElementById("probe-input").value.trim();
  if (!target) return;
  const res = await fetch(`api/metrics?probe=${encodeURIComponent(target)}`);
  metrics.probeResult = (await res.json()).probeResult;
  renderCards();
};
document.getElementById("net-ai").onclick = () => {
  const parts = [];
  const conn = metrics?.connSummary?.est || {};
  const items = metrics?.network?.listeners?.items || [];
  const nics = metrics?.nicHealth?.nics || [];
  parts.push(t("net.aiPrompt"));
  parts.push(t("net.aiListen") + items.map((i) => `${i.proto} ${i.local} (${i.process || "?"})`).join("; "));
  const tops = Object.entries(conn).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, n]) => `${p}:${n}`).join(", ");
  parts.push(t("net.aiConn") + (tops || t("net.aiNone")));
  parts.push(t("net.aiNic") + nics.map((n) => `${n.name}(${n.state})`).join(", "));
  miniInput.value = parts.join("\n");
  openAiPopup();
  send();
};
let metricsTimer = null;
let overviewTimer = null;
let dockerStatsTimer = null;
function stopPolling() {
  if (metricsTimer) clearInterval(metricsTimer);
  if (overviewTimer) clearInterval(overviewTimer);
  if (dockerStatsTimer) clearInterval(dockerStatsTimer);
}
function startPolling() {
  stopPolling();
  metricsTimer = setInterval(() => { if (!chatView && !logsView) refreshMetrics(); }, 10000);
  overviewTimer = setInterval(() => { if (currentFilter === "all" && overviewEl.style.display !== "none") refreshOverview(); }, 3000);
  dockerStatsTimer = setInterval(() => { if (currentFilter === "docker") refreshDockerStats(); }, 3000);
}
let curTheme = "dark";
function applyTheme(theme) {
  curTheme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = curTheme;
}
function toggleLang() {
  const next = curLang === "zh" ? "en" : "zh";
  applyLang(next);
  localStorage.setItem("fixflow_lang", next);
  if (authMask.style.display === "flex") setAuthMode(authMode, authRegistered);
  renderWelcome();
  loadModelStatus();
  if (authMask.style.display !== "flex") fetch("api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: next }) }).catch(() => {});
  if (currentFilter === "all" && overviewEl.style.display !== "none") refreshOverview();
  else renderCards();
}
function toggleTheme() {
  const next = curTheme === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem("fixflow_theme", next);
  if (authMask.style.display !== "flex") fetch("api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme: next }) }).catch(() => {});
  if (currentFilter === "all" && overviewEl.style.display !== "none") refreshOverview();
  else renderCards();
}
document.querySelectorAll(".lang-btn").forEach((b) => b.addEventListener("click", toggleLang));
document.querySelectorAll(".theme-btn").forEach((b) => b.addEventListener("click", toggleTheme));
applyLang(localStorage.getItem("fixflow_lang") === "en" ? "en" : "zh");
applyTheme(localStorage.getItem("fixflow_theme") === "light" ? "light" : "dark");
 function initPanel() {
   applyRoute();
   initOverview();
   refreshMetrics();
   startPolling();
   (async () => { await loadHistory(); restoreHistory(); })();
connectStream();
   loadModelStatus();
   refreshAlerts();
   if (localStorage.getItem("termOpen") === "1") setTermOpen(true);
   fetch("api/config").then((r) => r.json()).then((cfg) => { applyLang(cfg.lang || "zh"); applyTheme(cfg.theme || "dark"); applyFsCollapsed(cfg.fsCollapsed !== false); localStorage.setItem("fixflow_lang", cfg.lang || "zh"); localStorage.setItem("fixflow_theme", cfg.theme || "dark"); renderWelcome(); if (currentFilter === "all" && overviewEl.style.display !== "none") refreshOverview(); else renderCards(); }).catch(() => {});
 }
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopPolling();
  else { startPolling(); refreshMetrics(); }
});

document.getElementById("menu-toggle").onclick = () => {
  const collapsed = document.body.classList.toggle("menu-collapsed");
  localStorage.setItem("menuCollapsed", collapsed ? "1" : "0");
};

const inputResize = document.getElementById("input-resize");
let resizing = false, resizeStartY = 0, resizeStartH = 0;
if (inputResize) {
  inputResize.addEventListener("mousedown", (e) => {
    resizing = true;
    resizeStartY = e.clientY;
    resizeStartH = input.offsetHeight;
    inputResize.classList.add("active");
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!resizing) return;
    const h = resizeStartH - (e.clientY - resizeStartY);
    input.style.height = Math.max(60, Math.min(h, window.innerHeight * 0.5)) + "px";
  });
  document.addEventListener("mouseup", () => {
    if (!resizing) return;
    resizing = false;
    inputResize.classList.remove("active");
  });
}

const modelStatus = document.getElementById("model-status");
let modelCheckTimer = null;
async function loadModelStatus() {
  clearTimeout(modelCheckTimer);
  let cfg = {};
  try {
    const res = await fetch("api/config");
    cfg = await res.json();
  } catch {}
  const model = cfg.model || t("model.notSet");
  modelStatus.innerHTML = `<span class="dot"></span>${escapeHtml(model)} · ${t("model.connecting")}`;
  modelStatus.classList.remove("on");
  try {
    const res = await fetch("api/models");
    if (!res.ok) throw new Error(res.status);
    modelStatus.innerHTML = `<span class="dot"></span>${escapeHtml(model)} · ${t("model.connected")}`;
    modelStatus.classList.add("on");
  } catch {
    modelStatus.innerHTML = `<span class="dot" style="background:var(--bad)"></span>${escapeHtml(model)} · ${t("model.unavailable")}`;
    modelStatus.classList.remove("on");
    modelCheckTimer = setTimeout(loadModelStatus, 5000);
  }
}
modelStatus.addEventListener("click", openSettings);

// ---------- 登录 / 注册 ----------
const authMask = document.getElementById("auth-mask");

// 密码可见性切换（按住显示、松开隐藏；登录 + 修改密码弹窗共用）
const setEye = (eye, show) => {
  const input = eye.parentElement.querySelector("input");
  if (!input) return;
  input.type = show ? "text" : "password";
  eye.classList.toggle("showing", show);
  eye.setAttribute("aria-label", show ? t("pwd.eyeHide") : t("pwd.eyeShow"));
};
let pressedEye = null;
document.addEventListener("mousedown", (e) => {
  const eye = e.target.closest(".pwd-eye");
  if (!eye) return;
  pressedEye = eye;
  setEye(eye, true);
});
document.addEventListener("mouseup", () => {
  if (pressedEye) { setEye(pressedEye, false); pressedEye = null; }
});
document.addEventListener("mouseleave", () => {
  if (pressedEye) { setEye(pressedEye, false); pressedEye = null; }
});
const authTitle = document.getElementById("auth-title");
const authSub = document.getElementById("auth-sub");
const authErr = document.getElementById("auth-err");
const authForm = document.getElementById("auth-form");
const authUsername = document.getElementById("auth-username");
const authPassword = document.getElementById("auth-password");
const authCaptcha = document.getElementById("auth-captcha");
const authCaptchaImg = document.getElementById("auth-captcha-img");
const authSubmit = document.getElementById("auth-submit");
const authForgotLink = document.getElementById("auth-forgot-link");
const authTip = document.getElementById("auth-tip");
const forgotMask = document.getElementById("forgot-mask");
authForgotLink.onclick = () => forgotMask.classList.add("show");
document.getElementById("forgot-close").onclick = () => forgotMask.classList.remove("show");
document.getElementById("forgot-ok").onclick = () => forgotMask.classList.remove("show");

let authMode = "login";
let authRegistered = false;

function showAuthErr(msg) {
  authErr.textContent = msg;
  authErr.classList.add("show");
}

function clearAuthErr() {
  authErr.textContent = "";
  authErr.classList.remove("show");
}

function refreshCaptcha() {
  authCaptchaImg.src = `api/captcha?t=${Date.now()}`;
}

function setAuthMode(mode, registered) {
  authMode = mode;
  clearAuthErr();
  authCaptcha.value = "";
  authCaptchaImg.title = t("auth.captchaTip");
  if (mode === "login") {
    document.getElementById("auth-logo-text").textContent = "AI";
    authTitle.textContent = t("auth.loginTitle");
    authSub.textContent = t("auth.loginSub");
    authSubmit.textContent = t("auth.login");
    authPassword.placeholder = t("auth.pwdPh");
    authTip.innerHTML = `<button type="button" id="auth-toggle">${t("auth.noAccount")}</button>`;
  } else {
    document.getElementById("auth-logo-text").textContent = "AI";
    authTitle.textContent = t("auth.registerTitle");
    authSub.textContent = t("auth.registerSub");
    authSubmit.textContent = t("auth.register");
    authPassword.placeholder = t("auth.pwdRule");
    authTip.innerHTML = `<button type="button" id="auth-toggle">${t("auth.hasAccount")}</button>`;
  }
  document.getElementById("auth-toggle")?.addEventListener("click", () => setAuthMode(authMode === "login" ? "register" : "login", true));
  refreshCaptcha();
}

function setupAuth() {
  (async () => {
    const res = await fetch("api/status");
    const data = await res.json();
    document.getElementById("boot-mask").style.display = "none";
    if (data.loggedIn) { setUserName(data.username); authMask.style.display = "none"; initPanel(); return; }
    authRegistered = Boolean(data.registered);
    setAuthMode(data.registered ? "login" : "register", authRegistered);
    authMask.style.display = "flex";
    if (location.hash === "#/help") helpMask.classList.add("show");
  })();
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthErr();
    const payload = {
      username: authUsername.value.trim(),
      password: authPassword.value,
      captchaCode: authCaptcha.value.trim(),
    };
    if (authMode === "register" && !strongPwd(authPassword.value)) {
      showAuthErr(t("auth.pwdWeak"));
      return;
    }
    authSubmit.disabled = true;
    try {
      const res = await fetch("api/" + authMode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAuthErr(data.error || t("op.fail"));
        refreshCaptcha();
        return;
      }
      if (authMode === "register") {
        const loginRes = await fetch("api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!loginRes.ok) { setAuthMode("login", true); showAuthErr(t("auth.registerOk")); return; }
      }
      authMask.style.display = "none";
      try {
        await fetch("api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: localStorage.getItem("fixflow_lang") || "zh", theme: localStorage.getItem("fixflow_theme") || "dark" }) });
      } catch {}
      location.reload();
    } finally {
      authSubmit.disabled = false;
    }
  });
  authCaptchaImg.addEventListener("click", refreshCaptcha);
}

// 鼠标视差：登录背景场景随指针轻微 3D 倾斜（reduced-motion 时禁用）
const authScene = document.querySelector(".auth-scene");
if (authScene && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  let px = 0, py = 0, raf = 0;
  const applyParallax = () => {
    raf = 0;
    authScene.style.transform = `rotateX(${(-py * 3).toFixed(2)}deg) rotateY(${(px * 3).toFixed(2)}deg) translate3d(${(px * 12).toFixed(1)}px, ${(py * 12).toFixed(1)}px, 0)`;
  };
  authMask.addEventListener("mousemove", (e) => {
    px = (e.clientX / innerWidth - 0.5) * 2;
    py = (e.clientY / innerHeight - 0.5) * 2;
    if (!raf) raf = requestAnimationFrame(applyParallax);
  });
  authMask.addEventListener("mouseleave", () => { px = py = 0; if (!raf) raf = requestAnimationFrame(applyParallax); });
}

// ---------- 设置 ----------
const settingsMask = document.getElementById("settings-mask");
const cfgBaseUrl = document.getElementById("cfg-base-url");
const cfgApiKey = document.getElementById("cfg-api-key");
const cfgKeyHint = document.getElementById("cfg-key-hint");
const cfgModel = document.getElementById("cfg-model");
const cfgModelStatus = document.getElementById("cfg-model-status");
const cfgMemLimit = document.getElementById("cfg-mem-limit");

let currentKey = "";
let apiKeyTouched = false;
cfgApiKey.addEventListener("input", () => { apiKeyTouched = true; });

async function loadModels() {
  cfgModelStatus.textContent = t("settings.loadingModels");
  cfgModelStatus.className = "model-loading";
  try {
    const params = new URLSearchParams();
    const baseUrl = cfgBaseUrl.value.trim();
    if (baseUrl) params.set("baseUrl", baseUrl);
    const typedKey = cfgApiKey.value.trim();
    if (apiKeyTouched && typedKey) params.set("apiKey", typedKey);
    const res = await fetch("api/models?" + params.toString());
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.status);
    const prev = cfgModel.value;
    cfgModel.innerHTML = "";
    for (const m of data.models) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      cfgModel.appendChild(opt);
    }
    if (prev && data.models.includes(prev)) cfgModel.value = prev;
    cfgModelStatus.textContent = t("settings.modelCount").replace("{n}", data.models.length);
  } catch (e) {
    cfgModelStatus.textContent = t("settings.loadModelsFail").replace("{msg}", e.message);
    cfgModelStatus.className = "model-loading error";
  }
}
cfgBaseUrl.addEventListener("change", loadModels);
cfgApiKey.addEventListener("change", loadModels);

async function openSettings() {
  if (saveMsgEl) saveMsgEl.remove();
  saveMsgEl = null;
  const res = await fetch("api/config");
  const cfg = await res.json();
  cfgBaseUrl.value = cfg.baseUrl || "";
  cfgApiKey.value = "";
  apiKeyTouched = false;
  cfgKeyHint.textContent = cfg.apiKey ? t("settings.keySet").replace("{key}", cfg.apiKey) : t("settings.keyUnset");
  currentKey = cfg.apiKey || "";
  cfgMemLimit.value = cfg.memLimitMB || 1024;
  settingsMask.classList.add("show");
  await loadModels();
  if (cfg.model) cfgModel.value = cfg.model;
}

settingsMask.querySelector("#cfg-cancel").onclick = () => settingsMask.classList.remove("show");
settingsMask.querySelector("#cfg-close").onclick = () => settingsMask.classList.remove("show");

let saveMsgEl = null;
function showSaveMsg(text, type) {
  if (saveMsgEl) saveMsgEl.remove();
  saveMsgEl = document.createElement("div");
  saveMsgEl.className = "save-msg" + (type === "bad" ? " bad" : "");
  saveMsgEl.innerHTML = (type ? icon(type === "bad" ? "xCircle" : "check") : "") + "<span>" + escapeHtml(text) + "</span>";
  document.body.appendChild(saveMsgEl);
  const el = saveMsgEl;
  setTimeout(() => { if (saveMsgEl === el) { el.remove(); saveMsgEl = null; } }, 2500);
}

const settingsMenu = document.getElementById("settings-menu");
document.getElementById("open-settings").onclick = (e) => {
  e.stopPropagation();
  settingsMenu.classList.toggle("show");
};
const userBtn = document.getElementById("user-btn");
const userMenu = document.getElementById("user-menu");
userBtn.onclick = (e) => {
  e.stopPropagation();
  userMenu.classList.toggle("show");
};
document.addEventListener("click", () => {
  settingsMenu.classList.remove("show");
  userMenu.classList.remove("show");
});
const logoutMask = document.getElementById("logout-mask");
document.querySelectorAll(".settings-menu .settings-item, .user-menu .settings-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.stopPropagation();
    settingsMenu.classList.remove("show");
    userMenu.classList.remove("show");
    if (item.dataset.action === "config") openSettings();
    else if (item.dataset.action === "restart") restartMask.classList.add("show");
    else if (item.dataset.action === "logout") logoutMask.classList.add("show");
    else if (item.dataset.action === "password") openPwd();
  });
});
const pwdMask = document.getElementById("pwd-mask");
const strongPwd = (p) => p.length >= 8 && p.length <= 24 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9\s]/.test(p);
function openPwd() {
  for (const id of ["pwd-current", "pwd-new", "pwd-confirm"]) document.getElementById(id).value = "";
  document.getElementById("pwd-err").textContent = "";
  pwdMask.classList.add("show");
}
document.getElementById("pwd-close").onclick = () => pwdMask.classList.remove("show");
document.getElementById("pwd-cancel").onclick = () => pwdMask.classList.remove("show");
document.getElementById("pwd-save").onclick = async () => {
  const cur = document.getElementById("pwd-current").value;
  const np = document.getElementById("pwd-new").value;
  const cf = document.getElementById("pwd-confirm").value;
  const err = document.getElementById("pwd-err");
  err.textContent = "";
  if (!strongPwd(np)) { err.textContent = t("pwd.weak"); return; }
  if (np !== cf) { err.textContent = t("pwd.mismatch"); return; }
  if (np === cur) { err.textContent = t("pwd.same"); return; }
  const btn = document.getElementById("pwd-save");
  btn.disabled = true;
  try {
    const res = await fetch("api/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: cur, newPassword: np }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { err.textContent = data.error || t("pwd.fail"); return; }
    pwdMask.classList.remove("show");
    showSaveMsg(t("pwd.done"), "ok");
    setTimeout(() => location.reload(), 1200);
  } finally {
    btn.disabled = false;
  }
};
const userNameEl = document.getElementById("user-name");
function setUserName(name) {
  userNameEl.textContent = name || t("tool.account");
}

document.getElementById("logout-cancel").onclick = () => logoutMask.classList.remove("show");
document.getElementById("logout-close").onclick = () => logoutMask.classList.remove("show");
logoutMask.addEventListener("click", (e) => { if (e.target === logoutMask) logoutMask.classList.remove("show"); });
document.getElementById("logout-confirm").onclick = async () => {
  try { await fetch("api/logout", { method: "POST" }); } catch {}
  location.href = location.pathname + "?t=" + Date.now();
};

const helpMask = document.getElementById("help-mask");
document.querySelectorAll(".doc-btn").forEach((b) => b.addEventListener("click", () => { location.hash = "/help"; }));
document.getElementById("help-close").onclick = () => { location.hash = "/" + lastRoute; };

const restartMask = document.getElementById("restart-mask");
const restartConfirmBtn = document.getElementById("restart-confirm");
document.getElementById("restart-cancel").onclick = () => restartMask.classList.remove("show");
document.getElementById("restart-close").onclick = () => restartMask.classList.remove("show");
restartMask.addEventListener("click", (e) => { if (e.target === restartMask) restartMask.classList.remove("show"); });
restartConfirmBtn.onclick = () => {
  restartConfirmBtn.disabled = true;
  restartConfirmBtn.textContent = t("restart.restarting");
  fetch("api/restart", { method: "POST" })
    .then(() => {
      showSaveMsg(t("restart.triggered"), "ok");
      setTimeout(() => location.reload(), 3000);
    })
    .catch(() => {
      restartConfirmBtn.disabled = false;
      restartConfirmBtn.textContent = t("restart.confirm");
      showSaveMsg(t("restart.fail"), "bad");
    });
};

const procMask = document.getElementById("proc-mask");
function setProcPwdLabel(kind) {
  const label = procMask.querySelector("label");
  const input = document.getElementById("proc-password");
  const isFw = kind === "fw";
  label.textContent = isFw ? t("fw.rootPwdLabel") : t("proc.pwdLabel");
  input.placeholder = isFw ? t("fw.rootPwdPh") : t("proc.pwdPh");
  input.setAttribute("autocomplete", isFw ? "current-password" : "current-password");
}
let procTarget = null;
function openClearModal() {
  procTarget = { kind: "clear-history" };
  document.getElementById("proc-title").textContent = t("chat.clearTitle");
  document.getElementById("proc-text").textContent = t("chat.clearConfirm");
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("fw");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
}
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fw-close]");
  if (!btn) return;
  const row = btn.closest(".fw-risk-row");
  procTarget = { kind: "firewall", port: Number(btn.dataset.fwPort), proto: btn.dataset.fwProto, mode: row.querySelector(".fw-mode").value };
  document.getElementById("proc-title").textContent = t("fw.closeTitle");
  document.getElementById("proc-text").textContent = t("fw.closeText").replace("{port}", procTarget.port).replace("{proto}", procTarget.proto).replace("{mode}", procTarget.mode === "delete" ? t("fw.modeDelete") : t("fw.modeDeny"));
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("fw");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
});
const nginxConfMask = document.getElementById("nginx-conf-mask");
let nginxConfPath = null;
function enterNginxEdit() {
  const ta = document.getElementById("nginx-conf-content");
  ta.readOnly = false;
  ta.focus();
  document.getElementById("nginx-conf-edit").style.display = "none";
  document.getElementById("nginx-conf-save").style.display = "";
}
document.addEventListener("click", async (e) => {
  const a = e.target.closest("[data-nginx-conf]");
  if (!a) return;
  const wantEdit = a.dataset.nginxEdit === "1";
  nginxConfPath = a.dataset.nginxConf;
  const ta = document.getElementById("nginx-conf-content");
  ta.value = t("fs.loading");
  ta.readOnly = true;
  document.getElementById("nginx-conf-title").innerHTML = `${icon("fileCode")} ${escapeHtml(nginxConfPath)}`;
  document.getElementById("nginx-conf-err").textContent = "";
  document.getElementById("nginx-conf-edit").style.display = "";
  document.getElementById("nginx-conf-save").style.display = "none";
  nginxConfMask.classList.add("show");
  try {
    const res = await fetch(`api/nginx/conf?path=${encodeURIComponent(nginxConfPath)}`);
    const data = await res.json();
    ta.value = data.content ?? "";
    if (data.error) document.getElementById("nginx-conf-err").textContent = data.error;
    if (wantEdit && !data.error) enterNginxEdit();
  } catch (err) { ta.value = ""; document.getElementById("nginx-conf-err").textContent = String(err); }
});
document.getElementById("nginx-conf-edit").onclick = enterNginxEdit;
document.getElementById("nginx-conf-cancel").onclick = () => nginxConfMask.classList.remove("show");
document.getElementById("nginx-conf-close").onclick = () => nginxConfMask.classList.remove("show");
nginxConfMask.addEventListener("click", (e) => { if (e.target === nginxConfMask) nginxConfMask.classList.remove("show"); });
document.getElementById("nginx-conf-save").onclick = () => {
  procTarget = { kind: "nginx-save", path: nginxConfPath, content: document.getElementById("nginx-conf-content").value };
  document.getElementById("proc-title").textContent = t("nginx.saveTitle");
  document.getElementById("proc-text").textContent = t("nginx.saveText").replace("{path}", nginxConfPath);
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("proc");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
};
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-nginx-op]");
  if (!btn) return;
  const action = btn.dataset.nginxOp;
  procTarget = { kind: "nginx-op", action };
  const labels = { reload: t("nginx.opReload"), restart: t("nginx.opRestart"), start: t("nginx.opStart"), stop: t("nginx.opStop") };
  const icons = { reload: "refresh", restart: "refresh", start: "play", stop: "stop" };
  const label = labels[action] || action;
  document.getElementById("proc-title").innerHTML = `${icon(icons[action] || "wrench")} ${label} Nginx`;
  document.getElementById("proc-text").textContent = t("nginx.opText").replace("{label}", label);
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("proc");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
});
document.getElementById("proc-cancel").onclick = () => procMask.classList.remove("show");
document.getElementById("proc-close").onclick = () => procMask.classList.remove("show");
procMask.addEventListener("click", (e) => { if (e.target === procMask) procMask.classList.remove("show"); });
document.getElementById("proc-confirm").onclick = async () => {
  const errEl = document.getElementById("proc-err");
  const password = document.getElementById("proc-password").value.trim();
  if (!password) { errEl.textContent = t("proc.pwdRequired"); return; }
  errEl.textContent = "";
  const confirmBtn = document.getElementById("proc-confirm");
  confirmBtn.disabled = true;
  const kind = procTarget?.kind;
  const isFw = kind === "firewall";
  const isFwCtl = kind === "fw-control";
  const isFwBatch = kind === "fw-batch";
  const isNginxSave = kind === "nginx-save";
  const isNginxOp = kind === "nginx-op";
  const isFs = kind === "fs";
  const isSys = kind === "sys";
  const isDockerOp = kind === "docker-op";
  const isDockerPrune = kind === "docker-prune";
  const isDbTest = kind === "db-test";
  const isAclAdd = kind === "acl-add";
  const isAclDel = kind === "acl-del";
  const isSdOp = kind === "systemd-op";
  const isClearHistory = kind === "clear-history";
  const isAuditExport = kind === "audit-export";
  const isAuditClear = kind === "audit-clear";
  const fsOp = isFs ? procTarget.op : "";
  try {
    let res, data;
    if (isClearHistory) {
      res = await fetch("api/history/clear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      data = await res.json();
      if (res.status === 403 || res.status === 400) { errEl.textContent = data.error || t("op.fail"); return; }
      procMask.classList.remove("show");
      return;
    }
    if (isAuditExport) {
      res = await fetch("api/panel-audit/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      data = await res.json();
      if (res.status === 403 || res.status === 400) { errEl.textContent = data.error || t("op.fail"); return; }
      procMask.classList.remove("show");
      exportAudit(data.records || []);
      return;
    }
    if (isAuditClear) {
      res = await fetch("api/panel-audit/clear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      data = await res.json();
      if (res.status === 403 || res.status === 400) { errEl.textContent = data.error || t("op.fail"); return; }
      procMask.classList.remove("show");
      auditRecords = [];
      renderAudit();
      return;
    }
    if (isFwBatch) {
      let fail = null;
      for (const it of procTarget.items) {
        const r2 = await fetch("api/firewall/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ port: it.port, proto: it.proto, mode: "deny", password }),
        });
        data = await r2.json();
        if (r2.status === 403 || r2.status === 400) { fail = data.error || t("op.fail"); break; }
        if (!data.ok) { fail = data.stderr || data.error || t("op.fail"); break; }
      }
      if (fail) { errEl.textContent = fail; return; }
      procMask.classList.remove("show");
      showSaveMsg(t("fw.batchDone").replace("{n}", procTarget.items.length), "ok");
      refreshMetrics();
      return;
    }
    if (isFs && fsOp === "upload") {
      const fd = new FormData();
      fd.append("path", procTarget.body.path);
      fd.append("password", password);
      fd.append("file", procTarget.body.file, procTarget.body.file.name);
      res = await fetch("api/fs/upload", { method: "POST", body: fd });
    } else {
      const endpoint = isFw ? "api/firewall/close" : isFwCtl ? "api/firewall/control" : isNginxSave ? "api/nginx/conf" : isNginxOp ? "api/nginx/reload" : isFs ? `api/fs/${fsOp}` : isDockerOp ? "api/docker/op" : isDockerPrune ? "api/docker/prune" : isSdOp ? "api/systemd/op" : isDbTest ? "api/db/test" : isAclAdd ? "api/acl/add" : isAclDel ? "api/acl/remove" : `api/system/${procTarget.op}`;
      const payload = isFw
        ? { port: procTarget.port, proto: procTarget.proto, mode: procTarget.mode, password }
        : isFwCtl
          ? { action: procTarget.action, password }
          : isNginxSave
            ? { path: procTarget.path, content: procTarget.content, password }
            : isNginxOp
              ? { action: procTarget.action, password }
              : isFs
                ? { ...(procTarget.body || {}), password }
                : isDockerOp
                  ? { name: procTarget.name, action: procTarget.action, password }
                  : isDockerPrune
                    ? { password }
                    : isDbTest
                      ? { id: procTarget.id, password }
                      : isSdOp
                        ? { unit: procTarget.unit, action: procTarget.action, password }
                        : isAclAdd
                          ? { list: procTarget.list, ip: procTarget.ip, comment: procTarget.comment || "", password }
                          : isAclDel
                            ? { list: procTarget.list, ip: procTarget.ip, password }
                            : { ...(procTarget.body || {}), password };
      res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      data = await res.json();
      if (res.status === 403 || res.status === 400) {
        errEl.textContent = data.error || t("op.fail");
        if (isNginxSave) document.getElementById("nginx-conf-err").textContent = data.error || "";
        return;
      }
      if (!data.ok && !isDbTest) { errEl.textContent = data.stderr || data.error || t("op.fail"); return; }
    }
    if (isNginxSave) nginxConfMask.classList.remove("show");
    if (isFs && fsOp === "write") fsEditMask.classList.remove("show");
    procMask.classList.remove("show");
    if (isFwCtl) showSaveMsg(t("fw.controlDone").replace("{action}", procTarget.action === "disable" ? t("fw.disableBtn") : t("fw.enableBtn")), "ok");
    if (isSys) showSaveMsg(t("sys.opDone"), "ok");
    if (isDockerOp || isDockerPrune) showSaveMsg(isDockerOp ? t("docker.opDone") : t("docker.pruneDone"), "ok");
    if (isAclAdd || isAclDel) { showSaveMsg(isAclAdd ? t("acl.addDone") : t("acl.delDone"), "ok"); loadAcl(); }
    else if (isDbTest) { runDbTest(procTarget.id, password); }
    else { if (isSdOp) showSaveMsg(t("srv.opDone"), "ok"); refreshMetrics(); }
    if (isFs) fsRefresh();
  } catch (e2) {
    errEl.textContent = String(e2);
  } finally {
    confirmBtn.disabled = false;
  }
};

// 系统操作（更新/清理/重启/关机）密码验证弹窗
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-sys-op]");
  if (!btn || btn.disabled) return;
  const op = btn.dataset.sysOp;
  const action = btn.dataset.sysAction || "";
  procTarget = { kind: "sys", op, body: op === "power" ? { action } : {} };
  const isReboot = action === "reboot";
  const titles = { update: t("sys.updateTitle"), clean: t("sys.cleanTitle"), power: isReboot ? t("sys.rebootTitle") : t("sys.shutdownTitle") };
  const texts = { update: t("sys.updateConfirm"), clean: t("sys.cleanConfirm"), power: isReboot ? t("sys.rebootConfirm") : t("sys.shutdownConfirm") };
  document.getElementById("proc-title").textContent = titles[op];
  document.getElementById("proc-text").textContent = texts[op];
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("fw");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
});

// Docker 操作 / 详情 / 日志跳转
document.addEventListener("click", (e) => {
  const op = e.target.closest("[data-docker-op]");
  if (op && !op.disabled) {
    const name = op.dataset.dockerName;
    const action = op.dataset.dockerOp;
    procTarget = { kind: "docker-op", name, action };
    const labels = { start: t("docker.start"), stop: t("docker.stop"), restart: t("docker.restart"), rm: t("docker.rm") };
    document.getElementById("proc-title").textContent = t("docker.opTitle");
    document.getElementById("proc-text").textContent = t("docker.opText").replace("{label}", labels[action] || action).replace("{name}", name);
    document.getElementById("proc-err").textContent = "";
    const pw = document.getElementById("proc-password");
    pw.value = "";
    setProcPwdLabel("fw");
    procMask.classList.add("show");
    setTimeout(() => pw.focus(), 50);
    return;
  }
  const detail = e.target.closest("[data-docker-detail]");
  if (detail) { openDockerDetail(detail.dataset.dockerDetail); return; }
  const logBtn = e.target.closest("[data-docker-log]");
  if (logBtn) { openContainerLog(logBtn.dataset.dockerLog); return; }
  if (e.target.closest("#docker-prune")) {
    procTarget = { kind: "docker-prune" };
    document.getElementById("proc-title").textContent = t("docker.prune");
    document.getElementById("proc-text").textContent = t("docker.opText").replace("{label}", t("docker.prune")).replace("{name}", "");
    document.getElementById("proc-err").textContent = "";
    const pw = document.getElementById("proc-password");
    pw.value = "";
    setProcPwdLabel("fw");
    procMask.classList.add("show");
    setTimeout(() => pw.focus(), 50);
  }
});
const dockerInfoMask = document.getElementById("docker-info-mask");
document.getElementById("docker-info-close").onclick = () => dockerInfoMask.classList.remove("show");
dockerInfoMask.addEventListener("click", (e) => { if (e.target === dockerInfoMask) dockerInfoMask.classList.remove("show"); });
const fwOpenMask = document.getElementById("fw-open-mask");document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fw-open]");
  if (!btn) return;
  document.getElementById("fw-open-port").value = "";
  document.getElementById("fw-open-proto").value = "tcp";
  document.getElementById("fw-open-from").value = "";
  document.getElementById("fw-open-password").value = "";
  document.getElementById("fw-open-err").textContent = "";
  fwOpenMask.classList.add("show");
  setTimeout(() => document.getElementById("fw-open-port").focus(), 50);
});
document.getElementById("fw-open-cancel").onclick = () => fwOpenMask.classList.remove("show");
document.getElementById("fw-open-close").onclick = () => fwOpenMask.classList.remove("show");
fwOpenMask.addEventListener("click", (e) => { if (e.target === fwOpenMask) fwOpenMask.classList.remove("show"); });
document.getElementById("fw-open-submit").onclick = async () => {
  const errEl = document.getElementById("fw-open-err");
  const port = document.getElementById("fw-open-port").value.trim();
  const proto = document.getElementById("fw-open-proto").value;
  const from = document.getElementById("fw-open-from").value.trim();
  const password = document.getElementById("fw-open-password").value.trim();
  if (!port || !/^\d+(,\d+)*$/.test(port)) { errEl.textContent = t("fw.invalidPort"); return; }
  if (from && !/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(from)) { errEl.textContent = t("fw.invalidFrom"); return; }
  if (!password) { errEl.textContent = t("proc.pwdRequired"); return; }
  errEl.textContent = "";
  const btn = document.getElementById("fw-open-submit");
  btn.disabled = true;
  try {
    const res = await fetch("api/firewall/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port, proto, from, password }),
    });
    const data = await res.json();
    if (res.status === 403 || res.status === 400 || !data.ok) { errEl.textContent = data.error || data.stderr || t("op.fail"); return; }
    fwOpenMask.classList.remove("show");
    showSaveMsg(t("fw.opened").replace("{port}", port), "ok");
    refreshMetrics();
  } catch (e2) {
    errEl.textContent = String(e2);
  } finally {
    btn.disabled = false;
  }
};

// 黑白名单：填入当前 IP
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-acl-cur]");
  if (!btn) return;
  const input = btn.closest(".acl-add").querySelector(".acl-ip");
  if (aclData?.clientIp && input) input.value = aclData.clientIp;
});
// 黑白名单：添加 / 删除（密码弹窗确认）
document.addEventListener("click", (e) => {
  const addBtn = e.target.closest("[data-acl-add]");
  if (addBtn) {
    const box = addBtn.closest(".acl-add");
    const ip = box.querySelector(".acl-ip").value.trim();
    if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(ip)) { showSaveMsg(t("acl.invalidIp"), "bad"); return; }
    procTarget = { kind: "acl-add", list: addBtn.dataset.aclAdd, ip, comment: box.querySelector(".acl-comment").value.trim() };
    const wl = addBtn.dataset.aclAdd === "white";
    document.getElementById("proc-title").textContent = wl ? t("acl.addWlTitle") : t("acl.addBlTitle");
    document.getElementById("proc-text").textContent = t("acl.addText").replace("{ip}", ip).replace("{list}", wl ? t("acl.wlTitle") : t("acl.blTitle"));
    document.getElementById("proc-err").textContent = "";
    const pw = document.getElementById("proc-password");
    pw.value = "";
    setProcPwdLabel("fw");
    procMask.classList.add("show");
    setTimeout(() => pw.focus(), 50);
    return;
  }
  const delBtn = e.target.closest("[data-acl-del]");
  if (delBtn) {
    procTarget = { kind: "acl-del", list: delBtn.dataset.aclDel, ip: delBtn.dataset.aclIp };
    document.getElementById("proc-title").textContent = delBtn.dataset.aclDel === "white" ? t("acl.delWlTitle") : t("acl.delBlTitle");
    document.getElementById("proc-text").textContent = t("acl.delText").replace("{ip}", delBtn.dataset.aclIp);
    document.getElementById("proc-err").textContent = "";
    const pw = document.getElementById("proc-password");
    pw.value = "";
    setProcPwdLabel("fw");
    procMask.classList.add("show");
    setTimeout(() => pw.focus(), 50);
  }
});

// 审计区加载
function refreshFirewallCard() {
  const card = document.querySelector(".fw-card");
  if (!card || !lastFwMetrics) return;
  const h2 = card.querySelector("h2");
  card.innerHTML = h2 ? `<h2>${h2.innerHTML}</h2>${renderFirewall(lastFwMetrics)}` : renderFirewall(lastFwMetrics);
}
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fw-page]");
  if (!btn) return;
  const kind = btn.dataset.fwPage;
  const dir = btn.dataset.fwDir;
  const len = kind === "rules" ? (lastFwMetrics?.rules?.length || 0) : kind === "ops" ? (fwOpsCache?.length || 0) : (lastFwMetrics?.riskyPorts?.length || 0);
  const total = Math.max(1, Math.ceil(len / FW_PAGE_SIZE));
  let cur;
  if (kind === "rules") cur = fwRulesPage;
  else if (kind === "ops") cur = fwOpsPage;
  else cur = fwRiskPage;
  const next = dir === "prev" ? Math.max(0, cur - 1) : Math.min(total - 1, cur + 1);
  if (kind === "rules") fwRulesPage = next;
  else if (kind === "ops") fwOpsPage = next;
  else fwRiskPage = next;
  refreshFirewallCard();
});
async function loadFwOps() {
  try {
    const res = await fetch("api/firewall/ops");
    const data = await res.json();
    fwOpsCache = Array.isArray(data.ops) ? data.ops.slice().reverse() : [];
    refreshFirewallCard();
  } catch {}
}

// 关闭一个端口（共用弹窗提交流程）
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fw-control]");
  if (!btn) return;
  const action = btn.dataset.action;
  procTarget = { kind: "fw-control", action };
  document.getElementById("proc-title").textContent = action === "disable" ? t("fw.disableTitle") : t("fw.enableTitle");
  document.getElementById("proc-text").textContent = t("fw.controlText").replace("{action}", action === "disable" ? t("fw.disableBtn") : t("fw.enableBtn"));
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("fw");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fw-batch-close]");
  if (!btn) return;
  const picked = [...document.querySelectorAll(".fw-pick:checked")];
  if (!picked.length) { showSaveMsg(t("fw.pickNone"), "warn"); return; }
  procTarget = { kind: "fw-batch", items: picked.map((p) => ({ port: Number(p.dataset.fwPort), proto: p.dataset.fwProto })) };
  document.getElementById("proc-title").textContent = t("fw.batchTitle");
  document.getElementById("proc-text").textContent = t("fw.batchText").replace("{n}", procTarget.items.length);
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("fw");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fw-harden]");
  if (!btn) return;
  const dangerPorts = [...document.querySelectorAll(".fw-risk-row .risk-badge.risk-high")].map((el) => el.closest(".fw-risk-row")).map((row) => ({
    port: Number(row.querySelector(".fw-pick").dataset.fwPort),
    proto: row.querySelector(".fw-pick").dataset.fwProto,
  }));
  if (!dangerPorts.length) { showSaveMsg(t("fw.hardenNone"), "warn"); return; }
  procTarget = { kind: "fw-batch", items: dangerPorts };
  document.getElementById("proc-title").textContent = t("fw.hardenTitle");
  document.getElementById("proc-text").textContent = t("fw.hardenText").replace("{n}", dangerPorts.length);
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("fw");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
});

document.getElementById("cfg-save").onclick = async () => {
  const body = {
    model: cfgModel.value,
  };
  const newBaseUrl = cfgBaseUrl.value.trim();
  if (newBaseUrl) body.baseUrl = newBaseUrl;
  const newKey = cfgApiKey.value.trim();
  if (newKey) body.apiKey = newKey;
  const memLimit = Number(cfgMemLimit.value);
  if (Number.isFinite(memLimit) && memLimit > 0) body.memLimitMB = memLimit;
  const res = await fetch("api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { alert(t("op.saveFail") + "：" + (data.error || res.status)); return; }
  cfgApiKey.value = "";
  cfgKeyHint.textContent = t("settings.keySet").replace("{key}", data.apiKey);
  showSaveMsg(t("settings.saved"), "ok");
  loadModelStatus();
  setTimeout(() => settingsMask.classList.remove("show"), 2000);
};

// ---------- 告警 ----------
const alertMask = document.getElementById("alert-mask");
let alertEditId = null;
let alertListPage = 1;
let alertHistPage = 1;
let alertCache = { alerts: [], history: {}, smtp: {} };
const ALERT_PAGE_SIZE = 10;

function showLoading(text) {
  document.getElementById("loading-text").textContent = text || t("op.processing");
  document.getElementById("loading-mask").classList.add("show");
}
function hideLoading() {
  document.getElementById("loading-mask").classList.remove("show");
}

function renderPager(el, total, page, onGo) {
  const pages = Math.max(1, Math.ceil(total / ALERT_PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  el.innerHTML = total > ALERT_PAGE_SIZE
    ? `<button class="btn small" data-page="${p - 1}" ${p <= 1 ? "disabled" : ""}>${t("page.prev")}</button><span>${p} / ${pages}</span><button class="btn small" data-page="${p + 1}" ${p >= pages ? "disabled" : ""}>${t("page.next")}</button>`
    : "";
  el.querySelectorAll("button[data-page]").forEach((b) => { b.onclick = () => onGo(Number(b.dataset.page)); });
}

function renderAlertList() {
  const alerts = alertCache.alerts || [];
  const list = document.getElementById("alert-list");
  if (!alerts.length) {
    list.innerHTML = `<pre style="color:var(--muted)">${escapeHtml(t("alert.none"))}</pre>`;
    renderPager(document.getElementById("alert-list-pager"), 0, 1, () => {});
    return;
  }
  const pages = Math.max(1, Math.ceil(alerts.length / ALERT_PAGE_SIZE));
  if (alertListPage > pages) alertListPage = pages;
  const slice = alerts.slice((alertListPage - 1) * ALERT_PAGE_SIZE, alertListPage * ALERT_PAGE_SIZE);
  list.innerHTML = slice.map((a) => `<div class="alert-row">
        <span class="tag ${a.enabled ? "ok" : ""}">${a.enabled ? t("ssl.enable") : t("ssl.disable")}</span>
        <div class="alert-main">
          <span class="alert-title">${escapeHtml(a.name)}</span>
          <span class="alert-sub">${t("alert.dailyFmt").replace("{t}", escapeHtml(a.time))} · ${escapeHtml((a.recipients || []).join(", "))}</span>
        </div>
        <span class="proc-ops">
          <a href="javascript:void(0)" data-alert-run="${escapeHtml(a.id)}">${t("alert.run")}</a>
          <a href="javascript:void(0)" data-alert-toggle="${escapeHtml(a.id)}" data-enabled="${a.enabled}">${a.enabled ? t("ssl.disable") : t("ssl.enable")}</a>
          <a href="javascript:void(0)" data-alert-edit="${escapeHtml(a.id)}">${t("alert.edit")}</a>
          <a href="javascript:void(0)" data-alert-del="${escapeHtml(a.id)}" class="danger">${t("ssl.del")}</a>
        </span>
      </div>`).join("");
  renderPager(document.getElementById("alert-list-pager"), alerts.length, alertListPage, (p) => { alertListPage = p; renderAlertList(); });
}

function renderAlertHist() {
  const flat = [];
  for (const a of alertCache.alerts || []) for (const h of (alertCache.history?.[a.id] || [])) flat.push({ ...h, name: a.name });
  flat.sort((x, y) => String(y.at).localeCompare(String(x.at)));
  const hist = document.getElementById("alert-hist");
  if (!flat.length) {
    hist.innerHTML = `<pre style="color:var(--muted)">${escapeHtml(t("alert.noHist"))}</pre>`;
    renderPager(document.getElementById("alert-hist-pager"), 0, 1, () => {});
    return;
  }
  const pages = Math.max(1, Math.ceil(flat.length / ALERT_PAGE_SIZE));
  if (alertHistPage > pages) alertHistPage = pages;
  const slice = flat.slice((alertHistPage - 1) * ALERT_PAGE_SIZE, alertHistPage * ALERT_PAGE_SIZE);
  hist.innerHTML = slice.map((h) => `<div class="alert-row">
        <span class="tag ${h.ok ? "ok" : "bad"}">${h.ok ? t("alert.ok") : t("alert.fail")}</span>
        <div class="alert-main">
          <span class="alert-title">${escapeHtml(h.name)}</span>
          <span class="alert-sub">${escapeHtml(h.at)} · ${escapeHtml(h.error || h.summary)}</span>
        </div>
      </div>`).join("");
  renderPager(document.getElementById("alert-hist-pager"), flat.length, alertHistPage, (p) => { alertHistPage = p; renderAlertHist(); });
}

async function refreshAlerts() {
  try {
    const res = await fetch("api/alerts");
    alertCache = await res.json();
    updateBellDot();
    document.getElementById("alert-host").value = alertCache.smtp?.host || "";
    document.getElementById("alert-port").value = alertCache.smtp?.port || "";
    document.getElementById("alert-user").value = alertCache.smtp?.user || "";
    document.getElementById("alert-from").value = alertCache.smtp?.from || "";
    renderAlertList();
    renderAlertHist();
  } catch {}
}

function switchAlertTab(tab) {
  document.querySelectorAll("#alert-tabs .seg-tab").forEach((x) => x.classList.toggle("active", x.dataset.alertTab === tab));
  document.getElementById("alert-form").style.display = tab === "form" ? "" : "none";
  document.getElementById("alert-list-wrap").style.display = tab === "list" ? "" : "none";
  document.getElementById("alert-hist-wrap").style.display = tab === "hist" ? "" : "none";
}

function resetAlertForm() {
  alertEditId = null;
  document.getElementById("alert-form-title").textContent = t("alert.formTitle");
  ["alert-name", "alert-time", "alert-recipients", "alert-instruction"].forEach((id) => { document.getElementById(id).value = ""; });
  document.getElementById("alert-form-err").textContent = "";
}

document.getElementById("alert-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-alert-tab]");
  if (!b) return;
  if (b.dataset.alertTab === "form") resetAlertForm();
  switchAlertTab(b.dataset.alertTab);
});

document.getElementById("bell-btn").onclick = () => { resetAlertForm(); refreshAlerts(); refreshMetricAlerts(); switchAlertTab("form"); alertMask.classList.add("show"); };
document.getElementById("alert-close").onclick = () => alertMask.classList.remove("show");
alertMask.addEventListener("click", (e) => { if (e.target === alertMask) alertMask.classList.remove("show"); });

document.getElementById("alert-smtp-save").onclick = async () => {
  const body = {
    host: document.getElementById("alert-host").value.trim(),
    port: document.getElementById("alert-port").value.trim(),
    user: document.getElementById("alert-user").value.trim(),
    pass: document.getElementById("alert-pass").value,
    from: document.getElementById("alert-from").value.trim(),
  };
  await fetch("api/alerts/smtp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  document.getElementById("alert-pass").value = "";
  showSaveMsg(t("alert.smtpSaved"), "ok");
  refreshAlerts();
};

document.getElementById("alert-form-cancel").onclick = () => switchAlertTab("list");

document.getElementById("alert-form-save").onclick = async () => {
  const body = {
    name: document.getElementById("alert-name").value.trim(),
    time: document.getElementById("alert-time").value,
    instruction: document.getElementById("alert-instruction").value.trim(),
    recipients: document.getElementById("alert-recipients").value.split(/[,，\s]+/).filter(Boolean),
  };
  const errEl = document.getElementById("alert-form-err");
  if (!body.name || !body.time || !body.instruction || !body.recipients.length) { errEl.textContent = t("alert.required"); return; }
  errEl.textContent = "";
  const res = await fetch("api/alerts", { method: alertEditId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(alertEditId ? { ...body, id: alertEditId } : body) });
  if (!res.ok) { errEl.textContent = ((await res.json()).error) || t("op.saveFail"); return; }
  switchAlertTab("list");
  refreshAlerts();
};

document.getElementById("alert-list").addEventListener("click", async (e) => {
  const a = e.target.closest("[data-alert-edit],[data-alert-del],[data-alert-run],[data-alert-toggle]");
  if (!a) return;
  const id = a.dataset.alertEdit || a.dataset.alertDel || a.dataset.alertRun || a.dataset.alertToggle;
  if (a.dataset.alertDel) {
    if (!confirm(t("alert.delConfirm"))) return;
    await fetch("api/alerts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    refreshAlerts();
  } else if (a.dataset.alertToggle) {
    await fetch("api/alerts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled: a.dataset.enabled === "false" }) });
    refreshAlerts();
  } else if (a.dataset.alertRun) {
    showLoading(t("alert.running"));
    try {
      const res = await fetch("api/alerts/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      showSaveMsg(res.ok ? t("alert.done") : ((await res.json()).error || t("alert.execFail")), res.ok ? "ok" : "bad");
    } finally {
      hideLoading();
      refreshAlerts();
    }
  } else if (a.dataset.alertEdit) {
    const it = (alertCache.alerts || []).find((x) => x.id === id);
    if (!it) return;
    alertEditId = id;
    document.getElementById("alert-form-title").textContent = t("alert.editTitle");
    document.getElementById("alert-name").value = it.name;
    document.getElementById("alert-time").value = it.time;
    document.getElementById("alert-recipients").value = (it.recipients || []).join(", ");
    document.getElementById("alert-instruction").value = it.instruction;
    document.getElementById("alert-form-err").textContent = "";
    switchAlertTab("form");
  }
});

// ---------- 指标告警 ----------
let maCache = { rules: [], incidents: [] };
let maRulesPage = 1;
let maIncPage = 1;
let maEditId = null;
const MA_METRIC_NAME = { cpu: "mCpu", mem: "mMem", disk: "mDisk", net: "mNet", sessions: "mSessions" };

function updateBellDot() {
  const daily = (alertCache.alerts || []).some((a) => a.enabled);
  const inc = (maCache.incidents || []).some((i) => i.state !== "resolved");
  document.getElementById("bell-dot").classList.toggle("on", daily || inc);
}

async function refreshMetricAlerts() {
  try {
    const res = await fetch("api/metric-alerts");
    maCache = await res.json();
    document.getElementById("ma-panel-url").value = maCache.panelBaseUrl || "";
    document.getElementById("ma-webhook").value = maCache.webhook || "";
    renderMaRules();
    renderMaIncidents();
    updateBellDot();
  } catch {}
}

function renderMaRules() {
  const rules = maCache.rules || [];
  const box = document.getElementById("ma-rules");
  if (!rules.length) {
    box.innerHTML = `<pre style="color:var(--muted)">${escapeHtml(t("alert.noRules"))}</pre>`;
    renderPager(document.getElementById("ma-rules-pager"), 0, 1, () => {});
    return;
  }
  const pages = Math.max(1, Math.ceil(rules.length / ALERT_PAGE_SIZE));
  if (maRulesPage > pages) maRulesPage = pages;
  const slice = rules.slice((maRulesPage - 1) * ALERT_PAGE_SIZE, maRulesPage * ALERT_PAGE_SIZE);
  box.innerHTML = slice.map((r) => `<div class="alert-row">
        <span class="tag ${r.enabled ? "ok" : ""}">${r.enabled ? t("ssl.enable") : t("ssl.disable")}</span>
        <div class="alert-main">
          <span class="alert-title">${escapeHtml(r.name)}</span>
          <span class="alert-sub">${escapeHtml(t(MA_METRIC_NAME[r.metric] || "fs.file"))} ${escapeHtml(r.op)} ${escapeHtml(r.threshold)} · ${t("alert.durationFmt").replace("{t}", escapeHtml(r.duration)).replace("{l}", escapeHtml(r.level))} · ${escapeHtml((r.recipients || []).join(", "))}</span>
        </div>
        <span class="proc-ops">
          <a href="javascript:void(0)" data-ma-toggle="${escapeHtml(r.id)}" data-enabled="${r.enabled}">${r.enabled ? t("ssl.disable") : t("ssl.enable")}</a>
          <a href="javascript:void(0)" data-ma-edit="${escapeHtml(r.id)}">${t("alert.edit")}</a>
          <a href="javascript:void(0)" data-ma-del="${escapeHtml(r.id)}" class="danger">${t("ssl.del")}</a>
        </span>
      </div>`).join("");
  renderPager(document.getElementById("ma-rules-pager"), rules.length, maRulesPage, (p) => { maRulesPage = p; renderMaRules(); });
}

function renderMaIncidents() {
  const incs = maCache.incidents || [];
  const box = document.getElementById("ma-incidents");
  if (!incs.length) {
    box.innerHTML = `<pre style="color:var(--muted)">${escapeHtml(t("alert.noIncidents"))}</pre>`;
    renderPager(document.getElementById("ma-incidents-pager"), 0, 1, () => {});
    return;
  }
  const pages = Math.max(1, Math.ceil(incs.length / ALERT_PAGE_SIZE));
  if (maIncPage > pages) maIncPage = pages;
  const slice = incs.slice((maIncPage - 1) * ALERT_PAGE_SIZE, maIncPage * ALERT_PAGE_SIZE);
  const ruleName = (id) => (maCache.rules || []).find((x) => x.id === id)?.name || id;
  box.innerHTML = slice.map((i) => `<div class="alert-row">
        <span class="tag ${i.state === "resolved" ? "ok" : i.state === "ack" ? "" : "bad"}">${i.state === "resolved" ? t("alert.resolved") : i.state === "ack" ? t("alert.ack") : t("alert.unack")}</span>
        <div class="alert-main">
          <span class="alert-title">P${escapeHtml(i.level)} ${escapeHtml(ruleName(i.ruleId))} · ${escapeHtml(i.id)}</span>
          <span class="alert-sub">${t("alert.curFmt").replace("{v}", escapeHtml(i.lastValue)).replace("{p}", escapeHtml(i.peak)).replace("{t}", escapeHtml(new Date(i.startedAt).toLocaleString()))}</span>
        </div>
        ${i.state === "firing" ? `<span class="proc-ops"><a href="javascript:void(0)" data-ma-ack="${escapeHtml(i.id)}">${t("alert.claim")}</a></span>` : ""}
      </div>`).join("");
  renderPager(document.getElementById("ma-incidents-pager"), incs.length, maIncPage, (p) => { maIncPage = p; renderMaIncidents(); });
}

document.getElementById("alert-top-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-alert-top]");
  if (!b) return;
  document.querySelectorAll("#alert-top-tabs .seg-tab").forEach((x) => x.classList.toggle("active", x === b));
  const daily = b.dataset.alertTop === "daily";
  document.getElementById("alert-daily").style.display = daily ? "" : "none";
  document.getElementById("alert-metric").style.display = daily ? "none" : "";
  if (!daily) refreshMetricAlerts();
});

document.getElementById("ma-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ma-tab]");
  if (!b) return;
  document.querySelectorAll("#ma-tabs .seg-tab").forEach((x) => x.classList.toggle("active", x === b));
  const r = b.dataset.maTab === "rules";
  document.getElementById("ma-rules-wrap").style.display = r ? "" : "none";
  document.getElementById("ma-incidents-wrap").style.display = r ? "none" : "";
});

const MA_FIELDS = ["ma-name", "ma-threshold", "ma-duration", "ma-recipients", "ma-env", "ma-service", "ma-team", "ma-owner", "ma-runbook", "ma-dashboard", "ma-log", "ma-escalate-to", "ma-escalate-after"];
document.getElementById("ma-add").onclick = () => {
  maEditId = null;
  document.getElementById("ma-form-title").textContent = t("alert.ruleTitle");
  MA_FIELDS.forEach((id) => { document.getElementById(id).value = ""; });
  document.getElementById("ma-form-err").textContent = "";
  document.getElementById("ma-form").style.display = "";
};
document.getElementById("ma-form-cancel").onclick = () => { document.getElementById("ma-form").style.display = "none"; };

document.getElementById("ma-form-save").onclick = async () => {
  const val = (id) => document.getElementById(id).value.trim();
  const body = {
    name: val("ma-name"),
    metric: document.getElementById("ma-metric").value,
    op: document.getElementById("ma-op").value,
    threshold: Number(val("ma-threshold")),
    duration: Number(val("ma-duration")) || 5,
    level: Number(document.getElementById("ma-level").value),
    recipients: val("ma-recipients").split(/[,，\s]+/).filter(Boolean),
    env: val("ma-env"), service: val("ma-service"), team: val("ma-team"), owner: val("ma-owner"),
    runbookUrl: val("ma-runbook"), dashboardUrl: val("ma-dashboard"), logUrl: val("ma-log"),
    escalateTo: val("ma-escalate-to").split(/[,，\s]+/).filter(Boolean),
    escalateAfter: Number(val("ma-escalate-after")) || 30,
  };
  const errEl = document.getElementById("ma-form-err");
  if (!body.name || !Number.isFinite(body.threshold) || !body.recipients.length) { errEl.textContent = t("alert.ruleRequired"); return; }
  errEl.textContent = "";
  const res = await fetch("api/metric-alerts", { method: maEditId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(maEditId ? { ...body, id: maEditId } : body) });
  if (!res.ok) { errEl.textContent = ((await res.json()).error) || t("op.saveFail"); return; }
  document.getElementById("ma-form").style.display = "none";
  refreshMetricAlerts();
};

document.getElementById("ma-check").onclick = async () => {
  showLoading(t("alert.sampling"));
  try {
    await fetch("api/metric-alerts/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  } finally {
    hideLoading();
    refreshMetricAlerts();
  }
};

document.getElementById("ma-settings-save").onclick = async () => {
  await fetch("api/metric-alerts/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ panelBaseUrl: document.getElementById("ma-panel-url").value.trim(), webhook: document.getElementById("ma-webhook").value.trim() }) });
  showSaveMsg(t("op.saved"), "ok");
};

document.getElementById("ma-rules").addEventListener("click", async (e) => {
  const a = e.target.closest("[data-ma-toggle],[data-ma-del],[data-ma-edit]");
  if (!a) return;
  const id = a.dataset.maToggle || a.dataset.maDel || a.dataset.maEdit;
  if (a.dataset.maDel) {
    if (!confirm(t("alert.delRuleConfirm"))) return;
    await fetch("api/metric-alerts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    refreshMetricAlerts();
  } else if (a.dataset.maToggle) {
    await fetch("api/metric-alerts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled: a.dataset.enabled === "false" }) });
    refreshMetricAlerts();
  } else if (a.dataset.maEdit) {
    const r = (maCache.rules || []).find((x) => x.id === id);
    if (!r) return;
    maEditId = id;
    document.getElementById("ma-form-title").textContent = t("alert.editRuleTitle");
    document.getElementById("ma-name").value = r.name;
    document.getElementById("ma-metric").value = r.metric;
    document.getElementById("ma-op").value = r.op;
    document.getElementById("ma-threshold").value = r.threshold;
    document.getElementById("ma-duration").value = r.duration;
    document.getElementById("ma-level").value = r.level;
    document.getElementById("ma-recipients").value = (r.recipients || []).join(", ");
    document.getElementById("ma-env").value = r.env || "";
    document.getElementById("ma-service").value = r.service || "";
    document.getElementById("ma-team").value = r.team || "";
    document.getElementById("ma-owner").value = r.owner || "";
    document.getElementById("ma-runbook").value = r.runbookUrl || "";
    document.getElementById("ma-dashboard").value = r.dashboardUrl || "";
    document.getElementById("ma-log").value = r.logUrl || "";
    document.getElementById("ma-escalate-to").value = (r.escalateTo || []).join(", ");
    document.getElementById("ma-escalate-after").value = r.escalateAfter || 30;
    document.getElementById("ma-form-err").textContent = "";
    document.getElementById("ma-form").style.display = "";
  }
});

document.getElementById("ma-incidents").addEventListener("click", async (e) => {
  const a = e.target.closest("[data-ma-ack]");
  if (!a) return;
  await fetch("api/metric-alerts/ack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.dataset.maAck }) });
  refreshMetricAlerts();
});

setupAuth();