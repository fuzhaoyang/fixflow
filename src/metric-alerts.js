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

export async function createMetricAlerts({ config, configPath, monitor, exec = runCommand, now = () => new Date(), onNotify = () => {} } = {}) {
  const statePath = join(dirname(configPath), "metric-incidents.json");
  const readCfg = async () => { try { return JSON.parse(await readFile(configPath, "utf8")); } catch { return {}; } };
  const writeCfg = async (patch) => { const e = await readCfg(); await writeFile(configPath, JSON.stringify({ ...e, ...patch }, null, 2)); };
  let state = { seq: 0, day: dayKey(now()), incidents: [] };
  try { state = { ...state, ...JSON.parse(await readFile(statePath, "utf8")) }; } catch {}
  const persist = async () => { await mkdir(dirname(statePath), { recursive: true }); await writeFile(statePath, JSON.stringify(state, null, 2)).catch(() => {}); };
  const breachSince = new Map();

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
    for (const r of rules) {
      if (!r.enabled) continue;
      const v = values[r.metric];
      const inc = activeOf(r.id);
      if (hit(r, v)) {
        if (!inc) {
          if (!breachSince.get(r.id)) breachSince.set(r.id, t);
          if (t - breachSince.get(r.id) >= (r.duration || 0) * 60000) {
            const event = { id: nextId(), ruleId: r.id, level: r.level || 3, state: "firing", startedAt: breachSince.get(r.id), peak: v, lastValue: v, samples: 1, ackedAt: 0, escalatedAt: 0, escalatedLevel: 0, recoveredAt: 0 };
            state.incidents.unshift(event);
            if (state.incidents.length > 200) state.incidents.length = 200;
            await persist();
            onNotify({ kind: "firing", rule: r, incident: event, value: v, host: hostname() });
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
          onNotify({ kind: "recovery", rule: r, incident: inc, value: v, host: hostname() });
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

  return { list, save, incidents, tick, ack, runRule };
}
