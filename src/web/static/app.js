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
const conn = document.getElementById("conn");
const searchBox = document.getElementById("search");
const netTools = document.getElementById("net-tools");
const viewTitle = document.getElementById("view-title");
const viewMonitor = document.getElementById("view-monitor");
const viewChat = document.getElementById("view-chat");

let pendingImages = [];
let chatHistory = [];

const MODULES = [
  ["system", "系统"],
  ["network", "网络"],
  ["nginx", "Nginx"],
  ["firewall", "防火墙"],
  ["services", "Python 服务"],
  ["databases", "数据库"],
  ["docker", "Docker"],
  ["processes", "进程"],
  ["ssl", "SSL 证书"],
  ["systemd", "服务"],
];

let currentFilter = "all";
let metrics = {};
let busy = false;

// ---------- 路由（hash：#/system、#/network、#/chat） ----------
function applyRoute() {
  const route = (location.hash.replace(/^#\/?/, "") || "all").trim();
  document.querySelectorAll(".menu-item").forEach((i) => {
    const hit = route === "chat" ? i.dataset.view === "chat" : i.dataset.view === "monitor" && i.dataset.filter === route;
    i.classList.toggle("active", hit);
  });
  if (route === "chat") {
    viewMonitor.style.display = "none";
    viewChat.style.display = "flex";
    viewTitle.textContent = "Agent 对话";
  } else {
    currentFilter = MODULES.some(([k]) => k === route) ? route : "all";
    viewChat.style.display = "none";
    viewMonitor.style.display = "block";
    viewTitle.textContent = currentFilter === "all" ? "监控总览" : (MODULES.find(([k]) => k === currentFilter)?.[1] || "监控");
    searchBox.style.display = currentFilter === "systemd" ? "" : "none";
    netTools.style.display = currentFilter === "network" ? "flex" : "none";
    renderCards();
  }
}
document.querySelectorAll(".menu-item").forEach((item) => {
  item.addEventListener("click", () => {
    location.hash = item.dataset.view === "chat" ? "/chat" : "/" + item.dataset.filter;
  });
});
window.addEventListener("hashchange", applyRoute);
applyRoute();

// ---------- 监控 ----------
function renderCards() {
  cards.innerHTML = "";
  const items = currentFilter === "all" ? MODULES : MODULES.filter(([k]) => k === currentFilter);
  for (const [key, label] of items) {
    const m = metrics[key];
    const card = document.createElement("div");
    card.className = "card";
    if (key === "systemd") {
      card.innerHTML = `<h2>${label}</h2>${renderSystemd(m)}`;
    } else if (key === "system") {
      const health = m?.health?.items;
      let healthHtml = "";
      if (health?.length) {
        const rows = health.map((h) => {
          const icon = h.status === "ok" ? "✅" : h.status === "warn" ? "⚠️" : "❌";
          const cls = h.status === "ok" ? "ok" : h.status === "warn" ? "na" : "bad";
          return `<tr><td>${escapeHtml(h.name)}</td><td class="${cls}">${icon} ${h.status === "ok" ? "正常" : h.status === "warn" ? "警告" : "异常"}</td><td>${escapeHtml(h.detail)}</td>${h.advice ? `<td>${escapeHtml(h.advice)}</td>` : "<td>—</td>"}</tr>`;
        }).join("");
        healthHtml = `<div style="margin-bottom:8px"><table class="svc-table"><thead><tr><th>项目</th><th>状态</th><th>数值</th><th>建议</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      }
      card.innerHTML = `<h2>${label} <button class="btn small" id="report-btn" style="margin-left:8px">📄 生成报告</button></h2>${healthHtml}<pre>${escapeHtml(detail(m))}</pre><div id="report-box" style="display:none"><div style="margin-bottom:8px"><button class="btn small" id="report-copy">复制</button> <button class="btn small" id="report-dl">下载 .md</button></div><pre id="report-out"></pre></div>`;
    } else if (key === "network") {
      const scan = metrics.portScan;
      const ping = metrics.pingResult;
      const items = m?.listeners?.items;
      let netHtml = "";
      if (items?.length) {
        const rows = items.map((i) => `<tr><td>${escapeHtml(i.proto)}</td><td>${escapeHtml(i.state)}</td><td>${escapeHtml(i.local)}</td><td>${escapeHtml(i.process || "—")}</td><td>${i.pid ? `<a href="javascript:void(0)" onclick="return false" title="${i.pid}">${i.pid}</a>` : "—"}</td></tr>`).join("");
        netHtml = `<div class="card-body"><table class="svc-table"><thead><tr><th>协议</th><th>状态</th><th>本地地址</th><th>进程</th><th>PID</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      } else {
        netHtml = `<pre>${escapeHtml(detail(m))}</pre>`;
      }
      let scanHtml = "";
      if (scan?.results?.length) {
        scanHtml = `<pre>【端口占用】${scan.results.map((p) => `${p.port} (${p.service}): ${p.ok ? "监听中" : "未监听"}\n${p.detail}`).join("\n----\n")}</pre>`;
      }
      card.innerHTML = `<h2>${label}</h2>${netHtml}${scanHtml}${ping ? `<pre>【连通性】${escapeHtml(JSON.stringify(ping.results || ping, null, 2))}</pre>` : ""}`;
    } else if (key === "processes") {
      card.innerHTML = `<h2>${label}</h2>${renderProcesses(m)}`;
    } else if (key === "ssl") {
      card.innerHTML = `<h2>${label}</h2>${renderSsl(m)}`;
    } else if (key === "firewall" && m?.riskyPorts?.length) {
      const risk = `<div style="color:var(--bad);margin-bottom:6px;font-size:12px">⚠️ 对全网开放端口：${m.riskyPorts.map((p) => `${p.proto}/${p.port}`).join("、")}</div>`;
      card.innerHTML = `<h2>${label}</h2>${risk}<pre>${escapeHtml(detail(m))}</pre>`;
    } else {
      card.innerHTML = `<h2>${label}</h2><pre>${escapeHtml(detail(m))}</pre>`;
    }
    cards.appendChild(card);
    const reportBtn = card.querySelector("#report-btn");
    if (reportBtn) {
      reportBtn.onclick = async () => {
        const box = document.getElementById("report-box");
        const out = document.getElementById("report-out");
        const res = await fetch("/api/report");
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
    const sortCpu = card.querySelector("#sort-cpu");
    const sortMem = card.querySelector("#sort-mem");
    if (sortCpu) sortCpu.onclick = () => { procSort = "cpu"; renderCards(); };
    if (sortMem) sortMem.onclick = () => { procSort = "mem"; renderCards(); };
    const dot = document.querySelector(`.menu-item[data-filter="${key}"] .dot`);
    if (dot) {
      const ok = Array.isArray(m) ? m.every((x) => x.ok) : m?.ok;
      dot.className = "dot " + (ok === true ? "ok" : ok === false ? "bad" : "na");
    }
  }
}

function renderSystemd(m) {
  if (!m?.services) return `<pre>${escapeHtml(m?.error || "N/A")}</pre>`;
  const q = searchBox.value.trim().toLowerCase();
  const list = q ? m.services.filter((s) => s.name.toLowerCase().includes(q)) : m.services;
  if (!list.length) return `<pre>${escapeHtml(q ? `未找到匹配「${q}」的服务` : "（无服务）")}</pre>`;
  const rows = list.map((s) => {
    const cls = s.state === "active" ? "ok" : s.state === "failed" ? "bad" : "na";
    return `<tr><td>${escapeHtml(s.name)}</td><td class="${cls}">${escapeHtml(s.sub || s.state)}</td><td>${escapeHtml(s.memory)}</td><td>${escapeHtml(s.cpu)}</td><td>${escapeHtml(s.started)}</td></tr>`;
  }).join("");
  return `<div class="card-body"><table class="svc-table"><thead><tr><th>服务</th><th>状态</th><th>内存</th><th>CPU</th><th>启动时间</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

let procSort = "cpu";

function renderProcesses(m) {
  if (!m?.top) return `<pre>${escapeHtml(m?.error || "N/A")}</pre>`;
  const anomalies = (m.anomalies || []).map((a) => `<div style="color:var(--bad);font-size:12px">⚠️ ${escapeHtml(a)}</div>`).join("");
  const zombie = m.zombies > 0
    ? `<div style="color:var(--bad);margin-bottom:6px;font-size:12px">⚠️ 僵尸进程 ${m.zombies} 个：${escapeHtml(m.zombieDetail || "")}</div>`
    : "";
  const sortBtns = `<div style="margin-bottom:6px;display:flex;gap:6px">
    <button class="btn small ${procSort === "cpu" ? "report-active" : ""}" id="sort-cpu">按 CPU</button>
    <button class="btn small ${procSort === "mem" ? "report-active" : ""}" id="sort-mem">按内存</button></div>`;
  const list = [...m.top].sort((a, b) => procSort === "mem" ? b.memKb - a.memKb : b.cpu - a.cpu);
  const rows = list.map((p) => {
    const bad = p.cpu > 100;
    const style = bad ? " style='background:rgba(248,113,113,0.15);color:var(--bad)'" : "";
    return `<tr${style}><td>${p.pid}</td><td>${escapeHtml(p.user || "")}</td><td>${p.cpu}%</td><td>${p.mem}%</td><td>${p.memKb ? Math.round(p.memKb / 1024) + "MB" : "—"}</td><td>${escapeHtml(p.service || "—")}</td><td>${escapeHtml(p.cmd || "")}</td></tr>`;
  }).join("");
  return `${anomalies}${zombie}${sortBtns}<div class="card-body"><table class="svc-table"><thead><tr><th>PID</th><th>用户</th><th>CPU%</th><th>内存%</th><th>内存</th><th>systemd 服务</th><th>命令</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderSsl(m) {
  if (!m?.results) return `<pre>${escapeHtml(m?.error || "N/A")}</pre>`;
  if (!m.results.length) return `<pre>（未配置监控域名，可在设置中配置）</pre>`;
  const rows = m.results.map((s) => {
    const cls = s.daysLeft > 30 ? "ok" : s.daysLeft > 0 ? "na" : "bad";
    const expire = typeof s.daysLeft === "number" ? (s.daysLeft > 0 ? `${s.daysLeft} 天` : "已过期") : "—";
    return `<tr><td>${escapeHtml(s.host)}:${escapeHtml(s.port)}</td><td>${escapeHtml(s.notAfter || "—")}</td><td class="${cls}">${expire}</td><td>${escapeHtml(s.error || "")}</td></tr>`;
  }).join("");
  return `<table class="svc-table"><thead><tr><th>域名</th><th>到期时间</th><th>剩余</th><th>备注</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function fmtVal(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function detail(m) {
  if (Array.isArray(m)) {
    if (!m.length) return "（未配置）";
    return m.map((x) => {
      if (typeof x !== "object" || x === null) return fmtVal(x);
      const status = x.ok === false ? "❌" : x.ok === true ? "✅" : "";
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
    const res = await fetch("/api/metrics");
    metrics = await res.json();
    renderCards();
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

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function addImage(dataUrl, name = "图片", size = 0) {
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
  sizeEl.textContent = size ? fmtSize(size) : "";
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
welcome.innerHTML = `
  <h2>👋 你好，我是 Fixflow 运维管家</h2>
  <p>我虽然不会修空调，但服务器那点破事，交给我就行。</p>
  <div class="tag-list">
    <span class="tag">🖥 系统监控</span><span class="tag">🌐 网络检查</span><span class="tag">🪶 Nginx 体检</span><span class="tag">🧯 防火墙巡检</span><span class="tag">🐍 Python 服务探活</span><span class="tag">🗄 数据库连接诊断</span><span class="tag">🐳 Docker 状态</span><span class="tag">🛠 自动修复（先问过你）</span>
  </div>
  <p class="tip">输入指令即可开干，比如「看看磁盘还够不够用」。放心，我不会在没得到你点头前动任何文件——毕竟我是运维，不是拆家工。</p>`;

function hideWelcome() { welcome.style.display = "none"; }

// ---------- 历史记录（服务端文件存储） ----------
async function loadHistory() {
  try {
    const res = await fetch("/api/history");
    const data = await res.json();
    chatHistory = data.messages || [];
  } catch {}
}

function saveHistory() {
  const msgs = chatHistory.slice(-200);
  fetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: msgs }) });
}

function restoreHistory() {
  for (const msg of chatHistory) {
    if (msg.role === "user") renderMsg(msg.text, "user");
    else if (msg.role === "assistant") renderMsg(msg.text, "assistant");
  }
}

function renderMsg(text, cls) {
  hideWelcome();
  const item = document.createElement("div");
  item.className = "message-item " + (cls === "user" ? "user" : "bot");
  item.innerHTML = `
    <div class="msg-header">
      <span class="avatar ${cls === "user" ? "user" : "bot"}">${cls === "user" ? "🧑‍💻" : "🤖"}</span>
      <span class="msg-name">${cls === "user" ? "我" : "Fixflow"}</span>
      <span class="msg-time">${now()}</span>
    </div>
    <div class="bubble ${cls === "user" ? "user" : "bot"}"></div>`;
  item.querySelector(".bubble").innerHTML = cls === "user" ? escapeHtml(text) : renderMarkdown(text);
  log.appendChild(item);
  log.scrollTop = log.scrollHeight;
  return item;
}

function now() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let typingEl = null;

function showTyping() {
  if (typingEl) return;
  typingEl = renderMsg("", "assistant");
  typingEl.querySelector(".bubble").innerHTML = `
    <div class="typing">
      <span class="thinking">思</span><span class="thinking">考</span><span class="thinking">中</span>
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
    </div>`;
}

function hideTyping() {
  if (typingEl) { typingEl.remove(); typingEl = null; }
}

// ---------- 对话 ----------
function addMsg(text, cls, { raw = false } = {}) {
  hideWelcome();
  if (cls === "user" || cls === "assistant") {
    chatHistory.push({ role: cls, text });
    saveHistory();
  }
  if (cls === "assistant") hideTyping();
  return renderMsg(text, cls);
}

function setBusy(b) {
  busy = b;
  sendBtn.style.display = b ? "none" : "";
  stopBtn.style.display = b ? "" : "none";
}

function toolSummary(ev) {
  const args = ev.args || {};
  let cmd = args.command ?? args.path ?? "";
  if (ev.name === "read_file") cmd = `cat ${cmd}`;
  let out = "";
  const r = ev.result;
  if (r) {
    if (r.confirmed === false) out = "\n（用户已拒绝）";
    else {
      if (r.stdout) out += "\n" + r.stdout.replace(/\n$/, "");
      if (r.stderr) out += "\n[stderr] " + r.stderr.replace(/\n$/, "");
      if (typeof r.exitCode === "number") out += `\n[exit ${r.exitCode}]`;
      if (r.error) out += "\n[error] " + r.error;
    }
  }
  return `🔧 ${ev.name}${cmd ? "  " + cmd : ""}` + out;
}

function connectStream() {
  const es = new EventSource("/api/stream");
  const dot = document.getElementById("conn-dot");
  es.onopen = () => { conn.textContent = "已连接"; dot.className = "conn-dot ok"; };
  es.onerror = () => { conn.textContent = "连接断开，重连中…"; dot.className = "conn-dot bad"; };
  es.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    if (ev.type === "text") addMsg(ev.text, "assistant");
    else if (ev.type === "tool") addSimpleMsg(toolSummary(ev), "tool");
    else if (ev.type === "confirm") {
      addSimpleMsg(`⚠️ 需确认执行：${ev.command}`, "confirm");
      const row = document.createElement("div");
      row.className = "msg confirm";
      const yes = document.createElement("button");
      yes.className = "btn btn-yes small"; yes.textContent = "确认执行";
      const no = document.createElement("button");
      no.className = "btn btn-no small"; no.textContent = "拒绝";
      const finish = (label) => {
        row.innerHTML = "";
        const span = document.createElement("span");
        span.textContent = label;
        row.appendChild(span);
      };
      yes.onclick = () => { finish("✅ 已确认执行，正在运行…"); fetch("/api/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ev.id, ok: true }) }); };
      no.onclick = () => { finish("❌ 已拒绝执行"); fetch("/api/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ev.id, ok: false }) }); };
      row.append(yes, no);
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
    } else if (ev.type === "clear") {
      clearHistory();
      addSimpleMsg("🧹 聊天历史已清空", "system", { keepWelcome: true });
    } else if (ev.type === "done") {
      setBusy(false);
      hideTyping();
    } else if (ev.type === "aborted") {
      setBusy(false);
      hideTyping();
      addSimpleMsg("⚠️ 执行已中止", "system");
    } else if (ev.type === "error") {
      setBusy(false);
      hideTyping();
      addSimpleMsg(`❌ ${ev.text}`, "error");
    }
  };
}

function addSimpleMsg(text, cls, { keepWelcome = false } = {}) {
  if (!keepWelcome) hideWelcome();
  const div = document.createElement("div");
  div.className = "msg " + cls;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function clearHistory() {
  chatHistory = [];
  fetch("/api/history/clear", { method: "POST" });
  log.innerHTML = "";
  welcome.style.display = "";
  hideTyping();
  log.appendChild(welcome);
}

async function send() {
  if (busy) {
    await fetch("/api/abort", { method: "POST" });
    return;
  }
  const text = input.value.trim();
  const images = pendingImages;
  if (!text && !images.length) return;
  input.value = "";
  pendingImages = [];
  preview.innerHTML = "";
  charCount.textContent = "";
  addMsg(text, "user");
  setBusy(true);
  showTyping();
  await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: text, images }) });
}

sendBtn.onclick = send;
stopBtn.onclick = () => fetch("/api/abort", { method: "POST" });
clearBtn.onclick = () => { clearHistory(); addSimpleMsg("🧹 聊天历史已清空", "system", { keepWelcome: true }); };
input.addEventListener("input", () => { charCount.textContent = input.value.length ? input.value.length + "/5000" : ""; });
input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
searchBox.addEventListener("input", () => { if (currentFilter === "systemd") renderCards(); });
const portBtn = document.getElementById("port-btn");
const pingBtn = document.getElementById("ping-btn");
portBtn.onclick = async () => {
  const port = document.getElementById("port-input").value.trim();
  if (!port) return;
  const res = await fetch(`/api/metrics?port=${encodeURIComponent(port)}`);
  metrics.portScan = (await res.json()).portScan;
  renderCards();
};
pingBtn.onclick = async () => {
  const target = document.getElementById("ping-input").value.trim();
  if (!target) return;
  const res = await fetch(`/api/metrics?ping=${encodeURIComponent(target)}`);
  metrics.pingResult = (await res.json()).pingResult;
  renderCards();
};
refreshMetrics();
setInterval(refreshMetrics, 5000);
(async () => { await loadHistory(); restoreHistory(); })();
connectStream();

// ---------- 设置 ----------
const settingsMask = document.getElementById("settings-mask");
const cfgBaseUrl = document.getElementById("cfg-base-url");
const cfgApiKey = document.getElementById("cfg-api-key");
const cfgKeyHint = document.getElementById("cfg-key-hint");
const cfgModel = document.getElementById("cfg-model");
const cfgModelStatus = document.getElementById("cfg-model-status");
const cfgSslSites = document.getElementById("cfg-ssl-sites");
const cfgPingTargets = document.getElementById("cfg-ping-targets");

let currentKey = "";

async function loadModels() {
  cfgModelStatus.textContent = "拉取模型中…";
  cfgModelStatus.className = "model-loading";
  try {
    const res = await fetch("/api/models");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || res.status);
    cfgModel.innerHTML = "";
    for (const m of data.models) {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      cfgModel.appendChild(opt);
    }
    cfgModelStatus.textContent = `共 ${data.models.length} 个模型`;
  } catch (e) {
    cfgModelStatus.textContent = "拉取失败：" + e.message + "（请检查 API 地址和 Key）";
    cfgModelStatus.className = "model-loading error";
  }
}

async function openSettings() {
  if (saveMsgEl) saveMsgEl.remove();
  saveMsgEl = null;
  const res = await fetch("/api/config");
  const cfg = await res.json();
  cfgBaseUrl.value = cfg.baseUrl || "";
  cfgKeyHint.textContent = cfg.apiKey ? `已配置：${cfg.apiKey}` : "未配置";
  currentKey = cfg.apiKey || "";
  cfgSslSites.value = (cfg.sslSites || []).join("\n");
  cfgPingTargets.value = (cfg.pingTargets || []).join("\n");
  settingsMask.classList.add("show");
  await loadModels();
  if (cfg.model) cfgModel.value = cfg.model;
}

settingsMask.querySelector("#cfg-cancel").onclick = () => settingsMask.classList.remove("show");
settingsMask.addEventListener("click", (e) => { if (e.target === settingsMask) settingsMask.classList.remove("show"); });

let saveMsgEl = null;
function showSaveMsg(text) {
  if (saveMsgEl) saveMsgEl.remove();
  saveMsgEl = document.createElement("div");
  saveMsgEl.className = "save-msg";
  saveMsgEl.textContent = text;
  settingsMask.appendChild(saveMsgEl);
}

document.getElementById("open-settings").onclick = openSettings;

document.getElementById("cfg-save").onclick = async () => {
  const body = {
    baseUrl: cfgBaseUrl.value.trim(),
    model: cfgModel.value,
  };
  const newKey = cfgApiKey.value.trim();
  if (newKey) body.apiKey = newKey;
  const sslSites = cfgSslSites.value.trim().split("\n").map((s) => s.trim()).filter(Boolean);
  const pingTargets = cfgPingTargets.value.trim().split("\n").map((s) => s.trim()).filter(Boolean);
  if (sslSites.length) body.sslSites = sslSites;
  if (pingTargets.length) body.pingTargets = pingTargets;
  const res = await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { alert("保存失败：" + (data.error || res.status)); return; }
  cfgApiKey.value = "";
  cfgKeyHint.textContent = `已配置：${data.apiKey}`;
  showSaveMsg("✅ 配置成功！");
  setTimeout(() => settingsMask.classList.remove("show"), 2000);
};