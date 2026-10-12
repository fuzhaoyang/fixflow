// ---------- 已安装应用管理（通用注册表，nginx 先行） ----------
// 各菜单复用现有全局交互：data-nginx-op（服务启停）、data-nginx-conf（配置查看/编辑）、nginx-save（性能保存）、store-install（版本安装）
async function fetchAppJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  try { return await res.json(); } catch { throw new Error(`非 JSON 响应 (HTTP ${res.status})`); }
}
function appFail(box, e) {
  box.innerHTML = `<span class="bad">${t("app.fail")}：${escapeHtml(e && e.message ? e.message : String(e))}</span>`;
}

const APP_MANAGERS = {
  nginx: {
    title: "Nginx",
    menu: ["service", "config", "version", "perf", "load", "logs"],
    render: (key, box) => ({ service: renderNginxService, config: renderNginxConfig, version: renderNginxVersion, perf: renderNginxPerf, load: renderNginxLoad, logs: renderNginxLogs }[key]?.(box)),
  },
};

let curMgr = null;
let curSection = null;
let loadTimer = null;

function openAppManage(pkg) {
  const mgr = APP_MANAGERS[pkg];
  if (!mgr) return;
  curMgr = mgr;
  curSection = "service";
  document.getElementById("app-manage-title").textContent = mgr.title;
  document.getElementById("app-manage-menu").innerHTML = mgr.menu.map((k) => `<button class="app-manage-item" data-sec="${k}">${t("app.sec." + k)}</button>`).join("");
  document.getElementById("app-manage-mask").classList.add("show");
  renderAppSection();
}

function renderAppSection() {
  if (loadTimer) { clearInterval(loadTimer); loadTimer = null; }
  document.querySelectorAll("#app-manage-menu .app-manage-item").forEach((b) => b.classList.toggle("active", b.dataset.sec === curSection));
  curMgr.render(curSection, document.getElementById("app-manage-content"));
}

function closeAppManage() {
  if (loadTimer) { clearInterval(loadTimer); loadTimer = null; }
  document.getElementById("app-manage-mask").classList.remove("show");
}

document.getElementById("app-manage-menu").addEventListener("click", (e) => {
  const b = e.target.closest(".app-manage-item");
  if (!b) return;
  curSection = b.dataset.sec;
  renderAppSection();
});
document.getElementById("app-manage-close").onclick = closeAppManage;
document.getElementById("app-manage-mask").addEventListener("click", (e) => { if (e.target === document.getElementById("app-manage-mask")) closeAppManage(); });

// --- 服务 ---
async function renderNginxService(box) {
  box.innerHTML = `<span class="muted">${t("store.loading")}</span>`;
  try {
    const data = await fetchAppJson("api/metrics");
    const m = data.nginx || {};
    const ok = !!m.status?.ok;
    const state = `<span class="${ok ? "ok" : "bad"}">● ${escapeHtml(m.status?.detail || (ok ? t("app.ok") : t("app.unknown")))}</span>`;
    box.innerHTML = `<dl class="app-kv">
        <dt>${t("app.state")}</dt><dd>${state}</dd>
        <dt>${t("nginx.version")}</dt><dd>${escapeHtml(m.version || "—")}</dd>
        <dt>${t("nginx.worker")}</dt><dd>${m.workers ?? "—"}</dd>
        <dt>${t("nginx.running")}</dt><dd>${escapeHtml(m.uptime || "—")}</dd>
      </dl>
      <div class="app-ops">
        <button class="btn small" data-nginx-op="reload">${t("nginx.opReloadCfg")}</button>
        <button class="btn small" data-nginx-op="restart">${t("nginx.opRestartSvc")}</button>
        ${ok ? `<button class="btn small" data-nginx-op="stop">${t("nginx.opStopSvc")}</button>` : `<button class="btn small" data-nginx-op="start">${t("nginx.opStartSvc")}</button>`}
      </div>
      <p class="hint" style="margin-top:12px">${t("app.svcHint")}</p>`;
  } catch (e) { appFail(box, e); }
}

// --- 配置修改（复用 nginx-conf 查看/编辑弹窗） ---
async function renderNginxConfig(box) {
  box.innerHTML = `<span class="muted">${t("store.loading")}</span>`;
  try {
    const data = await fetchAppJson("api/nginx/confs");
    const confs = Array.isArray(data) ? data : (data.confs || []);
    if (!confs.length) { box.innerHTML = `<span class="muted">${t("nginx.noConf")}</span>`; return; }
    box.innerHTML = `<table class="svc-table"><thead><tr><th>${t("nginx.file")}</th><th>${t("nginx.path")}</th><th>${t("proc.ops")}</th></tr></thead><tbody>
      ${confs.map((c) => `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.path)}</td><td class="proc-ops"><a href="javascript:void(0)" data-nginx-conf="${escapeHtml(c.path)}">${t("nginx.view")}</a><a href="javascript:void(0)" data-nginx-conf="${escapeHtml(c.path)}" data-nginx-edit="1">${t("nginx.edit")}</a></td></tr>`).join("")}
    </tbody></table>`;
  } catch (e) { appFail(box, e); }
}

// --- 切换版本 ---
async function renderNginxVersion(box) {
  box.innerHTML = `<span class="muted">${t("store.loading")}</span>`;
  try {
    const d = await fetchAppJson("api/app/nginx/versions?pkg=nginx");
    if (d.error) { box.innerHTML = `<span class="bad">${escapeHtml(d.error)}</span>`; return; }
    const rows = (d.versions || []).map((v) => `<li><span>${escapeHtml(v.version)}</span>${v.isInstalled ? `<span class="ok">${t("app.installedMark")}</span>` : `<button class="btn small" data-nginx-ver="${escapeHtml(v.version)}">${t("app.installVer")}</button>`}</li>`).join("");
    box.innerHTML = `<dl class="app-kv">
        <dt>${t("app.installed")}</dt><dd>${escapeHtml(d.installed || "—")}</dd>
        <dt>${t("app.candidate")}</dt><dd>${escapeHtml(d.candidate || "—")}</dd>
      </dl>
      <ul class="app-versions">${rows || `<li class="muted">${t("app.noVersion")}</li>`}</ul>`;
  } catch (e) { appFail(box, e); }
}

function openNginxVersionInstall(version) {
  procTarget = { kind: "store-install", pkg: "nginx", version };
  document.getElementById("proc-title").textContent = t("app.installVerTitle");
  document.getElementById("proc-text").textContent = t("app.installVerConfirm").replace("{ver}", version);
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("fw");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
}

// --- 性能调整（读 nginx.conf → 表单 → nginx-save 流程：备份+测试+重载） ---
// 参数定义：dir=指令名，block=缺失时插入位置(top/events/http)，unit=写入时追加的单位
const PERF_PARAMS = [
  { k: "workers",  label: "app.perf.workers",   dir: "worker_processes",             type: "text",   def: "auto",  unit: "", block: "top",    re: /worker_processes\s+([^;]+);/ },
  { k: "conns",    label: "app.perf.conns",     dir: "worker_connections",           type: "num",    def: "51200", unit: "", block: "events", re: /worker_connections\s+([^;]+);/ },
  { k: "keepalive",label: "app.perf.keepalive", dir: "keepalive_timeout",            type: "num",    def: "60",    unit: "", block: "http",   re: /keepalive_timeout\s+([^;]+);/ },
  { k: "gzip",     label: "app.perf.gzip",      dir: "gzip",                         type: "select", def: "on",    unit: "", block: "http",   re: /^\s*gzip\s+(on|off)\s*;/m },
  { k: "gzipMin",  label: "app.perf.gzipMin",   dir: "gzip_min_length",              type: "num",    def: "1",     unit: "k", block: "http",   re: /gzip_min_length\s+([^;]+);/ },
  { k: "gzipLevel",label: "app.perf.gzipLevel", dir: "gzip_comp_level",              type: "num",    def: "6",     unit: "", block: "http",   re: /gzip_comp_level\s+([^;]+);/ },
  { k: "maxBody",  label: "app.perf.maxBody",   dir: "client_max_body_size",         type: "num",    def: "50",    unit: "m", block: "http",   re: /client_max_body_size\s+([^;]+);/ },
  { k: "hashBucket",label: "app.perf.hashBucket",dir: "server_names_hash_bucket_size",type: "num",   def: "512",   unit: "", block: "http",   re: /server_names_hash_bucket_size\s+([^;]+);/ },
  { k: "headBuf",  label: "app.perf.headBuf",   dir: "client_header_buffer_size",    type: "num",    def: "10240", unit: "k", block: "http",   re: /client_header_buffer_size\s+([^;]+);/ },
  { k: "bodyBuf",  label: "app.perf.bodyBuf",   dir: "client_body_buffer_size",      type: "num",    def: "512",   unit: "k", block: "http",   re: /client_body_buffer_size\s+([^;]+);/ },
];

// 把缺失的指令插入对应块（top=worker_processes 上方 / events|http 块首行后）
function addNginxDirective(conf, block, line) {
  if (block === "top") {
    const m = conf.match(/^\s*events\s*\{/m);
    if (m) return conf.slice(0, m.index) + `${line}\n` + conf.slice(m.index);
    return line + "\n" + conf;
  }
  const m = conf.match(new RegExp(`^\\s*${block}\\s*\\{`, "m"));
  if (!m) return conf;
  const brace = conf.indexOf("{", m.index);
  if (brace < 0) return conf;
  return conf.slice(0, brace + 1) + `\n    ${line}` + conf.slice(brace + 1);
}

async function renderNginxPerf(box) {
  box.innerHTML = `<span class="muted">${t("store.loading")}</span>`;
  try {
    const d = await fetchAppJson(`api/nginx/conf?path=${encodeURIComponent("/etc/nginx/nginx.conf")}`);
    const conf = d.content || "";
    if (d.error && !conf) { box.innerHTML = `<span class="bad">${escapeHtml(d.error)}</span>`; return; }
    const val = (p) => { const m = conf.match(p.re); if (!m || m[1] == null) return p.def; const v = m[1].trim(); return p.unit ? v.replace(/[a-z]+$/i, "") : v; };
    box.innerHTML = `<div class="app-perf-grid">
      ${PERF_PARAMS.map((p) => {
        const v = escapeHtml(val(p));
        const input = p.type === "select"
          ? `<select id="perf-${p.k}"><option value="on" ${v === "on" ? "selected" : ""}>on</option><option value="off" ${v === "off" ? "selected" : ""}>off</option></select>`
          : `<input id="perf-${p.k}" type="${p.type === "num" ? "number" : "text"}" min="${p.type === "num" ? "0" : ""}" step="any" value="${v}">`;
        return `<div class="field"><label>${t(p.label)}</label>${input}</div>`;
      }).join("")}
      </div>
      <button class="btn" id="perf-apply">${t("app.perf.apply")}</button>
      <p class="hint" style="margin-top:10px">${t("app.perf.hint")}</p>`;
    document.getElementById("perf-apply").onclick = () => applyNginxPerf(conf);
  } catch (e) { appFail(box, e); }
}

function applyNginxPerf(orig) {
  let c = orig;
  for (const p of PERF_PARAMS) {
    const v = document.getElementById("perf-" + p.k).value.trim();
    if (!v) continue;
    const line = `${p.dir} ${p.type === "select" ? v : v + p.unit};`;
    if (p.re.test(c)) c = c.replace(p.re, `${line}`);
    else c = addNginxDirective(c, p.block, line);
  }
  procTarget = { kind: "nginx-save", path: "/etc/nginx/nginx.conf", content: c };
  document.getElementById("proc-title").textContent = t("nginx.saveTitle");
  document.getElementById("proc-text").textContent = t("app.perf.applyConfirm");
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("proc");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
}

// --- 负载状态（stub_status，2s 轮询） ---
async function renderNginxLoad(box) {
  const render = async () => {
    try {
      const d = await fetchAppJson("api/app/nginx/load");
      if (d.error) { box.innerHTML = `<span class="bad">${escapeHtml(d.error)}</span>`; return; }
      box.innerHTML = `<div class="app-load-nums">
        <div class="num"><b>${d.active ?? "—"}</b><span>${t("app.loadActive")}</span></div>
        <div class="num"><b>${d.reading ?? "—"}</b><span>${t("app.loadReading")}</span></div>
        <div class="num"><b>${d.writing ?? "—"}</b><span>${t("app.loadWriting")}</span></div>
      </div>
      <dl class="app-kv">
        <dt>${t("app.loadWaiting")}</dt><dd>${d.waiting ?? "—"}</dd>
        <dt>${t("app.loadRequests")}</dt><dd>${d.requests ?? "—"}</dd>
        <dt>${t("app.loadHandled")}</dt><dd>${d.handled ?? "—"}</dd>
      </dl>`;
    } catch (e) { appFail(box, e); }
  };
  await render();
  loadTimer = setInterval(render, 2000);
}

// --- 错误日志 ---
async function renderNginxLogs(box) {
  box.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h3 style="margin:0;font-size:14px">${t("app.logTitle")}</h3><button class="btn small" id="app-log-refresh">${t("app.logRefresh")}</button></div><pre id="app-log-pre" class="app-log-pre">${t("store.loading")}</pre>`;
  const load = async () => {
    try {
      const data = await fetchAppJson("api/metrics");
      const log = data.nginxLogs?.errorLog || "";
      document.getElementById("app-log-pre").textContent = log || t("app.noLog");
    } catch (e) { document.getElementById("app-log-pre").textContent = `${t("app.fail")}：${escapeHtml(e && e.message ? e.message : String(e))}`; }
  };
  await load();
  document.getElementById("app-log-refresh").onclick = load;
}

// 版本安装按钮
document.getElementById("app-manage-content").addEventListener("click", (e) => {
  const b = e.target.closest("[data-nginx-ver]");
  if (b) openNginxVersionInstall(b.dataset.nginxVer);
});
