import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { verifyApiKey } from "./setup.js";

export const DEFAULT_PORT = 2222;

async function checkNode() {
  const [major] = process.versions.node.split(".").map(Number);
  return { name: "Node.js 版本", ok: major >= 18, detail: `当前 ${process.version}（要求 ≥18）`, advice: major >= 18 ? "" : "请升级 Node.js 至 18 或更高版本后重试。" };
}

function checkConfig({ configPath, config }) {
  if (!existsSync(configPath)) {
    return { name: "配置文件", ok: false, detail: "未找到配置文件", advice: "运行 fixflow 进入配置向导生成配置。" };
  }
  if (!config?.apiKey) {
    return { name: "配置文件", ok: false, detail: "缺少 apiKey", advice: "运行 fixflow 重新配置 API Key。" };
  }
  return { name: "配置文件", ok: true, detail: `已配置 ${config.baseUrl} / ${config.model || "未指定模型"}`, advice: "" };
}

async function checkApi({ config, verify }) {
  const r = await verify({ baseUrl: config.baseUrl, apiKey: config.apiKey });
  return { name: "大模型 API 连通", ok: r.ok, detail: r.ok ? "校验成功，可正常拉取模型" : r.message, advice: r.ok ? "" : r.message };
}

async function checkPanel({ config, fetchFn }) {
  try {
    const res = await fetchFn(`http://127.0.0.1:${config.port || DEFAULT_PORT}/`);
    return { name: "面板服务", ok: res.ok, detail: `HTTP ${res.status}`, advice: res.ok ? "" : "面板未运行，执行 fixflow web 或启动 systemd 服务。" };
  } catch {
    return { name: "面板服务", ok: false, detail: "无法连接", advice: "面板未运行，执行 fixflow web 或启动 systemd 服务。" };
  }
}

export async function runDoctor({ config, configPath = join(homedir(), ".config", "fixflow", "config.json"), verify = verifyApiKey, fetchFn = fetch, skipPanel = false } = {}) {
  const checks = [
    await checkNode(),
    checkConfig({ configPath, config }),
  ];
  if (checks[1].ok) checks.push(await checkApi({ config, verify }));
  if (!skipPanel) checks.push(await checkPanel({ config, fetchFn }));

  console.log("\n=== Fixflow 自检 ===\n");
  let allOk = true;
  for (const c of checks) {
    console.log(`  ${c.ok ? "✅" : "❌"} ${c.name}：${c.detail}`);
    if (!c.ok && c.advice) console.log(`     建议：${c.advice}`);
    if (!c.ok) allOk = false;
  }
  console.log(allOk ? "\n✅ 全部正常，放心使用。" : "\n⚠ 存在未通过项，按上方建议处理后重试 fixflow doctor。");
  return { allOk, checks };
}