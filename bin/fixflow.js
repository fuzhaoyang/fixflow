#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { loadConfig } from "../src/config.js";
import { startFlow } from "../src/cli.js";
import { startWeb } from "../src/web/server.js";
import { runSetup, writeConfig, printSuccess, DEFAULT_CONFIG_PATH, needsReconfigure, clearReconfigureFlag, backupConfig } from "../src/setup.js";
import { install as installService, restart as restartService } from "../src/service.js";
import { ensurePanelAccess, buildUrls } from "../src/panel-access.js";
import { lanIPs, publicIP } from "../src/netip.js";
import { openFirewallPort } from "../src/firewall.js";
import { runUninstall } from "../scripts/uninstall.js";
import { runDoctor } from "../src/doctor.js";
import { hashPassword, isStrongPassword } from "../src/auth.js";
import readline from "node:readline/promises";

// 兜底：记录崩溃堆栈，避免偶发的未处理异常/拒绝直接终止面板
process.on("unhandledRejection", (reason) => {
  console.error("[fixflow] 未处理的 Promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[fixflow] 未捕获异常:", err);
});

const [cmd] = process.argv.slice(2);

if (cmd === "--version" || cmd === "-v") {
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  console.log(version);
  process.exit(0);
}

if (cmd === "uninstall") {
  console.log("正在卸载 fixflow（停止服务 + 卸载全局包 + 清理缓存，配置 config.json 保留）…");
  runUninstall();
  process.exit(0);
}

if (cmd === "reset-password") {
  const { writeFile, mkdir, chmod } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let current = {};
  try { current = JSON.parse(readFileSync(DEFAULT_CONFIG_PATH, "utf8")); } catch {}
  if (!current.auth) {
    console.log("尚未注册账号，请直接访问面板完成注册。");
    process.exit(1);
  }
  console.log(`当前账号：${current.auth.username}`);
  const pwd = await rl.question("请输入新密码（8-24 位，含大小写字母、数字和特殊字符）: ");
  if (!isStrongPassword((pwd || "").trim())) { console.log("密码强度不足（需 8-24 位，且包含大小写字母、数字和特殊字符），未修改。"); process.exit(1); }
  const { salt, hash } = hashPassword(pwd.trim());
  current.auth = { ...current.auth, salt, hash };
  await mkdir(dirname(DEFAULT_CONFIG_PATH), { recursive: true });
  await writeFile(DEFAULT_CONFIG_PATH, JSON.stringify(current, null, 2));
  await chmod(DEFAULT_CONFIG_PATH, 0o600).catch(() => {});
  console.log("✓ 密码已重置，请用新密码登录面板。");
  process.exit(0);
}

let config = loadConfig();

if (cmd === "doctor") {
  await runDoctor({ config });
  process.exit(0);
}

if (cmd === "restart") {
  console.log("正在重启 fixflow 面板服务…");
  const r = restartService();
  if (r.method === "none") {
    console.log("⚠ 无法自动重启（非 systemd 托管且无法自重启），请手动执行: fixflow web");
    process.exit(1);
  }
  console.log(r.method === "systemd" ? "✓ 已通过 systemctl 重启，稍等几秒后重新访问面板。" : "✓ 已拉起新进程，稍等几秒后重新访问面板。");
  process.exit(0);
}

if (cmd === "default") {
  const access = await ensurePanelAccess(config, { configPath: DEFAULT_CONFIG_PATH });
  const lan = lanIPs();
  const pub = await publicIP();
  const urls = buildUrls({ port: access.port, httpsPort: access.httpsPort, panelPath: access.panelPath, lan, pub });
  console.log("Fixflow 面板访问地址：");
  for (const u of urls) console.log("  " + u);
  if (!pub) console.log("  （公网 IP 获取失败，可能无外网）");
  console.log("  忘记密码可运行：fixflow reset-password");
  process.exit(0);
}

if (cmd === "web") {
  await ensurePanelAccess(config, { configPath: DEFAULT_CONFIG_PATH });
  const ports = [config.port, config.tls !== false ? config.httpsPort : null].filter(Boolean);
  for (const port of ports) {
    try {
      const fw = await openFirewallPort(port);
      if (fw.ok) {
        console.log(`✓ 已放行本机防火墙端口 ${port}（${fw.method}）`);
      } else {
        console.log(`\n⚠ 未能自动放行端口 ${port}：${fw.reason || "未知原因"}`);
        console.log("  请手动确保端口可被外部访问，否则无法打开面板：");
        console.log(`   · 本机防火墙：ufw allow ${port}/tcp`);
        console.log(`                 或 firewall-cmd --permanent --add-port=${port}/tcp && firewall-cmd --reload`);
        console.log(`   · 云服务器（阿里云/腾讯云等）：到控制台「安全组」入方向放行 TCP ${port}`);
      }
    } catch {}
  }
  await startWeb(config);
} else if (!config.apiKey || !config.baseUrl || !config.model || needsReconfigure()) {
  console.log(needsReconfigure() ? "检测到重新安装，需重新配置（模型 / 地址 / Key）...\n" : "检测到尚未配置完整（模型 / 地址 / Key），进入配置向导...\n");
  const saved = await runSetup({ readConfig: () => { try { return JSON.parse(readFileSync(DEFAULT_CONFIG_PATH, "utf8")); } catch { return {}; } } });
  if (!saved) {
    console.log("配置未完成。可重新运行 fixflow 进入向导。");
    process.exit(1);
  }
  while (!saved.apiKey || !saved.baseUrl || !saved.model) {
    console.log("\n⚠ 以下配置仍为空，未配置完无法使用 fixflow：");
    if (!saved.baseUrl) console.log("  · API 地址（baseUrl）");
    if (!saved.apiKey) console.log("  · API Key");
    if (!saved.model) console.log("  · 模型（model）");
    console.log("请继续完成配置。\n");
    const again = await runSetup({ readConfig: () => saved });
    if (!again) {
      console.log("配置未完成，可重新运行 fixflow 进入向导。");
      process.exit(1);
    }
    for (const k of ["baseUrl", "apiKey", "model"]) if (again[k]) saved[k] = again[k];
  }
  const startPanel = saved._startPanel !== false && saved.panel !== false;
  delete saved._startPanel;
  const bak = backupConfig(DEFAULT_CONFIG_PATH);
  if (bak) console.log(`旧配置已备份：${bak}`);
  writeConfig(DEFAULT_CONFIG_PATH, saved);
  clearReconfigureFlag();
  config = loadConfig();
  let svcInstalled = false;
  if (startPanel) {
    const svc = await installService();
    if (svc.installed) {
      svcInstalled = true;
      console.log(`\n✓ 面板服务已注册并自动启动（systemd）`);
      console.log(`  管理命令: systemctl status fixflow / restart fixflow / stop fixflow`);
    } else {
      console.log(`\n⚠ 面板未注册为系统服务：${svc.reason}`);
      console.log(`  （已临时启动面板进程，浏览器可访问）`);
    }
    await new Promise((r) => setTimeout(r, 500));
    await runDoctor({ config });
  } else {
    console.log("\n已跳过面板启动。之后想用面板时，运行: fixflow web");
  }
  printSuccess(config, { serviceInstalled: svcInstalled, startPanel });
  process.exit(0);
} else {
  startFlow(config);
}