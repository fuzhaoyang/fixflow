import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { spawn, spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, readdir, lstat, rm, rename as fsRename, chmod } from "node:fs/promises";
import { createReadStream, readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join, dirname, resolve, basename } from "node:path";
import { homedir } from "node:os";
import { createSession } from "../core.js";
import { collectAll, collectPorts, collectConnectivity, collectRemoteProbe, formatDateTime, formatUptime, listNginxConfs, readNginxConf, writeNginxConf, createTtlCache, collectLogSources, collectLogs, collectDockerStats, testDbConnection, parseFailedServices, diffFailedServices, parseDownState, diffDownServices, collectSystemd, collectConnectionSummary, collectDocker, parseWho } from "../metrics.js";
import { loadConfig, normalizeSslSites, readJsonFile, normalizeDbConnections } from "../config.js";
import { collectSslAll, detectRenewTool, renewCert, checkSslAlerts, sendWebhook, sendEmail } from "../ssl.js";
import { createUsageStore } from "../usage.js";
import { createMonitorHistory, aggregateMinute } from "../monitor-history.js";
import { createAlertsManager } from "../alerts.js";
import { lanIPs, publicIP } from "../netip.js";
import { buildUrls } from "../panel-access.js";
import { createMetricAlerts, buildAlertEmail, METRICS, metricLabel } from "../metric-alerts.js";
import { restart as restartService } from "../service.js";
import { hashPasswordAsync, verifyPassword, verifyPasswordAsync, isStrongPassword, createSessionStore, parseCookie, createCaptchaStore, captchaSvg } from "../auth.js";
import { createMonitor, readProcStat, readNetDev, readDiskstats, nowTs, calcCpuUsage } from "../net.js";
import { parseDf, parseFree, parseLoad } from "../health.js";
import { runCommand } from "../tools.js";
import { verifySudo, runPrivileged, detectBackend, activeZones, syncAclRules, sudoCmd } from "../firewall.js";
import { detectPkgManager, resolvePkgName, listInstalledCmd, parseInstalledNames, searchCmd, parseSearch, versionsCmd, parseVersions, installCmd, uninstallCmd, withPmLock, pmErrorHint } from "../pkgs.js";

const STATIC = join(fileURLToPath(new URL(".", import.meta.url)), "static");
const VERSION = JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", import.meta.url)), "utf8")).version || "0.0.0";

// 内置精选软件商店（apt 安装，name 为 apt 包名）
const STORE_PKGS = [
  { name: "nginx", desc: "高性能 Web 服务器与反向代理，支持负载均衡、HTTPS、静态资源服务，是部署网站与应用的首选。" },
  { name: "git", desc: "分布式版本控制系统，用于代码托管、协作开发与版本回滚，是开发者必备工具。" },
  { name: "curl", desc: "命令行网络传输工具，支持 HTTP/HTTPS/FTP 等协议，常用于接口调试、文件下载与健康检查。" },
  { name: "htop", desc: "交互式进程监控工具，以彩色界面实时展示 CPU、内存、进程树与负载，替代传统 top。" },
  { name: "tmux", desc: "终端复用器，支持多窗口、多会话与后台任务，断开连接后任务继续运行，SSH 远程运维利器。" },
  { name: "fail2ban", desc: "入侵防御工具，自动监测登录失败并临时封禁来源 IP，有效防护 SSH 等服务的暴力破解。" },
  { name: "ufw", desc: "简洁的防火墙管理前端，基于 iptables，用简单命令配置端口放行/拒绝，适合入门与日常管理。" },
  { name: "docker.io", desc: "容器引擎，将应用与其依赖打包为镜像并隔离运行，支持镜像管理、容器编排与快速部署。" },
  { name: "postgresql", desc: "功能强大的开源关系型数据库，支持事务、复杂查询与扩展，适合业务数据存储与数据分析。" },
  { name: "redis-server", desc: "高性能内存缓存与键值数据库，支持持久化、发布订阅与多种数据结构，常用于缓存、队列与会话存储。" },
  { name: "nginx-extras", desc: "Nginx 扩展版本，额外内置 Lua、WebDAV、auth-request 等模块，满足高级配置需求。" },
  { name: "tree", desc: "以树形结构展示目录层级，直观查看文件组织结构，适合快速浏览与文档记录。" },
  { name: "jq", desc: "轻量 JSON 命令行处理器，支持过滤、转换与格式化 JSON 数据，配合脚本解析 API 响应。" },
  { name: "ncdu", desc: "磁盘占用分析工具，交互式扫描并展示各目录大小，快速定位大文件与清理空间。" },
  { name: "unzip", desc: "ZIP 压缩包解压工具，支持列出内容、选择性解压与密码保护压缩包，日常文件处理常用。" },
  { name: "rsync", desc: "高效文件同步与备份工具，支持增量传输、远程同步与压缩，是数据备份与迁移的标准方案。" },
];

// 从 apt 输出行中提取进度百分比（APT::Status-Fd 协议 STATUS 行 / Progress 样式），拿不到返回 null
export function parseAptPct(line) {
  const m = String(line || "").match(/STATUS:\s*(\d{1,3})/i) || String(line || "").match(/Progress:\s*\[\s*(\d{1,3})%/i);
  if (m) return Math.min(100, +m[1]);
  return null;
}

// 解析 nginx stub_status 输出（curl /nginx_status）
export function parseNginxStatus(text) {
  const t = String(text || "");
  const out = {};
  const active = t.match(/Active connections:\s*(\d+)/);
  if (active) out.active = +active[1];
  const nums = t.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/m);
  if (nums) { out.accepts = +nums[1]; out.handled = +nums[2]; out.requests = +nums[3]; }
  const rd = t.match(/Reading:\s*(\d+)/), wr = t.match(/Writing:\s*(\d+)/), wt = t.match(/Waiting:\s*(\d+)/);
  if (rd) out.reading = +rd[1];
  if (wr) out.writing = +wr[1];
  if (wt) out.waiting = +wt[1];
  return out;
}

const NGINX_STATUS_CONF = "/etc/nginx/conf.d/fixflow-status.conf";
const NGINX_STATUS_URL = "http://127.0.0.1:8099/nginx_status";

// 确保 stub_status 生效（独立 127.0.0.1 server 块，不碰业务配置），返回实时负载
async function collectNginxLoad({ run = runCommand } = {}) {
  const statusConf = `server {\n  listen 127.0.0.1:8099;\n  location /nginx_status {\n    stub_status on;\n    access_log off;\n    allow 127.0.0.1;\n    deny all;\n  }\n}\n`;
  try { await readFile(NGINX_STATUS_CONF); }
  catch {
    try {
      await mkdir(dirname(NGINX_STATUS_CONF), { recursive: true });
      await writeFile(NGINX_STATUS_CONF, statusConf);
    } catch (e) { return { error: `无法写入 ${NGINX_STATUS_CONF}: ${e.message}` }; }
    const t = await run("nginx -t 2>&1");
    if (t.exitCode !== 0) return { error: `nginx 配置检查失败：${(t.stdout || t.stderr || "").trim()}` };
    await run("systemctl reload nginx", { timeout: 15000 });
  }
  const r = await run(`curl -s --max-time 5 ${NGINX_STATUS_URL}`);
  if (r.exitCode !== 0 || !(r.stdout || "").trim()) return { error: "无法读取 nginx 负载状态，请确认 nginx 已启动" };
  return { ok: true, ...parseNginxStatus(r.stdout) };
}

const APT_PROTO_RE = /^(PMERROR|PMESSAGES|PSTATUS|PREG|PACKAGE|STATUS):/;

// 流式执行命令（root 直跑或 sudo -S），每行回调；解决缓冲式执行 50KB 截断被杀的问题
function spawnLines(cmd, { onLine, timeout = 300000, signal } = {}) {
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", cmd], { detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } });
    let buf = "";
    let finished = false;
    const killTree = () => { try { process.kill(-child.pid, "SIGKILL"); } catch {} };
    const finish = (code, aborted = false) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (buf.trim()) onLine(buf.trim());
      resolve({ exitCode: typeof code === "number" ? code : 1, aborted });
    };
    const flush = (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, "");
        buf = buf.slice(i + 1);
        onLine(line);
      }
    };
    child.stdout.on("data", flush);
    child.stderr.on("data", flush);
    let exitCode = 1;
    child.on("error", () => finish(1));
    child.on("exit", (code) => { exitCode = typeof code === "number" ? code : 1; });
    child.on("close", () => finish(exitCode));
    const timer = setTimeout(() => { killTree(); finish(1, true); }, timeout);
    if (signal) signal.addEventListener("abort", () => { killTree(); finish(1, true); }, { once: true });
  });
}

const TLS_CERT_DIR = join(homedir(), ".config", "fixflow", "certs");
async function ensureTlsCert(dir = TLS_CERT_DIR) {
  const keyPath = join(dir, "key.pem");
  const certPath = join(dir, "cert.pem");
  try { return { key: await readFile(keyPath), cert: await readFile(certPath) }; } catch {}
  await mkdir(dir, { recursive: true });
  const r = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", certPath, "-days", "3650", "-subj", "/CN=fixflow"], { stdio: "ignore" });
  if (r.status !== 0) return null;
  try { return { key: await readFile(keyPath), cert: await readFile(certPath) }; } catch { return null; }
}

async function printAccess(port, panelPath, httpsPort) {
  const lan = lanIPs();
  const pub = await publicIP();
  console.log("fixflow 面板已启动，访问地址（HTTPS 为自签证书，浏览器需手动信任一次）:");
  for (const u of buildUrls({ port, httpsPort, panelPath, lan, pub })) console.log("  " + u);
  if (!pub) console.log(`  （公网 IP 获取失败，可能无外网）请在云安全组/防火墙放行端口 ${port}${httpsPort ? ` / ${httpsPort}` : ""}`);
}

function safeFsPath(p) {
  if (!p || typeof p !== "string") return null;
  const abs = resolve(p);
  return abs.startsWith("/") ? abs : null;
}

const userNames = new Map();
const groupNames = new Map();
let namesLoaded = false;
function loadNames() {
  if (namesLoaded) return;
  namesLoaded = true;
  try {
    for (const line of readFileSync("/etc/passwd", "utf8").split("\n")) {
      const [name, , uid] = line.split(":");
      const n = Number(uid);
      if (name && Number.isInteger(n)) userNames.set(n, name);
    }
  } catch {}
  try {
    for (const line of readFileSync("/etc/group", "utf8").split("\n")) {
      const [name, , gid] = line.split(":");
      const n = Number(gid);
      if (name && Number.isInteger(n)) groupNames.set(n, name);
    }
  } catch {}
}
const uidName = (uid) => { loadNames(); return userNames.get(uid) ?? String(uid); };
const gidName = (gid) => { loadNames(); return groupNames.get(gid) ?? String(gid); };

function formatMode(mode) {
  const t = (mode & 0o170000) === 0o040000 ? "d" : (mode & 0o170000) === 0o120000 ? "l" : "-";
  const chars = "rwxrwxrwx";
  let s = t;
  for (let i = 0; i < 9; i++) s += mode & (0o400 >> i) ? chars[i] : "-";
  return s;
}

async function listFs(p) {
  const abs = safeFsPath(p);
  if (!abs) return { error: "路径不合法" };
  let entries;
  try {
    entries = await readdir(abs, { withFileTypes: true });
  } catch (e) {
    return { error: e.code === "EACCES" ? "无权限" : e.code === "ENOENT" ? "目录不存在" : e.message };
  }
  const children = [];
  for (let i = 0; i < entries.length; i += 200) {
    const chunk = entries.slice(i, i + 200);
    const stats = await Promise.all(chunk.map((d) => lstat(join(abs, d.name)).catch(() => null)));
    chunk.forEach((d, j) => {
      const st = stats[j];
      if (!st) return;
      children.push({
        name: d.name,
        isDir: d.isDirectory(),
        isSymlink: d.isSymbolicLink(),
        size: st.size,
        mtime: st.mtime.toISOString(),
        mode: formatMode(st.mode),
        uid: st.uid,
        gid: st.gid,
        user: uidName(st.uid),
        group: gidName(st.gid),
      });
    });
  }
  return { path: abs, children };
}

function parseMultipart(buf, boundary) {
  const delim = Buffer.from(`--${boundary}`);
  const parts = [];
  let pos = 0;
  while (pos < buf.length) {
    const start = buf.indexOf(delim, pos);
    if (start === -1) break;
    let p = start + delim.length;
    if (buf[p] === 0x0d && buf[p + 1] === 0x0a) p += 2;
    else if (buf[p] === 0x0a) p += 1;
    const headerEnd = buf.indexOf(Buffer.from("\r\n\r\n"), p);
    if (headerEnd === -1) break;
    const headerStr = buf.slice(p, headerEnd).toString("utf8");
    const dataStart = headerEnd + 4;
    const dataEnd = buf.indexOf(delim, dataStart);
    if (dataEnd === -1) break;
    let data = buf.slice(dataStart, dataEnd);
    if (data.length >= 2 && data[data.length - 2] === 0x0d && data[data.length - 1] === 0x0a) data = data.slice(0, -2);
    const cd = headerStr.match(/Content-Disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/);
    if (cd) {
      if (cd[2] !== undefined) parts.push({ type: "file", name: cd[1], filename: cd[2], data });
      else parts.push({ type: "field", name: cd[1], value: data.toString("utf8") });
    }
    pos = dataEnd;
  }
  return parts;
}

function defaultConfigPath() {
  return join(homedir(), ".config", "fixflow", "config.json");
}

function defaultHistoryPath() {
  return join(homedir(), ".config", "fixflow", "history.json");
}

function defaultTermHistoryPath() {
  return join(homedir(), ".config", "fixflow", "term-history.json");
}

function defaultPanelAuditPath() {
  return join(homedir(), ".config", "fixflow", "panel-audit.json");
}

async function readHistoryFile(path) {
  try {
    const data = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function writeHistoryFile(path, messages) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(messages.slice(-200), null, 2));
}

async function writeAuditFile(path, records) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(records.slice(-2000), null, 2));
}

async function fetchModels(baseUrl, apiKey) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`拉取模型列表失败: ${res.status}`);
  const data = await res.json();
  return (data.data || []).map((m) => m.id);
}

export async function startWeb(config = {}, deps = {}) {
  config.sslSites = normalizeSslSites(config.sslSites);
  config.sslAlerts = config.sslAlerts || { webhook: "", smtp: {} };
  config.pingTargets = config.pingTargets || [];
  config.downServices = Array.isArray(config.downServices) ? config.downServices.map((s) => String(s).trim()).filter(Boolean) : ["nginx"];
  config.lang = config.lang === "en" ? "en" : "zh";
  config.theme = config.theme === "light" ? "light" : "dark";
  config.fsCollapsed = config.fsCollapsed === true;
  config.memLimitMB = Number.isFinite(config.memLimitMB) && config.memLimitMB > 0 ? config.memLimitMB : 1024;
  config.dbConnections = normalizeDbConnections(config.dbConnections);
  const clients = new Set();
  const metricsCache = createTtlCache(3000);
  const statusCache = createTtlCache(2000);
  const renewToolCache = createTtlCache(30000);
  const sslCache = createTtlCache(30000);
  const logsSourcesCache = createTtlCache(10000);
  const installedCache = createTtlCache(5000);
  const pkgManagerCache = createTtlCache(60000);
  const waiters = new Map();
  let seq = 0;
  const configPath = config.configPath || defaultConfigPath();
  const historyPath = config.historyPath || defaultHistoryPath();
  const termHistoryPath = config.termHistoryPath || defaultTermHistoryPath();
  const panelAuditPath = config.panelAuditPath || defaultPanelAuditPath();
  const sessions = typeof deps.sessions === "function" ? deps.sessions() : (deps.sessions || createSessionStore());
  const captchas = typeof deps.captchas === "function" ? deps.captchas() : (deps.captchas || createCaptchaStore());
  const readConfigFile = () => readJsonFile(configPath);
  await chmod(configPath, 0o600).catch(() => {});
  const writeAuth = async (auth) => {
    const existing = await readConfigFile();
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify({ ...existing, auth }, null, 2));
    await chmod(configPath, 0o600).catch(() => {});
  };
  const readAuth = async () => (await readConfigFile()).auth || null;
  const persistConfig = async () => {
    const existing = await readConfigFile();
    const saved = { ...existing, baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, sslSites: config.sslSites, pingTargets: config.pingTargets, sslAlerts: config.sslAlerts, lang: config.lang, theme: config.theme, fsCollapsed: config.fsCollapsed, memLimitMB: config.memLimitMB, dbConnections: config.dbConnections };
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(saved, null, 2));
    await chmod(configPath, 0o600).catch(() => {});
  };
  const execCmd = deps.runCommand || runCommand;
  const fwVerify = (password) => verifySudo(password, { run: execCmd });
  const fwRun = (cmd, password, timeout) => runPrivileged(cmd, password, { run: execCmd, timeout });
  const firewalldBackend = async () => (await detectBackend({ run: execCmd })) === "firewalld";
  const firewalldOps = async (zoneCmd, password) => {
    const zones = await activeZones({ run: execCmd });
    let ok = true, detail = "";
    const permCmd = /--add-port|--add-rich-rule|--remove-port/.test(zoneCmd) ? `${zoneCmd} --permanent` : zoneCmd;
    for (const z of zones) {
      const r = await fwRun(`firewall-cmd --zone=${z} ${permCmd}`, password, 15000);
      if (r.exitCode !== 0) ok = false;
      detail += (r.stdout || r.stderr || "").trim();
    }
    const reload = await fwRun("firewall-cmd --reload", password, 15000);
    return { ok: ok && reload.exitCode === 0, stdout: detail, stderr: reload.stderr || "" };
  };
  const fwRes = (r) => ({ ok: r.exitCode === 0, stdout: r.stdout || "", stderr: r.stderr || "" });
  const fwOpsPath = join(dirname(configPath), "firewall-ops.json");
  const readFwOps = async () => {
    try { return JSON.parse(await readFile(fwOpsPath, "utf8")); } catch { return []; }
  };
  const appendFwOp = async (op) => {
    try {
      const ops = await readFwOps();
      ops.push({ ts: Date.now(), ...op });
      await writeFile(fwOpsPath, JSON.stringify(ops.slice(-100), null, 2), { mode: 0o600 }).catch(() => {});
    } catch {}
  };
  const sysOpsPath = join(dirname(configPath), "system-ops.json");
  const readSysOps = async () => {
    try { return JSON.parse(await readFile(sysOpsPath, "utf8")); } catch { return []; }
  };
  const appendSysOp = async (op) => {
    try {
      const ops = await readSysOps();
      ops.push({ ts: Date.now(), ...op });
      await writeFile(sysOpsPath, JSON.stringify(ops.slice(-100), null, 2), { mode: 0o600 }).catch(() => {});
    } catch {}
  };
  const DANGEROUS_UNITS = /^(systemd|systemd-|dbus|NetworkManager|firewalld|networkd|resolved|journald|logind|udevd|sshd?|ssh|lightdm|gdm|sddm|display-manager|dde-|kwin|plymouth|getty|user@)/;
  const SYS_ACTIONS = ["start", "stop", "restart", "reload", "enable", "disable"];
  const sysUnitName = (u) => (u.includes(".") ? u : `${u}.service`);
  const aclPath = join(dirname(configPath), "acl.json");
  const readAcl = async () => {
    try { return JSON.parse(await readFile(aclPath, "utf8")); } catch { return { blacklist: [], whitelist: [] }; }
  };
  const writeAcl = async (acl) => {
    await writeFile(aclPath, JSON.stringify(acl, null, 2), { mode: 0o600 }).catch(() => {});
  };
  const panelPorts = () => [config.port ?? 8080, ...(config.tls ? [config.httpsPort ?? 8443] : [])];
  const DB_DEFAULT_PORT = { postgres: "5432", mysql: "3306", redis: "6379", mongodb: "27017", sqlite: "" };
  const DB_TYPES = new Set(["postgres", "mysql", "redis", "mongodb", "sqlite"]);
  const sanitizeConn = (c) => ({ ...c, password: "", hasPass: Boolean(c.password) });
  const validateDbConn = ({ type, host, user, path }) => {
    if (!DB_TYPES.has(type)) return "不支持的数据库类型";
    if (type === "sqlite") return path ? null : "缺少数据库文件路径";
    if (!host) return "缺少主机";
    if (!user) return "缺少用户名";
    return null;
  };
  const dbTest = (conn, password) => testDbConnection(conn, { run: execCmd });

  const authHeader = (req) => {
    const cookie = parseCookie(req.headers.cookie || "");
    const token = cookie.fixflow_token || "";
    return sessions.valid(token) ? token : "";
  };

  const LOGIN_MAX_FAILS = 5;
  const LOGIN_LOCK_MS = 15 * 60 * 1000;
  const loginFails = new Map();
  const clientIp = (req) => (config.trustProxy
    ? ((req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "unknown")
    : (req.socket.remoteAddress || "unknown"));
  const loginLockedFor = (req) => {
    const a = loginFails.get(clientIp(req));
    return a && a.until > Date.now() ? Math.ceil((a.until - Date.now()) / 1000) : 0;
  };
  const recordLoginFail = (req) => {
    const ip = clientIp(req);
    const a = loginFails.get(ip) || { n: 0, until: 0 };
    if (a.until > Date.now()) return;
    if (++a.n >= LOGIN_MAX_FAILS) { a.n = 0; a.until = Date.now() + LOGIN_LOCK_MS; }
    loginFails.set(ip, a);
  };
  const safeEqualStr = (a, b) => {
    const ba = Buffer.from(String(a ?? ""));
    const bb = Buffer.from(String(b ?? ""));
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  };

  const sendJson = (res, obj, code = 200) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };

  const send401 = (res, message = "未登录或会话已过期") => sendJson(res, { error: message }, 401);

  const broadcast = (event) => {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of clients) {
      if (res.destroyed || res.writableNeedDrain) { clients.delete(res); continue; }
      try { res.write(data); } catch { clients.delete(res); }
    }
  };
  const spawnShell = deps.spawnShell || (() => spawn("script", ["-qfc", "bash", "/dev/null"], { cwd: process.env.HOME || "/", env: { ...process.env, PROMPT_COMMAND: 'printf "\\033]2;%s\\007" "$PWD"' } }));
  let termShell = null;
  let termBuffer = "";
  let termGen = 0;
  const MAX_TERM_BUFFER = 1024 * 1024;
  const ensureShell = () => {
    if (termShell && termShell.exitCode === null && !termShell.killed) return termShell;
    const gen = ++termGen;
    termShell = spawnShell();
    const push = (d) => {
      if (gen !== termGen) return;
      const s = String(d);
      termBuffer += s;
      if (termBuffer.length > MAX_TERM_BUFFER) termBuffer = termBuffer.slice(-MAX_TERM_BUFFER);
      broadcast({ type: "term", data: s });
    };
    termShell.stdout?.on("data", push);
    termShell.stderr?.on("data", push);
    termShell.on("exit", () => {
      if (gen !== termGen) return;
      broadcast({ type: "term", data: "\n[会话已结束]\n" });
      termShell = null;
    });
    termShell.on("error", (e) => { if (gen === termGen) broadcast({ type: "term", data: `\n[shell 错误] ${e.message}\n` }); });
    return termShell;
  };
  const sseGuard = setInterval(() => {
    for (const res of clients) if (res.writableNeedDrain) res.destroy();
  }, 15000);
  const readBody = async (req, max = 10 * 1024 * 1024) => {
    let b = "";
    for await (const c of req) {
      b += c;
      if (b.length > max) { const e = new Error("请求体过大"); e.statusCode = 413; throw e; }
    }
    return b;
  };
  const fsWriteGuard = async (body, res) => {
    const auth = await readAuth();
    if (!auth || !verifyPassword(body.password || "", auth)) {
      sendJson(res, { error: "密码错误，操作未执行" }, 403);
      return false;
    }
    return true;
  };

  const usageStore = await createUsageStore({ filePath: join(dirname(configPath), "usage.json") });

  const alertsManager = await createAlertsManager({ config, configPath, exec: execCmd, sessionFactory: deps.sessionFactory });

  const session = createSession({
    config,
    onEvent: broadcast,
    onConfirm: (info) => new Promise((resolve) => {
      const id = String(++seq);
      waiters.set(id, resolve);
      broadcast({ type: "confirm", id, ...info });
    }),
    onUsage: (u) => usageStore.record(u),
    onClearRequest: () => broadcast({ type: "clearRequest" }),
  });

  const monitor = createMonitor();
  const monitorTimer = setInterval(() => monitor.tick(), 1000);
  const monitorHistory = await createMonitorHistory({ filePath: config.monitorHistoryPath || join(dirname(configPath), "monitor-history.jsonl") });
  let lastCaptureT = Math.floor(Date.now() / 1000) - 60;
  const historyTimer = setInterval(async () => {
    const now = Math.floor(Date.now() / 1000);
    const pick = (arr) => (arr || []).filter((p) => p.t > lastCaptureT && p.t <= now);
    const agg = aggregateMinute(pick(monitor.net().samples), pick(monitor.io().samples), pick(monitor.trend().samples));
    lastCaptureT = now;
    if (agg) await monitorHistory.add(agg).catch(() => {});
  }, 60000);
  const prewarmTimer = setTimeout(() => collectExtras().catch(() => {}), 3000);
  const metricsWarmTimer = setTimeout(() => { metricsCache("metrics", () => collectAll(config)).catch(() => {}); }, 2000);
  let alertTimer = null;
  let alertStartTimer = null;
  if (!deps.noAlertsTimer && config.apiKey) {
    alertStartTimer = setTimeout(() => alertsManager.tick(), 5000);
    alertTimer = setInterval(() => alertsManager.tick(), 60000);
  }

  const metricAlerts = await createMetricAlerts({
    config, configPath, monitor, exec: execCmd, aggregate: true,
    onNotify: async (e) => {
      try {
        if (e.kind === "aggregate") {
          const to = [...new Set(e.events.flatMap((x) => x.rule.recipients || []))];
          let rootCause = "";
          try {
            const makeSess = deps.sessionFactory || ((cfg) => createSession({ config: cfg, onConfirm: async () => false, onEvent: () => {}, onUsage: () => {} }));
            const lines = e.events.map((x) => `- P${x.incident.level} ${metricLabel(x.rule.metric)} 当前 ${x.value}${METRICS[x.rule.metric]?.unit || ""}（规则：${x.rule.name}）`).join("\n");
            rootCause = await makeSess(config).send(`服务器 ${e.host} 同时出现以下告警，请用一两句话推测可能的根本原因：\n${lines}`);
          } catch {}
          const { subject, html } = buildAlertEmail("aggregate", { host: e.host, events: e.events, rootCause, panelBaseUrl: config.panelBaseUrl || "" });
          if (to.length) await sendEmail({ ...(config.alertSmtp || {}), to: to.join(",") }, subject, "", execCmd, { html });
          await sendWebhook(config.metricAlertWebhook || config.sslAlerts?.webhook, { kind: "aggregate", host: e.host, count: e.events.length });
          return;
        }
        const { subject, html } = buildAlertEmail(e.kind, { rule: e.rule, incident: e.incident, value: e.value, host: e.host, panelBaseUrl: config.panelBaseUrl || "" });
        const to = [...(e.rule.recipients || [])];
        if (e.kind === "escalation") to.push(...(e.rule.escalateTo || []));
        if (to.length) await sendEmail({ ...(config.alertSmtp || {}), to: to.join(",") }, subject, "", execCmd, { html });
        await sendWebhook(config.metricAlertWebhook || config.sslAlerts?.webhook, { kind: e.kind, level: e.incident.level, metric: e.rule.metric, value: e.value, host: e.host, incidentId: e.incident.id });
      } catch (err) { console.error("[fixflow] 指标告警通知失败:", err?.message || err); }
    },
  });
  let metricAlertTimer = null;
  if (!deps.noAlertsTimer && config.apiKey) {
    metricAlertTimer = setInterval(() => metricAlerts.tick(), 60000);
  }
  let memAlerting = false;
  const memTimer = setInterval(() => {
    const rssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const over = rssMB > config.memLimitMB;
    if (over && !memAlerting) {
      memAlerting = true;
      console.warn(`[fixflow] 面板进程内存 ${rssMB}MB 已超过上限 ${config.memLimitMB}MB`);
      broadcast({ type: "memAlert", usedMB: rssMB, limitMB: config.memLimitMB });
    } else if (!over && memAlerting) {
      memAlerting = false;
      broadcast({ type: "memOk", usedMB: rssMB, limitMB: config.memLimitMB });
    }
  }, 10000);
  let lastFailedSet = null;
  const checkFailedServices = async () => {
    try {
      const r = await execCmd("systemctl --state=failed --no-legend --no-pager");
      const failed = parseFailedServices(r.stdout || "");
      if (lastFailedSet === null) { lastFailedSet = failed; return; }
      const { newFailures, recoveries } = diffFailedServices(lastFailedSet, failed);
      lastFailedSet = failed;
      const hook = config.sslAlerts.webhook || config.metricAlertWebhook;
      for (const s of newFailures) {
        await sendWebhook(hook, { kind: "service-failed", unit: s });
        await sendEmail(config.sslAlerts.smtp, `[Fixflow] 服务进入失败状态：${s}`, `服务 ${s} 已进入 failed 状态，请检查。`);
      }
      for (const s of recoveries) {
        await sendWebhook(hook, { kind: "service-recovered", unit: s });
        await sendEmail(config.sslAlerts.smtp, `[Fixflow] 服务已恢复：${s}`, `服务 ${s} 已恢复正常。`);
      }
    } catch {}
  };
  let failedTimer = null;
  if (!deps.noAlertsTimer && config.apiKey) failedTimer = setInterval(checkFailedServices, 60000);

  let lastDown = null;
  const checkDownServices = async () => {
    try {
      const now = {};
      for (const s of config.downServices || []) {
        const r = await execCmd(`systemctl is-active ${s}`);
        now[s] = parseDownState(r);
      }
      if (lastDown === null) { lastDown = now; return; }
      const events = diffDownServices(lastDown, now);
      lastDown = now;
      const st = await alertsManager.smtp();
      for (const e of events) {
        if (!st.to) return;
        if (e.kind === "down") await sendEmail({ ...st, to: st.to }, `[Fixflow] 服务异常关闭：${e.name}`, `服务 ${e.name} 已停止（systemd 状态 ${e.state}），请检查。`);
        else await sendEmail({ ...st, to: st.to }, `[Fixflow] 服务已恢复：${e.name}`, `服务 ${e.name} 已恢复正常。`);
      }
    } catch {}
  };
  let downTimer = null;
  if (!deps.noAlertsTimer) downTimer = setInterval(checkDownServices, 60000);

  async function collectStatus() {
    const [uptime, mem, df, nproc, osRelease, uname, procUptime] = await Promise.all([
      runCommand("uptime"),
      runCommand("free -m"),
      runCommand("df -h /"),
      runCommand("nproc"),
      runCommand("cat /etc/os-release"),
      runCommand("uname -m"),
      runCommand("cat /proc/uptime"),
    ]);
    const ncpu = parseInt(nproc.stdout.trim() || "1", 10) || 1;
    const p = parseLoad(uptime.stdout || "");
    const load = p.load;
    const memPct = parseFree(mem.stdout || "").usedPct;
    const disk = parseDf(df.stdout || "").find((d) => d.mount === "/")?.usedPct ?? 0;
    const osMatch = (osRelease.stdout || "").match(/PRETTY_NAME="?([^"\n]+)/);
    const uptimeSec = parseFloat(procUptime.stdout?.trim()?.split(/\s+/)[0] || "");
    return {
      sys: {
        os: osMatch?.[1] || "未知系统",
        arch: uname.stdout?.trim() || "unknown",
        uptime: Number.isFinite(uptimeSec) ? formatUptime(uptimeSec) : "—",
      },
      load: { pct: Math.min(100, Math.round((load / Math.max(1, ncpu)) * 100)), load, ncpu, load1: p.load1, load5: p.load5, load15: p.load15 },
      cpu: { pct: monitor.cpu() },
      mem: { pct: memPct },
      disk: { pct: disk },
    };
  }

  const extrasCache = createTtlCache(15000);
  async function collectExtras() {
    return extrasCache("overview-extras", async () => {
      const [sysd, conn, dock, freeR, whoR, psR] = await Promise.all([
        collectSystemd().catch(() => null),
        collectConnectionSummary().catch(() => null),
        collectDocker().catch(() => null),
        runCommand("free -m").catch(() => null),
        runCommand("who").catch(() => null),
        runCommand("ps -e --no-headers").catch(() => null),
      ]);
      const free = freeR?.stdout ? parseFree(freeR.stdout) : null;
      let sslWarn = [];
      try {
        const { results } = await collectSslAll(config);
        for (const r of results) {
          if (typeof r.daysLeft !== "number" || r.daysLeft > 30) continue;
          sslWarn.push({ name: r.cn || r.host || r.path || r.label || "?", daysLeft: r.daysLeft });
        }
      } catch {}
      const est = conn?.est || {};
      return {
        swap: free ? { used: free.swapUsed, total: free.swapTotal } : null,
        tcp: Object.values(est).reduce((s, n) => s + n, 0),
        procs: psR ? (psR.stdout || "").split("\n").filter((l) => l.trim()).length : null,
        docker: dock?.containers ? dock.containers.filter((c) => c.state === "running").length : null,
        users: whoR ? parseWho(whoR.stdout || "").length : null,
        failedSvcs: sysd?.summary ? sysd.summary.failed : null,
        sslWarn,
      };
    });
  }

  const captchaIdFromCookie = (req) => parseCookie(req.headers.cookie || "").fixflow_captcha || "";

  const handler = async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const sc = (req.socket.encrypted || (config.trustProxy && req.headers["x-forwarded-proto"] === "https")) ? "; Secure" : "";
    try {
      const base = config.panelPath ? "/" + config.panelPath : "";
      if (base) {
        if (url.pathname === base) { res.writeHead(301, { Location: base + "/" + (url.search || "") }); res.end(); return; }
        if (url.pathname === base + "/") url.pathname = "/";
        else if (url.pathname.startsWith(base + "/")) url.pathname = url.pathname.slice(base.length);
        else { res.writeHead(404); res.end("Not Found"); return; }
      }
      const isPublic = url.pathname === "/api/login" || url.pathname === "/api/register" || url.pathname === "/api/status" || url.pathname === "/api/captcha";
      const needsAuth = url.pathname.startsWith("/api/") && !isPublic;
      if (needsAuth && !authHeader(req)) { send401(res); return; }

      if (url.pathname === "/api/captcha" && req.method === "GET") {
        const { id, code } = captchas.create();
        res.writeHead(200, {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "no-store",
          "Set-Cookie": `fixflow_captcha=${id}; Path=/; HttpOnly; Max-Age=300; SameSite=Lax`,
        });
        res.end(captchaSvg(code));
      } else if (url.pathname === "/api/status" && req.method === "GET") {
        const auth = await readAuth();
        sendJson(res, { registered: Boolean(auth), loggedIn: Boolean(authHeader(req)), username: authHeader(req) ? (auth?.username || "") : "" });
      } else if (url.pathname === "/api/register" && req.method === "POST") {
        const wait = loginLockedFor(req);
        if (wait) { sendJson(res, { error: `尝试过于频繁，请 ${wait} 秒后再试` }, 429); return; }
        const existing = await readAuth();
        if (existing) { sendJson(res, { error: "已注册账号，请直接登录" }, 409); return; }
        const body = await readBody(req, 64 * 1024);
        const { username, password, captchaCode } = JSON.parse(body || "{}");
        if (!captchas.verify(captchaIdFromCookie(req), captchaCode)) {
          recordLoginFail(req);
          sendJson(res, { error: "验证码错误或已过期" }, 400);
          return;
        }
        if (!username || !isStrongPassword(password)) {
          recordLoginFail(req);
          sendJson(res, { error: "密码需 8-24 位，且包含大小写字母、数字和特殊字符" }, 400);
          return;
        }
        const { salt, hash } = await hashPasswordAsync(password);
        await writeAuth({ username, salt, hash });
        sendJson(res, { ok: true });
      } else if (url.pathname === "/api/login" && req.method === "POST") {
        const wait = loginLockedFor(req);
        if (wait) { sendJson(res, { error: `尝试过于频繁，请 ${wait} 秒后再试` }, 429); return; }
        const body = await readBody(req, 64 * 1024);
        const { username, password, captchaCode } = JSON.parse(body || "{}");
        if (!captchas.verify(captchaIdFromCookie(req), captchaCode)) {
          recordLoginFail(req);
          sendJson(res, { error: "验证码错误或已过期" }, 400);
          return;
        }
        const auth = await readAuth();
        if (!auth || !safeEqualStr(auth.username, username) || !(await verifyPasswordAsync(password, auth))) {
          recordLoginFail(req);
          console.warn(`[fixflow] 登录失败 ip=${clientIp(req)} user=${String(username || "").slice(0, 32)}`);
          sendJson(res, { error: "用户名或密码错误" }, 401);
          return;
        }
        loginFails.delete(clientIp(req));
        sessions.revokeByUser(auth.username);
        const token = sessions.create(auth.username);
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Set-Cookie": `fixflow_token=${token}; HttpOnly; Path=/; Max-Age=43200; SameSite=Lax${sc}`,
        });
        res.end(JSON.stringify({ ok: true }));
      } else if (url.pathname === "/api/logout" && req.method === "POST") {
        sessions.revoke(authHeader(req));
          res.writeHead(200, { "Content-Type": "application/json", "Set-Cookie": `fixflow_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${sc}` });
        res.end(JSON.stringify({ ok: true }));
      } else if (url.pathname === "/api/password" && req.method === "POST") {
        const body = await readBody(req, 64 * 1024);
        const { currentPassword, newPassword } = JSON.parse(body || "{}");
        const auth = await readAuth();
        if (!auth || !(await verifyPasswordAsync(currentPassword || "", auth))) { sendJson(res, { error: "当前密码错误" }, 403); return; }
        if (!isStrongPassword(newPassword)) { sendJson(res, { error: "新密码需 8-24 位，且包含大小写字母、数字和特殊字符" }, 400); return; }
        if (newPassword === currentPassword) { sendJson(res, { error: "新密码不能与当前密码相同" }, 400); return; }
        const { salt, hash } = await hashPasswordAsync(newPassword);
        await writeAuth({ username: auth.username, salt, hash });
        sessions.revokeAll();
        res.writeHead(200, { "Content-Type": "application/json", "Set-Cookie": `fixflow_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${sc}` });
        res.end(JSON.stringify({ ok: true }));
      } else if (url.pathname === "/api/metrics") {
        const q = url.searchParams;
        const data = await metricsCache("metrics", () => { if (process.env.FF_DEBUG_METRICS) console.log(`[metrics] ${Date.now()}`); return collectAll(config); });
        if (data.ssl) data.ssl.renewTool = (await renewToolCache("tool", () => detectRenewTool())).tool;
        if (data.ssl?.results) {
          try {
            const { alerts, lastNotified } = checkSslAlerts(data.ssl.results, config.sslAlerts);
            if (alerts.length) {
              config.sslAlerts.lastNotified = lastNotified;
              await persistConfig();
              for (const a of alerts) {
                await sendWebhook(config.sslAlerts.webhook, a);
                await sendEmail(config.sslAlerts.smtp, `[Fixflow] 证书即将到期：${a.label}`, `${a.label} 剩余 ${a.daysLeft} 天（${a.notAfter}）`);
              }
            }
          } catch {}
        }
        if (q.get("port")) data.portScan = await collectPorts(q.get("port"));
        if (q.get("ping")) data.pingResult = await collectConnectivity([q.get("ping")]);
        if (q.get("probe")) data.probeResult = await collectRemoteProbe(q.get("probe"));
        sendJson(res, data);
      } else if (url.pathname === "/api/logs/sources" && req.method === "GET") {
        sendJson(res, await logsSourcesCache("logs-sources", () => collectLogSources({ run: execCmd })));
      } else if (url.pathname === "/api/logs" && req.method === "POST") {
        const body = await readBody(req);
        const { service, container, pm2, lines } = JSON.parse(body || "{}");
        if (!service && !container && !pm2) { sendJson(res, { error: "缺少服务或容器名" }, 400); return; }
        sendJson(res, await collectLogs({ service: String(service || ""), container: String(container || ""), pm2: String(pm2 || ""), lines }, { run: execCmd }));
      } else if (url.pathname === "/api/overview") {
        const net = monitor.net();
        const io = monitor.io();
        const nics = Object.keys(net.last || {}).filter((n) => n !== "lo");
        sendJson(res, {
          status: await statusCache("status", () => { if (process.env.FF_DEBUG_METRICS) console.log(`[status] ${Date.now()}`); return collectStatus(); }),
          nics,
          net: net.samples,
          io: io.samples,
          trend: monitor.trend().samples,
          usage: usageStore.daily(30),
          panelMem: { usedMB: Math.round(process.memoryUsage().rss / 1024 / 1024), limitMB: config.memLimitMB },
          extras: await collectExtras(),
        });
      } else if (url.pathname === "/api/monitor-history" && req.method === "GET") {
        const minutes = Math.max(1, Math.min(7 * 24 * 60, Number(url.searchParams.get("minutes")) || 60));
        sendJson(res, monitorHistory.query(minutes));
      } else if (url.pathname === "/api/usage" && req.method === "GET") {
        const days = parseInt(url.searchParams.get("days") || "30", 10);
        sendJson(res, { days: usageStore.daily(Number.isFinite(days) ? days : 30) });
      } else if (url.pathname === "/api/alerts" && req.method === "GET") {
        const alerts = await alertsManager.list();
        const st = await alertsManager.smtp();
        const history = {};
        for (const a of alerts) history[a.id] = (await alertsManager.history(a.id)).slice(0, 3);
        sendJson(res, { alerts, smtp: { host: st.host, port: st.port, user: st.user, from: st.from, to: st.to, hasPass: Boolean(st.pass) }, history });
      } else if (url.pathname === "/api/alerts" && req.method === "POST") {
        const body = await readBody(req);
        const { name, instruction, time, recipients } = JSON.parse(body || "{}");
        if (!name || !instruction || !time || !Array.isArray(recipients) || !recipients.length) {
          sendJson(res, { error: "名称/指令/时间/收件人必填" }, 400);
          return;
        }
        const alert = { id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: String(name), instruction: String(instruction), time: String(time), recipients, enabled: true };
        const alerts = await alertsManager.list();
        alerts.push(alert);
        await alertsManager.save(alerts);
        sendJson(res, { ok: true, alert });
      } else if (url.pathname === "/api/alerts" && req.method === "PATCH") {
        const body = await readBody(req);
        const { id, name, instruction, time, recipients, enabled } = JSON.parse(body || "{}");
        const alerts = await alertsManager.list();
        const a = alerts.find((x) => x.id === id);
        if (!a) { sendJson(res, { error: "告警不存在" }, 404); return; }
        if (name !== undefined) a.name = String(name);
        if (instruction !== undefined) a.instruction = String(instruction);
        if (time !== undefined) a.time = String(time);
        if (Array.isArray(recipients)) a.recipients = recipients;
        if (enabled !== undefined) a.enabled = Boolean(enabled);
        await alertsManager.save(alerts);
        sendJson(res, { ok: true });
      } else if (url.pathname === "/api/alerts" && req.method === "DELETE") {
        const body = await readBody(req);
        const { id } = JSON.parse(body || "{}");
        await alertsManager.save((await alertsManager.list()).filter((x) => x.id !== id));
        sendJson(res, { ok: true });
      } else if (url.pathname === "/api/alerts/smtp" && req.method === "POST") {
        const body = await readBody(req);
        const { host, port, user, pass, from, to } = JSON.parse(body || "{}");
        await alertsManager.saveSmtp({ host, port, user, pass, from, to });
        sendJson(res, { ok: true });
      } else if (url.pathname === "/api/alerts/run" && req.method === "POST") {
        const body = await readBody(req);
        const { id } = JSON.parse(body || "{}");
        const r = await alertsManager.runNow(id);
        sendJson(res, r, r.ok ? 200 : 400);
      } else if (url.pathname === "/api/metric-alerts" && req.method === "GET") {
        const [rules, settings] = await Promise.all([metricAlerts.list(), metricAlerts.settings()]);
        sendJson(res, { rules, incidents: metricAlerts.incidents(), ...settings });
      } else if (url.pathname === "/api/metric-alerts" && req.method === "POST") {
        const body = await readBody(req);
        const r = JSON.parse(body || "{}");
        if (!r.name || !Object.keys(METRICS).includes(r.metric) || !["<=", ">="].includes(r.op) || !Number.isFinite(Number(r.threshold)) || !Array.isArray(r.recipients) || !r.recipients.length) {
          sendJson(res, { error: "名称/指标/运算符/阈值/收件人必填" }, 400);
          return;
        }
        const rule = {
          id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          name: String(r.name), metric: r.metric, op: r.op, threshold: Number(r.threshold),
          duration: Number(r.duration) || 5, level: Math.min(5, Math.max(1, Number(r.level) || 3)),
          recipients: r.recipients, enabled: true,
          env: r.env || "", service: r.service || "", team: r.team || "", owner: r.owner || "",
          runbookUrl: r.runbookUrl || "", dashboardUrl: r.dashboardUrl || "", logUrl: r.logUrl || "",
          escalateTo: Array.isArray(r.escalateTo) ? r.escalateTo : [], escalateAfter: Number(r.escalateAfter) || 30,
        };
        const rules = await metricAlerts.list();
        rules.push(rule);
        await metricAlerts.save(rules);
        sendJson(res, { ok: true, rule });
      } else if (url.pathname === "/api/metric-alerts" && req.method === "PATCH") {
        const body = await readBody(req);
        const r = JSON.parse(body || "{}");
        const rules = await metricAlerts.list();
        const rule = rules.find((x) => x.id === r.id);
        if (!rule) { sendJson(res, { error: "规则不存在" }, 404); return; }
        for (const k of ["name", "metric", "op", "env", "service", "team", "owner", "runbookUrl", "dashboardUrl", "logUrl"]) if (r[k] !== undefined) rule[k] = String(r[k]);
        for (const k of ["threshold", "duration", "level", "escalateAfter"]) if (r[k] !== undefined) rule[k] = Number(r[k]);
        if (r.enabled !== undefined) rule.enabled = Boolean(r.enabled);
        if (Array.isArray(r.recipients)) rule.recipients = r.recipients;
        if (Array.isArray(r.escalateTo)) rule.escalateTo = r.escalateTo;
        await metricAlerts.save(rules);
        sendJson(res, { ok: true });
      } else if (url.pathname === "/api/metric-alerts" && req.method === "DELETE") {
        const body = await readBody(req);
        const { id } = JSON.parse(body || "{}");
        await metricAlerts.save((await metricAlerts.list()).filter((x) => x.id !== id));
        sendJson(res, { ok: true });
      } else if (url.pathname === "/api/metric-alerts/ack" && req.method === "POST") {
        const body = await readBody(req);
        const { id } = JSON.parse(body || "{}");
        const r = await metricAlerts.ack(id);
        sendJson(res, r, r.ok ? 200 : 404);
      } else if (url.pathname === "/api/metric-alerts/run" && req.method === "POST") {
        const r = await metricAlerts.runRule();
        sendJson(res, r);
      } else if (url.pathname === "/api/metric-alerts/settings" && req.method === "POST") {
        const body = await readBody(req);
        await metricAlerts.saveSettings(JSON.parse(body || "{}"));
        sendJson(res, { ok: true });
      } else if (url.pathname === "/api/report") {
        const data = await metricsCache("metrics", () => { if (process.env.FF_DEBUG_METRICS) console.log(`[metrics] ${Date.now()}`); return collectAll(config); });
        const s = data.system;
        const now = formatDateTime(new Date());
        let md = `# Fixflow 系统体检报告\n\n生成时间：${now}\n\n## 总览\n\n| 项目 | 状态 | 摘要 |\n|---|---|---|\n`;
        for (const it of s?.health?.items || []) {
          const icon = it.status === "ok" ? "✅ 正常" : it.status === "warn" ? "⚠️ 警告" : "❌ 异常";
          md += `| ${it.name} | ${icon} | ${it.detail} |\n`;
        }
        md += `\n## 风险项\n\n`;
        md += s?.health?.risks?.length
          ? s.health.risks.map((r) => `- ${r}`).join("\n") + "\n"
          : "未发现风险。\n";
        md += `\n## 系统详情\n\n`;
        for (const key of ["uptime", "memory", "disk"]) {
          const item = s?.[key];
          if (item) md += `### ${key}\n\n\`\`\`\n${item.detail}\n\`\`\`\n\n`;
        }
        res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
        res.end(md);
      } else if (url.pathname === "/api/models") {
        try {
          const baseUrl = url.searchParams.get("baseUrl") || config.baseUrl;
          const apiKey = url.searchParams.get("apiKey") || config.apiKey;
          const models = await fetchModels(baseUrl, apiKey);
          sendJson(res, { models });
        } catch (e) {
          sendJson(res, { error: e.message }, 400);
        }
      } else if (url.pathname === "/api/ssl" && req.method === "GET") {
        const data = await sslCache("ssl", () => collectSslAll(config));
        const { tool } = await renewToolCache("tool", () => detectRenewTool());
        sendJson(res, { ...data, renewTool: tool });
      } else if (url.pathname === "/api/ssl" && req.method === "POST") {
        const body = await readBody(req);
        const { type, host, port, path, label } = JSON.parse(body || "{}");
        if (type === "local" ? !path : !host) {
          sendJson(res, { error: type === "local" ? "缺少证书路径" : "缺少域名" }, 400);
          return;
        }
        const entry = {
          id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          type: type === "local" ? "local" : "remote",
          host: host || "", port: port || "443", path: path || "",
          label: label || "", enabled: true, source: "manual",
        };
        config.sslSites.push(entry);
        await persistConfig();
        sslCache.clear("ssl");
        sendJson(res, { ok: true, entry });
      } else if (url.pathname === "/api/ssl" && req.method === "PATCH") {
        const body = await readBody(req);
        const { id, label, enabled } = JSON.parse(body || "{}");
        const entry = config.sslSites.find((e) => e.id === id);
        if (!entry) { sendJson(res, { error: "条目不存在" }, 404); return; }
        if (label !== undefined) entry.label = String(label);
        if (enabled !== undefined) entry.enabled = Boolean(enabled);
        await persistConfig();
        sslCache.clear("ssl");
        sendJson(res, { ok: true });
      } else if (url.pathname === "/api/ssl" && req.method === "DELETE") {
        const body = await readBody(req);
        const { id } = JSON.parse(body || "{}");
        const entry = config.sslSites.find((e) => e.id === id);
        if (!entry || entry.source !== "manual") {
          sendJson(res, { error: "自动发现的证书不可删除" }, 403);
          return;
        }
        config.sslSites = config.sslSites.filter((e) => e.id !== id);
        await persistConfig();
        sslCache.clear("ssl");
        sendJson(res, { ok: true });
      } else if (url.pathname === "/api/db/connections" && req.method === "GET") {
        sendJson(res, { connections: config.dbConnections.map(sanitizeConn) });
      } else if (url.pathname === "/api/db/connections" && req.method === "POST") {
        const body = await readBody(req);
        const { name, type, host, port, database, user, password, path, enabled } = JSON.parse(body || "{}");
        const err = validateDbConn({ type, host, user, path });
        if (err) { sendJson(res, { error: err }, 400); return; }
        const entry = {
          id: `db${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          name: String(name || ""), type: String(type),
          host: host || "", port: String(port || DB_DEFAULT_PORT[type]),
          database: database || "", user: user || "", password: password || "",
          path: path || "", enabled: enabled !== false,
        };
        config.dbConnections.push(entry);
        await persistConfig();
        sendJson(res, { ok: true, entry: sanitizeConn(entry) });
      } else if (url.pathname === "/api/db/connections" && req.method === "PATCH") {
        const body = await readBody(req);
        const { id, name, type, host, port, database, user, password, path, enabled } = JSON.parse(body || "{}");
        const entry = config.dbConnections.find((c) => c.id === id);
        if (!entry) { sendJson(res, { error: "连接不存在" }, 404); return; }
        if (type !== undefined && !DB_TYPES.has(type)) { sendJson(res, { error: "不支持的数据库类型" }, 400); return; }
        if (name !== undefined) entry.name = String(name);
        if (type !== undefined) entry.type = String(type);
        if (host !== undefined) entry.host = host;
        if (port !== undefined) entry.port = String(port);
        if (database !== undefined) entry.database = database;
        if (user !== undefined) entry.user = user;
        if (password === null) entry.password = "";
        else if (password) entry.password = String(password);
        if (path !== undefined) entry.path = path;
        if (enabled !== undefined) entry.enabled = Boolean(enabled);
        await persistConfig();
        sendJson(res, { ok: true });
      } else if (url.pathname === "/api/db/connections" && req.method === "DELETE") {
        const body = await readBody(req);
        const { id } = JSON.parse(body || "{}");
        const before = config.dbConnections.length;
        config.dbConnections = config.dbConnections.filter((c) => c.id !== id);
        if (config.dbConnections.length === before) { sendJson(res, { error: "连接不存在" }, 404); return; }
        await persistConfig();
        sendJson(res, { ok: true });
      } else if (url.pathname === "/api/db/test" && req.method === "POST") {
        const body = await readBody(req);
        const { id, password } = JSON.parse(body || "{}");
        const entry = config.dbConnections.find((c) => c.id === id);
        if (!entry) { sendJson(res, { error: "连接不存在" }, 404); return; }
        const r = await dbTest(entry, password === undefined ? entry.password : String(password || ""));
        sendJson(res, r);
      } else if (url.pathname === "/api/ssl/renew" && req.method === "POST") {
        const body = await readBody(req);
        const { id, password } = JSON.parse(body || "{}");
        const auth = await readAuth();
        if (!auth || !verifyPassword(password || "", auth)) {
          sendJson(res, { error: "密码错误，操作未执行" }, 403);
          return;
        }
        const entry = config.sslSites.find((e) => e.id === id);
        if (!entry || entry.type !== "local") {
          sendJson(res, { error: "仅本机证书文件支持续签" }, 400);
          return;
        }
        const data = await collectSslAll(config);
        const live = data.results.find((r) => r.id === id) || entry;
        const result = await renewCert({ ...entry, cn: live.cn });
        sslCache.clear("ssl");
        sendJson(res, result);
      } else if (url.pathname === "/api/config" && req.method === "GET") {
        sendJson(res, { baseUrl: config.baseUrl, model: config.model, apiKey: config.apiKey ? "••••" + config.apiKey.slice(-4) : "", sslSites: config.sslSites, pingTargets: config.pingTargets, serviceKeywords: config.serviceKeywords, lang: config.lang, theme: config.theme, fsCollapsed: config.fsCollapsed, memLimitMB: config.memLimitMB });
      } else if (url.pathname === "/api/config" && req.method === "POST") {
        const body = await readBody(req);
        const { baseUrl, apiKey, model, sslSites, pingTargets, serviceKeywords, lang, theme, fsCollapsed, memLimitMB } = JSON.parse(body || "{}");
        if (baseUrl) config.baseUrl = baseUrl;
        if (apiKey) config.apiKey = apiKey;
        if (model) config.model = model;
        if (Array.isArray(sslSites)) config.sslSites = sslSites;
        if (Array.isArray(pingTargets)) config.pingTargets = pingTargets;
        if (Array.isArray(serviceKeywords)) config.serviceKeywords = serviceKeywords.map((s) => String(s).trim()).filter(Boolean);
        if (lang === "en" || lang === "zh") config.lang = lang;
        if (theme === "light" || theme === "dark") config.theme = theme;
        if (typeof fsCollapsed === "boolean") config.fsCollapsed = fsCollapsed;
        if (Number.isFinite(memLimitMB) && memLimitMB > 0) config.memLimitMB = memLimitMB;
        let existing = {};
        existing = await readJsonFile(configPath);
        const saved = { ...existing, baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, sslSites: config.sslSites, pingTargets: config.pingTargets, serviceKeywords: config.serviceKeywords, lang: config.lang, theme: config.theme, fsCollapsed: config.fsCollapsed, memLimitMB: config.memLimitMB };
        await mkdir(dirname(configPath), { recursive: true });
        await writeFile(configPath, JSON.stringify(saved, null, 2));
        sendJson(res, { ok: true, baseUrl: config.baseUrl, model: config.model, apiKey: config.apiKey ? "••••" + config.apiKey.slice(-4) : "", sslSites: config.sslSites, pingTargets: config.pingTargets, serviceKeywords: config.serviceKeywords, lang: config.lang, theme: config.theme, fsCollapsed: config.fsCollapsed, memLimitMB: config.memLimitMB });
      } else if (url.pathname === "/api/history" && req.method === "GET") {
        sendJson(res, { messages: await readHistoryFile(historyPath) });
      } else if (url.pathname === "/api/history" && req.method === "POST") {
        const body = await readBody(req);
        const { messages } = JSON.parse(body || "{}");
        if (!Array.isArray(messages)) { res.writeHead(400); res.end("{}"); return; }
        const existing = await readHistoryFile(historyPath);
        await writeHistoryFile(historyPath, [...existing, ...messages]);
        sendJson(res, {});
      } else if (url.pathname === "/api/history/clear" && req.method === "POST") {
        const body = await readBody(req);
        const { password } = JSON.parse(body || "{}");
        if (!(await fwVerify(password || ""))) { sendJson(res, { error: "密码错误，操作未执行" }, 403); return; }
        await writeHistoryFile(historyPath, []);
        session.clear();
        sendJson(res, { ok: true });
      } else if (url.pathname === "/api/chat" && req.method === "POST") {
        const body = await readBody(req);
        const { input, images = [] } = JSON.parse(body || "{}");
        sendJson(res, { ok: true });
        session.send(input, images)
          .then(() => broadcast({ type: "done" }))
          .catch((e) => { console.error("[fixflow] 对话错误:", e?.message || e); broadcast({ type: "error", text: String(e) }); });
      } else if (url.pathname === "/api/confirm" && req.method === "POST") {
        const body = await readBody(req);
        const { id, ok } = JSON.parse(body || "{}");
        const resolve = waiters.get(id);
        if (resolve) { waiters.delete(id); resolve(Boolean(ok)); }
        sendJson(res, {});
      } else if (url.pathname === "/api/abort" && req.method === "POST") {
        session.abort();
        broadcast({ type: "aborted" });
        sendJson(res, {});
      } else if (url.pathname === "/api/term/open" && req.method === "POST") {
        ensureShell();
        sendJson(res, { history: termBuffer });
      } else if (url.pathname === "/api/term/input" && req.method === "POST") {
        const body = await readBody(req);
        const { data } = JSON.parse(body || "{}");
        const sh = ensureShell();
        try { sh.stdin.write(String(data ?? "")); } catch {}
        sendJson(res, {});
      } else if (url.pathname === "/api/term/close" && req.method === "POST") {
        termGen++;
        if (termShell) { try { termShell.kill(); } catch {} termShell = null; }
        termBuffer = "";
        sendJson(res, {});
      } else if (url.pathname === "/api/term/history" && req.method === "GET") {
        sendJson(res, { records: await readHistoryFile(termHistoryPath) });
      } else if (url.pathname === "/api/term/history" && req.method === "POST") {
        const body = await readBody(req);
        const { command } = JSON.parse(body || "{}");
        const cmd = String(command || "").trim();
        if (cmd) {
          const auth = await readAuth();
          const rec = { time: new Date().toISOString().replace("T", " ").slice(0, 19), user: auth?.username || "?", command: cmd };
          const list = await readHistoryFile(termHistoryPath);
          list.push(rec);
          await writeHistoryFile(termHistoryPath, list);
        }
        sendJson(res, {});
      } else if (url.pathname === "/api/panel-audit" && req.method === "GET") {
        sendJson(res, { records: await readHistoryFile(panelAuditPath) });
      } else if (url.pathname === "/api/panel-audit" && req.method === "POST") {
        const body = await readBody(req);
        const { records } = JSON.parse(body || "{}");
        if (Array.isArray(records) && records.length) {
          const auth = await readAuth();
          const user = authHeader(req) ? (auth?.username || "?") : "?";
          const now = new Date().toISOString().replace("T", " ").slice(0, 19);
          const list = await readHistoryFile(panelAuditPath);
          for (const r of records.slice(0, 200)) {
            list.push({
              time: now, user,
              page: String(r.page || ""),
              action: String(r.action || ""),
              target: String(r.target || ""),
              detail: String(r.detail || ""),
            });
          }
          await writeAuditFile(panelAuditPath, list);
        }
        sendJson(res, {});
      } else if (url.pathname === "/api/panel-audit/export" && req.method === "POST") {
        const body = await readBody(req);
        const { password } = JSON.parse(body || "{}");
        if (!(await fwVerify(password || ""))) { sendJson(res, { error: "密码错误，操作未执行" }, 403); return; }
        sendJson(res, { records: await readHistoryFile(panelAuditPath) });
      } else if (url.pathname === "/api/panel-audit/clear" && req.method === "POST") {
        const body = await readBody(req);
        const { password } = JSON.parse(body || "{}");
        if (!(await fwVerify(password || ""))) { sendJson(res, { error: "密码错误，操作未执行" }, 403); return; }
        await writeAuditFile(panelAuditPath, []);
        sendJson(res, { ok: true });
      } else if (url.pathname === "/api/fs/list" && req.method === "GET") {
        const r = await listFs(url.searchParams.get("path") || "/");
        sendJson(res, r, r.error ? 400 : 200);
      } else if (url.pathname === "/api/fs/download" && req.method === "GET") {
        const abs = safeFsPath(url.searchParams.get("path"));
        if (!abs) { sendJson(res, { error: "路径不合法" }, 400); }
        else {
          try {
            const st = await lstat(abs);
            if (!st.isFile()) { sendJson(res, { error: "目标不是文件" }, 400); }
            else {
              res.writeHead(200, {
                "Content-Type": "application/octet-stream",
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(basename(abs))}`,
                "Content-Length": st.size,
              });
              createReadStream(abs).pipe(res);
            }
          } catch { sendJson(res, { error: "文件不存在" }, 400); }
        }
      } else if (url.pathname === "/api/fs/read" && req.method === "POST") {
        const body = JSON.parse(await readBody(req) || "{}");
        const abs = safeFsPath(body.path);
        if (!abs) { sendJson(res, { error: "路径不合法" }, 400); }
        else {
          try {
            const st = await lstat(abs);
            if (!st.isFile()) { sendJson(res, { error: "目标不是文件" }, 400); }
            else if (st.size > 2 * 1024 * 1024) { sendJson(res, { error: "文件过大（>2MB）" }, 400); }
            else { sendJson(res, { path: abs, content: await readFile(abs, "utf8") }); }
          } catch { sendJson(res, { error: "读取失败" }, 400); }
        }
      } else if (url.pathname === "/api/fs/write" && req.method === "POST") {
        const body = JSON.parse(await readBody(req) || "{}");
        if (await fsWriteGuard(body, res)) {
          const abs = safeFsPath(body.path);
          if (!abs) { sendJson(res, { error: "路径不合法" }, 400); }
          else {
            try { await writeFile(abs, String(body.content ?? ""), "utf8"); sendJson(res, { ok: true }); }
            catch (e) { sendJson(res, { error: `写入失败：${e.code === "EACCES" ? "无权限" : e.message}` }, 400); }
          }
        }
      } else if (url.pathname === "/api/fs/mkdir" && req.method === "POST") {
        const body = JSON.parse(await readBody(req) || "{}");
        if (await fsWriteGuard(body, res)) {
          const base = safeFsPath(body.path);
          const name = basename(String(body.name || "")).replace(/[\\/]/g, "");
          if (!base || !name) { sendJson(res, { error: "参数不合法" }, 400); }
          else {
            try { await mkdir(join(base, name)); sendJson(res, { ok: true }); }
            catch (e) { sendJson(res, { error: `创建失败：${e.code === "EEXIST" ? "已存在" : e.message}` }, 400); }
          }
        }
      } else if (url.pathname === "/api/fs/rename" && req.method === "POST") {
        const body = JSON.parse(await readBody(req) || "{}");
        if (await fsWriteGuard(body, res)) {
          const abs = safeFsPath(body.path);
          const newName = basename(String(body.newName || "")).replace(/[\\/]/g, "");
          if (!abs || !newName) { sendJson(res, { error: "参数不合法" }, 400); }
          else {
            try { await fsRename(abs, join(dirname(abs), newName)); sendJson(res, { ok: true }); }
            catch (e) { sendJson(res, { error: `重命名失败：${e.message}` }, 400); }
          }
        }
      } else if (url.pathname === "/api/fs/delete" && req.method === "POST") {
        const body = JSON.parse(await readBody(req) || "{}");
        if (await fsWriteGuard(body, res)) {
          const abs = safeFsPath(body.path);
          if (!abs) { sendJson(res, { error: "路径不合法" }, 400); }
          else {
            try { await rm(abs, { recursive: true }); sendJson(res, { ok: true }); }
            catch (e) { sendJson(res, { error: `删除失败：${e.message}` }, 400); }
          }
        }
      } else if (url.pathname === "/api/fs/upload" && req.method === "POST") {
        const ct = req.headers["content-type"] || "";
        const m = ct.match(/boundary=([^;]+)/);
        if (!m) { sendJson(res, { error: "上传格式错误" }, 400); }
        else {
          const boundary = m[1].trim().replace(/^"|"$/g, "");
          const chunks = [];
          let total = 0, tooBig = false;
          for await (const chunk of req) {
            total += chunk.length;
            if (total > 60 * 1024 * 1024) { tooBig = true; break; }
            chunks.push(chunk);
          }
          if (tooBig) { sendJson(res, { error: "上传文件过大（>50MB）" }, 413); }
          else {
            const parts = parseMultipart(Buffer.concat(chunks), boundary);
            const pathField = parts.find((p) => p.type === "field" && p.name === "path");
            const passField = parts.find((p) => p.type === "field" && p.name === "password");
            const file = parts.find((p) => p.type === "file");
            const auth = await readAuth();
            if (!auth || !verifyPassword(passField?.value || "", auth)) { sendJson(res, { error: "密码错误，操作未执行" }, 403); }
            else {
              const base = safeFsPath(pathField?.value);
              const fname = file ? basename(file.filename || "").replace(/[\\/]/g, "") : "";
              if (!base || !fname) { sendJson(res, { error: "缺少目录或文件" }, 400); }
              else if (file.data.length > 50 * 1024 * 1024) { sendJson(res, { error: "上传文件过大（>50MB）" }, 413); }
              else {
                try { await writeFile(join(base, fname), file.data); sendJson(res, { ok: true }); }
                catch (e) { sendJson(res, { error: `上传失败：${e.code === "EACCES" ? "无权限" : e.message}` }, 400); }
              }
            }
          }
        }
      } else if (url.pathname === "/api/firewall/open" && req.method === "POST") {
        const body = await readBody(req);
        const { port, proto = "tcp", from = "", password } = JSON.parse(body || "{}");
        if (!(await fwVerify(password))) {
          sendJson(res, { error: "密码错误，操作未执行" }, 403);
        } else if (!/^\d+(,\d+)*$/.test(String(port || "")) || String(port).split(",").some((p) => { const n = Number(p); return !Number.isInteger(n) || n < 1 || n > 65535; })) {
          sendJson(res, { error: "无效的端口" }, 400);
        } else if (!["tcp", "udp"].includes(proto)) {
          sendJson(res, { error: "不支持的协议" }, 400);
        } else if (from && !/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(from)) {
          sendJson(res, { error: "无效的来源（需 IP 或网段，如 192.168.1.0/24）" }, 400);
        } else {
          const isFwd = await firewalldBackend();
          let r, cmd;
          if (isFwd) {
            const add = from ? `--add-rich-rule='rule family=ipv4 source address=${from} port port="${port}" protocol=${proto} accept'` : `--add-port=${port}/${proto}`;
            cmd = add;
            r = await firewalldOps(add, password);
          } else {
            cmd = from ? `ufw allow from ${from} to any port ${port} proto ${proto}` : `ufw allow ${port}/${proto}`;
            r = fwRes(await fwRun(cmd, password, 15000));
          }
          if (r.ok) await appendFwOp({ op: "open", target: `${port}/${proto}${from ? ` from ${from}` : ""}`, cmd, ok: true });
          sendJson(res, { ok: r.ok, stdout: r.stdout, stderr: r.stderr });
        }
      } else if (url.pathname === "/api/firewall/close" && req.method === "POST") {
        const body = await readBody(req);
        const { port, proto = "tcp", mode, password } = JSON.parse(body || "{}");
        if (!(await fwVerify(password))) {
          sendJson(res, { error: "密码错误，操作未执行" }, 403);
        } else if (!Number.isInteger(port) || port < 1 || port > 65535) {
          sendJson(res, { error: "无效的端口" }, 400);
        } else if (!["tcp", "udp"].includes(proto)) {
          sendJson(res, { error: "不支持的协议" }, 400);
        } else if (!["deny", "delete"].includes(mode)) {
          sendJson(res, { error: "不支持的关闭模式" }, 400);
        } else {
          const isFwd = await firewalldBackend();
          let r, cmd;
          if (isFwd) {
            cmd = mode === "deny"
              ? `--add-rich-rule='rule family=ipv4 port port="${port}" protocol=${proto} reject'`
              : `--remove-port=${port}/${proto}`;
            r = await firewalldOps(cmd, password);
          } else {
            cmd = mode === "deny" ? `ufw deny ${port}/${proto}` : `ufw delete allow ${port}/${proto}`;
            r = fwRes(await fwRun(cmd, password, 15000));
          }
          if (r.ok) await appendFwOp({ op: mode === "deny" ? "deny" : "close", target: `${port}/${proto}`, cmd, ok: true });
          sendJson(res, { ok: r.ok, stdout: r.stdout, stderr: r.stderr });
        }
      } else if (url.pathname === "/api/firewall/control" && req.method === "POST") {
        const body = await readBody(req);
        const { action, password } = JSON.parse(body || "{}");
        if (!(await fwVerify(password))) {
          sendJson(res, { error: "密码错误，操作未执行" }, 403);
        } else if (!["enable", "disable"].includes(action)) {
          sendJson(res, { error: "不支持的操作" }, 400);
        } else {
          const isFwd = await firewalldBackend();
          let r, cmd;
          if (isFwd) {
            cmd = `systemctl ${action === "enable" ? "start" : "stop"} firewalld`;
            r = fwRes(await fwRun(cmd, password, 15000));
          } else {
            cmd = `ufw ${action}`;
            r = fwRes(await fwRun(cmd, password, 15000));
          }
          if (r.ok) await appendFwOp({ op: action, target: isFwd ? "firewalld" : "ufw", cmd, ok: true });
          sendJson(res, { ok: r.ok, stdout: r.stdout, stderr: r.stderr });
        }
      } else if (url.pathname === "/api/firewall/ops" && req.method === "GET") {
        sendJson(res, { ops: await readFwOps() });
      } else if (url.pathname === "/api/acl/list" && req.method === "GET") {
        const acl = await readAcl();
        sendJson(res, {
          blacklist: acl.blacklist || [],
          whitelist: acl.whitelist || [],
          ports: panelPorts(),
          backend: (await detectBackend({ run: execCmd })) || null,
          clientIp: clientIp(req),
        });
      } else if (url.pathname === "/api/acl/add" && req.method === "POST") {
        const body = JSON.parse(await readBody(req) || "{}");
        const { list, ip, comment = "", password } = body;
        if (!(await fwVerify(password))) {
          sendJson(res, { error: "密码错误，操作未执行" }, 403);
        } else if (!["black", "white"].includes(list)) {
          sendJson(res, { error: "不支持的名单类型" }, 400);
        } else if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(String(ip || ""))) {
          sendJson(res, { error: "无效的 IP（需 IPv4 或网段，如 192.168.1.0/24）" }, 400);
        } else {
          const acl = await readAcl();
          const arr = list === "black" ? (acl.blacklist ||= []) : (acl.whitelist ||= []);
          if (arr.some((x) => x.ip === ip)) {
            sendJson(res, { error: "该 IP 已在名单中" }, 400);
          } else {
            const me = clientIp(req);
            const mePlain = String(me || "").replace("::ffff:", "");
            if (list === "white" && acl.whitelist.length === 0 && mePlain && mePlain !== "unknown" && mePlain !== "127.0.0.1" && mePlain !== "::1" && ip !== mePlain) {
              sendJson(res, { error: `当前访问 IP（${me}）不在白名单内，添加后将无法访问面板。请先添加当前 IP，或取消操作。` }, 400);
              return;
            }
            arr.push({ ip, comment: String(comment || "").slice(0, 60), ts: Date.now() });
            const r = await syncAclRules(acl, panelPorts(), password, { run: execCmd });
            if (!r.ok) { sendJson(res, { error: r.error }, 400); return; }
            await writeAcl(acl);
            sendJson(res, { ok: true });
          }
        }
      } else if (url.pathname === "/api/acl/remove" && req.method === "POST") {
        const body = JSON.parse(await readBody(req) || "{}");
        const { list, ip, password } = body;
        if (!(await fwVerify(password))) {
          sendJson(res, { error: "密码错误，操作未执行" }, 403);
        } else if (!["black", "white"].includes(list)) {
          sendJson(res, { error: "不支持的名单类型" }, 400);
        } else if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(String(ip || ""))) {
          sendJson(res, { error: "无效的 IP" }, 400);
        } else {
          const acl = await readAcl();
          const arr = list === "black" ? (acl.blacklist ||= []) : (acl.whitelist ||= []);
          const idx = arr.findIndex((x) => x.ip === ip);
          if (idx < 0) { sendJson(res, { error: "该 IP 不在名单中" }, 400); }
          else {
            arr.splice(idx, 1);
            const r = await syncAclRules(acl, panelPorts(), password, { run: execCmd });
            if (!r.ok) { sendJson(res, { error: r.error }, 400); return; }
            await writeAcl(acl);
            sendJson(res, { ok: true });
          }
        }
      } else if (url.pathname === "/api/system/update" && req.method === "POST") {
        const body = await readBody(req);
        const { password } = JSON.parse(body || "{}");
        if (!(await fwVerify(password))) {
          sendJson(res, { error: "密码错误，操作未执行" }, 403);
        } else {
          const cmd = "DEBIAN_FRONTEND=noninteractive apt-get -y upgrade";
          const r = await fwRun(cmd, password, 300000);
          if (r.exitCode === 0) await appendSysOp({ op: "update", ok: true });
          sendJson(res, { ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr });
        }
      } else if (url.pathname === "/api/system/clean" && req.method === "POST") {
        const body = await readBody(req);
        const { password } = JSON.parse(body || "{}");
        if (!(await fwVerify(password))) {
          sendJson(res, { error: "密码错误，操作未执行" }, 403);
        } else {
          const cmd = "journalctl --vacuum-time=7d 2>&1; apt-get clean 2>&1; find /tmp -mindepth 1 -atime +7 -exec rm -rf {} + 2>/dev/null; echo done";
          const r = await fwRun(cmd, password, 120000);
          if (r.exitCode === 0) await appendSysOp({ op: "clean", ok: true });
          sendJson(res, { ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr });
        }
      } else if (url.pathname === "/api/system/power" && req.method === "POST") {
        const body = await readBody(req);
        const { action, password } = JSON.parse(body || "{}");
        if (!(await fwVerify(password))) {
          sendJson(res, { error: "密码错误，操作未执行" }, 403);
        } else if (!["reboot", "shutdown"].includes(action)) {
          sendJson(res, { error: "不支持的操作" }, 400);
        } else {
          const cmd = action === "reboot" ? "shutdown -r +1" : "shutdown -h +1";
          const r = await fwRun(cmd, password);
          if (r.exitCode === 0) await appendSysOp({ op: action, ok: true });
          sendJson(res, { ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr });
        }
      } else if (url.pathname === "/api/store" && req.method === "GET") {
        const q = String(url.searchParams.get("q") || "").trim();
        const pm = await pkgManagerCache("detect", () => detectPkgManager({ run: execCmd }));
        if (pm.family === "none") { sendJson(res, { apps: [], q, error: "未检测到支持的包管理器（apt/dnf/yum/apk/pacman/zypper）" }); return; }
        let installed;
        try {
          installed = await installedCache("inst:" + pm.family, async () => {
            const cmd = listInstalledCmd(pm.family);
            const r = cmd ? await withPmLock(() => execCmd(cmd, { timeout: 10000, maxOutput: 2 * 1024 * 1024 })).catch(() => ({ exitCode: 1, stdout: "", stderr: "" })) : { exitCode: 1, stdout: "", stderr: "" };
            if (r.exitCode !== 0) throw new Error(pmErrorHint(r.stderr || r.stdout) || "读取已安装软件列表失败");
            return parseInstalledNames(r.stdout || "", pm.family);
          });
        } catch (e) { sendJson(res, { apps: [], q, error: String(e.message || e) }); return; }
        let apps = STORE_PKGS.map((p) => {
          const name = resolvePkgName(pm.family, p.name);
          return { ...p, name, installed: installed.has(name) };
        });
        if (q) {
          const ql = q.toLowerCase();
          apps = apps.filter((a) => a.name.toLowerCase().includes(ql) || (a.desc || "").toLowerCase().includes(ql));
          const sc = searchCmd(pm.family, q);
          if (sc) {
            const search = await withPmLock(() => execCmd(sc, { timeout: 15000 })).catch(() => ({ stdout: "" }));
            const found = parseSearch(search.stdout || "", pm.family).map((f) => ({ ...f, installed: installed.has(f.name), searched: true }));
            const known = new Set(apps.map((a) => a.name));
            apps = [...apps, ...found.filter((f) => !known.has(f.name))];
          }
        }
        res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ apps, q }));
      } else if ((url.pathname === "/api/store/install" || url.pathname === "/api/store/uninstall") && req.method === "POST") {
        const body = await readBody(req);
        const { pkg, password, version } = JSON.parse(body || "{}");
        if (!(await fwVerify(password))) { sendJson(res, { error: "密码错误，操作未执行" }, 403); return; }
        const name = String(pkg || "").trim();
        if (!/^[a-zA-Z0-9+._-]+$/.test(name)) { sendJson(res, { error: "非法的软件包名" }, 400); return; }
        const ver = String(version || "").trim();
        if (ver && !/^[A-Za-z0-9:._~+-]+$/.test(ver)) { sendJson(res, { error: "非法的版本号" }, 400); return; }
        const pm = await pkgManagerCache("detect", () => detectPkgManager({ run: execCmd }));
        if (pm.family === "none") { sendJson(res, { error: "未检测到支持的包管理器" }, 400); return; }
        const isInstall = url.pathname.endsWith("/install");
        const cmd = isInstall ? installCmd(pm.family, name, ver) : uninstallCmd(pm.family, name);
        if (!cmd) { sendJson(res, { error: "暂不支持该包管理器的安装操作" }, 400); return; }
        res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
        res.flushHeaders?.();
        const send = (type, data) => { if (!res.destroyed) res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); };
        const aborted = new AbortController();
        res.on("close", () => aborted.abort());
        const wrapped = sudoCmd(`${cmd} 2>&1`, password);
        let lastPct = -1;
        let tail = "";
        const onLine = (line) => {
          tail = (tail + "\n" + line).slice(-2000);
          if (APT_PROTO_RE.test(line)) {
            const pct = parseAptPct(line);
            if (pct !== null && pct !== lastPct) { lastPct = pct; send("progress", { pct }); }
            return;
          }
          if (line.trim()) send("log", { line: line.slice(0, 500) });
        };
        const r = await withPmLock(() => spawnLines(wrapped, { onLine, timeout: 300000, signal: aborted.signal }));
        installedCache.clear("inst:" + pm.family);
        const ok = r.exitCode === 0 && !r.aborted;
        send("done", { ok, exitCode: r.exitCode, aborted: r.aborted, hint: ok ? null : (pmErrorHint(tail) || null) });
        res.end();
      } else if (url.pathname === "/api/app/nginx/load" && req.method === "GET") {
        sendJson(res, await collectNginxLoad({ run: execCmd }));
      } else if (url.pathname === "/api/app/nginx/versions" && req.method === "GET") {
        const pkg = String(url.searchParams.get("pkg") || "nginx").trim();
        if (!/^[a-zA-Z0-9+._-]+$/.test(pkg)) { sendJson(res, { error: "非法的软件包名" }, 400); return; }
        const pm = await pkgManagerCache("detect", () => detectPkgManager({ run: execCmd }));
        if (pm.family === "none") { sendJson(res, { pkg, installed: null, candidate: null, versions: [], error: "未检测到支持的包管理器" }); return; }
        const cmd = versionsCmd(pm.family, pkg);
        const r = cmd ? await withPmLock(() => execCmd(cmd, { timeout: 15000 })).catch(() => ({ stdout: "" })) : { stdout: "" };
        sendJson(res, { pkg, ...parseVersions(r.stdout || "", pm.family) });
      } else if (url.pathname === "/api/system/ops" && req.method === "GET") {
        sendJson(res, { ops: await readSysOps() });
      } else if (url.pathname === "/api/systemd/op" && req.method === "POST") {
        const body = await readBody(req);
        const { unit, action, password } = JSON.parse(body || "{}");
        const auth = await readAuth();
        if (!auth || !verifyPassword(password || "", auth)) { sendJson(res, { error: "密码错误，操作未执行" }, 403); return; }
        if (!SYS_ACTIONS.includes(action)) { sendJson(res, { error: "不支持的操作" }, 400); return; }
        const u = String(unit || "").trim();
        if (!/^[a-zA-Z0-9_.@-]+$/.test(u)) { sendJson(res, { error: "非法的服务名" }, 400); return; }
        if (DANGEROUS_UNITS.test(u.replace(/\.(service|socket|timer)$/, ""))) { sendJson(res, { error: "系统关键服务，禁止操作" }, 403); return; }
        const unitName = sysUnitName(u);
        const cmd = `systemctl ${action} ${unitName}`;
        const r = await execCmd(cmd, { timeout: 20000 });
        await appendSysOp({ op: `systemd:${action}`, target: unitName, cmd, ok: r.exitCode === 0 });
        sendJson(res, { ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr });
      } else if (url.pathname === "/api/systemd/logs" && req.method === "POST") {
        const body = await readBody(req);
        const { unit, lines } = JSON.parse(body || "{}");
        const u = String(unit || "").trim();
        if (!/^[a-zA-Z0-9_.@-]+$/.test(u)) { sendJson(res, { error: "非法的服务名" }, 400); return; }
        const n = Math.max(50, Math.min(parseInt(lines, 10) || 200, 2000));
        const r = await execCmd(`journalctl -u ${sysUnitName(u)} -n ${n} --no-pager -o cat`, { timeout: 20000 });
        sendJson(res, { ok: r.exitCode === 0, content: r.stdout });
      } else if (url.pathname === "/api/nginx/confs" && req.method === "GET") {
        sendJson(res, await listNginxConfs());
      } else if (url.pathname === "/api/nginx/conf" && req.method === "GET") {
        sendJson(res, await readNginxConf(url.searchParams.get("path")));
      } else if (url.pathname === "/api/nginx/conf" && req.method === "POST") {
        const body = await readBody(req);
        const { path, content, password } = JSON.parse(body || "{}");
        const auth = await readAuth();
        if (!auth || !verifyPassword(password || "", auth)) {
          sendJson(res, { error: "密码错误，操作未执行" }, 403);
        } else {
          const r = await writeNginxConf(path, content ?? "");
          sendJson(res, r, r.ok ? 200 : 400);
        }
      } else if (url.pathname === "/api/nginx/reload" && req.method === "POST") {
        const body = await readBody(req);
        const { action, password } = JSON.parse(body || "{}");
        const auth = await readAuth();
        if (!auth || !verifyPassword(password || "", auth)) {
          sendJson(res, { error: "密码错误，操作未执行" }, 403);
        } else {
          const cmds = { start: "systemctl start nginx", stop: "systemctl stop nginx", restart: "systemctl restart nginx", reload: "systemctl reload nginx" };
          const cmd = cmds[action] || cmds.reload;
          const r = await execCmd(cmd, { timeout: 15000 });
          sendJson(res, { ok: r.exitCode === 0, output: (r.stdout || r.stderr || "").trim() });
        }
      } else if (url.pathname === "/api/docker/stats" && req.method === "GET") {
        const d = await collectDockerStats({ run: execCmd });
        sendJson(res, d);
      } else if (url.pathname === "/api/docker/op" && req.method === "POST") {
        const body = await readBody(req);
        const { name, action, password } = JSON.parse(body || "{}");
        const ops = { start: "start", stop: "stop", restart: "restart", rm: "rm -f" };
        if (!name || !ops[action]) { sendJson(res, { error: "不支持的参数" }, 400); }
        else if (!(await fwVerify(password))) { sendJson(res, { error: "密码错误，操作未执行" }, 403); }
        else {
          const r = await fwRun(`docker ${ops[action]} ${name}`, password, 60000);
          sendJson(res, { ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr });
        }
      } else if (url.pathname === "/api/docker/prune" && req.method === "POST") {
        const body = await readBody(req);
        const { password } = JSON.parse(body || "{}");
        if (!(await fwVerify(password))) { sendJson(res, { error: "密码错误，操作未执行" }, 403); }
        else {
          const r = await fwRun("docker image prune -f", password, 120000);
          sendJson(res, { ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr });
        }
      } else if (url.pathname === "/api/docker/inspect" && req.method === "GET") {
        const q = new URL(req.url, "http://x").searchParams;
        const name = q.get("name") || "";
        const r = await execCmd(`docker inspect ${name}`);
        if (r.exitCode !== 0) { sendJson(res, { error: r.stderr || "容器不存在" }, 400); }
        else {
          try {
            const [c] = JSON.parse(r.stdout || "[]");
            sendJson(res, {
              ok: true,
              detail: {
                name: String(c.Name || "").replace(/^\//, ""),
                image: c.Config?.Image || "—",
                running: Boolean(c.State?.Running),
                restarts: c.RestartCount ?? 0,
                ip: Object.values(c.NetworkSettings?.Networks || {}).map((n) => n.IPAddress || "").filter(Boolean).join(", ") || "—",
                mounts: (c.Mounts || []).map((m) => `${m.Source} → ${m.Destination}`),
                ports: Object.entries(c.NetworkSettings?.Ports || {}).map(([k, v]) => `${k} → ${(v || []).map((x) => x.HostPort).join(",") || "动态"}`).join("\n") || "—",
              },
            });
          } catch { sendJson(res, { error: "解析容器信息失败" }, 500); }
        }
      } else if (url.pathname === "/api/restart" && req.method === "POST") {
        sendJson(res, { ok: true });
        setTimeout(() => {
          const r = (config.restart || restartService)();
          console.log(`重启服务（${r.method}），进程即将退出。`);
          if (!config.restart) process.exit(0);
        }, 200);
      } else if (url.pathname === "/api/stream") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        res.write(": connected\n\n");
        clients.add(res);
        req.on("close", () => clients.delete(res));
      } else if (url.pathname === "/") {
        const html = (await readFile(join(STATIC, "index.html"), "utf8")).replaceAll("__VERSION__", `v${VERSION}`);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate" });
        res.end(html);
      } else if (url.pathname === "/app.js") {
        const js = await readFile(join(STATIC, "app.js"));
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(js);
      } else if (url.pathname === "/markdown.js") {
        const js = await readFile(join(STATIC, "markdown.js"));
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(js);
      } else if (url.pathname === "/monitor.js") {
        const js = await readFile(join(STATIC, "monitor.js"));
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(js);
      } else if (url.pathname === "/fs.js") {
        const js = await readFile(join(STATIC, "fs.js"));
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(js);
      } else if (url.pathname === "/chat.js") {
        const js = await readFile(join(STATIC, "chat.js"));
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(js);
      } else if (url.pathname === "/settings.js") {
        const js = await readFile(join(STATIC, "settings.js"));
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(js);
      } else if (url.pathname === "/appman.js") {
        const js = await readFile(join(STATIC, "appman.js"));
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(js);
      } else if (url.pathname === "/app.css") {
        const css = await readFile(join(STATIC, "app.css"));
        res.writeHead(200, { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(css);
      } else if (url.pathname === "/i18n.js") {
        const js = await readFile(join(STATIC, "i18n.js"));
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" });
        res.end(js);
      } else if (url.pathname === "/xterm.min.js") {
        const js = await readFile(join(STATIC, "xterm.min.js"));
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        res.end(js);
      } else if (url.pathname === "/xterm.css") {
        const css = await readFile(join(STATIC, "xterm.css"));
        res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
        res.end(css);
      } else if (url.pathname.startsWith("/fig/")) {
        const name = url.pathname.slice("/fig/".length);
        if (!/^[\w.-]+\.png$/.test(name)) { res.writeHead(404); res.end("Not Found"); return; }
        const img = await readFile(join(STATIC, "fig", name));
        res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
        res.end(img);
      } else {
        res.writeHead(404); res.end("Not Found");
      }
    } catch (e) {
      console.error("请求处理失败:", e);
      try {
        if (!res.headersSent) sendJson(res, { error: String(e?.message || e) }, e?.statusCode || 500);
      } catch {}
    }
  };

  const server = createServer(handler);
  let httpsServer = null;
  if (config.tls) {
    const tlsOpts = await ensureTlsCert(config.tlsCertDir);
    if (tlsOpts) httpsServer = createHttpsServer(tlsOpts, handler);
    else console.error("⚠ 未能生成自签证书（需系统安装 openssl），HTTPS 未启用，仅 HTTP 可用。");
  }

  const listenRetry = (srv, port, onBusy) => new Promise((resolve, reject) => {
    let attempts = 0;
    const tryListen = () => {
      const s = srv.listen(port, "0.0.0.0", () => resolve(s));
      s.once("error", (e) => {
        if (e.code === "EADDRINUSE" && attempts < 5) { attempts++; setTimeout(tryListen, 400); }
        else if (e.code === "EADDRINUSE") { onBusy?.(port); reject(e); }
        else reject(e);
      });
    };
    tryListen();
  });

  const listenPort = config.port ?? 8080;
  await listenRetry(server, listenPort, () => {
    console.error(`\n⚠ 端口 ${listenPort} 已被占用（面板可能已在运行）。`);
    console.error(`  直接访问 http://127.0.0.1:${listenPort}，或先停止旧进程再启动。`);
    process.exit(1);
  });

  let httpsAddress = null;
  if (httpsServer) {
    const httpsPort = config.httpsPort ?? 8443;
    try {
      await listenRetry(httpsServer, httpsPort);
      httpsAddress = httpsServer.address();
    } catch {
      console.error(`⚠ HTTPS 启动失败（端口 ${httpsPort} 可能被占用），仅 HTTP 可用。`);
      try { httpsServer.close(); } catch {}
      httpsServer = null;
    }
  }

  const address = server.address();
  if (config.panelPath) printAccess(address.port, config.panelPath, httpsAddress?.port || null);
  else console.log(`fixflow 面板已启动：http://127.0.0.1:${address.port}${httpsAddress ? ` · https://127.0.0.1:${httpsAddress.port}` : ""}`);
  const closeSrv = (s) => new Promise((r) => s.close(r));
  return {
    server,
    httpsServer,
    close: () => new Promise((resolve) => { termGen++; if (termShell) { try { termShell.kill(); } catch {} termShell = null; } clearInterval(monitorTimer); clearInterval(alertTimer); clearInterval(metricAlertTimer); clearInterval(memTimer); clearInterval(failedTimer); clearInterval(downTimer); clearInterval(historyTimer); clearInterval(sseGuard); clearTimeout(prewarmTimer); clearTimeout(alertStartTimer); clearTimeout(metricsWarmTimer); server.closeAllConnections?.(); if (httpsServer) httpsServer.closeAllConnections?.(); Promise.all([closeSrv(server), httpsServer ? closeSrv(httpsServer) : Promise.resolve()]).then(resolve); }),
  };
}