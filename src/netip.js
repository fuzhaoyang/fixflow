import { networkInterfaces } from "node:os";

export function lanIPs() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list || []) if (i.family === "IPv4" && !i.internal) out.push(i.address);
  }
  return [...new Set(out)];
}

export async function publicIP({ fetchImpl = fetch, timeout = 3000 } = {}) {
  try {
    const res = await fetchImpl("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ip || null;
  } catch { return null; }
}
