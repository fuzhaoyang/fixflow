import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync } from "node:fs";
import { runDoctor } from "../src/doctor.js";

test("全部正常时 allOk 为 true", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ffdoc-"));
  const cfgPath = join(dir, "config.json");
  writeFileSync(cfgPath, "{}");
  const r = await runDoctor({
    config: { apiKey: "k", baseUrl: "https://x/v1", model: "m" },
    configPath: cfgPath,
    verify: async () => ({ ok: true, models: ["m"] }),
    fetchFn: async () => ({ ok: true, status: 200 }),
  });
  assert.equal(r.allOk, true);
  assert.equal(r.checks.length, 4);
});

test("API 校验失败时 allOk 为 false 且给出建议", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ffdoc-"));
  const cfgPath = join(dir, "config.json");
  writeFileSync(cfgPath, "{}");
  const r = await runDoctor({
    config: { apiKey: "bad", baseUrl: "https://x/v1" },
    configPath: cfgPath,
    verify: async () => ({ ok: false, kind: "key", message: "Key 无效" }),
    fetchFn: async () => ({ ok: true, status: 200 }),
  });
  assert.equal(r.allOk, false);
  const api = r.checks.find((c) => c.name.includes("API"));
  assert.equal(api.ok, false);
  assert.ok(api.advice);
});

test("无配置文件时不调用 API 检查，面板检查照常执行", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ffdoc-"));
  const cfgPath = join(dir, "missing.json");
  let verifyCalled = false;
  let panelChecked = false;
  const r = await runDoctor({
    config: {},
    configPath: cfgPath,
    verify: async () => { verifyCalled = true; return { ok: true, models: [] }; },
    fetchFn: async () => { panelChecked = true; return { ok: false, status: 0 }; },
  });
  assert.equal(r.allOk, false);
  assert.equal(r.checks.length, 3);
  assert.equal(verifyCalled, false);
  assert.equal(panelChecked, true);
});