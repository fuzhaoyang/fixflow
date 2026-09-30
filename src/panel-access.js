import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import net from "node:net";

function portFree(p) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(p, "0.0.0.0", () => srv.close(() => resolve(true)));
  });
}

async function pickPort() {
  for (let i = 0; i < 30; i++) {
    const p = 10000 + Math.floor(Math.random() * (65536 - 10000));
    if (await portFree(p)) return p;
  }
  return 10000 + Math.floor(Math.random() * 50000);
}

export async function ensurePanelAccess(config = {}, { configPath } = {}) {
  let changed = false;
  if (config.port == null || config.port === 2222) { config.port = await pickPort(); changed = true; }
  if (!config.panelPath) { config.panelPath = randomBytes(6).toString("hex"); changed = true; }
  if (changed && configPath) {
    let cur = {};
    try { cur = JSON.parse(await readFile(configPath, "utf8")); } catch {}
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify({ ...cur, port: config.port, panelPath: config.panelPath }, null, 2));
  }
  return { port: config.port, panelPath: config.panelPath, httpsPort: config.httpsPort };
}

export function buildUrls({ port, httpsPort, panelPath, lan = [], pub = null }) {
  const suffix = panelPath ? `/${panelPath}/` : "/";
  const urls = [];
  for (const ip of lan) {
    urls.push(`http://${ip}:${port}${suffix}`);
    if (httpsPort) urls.push(`https://${ip}:${httpsPort}${suffix}`);
  }
  if (pub) {
    urls.push(`http://${pub}:${port}${suffix}`);
    if (httpsPort) urls.push(`https://${pub}:${httpsPort}${suffix}`);
  }
  return urls;
}
