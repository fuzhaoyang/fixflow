const warnPct = 80;
const badPct = 90;

const VIRTUAL_FS = /^(tmpfs|devtmpfs|overlay|squashfs|shm|ramfs|sysfs|proc|devpts|cgroup2?|debugfs|tracefs|securityfs|pstore|bpf|configfs|fusectl|mqueue|hugetlbfs|nsfs|autofs|efivarfs|binfmt_misc|rpc_pipefs|selinuxfs|none)$/i;
const VIRTUAL_MOUNT = /^\/(snap|sys|proc|dev|run|var\/lib\/docker)(\/|$)/;

export function isRealDisk(row) {
  if (!row) return false;
  if (VIRTUAL_FS.test(row.fs)) return false;
  if (VIRTUAL_MOUNT.test(row.mount)) return false;
  return true;
}

export function realDisks(rows) {
  return (rows || []).filter(isRealDisk);
}

export function parseDf(stdout) {
  return (stdout || "").split("\n").slice(1).map((l) => {
    const parts = l.trim().split(/\s+/);
    if (parts.length < 6) return null;
    const usedPct = parseInt((parts[parts.length - 2] || "0").replace("%", ""), 10);
    return {
      fs: parts[0],
      size: parts[parts.length - 5],
      used: parts[parts.length - 4],
      avail: parts[parts.length - 3],
      mount: parts[parts.length - 1],
      usedPct: Number.isFinite(usedPct) ? usedPct : 0,
    };
  }).filter(Boolean);
}

export function parseDfInodes(stdout) {
  return (stdout || "").split("\n").slice(1).map((l) => {
    const parts = l.trim().split(/\s+/);
    if (parts.length < 6) return null;
    const usedPct = parseInt((parts[parts.length - 2] || "0").replace("%", ""), 10);
    return { fs: parts[0], mount: parts[parts.length - 1], usedPct: Number.isFinite(usedPct) ? usedPct : 0 };
  }).filter(Boolean);
}

export function parseFree(stdout) {
  const m = (stdout || "").match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
  const s = (stdout || "").match(/Swap:\s+(\d+)\s+(\d+)\s+(\d+)/);
  const swapTotal = s ? Number(s[1]) : 0;
  const swapUsed = s ? Number(s[2]) : 0;
  const base = { usedPct: 0, total: 0, used: 0, swapTotal, swapUsed, swapUsedPct: swapTotal ? Math.round((swapUsed / swapTotal) * 100) : 0 };
  if (!m) return base;
  const total = Number(m[1]);
  const used = Number(m[2]);
  const cache = Number(m[5]);
  const real = Math.max(0, used - cache);
  return { ...base, total, used: real, usedPct: total ? Math.round((real / total) * 100) : 0 };
}

export function parseLoad(stdout) {
  const m = (stdout || "").match(/load average[s]?:\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/i) || (stdout || "").match(/^([\d.]+)/);
  if (m && m[2]) return { load: parseFloat(m[1]), load1: parseFloat(m[1]), load5: parseFloat(m[2]), load15: parseFloat(m[3]) };
  return { load: m ? parseFloat(m[1]) : 0, load1: m ? parseFloat(m[1]) : 0, load5: m ? parseFloat(m[1]) : 0, load15: m ? parseFloat(m[1]) : 0 };
}

function statusOf(pct) {
  if (pct > badPct) return "bad";
  if (pct > warnPct) return "warn";
  return "ok";
}

export function assessHealth({ df = [], free = 0, load = 0, cpuCount = 1, swap = 0, inodes = [] }) {
  const items = [];
  const risks = [];
  for (const d of realDisks(df)) {
    const st = statusOf(d.usedPct);
    items.push({
      name: `磁盘 ${d.mount}`,
      status: st,
      detail: `${d.usedPct}%`,
      advice: st === "ok" ? "" : `磁盘 ${d.mount} 使用率 ${d.usedPct}%${d.usedPct > 90 ? "，超过 90% 请立即处理" : "，建议清理旧日志或扩容"}`,
    });
    if (st !== "ok") risks.push(items[items.length - 1].advice);
  }
  for (const i of realDisks(inodes)) {
    const st = statusOf(i.usedPct);
    items.push({
      name: `inode ${i.mount}`,
      status: st,
      detail: `${i.usedPct}%`,
      advice: st === "ok" ? "" : `inode ${i.mount} 使用率 ${i.usedPct}%，小文件过多，建议清理临时/缓存文件`,
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
  if (swap > 0) {
    const swapSt = statusOf(swap);
    items.push({
      name: "Swap",
      status: swapSt,
      detail: `${swap}%`,
      advice: swapSt === "ok" ? "" : `Swap 使用率 ${swap}%，物理内存可能不足，建议排查内存占用或扩容`,
    });
    if (swapSt !== "ok") risks.push(items[items.length - 1].advice);
  }
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
