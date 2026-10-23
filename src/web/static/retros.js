// ---------- 复盘 ----------
const retroSearch = document.getElementById("retro-search");
const retroGrid = document.getElementById("retro-grid");
const retroPager = document.getElementById("retro-pager");
const retroCount = document.getElementById("retro-count");
const retroMask = document.getElementById("retro-mask");
const retroMd = document.getElementById("retro-md");
const retroDownload = document.getElementById("retro-download");
const retroClose = document.getElementById("retro-close");
const retroClose2 = document.getElementById("retro-close2");

let retroCards = [];
let retroPage = 1;
let retroQuery = "";
let pendingRetroId = null;
const RETRO_PAGE_SIZE = 20;

const retroDate = (ts) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(curLang === "en" ? "en-US" : "zh-CN", { hour12: false });
};

function retroFiltered() {
  const q = retroQuery.trim().toLowerCase();
  if (!q) return retroCards;
  return retroCards.filter((c) => [c.title, c.host, c.metricLabel, c.ruleName, c.rootCause, c.summary].join(" ").toLowerCase().includes(q));
}

function renderRetroPager(pages) {
  if (!retroPager) return;
  if (pages <= 1) { retroPager.innerHTML = ""; return; }
  retroPager.innerHTML = `<button class="btn small" data-retro-page="${retroPage - 1}" ${retroPage <= 1 ? "disabled" : ""}>‹</button><span>${retroPage}/${pages}</span><button class="btn small" data-retro-page="${retroPage + 1}" ${retroPage >= pages ? "disabled" : ""}>›</button>`;
}

function renderRetros() {
  const list = retroFiltered();
  const pages = Math.max(1, Math.ceil(list.length / RETRO_PAGE_SIZE));
  if (retroPage > pages) retroPage = pages;
  if (retroCount) retroCount.textContent = t("retro.count").replace("{n}", list.length);
  if (!list.length) {
    retroGrid.innerHTML = `<div class="retro-empty">${escapeHtml(t("retro.empty"))}</div>`;
    renderRetroPager(1);
    return;
  }
  const slice = list.slice((retroPage - 1) * RETRO_PAGE_SIZE, retroPage * RETRO_PAGE_SIZE);
  retroGrid.innerHTML = slice.map((c) => {
    const pending = c.rootCause === "待补充";
    return `<div class="retro-card" data-retro="${escapeHtml(c.id)}">
      <div class="retro-card-head"><span class="tag ${c.level <= 2 ? "bad" : "warn"}">P${escapeHtml(c.level)}</span><span class="retro-card-date">${escapeHtml(retroDate(c.recoveredAt))}</span></div>
      <div class="retro-card-title">${escapeHtml(c.title)}</div>
      <div class="retro-card-meta">${escapeHtml(c.host)} · ${escapeHtml(c.metricLabel)} · ${escapeHtml(c.durationMin)} ${escapeHtml(t("retro.minutes"))}</div>
      <div class="retro-card-summary">${escapeHtml(pending ? t("retro.pending") : c.rootCause)}</div>
      <div class="retro-card-foot">${c.ai ? `<span class="tag">${escapeHtml(t("retro.ai"))}</span>` : ""}</div>
    </div>`;
  }).join("");
  renderRetroPager(pages);
}

async function loadRetros() {
  retroGrid.innerHTML = `<div class="retro-empty">${escapeHtml(t("retro.loading"))}</div>`;
  try {
    const res = await fetch("api/retros");
    const data = await res.json();
    retroCards = data.cards || [];
  } catch { retroCards = []; }
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
if (retroClose) retroClose.onclick = closeRetroDetail;
if (retroClose2) retroClose2.onclick = closeRetroDetail;
if (retroMask) retroMask.addEventListener("click", (e) => { if (e.target === retroMask) closeRetroDetail(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeRetroDetail(); });
if (retroSearch) retroSearch.addEventListener("input", () => { retroQuery = retroSearch.value; retroPage = 1; renderRetros(); });
if (retroGrid) retroGrid.addEventListener("click", (e) => {
  const card = e.target.closest("[data-retro]");
  if (card) openRetroDetail(card.dataset.retro);
});
if (retroPager) retroPager.addEventListener("click", (e) => {
  const b = e.target.closest("[data-retro-page]");
  if (!b || b.disabled) return;
  retroPage = Number(b.dataset.retroPage) || 1;
  renderRetros();
});
if (location.hash === "#/retros") loadRetros();
