import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig, normalizeDbConnections } from "../src/config.js";
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
});

test("配置文件覆盖默认值", () => {
  const dir = mkdtempSync(join(tmpdir(), "fixflow-"));
  const file = join(dir, "config.json");
  writeFileSync(file, JSON.stringify({ model: "m1", port: 9000 }));
  const cfg = loadConfig({ filePath: file });
  assert.equal(cfg.model, "m1");
  assert.equal(cfg.port, 9000);
});

test("配置新增 sslSites 与 pingTargets", () => {
  const dir = mkdtempSync(join(tmpdir(), "fixflow-"));
  const file = join(dir, "config.json");
  const cfg = loadConfig({ filePath: file });
  assert.deepEqual(cfg.sslSites, []);
  assert.deepEqual(cfg.pingTargets, []);
  writeFileSync(file, JSON.stringify({ sslSites: ["example.com"], pingTargets: ["1.1.1.1"] }));
  const cfg2 = loadConfig({ filePath: file });
  assert.equal(cfg2.sslSites[0].host, "example.com");
  assert.deepEqual(cfg2.pingTargets, ["1.1.1.1"]);
});

test("sslSites 旧字符串数组自动迁移为对象数组", () => {
  const dir = mkdtempSync(join(tmpdir(), "fixflow-"));
  const file = join(dir, "config.json");
  writeFileSync(file, JSON.stringify({ sslSites: ["example.com", "a.com:8443"] }));
  const cfg = loadConfig({ filePath: file });
  assert.equal(cfg.sslSites.length, 2);
  assert.equal(cfg.sslSites[0].type, "remote");
  assert.equal(cfg.sslSites[0].host, "example.com");
  assert.equal(cfg.sslSites[0].port, "443");
  assert.equal(cfg.sslSites[0].enabled, true);
  assert.equal(cfg.sslSites[1].host, "a.com");
  assert.equal(cfg.sslSites[1].port, "8443");
  assert.ok(cfg.sslSites[0].id);
});

test("sslSites 对象数组原样保留并补默认字段", () => {
  const dir = mkdtempSync(join(tmpdir(), "fixflow-"));
  const file = join(dir, "config.json");
  writeFileSync(file, JSON.stringify({ sslSites: [{ type: "local", path: "/etc/nginx/ssl/a.pem", enabled: false }] }));
  const cfg = loadConfig({ filePath: file });
  assert.equal(cfg.sslSites[0].type, "local");
  assert.equal(cfg.sslSites[0].path, "/etc/nginx/ssl/a.pem");
  assert.equal(cfg.sslSites[0].enabled, false);
  assert.equal(cfg.sslSites[0].source, "manual");
});

test("sslAlerts 默认值", () => {
  const dir = mkdtempSync(join(tmpdir(), "fixflow-"));
  const file = join(dir, "config.json");
  const cfg = loadConfig({ filePath: file });
  assert.deepEqual(cfg.sslAlerts, { webhook: "", smtp: {} });
});
test("loadConfig 读取 panelPath", () => {
  const dir = mkdtempSync(join(tmpdir(), "fixflow-"));
  const file = join(dir, "config.json");
  writeFileSync(file, JSON.stringify({ panelPath: "abcdef123456", port: 46833 }));
  const cfg = loadConfig({ filePath: file });
  assert.equal(cfg.panelPath, "abcdef123456");
  assert.equal(cfg.port, 46833);
});

test("normalizeDbConnections 兜底与非法类型过滤", () => {
  const r = normalizeDbConnections([
    { name: "pg", type: "postgres", host: "h", user: "u", password: "p" },
    { type: "oracle" },
    "string-entry",
    null,
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "db1");
  assert.equal(r[0].port, "5432");
  assert.equal(r[0].enabled, true);
});

test("dbConnections 从配置文件加载并规范化", () => {
  const dir = mkdtempSync(join(tmpdir(), "fixflow-"));
  const file = join(dir, "config.json");
  const cfg = loadConfig({ filePath: file });
  assert.deepEqual(cfg.dbConnections, []);
  writeFileSync(file, JSON.stringify({ dbConnections: [{ name: "r", type: "redis", host: "127.0.0.1", port: 6379 }] }));
  const cfg2 = loadConfig({ filePath: file });
  assert.equal(cfg2.dbConnections[0].type, "redis");
  assert.equal(cfg2.dbConnections[0].port, "6379");
});
