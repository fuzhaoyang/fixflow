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
let chatView = false;
let metrics = {};
let busy = false;

// ---------- 路由（hash：#/system、#/network、#/chat） ----------
function applyRoute() {
  const route = (location.hash.replace(/^#\/?/, "") || "all").trim();
  document.querySelectorAll(".menu-item").forEach((i) => {
    const hit = route === "chat" ? i.dataset.view === "chat" : i.dataset.view === "monitor" && i.dataset.filter === route;
    i.classList.toggle("active", hit);
  });
  chatView = route === "chat";
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
    if (currentFilter === "all") {
      refreshOverview();
      [trafficChart, ioChart].filter(Boolean).forEach((c) => setTimeout(() => c.resize(), 0));
    }
    else renderCards();
    refreshMetrics();
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
let tokenChart = null;
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
  if (osEl) osEl.textContent = `当前系统：${sys.os} · ${sys.arch}`;
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
  if (trafficTab === "token") {
    const days = overviewData?.usage || [];
    if (tokenChart) tokenChart.setOption(tokenChartOption(days), true);
    const last = days[days.length - 1];
    document.getElementById("token-today").textContent = last ? fmtNum(last.total) : "--";
    document.getElementById("token-total30").textContent = fmtNum(days.reduce((s, d) => s + d.total, 0));
    return;
  }
  const chart = trafficTab === "traffic" ? trafficChart : ioChart;
  const option = chartOption(trafficTab);
  if (option) chart.setOption(option, true);
  renderKpi();
}

function fmtNum(n) {
  if (!Number.isFinite(n)) return "--";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function tokenChartOption(days) {
  return {
    tooltip: { trigger: "axis" },
    legend: { data: ["输入 prompt", "输出 completion", "总 token"], textStyle: { color: "#94a3b8" }, top: 0 },
    grid: { left: 56, right: 20, top: 36, bottom: 28 },
    xAxis: { type: "category", data: days.map((d) => d.date.slice(5)), axisLabel: { color: "#94a3b8" } },
    yAxis: { type: "value", axisLabel: { color: "#94a3b8" }, splitLine: { lineStyle: { color: "rgba(255,255,255,.08)" } } },
    series: [
      { name: "输入 prompt", type: "bar", stack: "t", barMaxWidth: 22, data: days.map((d) => d.prompt), itemStyle: { color: "#3b82f6" } },
      { name: "输出 completion", type: "bar", stack: "t", barMaxWidth: 22, data: days.map((d) => d.completion), itemStyle: { color: "#ec4899" } },
      { name: "总 token", type: "line", smooth: true, data: days.map((d) => d.total), itemStyle: { color: "#fbbf24" }, lineStyle: { color: "#fbbf24", width: 2 } },
    ],
  };
}

async function refreshOverview() {
  try {
    const res = await fetch("api/overview");
    overviewData = await res.json();
    renderSysInfo(overviewData.status?.sys);
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
document.getElementById("tab-token").onclick = () => switchTrafficTab("token");
function switchTrafficTab(mode) {
  trafficTab = mode;
  document.getElementById("tab-traffic").classList.toggle("active", mode === "traffic");
  document.getElementById("tab-io").classList.toggle("active", mode === "io");
  document.getElementById("tab-token").classList.toggle("active", mode === "token");
  const isTraffic = mode === "traffic";
  const isToken = mode === "token";
  document.getElementById("traffic-chart").style.display = isTraffic ? "" : "none";
  document.getElementById("io-chart").style.display = mode === "io" ? "" : "none";
  document.getElementById("token-chart").style.display = isToken ? "" : "none";
  document.getElementById("nic-select").style.display = isTraffic ? "" : "none";
  document.getElementById("kpi-row").style.display = mode === "io" ? "" : "none";
  document.getElementById("token-kpi").style.display = isToken ? "" : "none";
  const dots = document.querySelectorAll("#kpi-row .dot");
  if (isToken) {
    document.getElementById("token-today").textContent = "--";
    document.getElementById("token-total30").textContent = "--";
  } else if (isTraffic) {
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
  if (!unitTouched && !isToken) {
    const unitSel = document.getElementById("unit-select");
    unitSel.value = "MB/s";
    unitDivider = 1024 * 1024;
  }
  const chart = isTraffic ? trafficChart : isToken ? tokenChart : ioChart;
  setTimeout(() => chart?.resize(), 0);
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
  tokenChart = echarts.init(document.getElementById("token-chart"));
  switchTrafficTab("traffic");
  document.getElementById("unit-select").value = "MB/s";
  unitDivider = 1024 * 1024;
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
      card.innerHTML = `<h2>${label}</h2>${renderSystemd({ ...m, userProcs: metrics.userProcs })}`;
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
    } else if (key === "nginx") {
      card.innerHTML = `<h2>${label}</h2>${renderNginx(m, metrics.nginxLogs)}`;
      setTimeout(loadNginxConfs, 0);
    } else if (key === "firewall") {
      card.innerHTML = `<h2>${label}</h2>${renderFirewall(m)}`;
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
  if (!m?.services && !m?.userProcs) return `<pre>${escapeHtml(m?.error || "N/A")}</pre>`;
  const q = searchBox.value.trim().toLowerCase();
  const services = m.services || [];
  const svcPids = new Set(services.map((s) => String(s.mainPid)));
  const procs = ((m.userProcs && m.userProcs.procs) || []).filter((p) => !svcPids.has(String(p.pid)));
  const rows = [];
  for (const s of services) {
    const cls = s.state === "active" ? "ok" : s.state === "failed" ? "bad" : "na";
    rows.push(`<tr><td>服务</td><td>${escapeHtml(s.name)}</td><td class="${cls}">${escapeHtml(s.sub || s.state)}</td><td>${escapeHtml(s.cpu ?? "—")}</td><td>${escapeHtml(s.mem ?? "—")}</td><td>${escapeHtml(s.memMb ?? "—")}</td><td>${escapeHtml(s.mainPid || "—")}</td><td>${escapeHtml(s.started)}</td></tr>`);
  }
  for (const p of procs) {
    rows.push(`<tr><td>进程</td><td>${escapeHtml(p.name)}</td><td class="ok">运行中</td><td>${escapeHtml(p.cpu ?? "—")}</td><td>${escapeHtml(p.mem ?? "—")}</td><td>—</td><td>${p.pid}</td><td>—</td></tr>`);
  }
  if (!rows.length) return `<pre>${escapeHtml(q ? `未找到匹配「${q}」的服务` : "（无匹配服务，可在设置中配置服务白名单）")}</pre>`;
  const filtered = q ? rows.filter((r) => r.toLowerCase().includes(q)) : rows;
  return `<div class="card-body"><table class="svc-table"><thead><tr><th>类型</th><th>名称</th><th>状态</th><th>占用cpu</th><th>占用内存%</th><th>内容大小</th><th>PID</th><th>启动时间</th></tr></thead><tbody>${filtered.join("")}</tbody></table></div>`;
}

function renderNginx(m, logs) {
  if (m?.error) return `<pre>${escapeHtml(m.error)}</pre>`;
  const info = `<div class="sys-info" style="font-size:14px">
    <span class="${m.status?.ok ? "ok" : "bad"}">● ${escapeHtml(m.status?.detail || "未知")}</span>
    <span class="sep"></span>版本 ${escapeHtml(m.version || "—")}
    <span class="sep"></span>配置校验 <span class="${m.config?.ok ? "ok" : "bad"}">${m.config?.ok ? "通过" : "失败"}</span>
    <span class="sep"></span>worker ${m.workers || 0}
    <span class="sep"></span>运行 ${escapeHtml(m.uptime || "—")}
  </div>`;
  const running = Boolean(m.status?.ok);
  const ops = `<div style="display:flex;gap:8px;margin:10px 0">
    <button class="btn small" data-nginx-op="reload">重载配置</button>
    <button class="btn small" data-nginx-op="restart">重启服务</button>
    ${running
      ? `<button class="btn small" data-nginx-op="stop">停止服务</button>`
      : `<button class="btn small" data-nginx-op="start">启动服务</button>`}
  </div>`;
  const errLog = logs?.errorLog ? `<details style="margin-top:10px"><summary style="cursor:pointer">最近错误日志</summary><pre>${escapeHtml(logs.errorLog)}</pre></details>` : "";
  return `${info}${ops}<h3 style="font-size:14px;margin:12px 0 4px">配置文件</h3><div id="nginx-confs"><pre>加载中…</pre></div>${errLog}`;
}

async function loadNginxConfs() {
  const box = document.getElementById("nginx-confs");
  if (!box) return;
  try {
    const res = await fetch("api/nginx/confs");
    const data = await res.json();
    const confs = data.confs || [];
    const listens = metrics.nginx?.listens || [];
    if (!confs.length && !listens.length) { box.innerHTML = `<pre>${escapeHtml(data.error || "（无配置文件）")}</pre>`; return; }
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
      return `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.path)}</td><td>${escapeHtml(ports)}</td><td>${escapeHtml(names)}</td><td><span class="proc-ops"><a href="javascript:void(0)" data-nginx-conf="${escapeHtml(c.path)}">查看</a><a href="javascript:void(0)" data-nginx-conf="${escapeHtml(c.path)}" data-nginx-edit="1">编辑</a></span></td></tr>`;
    }).join("");
    box.innerHTML = `<div class="card-body"><table class="svc-table"><thead><tr><th>文件</th><th>路径</th><th>监听端口</th><th>server_name</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  } catch (e) {
    box.innerHTML = `<pre>加载失败：${escapeHtml(String(e))}</pre>`;
  }
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
    const svc = escapeHtml(p.service || "");
    const name = String(p.cmd || "").trim().split(/\s+/)[0]?.split("/").pop() || "";
    const protectedProc = p.pid === 1 || /^[DZ]/.test(p.state || "") || (p.user === "root" && /(daemon|systemd|dbus)/.test(name)) || /(^dde-|kwin|Xorg|lightdm)/.test(name) || /^k/.test(name);
    const btns = protectedProc ? "—"
      : p.service
        ? `<span class="proc-ops"><a href="javascript:void(0)" data-proc-action="restart" data-proc-pid="${p.pid}" data-proc-service="${svc}">重启</a><a href="javascript:void(0)" data-proc-action="kill" data-proc-pid="${p.pid}" data-proc-service="${svc}" class="danger">关闭</a></span>`
        : `<span class="proc-ops"><a href="javascript:void(0)" data-proc-action="kill" data-proc-pid="${p.pid}" data-proc-service="" class="danger">关闭</a></span>`;
    return `<tr${style}><td>${p.pid}</td><td>${escapeHtml(p.user || "")}</td><td>${p.cpu}%</td><td>${p.mem}%</td><td>${p.memKb ? Math.round(p.memKb / 1024) + "MB" : "—"}</td><td>${svc || "—"}</td><td>${escapeHtml(p.cmd || "")}</td><td>${btns}</td></tr>`;
  }).join("");
  return `${anomalies}${zombie}${sortBtns}<div class="card-body"><table class="svc-table"><thead><tr><th>PID</th><th>用户</th><th>CPU%</th><th>内存%</th><th>内存</th><th>systemd 服务</th><th>命令</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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

function renderSsl(m) {
  const list = m?.results;
  if (!list) return `<pre>${escapeHtml(m?.error || "N/A")}</pre>`;
  const total = list.length;
  const warn = list.filter((s) => typeof s.daysLeft === "number" && s.daysLeft > 7 && s.daysLeft <= 30).length;
  const expired = list.filter((s) => typeof s.daysLeft === "number" && s.daysLeft <= 7).length;
  const tool = m.renewTool ? `可用（${m.renewTool}）` : "未检测到";
  const summary = `<div class="ssl-summary">
    <span>共 <b>${total}</b> 张</span>
    <span class="na">临期 ≤30 天 <b>${warn}</b></span>
    <span class="bad">严重 ≤7 天 <b>${expired}</b></span>
    <span>续签工具：${escapeHtml(tool)}</span>
    <button class="btn small" id="ssl-add-btn">➕ 添加监控</button>
  </div>`;
  if (!total) return summary + `<pre>（未发现证书，可点击「添加监控」手动添加）</pre>`;
  const rows = list.map((s) => {
    const cls = sslLevel(s.daysLeft);
    const expire = typeof s.daysLeft === "number" ? (s.daysLeft > 0 ? `${s.daysLeft} 天` : "已过期") : "—";
    const name = s.type === "local" ? escapeHtml(s.path) : `${escapeHtml(s.host)}:${escapeHtml(s.port)}`;
    const srcLabel = s.source === "discovered" ? `<span class="tag">自动</span>` : `<span class="tag">手动</span>`;
    const ops = [];
    if (s.type === "local" && s.enabled !== false && m.renewTool) ops.push(`<a href="javascript:void(0)" data-ssl-action="renew" data-ssl-id="${escapeHtml(s.id)}" data-ssl-name="${escapeHtml(s.cn || s.path)}">续签</a>`);
    if (s.source === "manual") {
      ops.push(`<a href="javascript:void(0)" data-ssl-action="toggle" data-ssl-id="${escapeHtml(s.id)}" data-ssl-enabled="${s.enabled !== false}">${s.enabled === false ? "启用" : "停用"}</a>`);
      ops.push(`<a href="javascript:void(0)" data-ssl-action="del" data-ssl-id="${escapeHtml(s.id)}" class="danger">删除</a>`);
    }
    const opsHtml = ops.length ? `<span class="proc-ops ssl-ops">${ops.join("")}</span>` : "—";
    return `<tr><td>${name} ${srcLabel}</td><td>${escapeHtml(s.cn || "—")}</td><td>${escapeHtml(s.issuer || "—")}</td><td>${escapeHtml(s.notAfter || "—")}</td><td class="${cls}">${expire}${sslBar(s.daysLeft)}</td><td>${escapeHtml((s.san || []).join(", "))}</td><td>${escapeHtml(s.label || "—")}</td><td>${opsHtml}</td></tr>`;
  }).join("");
  return summary + `<div class="card-body"><table class="svc-table"><thead><tr><th>域名/路径</th><th>CN</th><th>签发者</th><th>到期时间</th><th>剩余</th><th>SAN</th><th>备注</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
    document.getElementById("ssl-renew-text").textContent = `即将续签：${a.dataset.sslName}，成功后自动重载 nginx。`;
    document.getElementById("ssl-renew-password").value = "";
    document.getElementById("ssl-renew-err").textContent = "";
    sslRenewMask.classList.add("show");
  } else if (action === "del") {
    if (!confirm("确认删除该监控条目？")) return;
    await fetch("api/ssl", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    refreshMetrics();
  } else if (action === "toggle") {
    await fetch("api/ssl", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled: a.dataset.sslEnabled !== "true" }) });
    refreshMetrics();
  }
});

document.getElementById("ssl-add-cancel").onclick = () => sslAddMask.classList.remove("show");
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
  if (!res.ok) { document.getElementById("ssl-add-err").textContent = data.error || "添加失败"; return; }
  sslAddMask.classList.remove("show");
  refreshMetrics();
};

document.getElementById("ssl-renew-cancel").onclick = () => sslRenewMask.classList.remove("show");
document.getElementById("ssl-renew-confirm").onclick = async () => {
  const errEl = document.getElementById("ssl-renew-err");
  const password = document.getElementById("ssl-renew-password").value.trim();
  if (!password) { errEl.textContent = "请输入登录密码"; return; }
  errEl.textContent = "";
  const btn = document.getElementById("ssl-renew-confirm");
  btn.disabled = true;
  try {
    const res = await fetch("api/ssl/renew", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sslRenewTarget.id, password }) });
    const data = await res.json();
    if (!res.ok || !data.ok) { errEl.textContent = data.error || data.stderr || "续签失败"; return; }
    sslRenewMask.classList.remove("show");
    refreshMetrics();
  } finally { btn.disabled = false; }
};

const FIREWALL_MODES = { delete: "删除放行规则", deny: "添加拒绝规则" };

function renderFirewall(m) {
  if (!m || m.error) return `<pre>${escapeHtml(m?.error || "N/A")}</pre>`;
  const rules = Array.isArray(m.rules) ? m.rules : [];
  const risky = Array.isArray(m.riskyPorts) ? m.riskyPorts : [];
  const dangerCount = risky.filter((p) => p.dangerous).length;
  const backend = m.backend || "ufw";
  const canClose = backend === "ufw";
  const stateLabel = backend === "firewalld" ? "firewalld 已启用" : backend === "ufw" ? "ufw 已启用" : "未启用 / 降级";
  const summary = `<div class="fw-summary">
    <div class="fw-stat"><span class="k">防火墙状态</span><span class="v">${stateLabel}</span></div>
    <div class="fw-stat"><span class="k">放行规则</span><span class="v">${rules.length}</span></div>
    <div class="fw-stat"><span class="k">对全网开放</span><span class="v ${dangerCount ? "bad" : ""}">${risky.length}${dangerCount ? `（危险 ${dangerCount}）` : ""}</span></div>
  </div>`;

  let rulesHtml;
  if (rules.length) {
    const riskySet = new Set(risky.map((p) => `${p.proto}:${p.port}`));
    const rows = rules.map((r) => {
      const hit = String(r.port || "").split(",").some((p) => riskySet.has(`${r.proto}:${p.trim()}`));
      const style = hit ? " style='background:rgba(248,113,113,0.12)'" : "";
      return `<tr${style}><td>${r.num ?? "—"}</td><td>${escapeHtml(r.action)}</td><td>${escapeHtml((r.proto || "").toUpperCase())}</td><td>${escapeHtml(r.port)}</td><td>${escapeHtml(r.from)}</td><td>${escapeHtml(r.comment || "—")}</td></tr>`;
    }).join("");
    rulesHtml = `<div class="card-body"><table class="svc-table"><thead><tr><th>#</th><th>动作</th><th>协议</th><th>端口</th><th>来源</th><th>备注</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  } else {
    rulesHtml = `<pre>${escapeHtml(m.raw || "未检测到防火墙规则")}</pre>`;
  }

  const disabled = canClose ? "" : " disabled";
  const closeNote = canClose ? "" : `<div class="hint" style="margin-bottom:8px">当前后端为 ${escapeHtml(backend)}，暂不支持一键关闭</div>`;
  const riskRows = risky.map((p) => {
    const tag = p.dangerous ? `<span class="risk-badge risk-high">危险</span>` : `<span class="risk-badge risk-low">一般</span>`;
    const opts = Object.entries(FIREWALL_MODES).map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
    return `<div class="fw-risk-row">${tag}<span class="fw-port">${p.port}/${p.proto}</span>
      <select class="fw-mode"${disabled}>${opts}</select>
      <button class="btn small" data-fw-close data-fw-port="${p.port}" data-fw-proto="${p.proto}"${disabled}>关闭端口</button></div>`;
  }).join("");
  const riskHtml = risky.length ? `${closeNote}<div class="fw-risk">${riskRows}</div>` : `<pre>未发现对全网开放的端口 ✅</pre>`;

  return `${summary}<h3 class="fw-sub">放行规则</h3>${rulesHtml}<h3 class="fw-sub">对全网开放的端口</h3>${riskHtml}`;
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
      <span class="avatar ${cls === "user" ? "user" : "bot"}">${cls === "user" ? "🧑‍💻" : "🤖"}</span>
      <span class="msg-name">${cls === "user" ? "我" : "Fixflow"}</span>
      <span class="msg-time">${now()}</span>
    </div>
    <div class="bubble ${cls === "user" ? "user" : "bot"}"></div>`;
  const imgs = (images || []).filter(Boolean).map((src) => `<img class="msg-img" src="${src}" alt="图片">`).join("");
  item.querySelector(".bubble").innerHTML = cls === "user"
    ? imgs + (text ? `<div class="msg-text">${escapeHtml(text)}</div>` : "")
    : renderMarkdown(text);
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

const termPane = document.getElementById("term-pane");
const termSplitter = document.getElementById("term-splitter");
let termOpen = false;
let terminal = null;

function termAppend(text) {
  if (terminal) terminal.write(text);
}

function fitTerminal() {
  if (!terminal) return;
  const el = document.getElementById("term-terminal");
  const lineH = (terminal.options.fontSize || 13) * 1.4;
  const rows = Math.max(5, Math.floor((el.clientHeight - 6) / lineH));
  terminal.resize(80, rows);
}

function termSetLoading(show, text = "连接中…", error = false) {
  const el = document.getElementById("term-loading");
  const tx = document.getElementById("term-loading-text");
  if (el) { el.classList.toggle("show", show); el.classList.toggle("error", error); }
  if (tx && text) tx.textContent = text;
}

async function termConnect() {
  if (terminal) { termSetLoading(false); return; }
  termSetLoading(true, "连接中…");
  let r = {};
  try {
    r = await fetch("api/term/open", { method: "POST" }).then((res) => res.json());
  } catch {
    termSetLoading(true, "连接失败", true);
    setTimeout(() => termSetLoading(false), 2500);
    return;
  }
  if (r.error) {
    termSetLoading(true, `连接失败：${r.error}`, true);
    setTimeout(() => termSetLoading(false), 2500);
    return;
  }
  termSetLoading(false);
  terminal = new Terminal({
    cols: 80,
    rows: 24,
    fontSize: 13,
    theme: { background: "#0f172a", foreground: "#e2e8f0", cursor: "#e2e8f0", selectionBackground: "#334155" },
  });
  terminal.open(document.getElementById("term-terminal"));
  if (r.history) terminal.write(r.history);
  let termCmdBuf = "";
  terminal.onData((data) => {
    fetch("api/term/input", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
    for (const ch of data) {
      if (ch === "\r" || ch === "\n") {
        const cmd = termCmdBuf.trim();
        if (cmd) {
          fetch("api/term/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: cmd }) });
          const cd = cmd.match(/^cd\s+(\S+)/);
          if (cd) fsRevealPath(cd[1]);
        }
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
  if (["txt", "log", "conf", "cfg", "ini", "json", "md", "yml", "yaml", "sh", "py", "js", "html", "css", "xml", "sql"].includes(ext)) return "文本";
  if (["tgz", "gz", "zip", "tar", "rar", "7z", "bz2"].includes(ext)) return "压缩包";
  if (["exe", "bin", "so", "dll"].includes(ext)) return "二进制";
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(ext)) return "图片";
  return "文件";
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
  return res ? await res.json() : { error: "无法访问文件系统" };
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
    return `<div class="fs-tree-item" data-path="${escapeHtml(path)}" style="padding-left:${depth * 14 + 6}px"><span class="arrow"></span><span>📁</span><span>${escapeHtml(name)}</span></div>`;
  }
  const arrow = st.dirs.length ? (st.expanded ? "▼" : "▶") : "";
  let html = `<div class="fs-tree-item${path === fsPath ? " sel" : ""}" data-path="${escapeHtml(path)}" style="padding-left:${depth * 14 + 6}px"><span class="arrow">${arrow}</span><span>📁</span><span>${escapeHtml(name)}</span></div>`;
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
function fsRenderList() {
  const { key, dir } = fsSort;
  const sorted = [...fsItems].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    const va = a[key], vb = b[key];
    const cmp = typeof va === "number" ? va - vb : String(va ?? "").localeCompare(String(vb ?? ""));
    return cmp * dir;
  });
  fsTbody.innerHTML = sorted.map((it) => {
    const sel = fsSel && fsSel.name === it.name ? " class='sel'" : "";
    const size = it.isDir ? "—" : fsFmtSize(it.size);
    const mtime = (it.mtime || "").replace("T", " ").slice(0, 16);
    return `<tr class="fs-row"${sel} data-name="${escapeHtml(it.name)}"><td><span>${it.isDir ? "📁" : "📄"}</span> ${escapeHtml(it.name)}</td><td>${size}</td><td>${it.isDir ? "目录" : it.isSymlink ? "符号链接" : fsFileType(it.name)}</td><td>${mtime}</td><td>${escapeHtml(it.mode)}</td><td>${escapeHtml(it.user)}/${escapeHtml(it.group)}</td></tr>`;
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
  if (it.isDir) { fsLoadList(joinPath(fsPath, it.name)); fsRenderTree(); }
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
  const name = prompt("新建文件夹名称：");
  if (!name || !name.trim()) return;
  fsAskPassword("📁 新建文件夹", `确认在 ${fsPath} 下创建文件夹「${name.trim()}」？此操作需输入登录密码验证。`, { path: fsPath, name: name.trim() }, "mkdir");
};
fsRenameBtn.onclick = () => {
  if (!fsSel) return;
  const name = prompt("新名称：", fsSel.name);
  if (!name || !name.trim()) return;
  fsAskPassword("✏️ 重命名", `将「${fsSel.name}」重命名为「${name.trim()}」？此操作需输入登录密码验证。`, { path: joinPath(fsPath, fsSel.name), newName: name.trim() }, "rename");
};
fsDeleteBtn.onclick = () => {
  if (!fsSel) return;
  fsAskPassword("🗑 删除", `删除「${fsSel.name}」？${fsSel.isDir ? "目录将递归删除，" : ""}删除后不可恢复！此操作需输入登录密码验证。`, { path: joinPath(fsPath, fsSel.name) }, "delete");
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
  if (f.size > 50 * 1024 * 1024) { alert("文件超过 50MB"); return; }
  fsAskPassword("⬆️ 上传文件", `上传「${f.name}」(${fsFmtSize(f.size)}) 到 ${fsPath}？此操作需输入登录密码验证。`, { path: fsPath, file: f }, "upload");
});
[fsTree, document.querySelector(".fs-list-wrap")].forEach((el) => {
  el.addEventListener("dragover", (e) => e.preventDefault());
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    const f = files[0];
    if (files.length > 1) alert("一次仅支持拖放单个文件");
    if (f.size > 50 * 1024 * 1024) { alert("文件超过 50MB"); return; }
    const treeItem = e.target.closest(".fs-tree-item");
    const target = treeItem ? treeItem.dataset.path : fsPath;
    fsAskPassword("⬆️ 拖放上传", `上传「${f.name}」(${fsFmtSize(f.size)}) 到 ${target}？此操作需输入登录密码验证。`, { path: target, file: f }, "upload");
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
    document.getElementById("fs-edit-title").textContent = `📝 ${path}`;
  }
  fsEditMask.classList.add("show");
}
document.getElementById("fs-edit-cancel").onclick = () => fsEditMask.classList.remove("show");
document.getElementById("fs-edit-save").onclick = () => {
  if (!fsEditPath) return;
  fsAskPassword("💾 保存文件", `保存修改到 ${fsEditPath}？此操作需输入登录密码验证。`, { path: fsEditPath, content: fsEditContent.value }, "write");
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
window.addEventListener("resize", () => { if (termOpen) fitTerminal(); });
const termLogMask = document.getElementById("term-log-mask");
document.getElementById("term-log").onclick = async () => {
  termLogMask.classList.add("show");
  const box = document.getElementById("term-log-body");
  box.innerHTML = "<pre>加载中…</pre>";
  try {
    const res = await fetch("api/term/history");
    const data = await res.json();
    const recs = data.records || [];
    if (!recs.length) { box.innerHTML = "<pre>（暂无记录）</pre>"; return; }
    box.innerHTML = `<table class="svc-table"><thead><tr><th>时间</th><th>用户</th><th>命令</th></tr></thead><tbody>${recs.map((r) => `<tr><td>${escapeHtml(r.time)}</td><td>${escapeHtml(r.user)}</td><td><code>${escapeHtml(r.command)}</code></td></tr>`).join("")}</tbody></table>`;
  } catch (e) { box.innerHTML = `<pre>加载失败：${escapeHtml(String(e))}</pre>`; }
};
document.getElementById("term-log-close").onclick = () => termLogMask.classList.remove("show");
termLogMask.addEventListener("click", (e) => { if (e.target === termLogMask) termLogMask.classList.remove("show"); });

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
  const imgs = pendingImages;
  if (!text && !imgs.length) return;
  input.value = "";
  pendingImages = [];
  preview.innerHTML = "";
  charCount.textContent = "";
  addMsg(text, "user", { images: imgs });
  setBusy(true);
  showTyping();
  await fetch("api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: text, images: imgs }) });
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
let metricsTimer = null;
let overviewTimer = null;
function stopPolling() {
  if (metricsTimer) clearInterval(metricsTimer);
  if (overviewTimer) clearInterval(overviewTimer);
}
function startPolling() {
  stopPolling();
  metricsTimer = setInterval(() => { if (!chatView) refreshMetrics(); }, 10000);
  overviewTimer = setInterval(() => { if (currentFilter === "all" && overviewEl.style.display !== "none") refreshOverview(); }, 3000);
}
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
  const model = cfg.model || "未设置模型";
  modelStatus.innerHTML = `<span class="dot"></span>${escapeHtml(model)} · 连接中…`;
  modelStatus.classList.remove("on");
  try {
    const res = await fetch("api/models");
    if (!res.ok) throw new Error(res.status);
    modelStatus.innerHTML = `<span class="dot"></span>${escapeHtml(model)} · 已连接`;
    modelStatus.classList.add("on");
  } catch {
    modelStatus.innerHTML = `<span class="dot" style="background:var(--bad)"></span>${escapeHtml(model)} · 无法连接`;
    modelStatus.classList.remove("on");
    modelCheckTimer = setTimeout(loadModelStatus, 5000);
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
let apiKeyTouched = false;
cfgApiKey.addEventListener("input", () => { apiKeyTouched = true; });

async function loadModels() {
  cfgModelStatus.textContent = "拉取模型中…";
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
    cfgModelStatus.textContent = `共 ${data.models.length} 个模型`;
  } catch (e) {
    cfgModelStatus.textContent = "拉取失败：" + e.message + "（请检查 API 地址和 Key）";
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
  cfgKeyHint.textContent = cfg.apiKey ? `已配置：${cfg.apiKey}` : "未配置";
  currentKey = cfg.apiKey || "";
  const al = cfg.sslAlerts || {};
  const smtp = al.smtp || {};
  document.getElementById("cfg-ssl-webhook").value = al.webhook || "";
  document.getElementById("cfg-smtp-host").value = smtp.host || "";
  document.getElementById("cfg-smtp-port").value = smtp.port || "";
  document.getElementById("cfg-smtp-user").value = smtp.user || "";
  document.getElementById("cfg-smtp-pass").value = smtp.pass || "";
  document.getElementById("cfg-smtp-from").value = smtp.from || "";
  document.getElementById("cfg-smtp-to").value = smtp.to || "";
  document.getElementById("cfg-service-keywords").value = (cfg.serviceKeywords || []).join(",");
  settingsMask.classList.add("show");
  await loadModels();
  if (cfg.model) cfgModel.value = cfg.model;
}

settingsMask.querySelector("#cfg-cancel").onclick = () => settingsMask.classList.remove("show");
settingsMask.querySelector("#cfg-close").onclick = () => settingsMask.classList.remove("show");

let saveMsgEl = null;
function showSaveMsg(text) {
  if (saveMsgEl) saveMsgEl.remove();
  saveMsgEl = document.createElement("div");
  saveMsgEl.className = "save-msg";
  saveMsgEl.textContent = text;
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

const procMask = document.getElementById("proc-mask");
let procTarget = null;
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-proc-action]");
  if (!btn) return;
  procTarget = { action: btn.dataset.procAction, pid: Number(btn.dataset.procPid), service: btn.dataset.procService };
  const isRestart = procTarget.action === "restart";
  document.getElementById("proc-title").textContent = isRestart ? "🔄 重启进程" : "⏹️ 关闭进程";
  document.getElementById("proc-text").textContent = isRestart
    ? `确认重启进程 ${procTarget.pid}（服务 ${procTarget.service}）吗？此操作需输入登录密码验证。`
    : `确认关闭进程 PID ${procTarget.pid} 吗？此操作需输入登录密码验证。`;
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
});
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fw-close]");
  if (!btn) return;
  const row = btn.closest(".fw-risk-row");
  procTarget = { kind: "firewall", port: Number(btn.dataset.fwPort), proto: btn.dataset.fwProto, mode: row.querySelector(".fw-mode").value };
  document.getElementById("proc-title").textContent = "🛡️ 关闭端口";
  document.getElementById("proc-text").textContent = `确认关闭端口 ${procTarget.port}/${procTarget.proto}（${FIREWALL_MODES[procTarget.mode]}）吗？此操作需输入登录密码验证。`;
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
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
  ta.value = "加载中…";
  ta.readOnly = true;
  document.getElementById("nginx-conf-title").textContent = `📄 ${nginxConfPath}`;
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
  document.getElementById("proc-title").textContent = "💾 保存 Nginx 配置";
  document.getElementById("proc-text").textContent = `确认保存 ${nginxConfPath} 并重载 nginx 吗？此操作需输入登录密码验证。`;
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
};
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-nginx-op]");
  if (!btn) return;
  const action = btn.dataset.nginxOp;
  procTarget = { kind: "nginx-op", action };
  const labels = { reload: "重载", restart: "重启", start: "启动", stop: "停止" };
  const icons = { reload: "♻️", restart: "🔄", start: "▶️", stop: "⏹️" };
  const label = labels[action] || action;
  document.getElementById("proc-title").textContent = `${icons[action] || "🛠️"} ${label} Nginx`;
  document.getElementById("proc-text").textContent = `确认${label} nginx 服务吗？此操作需输入登录密码验证。`;
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
});
document.getElementById("proc-cancel").onclick = () => procMask.classList.remove("show");
procMask.addEventListener("click", (e) => { if (e.target === procMask) procMask.classList.remove("show"); });
document.getElementById("proc-confirm").onclick = async () => {
  const errEl = document.getElementById("proc-err");
  const password = document.getElementById("proc-password").value.trim();
  if (!password) { errEl.textContent = "请输入登录密码"; return; }
  errEl.textContent = "";
  const confirmBtn = document.getElementById("proc-confirm");
  confirmBtn.disabled = true;
  const kind = procTarget?.kind;
  const isFw = kind === "firewall";
  const isNginxSave = kind === "nginx-save";
  const isNginxOp = kind === "nginx-op";
  const isFs = kind === "fs";
  const fsOp = isFs ? procTarget.op : "";
  try {
    let res, data;
    if (isFs && fsOp === "upload") {
      const fd = new FormData();
      fd.append("path", procTarget.body.path);
      fd.append("password", password);
      fd.append("file", procTarget.body.file, procTarget.body.file.name);
      res = await fetch("api/fs/upload", { method: "POST", body: fd });
    } else {
      const endpoint = isFw ? "api/firewall/close" : isNginxSave ? "api/nginx/conf" : isNginxOp ? "api/nginx/reload" : isFs ? `api/fs/${fsOp}` : "api/process";
      const payload = isFw
        ? { port: procTarget.port, proto: procTarget.proto, mode: procTarget.mode, password }
        : isNginxSave
          ? { path: procTarget.path, content: procTarget.content, password }
          : isNginxOp
            ? { action: procTarget.action, password }
            : isFs
              ? { ...(procTarget.body || {}), password }
              : { ...procTarget, password };
      res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    data = await res.json();
    if (res.status === 403 || res.status === 400) {
      errEl.textContent = data.error || "操作失败";
      if (isNginxSave) document.getElementById("nginx-conf-err").textContent = data.error || "";
      return;
    }
    if (!data.ok) { errEl.textContent = data.stderr || data.error || "操作失败"; return; }
    if (isNginxSave) nginxConfMask.classList.remove("show");
    if (isFs && fsOp === "write") fsEditMask.classList.remove("show");
    procMask.classList.remove("show");
    refreshMetrics();
    if (isFs) fsRefresh();
  } catch (e2) {
    errEl.textContent = String(e2);
  } finally {
    confirmBtn.disabled = false;
  }
};

document.getElementById("cfg-save").onclick = async () => {
  const body = {
    model: cfgModel.value,
  };
  const newBaseUrl = cfgBaseUrl.value.trim();
  if (newBaseUrl) body.baseUrl = newBaseUrl;
  const newKey = cfgApiKey.value.trim();
  if (newKey) body.apiKey = newKey;
  body.sslAlerts = {
    webhook: document.getElementById("cfg-ssl-webhook").value.trim(),
    smtp: {
      host: document.getElementById("cfg-smtp-host").value.trim(),
      port: document.getElementById("cfg-smtp-port").value.trim(),
      user: document.getElementById("cfg-smtp-user").value.trim(),
      pass: document.getElementById("cfg-smtp-pass").value,
      from: document.getElementById("cfg-smtp-from").value.trim(),
      to: document.getElementById("cfg-smtp-to").value.trim(),
    },
  };
  body.serviceKeywords = document.getElementById("cfg-service-keywords").value.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
  const res = await fetch("api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { alert("保存失败：" + (data.error || res.status)); return; }
  cfgApiKey.value = "";
  cfgKeyHint.textContent = `已配置：${data.apiKey}`;
  showSaveMsg("✅ 配置成功！");
  loadModelStatus();
  setTimeout(() => settingsMask.classList.remove("show"), 2000);
};

// ---------- 告警 ----------
const alertMask = document.getElementById("alert-mask");
let alertEditId = null;

async function refreshAlerts() {
  try {
    const res = await fetch("api/alerts");
    const data = await res.json();
    document.getElementById("bell-dot").classList.toggle("on", (data.alerts || []).some((a) => a.enabled));
    document.getElementById("alert-host").value = data.smtp?.host || "";
    document.getElementById("alert-port").value = data.smtp?.port || "";
    document.getElementById("alert-user").value = data.smtp?.user || "";
    document.getElementById("alert-from").value = data.smtp?.from || "";
    const list = document.getElementById("alert-list");
    if (!data.alerts?.length) {
      list.innerHTML = `<pre style="color:var(--muted)">（暂无告警）</pre>`;
    } else {
      list.innerHTML = data.alerts.map((a) => `<div class="alert-row">
        <span class="tag">${a.enabled ? "启用" : "停用"}</span>
        <b>${escapeHtml(a.name)}</b>
        <span>${escapeHtml(a.time)}</span>
        <span style="color:var(--muted);font-size:12px">${escapeHtml((a.recipients || []).join(", "))}</span>
        <span class="proc-ops">
          <a href="javascript:void(0)" data-alert-run="${escapeHtml(a.id)}">立即执行</a>
          <a href="javascript:void(0)" data-alert-toggle="${escapeHtml(a.id)}" data-enabled="${a.enabled}">${a.enabled ? "停用" : "启用"}</a>
          <a href="javascript:void(0)" data-alert-edit="${escapeHtml(a.id)}">编辑</a>
          <a href="javascript:void(0)" data-alert-del="${escapeHtml(a.id)}" class="danger">删除</a>
        </span>
      </div>`).join("");
    }
    const hist = document.getElementById("alert-hist");
    const acc = [];
    for (const a of data.alerts || []) {
      const hs = (data.history?.[a.id] || []).map((h) => `<div class="alert-row">
        <span class="tag ${h.ok ? "ok" : "bad"}">${h.ok ? "成功" : "失败"}</span>
        <b>${escapeHtml(h.subject)}</b>
        <span style="color:var(--muted);font-size:12px">${escapeHtml(h.at)}</span>
        <span style="color:var(--muted);font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(h.error || h.summary)}</span>
      </div>`).join("");
      if (hs) acc.push(hs);
    }
    hist.innerHTML = acc.join("") || `<pre style="color:var(--muted)">（暂无执行记录）</pre>`;
  } catch {}
}

document.getElementById("bell-btn").onclick = () => { refreshAlerts(); alertMask.classList.add("show"); };
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
  showSaveMsg("✅ 邮箱配置已保存");
  refreshAlerts();
};

document.getElementById("alert-add").onclick = () => {
  alertEditId = null;
  document.getElementById("alert-form-title").textContent = "新增告警";
  ["alert-name", "alert-time", "alert-recipients", "alert-instruction"].forEach((id) => { document.getElementById(id).value = ""; });
  document.getElementById("alert-form-err").textContent = "";
  document.getElementById("alert-form").style.display = "";
};
document.getElementById("alert-form-cancel").onclick = () => { document.getElementById("alert-form").style.display = "none"; };

document.getElementById("alert-form-save").onclick = async () => {
  const body = {
    name: document.getElementById("alert-name").value.trim(),
    time: document.getElementById("alert-time").value,
    instruction: document.getElementById("alert-instruction").value.trim(),
    recipients: document.getElementById("alert-recipients").value.split(/[,，\s]+/).filter(Boolean),
  };
  const errEl = document.getElementById("alert-form-err");
  if (!body.name || !body.time || !body.instruction || !body.recipients.length) { errEl.textContent = "名称/时间/指令/收件人必填"; return; }
  errEl.textContent = "";
  const res = await fetch("api/alerts", { method: alertEditId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(alertEditId ? { ...body, id: alertEditId } : body) });
  if (!res.ok) { errEl.textContent = ((await res.json()).error) || "保存失败"; return; }
  document.getElementById("alert-form").style.display = "none";
  refreshAlerts();
};

document.getElementById("alert-list").addEventListener("click", async (e) => {
  const a = e.target.closest("[data-alert-edit],[data-alert-del],[data-alert-run],[data-alert-toggle]");
  if (!a) return;
  const id = a.dataset.alertEdit || a.dataset.alertDel || a.dataset.alertRun || a.dataset.alertToggle;
  if (a.dataset.alertDel) {
    if (!confirm("确认删除该告警？")) return;
    await fetch("api/alerts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    refreshAlerts();
  } else if (a.dataset.alertToggle) {
    await fetch("api/alerts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled: a.dataset.enabled === "false" }) });
    refreshAlerts();
  } else if (a.dataset.alertRun) {
    const res = await fetch("api/alerts/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    showSaveMsg(res.ok ? "✅ 已执行" : "❌ " + ((await res.json()).error || "执行失败"));
    refreshAlerts();
  } else if (a.dataset.alertEdit) {
    alertEditId = id;
    const res = await fetch("api/alerts");
    const data = await res.json();
    const it = data.alerts.find((x) => x.id === id);
    document.getElementById("alert-form-title").textContent = "编辑告警";
    document.getElementById("alert-name").value = it.name;
    document.getElementById("alert-time").value = it.time;
    document.getElementById("alert-recipients").value = (it.recipients || []).join(", ");
    document.getElementById("alert-instruction").value = it.instruction;
    document.getElementById("alert-form-err").textContent = "";
    document.getElementById("alert-form").style.display = "";
  }
});

setupAuth();