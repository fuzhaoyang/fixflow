#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { loadConfig } from "../src/config.js";
import { startFlow } from "../src/cli.js";
import { startWeb } from "../src/web/server.js";
import { runSetup, writeConfig, printSuccess, DEFAULT_CONFIG_PATH, needsReconfigure, clearReconfigureFlag, backupConfig } from "../src/setup.js";
import { install as installService } from "../src/service.js";
import { runDoctor } from "../src/doctor.js";

const [cmd] = process.argv.slice(2);

if (cmd === "--version" || cmd === "-v") {
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  console.log(version);
  process.exit(0);
}

let config = loadConfig();

if (cmd === "doctor") {
  await runDoctor({ config });
  process.exit(0);
}

if (!config.apiKey || needsReconfigure()) {
  console.log(needsReconfigure() ? "检测到重新安装，需重新配置（模型 / 地址 / Key）...\n" : "检测到尚未配置 API Key，进入配置向导...\n");
  const saved = await runSetup({ readConfig: () => { try { return JSON.parse(readFileSync(DEFAULT_CONFIG_PATH, "utf8")); } catch { return {}; } } });
  if (!saved) {
    console.log("配置未完成。可重新运行 fixflow 进入向导。");
    process.exit(1);
  }
  const startPanel = saved._startPanel !== false;
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
    }
    await new Promise((r) => setTimeout(r, 500));
    await runDoctor({ config });
  } else {
    console.log("\n已跳过面板启动。之后想用面板时，运行: fixflow web");
  }
  printSuccess(config, { serviceInstalled: svcInstalled, startPanel });
  process.exit(0);
}

if (cmd === "web") {
  startWeb(config);
} else {
  startFlow(config);
}