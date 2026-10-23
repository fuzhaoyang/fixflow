import net from "node:net";
import { runCommand, redactSecrets } from "./tools.js";
import { queryKnowledge } from "./kb.js";
import { readDeployments } from "./deployments.js";

const TIMEOUT = 10000;
const truncate = (s, max = 4000) => {
  const t = String(s ?? "");
  return t.length > max ? t.slice(0, max) + "\n...[截断]" : t;
};

function safeService(service) {
  return /^[A-Za-z0-9_.@-]+$/.test(String(service || "")) ? String(service) : "";
}

async function tcpProbe(target) {
  return new Promise((resolve) => {
    const m = String(target).match(/^([^:\s]+):(\d+)$/);
    if (!m) { resolve({ ok: false, output: `无效地址：${target}` }); return; }
    const socket = net.connect({ host: m[1], port: Number(m[2]) });
    const done = (ok, output) => { try { socket.destroy(); } catch {} resolve({ ok, output }); };
    const timer = setTimeout(() => done(false, "连接超时"), 5000);
    socket.once("connect", () => { clearTimeout(timer); done(true, "TCP 连接成功"); });
    socket.once("error", (e) => { clearTimeout(timer); done(false, `连接失败：${e.code || e.message}`); });
  });
}

export function playbookFor(config = {}, incident = {}) {
  const isHost = incident.service === "host" || incident.service === "system";
  const pb = (config.playbooks || {})[isHost ? "host" : incident.service] || {};
  const service = isHost ? "" : safeService(pb.service || incident.service);
  const defaultLogs = isHost ? ["journalctl -p err -n 200 --no-pager"] : (service ? [`journalctl -u ${service} -n 200 --no-pager`] : []);
  const logs = (Array.isArray(pb.logs) ? pb.logs : pb.logs ? [pb.logs] : defaultLogs).slice(0, 5);
  return {
    service,
    logs: logs.map(String),
    upstreams: (Array.isArray(pb.upstreams) ? pb.upstreams : []).slice(0, 5).map(String),
    releaseService: String(pb.releaseService || (isHost ? "" : incident.service) || ""),
    kb: pb.kb !== false,
  };
}

export async function collectEvidence({ config = {}, incident = {}, exec = runCommand, fetchImpl = fetch, deploymentsPath = "", kbQuery = queryKnowledge, now = () => Date.now() } = {}) {
  const pb = playbookFor(config, incident);
  const tasks = [];
  const ev = (kind, command, output, ok) => ({ kind, command, output: redactSecrets(truncate(output)), ts: now(), ok: Boolean(ok) });

  if (pb.service) {
    tasks.push((async () => {
      const r = await exec(`systemctl is-active ${pb.service}`, { timeout: TIMEOUT }).catch((e) => ({ stdout: "", stderr: String(e?.message || e), exitCode: 1 }));
      return ev("service", `systemctl is-active ${pb.service}`, (r.stdout || "") + (r.stderr || ""), r.exitCode === 0);
    })());
  }
  for (const cmd of pb.logs) {
    tasks.push((async () => {
      const r = await exec(cmd, { timeout: TIMEOUT }).catch((e) => ({ stdout: "", stderr: String(e?.message || e), exitCode: 1 }));
      return ev("log", cmd, (r.stdout || "") + (r.stderr || ""), r.exitCode === 0);
    })());
  }
  if (deploymentsPath) {
    tasks.push((async () => {
      const rows = await readDeployments(deploymentsPath, { service: pb.releaseService, limit: 5 });
      return ev("deploy", `发布记录：${pb.releaseService}`, rows.length ? JSON.stringify(rows, null, 2) : "最近没有发布记录", true);
    })());
  }
  for (const target of pb.upstreams) {
    tasks.push((async () => {
      if (/^https?:\/\//i.test(target)) {
        try {
          const res = await fetchImpl(target, { signal: AbortSignal.timeout(5000) });
          return ev("upstream", target, `HTTP ${res.status}`, res.ok);
        } catch (e) {
          return ev("upstream", target, `请求失败：${e?.message || e}`, false);
        }
      }
      const r = await tcpProbe(target);
      return ev("upstream", target, r.output, r.ok);
    })());
  }
  if (pb.kb && config.knowledge?.enabled) {
    tasks.push((async () => {
      const query = `${incident.service || ""} ${incident.title || ""}`.trim();
      try {
        const r = await kbQuery(config.knowledge, query, { timeout: 30 });
        const out = r.hit ? r.answer + (r.sources?.length ? "\n来源：" + r.sources.map((s) => s.title || s.url).join("；") : "") : "知识库未命中";
        return ev("kb", query, out, r.hit);
      } catch (e) {
        return ev("kb", query, `知识库查询失败：${e?.message || e}`, false);
      }
    })());
  }
  return Promise.all(tasks);
}

export function normalizePlaybooks(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "playbooks 必须是对象" };
  const out = {};
  for (const [name, pb] of Object.entries(input)) {
    if (name !== "host" && !/^[A-Za-z0-9_.@-]+$/.test(name)) return { error: `服务名不合法：${name}` };
    if (!pb || typeof pb !== "object") continue;
    const logs = (Array.isArray(pb.logs) ? pb.logs : []).map(String).map((s) => s.trim()).filter(Boolean).slice(0, 20);
    const upstreams = (Array.isArray(pb.upstreams) ? pb.upstreams : []).map(String).map((s) => s.trim()).filter(Boolean).slice(0, 20);
    const actions = {};
    for (const [key, val] of Object.entries(pb.actions || {})) {
      if (!/^[A-Za-z0-9_-]+$/.test(key)) return { error: `动作 key 不合法：${key}` };
      const command = typeof val === "string" ? val.trim() : String(val?.command || "").trim();
      if (!command) return { error: `动作 ${key} 缺少命令` };
      const label = String((typeof val === "object" && val?.label) || key).trim() || key;
      const risk = typeof val === "object" && ["low", "medium", "high"].includes(val.risk) ? val.risk : "medium";
      actions[key] = { command, label, risk };
    }
    out[name] = { service: name, logs, upstreams, releaseService: String(pb.releaseService || "").trim(), kb: pb.kb !== false, actions };
  }
  return { playbooks: out };
}
