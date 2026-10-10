// ---------- 监控域（总览 / 监控 / 黑白名单） ----------
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
  const w = canvas.clientWidth || 0;
  const h = canvas.clientHeight || 0;
  if (w <= 0 || h <= 0) return null;
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
  const sc = setupCanvas(canvas);
  if (!sc) return;
  const { ctx, w, h } = sc;
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
  const draw = () => {
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
  };
  const canvas = trafficTab === "trend" ? document.getElementById("trend-chart")
    : trafficTab === "token" ? document.getElementById("token-chart")
    : document.getElementById(trafficTab === "traffic" ? "traffic-chart" : "io-chart");
  if (canvas && (canvas.clientWidth <= 0 || canvas.clientHeight <= 0)) {
    requestAnimationFrame(draw);
    return;
  }
  draw();
}

function fmtNum(n) {
  if (!Number.isFinite(n)) return "--";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function drawTokenChart(canvas, days) {
  const sc = setupCanvas(canvas);
  if (!sc) return;
  const { ctx, w, h } = sc;
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
  window.addEventListener("resize", () => { if (overviewEl && overviewEl.style.display !== "none") renderChart(); });
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
    const sc = setupCanvas(canvas);
    if (!sc) return;
    const { ctx, w, h } = sc;
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

