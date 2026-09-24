import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { hostname } from "node:os";
import { parseDf, parseFree } from "./health.js";
import { runCommand } from "./tools.js";
import { dayKey } from "./usage.js";

export const METRICS = {
  cpu: { name: "CPU使用率", unit: "%" },
  mem: { name: "内存使用率", unit: "%" },
  disk: { name: "磁盘使用率", unit: "%" },
  net: { name: "网络流量", unit: "Mbps" },
  sessions: { name: "TCP会话数", unit: "个" },
};
export const metricLabel = (m) => METRICS[m]?.name || m;
export const LEVEL_NAME = { 1: "紧急", 2: "严重", 3: "重要", 4: "一般", 5: "提示" };

export async function sampleMetrics({ monitor, run = runCommand } = {}) {
  const out = { cpu: null, mem: null, disk: null, net: null, sessions: null };
  try { out.cpu = monitor?.cpu?.() ?? null; } catch {}
  const [free, df, ss] = await Promise.all([run("free -m"), run("df -h /"), run("ss -s 2>/dev/null")]);
  try { out.mem = parseFree(free.stdout || "").usedPct; } catch {}
  try { out.disk = parseDf(df.stdout || "").find((d) => d.mount === "/")?.usedPct ?? null; } catch {}
  try {
    const s = monitor?.net?.().samples || [];
    const last = s[s.length - 1];
    if (last) {
      let bps = 0;
      for (const v of Object.values(last.up || {})) bps += v;
      for (const v of Object.values(last.down || {})) bps += v;
      out.net = Math.round((bps * 8) / 1e6 * 100) / 100;
    }
  } catch {}
  const m = (ss.stdout || "").match(/TCP:\s*(\d+)/);
  out.sessions = m ? Number(m[1]) : null;
  return out;
}

export async function createMetricAlerts({ config, configPath, monitor, exec = runCommand, now = () => new Date(), onNotify = () => {}, aggregate = false } = {}) {
  const statePath = join(dirname(configPath), "metric-incidents.json");
  const readCfg = async () => { try { return JSON.parse(await readFile(configPath, "utf8")); } catch { return {}; } };
  const writeCfg = async (patch) => { const e = await readCfg(); await writeFile(configPath, JSON.stringify({ ...e, ...patch }, null, 2)); };
  let state = { seq: 0, day: dayKey(now()), incidents: [] };
  try { state = { ...state, ...JSON.parse(await readFile(statePath, "utf8")) }; } catch {}
  const persist = async () => { await mkdir(dirname(statePath), { recursive: true }); await writeFile(statePath, JSON.stringify(state, null, 2)).catch(() => {}); };
  const breachSince = new Map();
  const pending = [];

  const list = async () => (await readCfg()).metricAlerts || [];
  const save = async (rules) => { await writeCfg({ metricAlerts: rules }); };
  const incidents = () => state.incidents;
  const activeOf = (ruleId) => state.incidents.find((x) => x.ruleId === ruleId && x.state !== "resolved");
  const nextId = () => {
    const d = dayKey(now());
    if (state.day !== d) { state.day = d; state.seq = 0; }
    state.seq += 1;
    return `EVT-${d.replace(/-/g, "")}-${String(state.seq).padStart(3, "0")}`;
  };

  const hit = (rule, v) => v != null && (rule.op === "<=" ? v <= rule.threshold : v >= rule.threshold);

  async function tick() {
    const rules = await list();
    const values = await sampleMetrics({ monitor, run: exec });
    const t = now().getTime();
    const host = hostname();
    for (const r of rules) {
      if (!r.enabled) continue;
      const v = values[r.metric];
      const inc = activeOf(r.id);
      if (hit(r, v)) {
        if (!inc) {
          if (!breachSince.get(r.id)) breachSince.set(r.id, t);
          if (t - breachSince.get(r.id) >= (r.duration || 0) * 60000) {
            const event = { id: nextId(), ruleId: r.id, level: r.level || 3, baseLevel: r.level || 3, state: "firing", startedAt: breachSince.get(r.id), firedAt: t, peak: v, lastValue: v, samples: 1, ackedAt: 0, escalatedAt: 0, escalatedLevel: 0, recoveredAt: 0 };
            state.incidents.unshift(event);
            if (state.incidents.length > 200) state.incidents.length = 200;
            await persist();
            if (aggregate) pending.push({ event, rule: r, host, at: t });
            else onNotify({ kind: "firing", rule: r, incident: event, value: v, host });
          }
        } else {
          inc.lastValue = v;
          inc.samples += 1;
          inc.peak = r.op === "<=" ? Math.min(inc.peak, v) : Math.max(inc.peak, v);
          await persist();
        }
      } else {
        breachSince.delete(r.id);
        if (inc) {
          inc.state = "resolved";
          inc.recoveredAt = t;
          await persist();
          onNotify({ kind: "recovery", rule: r, incident: inc, value: v, host });
        }
      }
    }

    for (const inc of state.incidents) {
      if (inc.state !== "firing") continue;
      const rule = rules.find((x) => x.id === inc.ruleId);
      if (!rule) continue;
      const after = (rule.escalateAfter || 30) * 60000;
      const periods = Math.floor((t - (inc.firedAt || inc.startedAt)) / after);
      const target = Math.max(1, (inc.baseLevel || rule.level || 3) - periods);
      if (target < inc.level) {
        inc.level = target;
        inc.escalatedAt = t;
        inc.escalatedLevel = target;
        await persist();
        onNotify({ kind: "escalation", rule, incident: inc, value: inc.lastValue, host });
      }
    }

    if (aggregate && pending.length) {
      const cutoff = t - 5 * 60000;
      const byHost = new Map();
      for (const p of pending.filter((x) => x.at >= cutoff)) {
        if (!byHost.has(p.host)) byHost.set(p.host, []);
        byHost.get(p.host).push(p);
      }
      for (const [h, group] of byHost) {
        if (group.length >= 2) {
          onNotify({ kind: "aggregate", host: h, events: group.map((g) => ({ rule: g.rule, incident: g.event, value: g.event.lastValue })) });
          for (const g of group) pending.splice(pending.indexOf(g), 1);
        } else if (t - group[0].at >= 60000) {
          const g = group[0];
          onNotify({ kind: "firing", rule: g.rule, incident: g.event, value: g.event.lastValue, host: h });
          pending.splice(pending.indexOf(g), 1);
        }
      }
    }
  }

  const ack = async (id) => {
    const inc = state.incidents.find((x) => x.id === id);
    if (!inc) return { ok: false, error: "事件不存在" };
    inc.state = "ack";
    inc.ackedAt = now().getTime();
    await persist();
    return { ok: true };
  };

  const runRule = async () => { await tick(); return { ok: true }; };

  const settings = async () => { const c = await readCfg(); return { panelBaseUrl: c.panelBaseUrl || "", webhook: c.metricAlertWebhook || "" }; };
  const saveSettings = async (s = {}) => {
    const patch = {};
    if (s.panelBaseUrl !== undefined) patch.panelBaseUrl = String(s.panelBaseUrl);
    if (s.webhook !== undefined) patch.metricAlertWebhook = String(s.webhook);
    await writeCfg(patch);
  };

  return { list, save, incidents, tick, ack, runRule, settings, saveSettings };
}

const LEVEL_TIME = { 1: "≤15 分钟", 2: "≤30 分钟", 3: "≤60 分钟", 4: "≤4 小时", 5: "≤24 小时" };
const ADVICE = {
  cpu: ["检查是否存在异常流量或慢查询", "用 top/htop 定位高 CPU 进程", "必要时扩容或优化代码性能"],
  mem: ["用 top/ps 检查内存占用最高的进程", "排查内存泄漏", "必要时扩容或重启异常服务"],
  disk: ["清理旧日志/临时文件", "检查大文件占用", "必要时扩容磁盘"],
  net: ["检查异常流量来源", "排查是否被攻击或流量突增", "确认带宽上限"],
  sessions: ["检查连接数突增来源", "排查连接泄漏或慢查询", "调整连接池/内核参数"],
};
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pad2 = (n) => String(n).padStart(2, "0");
const fmtLocal = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; };
const durMin = (ms) => `${Math.max(1, Math.round(ms / 60000))} 分钟`;
const row = (k, v) => (v ? `<tr><td style="border:1px solid #e5e7eb;background:#f9fafb;padding:5px 9px;white-space:nowrap">${k}</td><td style="border:1px solid #e5e7eb;padding:5px 9px">${esc(v)}</td></tr>` : "");

export function buildAlertEmail(kind, { rule, incident, value, host, panelBaseUrl = "", support = "", now = () => new Date(), events, rootCause }) {
  if (kind === "aggregate") {
    const evs = events || [];
    const n = evs.length;
    const earliest = Math.min(...evs.map((e) => e.incident.startedAt));
    const maxLevel = Math.min(...evs.map((e) => e.incident.level || e.rule.level || 3));
    const subject = `[聚合告警] ${host} 发生${n}条告警 - ${fmtLocal(earliest)}`;
    const rows = evs.map((e) => `<tr><td style="border:1px solid #e5e7eb;padding:5px 9px">P${e.incident.level || e.rule.level}</td><td style="border:1px solid #e5e7eb;padding:5px 9px">${esc(metricLabel(e.rule.metric))}</td><td style="border:1px solid #e5e7eb;padding:5px 9px">${esc(e.value)}${esc(METRICS[e.rule.metric]?.unit || "")}</td><td style="border:1px solid #e5e7eb;padding:5px 9px">${esc(e.rule.name)}</td></tr>`).join("");
    const svc = [...new Set(evs.map((e) => e.rule.service).filter(Boolean))].join(", ") || "—";
    const html = `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.7;max-width:760px">
      <div style="border-left:4px solid #dc2626;padding:8px 12px;background:#f9fafb;margin-bottom:12px">
        <div style="font-weight:700;color:#dc2626">聚合告警 · 最高 P${maxLevel} ${LEVEL_NAME[maxLevel]} · 共 ${n} 条</div>
        <div style="color:#6b7280;font-size:12px">主机 ${esc(host)} · 涉及服务 ${esc(svc)}</div>
      </div>
      <h3 style="font-size:14px;margin:14px 0 6px">告警列表</h3>
      <table style="border-collapse:collapse;font-size:13px;width:100%"><thead><tr><th style="border:1px solid #e5e7eb;background:#f9fafb;padding:5px 9px;text-align:left">级别</th><th style="border:1px solid #e5e7eb;background:#f9fafb;padding:5px 9px;text-align:left">指标</th><th style="border:1px solid #e5e7eb;background:#f9fafb;padding:5px 9px;text-align:left">当前值</th><th style="border:1px solid #e5e7eb;background:#f9fafb;padding:5px 9px;text-align:left">规则</th></tr></thead><tbody>${rows}</tbody></table>
      <h3 style="font-size:14px;margin:14px 0 6px">根因推测</h3>
      <p style="margin:8px 0">${esc(rootCause || "（AI 分析不可用）")}</p>
      <h3 style="font-size:14px;margin:14px 0 6px">处理优先级建议</h3>
      <ol style="margin:6px 0;padding-left:22px">${[...evs].sort((a, b) => (a.incident.level || 9) - (b.incident.level || 9)).map((e) => `<li style="margin:3px 0">优先处理 P${e.incident.level || e.rule.level} ${esc(metricLabel(e.rule.metric))}（${esc(e.rule.name)}）</li>`).join("")}</ol>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:14px 0">
      <div style="color:#9ca3af;font-size:12px">本邮件由智能运维助手自动发送，请勿回复。</div>
    </div>`;
    return { subject, html };
  }
  const nowDate = typeof now === "function" ? now() : now;
  const metric = metricLabel(rule.metric);
  const unit = METRICS[rule.metric]?.unit || "";
  const baseLevel = incident.level || rule.level || 3;
  const lvl = kind === "escalation" ? (incident.escalatedLevel || Math.max(1, baseLevel - 1)) : baseLevel;
  const lvlName = LEVEL_NAME[lvl];
  const val = `${value}${unit}`;
  let subject;
  if (kind === "firing") subject = `[P${lvl}-${lvlName}] ${host} ${metric}告警 - ${val}（持续${rule.duration}分钟）`;
  else if (kind === "recovery") subject = `[恢复] ${host} ${metric}已恢复 - ${fmtLocal(incident.recoveredAt)}`;
  else subject = `[升级-P${lvl}] ${host} ${metric}告警未处理 - 已持续${durMin(nowDate.getTime() - incident.startedAt)}`;

  const lvlColor = { 1: "#dc2626", 2: "#ea580c", 3: "#d97706", 4: "#2563eb", 5: "#6b7280" }[lvl] || "#6b7280";
  const advice = (ADVICE[rule.metric] || []).map((a) => `<li style="margin:3px 0">${esc(a)}</li>`).join("");
  const links = [
    rule.runbookUrl ? `<a href="${esc(rule.runbookUrl)}" style="color:#2563eb">Runbook</a>` : "",
    rule.dashboardUrl ? `<a href="${esc(rule.dashboardUrl)}" style="color:#2563eb">监控面板</a>` : "",
    rule.logUrl ? `<a href="${esc(rule.logUrl)}" style="color:#2563eb">日志查询</a>` : "",
  ].filter(Boolean).join(" · ");
  const btn = (t, url) => (url ? `<a href="${esc(url)}" style="display:inline-block;margin:0 8px 8px 0;padding:8px 16px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-size:13px">${t}</a>` : "");
  const buttons = panelBaseUrl ? btn("查看详情", panelBaseUrl) + btn("认领告警", panelBaseUrl) + btn("静默告警", panelBaseUrl) + btn("立即处理", rule.runbookUrl) : btn("立即处理", rule.runbookUrl);

  const fields = [
    row("告警指标", metric),
    row("告警阈值", `${rule.op} ${rule.threshold}${unit}`),
    row("当前值", val),
    row("持续时间", kind === "recovery" ? durMin(incident.recoveredAt - incident.startedAt) : `${rule.duration} 分钟`),
    row("告警时间", new Date(incident.startedAt).toISOString()),
    row("环境", rule.env), row("服务", rule.service), row("团队", rule.team),
    row("负责人", rule.owner),
    row("事件ID", incident.id),
  ].join("");
  const recoveryExtra = kind === "recovery"
    ? row("恢复时间", fmtLocal(incident.recoveredAt)) + row("持续时长", durMin(incident.recoveredAt - incident.startedAt)) + row("峰值记录", `${incident.peak}${unit}`)
    : "";
  const escalationExtra = kind === "escalation"
    ? row("升级原因", `原负责人未在 ${rule.escalateAfter || 30} 分钟内认领`) + row("新负责人", (rule.escalateTo || []).join(", ") || "—")
    : "";

  const html = `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.7;max-width:760px">
    <div style="border-left:4px solid ${lvlColor};padding:8px 12px;background:#f9fafb;margin-bottom:12px">
      <div style="font-weight:700;color:${lvlColor}">P${lvl} ${lvlName} · 处理时效 ${LEVEL_TIME[lvl]}</div>
      <div style="color:#6b7280;font-size:12px">主机 ${esc(host)} · 指标 ${esc(metric)} · 事件 ${esc(incident.id)}</div>
    </div>
    <p style="margin:8px 0">${esc(metric)}${kind === "recovery" ? "已恢复" : "持续超阈值"}，当前值 <b>${esc(val)}</b>。</p>
    <h3 style="font-size:14px;margin:14px 0 6px">诊断信息</h3>
    <table style="border-collapse:collapse;font-size:13px;width:100%">${fields}${recoveryExtra}${escalationExtra}</table>
    <h3 style="font-size:14px;margin:14px 0 6px">处理建议</h3>
    <ul style="margin:6px 0;padding-left:22px">${advice}</ul>
    ${links ? `<p style="margin:8px 0">相关链接：${links}</p>` : ""}
    <div style="margin:14px 0">${buttons}</div>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:14px 0">
    <div style="color:#9ca3af;font-size:12px">本邮件由智能运维助手自动发送，请勿回复。${support ? ` 支持：${esc(support)}` : ""}</div>
  </div>`;
  return { subject, html };
}
