import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensurePanelAccess, buildUrls } from "../src/panel-access.js";

test("缺 panelPath/端口时生成并写盘", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-pa-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, JSON.stringify({ port: 2222 }));
  const a = await ensurePanelAccess({ port: 2222 }, { configPath: cfg });
  assert.match(a.panelPath, /^[0-9a-f]{12}$/);
  assert.ok(a.port >= 10000 && a.port <= 65535);
  const saved = JSON.parse(readFileSync(cfg, "utf8"));
  assert.equal(saved.panelPath, a.panelPath);
  assert.equal(saved.port, a.port);
});

test("已有 panelPath 与自定义端口保持不变", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-pa-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, JSON.stringify({}));
  const a = await ensurePanelAccess({ port: 30000, panelPath: "abcdef123456" }, { configPath: cfg });
  assert.equal(a.port, 30000);
  assert.equal(a.panelPath, "abcdef123456");
});

test("buildUrls 生成内网/公网地址", () => {
  const urls = buildUrls({ port: 12345, panelPath: "abc123", lan: ["192.168.1.2"], pub: "1.2.3.4" });
  assert.deepEqual(urls, ["http://192.168.1.2:12345/abc123/", "http://1.2.3.4:12345/abc123/"]);
});
