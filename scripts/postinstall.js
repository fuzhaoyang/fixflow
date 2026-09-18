import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { DEFAULT_BASE_URL, setReconfigureFlag, clearReconfigureFlag, RECONFIGURE_FLAG } from "../src/setup.js";
import { install as installService } from "../src/service.js";

export const DEFAULT_CONFIG_PATH = join(homedir(), ".config", "fixflow", "config.json");

export async function runPostinstall({ configPath = DEFAULT_CONFIG_PATH, markerPath = RECONFIGURE_FLAG, env = process.env, write = writeFileSync, log = console.log, install = installService } = {}) {
  const apiKey = env.FIXFLOW_API_KEY?.trim();
  if (!apiKey) {
    setReconfigureFlag(markerPath);
    log("\nfixflow 安装完成！");
    log("  每次安装后都需要重新配置模型 / 地址 / Key。");
    log("  请运行 fixflow 进入配置向导（选择服务商 → 粘贴 API Key → 选模型）。");
    log("  或用环境变量自动配置：FIXFLOW_API_KEY=... FIXFLOW_BASE_URL=... FIXFLOW_MODEL=... npm i -g fixflow-0.1.0.tgz");
    return { done: false, reason: "需运行 fixflow 配置" };
  }
  const config = {
    apiKey,
    baseUrl: env.FIXFLOW_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: env.FIXFLOW_MODEL?.trim() || "",
  };
  mkdirSync(dirname(configPath), { recursive: true });
  write(configPath, JSON.stringify(config, null, 2));
  clearReconfigureFlag(markerPath);
  log(`✓ 已自动保存配置到 ${configPath}`);
  log(`  Base URL: ${config.baseUrl}`);
  log(`  模型: ${config.model || "（未指定，运行 fixflow 选择）"}`);
  const svc = await install();
  if (svc.installed) {
    log("✓ 面板服务已注册并启动（systemd 托管，开机自启、退出终端不影响）");
    log("  访问地址: http://127.0.0.1:2222");
    log("  管理命令: systemctl status fixflow / restart fixflow / stop fixflow");
  } else {
    log(`\n⚠ 面板未注册为系统服务：${svc.reason}`);
  }
  return { done: true, config, service: svc };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await runPostinstall();