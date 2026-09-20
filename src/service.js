import { writeFileSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const UNIT_PATH = "/etc/systemd/system/fixflow.service";

export function buildServiceUnit({ node, bin, home = process.env.HOME || "/root" }) {
  return `[Unit]
Description=Fixflow Web Panel
After=network.target

[Service]
Type=simple
Environment=HOME=${home}
ExecStart=${node} ${bin} web
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`;
}

function killStray(exec) {
  try { exec("pkill", ["-9", "-f", "bin/fixflow.js web"], { stdio: "ignore" }); } catch {}
  try { exec("sleep", ["0.5"], { stdio: "ignore" }); } catch {}
}

export async function install({
  node = process.execPath,
  bin = fileURLToPath(new URL("../bin/fixflow.js", import.meta.url)),
  getuid = () => (typeof process.getuid === "function" ? process.getuid() : 0),
  writeUnit = writeFileSync,
  exec = (cmd, args, opts) => spawnSync(cmd, args, opts),
  spawnChild = spawn,
} = {}) {
  if (getuid() !== 0) {
    return { installed: false, reason: "需要 root 权限。请以 root 运行 fixflow 完成首次配置，即可自动注册面板服务。" };
  }
  try {
    writeUnit(UNIT_PATH, buildServiceUnit({ node, bin }));
  } catch (e) {
    return { installed: false, reason: `写入服务单元失败：${e.message}` };
  }
  killStray(exec);
  for (const args of [["daemon-reload"], ["enable", "fixflow"], ["restart", "fixflow"]]) {
    const r = exec("systemctl", args, { stdio: "ignore" });
    if (r.status !== 0) {
      const child = spawnChild(node, [bin, "web"], { detached: true, stdio: "ignore" });
      child.unref();
      return { installed: false, reason: "systemd 不可用或启动失败，已用后台进程临时启动面板。可使用 fixflow web 手动管理" };
    }
  }
  return { installed: true };
}

export function restartIfActive({
  exec = (cmd, args, opts) => spawnSync(cmd, args, opts),
} = {}) {
  try {
    const active = exec("systemctl", ["is-active", "fixflow"], { stdio: "ignore" });
    if (active.status === 0) {
      killStray(exec);
      exec("systemctl", ["restart", "fixflow"], { stdio: "ignore" });
      return { active: true };
    }
  } catch {}
  return { active: false };
}

export function restart({
  exec = (cmd, args, opts) => spawnSync(cmd, args, opts),
  spawnChild = spawn,
  entry = process.argv[1],
  isService = process.argv.includes("web"),
} = {}) {
  try {
    const active = exec("systemctl", ["is-active", "fixflow"], { stdio: "ignore" });
    if (active.status === 0) {
      exec("systemctl", ["restart", "fixflow"], { stdio: "ignore" });
      return { method: "systemd" };
    }
  } catch {}
  if (!entry) return { method: "none" };
  if (!isService) {
    try { exec("pkill", ["-9", "-f", "bin/fixflow.js web"], { stdio: "ignore" }); } catch {}
    exec("sleep", ["0.5"], { stdio: "ignore" });
  }
  const child = spawnChild(process.execPath, [entry, "web"], { detached: true, stdio: "ignore" });
  child.unref();
  return { method: "respawn" };
}