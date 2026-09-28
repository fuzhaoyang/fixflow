import { runCommand } from "./tools.js";

export async function openFirewallPort(port, { run = runCommand, getuid = () => (typeof process.getuid === "function" ? process.getuid() : 0) } = {}) {
  if (getuid() !== 0) return { ok: false, reason: "非 root，跳过防火墙放行" };
  const p = String(port);
  const hasUfw = await run("command -v ufw 2>/dev/null");
  if (hasUfw.exitCode === 0 && hasUfw.stdout.trim()) {
    const r = await run(`ufw allow ${p}/tcp`);
    return { ok: r.exitCode === 0, method: "ufw", detail: (r.stdout || r.stderr || "").trim() };
  }
  const hasFwd = await run("command -v firewall-cmd 2>/dev/null");
  if (hasFwd.exitCode === 0 && hasFwd.stdout.trim()) {
    const st = await run("firewall-cmd --state 2>/dev/null");
    if ((st.stdout || "").includes("running")) {
      const r = await run(`firewall-cmd --permanent --add-port=${p}/tcp && firewall-cmd --reload`);
      return { ok: r.exitCode === 0, method: "firewalld", detail: (r.stdout || r.stderr || "").trim() };
    }
  }
  const pol = await run("iptables -L INPUT -n 2>/dev/null | head -1");
  if (/DROP|REJECT/.test(pol.stdout || "")) {
    const chk = await run(`iptables -C INPUT -p tcp --dport ${p} -j ACCEPT 2>/dev/null`);
    if (chk.exitCode === 0) return { ok: true, method: "iptables", detail: "规则已存在" };
    const r = await run(`iptables -I INPUT -p tcp --dport ${p} -j ACCEPT`);
    return { ok: r.exitCode === 0, method: "iptables", detail: (r.stdout || r.stderr || "").trim() };
  }
  return { ok: false, reason: "未检测到启用的本机防火墙" };
}
