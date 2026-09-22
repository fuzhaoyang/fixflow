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
const searchBox = document.getElementById("search");
const netTools = document.getElementById("net-tools");
const viewTitle = document.getElementById("view-title");
const viewMonitor = document.getElementById("view-monitor");
const viewChat = document.getElementById("view-chat");
const overviewEl = document.getElementById("overview");

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
    searchBox.style.display = "none";
    netTools.style.display = "none";
  } else {
    currentFilter = MODULES.some(([k]) => k === route) ? route : "all";
    viewMonitor.classList.toggle("single", currentFilter !== "all");
    viewMonitor.style.display = currentFilter === "all" ? "block" : "flex";
    viewChat.style.display = "none";
    viewMonitor.style.display = "block";
    viewTitle.textContent = currentFilter === "all" ? "监控总览" : (MODULES.find(([k]) => k === currentFilter)?.[1] || "监控");
    searchBox.style.display = currentFilter === "systemd" ? "" : "none";
    netTools.style.display = currentFilter === "network" ? "flex" : "none";
    overviewEl.style.display = currentFilter === "all" ? "flex" : "none";
    cards.style.display = currentFilter === "all" ? "none" : "";
    if (currentFilter === "all") refreshOverview();
    else renderCards();
  }
}
document.querySelectorAll(".menu-item").forEach((item) => {
  item.addEventListener("click", () => {
    location.hash = item.dataset.view === "chat" ? "/chat" : "/" + item.dataset.filter;
  });
});
window.addEventListener("hashchange", applyRoute);

// ---------- 总览：状态圆环 + 流量/磁盘IO ----------
let ringCharts = {};
let trafficChart = null;
let ioChart = null;
let overviewData = null;
let nicFilter = "all";
let unitDivider = 1;
let trafficTab = "traffic";
let unitTouched = false;

function fmtRate(v) {
  const x = (v || 0) / (unitDivider || 1);
  return x >= 100 ? Math.round(x) + (unitDivider >= 1024 * 1024 ? " MB/s" : " KB/s") : (x >= 10 ? x.toFixed(1) : x.toFixed(2)) + (unitDivider >= 1024 * 1024 ? " MB/s" : " KB/s");
}

function fmtTotal(bytes) {
  const b = bytes || 0;
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(2) + " MB";
  if (b >= 1024) return (b / 1024).toFixed(1) + " KB";
  return b + " B";
}

function ringColor(pct) {
  if (pct >= 90) return "#ef4444";
  if (pct >= 80) return "#f59e0b";
  return "#22c55e";
}

function renderSysInfo(sys) {
  if (!sys) return;
  const osEl = document.querySelector("#sys-info .sys-os");
  const upEl = document.querySelector("#sys-info .sys-uptime");
  if (osEl) osEl.textContent = `${sys.os} · ${sys.arch}`;
  if (upEl) upEl.textContent = `持续运行：${sys.uptime}`;
}

function ringLabel(pct) {
  if (pct >= 90) return "危险";
  if (pct >= 80) return "警戒";
  return "正常";
}

function initRings() {
  for (const key of ["load", "cpu", "mem", "disk"]) {
    ringCharts[key] = echarts.init(document.getElementById("ring-" + key));
    ringCharts[key].setOption({
      series: [{
        type: "pie",
        radius: ["72%", "88%"],
        center: ["50%", "50%"],
        silent: true,
        label: { show: false },
        data: [{ value: 0, itemStyle: { color: ringColor(0) } }, { value: 100, itemStyle: { color: "#334155" } }],
      }],
    });
  }
}

function renderRings(status) {
  const map = {
    load: { label: "负载状态", val: status?.load?.pct ?? 0, sub: status?.load ? `1m ${status.load.load1 ?? status.load.load} / 5m ${status.load.load5 ?? "—"} / 15m ${status.load.load15 ?? "—"} · ${status.load.ncpu} 核` : "" },
    cpu: { label: "CPU 使用率", val: status?.cpu?.pct ?? 0, sub: "实时" },
    mem: { label: "内存使用率", val: status?.mem?.pct ?? 0, sub: "" },
    disk: { label: "磁盘使用率", val: status?.disk?.pct ?? 0, sub: "根分区" },
  };
  for (const key of ["load", "cpu", "mem", "disk"]) {
    const it = map[key];
    const pct = Math.min(100, Math.max(0, it.val));
    ringCharts[key].setOption({
      series: [{ data: [{ value: pct, itemStyle: { color: ringColor(pct) } }, { value: 100 - pct, itemStyle: { color: "#334155" } }] }],
    });
    document.getElementById("val-" + key).textContent = (Number.isInteger(pct) ? pct : pct.toFixed(1)) + "%";
    document.getElementById("val-" + key).style.color = ringColor(pct);
    document.getElementById("sub-" + key).textContent = it.sub + " · " + ringLabel(pct);
  }
}

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
    document.getElementById("kpi-tx").textContent = `${last?.iops ?? 0} 次`;
    const lat = document.getElementById("kpi-rx");
    lat.textContent = `${last?.latency ?? 0} ms`;
    lat.style.color = "#22c55e";
    return;
  }
  const k = kpiOf(nicFilter);
  document.getElementById("kpi-up").textContent = fmtRate(k.up);
  document.getElementById("kpi-down").textContent = fmtRate(k.down);
  document.getElementById("kpi-tx").textContent = fmtTotal(k.tx);
  document.getElementById("kpi-rx").textContent = fmtTotal(k.rx);
  document.getElementById("kpi-rx").style.color = "";
}

function fmtBytes(b) {
  const v = b || 0;
  if (v >= 1024 * 1024) return (v / 1024 / 1024).toFixed(2) + " MB";
  if (v >= 1024) return (v / 1024).toFixed(2) + " KB";
  return v + " B";
}

function chartOption(mode) {
  if (!overviewData) return null;
  const points = mode === "traffic" ? overviewData.net : overviewData.io;
  if (!points?.length) return null;
  const times = points.map((p) => {
    const d = new Date(p.t * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  });
  let upData, downData;
  if (mode === "traffic") {
    upData = points.map((p) => {
      let v = 0;
      for (const [name, x] of Object.entries(p.up || {})) if (nicFilter === "all" || name === nicFilter) v += x;
      return (v / (unitDivider || 1)).toFixed(2);
    });
    downData = points.map((p) => {
      let v = 0;
      for (const [name, x] of Object.entries(p.down || {})) if (nicFilter === "all" || name === nicFilter) v += x;
      return (v / (unitDivider || 1)).toFixed(2);
    });
  } else {
    upData = points.map((p) => {
      let v = 0;
      for (const x of Object.values(p.read || {})) v += x;
      return (v / (unitDivider || 1)).toFixed(2);
    });
    downData = points.map((p) => {
      let v = 0;
      for (const x of Object.values(p.write || {})) v += x;
      return (v / (unitDivider || 1)).toFixed(2);
    });
  }
  const [upName, downName, upColor, downColor] = mode === "traffic"
    ? ["上行", "下行", "#f97316", "#3b82f6"]
    : ["读取", "写入", "#ec4899", "#06b6d4"];
  return {
    tooltip: {
      trigger: "axis",
      backgroundColor: "#ffffff",
      borderColor: "#e2e8f0",
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: "#334155", fontSize: 12 },
      extraCssText: "box-shadow: 0 4px 16px rgba(0,0,0,.12); border-radius: 8px;",
    },
    grid: { left: 52, right: 16, top: 40, bottom: 28 },
    xAxis: {
      type: "category", data: times, boundaryGap: false,
      axisLine: { lineStyle: { color: "#334155" } },
      axisLabel: { color: "#94a3b8", fontSize: 11 },
    },
    yAxis: {
      type: "value", min: 0,
      max: unitDivider >= 1024 * 1024 ? undefined : (mode === "io" ? 2.5 : 50),
      interval: unitDivider >= 1024 * 1024 ? undefined : (mode === "io" ? 0.5 : 10),
      axisLabel: { color: "#94a3b8", fontSize: 11 },
      splitLine: { lineStyle: { color: "#1e293b" } },
    },
    series: [
      {
        name: downName, type: "line", data: downData, smooth: true, symbol: "none",
        lineStyle: { color: downColor, width: 1.5 },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: hexToRgba(downColor, 0.45) }, { offset: 1, color: hexToRgba(downColor, 0.08) }] } },
      },
      {
        name: upName, type: "line", data: upData, smooth: true, symbol: "none",
        lineStyle: { color: upColor, width: 1.5 },
        areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: hexToRgba(upColor, 0.4) }, { offset: 1, color: hexToRgba(upColor, 0.05) }] } },
      },
    ],
  };
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function renderChart() {
  const chart = trafficTab === "traffic" ? trafficChart : ioChart;
  const option = chartOption(trafficTab);
  if (option) chart.setOption(option, true);
  renderKpi();
}

async function refreshOverview() {
  try {
    const res = await fetch("api/overview");
    overviewData = await res.json();
    renderSysInfo(overviewData.sys);
    renderRings(overviewData.status);
    const sel = document.getElementById("nic-select");
    const prev = sel.value;
    const nics = (overviewData.nics || []).filter((n) => n !== "lo");
    sel.innerHTML = '<option value="all">所有</option>' + nics.map((n) => `<option>${escapeHtml(n)}</option>`).join("");
    if (nics.includes(prev)) sel.value = prev;
    renderChart();
  } catch {}
}

document.getElementById("tab-traffic").onclick = () => switchTrafficTab("traffic");
document.getElementById("tab-io").onclick = () => switchTrafficTab("io");
function switchTrafficTab(mode) {
  trafficTab = mode;
  document.getElementById("tab-traffic").classList.toggle("active", mode === "traffic");
  document.getElementById("tab-io").classList.toggle("active", mode === "io");
  const isTraffic = mode === "traffic";
  document.getElementById("traffic-chart").style.display = isTraffic ? "" : "none";
  document.getElementById("io-chart").style.display = isTraffic ? "none" : "";
  document.getElementById("nic-select").style.display = isTraffic ? "" : "none";
  document.getElementById("kpi-row").style.display = "";
  const dots = document.querySelectorAll("#kpi-row .dot");
  if (isTraffic) {
    document.getElementById("kpi-up-key").innerHTML = '<span class="dot up"></span>上行';
    document.getElementById("kpi-down-key").innerHTML = '<span class="dot down"></span>下行';
    document.getElementById("kpi-tx-key").textContent = "总发送";
    document.getElementById("kpi-rx-key").textContent = "总接收";
    dots[0].style.background = "#f97316";
    dots[1].style.background = "#3b82f6";
  } else {
    document.getElementById("kpi-up-key").innerHTML = '<span class="dot" style="background:#ec4899"></span>读取';
    document.getElementById("kpi-down-key").innerHTML = '<span class="dot" style="background:#06b6d4"></span>写入';
    document.getElementById("kpi-tx-key").textContent = "每秒读写 (IOPS)";
    document.getElementById("kpi-rx-key").textContent = "IO 延迟";
    dots[0].style.background = "#ec4899";
    dots[1].style.background = "#06b6d4";
  }
  if (!unitTouched) {
    const unitSel = document.getElementById("unit-select");
    if (isTraffic) { unitSel.value = "KB/s"; unitDivider = 1; }
    else { unitSel.value = "MB/s"; unitDivider = 1024 * 1024; }
  }
  const chart = isTraffic ? trafficChart : ioChart;
  setTimeout(() => chart.resize(), 0);
  renderChart();
}
document.getElementById("nic-select").onchange = (e) => { nicFilter = e.target.value; renderChart(); };
document.getElementById("unit-select").onchange = (e) => {
  unitTouched = true;
  unitDivider = e.target.value === "MB/s" ? 1024 * 1024 : 1;
  renderChart();
};

function initOverview() {
  initRings();
  trafficChart = echarts.init(document.getElementById("traffic-chart"));
  ioChart = echarts.init(document.getElementById("io-chart"));
  switchTrafficTab("traffic");
  document.getElementById("unit-select").value = "KB/s";
  unitDivider = 1;
  refreshOverview();
}

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
    return `<tr><td>${escapeHtml(s.name)}</td><td class="${cls}">${escapeHtml(s.sub || s.state)}</td><td>${escapeHtml(s.path || "—")}</td><td>${escapeHtml(s.cpu ?? "—")}</td><td>${escapeHtml(s.mem ?? "—")}</td><td>${escapeHtml(s.memMb ?? "—")}</td><td>${escapeHtml(s.started)}</td></tr>`;
  }).join("");
  return `<div class="card-body"><table class="svc-table"><thead><tr><th>服务</th><th>状态</th><th>服务路径</th><th>占用cpu</th><th>占用内存%</th><th>内容大小</th><th>启动时间</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
    const res = await fetch("api/metrics");
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
      log.scrollTop = log.scrollHeight;
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
  const es = new EventSource("api/stream");
  es.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    if (ev.type === "text") addMsg(ev.text, "assistant");
    else if (ev.type === "delta") {
      hideTyping();
      streamingText += ev.text;
      if (!streamingEl) streamingEl = renderMsg("", "assistant");
      scheduleStreamRender();
      log.scrollTop = log.scrollHeight;
    }
    else if (ev.type === "tool") { finishStreaming(); addSimpleMsg(toolSummary(ev), "tool"); }
    else if (ev.type === "confirm") {
      const riskLabel = { low: "低", medium: "中", high: "高" }[ev.riskLevel] || "中";
      const riskCls = ev.riskLevel === "high" ? "risk-high" : ev.riskLevel === "low" ? "risk-low" : "risk-mid";
      const card = document.createElement("div");
      card.className = "msg confirm";
      card.innerHTML = `
        <div class="approval-card">
          <div class="approval-head"><b>🔒 变更审批单</b><span class="risk-badge ${riskCls}">风险 ${riskLabel}${ev.riskLevel === "high" ? " ⚠️" : ""}</span></div>
          ${ev.reason ? `<div class="approval-row"><span class="lbl">变更理由</span><span>${escapeHtml(ev.reason)}</span></div>` : ""}
          ${ev.impact ? `<div class="approval-row"><span class="lbl">影响范围</span><span>${escapeHtml(ev.impact)}</span></div>` : ""}
          <div class="approval-row"><span class="lbl">变更命令</span><code>${escapeHtml(ev.command || "")}</code></div>
        </div>`;
      const btnRow = document.createElement("div");
      btnRow.className = "confirm-row";
      const yes = document.createElement("button");
      yes.className = "btn btn-yes small"; yes.textContent = "确认执行";
      const no = document.createElement("button");
      no.className = "btn btn-no small"; no.textContent = "拒绝";
      const finish = (label) => {
        card.querySelector(".confirm-row")?.remove();
        const span = document.createElement("div");
        span.textContent = label;
        card.appendChild(span);
      };
      yes.onclick = () => { finish("✅ 已确认执行，正在运行…"); fetch("api/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ev.id, ok: true }) }); };
      no.onclick = () => { finish("❌ 已拒绝执行"); fetch("api/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ev.id, ok: false }) }); };
      btnRow.append(yes, no);
      card.appendChild(btnRow);
      log.appendChild(card);
      log.scrollTop = log.scrollHeight;
    } else if (ev.type === "clear") {
      clearHistory();
      addSimpleMsg("🧹 聊天历史已清空", "system", { keepWelcome: true });
    } else if (ev.type === "done") {
      finishStreaming();
      setBusy(false);
      hideTyping();
    } else if (ev.type === "aborted") {
      finishStreaming();
      setBusy(false);
      hideTyping();
      addSimpleMsg("⚠️ 执行已中止", "system");
    } else if (ev.type === "error") {
      finishStreaming();
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
  fetch("api/history/clear", { method: "POST" });
  log.innerHTML = "";
  welcome.style.display = "";
  hideTyping();
  log.appendChild(welcome);
}

async function send() {
  if (busy) {
    await fetch("api/abort", { method: "POST" });
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
  await fetch("api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: text, images }) });
}

sendBtn.onclick = send;
stopBtn.onclick = () => fetch("api/abort", { method: "POST" });
clearBtn.onclick = () => { clearHistory(); addSimpleMsg("🧹 聊天历史已清空", "system", { keepWelcome: true }); };
input.addEventListener("input", () => { charCount.textContent = input.value.length ? input.value.length + "/5000" : ""; });
input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
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
function initPanel() {
  applyRoute();
  initOverview();
  refreshMetrics();
  setInterval(refreshMetrics, 5000);
  setInterval(() => { if (currentFilter === "all" && overviewEl.style.display !== "none") refreshOverview(); }, 2000);
  (async () => { await loadHistory(); restoreHistory(); })();
  connectStream();
  loadModelStatus();
}

const modelStatus = document.getElementById("model-status");
async function loadModelStatus() {
  let cfg = {};
  try {
    const res = await fetch("api/config");
    cfg = await res.json();
  } catch {}
  const model = cfg.model || "未设置模型";
  try {
    const res = await fetch("api/models");
    if (!res.ok) throw new Error(res.status);
    modelStatus.innerHTML = `<span class="dot"></span>${escapeHtml(model)} · 已连接`;
    modelStatus.classList.add("on");
  } catch {
    modelStatus.innerHTML = `<span class="dot" style="background:var(--bad)"></span>${escapeHtml(model)} · 无法连接`;
    modelStatus.classList.remove("on");
  }
}
modelStatus.addEventListener("click", openSettings);

// ---------- 登录 / 注册 ----------
const authMask = document.getElementById("auth-mask");
const authTitle = document.getElementById("auth-title");
const authSub = document.getElementById("auth-sub");
const authErr = document.getElementById("auth-err");
const authForm = document.getElementById("auth-form");
const authUsername = document.getElementById("auth-username");
const authPassword = document.getElementById("auth-password");
const authCaptcha = document.getElementById("auth-captcha");
const authCaptchaImg = document.getElementById("auth-captcha-img");
const authSubmit = document.getElementById("auth-submit");
const authForgot = document.getElementById("auth-forgot");
const authForgotLink = document.getElementById("auth-forgot-link");
const authTip = document.getElementById("auth-tip");

let authMode = "login";

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
  if (mode === "login") {
    authTitle.textContent = "登录 Fixflow";
    authSub.textContent = "登录后即可使用服务器运维面板";
    authSubmit.textContent = "登录";
    authForgot.style.display = registered ? "" : "none";
    authTip.innerHTML = registered ? "" : '<button type="button" id="auth-toggle">没有账号？去注册</button>';
  } else {
    authTitle.textContent = "注册 Fixflow";
    authSub.textContent = "首次使用，设置面板登录账号";
    authSubmit.textContent = "注册并登录";
    authForgot.style.display = "none";
    authTip.innerHTML = '<button type="button" id="auth-toggle">已有账号？去登录</button>';
  }
  document.getElementById("auth-toggle")?.addEventListener("click", () => setAuthMode("login", true));
  document.getElementById("auth-forgot-link")?.addEventListener("click", () => {
    clearAuthErr();
    authSub.textContent = "请在服务器上运行 fixflow reset-password 重置密码。";
  });
  refreshCaptcha();
}

function setupAuth() {
  (async () => {
    const res = await fetch("api/status");
    const data = await res.json();
    if (data.loggedIn) { setUserName(data.username); authMask.style.display = "none"; initPanel(); return; }
    setAuthMode(data.registered ? "login" : "register", Boolean(data.registered));
    authMask.style.display = "flex";
  })();
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthErr();
    const payload = {
      username: authUsername.value.trim(),
      password: authPassword.value,
      captchaCode: authCaptcha.value.trim(),
    };
    authSubmit.disabled = true;
    try {
      const res = await fetch("api/" + authMode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAuthErr(data.error || "操作失败");
        refreshCaptcha();
        return;
      }
      if (authMode === "register") {
        const loginRes = await fetch("api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!loginRes.ok) { setAuthMode("login", true); showAuthErr("注册成功，请登录"); return; }
      }
      authMask.style.display = "none";
      location.reload();
    } finally {
      authSubmit.disabled = false;
    }
  });
  authCaptchaImg.addEventListener("click", refreshCaptcha);
}

// ---------- 设置 ----------
const settingsMask = document.getElementById("settings-mask");
const cfgBaseUrl = document.getElementById("cfg-base-url");
const cfgApiKey = document.getElementById("cfg-api-key");
const cfgKeyHint = document.getElementById("cfg-key-hint");
const cfgModel = document.getElementById("cfg-model");
const cfgModelStatus = document.getElementById("cfg-model-status");

let currentKey = "";

async function loadModels() {
  cfgModelStatus.textContent = "拉取模型中…";
  cfgModelStatus.className = "model-loading";
  try {
    const res = await fetch("api/models");
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
  const res = await fetch("api/config");
  const cfg = await res.json();
  cfgBaseUrl.value = cfg.baseUrl || "";
  cfgKeyHint.textContent = cfg.apiKey ? `已配置：${cfg.apiKey}` : "未配置";
  currentKey = cfg.apiKey || "";
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
  document.body.appendChild(saveMsgEl);
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
  });
});
const userNameEl = document.getElementById("user-name");
function setUserName(name) {
  userNameEl.textContent = name || "账号";
}

document.getElementById("logout-cancel").onclick = () => logoutMask.classList.remove("show");
logoutMask.addEventListener("click", (e) => { if (e.target === logoutMask) logoutMask.classList.remove("show"); });
document.getElementById("logout-confirm").onclick = () => {
  fetch("api/logout", { method: "POST" }).finally(() => location.reload());
};

const helpMask = document.getElementById("help-mask");
document.getElementById("help-btn").onclick = () => helpMask.classList.add("show");
document.getElementById("help-close").onclick = () => helpMask.classList.remove("show");

const restartMask = document.getElementById("restart-mask");
const restartConfirmBtn = document.getElementById("restart-confirm");
document.getElementById("restart-cancel").onclick = () => restartMask.classList.remove("show");
restartMask.addEventListener("click", (e) => { if (e.target === restartMask) restartMask.classList.remove("show"); });
restartConfirmBtn.onclick = () => {
  restartConfirmBtn.disabled = true;
  restartConfirmBtn.textContent = "重启中…";
  fetch("api/restart", { method: "POST" })
    .then(() => {
      showSaveMsg("✅ 已触发重启，页面将自动刷新…");
      setTimeout(() => location.reload(), 3000);
    })
    .catch(() => {
      restartConfirmBtn.disabled = false;
      restartConfirmBtn.textContent = "确认重启";
      showSaveMsg("❌ 重启请求失败");
    });
};

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
  const res = await fetch("api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { alert("保存失败：" + (data.error || res.status)); return; }
  cfgApiKey.value = "";
  cfgKeyHint.textContent = `已配置：${data.apiKey}`;
  showSaveMsg("✅ 配置成功！");
  setTimeout(() => settingsMask.classList.remove("show"), 2000);
};

setupAuth();