import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadConfig({ filePath = join(process.env.HOME || ".", ".config", "fixflow", "config.json") } = {}) {
  let file = {};
  try { file = JSON.parse(readFileSync(filePath, "utf8")); } catch {}

  return {
    apiKey: process.env.FIXFLOW_API_KEY || file.apiKey || "",
    baseUrl: process.env.FIXFLOW_BASE_URL || file.baseUrl || "https://api.openai.com/v1",
    model: process.env.FIXFLOW_MODEL || file.model || "kimi-k2.7-code",
    port: file.port || 2222,
    timeout: file.timeout || 30000,
    services: file.services || [],
    databases: file.databases || [],
    sslSites: file.sslSites || [],
    pingTargets: file.pingTargets || [],
  };
}