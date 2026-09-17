import { runCommand } from "./tools.js";
import { assessHealth, parseDf, parseFree, parseLoad } from "./health.js";

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

export async function collectNetwork() {
  const ss = await runCommand("ss -tulnp");
  return { listeners: { ok: ss.exitCode === 0, detail: ss.stdout || ss.stderr } };
}

export async function collectNginx() {
  const [status, config] = await Promise.all([
    runCommand("systemctl is-active nginx"),
    runCommand("nginx -t 2>&1"),
  ]);
  return {
    status: { ok: status.exitCode === 0, detail: status.stdout.trim() || "未安装/未运行" },
    config: { ok: config.exitCode === 0, detail: config.stdout || config.stderr },
  };
}

export async function collectFirewall() {
  const [ufw, iptables] = await Promise.all([
    runCommand("ufw status"),
    runCommand("iptables -L -n --line-numbers"),
  ]);
  const isActive = ufw.stdout.includes("Status: active") || (ufw.exitCode === 0 && ufw.stdout.includes("active"));
  const riskyPorts = [];
  for (const line of (iptables.stdout || "").split("\n")) {
    const m = line.match(/ACCEPT\s+tcp\s+.*\s0\.0\.0\.0\/0\s+0\.0\.0\.0\/0\s+tcp\s+dpt:(\d+)/);
    if (m) riskyPorts.push({ proto: "tcp", port: Number(m[1]) });
  }
  return {
    status: { ok: true, detail: isActive ? "ufw active" : (ufw.stdout.trim() || "ufw 不可用") },
    rules: { ok: iptables.exitCode === 0, detail: iptables.stdout || iptables.stderr },
    riskyPorts,
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

export async function collectSystemd() {
  const r = await runCommand("systemctl show --type=service -p Id,ActiveState,SubState,MemoryCurrent,CPUUsageNSec,ActiveEnterTimestamp --no-pager");
  if (r.exitCode !== 0) return { error: r.stderr || "systemctl 不可用" };
  const services = [];
  for (const block of r.stdout.split("\n\n")) {
    const kv = {};
    for (const line of block.split("\n")) {
      const i = line.indexOf("=");
      if (i > -1) kv[line.slice(0, i)] = line.slice(i + 1);
    }
    if (!kv.Id || !kv.ActiveState) continue;
    services.push({
      name: kv.Id.replace(/\.service$/, ""),
      state: kv.ActiveState,
      sub: kv.SubState,
      memory: formatBytes(kv.MemoryCurrent),
      cpu: formatCpu(kv.CPUUsageNSec),
      started: kv.ActiveEnterTimestamp || "—",
    });
  }
  services.sort((a, b) => a.name.localeCompare(b.name));
  return { services };
}

function formatBytes(v) {
  if (!v || v === "[not set]") return "—";
  const n = Number(v);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatCpu(v) {
  if (!v || v === "[not set]") return "—";
  const s = Math.round(Number(v) / 1e9);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60}s`;
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

export async function collectSsl(sites = []) {
  const results = await Promise.all(sites.map(async (site) => {
    const host = site.split(":")[0];
    const port = site.includes(":") ? site.split(":")[1] : "443";
    const r = await runCommand(`timeout 10 bash -c 'echo | openssl s_client -connect ${host}:${port} -servername ${host} 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null'`);
    const m = (r.stdout || "").match(/notAfter=(.*)/);
    if (!m) return { host, port, error: r.stderr || "无法读取证书" };
    const daysLeft = Math.floor((new Date(m[1]) - Date.now()) / 86400000);
    return { host, port, notAfter: m[1], daysLeft };
  }));
  return { results };
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
    systemd: await safe(collectSystemd),
    processes: await safe(collectProcesses),
    ssl: await safe(() => collectSsl(config.sslSites || [])),
    connectivity: await safe(() => collectConnectivity(config.pingTargets || [])),
    nginxLogs: await safe(collectNginxLogs),
    pyProcesses: await safe(collectPyProcesses),
    dbSlow: await safe(() => collectDbSlow(config)),
    dockerDetail: await safe(collectDockerDetail),
  };
}