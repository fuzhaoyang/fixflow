import test from "node:test";
import assert from "node:assert/strict";
import { mergeConfig, writeConfig, DEFAULT_CONFIG_PATH, runSetup, verifyApiKey, PROVIDERS, backupConfig } from "../src/setup.js";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const makeAsk = (answers) => { let i = 0; return async () => answers[i++]; };
const fakeVerify = async () => ({ ok: true, models: ["m1", "m2"] });

test("verifyApiKey：Key 无效返回 key 类错误", async () => {
  const r = await verifyApiKey({ baseUrl: "https://x/v1", apiKey: "bad", fetchFn: async () => ({ status: 401, ok: false, json: async () => ({}) }) });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "key");
});

test("verifyApiKey：网络异常返回 network 类错误", async () => {
  const r = await verifyApiKey({ baseUrl: "https://x/v1", apiKey: "k", fetchFn: async () => { throw new Error("ECONNREFUSED"); } });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "network");
});

test("runSetup：选服务商预设 + 校验 + 选模型 + 启动面板", async () => {
  const cfg = await runSetup({ ask: makeAsk(["1", "key1", "2", "y"]), verify: fakeVerify });
  assert.equal(cfg.baseUrl, "https://api.deepseek.com/v1");
  assert.equal(cfg.apiKey, "key1");
  assert.equal(cfg.model, "m2");
  assert.equal(cfg._startPanel, true);
});

test("runSetup：Key 无效时重试，跳过面板启动", async () => {
  const cfg = await runSetup({
    ask: makeAsk(["1", "bad", "good", "1", "n"]),
    verify: async ({ apiKey }) => apiKey === "bad"
      ? { ok: false, kind: "key", message: "无效" }
      : { ok: true, models: ["m1"] },
  });
  assert.equal(cfg.apiKey, "good");
  assert.equal(cfg.model, "m1");
  assert.equal(cfg._startPanel, false);
});

test("runSetup：自定义地址", async () => {
  const cfg = await runSetup({ ask: makeAsk(["4", "https://custom/v1", "k", "m-custom", "n"]), verify: fakeVerify });
  assert.equal(cfg.baseUrl, "https://custom/v1");
  assert.equal(cfg.model, "m-custom");
});

test("runSetup：有旧配置时全跳过保留旧值", async () => {
  const existing = { baseUrl: "https://old/v1", apiKey: "old-key", model: "old-model" };
  const cfg = await runSetup({ readConfig: () => existing, ask: makeAsk(["", "", "", "n"]), verify: fakeVerify });
  assert.equal(cfg.baseUrl, "https://old/v1");
  assert.equal(cfg.apiKey, "old-key");
  assert.equal(cfg.model, "old-model");
});

test("runSetup：有旧配置时输入新值强制覆盖", async () => {
  const existing = { baseUrl: "https://old/v1", apiKey: "old-key", model: "old-model" };
  const cfg = await runSetup({ readConfig: () => existing, ask: makeAsk(["2", "new-key", "m-new", "n"]), verify: fakeVerify });
  assert.equal(cfg.baseUrl, "https://api.moonshot.cn/v1");
  assert.equal(cfg.apiKey, "new-key");
  assert.equal(cfg.model, "m-new");
});

test("runSetup：全新安装且模型列表为空时模型必填", async () => {
  const cfg = await runSetup({
    ask: makeAsk(["1", "k", "", "m1", "n"]),
    verify: async () => ({ ok: true, models: [] }),
  });
  assert.equal(cfg.model, "m1");
});

test("PROVIDERS 提供常见服务商预设", () => {
  assert.ok(PROVIDERS.length >= 3);
  assert.ok(PROVIDERS.some((p) => p.name.includes("DeepSeek")));
});

test("backupConfig 复制旧配置为 .bak", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, JSON.stringify({ apiKey: "old", baseUrl: "https://old/v1" }));
  const bak = backupConfig(cfg);
  assert.equal(bak, cfg + ".bak");
  const saved = JSON.parse(readFileSync(bak, "utf8"));
  assert.equal(saved.apiKey, "old");
});

test("backupConfig 无旧配置时返回 null", () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  assert.equal(backupConfig(join(dir, "none.json")), null);
});

test("mergeConfig 保留已有字段，只更新模型三项", () => {
  const existing = { port: 8099, services: [{ name: "s" }], apiKey: "old" };
  const out = mergeConfig(existing, { baseUrl: "https://x/v1", apiKey: "new", model: "m1" });
  assert.equal(out.port, 8099);
  assert.equal(out.services.length, 1);
  assert.equal(out.model, "m1");
  assert.equal(out.apiKey, "new");
});

test("mergeConfig 更新 model 时，未提供字段不覆盖", () => {
  const existing = { baseUrl: "old", model: "keep", apiKey: "k" };
  const out = mergeConfig(existing, { model: "m2" });
  assert.equal(out.baseUrl, "old");
  assert.equal(out.model, "m2");
  assert.equal(out.apiKey, "k");
});

test("writeConfig 落盘 JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "fixflow-setup-"));
  const file = join(dir, "config.json");
  writeConfig(file, { apiKey: "k", model: "m" });
  const saved = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(saved.model, "m");
  assert.equal(saved.apiKey, "k");
});

test("DEFAULT_CONFIG_PATH 指向用户配置目录", () => {
  assert.match(DEFAULT_CONFIG_PATH, /\.config\/fixflow\/config\.json$/);
});