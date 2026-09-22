import { runCommand } from "./tools.js";

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
  const manual = (config.sslSites || []).filter((e) => e.enabled !== false);
  const merged = mergeSslEntries({ manual, discovered });
  const results = await Promise.all(merged.map(async (e) => {
    const base = { id: e.id, source: e.source, type: e.type, host: e.host, port: e.port, path: e.path, label: e.label };
    if (e.type === "local") return { ...base, ...(await readCertFile(e.path, exec)) };
    return { ...base, ...(await probeRemote(e.host, e.port, exec)) };
  }));
  return { results };
}
