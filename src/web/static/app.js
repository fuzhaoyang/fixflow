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

// ---------- 全局会话失效处理：另一处登录被踢下线 ----------
let kickedShown = false;
const kickedMask = document.getElementById("kicked-mask");
const origFetch = window.fetch;
window.fetch = async (...args) => {
  const res = await origFetch(...args);
  if (res.status === 401 && !kickedShown && kickedMask && !/^api\/(login|register|captcha|status)/.test(String(args[0]))) {
    kickedShown = true;
    kickedMask.classList.add("show");
  }
  return res;
};
document.getElementById("kicked-confirm").onclick = () => {
  document.cookie = "fixflow_token=; Path=/; Max-Age=0; SameSite=Lax";
  location.reload();
};
const netTools = document.getElementById("net-tools");
const viewTitle = document.getElementById("view-title");
const viewMonitor = document.getElementById("view-monitor");
const viewChat = document.getElementById("view-chat");
const viewLogs = document.getElementById("view-logs");
const viewStore = document.getElementById("view-store");
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
    const hit = route === "chat" ? i.dataset.view === "chat" : route === "logs" ? i.dataset.view === "logs" : route === "store" ? i.dataset.view === "store" : i.dataset.view === "monitor" && i.dataset.filter === route;
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
    viewStore.style.display = "none";
    viewTitle.dataset.i18nTitle = "title.chat";
    viewTitle.textContent = t("title.chat");
    searchBox.style.display = "none";
    netTools.style.display = "none";
  } else if (route === "logs") {
    viewMonitor.style.display = "none";
    viewChat.style.display = "none";
    viewLogs.style.display = "flex";
    viewStore.style.display = "none";
    viewTitle.dataset.i18nTitle = "title.logs";
    viewTitle.textContent = t("title.logs");
    searchBox.style.display = "none";
    netTools.style.display = "none";
    loadLogSources();
    if (document.getElementById("logs-pane-audit").style.display !== "none") loadAudit();
  } else if (route === "store") {
    viewMonitor.style.display = "none";
    viewChat.style.display = "none";
    viewLogs.style.display = "none";
    viewStore.style.display = "block";
    viewTitle.dataset.i18nTitle = "title.store";
    viewTitle.textContent = t("title.store");
    searchBox.style.display = "none";
    netTools.style.display = "none";
    loadStore();
  } else {
    currentFilter = MODULES.some(([k]) => k === route) ? route : "all";
    viewMonitor.classList.toggle("single", currentFilter !== "all");
    viewMonitor.style.display = currentFilter === "all" ? "block" : "flex";
    viewChat.style.display = "none";
    viewLogs.style.display = "none";
    viewStore.style.display = "none";
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
    location.hash = v === "chat" ? "/chat" : v === "logs" ? "/logs" : v === "store" ? "/store" : "/" + item.dataset.filter;
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

// ---------- 软件商店 ----------
const storeSearch = document.getElementById("store-search");
const storeBody = document.getElementById("store-body");
let storeApps = [];
let storeFilter = "all";

async function loadStore() {
  const q = (storeSearch.value || "").trim();
  storeBody.innerHTML = `<div class="store-empty">${t("store.loading")}</div>`;
  try {
    const res = await fetch(`api/store${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    const data = await res.json();
    storeApps = data.apps || [];
  } catch { storeApps = []; }
  renderStore();
}

function renderStore() {
  let apps = storeApps;
  if (storeFilter === "installed") apps = apps.filter((a) => a.installed);
  else if (storeFilter === "missing") apps = apps.filter((a) => !a.installed);
  if (!apps.length) { storeBody.innerHTML = `<div class="store-empty">${t("store.empty")}</div>`; return; }
  storeBody.innerHTML = `<div class="store-grid">${apps.map((a) => `
    <div class="store-card">
      <div class="store-card-head">
        <span class="store-icon">${icon("box")}</span>
        <span class="store-name">${escapeHtml(a.name)}</span>
        <span class="store-state ${a.installed ? "installed" : ""}">${a.installed ? t("store.installed") : ""}</span>
      </div>
      <p class="store-desc">${escapeHtml(a.desc || "")}</p>
      <div class="store-actions">
        <button class="btn small store-install" data-pkg="${escapeHtml(a.name)}" ${a.installed ? "disabled" : ""}>${a.installed ? t("store.done") : t("store.install")}</button>
        ${a.installed ? `<button class="btn small store-uninstall" data-pkg="${escapeHtml(a.name)}">${t("store.uninstall")}</button>` : ""}
      </div>
    </div>`).join("")}</div>`;
}

function openStoreInstallModal(pkg) {
  procTarget = { kind: "store-install", pkg };
  document.getElementById("proc-title").textContent = t("store.installTitle");
  document.getElementById("proc-text").textContent = t("store.installConfirm").replace("{pkg}", pkg);
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("fw");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
}

function openStoreUninstallModal(pkg) {
  procTarget = { kind: "store-uninstall", pkg };
  document.getElementById("proc-title").textContent = t("store.uninstallTitle");
  document.getElementById("proc-text").textContent = t("store.uninstallConfirm").replace("{pkg}", pkg);
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("fw");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
}

storeSearch.addEventListener("input", () => { clearTimeout(storeTimer); storeTimer = setTimeout(loadStore, 400); });
let storeTimer = null;
document.querySelectorAll(".store-filter").forEach((f) => f.addEventListener("click", () => {
  storeFilter = f.dataset.storeFilter;
  document.querySelectorAll(".store-filter").forEach((x) => x.classList.toggle("active", x === f));
  renderStore();
}));
storeBody.addEventListener("click", (e) => {
  const install = e.target.closest(".store-install");
  if (install) { openStoreInstallModal(install.dataset.pkg); return; }
  const uninstall = e.target.closest(".store-uninstall");
  if (uninstall) openStoreUninstallModal(uninstall.dataset.pkg);
});

window.addEventListener("hashchange", applyRoute);
