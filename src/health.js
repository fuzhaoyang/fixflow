const warnPct = 80;
const badPct = 90;

export function parseDf(stdout) {
  return (stdout || "").split("\n").slice(1).map((l) => {
    const parts = l.trim().split(/\s+/);
    if (parts.length < 6) return null;
    const usedPct = parseInt((parts[4] || "0").replace("%", ""), 10);
    return { mount: parts[5], usedPct: Number.isFinite(usedPct) ? usedPct : 0 };
  }).filter(Boolean);
}

export function parseFree(stdout) {
  const m = (stdout || "").match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
  if (!m) return { usedPct: 0 };
  const total = Number(m[1]);
  const used = Number(m[2]);
  const cache = Number(m[5]);
  const real = Math.max(0, used - cache);
  return { usedPct: total ? Math.round((real / total) * 100) : 0 };
}

export function parseLoad(stdout) {
  const m = (stdout || "").match(/^([\d.]+)/);
  return { load: m ? parseFloat(m[1]) : 0 };
}

function statusOf(pct) {
  if (pct > badPct) return "bad";
  if (pct > warnPct) return "warn";
  return "ok";
}

export function assessHealth({ df = [], free = 0, load = 0, cpuCount = 1 }) {
  const items = [];
  const risks = [];
  for (const d of df) {
    const st = statusOf(d.usedPct);
    items.push({
      name: `磁盘 ${d.mount}`,
      status: st,
      detail: `${d.usedPct}%`,
      advice: st === "ok" ? "" : `磁盘 ${d.mount} 使用率 ${d.usedPct}%${d.usedPct > 90 ? "，超过 90% 请立即处理" : "，建议清理旧日志或扩容"}`,
    });
    if (st !== "ok") risks.push(items[items.length - 1].advice);
  }
  const memSt = statusOf(free);
  items.push({
    name: "内存",
    status: memSt,
    detail: `${free}%`,
    advice: memSt === "ok" ? "" : `内存使用率 ${free}%${free > 90 ? "，超过 90% 请立即处理" : "，建议检查常驻进程或扩容"}`,
  });
  if (memSt !== "ok") risks.push(items[items.length - 1].advice);
  if (load > cpuCount) {
    items.push({
      name: "系统负载",
      status: "warn",
      detail: `1分钟负载 ${load} / ${cpuCount} 核`,
      advice: `1分钟负载 ${load} 超过核数 ${cpuCount}，建议排查高 CPU 进程`,
    });
    risks.push(`1分钟负载 ${load} 超过核数 ${cpuCount}，建议排查高 CPU 进程`);
  } else {
    items.push({ name: "系统负载", status: "ok", detail: `1分钟负载 ${load} / ${cpuCount} 核`, advice: "" });
  }
  return { items, risks };
}
