// ---------- 复盘 ----------
const retroSearch = document.getElementById("retro-search");
const retroGrid = document.getElementById("retro-grid");
const retroPager = document.getElementById("retro-pager");
const retroCount = document.getElementById("retro-count");
const retroSelectAll = document.getElementById("retro-select-all");
const retroDeleteBtn = document.getElementById("retro-delete-btn");
const retroMask = document.getElementById("retro-mask");
const retroMd = document.getElementById("retro-md");
const retroDownload = document.getElementById("retro-download");
const retroClose = document.getElementById("retro-close");
const retroClose2 = document.getElementById("retro-close2");
const retroDeleteMask = document.getElementById("retro-delete-mask");
const retroDeleteText = document.getElementById("retro-delete-text");
const retroDeletePw = document.getElementById("retro-delete-password");
const retroDeleteErr = document.getElementById("retro-delete-err");
const retroDeleteClose = document.getElementById("retro-delete-close");
const retroDeleteCancel = document.getElementById("retro-delete-cancel");
const retroDeleteConfirm = document.getElementById("retro-delete-confirm");

let retroCards = [];
let retroPage = 1;
let retroQuery = "";
let pendingRetroId = null;
let retroSelected = new Set();
let retroDeleteIds = [];
const RETRO_PAGE_SIZE = 15;
let retroPageSize = readPageSize("retros", RETRO_PAGE_SIZE);

const retroDate = (ts) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(curLang === "en" ? "en-US" : "zh-CN", { hour12: false });
};

function retroFiltered() {
  const q = retroQuery.trim().toLowerCase();
  if (!q) return retroCards;
  return retroCards.filter((c) => [c.id, c.incidentId, c.title, c.host, c.metricLabel, c.ruleName, c.rootCause, c.summary].join(" ").toLowerCase().includes(q));
}

function retroPageItems() {
  return retroFiltered().slice((retroPage - 1) * retroPageSize, retroPage * retroPageSize);
}

function updateRetroSelection(items = retroPageItems()) {
  const ids = items.map((c) => c.id);
  const selected = ids.filter((id) => retroSelected.has(id)).length;
  if (retroSelectAll) {
    retroSelectAll.checked = ids.length > 0 && selected === ids.length;
    retroSelectAll.indeterminate = selected > 0 && selected < ids.length;
  }
  if (retroDeleteBtn) {
    retroDeleteBtn.disabled = retroSelected.size === 0;
    retroDeleteBtn.textContent = t("retro.deleteSelected") + (retroSelected.size ? ` (${retroSelected.size})` : "");
  }
}

function renderRetroPager(pages, total) {
  if (!retroPager) return;
  retroPager.innerHTML = pagerHtml("retro", retroPageSize, retroPage, pages, total);
}

function renderRetros() {
  const list = retroFiltered();
  const pages = Math.max(1, Math.ceil(list.length / retroPageSize));
  if (retroPage > pages) retroPage = pages;
  if (retroPage < 1) retroPage = 1;
  if (retroCount) retroCount.textContent = `${t("retro.count").replace("{n}", list.length)} · ${t("retro.page").replace("{p}", retroPage).replace("{n}", pages)}`;
  if (!list.length) {
    retroGrid.innerHTML = `<div class="retro-empty">${escapeHtml(t("retro.empty"))}</div>`;
    if (retroPager) retroPager.innerHTML = "";
    updateRetroSelection([]);
    return;
  }
  const items = list.slice((retroPage - 1) * retroPageSize, retroPage * retroPageSize);
  retroGrid.innerHTML = items.map((c) => {
    const pending = c.rootCause === "待补充";
    return `<div class="retro-card" data-retro="${escapeHtml(c.id)}">
      <div class="retro-card-head">
        <label class="retro-check"><input type="checkbox" data-retro-select="${escapeHtml(c.id)}" ${retroSelected.has(c.id) ? "checked" : ""}></label>
        <span class="tag ${c.level <= 2 ? "bad" : "warn"}">P${escapeHtml(c.level)}</span>
        <span class="retro-card-date">${escapeHtml(retroDate(c.recoveredAt))}</span>
        <button class="btn small danger retro-del" data-retro-del="${escapeHtml(c.id)}">${escapeHtml(t("retro.delete"))}</button>
      </div>
      <div class="retro-card-title">${escapeHtml(c.title)}</div>
      <div class="retro-card-meta">${escapeHtml(c.host)} · ${escapeHtml(c.metricLabel)} · ${escapeHtml(c.durationMin)} ${escapeHtml(t("retro.minutes"))}</div>
      <div class="retro-card-summary">${escapeHtml(pending ? t("retro.pending") : c.rootCause)}</div>
      <div class="retro-card-foot">${c.ai ? `<span class="tag">${escapeHtml(t("retro.ai"))}</span>` : ""}</div>
    </div>`;
  }).join("");
  renderRetroPager(pages, list.length);
  updateRetroSelection(items);
}

async function loadRetros() {
  if (!retroCards.length) {
    if (retroPager) retroPager.innerHTML = "";
    if (retroDeleteBtn) retroDeleteBtn.disabled = true;
    retroGrid.innerHTML = listLoadingHtml(t("retro.loading"));
  }
  try {
    const res = await fetch("api/retros");
    const data = await res.json();
    retroCards = data.cards || [];
  } catch { retroCards = []; }
  const ids = new Set(retroCards.map((c) => c.id));
  retroSelected = new Set([...retroSelected].filter((id) => ids.has(id)));
  renderRetros();
  if (pendingRetroId) {
    const id = pendingRetroId;
    pendingRetroId = null;
    openRetroDetail(id);
  }
}

async function openRetroDetail(id) {
  const res = await fetch(`api/retros/${encodeURIComponent(id)}`).catch(() => null);
  const card = res ? await res.json().catch(() => ({})) : {};
  if (!card || card.error) { alert(card?.error || t("retro.notFound")); return; }
  retroMd.innerHTML = renderMarkdown(card.markdown || "");
  retroDownload.href = `api/retros/${encodeURIComponent(id)}/download`;
  retroMask.classList.add("show");
}

function openRetroById(id) {
  const alertMask = document.getElementById("alert-mask");
  if (alertMask) alertMask.classList.remove("show");
  if (location.hash === "#/retros") { openRetroDetail(id); return; }
  pendingRetroId = id;
  location.hash = "#/retros";
}

function closeRetroDetail() { retroMask.classList.remove("show"); }

function askRetroDelete(ids) {
  retroDeleteIds = ids.filter(Boolean);
  if (!retroDeleteIds.length) return;
  retroDeleteText.textContent = t("retro.deleteText").replace("{n}", retroDeleteIds.length);
  retroDeleteErr.textContent = "";
  retroDeletePw.value = "";
  retroDeleteMask.classList.add("show");
  setTimeout(() => retroDeletePw.focus(), 50);
}

async function confirmRetroDelete() {
  const password = retroDeletePw.value.trim();
  if (!password) { retroDeleteErr.textContent = t("retro.rootPwdRequired"); return; }
  retroDeleteConfirm.disabled = true;
  try {
    const res = await fetch("api/retros", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: retroDeleteIds, password }) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 403 || res.status === 400) { retroDeleteErr.textContent = data.error || t("retro.deleteFail"); return; }
    for (const id of retroDeleteIds) retroSelected.delete(id);
    retroDeleteMask.classList.remove("show");
    if (typeof showSaveMsg === "function") showSaveMsg(t("retro.deleted").replace("{n}", data.deleted ?? retroDeleteIds.length), "ok");
    await loadRetros();
  } finally {
    retroDeleteConfirm.disabled = false;
  }
}

if (retroClose) retroClose.onclick = closeRetroDetail;
if (retroClose2) retroClose2.onclick = closeRetroDetail;
if (retroMask) retroMask.addEventListener("click", (e) => { if (e.target === retroMask) closeRetroDetail(); });
if (retroDeleteClose) retroDeleteClose.onclick = () => retroDeleteMask.classList.remove("show");
if (retroDeleteCancel) retroDeleteCancel.onclick = () => retroDeleteMask.classList.remove("show");
if (retroDeleteConfirm) retroDeleteConfirm.onclick = confirmRetroDelete;
if (retroDeletePw) retroDeletePw.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); confirmRetroDelete(); } });
if (retroDeleteMask) retroDeleteMask.addEventListener("click", (e) => { if (e.target === retroDeleteMask) retroDeleteMask.classList.remove("show"); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeRetroDetail(); retroDeleteMask?.classList.remove("show"); } });
if (retroSearch) retroSearch.addEventListener("input", () => { retroQuery = retroSearch.value; retroPage = 1; renderRetros(); });
if (retroGrid) retroGrid.addEventListener("click", (e) => {
  const del = e.target.closest("[data-retro-del]");
  if (del) { e.stopPropagation(); askRetroDelete([del.dataset.retroDel]); return; }
  const cb = e.target.closest("[data-retro-select]");
  if (cb) {
    e.stopPropagation();
    if (cb.checked) retroSelected.add(cb.dataset.retroSelect); else retroSelected.delete(cb.dataset.retroSelect);
    updateRetroSelection();
    return;
  }
  const card = e.target.closest("[data-retro]");
  if (card) openRetroDetail(card.dataset.retro);
});
if (retroSelectAll) retroSelectAll.addEventListener("change", () => {
  const ids = retroPageItems().map((c) => c.id);
  for (const id of ids) { if (retroSelectAll.checked) retroSelected.add(id); else retroSelected.delete(id); }
  renderRetros();
});
if (retroDeleteBtn) retroDeleteBtn.onclick = () => askRetroDelete([...retroSelected]);
if (retroPager) retroPager.addEventListener("click", (e) => {
  const b = e.target.closest("[data-retro-page]");
  if (!b || b.disabled) return;
  retroPage = Number(b.dataset.retroPage) || 1;
  renderRetros();
});
if (retroPager) retroPager.addEventListener("change", (e) => {
  if (!e.target.matches("[data-retro-size]")) return;
  retroPageSize = Number(e.target.value) || RETRO_PAGE_SIZE;
  savePageSize("retros", retroPageSize);
  retroPage = 1;
  renderRetros();
});
if (retroPager) retroPager.addEventListener("keydown", (e) => {
  const input = e.target.closest("[data-retro-jump]");
  if (!input || e.key !== "Enter") return;
  e.preventDefault();
  const max = Math.max(1, Number(input.max) || 1);
  const n = parseInt(input.value, 10);
  retroPage = Math.min(max, Math.max(1, Number.isFinite(n) ? n : 1));
  renderRetros();
});
if (location.hash === "#/retros") loadRetros();
