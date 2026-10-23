import { readFile, appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export async function addDeployment(filePath, { service, version = "", commit = "", rollback = "", at = Date.now(), operator = "" } = {}) {
  const name = String(service || "").trim();
  if (!name) throw new Error("缺少服务名");
  const row = { service: name, version: String(version || ""), commit: String(commit || ""), rollback: String(rollback || ""), at: Number(at) || Date.now(), operator: String(operator || "") };
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, JSON.stringify(row) + "\n");
  return row;
}

export async function readDeployments(filePath, { service, limit = 20, since } = {}) {
  let text = "";
  try { text = await readFile(filePath, "utf8"); } catch { return []; }
  const rows = text.split("\n").filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean)
    .filter((r) => !service || r.service === service)
    .filter((r) => !since || (r.at || 0) >= since)
    .sort((a, b) => (b.at || 0) - (a.at || 0));
  return rows.slice(0, limit);
}
