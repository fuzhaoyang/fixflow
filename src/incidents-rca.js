import { chat as defaultChat } from "./agent.js";

function extractJson(text) {
  const s = String(text || "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

export async function analyzeIncident({ config = {}, incident = {}, evidence = [], llmChat = defaultChat } = {}) {
  if (!config.apiKey || !config.baseUrl || !config.model) return null;
  const evidenceText = evidence.map((e) => `[${e.kind}] ${e.command}\n${e.output}`).join("\n\n").slice(0, 12000);
  const prompt = `请根据以下事件信息和只读取证结果做运维 RCA。

事件：
- 服务：${incident.service}
- 主机：${incident.host}
- 标题：${incident.title}
- 级别：P${incident.severity}
- 开始时间：${new Date(incident.startedAt || Date.now()).toISOString()}
- 标签：${JSON.stringify(incident.labels || {})}

证据：
${evidenceText || "（没有可用证据）"}

只输出一个 JSON 对象，不要 Markdown 代码块，不要额外文字：
{"summary":"一句话结论","rootCause":"根因分析","confidence":0.0,"evidenceRefs":["引用的证据 kind/command"],"suggestedAction":"建议动作，只描述不执行","rollback":"回滚建议，没有就写空字符串","missing":"还缺哪些信息"}`;
  try {
    const r = await llmChat({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      tools: [],
      messages: [
        { role: "system", content: "你是严谨的运维 RCA 助手。证据不足时必须明确说明，不要编造日志或发布记录。" },
        { role: "user", content: prompt },
      ],
    });
    const text = String(r?.text || "").trim();
    const parsed = extractJson(text);
    if (!parsed) {
      return {
        summary: text.slice(0, 500),
        rootCause: text.slice(0, 2000) || "待补充",
        confidence: 0,
        evidenceRefs: [],
        suggestedAction: "",
        rollback: "",
        missing: "模型未返回结构化 JSON，结论仅作参考",
        raw: text,
      };
    }
    return {
      summary: String(parsed.summary || ""),
      rootCause: String(parsed.rootCause || "待补充"),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      evidenceRefs: Array.isArray(parsed.evidenceRefs) ? parsed.evidenceRefs.map(String) : [],
      suggestedAction: String(parsed.suggestedAction || ""),
      rollback: String(parsed.rollback || ""),
      missing: String(parsed.missing || ""),
      raw: text,
    };
  } catch {
    return null;
  }
}
