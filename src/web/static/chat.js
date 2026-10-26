// ---------- 聊天 / 终端 / 提问AI 域 ----------
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
    <button class="tag" type="button">${icon("monitor")} ${t("chat.tagSys")}</button><button class="tag" type="button">${icon("globe")} ${t("chat.tagNet")}</button><button class="tag" type="button">${icon("server")} ${t("chat.tagNginx")}</button><button class="tag" type="button">${icon("shield")} ${t("chat.tagFw")}</button><button class="tag" type="button">${icon("database")} ${t("chat.tagDb")}</button><button class="tag" type="button">${icon("box")} ${t("chat.tagDocker")}</button><button class="tag" type="button">${icon("sparkles")} ${t("chat.tagFix")}</button>
  </div>
  <p class="tip">${t("chat.welcomeTip")}</p>`;
  ctx.welcome.querySelectorAll(".tag").forEach((el) => {
    el.addEventListener("click", () => {
      if (busy) return;
      ctx.input.value = el.textContent.trim();
      send();
    });
  });
}
renderWelcome();

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
    else if (msg.role === "assistant") {
      if (msg.kind === "automation" && typeof renderAutomationHistory === "function") renderAutomationHistory(msg);
      else renderMsg(msg.text, "assistant", undefined, { source: msg.source, usage: msg.usage });
    }
  }
}

let turnAssistantEl = null;
function footerHtml(meta) {
  const lines = [];
  if (meta.source === "model") {
    const total = (meta.usage?.promptTokens || 0) + (meta.usage?.completionTokens || 0);
    lines.push(t("chat.tokensUsed").replace("{n}", total > 0 ? total : "—"));
  }
  const source = meta.source === "kb" ? t("chat.sourceKb") : t("chat.sourceModel");
  lines.push(t("chat.sourceLine").replace("{s}", source));
  lines.push(t("chat.disclaimer"));
  return lines.map((s) => `<div>${escapeHtml(s)}</div>`).join("");
}
function appendFooter(item, meta) {
  if (!item || !meta) return;
  const bubble = item.querySelector(".bubble");
  if (!bubble) return;
  const old = item.querySelector(".msg-footer");
  if (old) old.remove();
  const div = document.createElement("div");
  div.className = "msg-footer";
  div.innerHTML = footerHtml(meta);
  bubble.appendChild(div);
}
function attachTurnFooter(meta) {
  if (!meta) return;
  const item = turnAssistantEl;
  if (!item || !item.isConnected) return;
  const bubble = item.querySelector(".bubble");
  if (!bubble || !bubble.textContent.trim()) return;
  appendFooter(item, meta);
  const last = [...chatHistory].reverse().find((m) => m.role === "assistant");
  if (last) {
    last.source = meta.source || last.source;
    if (meta.usage) last.usage = meta.usage;
    saveHistory();
  }
}

function renderMsg(text, cls, images, meta) {
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
  if (cls !== "user") {
    turnAssistantEl = item;
    if (meta) appendFooter(item, meta);
  }
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
  turnAssistantEl = null;
}

function hideTyping() {
  if (typingEl) {
    if (turnAssistantEl === typingEl) turnAssistantEl = null;
    typingEl.remove();
    typingEl = null;
  }
}

// ---------- 对话 ----------
function addMsg(text, cls, { raw = false, images, source, usage } = {}) {
  if (cls === "user" || cls === "assistant") {
    chatHistory.push({
      role: cls, text,
      ...(images && images.length ? { images } : {}),
      ...(cls === "assistant" && source ? { source } : {}),
      ...(cls === "assistant" && usage ? { usage } : {}),
    });
    saveHistory();
  }
  if (cls === "assistant") hideTyping();
  const meta = cls === "assistant" && (source || usage) ? { source, usage } : undefined;
  return renderMsg(text, cls, images, meta);
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
   if (typeof loadAutomations === "function") loadAutomations();
connectStream();
   loadModelStatus();
   if (typeof kbLoad === "function") kbLoad();
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
modelStatus.addEventListener("click", () => openSettings());

function addSimpleMsg(text, cls) {
  const div = document.createElement("div");
  div.className = "msg " + cls;
  if (cls === "error") div.innerHTML = icon("xCircle") + "<span>" + escapeHtml(text) + "</span>";
  else div.textContent = text;
  ctx.log.appendChild(div);
  scrollLog();
}

function clearHistory() {
  if (typeof resetAutoModeDraft === "function") resetAutoModeDraft();
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
  if (typeof isAutoMode === "function" && isAutoMode()) { await sendAutoModeMessage(); return; }
  const text = ctx.input.value.trim();
  const imgs = pendingImages;
  if (!text && !imgs.length) return;
  ctx.input.value = "";
  pendingImages = [];
  if (ctx.preview) ctx.preview.innerHTML = "";
  ctx.charCount.textContent = "";
  turnAssistantEl = null;
  addMsg(text, "user", { images: imgs });
  stickToBottom = true;
  setBusy(true);
  showTyping();
  await fetch("api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: text, images: imgs }) });
}

sendBtn.onclick = send;
stopBtn.onclick = () => fetch("api/abort", { method: "POST" });
clearBtn.onclick = () => openClearModal();
input.addEventListener("input", () => { charCount.textContent = input.value.length ? input.value.length + "/5000" : ""; });
input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
