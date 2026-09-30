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
import { collectAll, collectPorts, collectConnectivity, formatDateTime, formatUptime, listNginxConfs, readNginxConf, writeNginxConf, createTtlCache } from "../metrics.js";
import { loadConfig, normalizeSslSites, readJsonFile } from "../config.js";
import { collectSslAll, detectRenewTool, renewCert, checkSslAlerts, sendWebhook, sendEmail } from "../ssl.js";
import { createUsageStore } from "../usage.js";
import { createAlertsManager } from "../alerts.js";
import { lanIPs, publicIP } from "../netip.js";
import { buildUrls } from "../panel-access.js";
import { createMetricAlerts, buildAlertEmail, METRICS, metricLabel } from "../metric-alerts.js";
import { restart as restartService } from "../service.js";
import { hashPasswordAsync, verifyPassword, verifyPasswordAsync, isStrongPassword, createSessionStore, parseCookie, createCaptchaStore, captchaSvg } from "../auth.js";
import { createMonitor, readProcStat, readNetDev, readDiskstats, nowTs, calcCpuUsage } from "../net.js";
import { parseDf, parseFree, parseLoad } from "../health.js";
import { runCommand } from "../tools.js";

const STATIC = join(fileURLToPath(new URL(".", import.meta.url)), "static");

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
  config.lang = config.lang === "en" ? "en" : "zh";
  config.theme = config.theme === "light" ? "light" : "dark";
  config.fsCollapsed = config.fsCollapsed === true;
  const clients = new Set();
  const metricsCache = createTtlCache(3000);
  const statusCache = createTtlCache(2000);
  const renewToolCache = createTtlCache(30000);
  const waiters = new Map();
  let seq = 0;
  const configPath = config.configPath || defaultConfigPath();
  const historyPath = config.historyPath || defaultHistoryPath();
  const termHistoryPath = config.termHistoryPath || defaultTermHistoryPath();
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
    const saved = { ...existing, baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, sslSites: config.sslSites, pingTargets: config.pingTargets, sslAlerts: config.sslAlerts, lang: config.lang, theme: config.theme, fsCollapsed: config.fsCollapsed };
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(saved, null, 2));
    await chmod(configPath, 0o600).catch(() => {});
  };
  const execCmd = deps.runCommand || runCommand;

  const procGuard = async (pid) => {
    if (!Number.isInteger(pid) || pid <= 1) return "系统级进程，禁止操作";
    try {
      const [stat, status] = await Promise.all([
        readFile(`/proc/${pid}/stat`, "utf8"),
        readFile(`/proc/${pid}/status`, "utf8"),
      ]);
      const m = stat.match(/\(([^)]*)\)\s*(\w)/);
      const name = m ? m[1] : "";
      const state = m ? m[2] : "";
      const uid = (status.match(/^Uid:\s+(\d+)/m) || [])[1];
      if (state === "D" || state === "Z") return "该进程状态不可操作（D/Z）";
      if (uid === "0" && /(daemon|systemd|dbus)/.test(name)) return "系统服务进程，禁止操作";
      if (/(^dde-|kwin|Xorg|lightdm)/.test(name)) return "系统组件进程，禁止操作";
      if (/^k/.test(name)) return "内核线程，禁止操作";
      return null;
    } catch { return "进程不存在或不可访问"; }
  };

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
  });

  const monitor = createMonitor();
  const monitorTimer = setInterval(() => monitor.tick(), 1000);
  let alertTimer = null;
  if (!deps.noAlertsTimer && config.apiKey) {
    setTimeout(() => alertsManager.tick(), 5000);
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
          sendJson(res, { error: "密码需 8-128 位，且包含大小写字母、数字和特殊字符" }, 400);
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
        const token = sessions.create();
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
        if (!isStrongPassword(newPassword)) { sendJson(res, { error: "新密码需 8-128 位，且包含大小写字母、数字和特殊字符" }, 400); return; }
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
        sendJson(res, data);
      } else if (url.pathname === "/api/overview") {
        const net = monitor.net();
        const io = monitor.io();
        const nics = Object.keys(net.last || {}).filter((n) => n !== "lo");
        sendJson(res, {
          status: await statusCache("status", () => { if (process.env.FF_DEBUG_METRICS) console.log(`[status] ${Date.now()}`); return collectStatus(); }),
          nics,
          net: net.samples,
          io: io.samples,
          usage: usageStore.daily(30),
        });
      } else if (url.pathname === "/api/usage" && req.method === "GET") {
        const days = parseInt(url.searchParams.get("days") || "30", 10);
        sendJson(res, { days: usageStore.daily(Number.isFinite(days) ? days : 30) });
      } else if (url.pathname === "/api/alerts" && req.method === "GET") {
        const alerts = await alertsManager.list();
        const st = await alertsManager.smtp();
        const history = {};
        for (const a of alerts) history[a.id] = (await alertsManager.history(a.id)).slice(0, 3);
        sendJson(res, { alerts, smtp: { host: st.host, port: st.port, user: st.user, from: st.from, hasPass: Boolean(st.pass) }, history });
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
        const { host, port, user, pass, from } = JSON.parse(body || "{}");
        await alertsManager.saveSmtp({ host, port, user, pass, from });
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
        const data = await collectSslAll(config);
        const { tool } = await detectRenewTool();
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
        sendJson(res, { ok: true, entry });
      } else if (url.pathname === "/api/ssl" && req.method === "PATCH") {
        const body = await readBody(req);
        const { id, label, enabled } = JSON.parse(body || "{}");
        const entry = config.sslSites.find((e) => e.id === id);
        if (!entry) { sendJson(res, { error: "条目不存在" }, 404); return; }
        if (label !== undefined) entry.label = String(label);
        if (enabled !== undefined) entry.enabled = Boolean(enabled);
        await persistConfig();
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
        sendJson(res, { ok: true });
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
        sendJson(res, result);
      } else if (url.pathname === "/api/config" && req.method === "GET") {
        sendJson(res, { baseUrl: config.baseUrl, model: config.model, apiKey: config.apiKey ? "••••" + config.apiKey.slice(-4) : "", sslSites: config.sslSites, pingTargets: config.pingTargets, serviceKeywords: config.serviceKeywords, lang: config.lang, theme: config.theme, fsCollapsed: config.fsCollapsed });
      } else if (url.pathname === "/api/config" && req.method === "POST") {
        const body = await readBody(req);
        const { baseUrl, apiKey, model, sslSites, pingTargets, serviceKeywords, lang, theme, fsCollapsed } = JSON.parse(body || "{}");
        if (baseUrl) config.baseUrl = baseUrl;
        if (apiKey) config.apiKey = apiKey;
        if (model) config.model = model;
        if (Array.isArray(sslSites)) config.sslSites = sslSites;
        if (Array.isArray(pingTargets)) config.pingTargets = pingTargets;
        if (Array.isArray(serviceKeywords)) config.serviceKeywords = serviceKeywords.map((s) => String(s).trim()).filter(Boolean);
        if (lang === "en" || lang === "zh") config.lang = lang;
        if (theme === "light" || theme === "dark") config.theme = theme;
        if (typeof fsCollapsed === "boolean") config.fsCollapsed = fsCollapsed;
        let existing = {};
        existing = await readJsonFile(configPath);
        const saved = { ...existing, baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, sslSites: config.sslSites, pingTargets: config.pingTargets, serviceKeywords: config.serviceKeywords, lang: config.lang, theme: config.theme, fsCollapsed: config.fsCollapsed };
        await mkdir(dirname(configPath), { recursive: true });
        await writeFile(configPath, JSON.stringify(saved, null, 2));
        sendJson(res, { ok: true, baseUrl: config.baseUrl, model: config.model, apiKey: config.apiKey ? "••••" + config.apiKey.slice(-4) : "", sslSites: config.sslSites, pingTargets: config.pingTargets, serviceKeywords: config.serviceKeywords, lang: config.lang, theme: config.theme, fsCollapsed: config.fsCollapsed });
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
        await writeHistoryFile(historyPath, []);
        sendJson(res, {});
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
      } else if (url.pathname === "/api/process" && req.method === "POST") {
        const body = await readBody(req);
        const { action, pid, service, password } = JSON.parse(body || "{}");
        const auth = await readAuth();
        if (!auth || !verifyPassword(password || "", auth)) {
          sendJson(res, { error: "密码错误，操作未执行" }, 403);
        } else if (!Number.isInteger(pid) || pid <= 0) {
          sendJson(res, { error: "无效的 PID" }, 400);
        } else {
          const cmd = action === "restart" && service
            ? `systemctl restart ${service}`
            : action === "kill"
              ? `kill ${pid}`
              : "";
          if (!cmd) {
            sendJson(res, { error: "不支持的操作或缺少服务名" }, 400);
          } else {
            const guardErr = action === "kill" ? await procGuard(pid) : null;
            if (guardErr) {
              sendJson(res, { error: guardErr }, 403);
            } else {
              const r = await execCmd(cmd, { timeout: 15000 });
              sendJson(res, { ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr });
            }
          }
        }
      } else if (url.pathname === "/api/firewall/close" && req.method === "POST") {
        const body = await readBody(req);
        const { port, proto = "tcp", mode, password } = JSON.parse(body || "{}");
        const auth = await readAuth();
        if (!auth || !verifyPassword(password || "", auth)) {
          sendJson(res, { error: "密码错误，操作未执行" }, 403);
        } else if (!Number.isInteger(port) || port < 1 || port > 65535) {
          sendJson(res, { error: "无效的端口" }, 400);
        } else if (!["tcp", "udp"].includes(proto)) {
          sendJson(res, { error: "不支持的协议" }, 400);
        } else if (!["deny", "delete"].includes(mode)) {
          sendJson(res, { error: "不支持的关闭模式" }, 400);
        } else {
          const cmd = mode === "deny" ? `ufw deny ${port}/${proto}` : `ufw delete allow ${port}/${proto}`;
          const r = await execCmd(cmd, { timeout: 15000 });
          sendJson(res, { ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr });
        }
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
        const html = await readFile(join(STATIC, "index.html"));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate" });
        res.end(html);
      } else if (url.pathname === "/app.js") {
        const js = await readFile(join(STATIC, "app.js"));
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
    close: () => new Promise((resolve) => { termGen++; if (termShell) { try { termShell.kill(); } catch {} termShell = null; } clearInterval(monitorTimer); clearInterval(alertTimer); clearInterval(metricAlertTimer); clearInterval(sseGuard); Promise.all([closeSrv(server), httpsServer ? closeSrv(httpsServer) : Promise.resolve()]).then(resolve); }),
  };
}