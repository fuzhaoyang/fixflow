// ---------- 登录 / 设置 / 告警 / 指标告警 ----------
// ---------- 登录 / 注册 ----------
const authMask = document.getElementById("auth-mask");

// 密码可见性切换（按住显示、松开隐藏；登录 + 修改密码弹窗共用）
const setEye = (eye, show) => {
  const input = eye.parentElement.querySelector("input");
  if (!input) return;
  input.type = show ? "text" : "password";
  eye.classList.toggle("showing", show);
  eye.setAttribute("aria-label", show ? t("pwd.eyeHide") : t("pwd.eyeShow"));
};
let pressedEye = null;
document.addEventListener("mousedown", (e) => {
  const eye = e.target.closest(".pwd-eye");
  if (!eye) return;
  pressedEye = eye;
  setEye(eye, true);
});
document.addEventListener("mouseup", () => {
  if (pressedEye) { setEye(pressedEye, false); pressedEye = null; }
});
document.addEventListener("mouseleave", () => {
  if (pressedEye) { setEye(pressedEye, false); pressedEye = null; }
});
const authTitle = document.getElementById("auth-title");
const authSub = document.getElementById("auth-sub");
const authErr = document.getElementById("auth-err");
const authForm = document.getElementById("auth-form");
const authUsername = document.getElementById("auth-username");
const authPassword = document.getElementById("auth-password");
const authCaptcha = document.getElementById("auth-captcha");
const authCaptchaImg = document.getElementById("auth-captcha-img");
const authSubmit = document.getElementById("auth-submit");
const authForgotLink = document.getElementById("auth-forgot-link");
const authTip = document.getElementById("auth-tip");
const forgotMask = document.getElementById("forgot-mask");
authForgotLink.onclick = () => forgotMask.classList.add("show");
document.getElementById("forgot-close").onclick = () => forgotMask.classList.remove("show");
document.getElementById("forgot-ok").onclick = () => forgotMask.classList.remove("show");

let authMode = "login";
let authRegistered = false;

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
  authCaptchaImg.title = t("auth.captchaTip");
  if (mode === "login") {
    document.getElementById("auth-logo-text").textContent = "AI";
    authTitle.textContent = t("auth.loginTitle");
    authSub.textContent = t("auth.loginSub");
    authSubmit.textContent = t("auth.login");
    authPassword.placeholder = t("auth.pwdPh");
    authTip.innerHTML = `<button type="button" id="auth-toggle">${t("auth.noAccount")}</button>`;
  } else {
    document.getElementById("auth-logo-text").textContent = "AI";
    authTitle.textContent = t("auth.registerTitle");
    authSub.textContent = t("auth.registerSub");
    authSubmit.textContent = t("auth.register");
    authPassword.placeholder = t("auth.pwdRule");
    authTip.innerHTML = `<button type="button" id="auth-toggle">${t("auth.hasAccount")}</button>`;
  }
  document.getElementById("auth-toggle")?.addEventListener("click", () => setAuthMode(authMode === "login" ? "register" : "login", true));
  refreshCaptcha();
}

function setupAuth() {
  (async () => {
    const res = await fetch("api/status");
    const data = await res.json();
    document.getElementById("boot-mask").style.display = "none";
    if (data.loggedIn) { setUserName(data.username); authMask.style.display = "none"; initPanel(); return; }
    authRegistered = Boolean(data.registered);
    setAuthMode(data.registered ? "login" : "register", authRegistered);
    authMask.style.display = "flex";
    if (location.hash === "#/help") helpMask.classList.add("show");
  })();
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAuthErr();
    const payload = {
      username: authUsername.value.trim(),
      password: authPassword.value,
      captchaCode: authCaptcha.value.trim(),
    };
    if (authMode === "register" && !strongPwd(authPassword.value)) {
      showAuthErr(t("auth.pwdWeak"));
      return;
    }
    authSubmit.disabled = true;
    try {
      const res = await fetch("api/" + authMode, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showAuthErr(data.error || t("op.fail"));
        refreshCaptcha();
        return;
      }
      if (authMode === "register") {
        const loginRes = await fetch("api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!loginRes.ok) { setAuthMode("login", true); showAuthErr(t("auth.registerOk")); return; }
      }
      authMask.style.display = "none";
      try {
        await fetch("api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang: localStorage.getItem("fixflow_lang") || "zh", theme: localStorage.getItem("fixflow_theme") || "dark" }) });
      } catch {}
      location.reload();
    } finally {
      authSubmit.disabled = false;
    }
  });
  authCaptchaImg.addEventListener("click", refreshCaptcha);
}

// 鼠标视差已移除：登录背景场景不再随指针倾斜/位移
// ---------- 设置 ----------
const settingsMask = document.getElementById("settings-mask");
const cfgBaseUrl = document.getElementById("cfg-base-url");
const cfgApiKey = document.getElementById("cfg-api-key");
const cfgKeyHint = document.getElementById("cfg-key-hint");
const cfgModel = document.getElementById("cfg-model");
const cfgModelStatus = document.getElementById("cfg-model-status");
const cfgMemLimit = document.getElementById("cfg-mem-limit");

let currentKey = "";
let apiKeyTouched = false;
cfgApiKey.addEventListener("input", () => { apiKeyTouched = true; });

async function loadModels() {
  cfgModelStatus.textContent = t("settings.loadingModels");
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
    cfgModelStatus.textContent = t("settings.modelCount").replace("{n}", data.models.length);
  } catch (e) {
    cfgModelStatus.textContent = t("settings.loadModelsFail").replace("{msg}", e.message);
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
  cfgKeyHint.textContent = cfg.apiKey ? t("settings.keySet").replace("{key}", cfg.apiKey) : t("settings.keyUnset");
  currentKey = cfg.apiKey || "";
  cfgMemLimit.value = cfg.memLimitMB || 1024;
  settingsMask.classList.add("show");
  await loadModels();
  if (cfg.model) cfgModel.value = cfg.model;
}

settingsMask.querySelector("#cfg-cancel").onclick = () => settingsMask.classList.remove("show");
settingsMask.querySelector("#cfg-close").onclick = () => settingsMask.classList.remove("show");

let saveMsgEl = null;
function showSaveMsg(text, type) {
  if (saveMsgEl) saveMsgEl.remove();
  saveMsgEl = document.createElement("div");
  saveMsgEl.className = "save-msg" + (type === "bad" ? " bad" : "");
  saveMsgEl.innerHTML = (type ? icon(type === "bad" ? "xCircle" : "check") : "") + "<span>" + escapeHtml(text) + "</span>";
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
    else if (item.dataset.action === "password") openPwd();
  });
});
const pwdMask = document.getElementById("pwd-mask");
const strongPwd = (p) => p.length >= 8 && p.length <= 24 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9\s]/.test(p);
function openPwd() {
  for (const id of ["pwd-current", "pwd-new", "pwd-confirm"]) document.getElementById(id).value = "";
  document.getElementById("pwd-err").textContent = "";
  pwdMask.classList.add("show");
}
document.getElementById("pwd-close").onclick = () => pwdMask.classList.remove("show");
document.getElementById("pwd-cancel").onclick = () => pwdMask.classList.remove("show");
document.getElementById("pwd-save").onclick = async () => {
  const cur = document.getElementById("pwd-current").value;
  const np = document.getElementById("pwd-new").value;
  const cf = document.getElementById("pwd-confirm").value;
  const err = document.getElementById("pwd-err");
  err.textContent = "";
  if (!strongPwd(np)) { err.textContent = t("pwd.weak"); return; }
  if (np !== cf) { err.textContent = t("pwd.mismatch"); return; }
  if (np === cur) { err.textContent = t("pwd.same"); return; }
  const btn = document.getElementById("pwd-save");
  btn.disabled = true;
  try {
    const res = await fetch("api/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: cur, newPassword: np }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { err.textContent = data.error || t("pwd.fail"); return; }
    pwdMask.classList.remove("show");
    showSaveMsg(t("pwd.done"), "ok");
    setTimeout(() => location.reload(), 1200);
  } finally {
    btn.disabled = false;
  }
};
const userNameEl = document.getElementById("user-name");
function setUserName(name) {
  userNameEl.textContent = name || t("tool.account");
}

document.getElementById("logout-cancel").onclick = () => logoutMask.classList.remove("show");
document.getElementById("logout-close").onclick = () => logoutMask.classList.remove("show");
logoutMask.addEventListener("click", (e) => { if (e.target === logoutMask) logoutMask.classList.remove("show"); });
document.getElementById("logout-confirm").onclick = async () => {
  try { await fetch("api/logout", { method: "POST" }); } catch {}
  location.href = location.pathname + "?t=" + Date.now();
};

const helpMask = document.getElementById("help-mask");
document.querySelectorAll(".doc-btn").forEach((b) => b.addEventListener("click", () => { location.hash = "/help"; }));
document.getElementById("help-close").onclick = () => { location.hash = "/" + lastRoute; };

document.getElementById("help-toc-toggle").onclick = () => {
  helpMask.classList.toggle("toc-collapsed");
  localStorage.setItem("fixflow_toc", helpMask.classList.contains("toc-collapsed") ? "0" : "1");
};
if (localStorage.getItem("fixflow_toc") === "0") helpMask.classList.add("toc-collapsed");

function buildHelpToc() {
  const toc = document.getElementById("help-toc");
  const body = document.getElementById("help-body");
  if (!toc || !body) return;
  if (window.__helpTocObs) window.__helpTocObs.disconnect();
  const items = body.querySelectorAll("h3[id], h4[id]");
  let html = "";
  items.forEach((h) => {
    const cls = h.tagName === "H3" ? "toc-l1" : "toc-l2";
    html += `<button class="${cls}" data-toc="#${h.id}">${h.textContent}</button>`;
  });
  toc.innerHTML = html;
  toc.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    document.querySelector(b.dataset.toc)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  window.__helpTocObs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        toc.querySelectorAll("button.active").forEach((x) => x.classList.remove("active"));
        toc.querySelector(`[data-toc="#${e.target.id}"]`)?.classList.add("active");
      }
    });
  }, { root: body, rootMargin: "-20% 0px -70% 0px" });
  body.querySelectorAll("h3[id], h4[id]").forEach((h) => window.__helpTocObs.observe(h));
}

document.querySelectorAll("nav .group").forEach((g) => {
  g.addEventListener("click", () => {
    const collapsed = g.classList.toggle("collapsed");
    let sib = g.nextElementSibling;
    while (sib && sib.classList.contains("menu-item")) {
      sib.hidden = collapsed;
      sib = sib.nextElementSibling;
    }
  });
});

const restartMask = document.getElementById("restart-mask");
const restartConfirmBtn = document.getElementById("restart-confirm");
document.getElementById("restart-cancel").onclick = () => restartMask.classList.remove("show");
document.getElementById("restart-close").onclick = () => restartMask.classList.remove("show");
restartMask.addEventListener("click", (e) => { if (e.target === restartMask) restartMask.classList.remove("show"); });
restartConfirmBtn.onclick = () => {
  restartConfirmBtn.disabled = true;
  restartConfirmBtn.textContent = t("restart.restarting");
  fetch("api/restart", { method: "POST" })
    .then(() => {
      showSaveMsg(t("restart.triggered"), "ok");
      setTimeout(() => location.reload(), 3000);
    })
    .catch(() => {
      restartConfirmBtn.disabled = false;
      restartConfirmBtn.textContent = t("restart.confirm");
      showSaveMsg(t("restart.fail"), "bad");
    });
};

const procMask = document.getElementById("proc-mask");
function setProcPwdLabel(kind) {
  const label = procMask.querySelector("label");
  const input = document.getElementById("proc-password");
  const isFw = kind === "fw";
  label.textContent = isFw ? t("fw.rootPwdLabel") : t("proc.pwdLabel");
  input.placeholder = isFw ? t("fw.rootPwdPh") : t("proc.pwdPh");
  input.setAttribute("autocomplete", isFw ? "current-password" : "current-password");
}
let procTarget = null;
function openClearModal() {
  procTarget = { kind: "clear-history" };
  document.getElementById("proc-title").textContent = t("chat.clearTitle");
  document.getElementById("proc-text").textContent = t("chat.clearConfirm");
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("fw");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
}
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fw-close]");
  if (!btn) return;
  const row = btn.closest(".fw-risk-row");
  procTarget = { kind: "firewall", port: Number(btn.dataset.fwPort), proto: btn.dataset.fwProto, mode: row.querySelector(".fw-mode").value };
  document.getElementById("proc-title").textContent = t("fw.closeTitle");
  document.getElementById("proc-text").textContent = t("fw.closeText").replace("{port}", procTarget.port).replace("{proto}", procTarget.proto).replace("{mode}", procTarget.mode === "delete" ? t("fw.modeDelete") : t("fw.modeDeny"));
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("fw");
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
  ta.value = t("fs.loading");
  ta.readOnly = true;
  document.getElementById("nginx-conf-title").innerHTML = `${icon("fileCode")} ${escapeHtml(nginxConfPath)}`;
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
  document.getElementById("proc-title").textContent = t("nginx.saveTitle");
  document.getElementById("proc-text").textContent = t("nginx.saveText").replace("{path}", nginxConfPath);
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("proc");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
};
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-nginx-op]");
  if (!btn) return;
  const action = btn.dataset.nginxOp;
  procTarget = { kind: "nginx-op", action };
  const labels = { reload: t("nginx.opReload"), restart: t("nginx.opRestart"), start: t("nginx.opStart"), stop: t("nginx.opStop") };
  const icons = { reload: "refresh", restart: "refresh", start: "play", stop: "stop" };
  const label = labels[action] || action;
  document.getElementById("proc-title").innerHTML = `${icon(icons[action] || "wrench")} ${label} Nginx`;
  document.getElementById("proc-text").textContent = t("nginx.opText").replace("{label}", label);
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("proc");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
});
document.getElementById("proc-cancel").onclick = () => procMask.classList.remove("show");
document.getElementById("proc-close").onclick = () => procMask.classList.remove("show");
procMask.addEventListener("click", (e) => { if (e.target === procMask) procMask.classList.remove("show"); });
document.getElementById("proc-confirm").onclick = async () => {
  const errEl = document.getElementById("proc-err");
  const password = document.getElementById("proc-password").value.trim();
  if (!password) { errEl.textContent = t("proc.pwdRequired"); return; }
  errEl.textContent = "";
  const confirmBtn = document.getElementById("proc-confirm");
  confirmBtn.disabled = true;
  const kind = procTarget?.kind;
  const isFw = kind === "firewall";
  const isFwCtl = kind === "fw-control";
  const isFwBatch = kind === "fw-batch";
  const isNginxSave = kind === "nginx-save";
  const isNginxOp = kind === "nginx-op";
  const isFs = kind === "fs";
  const isSys = kind === "sys";
  const isDockerOp = kind === "docker-op";
  const isDockerPrune = kind === "docker-prune";
  const isDbTest = kind === "db-test";
  const isAclAdd = kind === "acl-add";
  const isAclDel = kind === "acl-del";
  const isSdOp = kind === "systemd-op";
  const isClearHistory = kind === "clear-history";
  const isAuditExport = kind === "audit-export";
  const isAuditClear = kind === "audit-clear";
  const isStoreInstall = kind === "store-install";
  const isStoreUninstall = kind === "store-uninstall";
  const fsOp = isFs ? procTarget.op : "";
  try {
    let res, data;
    if (isStoreInstall || isStoreUninstall) {
      procMask.classList.remove("show");
      runStoreOp(isStoreInstall ? "install" : "uninstall", procTarget.pkg, password, procTarget.version);
      return;
    }
    if (isClearHistory) {
      res = await fetch("api/history/clear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      data = await res.json();
      if (res.status === 403 || res.status === 400) { errEl.textContent = data.error || t("op.fail"); return; }
      procMask.classList.remove("show");
      return;
    }
    if (isAuditExport) {
      res = await fetch("api/panel-audit/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      data = await res.json();
      if (res.status === 403 || res.status === 400) { errEl.textContent = data.error || t("op.fail"); return; }
      procMask.classList.remove("show");
      exportAudit(data.records || []);
      return;
    }
    if (isAuditClear) {
      res = await fetch("api/panel-audit/clear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      data = await res.json();
      if (res.status === 403 || res.status === 400) { errEl.textContent = data.error || t("op.fail"); return; }
      procMask.classList.remove("show");
      auditRecords = [];
      renderAudit();
      return;
    }
    if (isFwBatch) {
      let fail = null;
      for (const it of procTarget.items) {
        const r2 = await fetch("api/firewall/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ port: it.port, proto: it.proto, mode: "deny", password }),
        });
        data = await r2.json();
        if (r2.status === 403 || r2.status === 400) { fail = data.error || t("op.fail"); break; }
        if (!data.ok) { fail = data.stderr || data.error || t("op.fail"); break; }
      }
      if (fail) { errEl.textContent = fail; return; }
      procMask.classList.remove("show");
      showSaveMsg(t("fw.batchDone").replace("{n}", procTarget.items.length), "ok");
      refreshMetrics();
      return;
    }
    if (isFs && fsOp === "upload") {
      const fd = new FormData();
      fd.append("path", procTarget.body.path);
      fd.append("password", password);
      fd.append("file", procTarget.body.file, procTarget.body.file.name);
      res = await fetch("api/fs/upload", { method: "POST", body: fd });
    } else {
      const endpoint = isFw ? "api/firewall/close" : isFwCtl ? "api/firewall/control" : isNginxSave ? "api/nginx/conf" : isNginxOp ? "api/nginx/reload" : isFs ? `api/fs/${fsOp}` : isDockerOp ? "api/docker/op" : isDockerPrune ? "api/docker/prune" : isSdOp ? "api/systemd/op" : isDbTest ? "api/db/test" : isAclAdd ? "api/acl/add" : isAclDel ? "api/acl/remove" : `api/system/${procTarget.op}`;
      const payload = isFw
        ? { port: procTarget.port, proto: procTarget.proto, mode: procTarget.mode, password }
        : isFwCtl
          ? { action: procTarget.action, password }
          : isNginxSave
            ? { path: procTarget.path, content: procTarget.content, password }
            : isNginxOp
              ? { action: procTarget.action, password }
              : isFs
                ? { ...(procTarget.body || {}), password }
                : isDockerOp
                  ? { name: procTarget.name, action: procTarget.action, password }
                  : isDockerPrune
                    ? { password }
                    : isDbTest
                      ? { id: procTarget.id, password }
                      : isSdOp
                        ? { unit: procTarget.unit, action: procTarget.action, password }
                        : isAclAdd
                          ? { list: procTarget.list, ip: procTarget.ip, comment: procTarget.comment || "", password }
                          : isAclDel
                            ? { list: procTarget.list, ip: procTarget.ip, password }
                            : { ...(procTarget.body || {}), password };
      res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      data = await res.json();
      if (res.status === 403 || res.status === 400) {
        errEl.textContent = data.error || t("op.fail");
        if (isNginxSave) document.getElementById("nginx-conf-err").textContent = data.error || "";
        return;
      }
      if (!data.ok && !isDbTest) { errEl.textContent = data.stderr || data.error || t("op.fail"); return; }
    }
    if (isNginxSave) nginxConfMask.classList.remove("show");
    if (isFs && fsOp === "write") fsEditMask.classList.remove("show");
    procMask.classList.remove("show");
    if (isNginxSave) showSaveMsg(t("nginx.saveDone"), "ok");
    if (isNginxOp) { const lb = { reload: t("nginx.opReload"), restart: t("nginx.opRestart"), start: t("nginx.opStart"), stop: t("nginx.opStop") }[procTarget.action] || procTarget.action; showSaveMsg(t("nginx.opDone").replace("{action}", lb), "ok"); }
    if (isFwCtl) showSaveMsg(t("fw.controlDone").replace("{action}", procTarget.action === "disable" ? t("fw.disableBtn") : t("fw.enableBtn")), "ok");
    if (isSys) showSaveMsg(t("sys.opDone"), "ok");
    if (isDockerOp || isDockerPrune) showSaveMsg(isDockerOp ? t("docker.opDone") : t("docker.pruneDone"), "ok");
    if (isAclAdd || isAclDel) { showSaveMsg(isAclAdd ? t("acl.addDone") : t("acl.delDone"), "ok"); loadAcl(); }
    else if (isDbTest) { runDbTest(procTarget.id, password); }
    else { if (isSdOp) showSaveMsg(t("srv.opDone"), "ok"); refreshMetrics(); }
    if (isFs) fsRefresh();
  } catch (e2) {
    errEl.textContent = String(e2);
  } finally {
    confirmBtn.disabled = false;
  }
};

// 软件商店 安装/卸载：SSE 实时进度 + 日志 + 完成后刷新列表
const storeProgressMask = document.getElementById("store-progress-mask");
const storeProgressClose = document.getElementById("store-progress-close");
const storeProgressCloseBtn = document.getElementById("store-progress-close-btn");
const storeProgressTitle = document.getElementById("store-progress-title");
const storeProgressBar = document.getElementById("store-progress-bar");
const storeProgressStatus = document.getElementById("store-progress-status");
const storeProgressLog = document.getElementById("store-progress-log");

async function runStoreOp(op, pkg, password, version) {
  const isInstall = op === "install";
  storeProgressTitle.textContent = isInstall ? t("store.installTitle") : t("store.uninstallTitle");
  storeProgressBar.className = "progress-bar indeterminate";
  storeProgressBar.style.width = "";
  storeProgressStatus.textContent = isInstall ? t("store.installing") : t("store.uninstalling");
  storeProgressStatus.className = "hint store-progress-status";
  storeProgressLog.textContent = "";
  storeProgressClose.style.display = "none";
  storeProgressCloseBtn.style.display = "none";
  storeProgressMask.classList.add("show");
  const finish = (ok, msg) => {
    storeProgressStatus.textContent = msg;
    storeProgressStatus.className = ok ? "hint store-progress-status ok" : "hint store-progress-status bad";
    if (ok) storeProgressBar.classList.remove("indeterminate");
    storeProgressBar.style.width = "100%";
    storeProgressClose.style.display = "";
    storeProgressCloseBtn.style.display = "";
    loadStore();
  };
  const appendLog = (line) => {
    while (storeProgressLog.childElementCount >= 200) storeProgressLog.firstElementChild.remove();
    const d = document.createElement("div");
    d.textContent = line;
    storeProgressLog.appendChild(d);
    storeProgressLog.scrollTop = storeProgressLog.scrollHeight;
  };
  try {
    const res = await fetch(isInstall ? "api/store/install" : "api/store/uninstall", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pkg, password, version }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      finish(false, data.error || t("op.fail"));
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
        for (const part of chunk.split("\n")) {
          if (!part.startsWith("data:")) continue;
          let ev;
          try { ev = JSON.parse(part.slice(5).trim()); } catch { continue; }
          if (!ev) continue;
          if (ev.type === "log") appendLog(ev.line || "");
          else if (ev.type === "progress") {
            storeProgressBar.classList.remove("indeterminate");
            storeProgressBar.style.width = Math.max(0, Math.min(100, Number(ev.pct))) + "%";
          } else if (ev.type === "done") {
            const base = ev.ok ? t("store.doneMsg") : (isInstall ? t("store.installErr") : t("store.uninstallErr"));
            finish(Boolean(ev.ok), ev.hint ? `${base}：${ev.hint}` : base);
            return;
          }
        }
      }
    }
    finish(false, isInstall ? t("store.installErr") : t("store.uninstallErr"));
  } catch {
    finish(false, t("op.fail"));
  }
}

storeProgressClose.onclick = () => storeProgressMask.classList.remove("show");
storeProgressCloseBtn.onclick = () => storeProgressMask.classList.remove("show");
storeProgressMask.addEventListener("click", (e) => { if (e.target === storeProgressMask) storeProgressMask.classList.remove("show"); });

// 系统操作（更新/清理/重启/关机）密码验证弹窗
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-sys-op]");
  if (!btn || btn.disabled) return;
  const op = btn.dataset.sysOp;
  const action = btn.dataset.sysAction || "";
  procTarget = { kind: "sys", op, body: op === "power" ? { action } : {} };
  const isReboot = action === "reboot";
  const titles = { update: t("sys.updateTitle"), clean: t("sys.cleanTitle"), power: isReboot ? t("sys.rebootTitle") : t("sys.shutdownTitle") };
  const texts = { update: t("sys.updateConfirm"), clean: t("sys.cleanConfirm"), power: isReboot ? t("sys.rebootConfirm") : t("sys.shutdownConfirm") };
  document.getElementById("proc-title").textContent = titles[op];
  document.getElementById("proc-text").textContent = texts[op];
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("fw");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
});

// Docker 操作 / 详情 / 日志跳转
document.addEventListener("click", (e) => {
  const op = e.target.closest("[data-docker-op]");
  if (op && !op.disabled) {
    const name = op.dataset.dockerName;
    const action = op.dataset.dockerOp;
    procTarget = { kind: "docker-op", name, action };
    const labels = { start: t("docker.start"), stop: t("docker.stop"), restart: t("docker.restart"), rm: t("docker.rm") };
    document.getElementById("proc-title").textContent = t("docker.opTitle");
    document.getElementById("proc-text").textContent = t("docker.opText").replace("{label}", labels[action] || action).replace("{name}", name);
    document.getElementById("proc-err").textContent = "";
    const pw = document.getElementById("proc-password");
    pw.value = "";
    setProcPwdLabel("fw");
    procMask.classList.add("show");
    setTimeout(() => pw.focus(), 50);
    return;
  }
  const detail = e.target.closest("[data-docker-detail]");
  if (detail) { openDockerDetail(detail.dataset.dockerDetail); return; }
  const logBtn = e.target.closest("[data-docker-log]");
  if (logBtn) { openContainerLog(logBtn.dataset.dockerLog); return; }
  if (e.target.closest("#docker-prune")) {
    procTarget = { kind: "docker-prune" };
    document.getElementById("proc-title").textContent = t("docker.prune");
    document.getElementById("proc-text").textContent = t("docker.opText").replace("{label}", t("docker.prune")).replace("{name}", "");
    document.getElementById("proc-err").textContent = "";
    const pw = document.getElementById("proc-password");
    pw.value = "";
    setProcPwdLabel("fw");
    procMask.classList.add("show");
    setTimeout(() => pw.focus(), 50);
  }
});
const dockerInfoMask = document.getElementById("docker-info-mask");
document.getElementById("docker-info-close").onclick = () => dockerInfoMask.classList.remove("show");
dockerInfoMask.addEventListener("click", (e) => { if (e.target === dockerInfoMask) dockerInfoMask.classList.remove("show"); });
const fwOpenMask = document.getElementById("fw-open-mask");document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fw-open]");
  if (!btn) return;
  document.getElementById("fw-open-port").value = "";
  document.getElementById("fw-open-proto").value = "tcp";
  document.getElementById("fw-open-from").value = "";
  document.getElementById("fw-open-password").value = "";
  document.getElementById("fw-open-err").textContent = "";
  fwOpenMask.classList.add("show");
  setTimeout(() => document.getElementById("fw-open-port").focus(), 50);
});
document.getElementById("fw-open-cancel").onclick = () => fwOpenMask.classList.remove("show");
document.getElementById("fw-open-close").onclick = () => fwOpenMask.classList.remove("show");
fwOpenMask.addEventListener("click", (e) => { if (e.target === fwOpenMask) fwOpenMask.classList.remove("show"); });
document.getElementById("fw-open-submit").onclick = async () => {
  const errEl = document.getElementById("fw-open-err");
  const port = document.getElementById("fw-open-port").value.trim();
  const proto = document.getElementById("fw-open-proto").value;
  const from = document.getElementById("fw-open-from").value.trim();
  const password = document.getElementById("fw-open-password").value.trim();
  if (!port || !/^\d+(,\d+)*$/.test(port)) { errEl.textContent = t("fw.invalidPort"); return; }
  if (from && !/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(from)) { errEl.textContent = t("fw.invalidFrom"); return; }
  if (!password) { errEl.textContent = t("proc.pwdRequired"); return; }
  errEl.textContent = "";
  const btn = document.getElementById("fw-open-submit");
  btn.disabled = true;
  try {
    const res = await fetch("api/firewall/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port, proto, from, password }),
    });
    const data = await res.json();
    if (res.status === 403 || res.status === 400 || !data.ok) { errEl.textContent = data.error || data.stderr || t("op.fail"); return; }
    fwOpenMask.classList.remove("show");
    showSaveMsg(t("fw.opened").replace("{port}", port), "ok");
    refreshMetrics();
  } catch (e2) {
    errEl.textContent = String(e2);
  } finally {
    btn.disabled = false;
  }
};

// 黑白名单：填入当前 IP
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-acl-cur]");
  if (!btn) return;
  const input = btn.closest(".acl-add").querySelector(".acl-ip");
  if (aclData?.clientIp && input) input.value = aclData.clientIp;
});
// 黑白名单：添加 / 删除（密码弹窗确认）
document.addEventListener("click", (e) => {
  const addBtn = e.target.closest("[data-acl-add]");
  if (addBtn) {
    const box = addBtn.closest(".acl-add");
    const ip = box.querySelector(".acl-ip").value.trim();
    if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(ip)) { showSaveMsg(t("acl.invalidIp"), "bad"); return; }
    procTarget = { kind: "acl-add", list: addBtn.dataset.aclAdd, ip, comment: box.querySelector(".acl-comment").value.trim() };
    const wl = addBtn.dataset.aclAdd === "white";
    document.getElementById("proc-title").textContent = wl ? t("acl.addWlTitle") : t("acl.addBlTitle");
    document.getElementById("proc-text").textContent = t("acl.addText").replace("{ip}", ip).replace("{list}", wl ? t("acl.wlTitle") : t("acl.blTitle"));
    document.getElementById("proc-err").textContent = "";
    const pw = document.getElementById("proc-password");
    pw.value = "";
    setProcPwdLabel("fw");
    procMask.classList.add("show");
    setTimeout(() => pw.focus(), 50);
    return;
  }
  const delBtn = e.target.closest("[data-acl-del]");
  if (delBtn) {
    procTarget = { kind: "acl-del", list: delBtn.dataset.aclDel, ip: delBtn.dataset.aclIp };
    document.getElementById("proc-title").textContent = delBtn.dataset.aclDel === "white" ? t("acl.delWlTitle") : t("acl.delBlTitle");
    document.getElementById("proc-text").textContent = t("acl.delText").replace("{ip}", delBtn.dataset.aclIp);
    document.getElementById("proc-err").textContent = "";
    const pw = document.getElementById("proc-password");
    pw.value = "";
    setProcPwdLabel("fw");
    procMask.classList.add("show");
    setTimeout(() => pw.focus(), 50);
  }
});

// 审计区加载
function refreshFirewallCard() {
  const card = document.querySelector(".fw-card");
  if (!card || !lastFwMetrics) return;
  const h2 = card.querySelector("h2");
  card.innerHTML = h2 ? `<h2>${h2.innerHTML}</h2>${renderFirewall(lastFwMetrics)}` : renderFirewall(lastFwMetrics);
}
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fw-page]");
  if (!btn) return;
  const kind = btn.dataset.fwPage;
  const dir = btn.dataset.fwDir;
  const len = kind === "rules" ? (lastFwMetrics?.rules?.length || 0) : kind === "ops" ? (fwOpsCache?.length || 0) : (lastFwMetrics?.riskyPorts?.length || 0);
  const total = Math.max(1, Math.ceil(len / FW_PAGE_SIZE));
  let cur;
  if (kind === "rules") cur = fwRulesPage;
  else if (kind === "ops") cur = fwOpsPage;
  else cur = fwRiskPage;
  const next = dir === "prev" ? Math.max(0, cur - 1) : Math.min(total - 1, cur + 1);
  if (kind === "rules") fwRulesPage = next;
  else if (kind === "ops") fwOpsPage = next;
  else fwRiskPage = next;
  refreshFirewallCard();
});
async function loadFwOps() {
  try {
    const res = await fetch("api/firewall/ops");
    const data = await res.json();
    fwOpsCache = Array.isArray(data.ops) ? data.ops.slice().reverse() : [];
    refreshFirewallCard();
  } catch {}
}

// 关闭一个端口（共用弹窗提交流程）
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fw-control]");
  if (!btn) return;
  const action = btn.dataset.action;
  procTarget = { kind: "fw-control", action };
  document.getElementById("proc-title").textContent = action === "disable" ? t("fw.disableTitle") : t("fw.enableTitle");
  document.getElementById("proc-text").textContent = t("fw.controlText").replace("{action}", action === "disable" ? t("fw.disableBtn") : t("fw.enableBtn"));
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("fw");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fw-batch-close]");
  if (!btn) return;
  const picked = [...document.querySelectorAll(".fw-pick:checked")];
  if (!picked.length) { showSaveMsg(t("fw.pickNone"), "warn"); return; }
  procTarget = { kind: "fw-batch", items: picked.map((p) => ({ port: Number(p.dataset.fwPort), proto: p.dataset.fwProto })) };
  document.getElementById("proc-title").textContent = t("fw.batchTitle");
  document.getElementById("proc-text").textContent = t("fw.batchText").replace("{n}", procTarget.items.length);
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("fw");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-fw-harden]");
  if (!btn) return;
  const dangerPorts = [...document.querySelectorAll(".fw-risk-row .risk-badge.risk-high")].map((el) => el.closest(".fw-risk-row")).map((row) => ({
    port: Number(row.querySelector(".fw-pick").dataset.fwPort),
    proto: row.querySelector(".fw-pick").dataset.fwProto,
  }));
  if (!dangerPorts.length) { showSaveMsg(t("fw.hardenNone"), "warn"); return; }
  procTarget = { kind: "fw-batch", items: dangerPorts };
  document.getElementById("proc-title").textContent = t("fw.hardenTitle");
  document.getElementById("proc-text").textContent = t("fw.hardenText").replace("{n}", dangerPorts.length);
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("fw");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
});

document.getElementById("cfg-save").onclick = async () => {
  const body = {
    model: cfgModel.value,
  };
  const newBaseUrl = cfgBaseUrl.value.trim();
  if (newBaseUrl) body.baseUrl = newBaseUrl;
  const newKey = cfgApiKey.value.trim();
  if (newKey) body.apiKey = newKey;
  const memLimit = Number(cfgMemLimit.value);
  if (Number.isFinite(memLimit) && memLimit > 0) body.memLimitMB = memLimit;
  const res = await fetch("api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { alert(t("op.saveFail") + "：" + (data.error || res.status)); return; }
  cfgApiKey.value = "";
  cfgKeyHint.textContent = t("settings.keySet").replace("{key}", data.apiKey);
  showSaveMsg(t("settings.saved"), "ok");
  loadModelStatus();
  setTimeout(() => settingsMask.classList.remove("show"), 2000);
};

// ---------- 告警 ----------
const alertMask = document.getElementById("alert-mask");
let alertEditId = null;
let alertListPage = 1;
let alertHistPage = 1;
let alertCache = { alerts: [], history: {}, smtp: {} };
const ALERT_PAGE_SIZE = 10;

function showLoading(text) {
  document.getElementById("loading-text").textContent = text || t("op.processing");
  document.getElementById("loading-mask").classList.add("show");
}
function hideLoading() {
  document.getElementById("loading-mask").classList.remove("show");
}

function renderPager(el, total, page, onGo) {
  const pages = Math.max(1, Math.ceil(total / ALERT_PAGE_SIZE));
  const p = Math.min(Math.max(1, page), pages);
  el.innerHTML = total > ALERT_PAGE_SIZE
    ? `<button class="btn small" data-page="${p - 1}" ${p <= 1 ? "disabled" : ""}>${t("page.prev")}</button><span>${p} / ${pages}</span><button class="btn small" data-page="${p + 1}" ${p >= pages ? "disabled" : ""}>${t("page.next")}</button>`
    : "";
  el.querySelectorAll("button[data-page]").forEach((b) => { b.onclick = () => onGo(Number(b.dataset.page)); });
}

function renderAlertList() {
  const alerts = alertCache.alerts || [];
  const list = document.getElementById("alert-list");
  if (!alerts.length) {
    list.innerHTML = `<pre style="color:var(--muted)">${escapeHtml(t("alert.none"))}</pre>`;
    renderPager(document.getElementById("alert-list-pager"), 0, 1, () => {});
    return;
  }
  const pages = Math.max(1, Math.ceil(alerts.length / ALERT_PAGE_SIZE));
  if (alertListPage > pages) alertListPage = pages;
  const slice = alerts.slice((alertListPage - 1) * ALERT_PAGE_SIZE, alertListPage * ALERT_PAGE_SIZE);
  list.innerHTML = slice.map((a) => `<div class="alert-row">
        <span class="tag ${a.enabled ? "ok" : ""}">${a.enabled ? t("ssl.enable") : t("ssl.disable")}</span>
        <div class="alert-main">
          <span class="alert-title">${escapeHtml(a.name)}</span>
          <span class="alert-sub">${t("alert.dailyFmt").replace("{t}", escapeHtml(a.time))} · ${escapeHtml((a.recipients || []).join(", "))}</span>
        </div>
        <span class="proc-ops">
          <a href="javascript:void(0)" data-alert-run="${escapeHtml(a.id)}">${t("alert.run")}</a>
          <a href="javascript:void(0)" data-alert-toggle="${escapeHtml(a.id)}" data-enabled="${a.enabled}">${a.enabled ? t("ssl.disable") : t("ssl.enable")}</a>
          <a href="javascript:void(0)" data-alert-edit="${escapeHtml(a.id)}">${t("alert.edit")}</a>
          <a href="javascript:void(0)" data-alert-del="${escapeHtml(a.id)}" class="danger">${t("ssl.del")}</a>
        </span>
      </div>`).join("");
  renderPager(document.getElementById("alert-list-pager"), alerts.length, alertListPage, (p) => { alertListPage = p; renderAlertList(); });
}

function renderAlertHist() {
  const flat = [];
  for (const a of alertCache.alerts || []) for (const h of (alertCache.history?.[a.id] || [])) flat.push({ ...h, name: a.name });
  flat.sort((x, y) => String(y.at).localeCompare(String(x.at)));
  const hist = document.getElementById("alert-hist");
  if (!flat.length) {
    hist.innerHTML = `<pre style="color:var(--muted)">${escapeHtml(t("alert.noHist"))}</pre>`;
    renderPager(document.getElementById("alert-hist-pager"), 0, 1, () => {});
    return;
  }
  const pages = Math.max(1, Math.ceil(flat.length / ALERT_PAGE_SIZE));
  if (alertHistPage > pages) alertHistPage = pages;
  const slice = flat.slice((alertHistPage - 1) * ALERT_PAGE_SIZE, alertHistPage * ALERT_PAGE_SIZE);
  hist.innerHTML = slice.map((h) => `<div class="alert-row">
        <span class="tag ${h.ok ? "ok" : "bad"}">${h.ok ? t("alert.ok") : t("alert.fail")}</span>
        <div class="alert-main">
          <span class="alert-title">${escapeHtml(h.name)}</span>
          <span class="alert-sub">${escapeHtml(h.at)} · ${escapeHtml(h.error || h.summary)}</span>
        </div>
      </div>`).join("");
  renderPager(document.getElementById("alert-hist-pager"), flat.length, alertHistPage, (p) => { alertHistPage = p; renderAlertHist(); });
}

async function refreshAlerts() {
  try {
    const res = await fetch("api/alerts");
    alertCache = await res.json();
    updateBellDot();
    document.getElementById("alert-host").value = alertCache.smtp?.host || "";
    document.getElementById("alert-port").value = alertCache.smtp?.port || "";
    document.getElementById("alert-user").value = alertCache.smtp?.user || "";
    document.getElementById("alert-from").value = alertCache.smtp?.from || "";
    renderAlertList();
    renderAlertHist();
  } catch {}
}

function switchAlertTab(tab) {
  document.querySelectorAll("#alert-tabs .seg-tab").forEach((x) => x.classList.toggle("active", x.dataset.alertTab === tab));
  document.getElementById("alert-form").style.display = tab === "form" ? "" : "none";
  document.getElementById("alert-list-wrap").style.display = tab === "list" ? "" : "none";
  document.getElementById("alert-hist-wrap").style.display = tab === "hist" ? "" : "none";
}

function resetAlertForm() {
  alertEditId = null;
  document.getElementById("alert-form-title").textContent = t("alert.formTitle");
  ["alert-name", "alert-time", "alert-recipients", "alert-instruction"].forEach((id) => { document.getElementById(id).value = ""; });
  document.getElementById("alert-form-err").textContent = "";
}

document.getElementById("alert-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-alert-tab]");
  if (!b) return;
  if (b.dataset.alertTab === "form") resetAlertForm();
  switchAlertTab(b.dataset.alertTab);
});

document.getElementById("bell-btn").onclick = () => { resetAlertForm(); refreshAlerts(); refreshMetricAlerts(); switchAlertTab("form"); alertMask.classList.add("show"); };
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
  showSaveMsg(t("alert.smtpSaved"), "ok");
  refreshAlerts();
};

document.getElementById("alert-form-cancel").onclick = () => switchAlertTab("list");

document.getElementById("alert-form-save").onclick = async () => {
  const body = {
    name: document.getElementById("alert-name").value.trim(),
    time: document.getElementById("alert-time").value,
    instruction: document.getElementById("alert-instruction").value.trim(),
    recipients: document.getElementById("alert-recipients").value.split(/[,，\s]+/).filter(Boolean),
  };
  const errEl = document.getElementById("alert-form-err");
  if (!body.name || !body.time || !body.instruction || !body.recipients.length) { errEl.textContent = t("alert.required"); return; }
  errEl.textContent = "";
  const res = await fetch("api/alerts", { method: alertEditId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(alertEditId ? { ...body, id: alertEditId } : body) });
  if (!res.ok) { errEl.textContent = ((await res.json()).error) || t("op.saveFail"); return; }
  switchAlertTab("list");
  refreshAlerts();
};

document.getElementById("alert-list").addEventListener("click", async (e) => {
  const a = e.target.closest("[data-alert-edit],[data-alert-del],[data-alert-run],[data-alert-toggle]");
  if (!a) return;
  const id = a.dataset.alertEdit || a.dataset.alertDel || a.dataset.alertRun || a.dataset.alertToggle;
  if (a.dataset.alertDel) {
    if (!confirm(t("alert.delConfirm"))) return;
    await fetch("api/alerts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    refreshAlerts();
  } else if (a.dataset.alertToggle) {
    await fetch("api/alerts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled: a.dataset.enabled === "false" }) });
    refreshAlerts();
  } else if (a.dataset.alertRun) {
    showLoading(t("alert.running"));
    try {
      const res = await fetch("api/alerts/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      showSaveMsg(res.ok ? t("alert.done") : ((await res.json()).error || t("alert.execFail")), res.ok ? "ok" : "bad");
    } finally {
      hideLoading();
      refreshAlerts();
    }
  } else if (a.dataset.alertEdit) {
    const it = (alertCache.alerts || []).find((x) => x.id === id);
    if (!it) return;
    alertEditId = id;
    document.getElementById("alert-form-title").textContent = t("alert.editTitle");
    document.getElementById("alert-name").value = it.name;
    document.getElementById("alert-time").value = it.time;
    document.getElementById("alert-recipients").value = (it.recipients || []).join(", ");
    document.getElementById("alert-instruction").value = it.instruction;
    document.getElementById("alert-form-err").textContent = "";
    switchAlertTab("form");
  }
});

// ---------- 指标告警 ----------
let maCache = { rules: [], incidents: [] };
let maRulesPage = 1;
let maIncPage = 1;
let maEditId = null;
const MA_METRIC_NAME = { cpu: "mCpu", mem: "mMem", disk: "mDisk", net: "mNet", sessions: "mSessions" };

function updateBellDot() {
  const daily = (alertCache.alerts || []).some((a) => a.enabled);
  const inc = (maCache.incidents || []).some((i) => i.state !== "resolved");
  document.getElementById("bell-dot").classList.toggle("on", daily || inc);
}

async function refreshMetricAlerts() {
  try {
    const res = await fetch("api/metric-alerts");
    maCache = await res.json();
    document.getElementById("ma-panel-url").value = maCache.panelBaseUrl || "";
    document.getElementById("ma-webhook").value = maCache.webhook || "";
    renderMaRules();
    renderMaIncidents();
    updateBellDot();
  } catch {}
}

function renderMaRules() {
  const rules = maCache.rules || [];
  const box = document.getElementById("ma-rules");
  if (!rules.length) {
    box.innerHTML = `<pre style="color:var(--muted)">${escapeHtml(t("alert.noRules"))}</pre>`;
    renderPager(document.getElementById("ma-rules-pager"), 0, 1, () => {});
    return;
  }
  const pages = Math.max(1, Math.ceil(rules.length / ALERT_PAGE_SIZE));
  if (maRulesPage > pages) maRulesPage = pages;
  const slice = rules.slice((maRulesPage - 1) * ALERT_PAGE_SIZE, maRulesPage * ALERT_PAGE_SIZE);
  box.innerHTML = slice.map((r) => `<div class="alert-row">
        <span class="tag ${r.enabled ? "ok" : ""}">${r.enabled ? t("ssl.enable") : t("ssl.disable")}</span>
        <div class="alert-main">
          <span class="alert-title">${escapeHtml(r.name)}</span>
          <span class="alert-sub">${escapeHtml(t(MA_METRIC_NAME[r.metric] || "fs.file"))} ${escapeHtml(r.op)} ${escapeHtml(r.threshold)} · ${t("alert.durationFmt").replace("{t}", escapeHtml(r.duration)).replace("{l}", escapeHtml(r.level))} · ${escapeHtml((r.recipients || []).join(", "))}</span>
        </div>
        <span class="proc-ops">
          <a href="javascript:void(0)" data-ma-toggle="${escapeHtml(r.id)}" data-enabled="${r.enabled}">${r.enabled ? t("ssl.disable") : t("ssl.enable")}</a>
          <a href="javascript:void(0)" data-ma-edit="${escapeHtml(r.id)}">${t("alert.edit")}</a>
          <a href="javascript:void(0)" data-ma-del="${escapeHtml(r.id)}" class="danger">${t("ssl.del")}</a>
        </span>
      </div>`).join("");
  renderPager(document.getElementById("ma-rules-pager"), rules.length, maRulesPage, (p) => { maRulesPage = p; renderMaRules(); });
}

function renderMaIncidents() {
  const incs = maCache.incidents || [];
  const box = document.getElementById("ma-incidents");
  if (!incs.length) {
    box.innerHTML = `<pre style="color:var(--muted)">${escapeHtml(t("alert.noIncidents"))}</pre>`;
    renderPager(document.getElementById("ma-incidents-pager"), 0, 1, () => {});
    return;
  }
  const pages = Math.max(1, Math.ceil(incs.length / ALERT_PAGE_SIZE));
  if (maIncPage > pages) maIncPage = pages;
  const slice = incs.slice((maIncPage - 1) * ALERT_PAGE_SIZE, maIncPage * ALERT_PAGE_SIZE);
  const ruleName = (id) => (maCache.rules || []).find((x) => x.id === id)?.name || id;
  box.innerHTML = slice.map((i) => `<div class="alert-row">
        <span class="tag ${i.state === "resolved" ? "ok" : i.state === "ack" ? "" : "bad"}">${i.state === "resolved" ? t("alert.resolved") : i.state === "ack" ? t("alert.ack") : t("alert.unack")}</span>
        <div class="alert-main">
          <span class="alert-title">P${escapeHtml(i.level)} ${escapeHtml(ruleName(i.ruleId))} · ${escapeHtml(i.id)}</span>
          <span class="alert-sub">${t("alert.curFmt").replace("{v}", escapeHtml(i.lastValue)).replace("{p}", escapeHtml(i.peak)).replace("{t}", escapeHtml(new Date(i.startedAt).toLocaleString()))}</span>
        </div>
        ${i.state === "firing" ? `<span class="proc-ops"><a href="javascript:void(0)" data-ma-ack="${escapeHtml(i.id)}">${t("alert.claim")}</a></span>` : ""}
      </div>`).join("");
  renderPager(document.getElementById("ma-incidents-pager"), incs.length, maIncPage, (p) => { maIncPage = p; renderMaIncidents(); });
}

document.getElementById("alert-top-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-alert-top]");
  if (!b) return;
  document.querySelectorAll("#alert-top-tabs .seg-tab").forEach((x) => x.classList.toggle("active", x === b));
  const daily = b.dataset.alertTop === "daily";
  document.getElementById("alert-daily").style.display = daily ? "" : "none";
  document.getElementById("alert-metric").style.display = daily ? "none" : "";
  if (!daily) refreshMetricAlerts();
});

document.getElementById("ma-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ma-tab]");
  if (!b) return;
  document.querySelectorAll("#ma-tabs .seg-tab").forEach((x) => x.classList.toggle("active", x === b));
  const r = b.dataset.maTab === "rules";
  document.getElementById("ma-rules-wrap").style.display = r ? "" : "none";
  document.getElementById("ma-incidents-wrap").style.display = r ? "none" : "";
});

const MA_FIELDS = ["ma-name", "ma-threshold", "ma-duration", "ma-recipients", "ma-env", "ma-service", "ma-team", "ma-owner", "ma-runbook", "ma-dashboard", "ma-log", "ma-escalate-to", "ma-escalate-after"];
document.getElementById("ma-add").onclick = () => {
  maEditId = null;
  document.getElementById("ma-form-title").textContent = t("alert.ruleTitle");
  MA_FIELDS.forEach((id) => { document.getElementById(id).value = ""; });
  document.getElementById("ma-form-err").textContent = "";
  document.getElementById("ma-form").style.display = "";
};
document.getElementById("ma-form-cancel").onclick = () => { document.getElementById("ma-form").style.display = "none"; };

document.getElementById("ma-form-save").onclick = async () => {
  const val = (id) => document.getElementById(id).value.trim();
  const body = {
    name: val("ma-name"),
    metric: document.getElementById("ma-metric").value,
    op: document.getElementById("ma-op").value,
    threshold: Number(val("ma-threshold")),
    duration: Number(val("ma-duration")) || 5,
    level: Number(document.getElementById("ma-level").value),
    recipients: val("ma-recipients").split(/[,，\s]+/).filter(Boolean),
    env: val("ma-env"), service: val("ma-service"), team: val("ma-team"), owner: val("ma-owner"),
    runbookUrl: val("ma-runbook"), dashboardUrl: val("ma-dashboard"), logUrl: val("ma-log"),
    escalateTo: val("ma-escalate-to").split(/[,，\s]+/).filter(Boolean),
    escalateAfter: Number(val("ma-escalate-after")) || 30,
  };
  const errEl = document.getElementById("ma-form-err");
  if (!body.name || !Number.isFinite(body.threshold) || !body.recipients.length) { errEl.textContent = t("alert.ruleRequired"); return; }
  errEl.textContent = "";
  const res = await fetch("api/metric-alerts", { method: maEditId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(maEditId ? { ...body, id: maEditId } : body) });
  if (!res.ok) { errEl.textContent = ((await res.json()).error) || t("op.saveFail"); return; }
  document.getElementById("ma-form").style.display = "none";
  refreshMetricAlerts();
};

document.getElementById("ma-check").onclick = async () => {
  showLoading(t("alert.sampling"));
  try {
    await fetch("api/metric-alerts/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  } finally {
    hideLoading();
    refreshMetricAlerts();
  }
};

document.getElementById("ma-settings-save").onclick = async () => {
  await fetch("api/metric-alerts/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ panelBaseUrl: document.getElementById("ma-panel-url").value.trim(), webhook: document.getElementById("ma-webhook").value.trim() }) });
  showSaveMsg(t("op.saved"), "ok");
};

document.getElementById("ma-rules").addEventListener("click", async (e) => {
  const a = e.target.closest("[data-ma-toggle],[data-ma-del],[data-ma-edit]");
  if (!a) return;
  const id = a.dataset.maToggle || a.dataset.maDel || a.dataset.maEdit;
  if (a.dataset.maDel) {
    if (!confirm(t("alert.delRuleConfirm"))) return;
    await fetch("api/metric-alerts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    refreshMetricAlerts();
  } else if (a.dataset.maToggle) {
    await fetch("api/metric-alerts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled: a.dataset.enabled === "false" }) });
    refreshMetricAlerts();
  } else if (a.dataset.maEdit) {
    const r = (maCache.rules || []).find((x) => x.id === id);
    if (!r) return;
    maEditId = id;
    document.getElementById("ma-form-title").textContent = t("alert.editRuleTitle");
    document.getElementById("ma-name").value = r.name;
    document.getElementById("ma-metric").value = r.metric;
    document.getElementById("ma-op").value = r.op;
    document.getElementById("ma-threshold").value = r.threshold;
    document.getElementById("ma-duration").value = r.duration;
    document.getElementById("ma-level").value = r.level;
    document.getElementById("ma-recipients").value = (r.recipients || []).join(", ");
    document.getElementById("ma-env").value = r.env || "";
    document.getElementById("ma-service").value = r.service || "";
    document.getElementById("ma-team").value = r.team || "";
    document.getElementById("ma-owner").value = r.owner || "";
    document.getElementById("ma-runbook").value = r.runbookUrl || "";
    document.getElementById("ma-dashboard").value = r.dashboardUrl || "";
    document.getElementById("ma-log").value = r.logUrl || "";
    document.getElementById("ma-escalate-to").value = (r.escalateTo || []).join(", ");
    document.getElementById("ma-escalate-after").value = r.escalateAfter || 30;
    document.getElementById("ma-form-err").textContent = "";
    document.getElementById("ma-form").style.display = "";
  }
});

document.getElementById("ma-incidents").addEventListener("click", async (e) => {
  const a = e.target.closest("[data-ma-ack]");
  if (!a) return;
  await fetch("api/metric-alerts/ack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.dataset.maAck }) });
  refreshMetricAlerts();
});

setupAuth();