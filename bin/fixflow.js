#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { loadConfig } from "../src/config.js";
import { startFlow } from "../src/cli.js";
import { startWeb } from "../src/web/server.js";
import { runSetup, writeConfig, printSuccess, DEFAULT_CONFIG_PATH } from "../src/setup.js";

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
  printSuccess(config);
  process.exit(0);
}

if (cmd === "web") {
  startWeb(config);
} else {
  startFlow(config);
}