// ---------- 文件管理器 ----------
// ---------- 文件管理器 ----------
const fsTree = document.getElementById("fs-tree");
const fsTbody = document.getElementById("fs-tbody");
const fsEditMask = document.getElementById("fs-edit-mask");
const fsEditContent = document.getElementById("fs-edit-content");
const fsNewdir = document.getElementById("fs-newdir");
const fsUploadBtn = document.getElementById("fs-upload-btn");
const fsFile = document.getElementById("fs-file");
const fsUpEl = document.getElementById("fs-upload-progress");
const fsUpText = document.getElementById("fs-up-text");
const fsUpPct = document.getElementById("fs-up-pct");
const fsUpBar = document.getElementById("fs-up-bar");
const fsUpCancel = document.getElementById("fs-up-cancel");
let fsUpCancelCb = null;
function fsUploadProgressStart(count, onCancel) {
  fsUpCancelCb = onCancel;
  fsUpText.textContent = t("fs.uploading").replace("{n}", count);
  fsUpPct.textContent = "0%";
  fsUpBar.style.width = "0%";
  fsUpEl.classList.add("show");
}
function fsUploadProgressUpdate(loaded, total, index, count, name) {
  const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  fsUpText.textContent = `${index}/${count} · ${name}`;
  fsUpPct.textContent = pct + "%";
  fsUpBar.style.width = pct + "%";
}
function fsUploadProgressEnd() {
  fsUpEl.classList.remove("show");
  fsUpCancelCb = null;
}
fsUpCancel.onclick = () => { if (fsUpCancelCb) fsUpCancelCb(); };
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
const FS_MAX_FILES = 50;
const FS_MAX_FILE = 50 * 1024 * 1024;
const FS_MAX_BATCH = 200 * 1024 * 1024;
const joinPath = (a, b) => (a === "/" ? "/" + b : a + "/" + b);

function fsFileType(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["txt", "log", "conf", "cfg", "ini", "json", "md", "yml", "yaml", "sh", "py", "js", "html", "css", "xml", "sql"].includes(ext)) return t("fs.text");
  if (["tgz", "gz", "zip", "tar", "rar", "7z", "bz2"].includes(ext)) return t("fs.archive");
  if (["exe", "bin", "so", "dll"].includes(ext)) return t("fs.binary");
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(ext)) return t("fs.image");
  return t("fs.file");
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
  return res ? await res.json() : { error: t("fs.unreachable") };
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
    return `<div class="fs-tree-item" data-path="${escapeHtml(path)}" style="padding-left:${depth * 14 + 6}px"><span class="arrow"></span>${icon("folder")}<span>${escapeHtml(name)}</span></div>`;
  }
  const arrow = st.dirs.length ? (st.expanded ? "▼" : "▶") : "";
  let html = `<div class="fs-tree-item${path === fsPath ? " sel" : ""}" data-path="${escapeHtml(path)}" style="padding-left:${depth * 14 + 6}px"><span class="arrow">${arrow}</span>${icon("folder")}<span>${escapeHtml(name)}</span></div>`;
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
  fsPath = abs;
  fsRenderTree();
  fsLoadList(abs);
}
function fsTermCd(path) {
  if (!terminal || !path) return;
  const q = "'" + String(path).replace(/'/g, `'\\''`) + "'";
  fetch("api/term/input", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: `cd ${q}\r` }) });
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
    const sel = fsSel && fsSel.name === it.name ? " sel" : "";
    const size = it.isDir ? "—" : fsFmtSize(it.size);
    const mtime = (it.mtime || "").replace("T", " ").slice(0, 16);
    return `<tr class="fs-row${sel}" data-name="${escapeHtml(it.name)}"><td>${it.isDir ? icon("folder") : icon("file")} ${escapeHtml(it.name)}</td><td>${size}</td><td>${it.isDir ? t("fs.dir") : it.isSymlink ? t("fs.symlink") : fsFileType(it.name)}</td><td>${mtime}</td><td>${escapeHtml(it.mode)}</td><td>${escapeHtml(it.user)}/${escapeHtml(it.group)}</td></tr>`;
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
async function fsRefresh() {
  delete fsTreeState[fsPath];
  const st = await fsEnsureTree(fsPath);
  st.expanded = true;
  fsRenderTree();
  fsLoadList(fsPath);
}
function fsUpdateButtons() {
  const has = !!fsSel;
  const isFile = has && !fsSel.isDir;
  fsDownloadBtn.disabled = !isFile;
  fsEditBtn.disabled = !isFile;
  fsRenameBtn.disabled = !has;
  fsDeleteBtn.disabled = !has;
}
let fsLastNav = 0;
async function fsEnterDir(path) {
  fsLastNav = Date.now();
  await fsRevealPath(path);
  fsTermCd(path);
}
let fsCtxEl = null;
function fsHideCtx() { if (fsCtxEl) { fsCtxEl.remove(); fsCtxEl = null; } }
function fsRenameItem(it, path) {
  if (!it) return;
  if (!path) path = joinPath(fsPath, it.name);
  const name = prompt(t("fs.renamePrompt"), it.name);
  if (!name || !name.trim()) return;
  fsAskPassword(t("fs.renameTitle"), t("fs.renameText").replace("{old}", it.name).replace("{new}", name.trim()), { path, newName: name.trim() }, "rename");
}
function fsDeleteItem(it, path) {
  if (!it) return;
  if (!path) path = joinPath(fsPath, it.name);
  fsAskPassword(t("fs.deleteTitle"), t("fs.deleteText").replace("{name}", it.name).replace("{note}", it.isDir ? t("fs.dirRecursive") : ""), { path }, "delete");
}
function fsCtxAction(act, it, path) {
  if (act === "open") return fsEnterDir(path);
  if (act === "rename") return fsRenameItem(it, path);
  if (act === "delete") return fsDeleteItem(it, path);
}
function fsShowCtx(x, y, it, path) {
  fsHideCtx();
  const el = document.createElement("div");
  el.className = "fs-ctx";
  const add = (act, label, danger) => {
    const d = document.createElement("div");
    d.className = "fs-ctx-item" + (danger ? " danger" : "");
    d.textContent = label;
    d.onclick = (ev) => { ev.stopPropagation(); fsHideCtx(); fsCtxAction(act, it, path); };
    el.appendChild(d);
  };
  if (it.isDir) add("open", t("fs.open"));
  add("rename", t("fs.rename"));
  add("delete", t("fs.delete"), true);
  el.style.visibility = "hidden";
  document.body.appendChild(el);
  const r = el.getBoundingClientRect();
  el.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 8)) + "px";
  el.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 8)) + "px";
  el.style.visibility = "";
  fsCtxEl = el;
}
document.addEventListener("click", (e) => { if (fsCtxEl && !fsCtxEl.contains(e.target)) fsHideCtx(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fsHideCtx(); });
window.addEventListener("resize", fsHideCtx);
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
    fsPath = path;
    fsRenderTree();
    fsLoadList(path);
    fsTermCd(path);
  }
});
fsTbody.addEventListener("click", (e) => {
  if (e.detail > 1) return;
  const row = e.target.closest(".fs-row");
  if (!row) return;
  const it = fsItems.find((i) => i.name === row.dataset.name);
  if (!it) return;
  if (it.isDir) { fsEnterDir(joinPath(fsPath, it.name)); return; }
  fsSel = it;
  fsRenderList();
  fsUpdateButtons();
});
fsTbody.addEventListener("contextmenu", (e) => {
  const row = e.target.closest(".fs-row");
  if (!row) return;
  e.preventDefault();
  const it = fsItems.find((i) => i.name === row.dataset.name);
  if (!it) return;
  fsSel = it;
  fsRenderList();
  fsUpdateButtons();
  fsShowCtx(e.clientX, e.clientY, it, joinPath(fsPath, it.name));
});
fsTbody.addEventListener("dblclick", (e) => {
  if (Date.now() - fsLastNav < 500) return;
  const row = e.target.closest(".fs-row");
  if (!row) return;
  const it = fsItems.find((i) => i.name === row.dataset.name);
  if (!it || it.isDir) return;
  fsEditFile(joinPath(fsPath, it.name));
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
  const name = prompt(t("fs.mkdirPrompt"));
  if (!name || !name.trim()) return;
  fsAskPassword(t("fs.mkdirTitle"), t("fs.mkdirText").replace("{path}", fsPath).replace("{name}", name.trim()), { path: fsPath, name: name.trim() }, "mkdir");
};
fsRenameBtn.onclick = () => fsRenameItem(fsSel);
fsDeleteBtn.onclick = () => fsDeleteItem(fsSel);
fsDownloadBtn.onclick = () => {
  if (!fsSel || fsSel.isDir) return;
  const a = document.createElement("a");
  a.href = `api/fs/download?path=${encodeURIComponent(joinPath(fsPath, fsSel.name))}`;
  a.download = fsSel.name;
  a.click();
};
function fsPickFiles(files, target = fsPath) {
  if (fsUpCancelCb) return;
  const list = [...files];
  if (!list.length) return;
  if (list.length > FS_MAX_FILES) { alert(t("fs.tooMany")); return; }
  const total = list.reduce((n, f) => n + f.size, 0);
  if (total > FS_MAX_BATCH) { alert(t("fs.batchTooBig")); return; }
  const big = list.find((f) => f.size > FS_MAX_FILE);
  if (big) { alert(`${big.name}: ${t("fs.sizeTooBig")}`); return; }
  const text = list.length === 1
    ? t("fs.uploadText").replace("{name}", list[0].name).replace("{size}", fsFmtSize(list[0].size)).replace("{path}", target)
    : t("fs.uploadBatchText").replace("{n}", list.length).replace("{size}", fsFmtSize(total)).replace("{path}", target);
  fsAskPassword(t("fs.uploadTitle"), text, { path: target, files: list }, "upload");
}
fsUploadBtn.onclick = () => fsFile.click();
fsFile.addEventListener("change", () => {
  const files = [...fsFile.files];
  fsFile.value = "";
  fsPickFiles(files, fsPath);
});
[fsTree, document.querySelector(".fs-list-wrap")].forEach((el) => {
  el.addEventListener("dragover", (e) => e.preventDefault());
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    const treeItem = e.target.closest(".fs-tree-item");
    const target = treeItem ? treeItem.dataset.path : fsPath;
    fsPickFiles(files, target);
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
    document.getElementById("fs-edit-title").innerHTML = `${icon("pencil")} ${escapeHtml(path)}`;
  }
  fsEditMask.classList.add("show");
}
document.getElementById("fs-edit-cancel").onclick = () => fsEditMask.classList.remove("show");
document.getElementById("fs-edit-close").onclick = () => fsEditMask.classList.remove("show");
document.getElementById("fs-edit-save").onclick = () => {
  if (!fsEditPath) return;
  fsAskPassword(t("fs.writeTitle"), t("fs.writeText").replace("{path}", fsEditPath), { path: fsEditPath, content: fsEditContent.value }, "write");
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
let fsCollapsed = true;
function applyFsCollapsed(collapsed) {
  fsCollapsed = !!collapsed;
  termPane.classList.toggle("fs-collapsed", fsCollapsed);
  const btn = document.getElementById("fs-toggle");
  if (btn) btn.classList.toggle("active", !fsCollapsed);
  if (termOpen) setTimeout(fitTerminal, 60);
}
document.getElementById("fs-toggle").onclick = () => {
  applyFsCollapsed(!fsCollapsed);
  fetch("api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fsCollapsed }) }).catch(() => {});
};
document.getElementById("fs-close").onclick = () => {
  applyFsCollapsed(true);
  fetch("api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fsCollapsed }) }).catch(() => {});
};
window.addEventListener("resize", () => { if (termOpen) fitTerminal(); });
const termLogMask = document.getElementById("term-log-mask");
let termRecs = [];
let termPage = 0;
let termSearch = "";
let termUserFilter = "";
let termRangeFilter = "all";
const TERM_PAGE_SIZE = 50;

function termIsDanger(cmd) {
  const words = String(cmd || "").trim().split(/\s+/);
  const head = (words[0] || "").toLowerCase();
  if (/^(rm|rmdir|mkfs|mkfs\.\w+|dd|reboot|shutdown|poweroff|halt|pkill|killall|shred|wipefs|mkpart|fdisk|truncate|pvremove|lvremove|vgremove)$/.test(head)) return true;
  if (head === "systemctl") return /\b(stop|disable|mask|reset-failed)\b/.test(String(cmd));
  if (head === "service") return /\b(stop|restart|reload|force-stop)\b/.test(String(cmd));
  if (head === "apt" || head === "apt-get") return /\b(remove|purge|autoremove)\b/.test(String(cmd));
  if (head === "yum" || head === "dnf") return /\b(remove|erase)\b/.test(String(cmd));
  if (head === "dpkg") return /(^|\s)(-r|--remove|-P|--purge)(\s|$)/.test(String(cmd));
  if (head === "kill") return true;
  if (head === "chmod" || head === "chown") return /-R/.test(String(cmd)) && /(777|666|nobody)/.test(String(cmd));
  return false;
}

function termFiltered() {
  const kw = termSearch.trim().toLowerCase();
  const now = Date.now();
  return (termRecs || []).filter((r) => {
    if (kw && !String(r.command || "").toLowerCase().includes(kw)) return false;
    if (termUserFilter && r.user !== termUserFilter) return false;
    const t = new Date(r.time).getTime();
    if (!Number.isFinite(t)) return termRangeFilter === "all";
    if (termRangeFilter === "today") { const d = new Date(r.time); if (d.toDateString() !== new Date().toDateString()) return false; }
    else if (termRangeFilter === "7d" && now - t > 7 * 864e5) return false;
    else if (termRangeFilter === "30d" && now - t > 30 * 864e5) return false;
    return true;
  });
}

function renderTermLog() {
  const box = document.getElementById("term-log-body");
  const filtered = termFiltered();
  const total = Math.max(1, Math.ceil(filtered.length / TERM_PAGE_SIZE));
  if (termPage >= total) termPage = total - 1;
  if (!filtered.length) {
    box.innerHTML = `<pre>${t("term.noHist")}</pre>`;
  } else {
    const page = filtered.slice(termPage * TERM_PAGE_SIZE, (termPage + 1) * TERM_PAGE_SIZE);
    box.innerHTML = `<table class="svc-table"><thead><tr><th>${t("term.time")}</th><th>${t("term.user")}</th><th>${t("term.command")}</th><th style="width:44px"></th></tr></thead><tbody>${page.map((r) => {
      const danger = termIsDanger(r.command);
      return `<tr><td>${escapeHtml(r.time)}</td><td>${escapeHtml(r.user)}</td><td><code class="${danger ? "term-cmd-danger" : ""}">${escapeHtml(r.command)}</code></td><td><button class="copy-btn" data-cmd="${escapeHtml(r.command)}" title="${t("term.copy")}"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg></button></td></tr>`;
    }).join("")}</tbody></table>`;
  }
  const pagerEl = document.getElementById("term-log-pager");
  pagerEl.innerHTML = total > 1
    ? `<button class="btn small" id="term-log-prev"${termPage === 0 ? " disabled" : ""}>${t("fw.prev")}</button><span class="fw-pageinfo">${termPage + 1} / ${total} · ${filtered.length} ${t("term.records")}</span><button class="btn small" id="term-log-next"${termPage >= total - 1 ? " disabled" : ""}>${t("fw.next")}</button>`
    : "";
  document.getElementById("term-log-prev")?.addEventListener("click", () => { termPage--; renderTermLog(); });
  document.getElementById("term-log-next")?.addEventListener("click", () => { termPage++; renderTermLog(); });
}

document.getElementById("term-log").onclick = async () => {
  termLogMask.classList.add("show");
  const box = document.getElementById("term-log-body");
  box.innerHTML = `<pre>${t("fs.loading")}</pre>`;
  try {
    const res = await fetch("api/term/history");
    const data = await res.json();
    termRecs = data.records || [];
    const users = [...new Set(termRecs.map((r) => r.user).filter(Boolean))].sort();
    const userSel = document.getElementById("term-log-user");
    userSel.innerHTML = `<option value="" data-i18n="term.userAll">${t("term.userAll")}</option>` + users.map((u) => `<option>${escapeHtml(u)}</option>`).join("");
    termPage = 0;
    termSearch = ""; termUserFilter = ""; termRangeFilter = "all";
    document.getElementById("term-log-search").value = "";
    userSel.value = "";
    document.getElementById("term-log-range").value = "all";
    renderTermLog();
  } catch (e) { box.innerHTML = `<pre>${t("fs.loadFail").replace("{e}", escapeHtml(String(e)))}</pre>`; }
};
document.getElementById("term-log-close").onclick = () => termLogMask.classList.remove("show");
termLogMask.addEventListener("click", (e) => { if (e.target === termLogMask) termLogMask.classList.remove("show"); });
document.getElementById("term-log-search").oninput = (e) => { termSearch = e.target.value; termPage = 0; renderTermLog(); };
document.getElementById("term-log-user").onchange = (e) => { termUserFilter = e.target.value; termPage = 0; renderTermLog(); };
document.getElementById("term-log-range").onchange = (e) => { termRangeFilter = e.target.value; termPage = 0; renderTermLog(); };
document.getElementById("term-log-body").addEventListener("click", async (e) => {
  const btn = e.target.closest(".copy-btn");
  if (!btn) return;
  try { await navigator.clipboard.writeText(btn.dataset.cmd || ""); showSaveMsg(t("term.copied"), "ok"); } catch { showSaveMsg(t("term.copyFail"), "warn"); }
});
document.getElementById("term-log-export").onclick = () => {
  const lines = termFiltered().map((r) => `${r.time} [${r.user}] ${r.command}`);
  if (!lines.length) { showSaveMsg(t("term.noHist"), "warn"); return; }
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "term-history.txt";
  a.click();
  URL.revokeObjectURL(a.href);
};

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
      scrollLog();
    }
    else if (ev.type === "tool") { finishStreaming(); addSimpleMsg(toolSummary(ev), "tool"); }
    else if (ev.type === "confirm") {
      const riskLabel = { low: t("risk.low"), medium: t("risk.mid"), high: t("risk.high") }[ev.riskLevel] || t("risk.mid");
      const riskCls = ev.riskLevel === "high" ? "risk-high" : ev.riskLevel === "low" ? "risk-low" : "risk-mid";
      const card = document.createElement("div");
      card.className = "msg confirm";
      card.innerHTML = `
        <div class="approval-card">
          <div class="approval-head"><b>${t("risk.approval")}</b><span class="risk-badge ${riskCls}">${t("risk.label")} ${riskLabel}${ev.riskLevel === "high" ? " " + icon("warn") : ""}</span></div>
          ${ev.reason ? `<div class="approval-row"><span class="lbl">${t("risk.reason")}</span><span>${escapeHtml(ev.reason)}</span></div>` : ""}
          ${ev.impact ? `<div class="approval-row"><span class="lbl">${t("risk.impact")}</span><span>${escapeHtml(ev.impact)}</span></div>` : ""}
          <div class="approval-row"><span class="lbl">${t("risk.command")}</span><code>${escapeHtml(ev.command || "")}</code></div>
        </div>`;
      const btnRow = document.createElement("div");
      btnRow.className = "confirm-row";
      const yes = document.createElement("button");
      yes.className = "btn btn-yes small"; yes.textContent = t("proc.confirm");
      const no = document.createElement("button");
      no.className = "btn btn-no small"; no.textContent = t("risk.reject");
      const finish = (label) => {
        card.querySelector(".confirm-row")?.remove();
        const span = document.createElement("div");
        span.textContent = label;
        card.appendChild(span);
      };
      yes.onclick = () => { finish(t("risk.confirmed")); fetch("api/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ev.id, ok: true }) }); };
      no.onclick = () => { finish(t("risk.rejected")); fetch("api/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ev.id, ok: false }) }); };
      btnRow.append(yes, no);
      card.appendChild(btnRow);
      ctx.log.appendChild(card);
      scrollLog();
    } else if (ev.type === "clearRequest") {
      openClearModal();
    } else if (ev.type === "clear") {
      clearHistory();
      addSimpleMsg(t("chat.cleared"), "system", { keepWelcome: true });
    } else if (ev.type === "done") {
      finishStreaming();
      setBusy(false);
      hideTyping();
    } else if (ev.type === "aborted") {
      finishStreaming();
      setBusy(false);
      hideTyping();
      addSimpleMsg(t("chat.aborted"), "system");
    } else if (ev.type === "error") {
      finishStreaming();
      setBusy(false);
      hideTyping();
      addSimpleMsg(ev.text, "error");
    } else if (ev.type === "memAlert") {
      showMemAlert(ev.usedMB, ev.limitMB);
    } else if (ev.type === "memOk") {
      hideMemAlert();
    }
  };
}

let memAlertEl = null;
function showMemAlert(usedMB, limitMB) {
  if (memAlertEl) return;
  memAlertEl = document.createElement("div");
  memAlertEl.className = "mem-alert";
  memAlertEl.innerHTML = `<span>${t("mem.alertText").replace("{used}", usedMB).replace("{limit}", limitMB)}</span><button class="btn small">${t("mem.close")}</button>`;
  memAlertEl.querySelector("button").onclick = () => hideMemAlert();
  document.body.appendChild(memAlertEl);
}
function hideMemAlert() {
  if (memAlertEl) { memAlertEl.remove(); memAlertEl = null; }
}
