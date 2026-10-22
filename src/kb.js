const DEFAULT_KEYWORDS = [
  "服务", "进程", "端口", "日志", "磁盘", "内存", "cpu", "负载", "nginx", "docker", "容器",
  "防火墙", "证书", "ssl", "数据库", "mysql", "postgres", "redis", "mongodb", "网络", "ping",
  "502", "503", "504", "报错", "错误", "异常", "重启", "配置", "systemd", "部署", "发布",
  "备份", "权限", "目录", "文件", "接口", "请求", "超时", "连接", "集群", "k8s", "kubernetes",
  "tomcat", "java", "php", "python", "node", "性能", "监控", "告警", "故障", "排查", "修复",
  "升级", "安装", "功能", "公告", "文档", "知识库", "使用", "支持", "版本",
];
const GREETINGS = /^(你好|您好|嗨|哈喽|hi|hello|hey|谢谢|多谢|感谢|thanks|thank you|在吗|早|早安|晚安)[!！。.,，\s]*$/i;

export const DEFAULT_MISS_TEXT = "未找到相关信息";

export function normalizeKnowledge(raw = {}) {
  const timeout = Number(raw.timeout);
  const baseUrl = String(raw.baseUrl || "").trim().replace(/\/+$/, "");
  const entry = String(raw.entry || "").trim();
  const legacyUrl = baseUrl ? baseUrl + (entry ? (entry.startsWith("/") ? entry : "/" + entry) : "") : "";
  return {
    enabled: raw.enabled === true,
    url: String(raw.url || legacyUrl || "").trim(),
    token: String(raw.token || "").trim(),
    missText: String(raw.missText || DEFAULT_MISS_TEXT).trim() || DEFAULT_MISS_TEXT,
    timeout: Number.isFinite(timeout) && timeout > 0 ? Math.min(300, timeout) : 60,
    keywords: Array.isArray(raw.keywords) ? raw.keywords.map(String).map((s) => s.trim()).filter(Boolean) : DEFAULT_KEYWORDS,
  };
}

export function isOpsQuestion(text, keywords = DEFAULT_KEYWORDS) {
  const t = String(text || "").trim();
  if (t.length < 2 || GREETINGS.test(t)) return false;
  const low = t.toLowerCase();
  return keywords.some((k) => low.includes(String(k).toLowerCase()));
}

export function kbUrl(kb) {
  return String(kb?.url || "").trim();
}

export function maskToken(token) {
  const t = String(token || "");
  return t ? "••••" + t.slice(-4) : "";
}

export function normalizeSources(obj) {
  if (!obj || typeof obj !== "object") return [];
  const candidates = [];
  if (Array.isArray(obj.sources)) candidates.push(...obj.sources);
  if (Array.isArray(obj.references)) candidates.push(...obj.references);
  if (Array.isArray(obj.documents)) candidates.push(...obj.documents);
  if (Array.isArray(obj.data)) candidates.push(...obj.data);
  if (Array.isArray(obj.sources?.data)) candidates.push(...obj.sources.data);
  if (Array.isArray(obj.data?.sources)) candidates.push(...obj.data.sources);
  const out = [];
  for (const s of candidates) {
    if (!s) continue;
    if (typeof s === "string") { out.push({ title: s, url: s }); continue; }
    const url = s.url || s.link || s.href || s.source || s.metadata?.url || s.metadata?.source || "";
    const title = s.title || s.name || s.metadata?.title || s.metadata?.name || url;
    if (!url && !title) continue;
    out.push({ title: String(title), url: String(url) });
  }
  return out.filter((s, i, a) => a.findIndex((x) => (x.url || x.title) === (s.url || s.title)) === i);
}

function parseSseLines(text, onEvent) {
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try { onEvent(JSON.parse(payload)); } catch {}
  }
}

export async function queryKnowledge(kb, question, { signal, sessionId = "fixflow", fetchImpl = fetch, timeout } = {}) {
  const url = kbUrl(kb);
  if (!url) throw new Error("知识库地址未配置");
  const seconds = Number.isFinite(Number(timeout)) ? Number(timeout) : Number(kb?.timeout) || 60;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("知识库请求超时")), Math.max(1, seconds) * 1000);
  const onAbort = () => ctrl.abort(signal.reason);
  if (signal) {
    if (signal.aborted) ctrl.abort(signal.reason);
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  let answer = "", doneContent = "", sources = [], error = "";
  const onEvent = (ev) => {
    if (!ev || typeof ev !== "object") return;
    if (ev.type === "token" && ev.content != null) answer += String(ev.content);
    else if (ev.type === "done") {
      if (ev.content != null) doneContent = String(ev.content);
      const s = normalizeSources(ev);
      if (s.length) sources = s;
    } else if (ev.type === "sources" || ev.type === "source") {
      const s = normalizeSources(ev);
      if (s.length) sources = s;
    } else if (ev.type === "error") {
      error = String(ev.content || ev.message || ev.error || "知识库返回错误");
    }
  };
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": kb?.token || "", Accept: "text/event-stream" },
      body: JSON.stringify({ question: String(question), session_id: String(sessionId) }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`知识库返回 ${res.status}`);
    if (!res.body) throw new Error("知识库响应无 body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        parseSseLines(buf.slice(0, idx + 1), onEvent);
        buf = buf.slice(idx + 1);
      }
    }
    buf += decoder.decode();
    if (buf.trim()) parseSseLines(buf, onEvent);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
  if (error) throw new Error(error);
  const final = (doneContent || answer).trim();
  const miss = !final || final.includes(kb?.missText || DEFAULT_MISS_TEXT);
  return { hit: !miss, miss, answer: miss ? "" : final, sources: miss ? [] : sources };
}

export async function testKnowledge(kb, { fetchImpl = fetch, signal, timeout } = {}) {
  const seconds = timeout ?? Math.max(20, Math.min(Number(kb?.timeout) || 60, 60));
  try {
    const r = await queryKnowledge(kb, "zzzqqqxxx fixflow 连通性探测", { fetchImpl, signal, sessionId: "fixflow-test", timeout: seconds });
    return { ok: true, miss: r.miss };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export function formatKbAnswer(answer, sources, lang = "zh") {
  if (!Array.isArray(sources) || !sources.length) return answer;
  const title = lang === "en" ? "Sources" : "来源";
  return `${answer}\n\n---\n**${title}**\n${sources.map((s) => s.url ? `- [${String(s.title).replace(/]/g, "\\]")}](${s.url})` : `- ${s.title}`).join("\n")}`;
}
