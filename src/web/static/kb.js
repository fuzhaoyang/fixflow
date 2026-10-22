// ---------- 知识库接入 ----------
const kbBtn = document.getElementById("kb-btn");
const kbDot = document.getElementById("kb-dot");
const kbMask = document.getElementById("kb-mask");
const kbUrlInput = document.getElementById("kb-url");
const kbToken = document.getElementById("kb-token");
const kbTimeout = document.getElementById("kb-timeout");
const kbMiss = document.getElementById("kb-miss");
const kbStatus = document.getElementById("kb-status");
const kbTestBtn = document.getElementById("kb-test");
const kbSaveBtn = document.getElementById("kb-save");
const kbCancelBtn = document.getElementById("kb-cancel");
const kbCloseBtn = document.getElementById("kb-close");

let kbCfg = { token: "", enabled: false };

function kbSetDot(kind) {
  kbDot.classList.remove("ok", "bad");
  if (kind) kbDot.classList.add(kind);
}
function kbStatusMsg(text, kind) {
  kbStatus.textContent = text || "";
  kbStatus.classList.remove("ok", "bad");
  if (kind) kbStatus.classList.add(kind);
}
function kbFill(cfg) {
  kbCfg = cfg || {};
  kbUrlInput.value = kbCfg.url || "";
  kbToken.value = "";
  kbToken.placeholder = kbCfg.token || t("kb.tokenPh");
  kbTimeout.value = kbCfg.timeout || 60;
  kbMiss.value = kbCfg.missText || "未找到相关信息";
}
async function kbLoad() {
  try {
    const res = await fetch("api/kb");
    const data = await res.json();
    kbFill(data);
    if (data.enabled) {
      const flag = localStorage.getItem("fixflow_kb_ok");
      kbSetDot(flag === "1" ? "ok" : flag === "0" ? "bad" : "");
    } else kbSetDot("");
  } catch {}
}
function kbForm() {
  return {
    enabled: true,
    url: kbUrlInput.value.trim(),
    token: kbToken.value.trim() || undefined,
    timeout: Number(kbTimeout.value) || 60,
    missText: kbMiss.value.trim() || "未找到相关信息",
  };
}
function kbShowResult(test) {
  if (test?.ok) {
    kbStatusMsg(test.miss ? t("kb.testMissOk") : t("kb.testOk"), "ok");
    kbSetDot("ok");
    localStorage.setItem("fixflow_kb_ok", "1");
  } else {
    kbStatusMsg(t("kb.testFail").replace("{e}", test?.error || t("op.fail")), "bad");
    kbSetDot("bad");
    localStorage.setItem("fixflow_kb_ok", "0");
  }
}
kbBtn.onclick = () => { kbFill(kbCfg); kbStatusMsg(""); kbMask.classList.add("show"); };
kbCancelBtn.onclick = kbCloseBtn.onclick = () => kbMask.classList.remove("show");
kbMask.addEventListener("click", (e) => { if (e.target === kbMask) kbMask.classList.remove("show"); });
kbTestBtn.onclick = async () => {
  kbTestBtn.disabled = true;
  kbStatusMsg(t("kb.testing"));
  try {
    const res = await fetch("api/kb/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kbForm()) });
    kbShowResult(await res.json());
  } catch (e) {
    kbShowResult({ ok: false, error: String(e) });
  } finally { kbTestBtn.disabled = false; }
};
kbSaveBtn.onclick = async () => {
  kbSaveBtn.disabled = true;
  kbStatusMsg(t("kb.testing"));
  try {
    const res = await fetch("api/kb", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kbForm()) });
    const data = await res.json();
    if (!res.ok || data.error) { kbShowResult({ ok: false, error: data.error || t("op.fail") }); return; }
    kbCfg = data.knowledge || kbCfg;
    kbToken.value = "";
    kbToken.placeholder = kbCfg.token || t("kb.tokenPh");
    if (data.test?.ok) kbShowResult(data.test);
    else { kbStatusMsg(t("kb.saved") + "，" + t("kb.testFail").replace("{e}", data.test?.error || t("op.fail")), "bad"); kbSetDot("bad"); }
  } catch (e) {
    kbShowResult({ ok: false, error: String(e) });
  } finally { kbSaveBtn.disabled = false; }
};
kbLoad();
