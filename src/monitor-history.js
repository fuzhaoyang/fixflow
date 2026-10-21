import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const RETENTION_SEC = 7 * 24 * 3600;

function avgByKey(samples, field) {
  const sums = {};
  const counts = {};
  for (const s of samples) {
    for (const [k, v] of Object.entries(s[field] || {})) {
      if (!Number.isFinite(v)) continue;
      sums[k] = (sums[k] || 0) + v;
      counts[k] = (counts[k] || 0) + 1;
    }
  }
  const out = {};
  for (const k of Object.keys(sums)) out[k] = Math.round(sums[k] / counts[k]);
  return out;
}

function avgTotal(samples, field) {
  let sum = 0;
  for (const s of samples) for (const v of Object.values(s[field] || {})) if (Number.isFinite(v)) sum += v;
  return samples.length ? Math.round(sum / samples.length) : 0;
}

export function aggregateMinute(net = [], io = [], trend = []) {
  const all = [...net, ...io, ...trend];
  if (!all.length) return null;
  const lastTrend = trend.length ? [...trend].sort((a, b) => a.t - b.t).at(-1) : null;
  return {
    t: Math.max(...all.map((s) => s.t || 0)),
    up: avgByKey(net, "up"),
    down: avgByKey(net, "down"),
    read: avgTotal(io, "read"),
    write: avgTotal(io, "write"),
    cpu: lastTrend?.cpu ?? 0,
    mem: lastTrend?.mem ?? 0,
    disk: lastTrend?.disk ?? 0,
  };
}

export async function createMonitorHistory({ filePath } = {}) {
  const rows = [];
  const prune = () => {
    const cutoff = Math.floor(Date.now() / 1000) - RETENTION_SEC;
    let removed = false;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].t < cutoff) { rows.splice(i, 1); removed = true; }
    }
    return removed;
  };
  const persistAll = async () => {
    if (!filePath) return;
    await mkdir(dirname(filePath), { recursive: true }).catch(() => {});
    await writeFile(filePath, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "")).catch(() => {});
  };

  if (filePath) {
    try {
      const text = await readFile(filePath, "utf8");
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const r = JSON.parse(line);
          if (Number.isFinite(r.t)) rows.push(r);
        } catch {}
      }
    } catch {}
    prune();
    await persistAll();
  }

  return {
    async add(row) {
      rows.push(row);
      const removed = prune();
      if (removed) await persistAll();
      else if (filePath) await appendFile(filePath, JSON.stringify(row) + "\n").catch(() => {});
    },
    query(minutes = 60) {
      const cutoff = Math.floor(Date.now() / 1000) - Math.max(1, minutes) * 60;
      const picked = rows.filter((r) => r.t >= cutoff);
      return {
        net: picked.map((r) => ({ t: r.t, up: r.up || {}, down: r.down || {} })),
        io: picked.map((r) => ({ t: r.t, read: { all: r.read || 0 }, write: { all: r.write || 0 } })),
        trend: picked.map((r) => ({ t: r.t, cpu: r.cpu || 0, mem: r.mem || 0, disk: r.disk || 0 })),
      };
    },
  };
}
