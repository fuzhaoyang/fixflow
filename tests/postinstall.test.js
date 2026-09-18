import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { runPostinstall } from "../scripts/postinstall.js";

test("已有配置时不改写", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, JSON.stringify({ apiKey: "old", baseUrl: "https://x/v1", model: "m" }));
  let installed = false;
  const r = await runPostinstall({ configPath: cfg, env: { FIXFLOW_API_KEY: "new" }, install: async () => { installed = true; return { installed: true }; } });
  assert.equal(r.config.apiKey, "old");
  assert.equal(installed, false);
});

test("环境变量齐全时自动写入配置", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const cfg = join(dir, "config.json");
  let installed = false;
  const r = await runPostinstall({
    configPath: cfg,
    env: { FIXFLOW_API_KEY: "k1", FIXFLOW_BASE_URL: "https://deepseek/v1", FIXFLOW_MODEL: "deepseek-flash" },
    install: async () => { installed = true; return { installed: true }; },
  });
  assert.equal(r.config.apiKey, "k1");
  assert.equal(r.config.baseUrl, "https://deepseek/v1");
  assert.equal(r.config.model, "deepseek-flash");
  assert.equal(installed, true);
  assert.equal(JSON.parse((await import("node:fs")).readFileSync(cfg, "utf8")).apiKey, "k1");
});

test("服务注册失败时提示但配置仍保存", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const cfg = join(dir, "config.json");
  const r = await runPostinstall({
    configPath: cfg,
    env: { FIXFLOW_API_KEY: "k1" },
    install: async () => ({ installed: false, reason: "需要 root" }),
  });
  assert.equal(r.done, true);
  assert.equal(r.service.installed, false);
  assert.ok(JSON.parse((await import("node:fs")).readFileSync(cfg, "utf8")).apiKey);
});

test("未设置环境变量时返回未配置且不写文件", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const cfg = join(dir, "config.json");
  let installed = false;
  const r = await runPostinstall({ configPath: cfg, env: {}, install: async () => { installed = true; return { installed: true }; } });
  assert.equal(r.done, false);
  assert.equal(existsSync(cfg), false);
  assert.equal(installed, false);
});