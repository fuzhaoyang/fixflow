import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function extractKeys(lang) {
  const src = await readFile(new URL("../src/web/static/i18n.js", import.meta.url), "utf8");
  const name = lang === "zh" ? "I18N_ZH" : "I18N_EN";
  const start = src.indexOf(`const ${name} = {`);
  const end = src.indexOf("};", start);
  const obj = src.slice(start, end + 2);
  return new Set([...obj.matchAll(/(?:\{|,)\s*"([^"]+)":/g)].map((m) => m[1]));
}

test("i18n 字典 zh/en 键集合一致", async () => {
  const zh = await extractKeys("zh");
  const en = await extractKeys("en");
  for (const k of zh) assert.ok(en.has(k), `en 缺少 key: ${k}`);
  for (const k of en) assert.ok(zh.has(k), `zh 缺少 key: ${k}`);
});

test("帮助文档 help.body 中英均定义", async () => {
  const src = await readFile(new URL("../src/web/static/i18n.js", import.meta.url), "utf8");
  assert.ok(src.includes('I18N.zh["help.body"]'));
  assert.ok(src.includes('I18N.en["help.body"]'));
});
