import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { runPostinstall } from "../scripts/postinstall.js";
import { needsReconfigure, clearReconfigureFlag, setReconfigureFlag } from "../src/setup.js";

test("无环境变量时写重配标记、不改写配置，且重启已在运行的服务", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const cfg = join(dir, "config.json");
  const flag = join(dir, "reconfigure.flag");
  writeFileSync(cfg, JSON.stringify({ apiKey: "old", baseUrl: "https://x/v1", model: "m" }));
  let restarted = false;
  const r = await runPostinstall({
    configPath: cfg,
    markerPath: flag,
    env: {},
    restart: async () => { restarted = true; return { active: true }; },
  });
  assert.equal(r.done, false);
  assert.equal(restarted, true);
  assert.equal(r.restarted, true);
  assert.equal(JSON.parse((await import("node:fs")).readFileSync(cfg, "utf8")).apiKey, "old");
  assert.ok(existsSync(flag));
});

test("无环境变量且服务未运行时不报错", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const cfg = join(dir, "config.json");
  const flag = join(dir, "reconfigure.flag");
  const r = await runPostinstall({
    configPath: cfg,
    markerPath: flag,
    env: {},
    restart: async () => ({ active: false }),
  });
  assert.equal(r.done, false);
  assert.equal(r.restarted, false);
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
test("FIXFLOW_PANEL=0 时不注册面板服务并写 panel:false", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const cfg = join(dir, "config.json");
  const flag = join(dir, "reconfigure.flag");
  let installed = false;
  const r = await runPostinstall({
    configPath: cfg, markerPath: flag,
    env: { FIXFLOW_API_KEY: "k1", FIXFLOW_PANEL: "0" },
    install: async () => { installed = true; return { installed: true }; },
  });
  assert.equal(installed, false);
  const saved = JSON.parse((await import("node:fs")).readFileSync(cfg, "utf8"));
  assert.equal(saved.panel, false);
  assert.equal(r.service.installed, false);
});

test("FIXFLOW_PANEL=1 时注册面板服务", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const cfg = join(dir, "config.json");
  const flag = join(dir, "reconfigure.flag");
  let installed = false;
  const r = await runPostinstall({
    configPath: cfg, markerPath: flag,
    env: { FIXFLOW_API_KEY: "k1", FIXFLOW_PANEL: "1" },
    install: async () => { installed = true; return { installed: true }; },
  });
  assert.equal(installed, true);
  assert.equal(r.service.installed, true);
});

test("FIXFLOW_PANEL=0 且无 apiKey 时写 panel:false 且不重启", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const cfg = join(dir, "config.json");
  const flag = join(dir, "reconfigure.flag");
  let restarted = false;
  const r = await runPostinstall({
    configPath: cfg, markerPath: flag,
    env: { FIXFLOW_PANEL: "0" },
    restart: async () => { restarted = true; return { active: true }; },
  });
  assert.equal(restarted, false);
  assert.equal(JSON.parse((await import("node:fs")).readFileSync(cfg, "utf8")).panel, false);
  assert.equal(r.panelEnabled, false);
});

test("面板安装后打印带入口的访问地址", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-"));
  const cfg = join(dir, "config.json");
  const flag = join(dir, "reconfigure.flag");
  const lines = [];
  await runPostinstall({
    configPath: cfg, markerPath: flag,
    env: { FIXFLOW_API_KEY: "k1", FIXFLOW_PANEL: "1" },
    install: async () => ({ installed: true }),
    log: (m) => lines.push(String(m)),
    lanIPs: () => ["192.168.1.5"],
    publicIP: async () => "1.2.3.4",
  });
  const out = lines.join("\n");
  assert.match(out, /面板访问地址/);
  assert.match(out, /http:\/\/192\.168\.1\.5:\d+\/[0-9a-f]{12}\//);
  assert.match(out, /http:\/\/1\.2\.3\.4:\d+\/[0-9a-f]{12}\//);
  assert.equal(JSON.parse((await import("node:fs")).readFileSync(cfg, "utf8")).panelPath.length, 12);
});
