import { runCommand } from "./tools.js";
import { assessHealth, parseDf, parseFree, parseLoad } from "./health.js";
import { collectSslAll } from "./ssl.js";
import { readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { resolve, dirname, basename, join } from "node:path";
import { pad2 } from "./util.js";

export function createTtlCache(ttl) {
  const store = new Map();
  const cache = async (key, fn) => {
    const now = Date.now();
    const hit = store.get(key);
    if (hit && now < hit.until) return hit.promise;
    const p = fn().catch((e) => { store.delete(key); throw e; });
    store.set(key, { promise: p, until: now + ttl });
    return p;
  };
  cache.clear = (key) => store.delete(key);
  cache.clearAll = () => store.clear();
  return cache;
}

const safe = async (fn) => {
  try { return await fn(); } catch { return { error: "N/A" }; }
};

export async function collectSystem() {
  const [uptime, mem, disk, nproc] = await Promise.all([
    runCommand("uptime"), runCommand("free -m"), runCommand("df -h"), runCommand("nproc"),
  ]);
  const cpuCount = nproc.exitCode === 0 ? parseInt(nproc.stdout.trim() || "1", 10) || 1 : 1;
  const health = assessHealth({
    df: parseDf(disk.stdout || ""),
    free: parseFree(mem.stdout || "").usedPct,
    load: parseLoad(uptime.stdout || "").load,
    cpuCount,
  });
  return {
    uptime: { ok: uptime.exitCode === 0, detail: uptime.stdout || uptime.stderr },
    memory: { ok: mem.exitCode === 0, detail: mem.stdout || mem.stderr },
    disk: { ok: disk.exitCode === 0, detail: disk.stdout || disk.stderr },
    health,
  };
}

function parseSs(stdout) {
  return (stdout || "").split("\n").slice(1).map((l) => {
    const line = l.trimEnd();
    if (!line.trim()) return null;
    const m = line.match(/^(\S+)\s+(\S+)\s+\d+\s+\d+\s+(\S+)\s+(\S+)\s*(.*)$/);
    if (!m) return null;
    const procMatch = (m[5] || "").match(/users:\(\(\"([^\"]+)\",pid=(\d+)/);
    return {
      proto: m[1],
      state: m[2],
      local: m[3],
      peer: m[4],
      process: procMatch ? procMatch[1] : "",
      pid: procMatch ? procMatch[2] : "",
    };
  }).filter(Boolean);
}

export async function collectNetwork() {
  const ss = await runCommand("ss -tulnp");
  if (ss.exitCode !== 0) return { listeners: { ok: false, detail: ss.stderr || "ss 不可用" } };
  return { listeners: { ok: true, items: parseSs(ss.stdout) } };
}

const nginxMetaCache = createTtlCache(30000);

export async function collectNginx() {
  const [status, version, dump, workers, etimes] = await Promise.all([
    runCommand("systemctl is-active nginx"),
    nginxMetaCache("version", () => runCommand("nginx -v 2>&1")),
    nginxMetaCache("dump", () => { if (process.env.FF_DEBUG_METRICS) console.log(`[nginx] ${Date.now()}`); return runCommand("nginx -T 2>/dev/null"); }),
    runCommand("pgrep -c nginx"),
    runCommand("ps -eo etimes= -C nginx --no-headers | sort -rn | head -1"),
  ]);
  const verText = `${version.stdout || ""}${version.stderr || ""}`;
  if (!/nginx\//.test(verText) && status.exitCode !== 0) return { error: "nginx 未安装或未运行" };
  const vm = verText.match(/nginx\/([\d.]+)/);
  const et = parseInt((etimes.stdout || "").trim(), 10);
  return {
    status: { ok: status.exitCode === 0, detail: (status.stdout || "").trim() || "未运行" },
    version: vm ? vm[1] : "—",
    config: { ok: dump.exitCode === 0, detail: (dump.stderr || "").trim() || "配置正常" },
    workers: parseInt((workers.stdout || "").trim(), 10) || 0,
    uptime: Number.isFinite(et) ? formatUptime(et) : "—",
    listens: parseNginxListens(dump.stdout || ""),
  };
}

export function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} 天 ${h} 小时`;
  if (h > 0) return `${h} 小时 ${m} 分`;
  return `${m} 分`;
}

export function parseNginxListens(dump) {
  const listens = [];
  let file = "";
  let cur = null;
  for (const raw of String(dump || "").split("\n")) {
    const fm = raw.match(/^# configuration file (\S+):/);
    if (fm) { file = fm[1]; cur = null; continue; }
    const l = raw.trim();
    if (/^server\s*\{/.test(l)) { cur = { port: "", serverName: "", file }; continue; }
    if (!cur) continue;
    const lm = l.match(/^listen\s+([^;\s]+)/);
    if (lm && !cur.port) cur.port = lm[1].replace(/[^\d]/g, "") || lm[1];
    const sm = l.match(/^server_name\s+([^;]+);/);
    if (sm) cur.serverName = sm[1].trim();
    if (/^\}/.test(l)) {
      if (cur.port || cur.serverName) listens.push(cur);
      cur = null;
    }
  }
  return listens;
}

const nginxConfCache = createTtlCache(30000);

async function collectNginxConfs({ run = runCommand } = {}) {
  if (run !== runCommand) return collectNginxConfsRaw({ run });
  return nginxConfCache("confs", () => collectNginxConfsRaw({ run }));
}

async function collectNginxConfsRaw({ run }) {
  const r = await run("nginx -T 2>&1");
  if (r.exitCode !== 0) return { confs: null, error: ((r.stdout || r.stderr) || "无法读取 nginx 配置").trim() };
  const paths = [...new Set([...String(r.stdout || "").matchAll(/# configuration file (\S+):/g)].map((m) => m[1]))];
  return { confs: paths.map((p) => ({ path: p, name: p.split("/").pop() })), error: null };
}

export async function listNginxConfs({ run = runCommand } = {}) {
  const r = await collectNginxConfs({ run });
  return r.error ? { confs: [], error: r.error } : { confs: r.confs };
}

export async function readNginxConf(path, { run = runCommand, baseDir } = {}) {
  const abs = resolve(String(path || ""));
  if (baseDir) {
    if (!abs.startsWith(baseDir)) return { error: "路径不合法" };
  } else {
    const r = await collectNginxConfs({ run });
    if (r.error) return { error: r.error };
    if (!r.confs.some((c) => c.path === abs)) return { error: "路径不合法" };
  }
  try {
    return { path: abs, content: await readFile(abs, "utf8") };
  } catch (e) {
    return { error: `无法读取：${e.message}` };
  }
}

async function pruneBackups(abs) {
  try {
    const dir = dirname(abs);
    const base = basename(abs);
    const files = (await readdir(dir)).filter((f) => f.startsWith(base + ".bak.")).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 5))) await unlink(join(dir, f)).catch(() => {});
  } catch {}
}

export async function writeNginxConf(path, content, { run = runCommand, baseDir } = {}) {
  const abs = resolve(String(path || ""));
  if (baseDir) {
    if (!abs.startsWith(baseDir)) return { ok: false, error: "路径不合法" };
  } else {
    const r = await collectNginxConfs({ run });
    if (r.error) return { ok: false, error: r.error };
    if (!r.confs.some((c) => c.path === abs)) return { ok: false, error: "路径不合法" };
  }
  let orig;
  try { orig = await readFile(abs, "utf8"); }
  catch (e) { return { ok: false, error: `无法读取原文件：${e.message}` }; }
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const bak = `${abs}.bak.${ts}`;
  try {
    await writeFile(bak, orig);
    await writeFile(abs, content);
  } catch (e) {
    return { ok: false, error: `无写入权限：${e.message}` };
  }
  const t = await run("nginx -t 2>&1");
  if (t.exitCode !== 0) {
    await writeFile(abs, orig).catch(() => {});
    return { ok: false, error: (t.stdout || t.stderr || "配置校验失败").trim(), rolledBack: true };
  }
  nginxConfCache.clearAll();
  const r = await run("systemctl reload nginx");
  await pruneBackups(abs);
  return { ok: r.exitCode === 0, output: (r.stdout || r.stderr || "").trim() };
}

const DANGEROUS_PORTS = new Set([3306, 5432, 6379, 27017, 9200, 8888, 888, 9090, 9000, 2375, 2376]);

export function parseUfwStatus(stdout) {
  const rules = [];
  const riskyPorts = [];
  const seen = new Set();
  for (const rawLine of (stdout || "").split("\n")) {
    const line = rawLine.trim();
    if (!line || /^-+$/.test(line) || /^To\s+Action\s+From/i.test(line)) continue;
    const m = line.match(/^\[?\s*(\d+)\]?\s+(.+?)\s+(ALLOW|DENY|REJECT|LIMIT)(?:\s+(IN|OUT|FWD))?\s+(.*)$/);
    if (!m) continue;
    const [, num, target, action, dir, fromRaw] = m;
    const cleanTarget = target.replace(/\(v6\)/gi, "").trim();
    const [portPart, protoPart] = cleanTarget.includes("/") ? cleanTarget.split("/") : [cleanTarget, ""];
    const proto = (protoPart || "").trim().toLowerCase() || "tcp";
    let from = fromRaw.trim();
    let comment = "";
    const hash = from.indexOf("#");
    if (hash >= 0) { comment = from.slice(hash + 1).trim(); from = from.slice(0, hash).trim(); }
    rules.push({ num: Number(num), action, proto, port: portPart.trim(), from, comment });
    if (action === "ALLOW" && (!dir || dir === "IN") && /^Anywhere/.test(from)) {
      for (const p of portPart.split(",")) {
        const n = Number(p.trim());
        if (!Number.isInteger(n) || n < 1 || n > 65535) continue;
        const key = `${proto}:${n}`;
        if (seen.has(key)) continue;
        seen.add(key);
        riskyPorts.push({ proto, port: n, dangerous: DANGEROUS_PORTS.has(n) });
      }
    }
  }
  return { rules, riskyPorts };
}

export function parseFirewalld(portsOut, servicePorts = {}) {
  const rules = [];
  const riskyPorts = [];
  const seen = new Set();
  let num = 0;
  const addToken = (token, source) => {
    const [portPart, protoPart] = String(token).split("/");
    const proto = (protoPart || "tcp").trim().toLowerCase() || "tcp";
    const portStr = (portPart || "").trim();
    if (!portStr) return;
    const isRange = /^\d+-\d+$/.test(portStr);
    let portValue;
    if (isRange) {
      portValue = portStr;
    } else {
      const n = Number(portStr);
      if (!Number.isInteger(n) || n < 1 || n > 65535) return;
      portValue = n;
    }
    const key = `${proto}:${portValue}`;
    if (seen.has(key)) return;
    seen.add(key);
    num += 1;
    rules.push({ num, action: "ALLOW", proto, port: String(portValue), from: "Anywhere", comment: source });
    const dangerous = isRange ? rangeHasDangerous(portStr) : DANGEROUS_PORTS.has(Number(portValue));
    riskyPorts.push({ proto, port: portValue, dangerous });
  };
  for (const tok of String(portsOut || "").split(/\s+/).filter(Boolean)) addToken(tok, "");
  for (const [svc, tokens] of Object.entries(servicePorts || {})) {
    for (const tok of tokens || []) addToken(tok, svc);
  }
  return { rules, riskyPorts };
}

function rangeHasDangerous(range) {
  const [a, b] = String(range).split("-").map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  for (const p of DANGEROUS_PORTS) if (p >= a && p <= b) return true;
  return false;
}

async function collectFirewalld() {
  const zoneRes = await runCommand("firewall-cmd --get-default-zone");
  const zone = (zoneRes.stdout || "").trim() || "public";
  const listRes = await runCommand(`firewall-cmd --zone=${zone} --list-all`);
  const out = listRes.stdout || "";
  const ports = (out.match(/^\s*ports:\s*(.*)$/m)?.[1] || "").trim();
  const services = (out.match(/^\s*services:\s*(.*)$/m)?.[1] || "").trim().split(/\s+/).filter(Boolean);
  const infos = await Promise.all(services.map((s) => runCommand(`firewall-cmd --info-service=${s}`)));
  const servicePorts = {};
  services.forEach((s, i) => {
    const m = (infos[i].stdout || "").match(/ports:\s*(.+)/);
    servicePorts[s] = m ? m[1].trim().split(/\s+/) : [];
  });
  const { rules, riskyPorts } = parseFirewalld(ports, servicePorts);
  return {
    ok: riskyPorts.every((p) => !p.dangerous),
    backend: "firewalld",
    status: { ok: true, detail: `firewalld (${zone})` },
    rules,
    riskyPorts,
    raw: "",
  };
}

const firewallCache = createTtlCache(15000);

export async function collectFirewall() {
  return firewallCache("fw", doCollectFirewall);
}

async function doCollectFirewall() {
  if (process.env.FF_DEBUG_METRICS) console.log(`[fw] ${Date.now()}`);
  const fwState = await runCommand("firewall-cmd --state");
  if (fwState.exitCode === 0 && /running/i.test(fwState.stdout || "")) {
    return collectFirewalld();
  }
  const [ufw, iptables] = await Promise.all([
    runCommand("ufw status numbered"),
    runCommand("iptables -L -n --line-numbers"),
  ]);
  const isActive = ufw.exitCode === 0 && /Status:\s*active/i.test(ufw.stdout || "");
  if (isActive) {
    const { rules, riskyPorts } = parseUfwStatus(ufw.stdout || "");
    return { ok: riskyPorts.every((p) => !p.dangerous), backend: "ufw", status: { ok: true, detail: "ufw active" }, rules, riskyPorts, raw: "" };
  }
  const raw = iptables.stdout || iptables.stderr || "";
  const riskyPorts = [];
  const seen = new Set();
  for (const line of raw.split("\n")) {
    const m = line.match(/ACCEPT\s+tcp\s+.*\s0\.0\.0\.0\/0\s+0\.0\.0\.0\/0\s+tcp\s+dpt:(\d+)/);
    if (m) {
      const port = Number(m[1]);
      if (seen.has(port)) continue;
      seen.add(port);
      riskyPorts.push({ proto: "tcp", port, dangerous: DANGEROUS_PORTS.has(port) });
    }
  }
  return {
    ok: riskyPorts.every((p) => !p.dangerous),
    backend: "iptables",
    status: { ok: true, detail: (ufw.stdout || "").trim() || "ufw 不可用" },
    rules: [],
    riskyPorts,
    raw,
  };
}

export async function collectServices({ services = [] }) {
  return Promise.all(services.map(async (s) => {
    try {
      const res = await fetch(s.url, { signal: AbortSignal.timeout(5000) });
      return { name: s.name, ok: res.status < 500, detail: `HTTP ${res.status}` };
    } catch (e) {
      return { name: s.name, ok: false, detail: e.message };
    }
  }));
}

export async function collectDatabases({ databases = [] }) {
  const probes = {
    postgres: "pg_isready",
    mysql: "mysqladmin ping",
    redis: "redis-cli ping",
  };
  return Promise.all(databases.map(async (d) => {
    const cmd = probes[d.type];
    if (!cmd) return { name: d.name, ok: false, detail: `未知数据库类型 ${d.type}` };
    const r = await runCommand(cmd);
    return { name: d.name, ok: r.exitCode === 0, detail: (r.stdout || r.stderr).trim() || "无输出" };
  }));
}

export async function collectDocker() {
  const r = await runCommand("docker ps -a --format '{{.Names}} | {{.Status}}'");
  return {
    ok: r.exitCode === 0,
    detail: r.stdout || r.stderr || "docker 不可用",
  };
}

export async function collectSystemd(keywords = []) {
  const kws = (keywords || []).map((k) => String(k).toLowerCase()).filter(Boolean);
  const [r, ps] = await Promise.all([
    runCommand("systemctl show --type=service -p Id,ActiveState,SubState,MemoryCurrent,ActiveEnterTimestamp,FragmentPath,MainPID --no-pager"),
    runCommand("ps -eo pid,%cpu,%mem --no-headers"),
  ]);
  if (r.exitCode !== 0) return { error: r.stderr || "systemctl 不可用" };
  const psMap = new Map();
  for (const line of (ps.stdout || "").split("\n")) {
    const p = line.trim().split(/\s+/);
    if (p.length >= 3) psMap.set(p[0], { cpu: p[1], mem: p[2] });
  }
  const services = [];
  for (const block of r.stdout.split("\n\n")) {
    const kv = {};
    for (const line of block.split("\n")) {
      const i = line.indexOf("=");
      if (i > -1) kv[line.slice(0, i)] = line.slice(i + 1);
    }
    if (!kv.Id || !kv.ActiveState) continue;
    const name = kv.Id.replace(/\.service$/, "");
    if (kws.length && !kws.some((k) => name.toLowerCase().startsWith(k))) continue;
    const proc = psMap.get(kv.MainPID);
    const t = (kv.ActiveEnterTimestamp || "").match(/^\S+\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
    services.push({
      name,
      state: kv.ActiveState,
      sub: kv.SubState,
      path: kv.FragmentPath || "—",
      cpu: proc ? proc.cpu : "—",
      mem: proc ? proc.mem : "—",
      memMb: formatMemMb(kv.MemoryCurrent),
      mainPid: kv.MainPID,
      started: t ? t[1] : (kv.ActiveEnterTimestamp || "—"),
    });
  }
  services.sort((a, b) => a.name.localeCompare(b.name));
  return { services };
}

export async function collectUserProcs(keywords = []) {
  const kws = (keywords || []).map((k) => String(k).toLowerCase()).filter(Boolean);
  if (!kws.length) return { procs: [] };
  const r = await runCommand("ps -eo pid,comm,%cpu,%mem --no-headers");
  if (r.exitCode !== 0) return { error: r.stderr || "ps 不可用" };
  const procs = [];
  for (const line of (r.stdout || "").split("\n")) {
    const p = line.trim().split(/\s+/);
    if (p.length < 4) continue;
    const name = p[1];
    if (!kws.some((k) => name.toLowerCase().startsWith(k))) continue;
    procs.push({ pid: parseInt(p[0], 10), name, cpu: p[2], mem: p[3] });
  }
  return { procs };
}

function formatMemMb(v) {
  if (!v || v === "[not set]") return "—";
  return (Number(v) / 1024 / 1024).toFixed(1) + " MB";
}

export function formatDateTime(d) {
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

const parsePsLine = (line) => {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 11) return null;
  return {
    user: parts[0],
    pid: parseInt(parts[1], 10),
    cpu: parseFloat(parts[2]),
    mem: parseFloat(parts[3]),
    memKb: parseInt(parts[5], 10),
    state: parts[8],
    cmd: parts.slice(10).join(" "),
  };
};

export async function collectProcesses() {
  const [top, zombie, memtotal] = await Promise.all([
    runCommand("ps aux --sort=-%cpu | head -21"),
    runCommand("ps -eo stat,comm | awk '$1 ~ /Z/ {print $2}'"),
    runCommand("awk '/MemTotal/ {print $2}' /proc/meminfo"),
  ]);
  if (top.exitCode !== 0) return { error: top.stderr || "ps 不可用" };
  const totalMemKb = parseInt(memtotal.stdout.trim(), 10) || 0;
  const list = (top.stdout || "").split("\n").slice(1).map(parsePsLine).filter(Boolean).slice(0, 20);
  const anomalies = [];
  for (const p of list) {
    const cgroup = await runCommand(`cat /proc/${p.pid}/cgroup 2>/dev/null`);
    const m = (cgroup.stdout || "").match(/([\w-]+\.service)/);
    p.service = m ? m[1] : "";
    if (p.cpu > 100) anomalies.push(`进程 ${p.cmd} (PID ${p.pid}) CPU ${p.cpu}% 超阈值`);
    if (totalMemKb && p.memKb > totalMemKb * 0.1) anomalies.push(`进程 ${p.cmd} (PID ${p.pid}) 内存占用异常`);
  }
  const zombies = (zombie.stdout || "").split("\n").filter((l) => l.trim()).length;
  return { top: list, zombies, zombieDetail: zombie.stdout.trim(), anomalies };
}

export async function collectConnectivity(targets = []) {
  const results = await Promise.all(targets.map(async (target) => {
    const [ping, dns] = await Promise.all([
      runCommand(`ping -c 2 -W 3 ${target}`),
      runCommand(`getent hosts ${target}`),
    ]);
    return {
      target,
      pingOk: ping.exitCode === 0,
      pingDetail: ping.stdout.trim() || ping.stderr.trim(),
      dns: dns.stdout.trim() || dns.stderr.trim() || "解析失败",
    };
  }));
  return { results };
}

export const PORT_SERVICES = {
  22: "ssh", 25: "smtp", 53: "dns", 80: "http", 110: "pop3", 143: "imap",
  443: "https", 3306: "mysql", 5432: "postgres", 6379: "redis", 8080: "http-alt",
  8443: "https-alt", 9090: "prometheus", 27017: "mongodb", 9000: "php-fpm",
  9418: "git", 5000: "docker-registry", 2375: "docker", 11211: "memcached",
};

export async function collectPorts(ports) {
  if (!ports) return collectNetwork();
  const list = String(ports).split(",").map((s) => s.trim()).filter(Boolean);
  const results = await Promise.all(list.map(async (p) => {
    const r = await runCommand(`ss -tulnp | grep ":${p} "`);
    return {
      port: p,
      service: PORT_SERVICES[String(p)] || "未知服务",
      ok: r.exitCode === 0,
      detail: r.stdout || `端口 ${p} 无监听`,
    };
  }));
  return { results };
}

export async function collectNginxLogs() {
  const [logs, sites] = await Promise.all([
    runCommand("tail -50 /var/log/nginx/error.log 2>&1"),
    runCommand("ls /etc/nginx/sites-enabled/ 2>/dev/null"),
  ]);
  if (logs.exitCode !== 0) return { error: logs.stderr || "nginx 日志不可用" };
  return { errorLog: logs.stdout, sites: sites.stdout.trim() || "（无站点目录）" };
}

export async function collectPyProcesses() {
  const [ps, venvs] = await Promise.all([
    runCommand("pgrep -fl python 2>/dev/null | head -20"),
    runCommand("ls -d /srv/*/venv /opt/*/venv ~/venv 2>/dev/null"),
  ]);
  if (ps.exitCode !== 0) return { error: "未发现 python 进程" };
  return { processes: ps.stdout.trim() || "无 python 进程", venvs: venvs.stdout.trim() || "（无常见 venv 目录）" };
}

export async function collectDbSlow({ databases = [] }) {
  const probes = {
    postgres: "psql -tAc 'SELECT count(*) FROM pg_stat_activity' 2>&1",
    mysql: "mysql -N -e 'SHOW GLOBAL STATUS LIKE \"Slow_queries\"' 2>&1 | tail -1",
    redis: "redis-cli SLOWLOG LEN 2>&1",
  };
  return Promise.all(databases.map(async (d) => {
    const cmd = probes[d.type];
    if (!cmd) return { name: d.name, ok: false, detail: `未知类型 ${d.type}` };
    const r = await runCommand(cmd);
    return { name: d.name, ok: r.exitCode === 0, detail: (r.stdout || r.stderr).trim() || "无输出" };
  }));
}

export async function collectDockerDetail() {
  const [stats, logs, restarts] = await Promise.all([
    runCommand("docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' 2>&1"),
    runCommand("docker ps -q | head -3 | xargs -I{} docker logs --tail 20 --timestamps {} 2>&1"),
    runCommand("for c in $(docker ps -aq); do docker inspect -f '{{.Name}} 重启{{.RestartCount}}次' $c; done 2>&1"),
  ]);
  if (stats.exitCode !== 0) return { error: stats.stderr || "docker 不可用" };
  return { stats: stats.stdout, logs: logs.stdout || "（无容器日志）", restarts: restarts.stdout || "（无容器）" };
}

export async function collectAll(config) {
  return {
    system: await safe(collectSystem),
    network: await safe(collectNetwork),
    nginx: await safe(collectNginx),
    firewall: await safe(collectFirewall),
    services: await safe(() => collectServices(config)),
    databases: await safe(() => collectDatabases(config)),
    docker: await safe(collectDocker),
    systemd: await safe(() => collectSystemd(config.serviceKeywords)),
    userProcs: await safe(() => collectUserProcs(config.serviceKeywords)),
    processes: await safe(collectProcesses),
    ssl: await safe(() => collectSslAll(config)),
    connectivity: await safe(() => collectConnectivity(config.pingTargets || [])),
    nginxLogs: await safe(collectNginxLogs),
    pyProcesses: await safe(collectPyProcesses),
    dbSlow: await safe(() => collectDbSlow(config)),
    dockerDetail: await safe(collectDockerDetail),
  };
}
export { collectSslAll };
