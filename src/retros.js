import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { chat as defaultChat } from "./agent.js";
import { METRICS, metricLabel, LEVEL_NAME } from "./metric-alerts.js";

const MAX_CARDS = 500;

const pad2 = (n) => String(n).padStart(2, "0");
export function fmtTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export async function readRetros(filePath) {
  try {
    const data = JSON.parse(await readFile(filePath, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

export async function writeRetros(filePath, cards) {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(cards.slice(0, MAX_CARDS), null, 2));
  await rename(tmp, filePath);
}

export async function deleteRetros({ filePath, ids = [] }) {
  const set = new Set((Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean));
  const cards = await readRetros(filePath);
  const remaining = cards.filter((c) => !set.has(c.id));
  await writeRetros(filePath, remaining);
  return { deleted: cards.length - remaining.length, cards: remaining };
}

export function retroTitle({ host, metric, level }) {
  return `[P${level}] ${host} ${metricLabel(metric)}异常复盘`;
}

export function buildRetroMarkdown(card) {
  const unit = METRICS[card.metric]?.unit || "";
  const lvl = LEVEL_NAME[card.level] || "";
  const aiNote = card.ai ? "> 以下为模型根据告警字段推测，未结合日志/发布记录，仅供参考。\n\n" : "";
  return `# ${card.title}

- 事件：${card.incidentId}
- 主机：${card.host}
- 指标：${card.metricLabel}${unit}
- 规则：${card.ruleName}
- 级别：P${card.level}${lvl ? " " + lvl : ""}
- 发生时间：${fmtTime(card.startedAt)}
- 恢复时间：${fmtTime(card.recoveredAt)}
- 持续时长：${card.durationMin} 分钟
- 峰值：${card.peak}${unit}
- 阈值：${card.op} ${card.threshold}${unit}

## 事件概要

${card.summary}

## 根因${card.ai ? "推测（AI）" : ""}

${aiNote}${card.rootCause}

## 处置

待补充。
`;
}

export function retroFilename(card) {
  const date = new Date(card.recoveredAt || card.createdAt || Date.now());
  const d = Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
  const safe = (s) => String(s || "").replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  return `复盘-${safe(card.host)}-${safe(card.metricLabel)}-${d}.md`;
}

async function speculateRootCause({ config, incident, rule, host, llmChat }) {
  if (!config?.apiKey || !config?.baseUrl || !config?.model) return "";
  const unit = METRICS[rule.metric]?.unit || "";
  const durationMin = Math.max(1, Math.round(((incident.recoveredAt || Date.now()) - (incident.startedAt || incident.firedAt || Date.now())) / 60000));
  try {
    const r = await llmChat({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      tools: [],
      messages: [
        { role: "system", content: "你是运维复盘助手。只根据用户给出的告警字段做简短根因推测，2-3 句话，明确这是推测，不要编造未提供的日志、发布记录或操作。" },
        { role: "user", content: `主机：${host}\n指标：${metricLabel(rule.metric)}${unit}\n规则：${rule.name}\n级别：P${incident.level || rule.level}\n阈值：${rule.op} ${rule.threshold}${unit}\n峰值：${incident.peak}${unit}\n持续：${durationMin} 分钟\n发生：${fmtTime(incident.startedAt || incident.firedAt)}\n恢复：${fmtTime(incident.recoveredAt)}\n\n请用简体中文给出根因推测。` },
      ],
    });
    return String(r?.text || "").trim();
  } catch {
    return "";
  }
}

let writeChain = Promise.resolve();
export function createRetroFromRecovery(opts) {
  const task = writeChain.then(() => createRetroFromRecoveryNow(opts));
  writeChain = task.then(() => {}, () => {});
  return task;
}

async function createRetroFromRecoveryNow({ filePath, incident, rule, host, config = {}, llmChat = defaultChat, now = () => new Date() }) {
  const existing = await readRetros(filePath);
  if (existing.some((c) => c.incidentId === incident.id)) return null;
  const durationMin = Math.max(1, Math.round(((incident.recoveredAt || Date.now()) - (incident.startedAt || incident.firedAt || Date.now())) / 60000));
  const unit = METRICS[rule.metric]?.unit || "";
  const rootCause = await speculateRootCause({ config, incident, rule, host, llmChat });
  const summary = `${host} 的 ${metricLabel(rule.metric)} 在 ${fmtTime(incident.startedAt || incident.firedAt)} 至 ${fmtTime(incident.recoveredAt)} 期间超过阈值（${rule.op} ${rule.threshold}${unit}），持续 ${durationMin} 分钟，峰值 ${incident.peak}${unit}，已恢复。`;
  const card = {
    id: incident.id,
    incidentId: incident.id,
    title: retroTitle({ host, metric: rule.metric, level: incident.level || rule.level || 3 }),
    host,
    metric: rule.metric,
    metricLabel: metricLabel(rule.metric),
    ruleName: rule.name,
    level: incident.level || rule.level || 3,
    startedAt: incident.startedAt || incident.firedAt || 0,
    recoveredAt: incident.recoveredAt || Date.now(),
    durationMin,
    peak: incident.peak,
    threshold: rule.threshold,
    op: rule.op,
    summary,
    rootCause: rootCause || "待补充",
    ai: Boolean(rootCause),
    createdAt: now().toISOString(),
  };
  card.markdown = buildRetroMarkdown(card);
  await writeRetros(filePath, [card, ...existing]);
  return card;
}

export function buildIncidentMarkdown(incident, card) {
  const lvl = LEVEL_NAME[card.level] || "";
  const evidence = (incident.evidence || []).map((e) => `### [${e.kind}] ${e.command}\n\n\`\`\`\n${String(e.output || "").slice(0, 3000)}\n\`\`\``).join("\n\n");
  const rca = incident.rca || {};
  const timeline = (incident.timeline || []).map((t) => `- ${fmtTime(t.ts)} ${t.text}`).join("\n");
  const auto = incident.automation;
  const autoAction = auto?.action || {};
  const autoActionText = autoAction.type === "restart_service" ? `重启 ${autoAction.service || ""}`
    : autoAction.type === "reload_service" ? `重载 ${autoAction.service || ""}`
    : autoAction.type === "run_command" ? autoAction.command || ""
    : autoAction.type === "webhook" ? `POST ${autoAction.url || ""}` : "—";
  const automation = auto ? `## 自动化\n\n- 规则：${auto.ruleName || auto.ruleId || "—"}\n- 动作：${autoActionText}\n- 结果：${auto.ok ? "成功" : "失败"}\n- 断言：${(auto.checks || []).map((c) => `${c.type}:${c.ok ? "通过" : "失败"} ${c.detail || ""}`.trim()).join("；") || "—"}\n\n` : "";
  return `# ${card.title}

- 事件：${incident.id}
- 服务：${incident.service}
- 主机：${incident.host}
- 级别：P${card.level}${lvl ? " " + lvl : ""}
- 发生时间：${fmtTime(card.startedAt)}
- 恢复时间：${fmtTime(card.recoveredAt)}
- 持续时长：${card.durationMin} 分钟
- 来源：${incident.source}

## 症状

${card.summary}

## 根因${card.ai ? "（AI）" : ""}

${card.ai ? "> 以下结论由模型根据取证结果生成，仅供参考。\n\n" : ""}${card.rootCause}

${automation}## 证据

${evidence || "暂无证据。"}

## 建议动作

${rca.suggestedAction || "待补充。"}

## 回滚建议

${rca.rollback || "无。"}

## 缺失信息

${rca.missing || "无。"}

## 时间线

${timeline || "—"}
`;
}

export function createRetroFromIncident(opts) {
  const task = writeChain.then(() => createRetroFromIncidentNow(opts));
  writeChain = task.then(() => {}, () => {});
  return task;
}

async function createRetroFromIncidentNow({ filePath, incident, now = () => new Date() }) {
  const existing = await readRetros(filePath);
  if (existing.some((c) => c.incidentId === incident.id)) return existing.find((c) => c.incidentId === incident.id);
  const startedAt = incident.startedAt || Date.now();
  const recoveredAt = incident.resolvedAt || Date.now();
  const durationMin = Math.max(1, Math.round((recoveredAt - startedAt) / 60000));
  const level = incident.severity || 3;
  const title = `[P${level}] ${incident.host || ""} ${incident.title || incident.service} 复盘`;
  const card = {
    id: incident.id,
    incidentId: incident.id,
    title,
    host: incident.host || "",
    metric: "incident",
    metricLabel: incident.service || "事件",
    ruleName: incident.title || incident.service || "",
    level,
    startedAt,
    recoveredAt,
    durationMin,
    peak: "",
    threshold: "",
    op: "",
    summary: incident.rca?.summary || incident.title || "",
    rootCause: incident.rca?.rootCause || "待补充",
    ai: Boolean(incident.rca),
    createdAt: now().toISOString(),
  };
  card.markdown = buildIncidentMarkdown(incident, card);
  await writeRetros(filePath, [card, ...existing]);
  return card;
}
