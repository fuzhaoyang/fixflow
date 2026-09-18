#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { loadConfig } from "../src/config.js";
import { startFlow } from "../src/cli.js";
import { startWeb } from "../src/web/server.js";
import { runSetup, writeConfig, printSuccess, DEFAULT_CONFIG_PATH } from "../src/setup.js";
import { install as installService } from "../src/service.js";

const [cmd] = process.argv.slice(2);

if (cmd === "--version" || cmd === "-v") {
  const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  console.log(version);
  process.exit(0);
}

let config = loadConfig();

if (!config.apiKey) {
  console.log("检测到尚未配置 API Key，进入配置向导...\n");
  const saved = await runSetup({ readConfig: () => { try { return JSON.parse(readFileSync(DEFAULT_CONFIG_PATH, "utf8")); } catch { return {}; } } });
  if (!saved) {
    console.log("配置未完成。可重新运行 fixflow 进入向导。");
    process.exit(1);
  }
  writeConfig(DEFAULT_CONFIG_PATH, saved);
  config = loadConfig();
  const svc = await installService();
  if (svc.installed) {
    console.log(`\n✓ 面板服务已注册并自动启动（systemd）`);
    console.log(`  访问地址: http://127.0.0.1:${config.port}`);
    console.log(`  管理命令: systemctl status fixflow / restart fixflow / stop fixflow`);
  } else {
    console.log(`\n⚠ 面板未注册为系统服务：${svc.reason}`);
  }
  printSuccess(config, { serviceInstalled: svc.installed });
  process.exit(0);
}

if (cmd === "web") {
  startWeb(config);
} else {
  startFlow(config);
}