import { runCommand } from "./tools.js";

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
