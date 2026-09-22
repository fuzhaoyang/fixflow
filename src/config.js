import { readFileSync } from "node:fs";
import { join } from "node:path";

export function normalizeSslSites(list) {
  if (!Array.isArray(list)) return [];
  return list.map((s, i) => {
    if (typeof s === "string") {
      const [host, port] = s.split(":");
      return { id: `c${i + 1}`, type: "remote", host: host || "", port: port || "443", path: "", label: "", enabled: true, source: "manual" };
    }
    return {
      id: s.id || `c${i + 1}`,
      type: s.type === "local" ? "local" : "remote",
      host: s.host || "",
      port: s.port || "443",
      path: s.path || "",
      label: s.label || "",
      enabled: s.enabled !== false,
      source: s.source || "manual",
    };
  });
}

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
    sslSites: normalizeSslSites(file.sslSites),
    pingTargets: file.pingTargets || [],
    sslAlerts: file.sslAlerts || { webhook: "", smtp: {} },
  };
}
