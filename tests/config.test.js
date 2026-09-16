import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("默认配置：默认端口 2222", () => {
  const dir = mkdtempSync(join(tmpdir(), "fixflow-"));
  const file = join(dir, "config.json");
  const cfg = loadConfig({ filePath: file });
  assert.equal(cfg.baseUrl, "https://api.openai.com/v1");
  assert.equal(cfg.model, "kimi-k2.7-code");
  assert.equal(cfg.port, 2222);
  assert.equal(cfg.timeout, 30000);
  assert.deepEqual(cfg.services, []);
});

test("配置文件覆盖默认值", () => {
  const dir = mkdtempSync(join(tmpdir(), "fixflow-"));
  const file = join(dir, "config.json");
  writeFileSync(file, JSON.stringify({ model: "m1", port: 9000, services: [{ name: "web", port: 8000 }] }));
  const cfg = loadConfig({ filePath: file });
  assert.equal(cfg.model, "m1");
  assert.equal(cfg.port, 9000);
  assert.equal(cfg.services.length, 1);
});