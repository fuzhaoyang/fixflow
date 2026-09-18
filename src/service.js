import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const UNIT_PATH = "/etc/systemd/system/fixflow.service";

export function buildServiceUnit({ node, bin }) {
  return `[Unit]
Description=Fixflow Web Panel
After=network.target

[Service]
Type=simple
ExecStart=${node} ${bin} web
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`;
}

export async function install({
  node = process.execPath,
  bin = fileURLToPath(new URL("../bin/fixflow.js", import.meta.url)),
  getuid = () => (typeof process.getuid === "function" ? process.getuid() : 0),
  writeUnit = writeFileSync,
  exec = (cmd, args, opts) => spawnSync(cmd, args, opts),
} = {}) {
  if (getuid() !== 0) {
    return { installed: false, reason: "需要 root 权限。请以 root 运行 fixflow 完成首次配置，即可自动注册面板服务。" };
  }
  try {
    writeUnit(UNIT_PATH, buildServiceUnit({ node, bin }));
  } catch (e) {
    return { installed: false, reason: `写入服务单元失败：${e.message}` };
  }
  for (const args of [["daemon-reload"], ["enable", "fixflow"], ["restart", "fixflow"]]) {
    const r = exec("systemctl", args, { stdio: "ignore" });
    if (r.status !== 0) return { installed: false, reason: `systemctl ${args.join(" ")} 失败（exit ${r.status}），请检查 journalctl -u fixflow` };
  }
  return { installed: true };
}