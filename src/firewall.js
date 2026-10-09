import { runCommand } from "./tools.js";
import { parseUfwStatus } from "./metrics.js";

export function isRoot(getuid = () => (typeof process.getuid === "function" ? process.getuid() : 0)) {
  return getuid() === 0;
}

// 校验 root 密码（面板 root 时校验本机 root 登录；非 root 时用 sudo -S 校验当前用户 sudo 密码）
export async function verifySudo(password, { run = runCommand, getuid } = {}) {
  if (!password) return false;
  if (isRoot(getuid)) {
    const r = await run(`echo "${password}" | su -c true root 2>/dev/null`);
    return r.exitCode === 0;
  }
  const r = await run(`echo "${password}" | sudo -S -p '' true 2>/dev/null`);
  return r.exitCode === 0;
}

// 以 root 权限执行命令：root 进程直跑，非 root 走 sudo -S（密码经 stdin）
export function sudoCmd(cmd, password, getuid) {
  if (isRoot(getuid)) return cmd;
  const escaped = String(cmd).replace(/"/g, '\\"');
  return `echo "${password}" | sudo -S -p '' bash -c "${escaped}" 2>/dev/null`;
}

export async function runPrivileged(cmd, password, { run = runCommand, timeout = 15000, getuid } = {}) {
  return run(sudoCmd(cmd, password, getuid), { timeout });
}

export async function detectBackend({ run = runCommand } = {}) {
  const fw = await run("firewall-cmd --state 2>/dev/null");
  if (fw.exitCode === 0 && /running/i.test(fw.stdout || "")) return "firewalld";
  const ufw = await run("ufw status 2>/dev/null");
  if (ufw.exitCode === 0 && /Status:\s*active/i.test(ufw.stdout || "")) return "ufw";
  return null;
}

export async function activeZones({ run = runCommand } = {}) {
  const az = await run("firewall-cmd --get-active-zones 2>/dev/null");
  const zones = (az.stdout || "").split("\n").filter((l) => l && !/^\s/.test(l)).map((s) => s.trim());
  return zones.length ? zones : ["public"];
}

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
      const az = await run("firewall-cmd --get-active-zones 2>/dev/null");
      const zones = (az.stdout || "").split("\n").filter((l) => l && !/^\s/.test(l)).map((s) => s.trim());
      const list = zones.length ? zones : ["public"];
      let ok = true;
      let detail = "";
      for (const z of list) {
        const r = await run(`firewall-cmd --zone=${z} --add-port=${p}/tcp --permanent`);
        if (r.exitCode !== 0) ok = false;
        detail += (r.stdout || r.stderr || "").trim();
      }
      const reload = await run("firewall-cmd --reload");
      return { ok: ok && reload.exitCode === 0, method: `firewalld(${list.join(",")})`, detail: detail || (reload.stdout || "").trim() };
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

// 面板端口黑白名单的目标规则（自上而下求值：黑名单拦截 → 白名单放行 → 兜底）
export function aclTargetRules(acl, port) {
  const out = [];
  for (const b of acl.blacklist || []) out.push(`deny from ${b.ip} to any port ${port} proto tcp`);
  const white = acl.whitelist || [];
  if (white.length) {
    for (const w of white) out.push(`allow from ${w.ip} to any port ${port} proto tcp`);
    out.push(`deny ${port}/tcp`);
  } else {
    out.push(`allow ${port}/tcp`);
  }
  return out;
}

// 将 acl 状态全量同步到 ufw：先清掉面板端口旧规则，再按目标顺序逐条 ufw insert 1
export async function syncAclRules(acl, ports, password, { run = runCommand, getuid = () => (typeof process.getuid === "function" ? process.getuid() : 0) } = {}) {
  const st = await run("ufw status 2>/dev/null");
  if (!/Status:\s*active/i.test(st.stdout || "")) return { ok: false, error: "UFW 未启用，无法操作黑白名单" };
  const numbered = await run("ufw status numbered 2>/dev/null");
  const { rules } = parseUfwStatus(numbered.stdout || "");
  const portSet = new Set(ports.map(String));
  const stale = rules.filter((r) => String(r.port || "").split(",").map((s) => s.trim()).some((p) => portSet.has(p)));
  for (const r of [...stale].sort((a, b) => b.num - a.num)) {
    const d = await runPrivileged(`ufw delete ${r.num}`, password, { run, timeout: 15000, getuid });
    if (d.exitCode !== 0) return { ok: false, error: `删除旧规则失败：${(d.stderr || d.stdout || "").trim()}` };
  }
  for (const port of ports) {
    const target = aclTargetRules(acl, port);
    for (let i = target.length - 1; i >= 0; i--) {
      const ins = await runPrivileged(`ufw insert 1 ${target[i]}`, password, { run, timeout: 15000, getuid });
      if (ins.exitCode !== 0) return { ok: false, error: `添加规则失败：${(ins.stderr || ins.stdout || "").trim()}` };
    }
  }
  return { ok: true };
}
