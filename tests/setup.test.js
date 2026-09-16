import test from "node:test";
import assert from "node:assert/strict";
import { mergeConfig, writeConfig, DEFAULT_CONFIG_PATH } from "../src/setup.js";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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