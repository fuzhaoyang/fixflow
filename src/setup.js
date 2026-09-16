import readline from "node:readline";
import { stdin, stdout } from "node:process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

export const DEFAULT_CONFIG_PATH = join(homedir(), ".config", "fixflow", "config.json");
export const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export function mergeConfig(existing, updates) {
  return { ...existing, ...updates };
}

export function writeConfig(path, config) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2));
}

async function fetchModels(baseUrl, apiKey) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.data || []).map((m) => m.id);
}

function lineReader() {
  const rl = readline.createInterface({ input: stdin });
  const lines = [];
  let done = false;
  let resolvers = [];
  rl.on("line", (l) => {
    const r = resolvers.shift();
    if (r) r(l);
    else lines.push(l);
  });
  rl.on("close", () => {
    done = true;
    for (const r of resolvers) r(null);
  });
  return function next(prompt) {
    stdout.write(prompt);
    if (lines.length) return Promise.resolve(lines.shift());
    if (done) return Promise.resolve(null);
    return new Promise((resolve) => resolvers.push(resolve));
  };
}

export async function runSetup({ configPath = DEFAULT_CONFIG_PATH, readConfig = () => {} } = {}) {
  const ask = lineReader();
  const existing = readConfig();
  const config = { ...existing };

  console.log("\n=== fixflow 首次配置向导 ===\n");

  const baseUrl = (await ask("API 地址（回车默认 " + DEFAULT_BASE_URL + "）: "))?.trim() || DEFAULT_BASE_URL;
  config.baseUrl = baseUrl;

  const apiKey = (await ask("API Key: "))?.trim();
  if (!apiKey) {
    console.log("未输入 API Key，配置中止。");
    return null;
  }
  config.apiKey = apiKey;

  let models = [];
  try {
    models = await fetchModels(baseUrl, apiKey);
  } catch (e) {
    console.log(`拉取模型列表失败（${e.message}），将手动输入模型名。`);
  }

  let model = "";
  if (models.length) {
    console.log("\n可用模型：");
    models.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
    for (;;) {
      const answer = (await ask("选择编号或直接输入模型名: "))?.trim();
      if (!answer) continue;
      const idx = Number(answer);
      if (Number.isInteger(idx) && idx >= 1 && idx <= models.length) {
        model = models[idx - 1];
        break;
      }
      if (!Number.isNaN(idx)) {
        console.log("编号超出范围，请重新输入。");
        continue;
      }
      model = answer;
      break;
    }
  } else {
    model = (await ask("输入模型名（如 kimi-k2.7-code）: "))?.trim() || "";
  }
  config.model = model;

  return config;
}

export function printSuccess(config, { configPath = DEFAULT_CONFIG_PATH } = {}) {
  console.log(`\n✓ 配置已保存：${configPath}`);
  console.log(`  Base URL: ${config.baseUrl}`);
  console.log(`  模型: ${config.model}`);
  console.log(`\n=== 面板访问 ===`);
  console.log(`  启动面板: fixflow web`);
  console.log(`  访问地址: http://127.0.0.1:${config.port}`);
  console.log(`\n=== 不使用面板（CLI）===\n`);
  console.log(`  直接运行: fixflow`);
  console.log(`  然后输入运维指令，例如:`);
  console.log(`    > 检查磁盘占用`);
  console.log(`    > Nginx 配置排查`);
  console.log(`    > 防火墙开了哪些端口`);
  console.log(`  输入 clear 清除会话历史，exit/quit 退出。`);
  console.log(`  所有写入/删除/修改命令都会先弹确认（输入 y 执行）。`);
}