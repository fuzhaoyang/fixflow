import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { runPostinstall } from "../scripts/postinstall.js";
import { needsReconfigure, clearReconfigureFlag, setReconfigureFlag } from "../src/setup.js";

test("无环境变量时写重配标记且不改写配置", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const cfg = join(dir, "config.json");
  const flag = join(dir, "reconfigure.flag");
  writeFileSync(cfg, JSON.stringify({ apiKey: "old", baseUrl: "https://x/v1", model: "m" }));
  const r = await runPostinstall({ configPath: cfg, markerPath: flag, env: {} });
  assert.equal(r.done, false);
  assert.equal(JSON.parse((await import("node:fs")).readFileSync(cfg, "utf8")).apiKey, "old");
  assert.ok(existsSync(flag));
});

test("needsReconfigure 反映标记状态", () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const flag = join(dir, "reconfigure.flag");
  setReconfigureFlag(flag);
  assert.equal(needsReconfigure(flag), true);
  clearReconfigureFlag(flag);
  assert.equal(needsReconfigure(flag), false);
});

test("环境变量齐全时自动写入配置并清除标记", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const cfg = join(dir, "config.json");
  const flag = join(dir, "reconfigure.flag");
  setReconfigureFlag(flag);
  let installed = false;
  const r = await runPostinstall({
    configPath: cfg,
    markerPath: flag,
    env: { FIXFLOW_API_KEY: "k1", FIXFLOW_BASE_URL: "https://deepseek/v1", FIXFLOW_MODEL: "deepseek-flash" },
    install: async () => { installed = true; return { installed: true }; },
  });
  assert.equal(r.config.apiKey, "k1");
  assert.equal(r.config.baseUrl, "https://deepseek/v1");
  assert.equal(r.config.model, "deepseek-flash");
  assert.equal(installed, true);
  assert.equal(existsSync(flag), false);
  assert.equal(JSON.parse((await import("node:fs")).readFileSync(cfg, "utf8")).apiKey, "k1");
});

test("服务注册失败时提示但配置仍保存", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const cfg = join(dir, "config.json");
  const flag = join(dir, "reconfigure.flag");
  const r = await runPostinstall({
    configPath: cfg,
    markerPath: flag,
    env: { FIXFLOW_API_KEY: "k1" },
    install: async () => ({ installed: false, reason: "需要 root" }),
  });
  assert.equal(r.done, true);
  assert.equal(r.service.installed, false);
  assert.ok(JSON.parse((await import("node:fs")).readFileSync(cfg, "utf8")).apiKey);
});