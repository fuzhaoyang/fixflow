import readline from "node:readline";
import { stdin, stdout } from "node:process";
import { mkdirSync, writeFileSync, existsSync, unlinkSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { lanIPs } from "./netip.js";

export const DEFAULT_CONFIG_PATH = join(homedir(), ".config", "fixflow", "config.json");
export const RECONFIGURE_FLAG = join(homedir(), ".config", "fixflow", "reconfigure.flag");
export const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export function needsReconfigure(flagPath = RECONFIGURE_FLAG) {
  return existsSync(flagPath);
}

export function clearReconfigureFlag(flagPath = RECONFIGURE_FLAG) {
  try { unlinkSync(flagPath); } catch {}
}

export function setReconfigureFlag(flagPath = RECONFIGURE_FLAG) {
  mkdirSync(dirname(flagPath), { recursive: true });
  writeFileSync(flagPath, "");
}

export function backupConfig(configPath = DEFAULT_CONFIG_PATH) {
  if (!existsSync(configPath)) return null;
  const bak = `${configPath}.bak`;
  try { copyFileSync(configPath, bak); return bak; } catch { return null; }
}

export const PROVIDERS = [
  { name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", applyUrl: "https://platform.deepseek.com" },
  { name: "Moonshot (Kimi)", baseUrl: "https://api.moonshot.cn/v1", applyUrl: "https://platform.moonshot.cn" },
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1", applyUrl: "https://platform.openai.com" },
];

export function mergeConfig(existing, updates) {
  return { ...existing, ...updates };
}

export function writeConfig(path, config) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2));
}

export async function verifyApiKey({ baseUrl, apiKey, fetchFn = fetch }) {
  let res;
  try {
    res = await fetchFn(`${baseUrl.replace(/\/$/, "")}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  } catch {
    return { ok: false, kind: "network", message: `无法连接 ${baseUrl}。请检查：1) 服务器能否访问外网；2) API 地址是否填对。` };
  }
  if (res.ok) {
    const data = await res.json();
    return { ok: true, models: (data.data || []).map((m) => m.id) };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, kind: "key", message: "API Key 无效或已过期，请重新复制粘贴后重试。" };
  }
  return { ok: false, kind: "http", message: `服务器返回 ${res.status}，请检查 API 地址是否正确。` };
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

export async function runSetup({ configPath = DEFAULT_CONFIG_PATH, readConfig = () => {}, ask = lineReader(), verify = verifyApiKey } = {}) {
  const existing = readConfig() || {};
  const config = { ...existing };
  const q = async (prompt) => {
    const a = await ask(prompt);
    return a === null ? null : a.trim();
  };

  console.log("\n=== Fixflow 配置向导 ===\n");
  console.log("接下来几步就能配好，放心跟着提示走。");
  console.log("提示：每项直接回车 = 保留当前已配置的值不修改。");

  const providers = [...PROVIDERS, { name: "其他 / 自定义地址", baseUrl: "" }];
  console.log("\n第一步：选择模型服务商");
  console.log("（API Key 去对应官网注册申请，新用户通常有免费额度）");
  providers.forEach((p, i) => console.log(`  ${i + 1}) ${p.name}${p.applyUrl ? `（${p.applyUrl} 申请）` : ""}`));
  if (config.baseUrl) console.log(`  （当前地址：${config.baseUrl}，回车保留）`);
  let baseUrl = config.baseUrl || "";
  for (;;) {
    const answer = await q("请选择编号: ");
    if (answer === null) return null;
    if (!answer && config.baseUrl) break;
    const idx = Number(answer);
    if (Number.isInteger(idx) && idx >= 1 && idx <= providers.length) {
      const sel = providers[idx - 1];
      if (sel.baseUrl) { baseUrl = sel.baseUrl; break; }
      const custom = await q("请输入 API 地址（形如 https://xxx.com/v1）: ");
      if (custom) { baseUrl = custom; break; }
      console.log("地址不能为空，请重新输入。");
    } else {
      console.log("请输入有效编号。");
    }
  }
  config.baseUrl = baseUrl;

  console.log(`\n第二步：API Key`);
  if (config.apiKey) console.log(`  （当前已配置 Key：••••${config.apiKey.slice(-4)}，回车保留）`);
  let models = [];
  for (;;) {
    const apiKey = await q("API Key: ");
    if (apiKey === null) return null;
    if (!apiKey && config.apiKey) break;
    if (!apiKey) { console.log("Key 不能为空。"); continue; }
    console.log("正在验证 Key…");
    const r = await verify({ baseUrl, apiKey });
    if (!r.ok) { console.log(`\n✗ ${r.message}`); continue; }
    models = r.models;
    config.apiKey = apiKey;
    break;
  }

  let model = config.model || "";
  console.log("\n第三步：选择模型");
  if (config.model) console.log(`  （当前模型：${config.model}，回车保留）`);
  if (models.length) {
    console.log("可用模型：");
    models.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
    for (;;) {
      const answer = await q("输入编号或直接输入模型名: ");
      if (answer === null) return null;
      if (!answer && config.model) break;
      if (!answer) { console.log("模型不能为空。"); continue; }
      const idx = Number(answer);
      if (Number.isInteger(idx) && idx >= 1 && idx <= models.length) { model = models[idx - 1]; break; }
      if (!Number.isNaN(idx)) { console.log("编号超出范围，请重新输入。"); continue; }
      model = answer; break;
    }
  } else {
    for (;;) {
      const answer = await q(config.model ? "输入模型名（回车保留）: " : "输入模型名（如 deepseek-chat）: ");
      if (answer === null) return null;
      if (answer) { model = answer; break; }
      if (config.model) break;
      console.log("模型不能为空。");
    }
  }
  config.model = model;

  console.log("\n第四步：是否现在启动 Web 面板");
  if (config.panel === false) {
    console.log("  （安装时已选择不启用面板，跳过）");
    config._startPanel = false;
  } else {
    for (;;) {
      const ans = await q("立即启动面板服务，用浏览器管理（推荐）？[Y/n] ");
      if (ans === null) return null;
      if (ans === "" || ans === "y" || ans === "yes") { config._startPanel = true; break; }
      if (ans === "n" || ans === "no") { config._startPanel = false; break; }
      console.log("请输入 y 或 n。");
    }
  }

  return config;
}

export function printSuccess(config, { configPath = DEFAULT_CONFIG_PATH, serviceInstalled = false, startPanel = true } = {}) {
  console.log(`\n✓ 配置已保存：${configPath}`);
  console.log(`  服务商: ${config.baseUrl}`);
  console.log(`  模型: ${config.model}`);
  console.log(`\n=== 面板访问 ===`);
  if (startPanel) {
    if (serviceInstalled) console.log(`  面板服务已由 systemd 托管（开机自启，崩溃自动恢复）`);
    else console.log(`  启动面板: fixflow web`);
    const suffix = config.panelPath ? `/${config.panelPath}/` : "/";
    const port = config.port || 2222;
    const ips = lanIPs();
    for (const ip of ips) console.log(`  访问地址: http://${ip}:${port}${suffix}`);
    if (!ips.length) console.log(`  访问地址: http://<服务器IP>:${port}${suffix}`);
    console.log(`  查看/重查访问地址: fixflow default`);
  } else {
    console.log(`  本次未启动面板。想用时运行: fixflow web`);
  }
  console.log(`\n=== 不使用面板（CLI）===\n`);
  console.log(`  直接运行: fixflow`);
  console.log(`  然后输入运维指令，例如:`);
  console.log(`    > 检查磁盘占用`);
  console.log(`    > Nginx 配置排查`);
  console.log(`    > 防火墙开了哪些端口`);
  console.log(`  输入 clear 清除会话历史，exit/quit 退出。`);
  console.log(`  所有写入/删除/修改命令都会先弹确认（输入 y 执行）。`);
}