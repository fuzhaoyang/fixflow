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
