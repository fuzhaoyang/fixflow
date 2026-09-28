import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { DEFAULT_BASE_URL, setReconfigureFlag, clearReconfigureFlag, RECONFIGURE_FLAG } from "../src/setup.js";
import { install as installService, restartIfActive } from "../src/service.js";
import { ensurePanelAccess, buildUrls } from "../src/panel-access.js";
import { lanIPs as defaultLanIPs, publicIP as defaultPublicIP } from "../src/netip.js";

export const DEFAULT_CONFIG_PATH = join(homedir(), ".config", "fixflow", "config.json");

function panelFromEnv(env) {
  const v = (env.FIXFLOW_PANEL || "").trim().toLowerCase();
  if (["0", "no", "false", "off"].includes(v)) return false;
  if (["1", "yes", "true", "on"].includes(v)) return true;
  return null;
}

async function defaultAskPanel() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return null;
  const { createInterface } = await import("node:readline");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((resolve) => {
      rl.question("是否启用 Web 面板（浏览器管理）？[Y/n] ", (a) => {
        const v = a.trim().toLowerCase();
        resolve(v === "" || v === "y" || v === "yes" || v === "1");
      });
    });
  } finally { rl.close(); }
}

function persistPanel(configPath, panelEnabled, write) {
  if (panelEnabled) return;
  mkdirSync(dirname(configPath), { recursive: true });
  let cur = {};
  try { cur = JSON.parse(readFileSync(configPath, "utf8")); } catch {}
  write(configPath, JSON.stringify({ ...cur, panel: false }, null, 2));
}

async function printPanelAddress(config, configPath, { log, lanIPs, publicIP }) {
  const access = await ensurePanelAccess(config, { configPath });
  const pub = await publicIP({ timeout: 2000 }).catch(() => null);
  log(`  面板访问地址（请确保安全组/防火墙放行端口 ${access.port}）：`);
  for (const u of buildUrls({ port: access.port, panelPath: access.panelPath, lan: lanIPs(), pub })) log("    " + u);
  if (!pub) log("    （公网 IP 获取失败；可运行 fixflow default 重查）");
}

const SIZE_NOTE = "包体参考：全量安装包 ~483KB(tgz) / ~2.3MB(解压)；面板（echarts+web）约占 1.6MB；仅 CLI 核心约 0.7MB。";

export async function runPostinstall({ configPath = DEFAULT_CONFIG_PATH, markerPath = RECONFIGURE_FLAG, env = process.env, write = writeFileSync, log = console.log, install = installService, restart = restartIfActive, askPanel = defaultAskPanel, lanIPs = defaultLanIPs, publicIP = defaultPublicIP } = {}) {
  const panelEnabled = panelFromEnv(env) ?? (await askPanel()) ?? true;
  let existing = {};
  try { existing = JSON.parse(readFileSync(configPath, "utf8")); } catch {}
  const apiKey = env.FIXFLOW_API_KEY?.trim();

  if (!apiKey) {
    if (existing.apiKey) {
      setReconfigureFlag(markerPath);
      const r = panelEnabled ? await restart() : { active: false };
      log("\nfixflow 已更新（检测到已有配置）。");
      if (r.active) log("✓ 已重启面板服务，新版本已生效");
      if (panelEnabled) await printPanelAddress(existing, configPath, { log, lanIPs, publicIP });
      log("  下次运行 fixflow 可进入配置向导（继续面板设置）。");
      log("  ⚠ 卸载请务必运行 fixflow uninstall（会停服务+卸载包），不要直接用 npm uninstall。");
      return { done: true, restarted: r.active, panelEnabled, alreadyConfigured: true };
    }
    setReconfigureFlag(markerPath);
    persistPanel(configPath, panelEnabled, write);
    const r = panelEnabled ? await restart() : { active: false };
    log("\nfixflow 安装完成！");
    if (r.active) log("✓ 已重启正在运行的 fixflow 服务，新版本已生效");
    if (panelEnabled) {
      log("  请运行 fixflow 进入配置向导（选择服务商 → 粘贴 API Key → 选模型）。");
      await printPanelAddress(existing, configPath, { log, lanIPs, publicIP });
    } else {
      log("  ⚪ 已选择不启用 Web 面板（CLI 模式）");
      log(`  ${SIZE_NOTE}`);
      log("  想随时启用面板：运行 fixflow web，或重新安装时选 Y。");
    }
    log("  或用环境变量自动配置：FIXFLOW_API_KEY=... FIXFLOW_BASE_URL=... FIXFLOW_MODEL=... npm i -g fixflow-0.1.0.tgz");
    log("  ⚠ 卸载请务必运行 fixflow uninstall（会停服务+卸载包），不要直接用 npm uninstall。");
    return { done: false, reason: "需运行 fixflow 配置", restarted: r.active, panelEnabled };
  }

  const config = {
    apiKey,
    baseUrl: env.FIXFLOW_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: env.FIXFLOW_MODEL?.trim() || "",
  };
  if (!panelEnabled) config.panel = false;
  mkdirSync(dirname(configPath), { recursive: true });
  write(configPath, JSON.stringify(config, null, 2));
  clearReconfigureFlag(markerPath);
  log(`✓ 已自动保存配置到 ${configPath}`);
  log(`  Base URL: ${config.baseUrl}`);
  log(`  模型: ${config.model || "（未指定，运行 fixflow 选择）"}`);
  if (panelEnabled) {
    const svc = await install();
    if (svc.installed) {
      log("✓ 面板服务已注册并启动（systemd 托管，开机自启、退出终端不影响）");
      log("  管理命令: systemctl status fixflow / restart fixflow / stop fixflow");
      await printPanelAddress(config, configPath, { log, lanIPs, publicIP });
    } else {
      log(`\n⚠ 面板未注册为系统服务：${svc.reason}`);
    }
    return { done: true, config, service: svc };
  }
  log("  ⚪ 已选择不启用 Web 面板（CLI 模式）");
  log(`  ${SIZE_NOTE}`);
  log("  想随时启用面板：运行 fixflow web，或重新安装时选 Y。");
  log("  ⚠ 卸载请务必运行 fixflow uninstall（会停服务+卸载包），不要直接用 npm uninstall。");
  return { done: true, config, service: { installed: false, reason: "已选择不启用面板" } };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await runPostinstall();
