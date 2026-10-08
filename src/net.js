import { readFile, statfs } from "node:fs/promises";

const netRegex = /^(\S+):\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/;

export async function readNetDev(path = "/proc/net/dev") {
  const raw = await readFile(path, "utf8");
  const nics = {};
  for (const line of raw.split("\n")) {
    const m = line.match(netRegex);
    if (!m) continue;
    nics[m[1]] = { rxBytes: Number(m[2]), txBytes: Number(m[10]) };
  }
  return nics;
}

const diskRegex = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+.*?\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/;

export async function readDiskstats(path = "/proc/diskstats") {
  const raw = await readFile(path, "utf8");
  const disks = {};
  for (const line of raw.split("\n")) {
    const m = line.match(diskRegex);
    if (!m) continue;
    disks[m[3]] = {
      reads: Number(m[4]),
      readSectors: Number(m[6]),
      readMs: Number(m[7]),
      writes: Number(m[8]),
      writeSectors: Number(m[10]),
      writeMs: Number(m[11]),
    };
  }
  return disks;
}

export function calcCpuUsage(prev, next) {
  if (!prev) return 0;
  const total = Math.max(1, next.total - prev.total);
  const idle = Math.max(0, next.idle - prev.idle);
  return Math.min(100, Math.round(((total - idle) / total) * 1000) / 10);
}

export async function readProcStat(path = "/proc/stat") {
  const raw = await readFile(path, "utf8");
  const line = raw.split("\n")[0];
  const parts = line.split(/\s+/).slice(1).map(Number);
  const idle = parts[3] + (parts[4] || 0);
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
}

export function nowTs() {
  return Math.floor(Date.now() / 1000);
}

export async function readMemInfo(path = "/proc/meminfo") {
  const raw = await readFile(path, "utf8");
  const get = (k) => {
    const m = raw.match(new RegExp(`^${k}:\\s+(\\d+)`, "m"));
    return m ? Number(m[1]) : 0;
  };
  const total = get("MemTotal");
  const avail = get("MemAvailable");
  const cache = get("Buffers") + get("Cached") + get("SReclaimable");
  const used = Math.max(0, total - avail);
  const real = Math.max(0, used - cache);
  return { total, usedPct: total ? Math.round((real / total) * 100) : 0 };
}

async function readDiskPct(mount = "/") {
  const st = await statfs(mount);
  return st.blocks ? Math.round(((st.blocks - st.bfree) / st.blocks) * 100) : 0;
}

export function createMonitor(store = {}) {
  store.net = store.net || { last: null, samples: [] };
  store.io = store.io || { last: null, samples: [] };
  store.cpu = store.cpu || null;
  store.trend = store.trend || { counter: 0, samples: [] };
  return {
    async tick() {
      const t = nowTs();
      try {
        const net = await readNetDev();
        const prev = store.net.last;
        if (prev) {
          const point = { t };
          const up = {};
          const down = {};
          const totals = {};
          for (const [name, cur] of Object.entries(net)) {
            const old = prev[name];
            if (!old) continue;
            up[name] = clampRate(cur.txBytes - old.txBytes);
            down[name] = clampRate(cur.rxBytes - old.rxBytes);
            totals[name] = { tx: cur.txBytes, rx: cur.rxBytes };
          }
          point.up = up;
          point.down = down;
          point.totals = totals;
          store.net.samples.push(point);
          trim(store.net.samples, 300);
        }
        store.net.last = net;
      } catch {}

      try {
        const io = await readDiskstats();
        const prev = store.io.last;
        if (prev) {
          const point = { t };
          const read = {};
          const write = {};
          let ioReads = 0;
          let ioWrites = 0;
          let ioReadMs = 0;
          let ioWriteMs = 0;
          for (const [name, cur] of Object.entries(io)) {
            const old = prev[name];
            if (!old) continue;
            read[name] = clampRate(((cur.readSectors - old.readSectors) * 512));
            write[name] = clampRate(((cur.writeSectors - old.writeSectors) * 512));
            ioReads += cur.reads - old.reads;
            ioWrites += cur.writes - old.writes;
            ioReadMs += cur.readMs - old.readMs;
            ioWriteMs += cur.writeMs - old.writeMs;
          }
          const totalOps = ioReads + ioWrites;
          point.read = read;
          point.write = write;
          point.iops = totalOps;
          point.latency = totalOps > 0 ? Math.round((ioReadMs + ioWriteMs) / totalOps * 10) / 10 : 0;
          store.io.samples.push(point);
          trim(store.io.samples, 300);
        }
        store.io.last = io;
      } catch {}

      try {
        const cpu = await readProcStat();
        store.cpu = calcCpuUsage(store.prevCpu, cpu);
        store.prevCpu = cpu;
      } catch { store.cpu = 0; }

      store.trend.counter = (store.trend.counter || 0) + 1;
      if (store.trend.counter % 5 === 0) {
        try {
          const mem = await readMemInfo();
          let disk = null;
          try { disk = await readDiskPct("/"); } catch {}
          store.trend.samples.push({ t, cpu: store.cpu ?? 0, mem: mem.usedPct, disk });
          trim(store.trend.samples, 360);
        } catch {}
      }
    },
    net: () => store.net,
    io: () => store.io,
    cpu: () => store.cpu ?? 0,
    trend: () => store.trend,
  };
}

function clampRate(v) {
  return Math.max(0, Math.floor(v));
}

function trim(arr, max) {
  if (arr.length > max) arr.splice(0, arr.length - max);
}

export function collectStatus(monitor) {
  return { cpu: monitor.cpu() };
}
