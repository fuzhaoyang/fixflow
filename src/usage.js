import { readFile, writeFile } from "node:fs/promises";
import { pad2 } from "./util.js";

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function prune(data) {
  const cutoff = dayKey(new Date(Date.now() - 90 * 86400000));
  for (const k of Object.keys(data)) if (k < cutoff) delete data[k];
}

export async function createUsageStore({ filePath } = {}) {
  let data = {};
  if (filePath) {
    try { data = JSON.parse(await readFile(filePath, "utf8")); } catch {}
    prune(data);
  }
  const persist = async () => {
    if (!filePath) return;
    prune(data);
    await writeFile(filePath, JSON.stringify(data, null, 2)).catch(() => {});
  };
  return {
    async record({ promptTokens = 0, completionTokens = 0 } = {}) {
      const key = dayKey();
      const cur = data[key] || { prompt: 0, completion: 0 };
      cur.prompt += promptTokens;
      cur.completion += completionTokens;
      data[key] = cur;
      await persist();
    },
    daily(days = 30) {
      prune(data);
      const out = [];
      const today = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = dayKey(d);
        const e = data[key];
        out.push({ date: key, prompt: e?.prompt || 0, completion: e?.completion || 0, total: (e?.prompt || 0) + (e?.completion || 0) });
      }
      return out;
    },
  };
}
