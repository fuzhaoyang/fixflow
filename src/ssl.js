import { runCommand } from "./tools.js";
import { writeFile as fsWrite } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import tls from "node:tls";

export function shellQuote(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

export function parseCertOutput(text) {
  const out = String(text || "");
  const g = (re) => (out.match(re) || [])[1]?.trim() || "";
  const subject = g(/^subject=\s*(.*)$/m);
  const cn = (subject.match(/CN\s*=\s*([^,]+)/) || [])[1]?.trim() || subject;
  const issuer = g(/^issuer=\s*(.*)$/m);
  const notBefore = g(/^notBefore=\s*(.*)$/m);
  const notAfter = g(/^notAfter=\s*(.*)$/m);
  const serial = g(/^serial=\s*(.*)$/m);
  const sigAlgo = g(/Signature Algorithm:\s*(.*)$/m);
  const lines = out.split("\n");
  const idx = lines.findIndex((l) => /Subject Alternative Name/.test(l));
  const san = idx >= 0
    ? (lines[idx + 1]?.match(/DNS:([^,\s]+)/g) || []).map((s) => s.slice(4))
    : [];
  let daysLeft = null;
  if (notAfter) {
    const d = new Date(notAfter);
    if (!Number.isNaN(d.getTime())) daysLeft = Math.floor((d - Date.now()) / 86400000);
  }
  return { cn, issuer, notBefore, notAfter, serial, sigAlgo, san, daysLeft };
}

const X509_FLAGS = "-noout -subject -issuer -dates -serial -ext subjectAltName";

export async function readCertFile(path, exec = runCommand) {
  const q = shellQuote(path);
  const r = await exec(`openssl x509 -in ${q} ${X509_FLAGS} 2>/dev/null; echo '---SIG---'; openssl x509 -in ${q} -noout -text 2>/dev/null | grep -m1 'Signature Algorithm'`);
  if (!/notAfter=/.test(r.stdout || "")) return { error: (r.stderr || "").trim() || "无法读取证书" };
  return parseCertOutput(r.stdout);
}

export async function probeRemote(host, port = "443", exec = runCommand) {
  const h = shellQuote(host);
  const p = shellQuote(port);
  const r = await exec(`OUT=$(echo | timeout 10 openssl s_client -connect ${h}:${p} -servername ${h} -showcerts 2>/dev/null); echo "$OUT" | openssl x509 ${X509_FLAGS} 2>/dev/null; echo '---SIG---'; echo "$OUT" | openssl x509 -noout -text 2>/dev/null | grep -m1 'Signature Algorithm'; echo '---CHAIN---'; echo "$OUT" | grep -c 'BEGIN CERTIFICATE'`);
  if (!/notAfter=/.test(r.stdout || "")) return { host, port, error: (r.stderr || "").trim() || "无法读取证书" };
  const parsed = parseCertOutput(r.stdout);
  const chain = parseInt((r.stdout.split("---CHAIN---")[1] || "").trim(), 10) || 1;
  return { ...parsed, chain };
}

export async function discoverNginxCerts(exec = runCommand) {
  const r = await exec("grep -rhoE 'ssl_certificate[[:space:]]+[^;]*' /etc/nginx 2>/dev/null");
  return [...new Set((r.stdout || "").split("\n")
    .map((l) => l.replace(/^ssl_certificate\s+/, "").replace(/["';]/g, "").trim())
    .filter((p) => p.endsWith(".pem") || p.endsWith(".crt")))];
}

export async function discoverCertDirs(exec = runCommand) {
  const dirs = ["/etc/nginx/ssl", "/etc/letsencrypt/live", "/etc/ssl/private", "/etc/pki/tls/certs"];
  const r = await exec(`find ${dirs.map(shellQuote).join(" ")} -maxdepth 3 -type f \\( -name '*.pem' -o -name '*.crt' \\) 2>/dev/null`);
  return [...new Set((r.stdout || "").split("\n").map((s) => s.trim()).filter(Boolean))];
}

export function mergeSslEntries({ manual = [], discovered = [] }) {
  const seen = new Set();
  const out = [];
  for (const e of manual) {
    const key = e.type === "local" ? `l:${e.path}` : `r:${e.host}:${e.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...e, source: e.source || "manual" });
  }
  for (const p of discovered) {
    const key = `l:${p}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `d:${p}`, type: "local", host: "", port: "", path: p, label: "", enabled: true, source: "discovered" });
  }
  return out;
}

export async function collectSslAll(config = {}, exec = runCommand) {
  const [nginxPaths, dirPaths] = await Promise.all([discoverNginxCerts(exec), discoverCertDirs(exec)]);
  const discovered = [...new Set([...nginxPaths, ...dirPaths])];
  const manual = config.sslSites || [];
  const merged = mergeSslEntries({ manual, discovered });
  const results = await Promise.all(merged.map(async (e) => {
    const base = { id: e.id, source: e.source, type: e.type, host: e.host, port: e.port, path: e.path, label: e.label, enabled: e.enabled !== false };
    if (e.enabled === false) return base;
    if (e.type === "local") return { ...base, ...(await readCertFile(e.path, exec)) };
    return { ...base, ...(await probeRemote(e.host, e.port, exec)) };
  }));
  return { results };
}

export async function detectRenewTool(exec = runCommand) {
  const cb = await exec("command -v certbot 2>/dev/null");
  if (cb.exitCode === 0 && cb.stdout.trim()) return { tool: "certbot", path: cb.stdout.trim().split("\n")[0] };
  const ac = await exec("command -v acme.sh 2>/dev/null || ls ~/.acme.sh/acme.sh 2>/dev/null");
  if (ac.exitCode === 0 && ac.stdout.trim()) return { tool: "acme.sh", path: ac.stdout.trim().split("\n")[0] };
  return { tool: null };
}

export async function renewCert(entry, exec = runCommand) {
  const { tool, path } = await detectRenewTool(exec);
  if (!tool) return { ok: false, error: "未检测到 certbot 或 acme.sh" };
  const cn = entry.cn || entry.host;
  if (!cn) return { ok: false, error: "无法确定证书域名" };
  const cmd = tool === "certbot"
    ? `certbot renew --cert-name ${shellQuote(cn)}`
    : `${shellQuote(path)} --renew -d ${shellQuote(cn)}`;
  const r = await exec(cmd, { timeout: 120000 });
  const reload = await exec("systemctl reload nginx");
  return { ok: r.exitCode === 0, tool, stdout: r.stdout, stderr: r.stderr, reloaded: reload.exitCode === 0 };
}

export function checkSslAlerts(results = [], alerts = {}) {
  const last = { ...(alerts.lastNotified || {}) };
  const out = [];
  for (const r of results) {
    if (typeof r.daysLeft !== "number") continue;
    const key = r.id || (r.type === "local" ? `l:${r.path}` : `r:${r.host}:${r.port}`);
    const level = r.daysLeft <= 7 ? "critical" : r.daysLeft <= 30 ? "warn" : null;
    if (!level) continue;
    if (last[key] === r.notAfter) continue;
    out.push({ key, label: r.label || r.cn || r.host || r.path, daysLeft: r.daysLeft, level, notAfter: r.notAfter });
    last[key] = r.notAfter;
  }
  return { alerts: out, lastNotified: last };
}

export async function sendWebhook(url, payload, fetchImpl = fetch) {
  if (!url) return false;
  try {
    await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
    return true;
  } catch { return false; }
}

const b64 = (s) => Buffer.from(String(s)).toString("base64");

function smtpDialogue(sock) {
  let buf = "";
  let current = null;
  const inbox = [];
  const waiters = [];
  const onData = (chunk) => {
    buf += chunk.toString("utf8");
    pump();
    flush();
  };
  sock.on("data", onData);
  function pump() {
    let i;
    while ((i = buf.indexOf("\r\n")) !== -1) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (!current) current = { lines: [] };
      current.lines.push(line);
      if (/^\d{3} /.test(line)) { inbox.push(current); current = null; }
    }
  }
  function flush() {
    while (inbox.length && waiters.length) waiters.shift().resolve(inbox.shift().lines);
  }
  const wait = () => { flush(); return new Promise((resolve) => waiters.push({ resolve })); };
  return {
    wait,
    cmd: (s) => { sock.write(s + "\r\n"); return wait(); },
    detach: () => sock.removeListener("data", onData),
    close: () => { try { sock.destroy(); } catch {} },
  };
}

const codeOf = (lines) => parseInt((lines[0] || "").slice(0, 3), 10);
const expectCode = async (p, code) => {
  const lines = await p;
  if (codeOf(lines) !== code) throw new Error(`SMTP ${lines[0] || "无响应"}`);
  return lines;
};

export function sendSmtp(smtp) {
  return new Promise((resolve) => {
    const port = Number(smtp.port || 587) || 587;
    const secure = port === 465;
    let settled = false;
    const raw = secure
      ? tls.connect({ host: smtp.host, port, servername: smtp.host })
      : net.connect({ host: smtp.host, port });
    const d = smtpDialogue(raw);
    const done = (ok, error) => {
      if (settled) return;
      settled = true;
      try { d.detach(); } catch {}
      try { raw.destroy(); } catch {}
      resolve({ ok, error });
    };
    raw.setTimeout(30000, () => done(false, "SMTP 连接超时"));
    raw.once("error", (e) => done(false, e.message));
    raw.once(secure ? "secureConnect" : "connect", () => { run(d).catch((e) => done(false, e.message)); });

    async function run(dlg) {
      const g = await dlg.wait();
      if (codeOf(g) !== 220) throw new Error(`SMTP 服务器拒绝连接（${g[0] || ""}）`);
      let ehlo = await expectCode(dlg.cmd(`EHLO ${smtp.host || "localhost"}`), 250);
      if (!secure && ehlo.some((l) => /^250[ -]STARTTLS/i.test(l))) {
        await expectCode(dlg.cmd("STARTTLS"), 220);
        dlg.detach();
        const tlsSock = await new Promise((res, rej) => {
          const s = tls.connect({ socket: raw, servername: smtp.host }, () => res(s));
          s.once("error", rej);
        });
        dlg = smtpDialogue(tlsSock);
        await expectCode(dlg.cmd(`EHLO ${smtp.host || "localhost"}`), 250);
      }
      if (smtp.user) {
        await expectCode(dlg.cmd("AUTH LOGIN"), 334);
        await expectCode(dlg.cmd(b64(smtp.user)), 334);
        await expectCode(dlg.cmd(b64(smtp.pass || "")), 235);
      }
      const from = smtp.from || smtp.user;
      if (!from) throw new Error("缺少发件人（from）");
      await expectCode(dlg.cmd(`MAIL FROM:<${from}>`), 250);
      const tos = String(smtp.to || "").split(/[,;\s]+/).filter(Boolean);
      if (!tos.length) throw new Error("缺少收件人（to）");
      for (const t of tos) await expectCode(dlg.cmd(`RCPT TO:<${t}>`), 250);
      await expectCode(dlg.cmd("DATA"), 354);
      const msg = String(smtp.message || "").replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
      await expectCode(dlg.cmd(msg + "\r\n."), 250);
      dlg.cmd("QUIT").catch(() => {});
      done(true);
    }
  });
}

export async function sendEmail(smtp = {}, subject, body, exec = runCommand) {
  if (!smtp.to) return false;
  const msg = `To: ${smtp.to}\nFrom: ${smtp.from || smtp.user || "fixflow"}\nSubject: ${subject}\n\n${body}\n`;
  if (smtp.host) {
    const r = await sendSmtp({ ...smtp, message: msg });
    return r.ok;
  }
  const has = await exec("command -v sendmail 2>/dev/null");
  if (has.exitCode !== 0 || !has.stdout.trim()) return false;
  const file = join(tmpdir(), `ff-mail-${Date.now()}.txt`);
  await fsWrite(file, msg);
  const r = await exec(`sendmail -t < ${shellQuote(file)}`);
  return r.exitCode === 0;
}
