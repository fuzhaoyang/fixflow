import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { unlinkSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const UNIT_PATH = "/etc/systemd/system/fixflow.service";
const CONFIG_DIR = join(homedir(), ".config", "fixflow");
const CACHE_FILES = ["cli.log", "history.json", "reconfigure.flag"];

export function runUninstall({ exec = spawnSync, log = console.log, npm = "npm" } = {}) {
  const run = (cmd, args) => { try { exec(cmd, args, { stdio: "ignore" }); } catch {} };
  run("systemctl", ["stop", "fixflow"]);
  run("systemctl", ["disable", "fixflow"]);
  if (existsSync(UNIT_PATH)) { try { unlinkSync(UNIT_PATH); } catch {} }
  run("systemctl", ["daemon-reload"]);
  run("pkill", ["-9", "-f", "bin/fixflow.js web"]);
  for (const f of CACHE_FILES) {
    const p = join(CONFIG_DIR, f);
    if (existsSync(p)) { try { unlinkSync(p); } catch {} }
  }
  log("✓ 服务已停止，缓存已清理。");
  log("正在卸载 npm 全局包…");
  const r = exec(npm, ["uninstall", "-g", "fixflow", "--ignore-scripts"], { stdio: "inherit" });
  if (r.status === 0) log("✓ fixflow 已彻底卸载（配置 config.json 已保留，重装后无需重新配置）。");
  else log("⚠ npm 卸载失败，请手动执行: npm uninstall -g fixflow");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) runUninstall();