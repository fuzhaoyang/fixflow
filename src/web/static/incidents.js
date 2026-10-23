// ---------- 事件 ----------
const incidentSearch = document.getElementById("incident-search");
const incidentRefresh = document.getElementById("incident-refresh");
const incidentCount = document.getElementById("incident-count");
const incidentList = document.getElementById("incident-list");
const incidentMask = document.getElementById("incident-mask");
const incidentBody = document.getElementById("incident-body");
const incidentRetro = document.getElementById("incident-retro");
const incidentClose = document.getElementById("incident-close");
const incidentClose2 = document.getElementById("incident-close2");

let incidentItems = [];
let incidentQuery = "";
let incidentDetail = null;

const incTime = (ts) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(curLang === "en" ? "en-US" : "zh-CN", { hour12: false });
};
const incStatus = (s) => s === "resolved" ? t("incident.resolved") : t("incident.open");

function renderIncidents() {
  const q = incidentQuery.trim().toLowerCase();
  const list = q ? incidentItems.filter((i) => [i.title, i.service, i.host, i.alertname].join(" ").toLowerCase().includes(q)) : incidentItems;
  if (incidentCount) incidentCount.textContent = t("incident.count").replace("{n}", list.length);
  if (!list.length) { incidentList.innerHTML = `<div class="retro-empty">${escapeHtml(t("incident.empty"))}</div>`; return; }
  incidentList.innerHTML = list.map((i) => `<div class="incident-card" data-incident="${escapeHtml(i.id)}">
    <div class="retro-card-head"><span class="tag ${i.severity <= 2 ? "bad" : "warn"}">P${escapeHtml(i.severity)}</span><span class="tag ${i.status === "resolved" ? "ok" : "bad"}">${escapeHtml(incStatus(i.status))}</span></div>
    <div class="retro-card-title">${escapeHtml(i.title)}</div>
    <div class="retro-card-meta">${escapeHtml(i.service)} · ${escapeHtml(i.host)} · ${escapeHtml(incTime(i.startedAt))}</div>
    <div class="retro-card-summary">${escapeHtml(i.rcaSummary || t("incident.pending"))}</div>
  </div>`).join("");
}

async function loadIncidents() {
  try {
    const res = await fetch("api/incidents");
    const data = await res.json();
    incidentItems = data.incidents || [];
  } catch { incidentItems = []; }
  renderIncidents();
}

function evidenceHtml(e) {
  return `<div class="inc-ev"><div class="inc-ev-head"><span class="tag">${escapeHtml(e.kind)}</span><span class="inc-ev-cmd">${escapeHtml(e.command)}</span></div><pre>${escapeHtml(e.output)}</pre></div>`;
}

function rcaHtml(rca) {
  if (!rca) return `<div class="hint">${escapeHtml(t("incident.noRca"))}</div>`;
  return `<div class="inc-rca">
    <p><b>${escapeHtml(t("incident.summary"))}</b>：${escapeHtml(rca.summary || "—")}</p>
    <p><b>${escapeHtml(t("incident.rootCause"))}</b>：${escapeHtml(rca.rootCause || "—")}</p>
    <p><b>${escapeHtml(t("incident.confidence"))}</b>：${Math.round((Number(rca.confidence) || 0) * 100)}%</p>
    <p><b>${escapeHtml(t("incident.suggestion"))}</b>：${escapeHtml(rca.suggestedAction || "—")}</p>
    <p><b>${escapeHtml(t("incident.rollback"))}</b>：${escapeHtml(rca.rollback || "—")}</p>
    <p><b>${escapeHtml(t("incident.missing"))}</b>：${escapeHtml(rca.missing || "—")}</p>
  </div>`;
}

async function openIncident(id) {
  const res = await fetch(`api/incidents/${encodeURIComponent(id)}`).catch(() => null);
  const inc = res ? await res.json().catch(() => ({})) : {};
  if (!inc || inc.error) { alert(inc?.error || t("incident.notFound")); return; }
  incidentDetail = inc;
  const timeline = (inc.timeline || []).map((x) => `<li>${escapeHtml(incTime(x.ts))} ${escapeHtml(x.text)}</li>`).join("");
  const actions = inc.allowedActions || [];
  const actionBtns = actions.map((a) => `<button class="btn small" data-inc-action="${escapeHtml(a.key)}">${escapeHtml(a.label)}</button>`).join("");
  const actionLog = (inc.actions || []).map((a) => `<div class="inc-ev"><div class="inc-ev-head"><span class="tag ${a.ok ? "ok" : "bad"}">${escapeHtml(a.ok ? t("incident.actionDone") : t("incident.actionFail"))}</span><span class="inc-ev-cmd">${escapeHtml(a.label)} · ${escapeHtml(incTime(a.ts))}</span></div><pre>${escapeHtml(a.output || "")}</pre></div>`).join("");
  incidentBody.innerHTML = `<h2>${escapeHtml(inc.title)}</h2>
    <div class="inc-meta">${escapeHtml(inc.service)} · ${escapeHtml(inc.host)} · P${escapeHtml(inc.severity)} · ${escapeHtml(incStatus(inc.status))} · ${escapeHtml(incTime(inc.startedAt))}</div>
    <h3>${escapeHtml(t("incident.rcaTitle"))}</h3>${rcaHtml(inc.rca)}
    <h3>${escapeHtml(t("incident.actions"))}</h3><div class="inc-actions">${actionBtns || `<span class="hint">${escapeHtml(t("incident.noActions"))} <a href="javascript:void(0)" data-open-playbooks>${escapeHtml(t("pb.button"))}</a></span>`}</div>
    <h3>${escapeHtml(t("incident.evidence"))}</h3><div class="inc-evs">${(inc.evidence || []).map(evidenceHtml).join("") || `<div class="hint">${escapeHtml(t("incident.noEvidence"))}</div>`}</div>
    ${actionLog ? `<h3>${escapeHtml(t("incident.actionLog"))}</h3>${actionLog}` : ""}
    <h3>${escapeHtml(t("incident.timeline"))}</h3><ul class="inc-timeline">${timeline || "<li>—</li>"}</ul>`;
  if (incidentRetro) incidentRetro.style.display = inc.retroId ? "" : "none";
  incidentMask.classList.add("show");
}

async function refreshIncidentDetail(id) {
  if (incidentDetail?.id === id) await openIncident(id);
}

function incidentAskPassword(action) {
  procTarget = { kind: "incident-action", incidentId: incidentDetail.id, action: action.key };
  document.getElementById("proc-title").textContent = t("incident.actionTitle");
  document.getElementById("proc-text").textContent = `${action.label}：${action.command}（${t("incident.risk")}：${action.risk}）`;
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
}


if (incidentRefresh) incidentRefresh.onclick = loadIncidents;
if (incidentSearch) incidentSearch.addEventListener("input", () => { incidentQuery = incidentSearch.value; renderIncidents(); });
if (incidentList) incidentList.addEventListener("click", (e) => {
  const card = e.target.closest("[data-incident]");
  if (card) openIncident(card.dataset.incident);
});
if (incidentBody) incidentBody.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-playbooks]")) { openPlaybooks(); return; }
  const b = e.target.closest("[data-inc-action]");
  if (!b) return;
  const action = (incidentDetail?.allowedActions || []).find((a) => a.key === b.dataset.incAction);
  if (action) incidentAskPassword(action);
});
if (incidentClose) incidentClose.onclick = () => incidentMask.classList.remove("show");
if (incidentClose2) incidentClose2.onclick = () => incidentMask.classList.remove("show");
if (incidentMask) incidentMask.addEventListener("click", (e) => { if (e.target === incidentMask) incidentMask.classList.remove("show"); });
if (incidentRetro) incidentRetro.onclick = () => { if (incidentDetail?.retroId) { incidentMask.classList.remove("show"); openRetroById(incidentDetail.retroId); } };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") incidentMask?.classList.remove("show"); });
if (location.hash === "#/incidents") loadIncidents();

// ---------- Playbook 可视化配置 ----------
const pbBtn = document.getElementById("incident-playbook-btn");
const pbMask = document.getElementById("pb-mask");
const pbServiceList = document.getElementById("pb-service-list");
const pbForm = document.getElementById("pb-form");
const pbError = document.getElementById("pb-error");
const pbAddService = document.getElementById("pb-add-service");
const pbSave = document.getElementById("pb-save");
const pbCancel = document.getElementById("pb-cancel");
const pbClose = document.getElementById("pb-close");
let playbooks = {};
let pbCurrent = "host";

function pbDefaults() {
  return {
    host: { service: "host", logs: ["journalctl -p err -n 200 --no-pager"], upstreams: [], releaseService: "", kb: true, actions: {} },
    nginx: { service: "nginx", logs: ["journalctl -u nginx -n 200 --no-pager"], upstreams: [], releaseService: "nginx", kb: true, actions: {} },
  };
}

function pbErrorMsg(msg) { if (pbError) pbError.textContent = msg || ""; }

function renderPbServices() {
  if (!pbServiceList) return;
  pbServiceList.innerHTML = Object.keys(playbooks).map((name) => `<div class="pb-service${name === pbCurrent ? " active" : ""}" data-pb-service="${escapeHtml(name)}">${escapeHtml(name)}</div>`).join("");
}

function pbActionRow(key, a) {
  const risk = a.risk || "medium";
  return `<div class="pb-action-row" data-pb-action="${escapeHtml(key)}">
    <input data-pb-a="key" value="${escapeHtml(key)}" title="${escapeHtml(t("pb.key"))}">
    <input data-pb-a="label" value="${escapeHtml(a.label || key)}" title="${escapeHtml(t("pb.label"))}">
    <input data-pb-a="command" value="${escapeHtml(a.command || "")}" placeholder="systemctl restart nginx" title="${escapeHtml(t("pb.command"))}">
    <select data-pb-a="risk" title="${escapeHtml(t("pb.risk"))}">
      <option value="low" ${risk === "low" ? "selected" : ""}>${escapeHtml(t("pb.riskLow"))}</option>
      <option value="medium" ${risk === "medium" ? "selected" : ""}>${escapeHtml(t("pb.riskMedium"))}</option>
      <option value="high" ${risk === "high" ? "selected" : ""}>${escapeHtml(t("pb.riskHigh"))}</option>
    </select>
    <button class="pb-action-del" data-pb-del-action title="${escapeHtml(t("pb.delete"))}">✕</button>
  </div>`;
}

function renderPbForm() {
  if (!pbForm) return;
  const name = pbCurrent;
  const pb = playbooks[name];
  if (!pb) { pbForm.innerHTML = ""; return; }
  const rows = Object.entries(pb.actions || {}).map(([key, a]) => pbActionRow(key, a)).join("");
  pbForm.innerHTML = `
    <div class="field"><label>${escapeHtml(t("pb.serviceName"))}</label><input value="${escapeHtml(name)}" disabled></div>
    <div class="field"><label>${escapeHtml(t("pb.logs"))}</label><textarea data-pb="logs">${escapeHtml((pb.logs || []).join("\n"))}</textarea></div>
    <div class="field"><label>${escapeHtml(t("pb.upstreams"))}</label><textarea data-pb="upstreams">${escapeHtml((pb.upstreams || []).join("\n"))}</textarea></div>
    <div class="field"><label>${escapeHtml(t("pb.releaseService"))}</label><input data-pb="releaseService" value="${escapeHtml(pb.releaseService || "")}"></div>
    <div class="field"><label><input type="checkbox" data-pb="kb" ${pb.kb !== false ? "checked" : ""}> ${escapeHtml(t("pb.kb"))}</label></div>
    <div class="field"><label>${escapeHtml(t("pb.actions"))}</label>
      <div class="pb-actions">
        <div class="pb-action-head"><span>${escapeHtml(t("pb.key"))}</span><span>${escapeHtml(t("pb.label"))}</span><span>${escapeHtml(t("pb.command"))}</span><span>${escapeHtml(t("pb.risk"))}</span><span></span></div>
        <div id="pb-action-rows">${rows}</div>
        <button class="btn small" id="pb-add-action">${escapeHtml(t("pb.addAction"))}</button>
      </div>
    </div>
    ${name !== "host" ? `<button class="btn small danger pb-service-del" data-pb-del-service>${escapeHtml(t("pb.deleteService"))}</button>` : ""}
  `;

  const logs = pbForm.querySelector('[data-pb="logs"]');
  logs.oninput = () => { pb.logs = logs.value.split("\n").map((s) => s.trim()).filter(Boolean); };
  const ups = pbForm.querySelector('[data-pb="upstreams"]');
  ups.oninput = () => { pb.upstreams = ups.value.split("\n").map((s) => s.trim()).filter(Boolean); };
  const release = pbForm.querySelector('[data-pb="releaseService"]');
  release.oninput = () => { pb.releaseService = release.value.trim(); };
  const kb = pbForm.querySelector('[data-pb="kb"]');
  kb.onchange = () => { pb.kb = Boolean(kb.checked); };

  pbForm.querySelectorAll("[data-pb-del-action]").forEach((btn) => {
    btn.onclick = () => {
      const row = btn.closest("[data-pb-action]");
      delete pb.actions[row.dataset.pbAction];
      renderPbForm();
    };
  });
  pbForm.querySelectorAll(".pb-action-row").forEach((row) => {
    const keyInput = row.querySelector('[data-pb-a="key"]');
    const labelInput = row.querySelector('[data-pb-a="label"]');
    const cmdInput = row.querySelector('[data-pb-a="command"]');
    const riskInput = row.querySelector('[data-pb-a="risk"]');
    const current = () => row.dataset.pbAction;
    keyInput.onchange = () => {
      const oldKey = current();
      const next = keyInput.value.trim();
      if (!/^[A-Za-z0-9_-]+$/.test(next) || (next !== oldKey && pb.actions[next])) { keyInput.value = oldKey; pbErrorMsg(t("pb.invalidKey")); return; }
      pbErrorMsg("");
      const val = pb.actions[oldKey];
      delete pb.actions[oldKey];
      val.key = next;
      pb.actions[next] = val;
      row.dataset.pbAction = next;
    };
    labelInput.oninput = () => { pb.actions[current()].label = labelInput.value.trim(); };
    cmdInput.oninput = () => { pb.actions[current()].command = cmdInput.value.trim(); };
    riskInput.onchange = () => { pb.actions[current()].risk = riskInput.value; };
  });
  const addAction = pbForm.querySelector("#pb-add-action");
  if (addAction) addAction.onclick = () => {
    let n = 1;
    while (pb.actions[`action${n}`]) n++;
    pb.actions[`action${n}`] = { command: "", label: "", risk: "medium" };
    renderPbForm();
  };
  const delService = pbForm.querySelector("[data-pb-del-service]");
  if (delService) delService.onclick = () => {
    if (!confirm(t("pb.deleteConfirm").replace("{name}", name))) return;
    delete playbooks[name];
    pbCurrent = Object.keys(playbooks)[0] || "host";
    renderPbServices();
    renderPbForm();
  };
}

async function jsonOrError(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { error: res.status === 404 ? t("pb.apiMissing") : (text || `HTTP ${res.status}`) }; }
}

async function openPlaybooks() {
  pbErrorMsg("");
  let openError = "";
  try {
    const res = await fetch("api/playbooks");
    const data = await jsonOrError(res);
    if (data.error) openError = data.error;
    playbooks = { ...pbDefaults(), ...(data.playbooks || {}) };
  } catch (e) { openError = String(e); playbooks = pbDefaults(); }
  if (!playbooks[pbCurrent]) pbCurrent = Object.keys(playbooks)[0] || "host";
  renderPbServices();
  renderPbForm();
  pbErrorMsg(openError);
  pbMask.classList.add("show");
}

if (pbBtn) pbBtn.onclick = openPlaybooks;
if (pbServiceList) pbServiceList.addEventListener("click", (e) => {
  const item = e.target.closest("[data-pb-service]");
  if (!item) return;
  pbCurrent = item.dataset.pbService;
  renderPbServices();
  renderPbForm();
});
if (pbAddService) pbAddService.onclick = () => {
  const name = prompt(t("pb.servicePrompt"));
  if (!name) return;
  const n = name.trim();
  if (n !== "host" && !/^[A-Za-z0-9_.@-]+$/.test(n)) { alert(t("pb.invalidService")); return; }
  if (playbooks[n]) { alert(t("pb.serviceExists")); return; }
  playbooks[n] = { service: n, logs: [], upstreams: [], releaseService: n, kb: true, actions: {} };
  pbCurrent = n;
  renderPbServices();
  renderPbForm();
};
if (pbSave) pbSave.onclick = async () => {
  pbErrorMsg("");
  pbSave.disabled = true;
  try {
    const res = await fetch("api/playbooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playbooks }) });
    const data = await jsonOrError(res);
    if (!res.ok || data.error) { pbErrorMsg(data.error || t("op.fail")); return; }
    playbooks = data.playbooks || playbooks;
    pbMask.classList.remove("show");
    showSaveMsg(t("pb.saved"), "ok");
    if (incidentDetail && incidentMask.classList.contains("show")) openIncident(incidentDetail.id);
  } catch (e) { pbErrorMsg(String(e)); }
  finally { pbSave.disabled = false; }
};
function closePlaybooks() { pbMask.classList.remove("show"); }
if (pbCancel) pbCancel.onclick = closePlaybooks;
if (pbClose) pbClose.onclick = closePlaybooks;
if (pbMask) pbMask.addEventListener("click", (e) => { if (e.target === pbMask) closePlaybooks(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePlaybooks(); });
