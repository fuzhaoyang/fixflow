import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startWeb } from "../src/web/server.js";

test("静态页与监控接口返回 200", async () => {
  const w = await startWeb({ port: 0, services: [], databases: [] });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const [page, app, metrics] = await Promise.all([
    fetch(`${base}/`),
    fetch(`${base}/app.js`),
    fetch(`${base}/api/metrics`),
  ]);
  assert.equal(page.status, 200);
  assert.equal(app.status, 200);
  assert.equal(metrics.status, 200);
  const data = await metrics.json();
  assert.ok("system" in data && "docker" in data);
  w.close();
});

test("config 接口：GET 返回脱敏 key，POST 保存并热更新", async () => {
  const tmp = join(tmpdir(), `fixflow-config-${Date.now()}.json`);
  const { writeFileSync } = await import("node:fs");
  writeFileSync(tmp, JSON.stringify({ port: 8888, services: [{ name: "s" }], apiKey: "old" }));
  const w = await startWeb({ port: 0, services: [], databases: [], configPath: tmp, apiKey: "old", baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k2.7-code" });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const get = await fetch(`${base}/api/config`);
  assert.equal(get.status, 200);
  const cfg = await get.json();
  assert.equal(cfg.baseUrl, "https://api.moonshot.cn/v1");
  assert.equal(cfg.model, "kimi-k2.7-code");

  const post = await fetch(`${base}/api/config`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseUrl: "https://x/v1", apiKey: "secret123", model: "m1" }),
  });
  assert.equal(post.status, 200);
  const saved = await post.json();
  assert.equal(saved.model, "m1");
  assert.equal(saved.apiKey, "••••t123");

  const file = JSON.parse((await import("node:fs")).readFileSync(tmp, "utf8"));
  assert.equal(file.model, "m1");
  assert.equal(file.port, 8888);
  assert.equal(file.services.length, 1);
  assert.equal(file.apiKey, "secret123");

  const post2 = await fetch(`${base}/api/config`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sslSites: ["example.com"], pingTargets: ["1.1.1.1"] }),
  });
  assert.equal(post2.status, 200);
  const file2 = JSON.parse((await import("node:fs")).readFileSync(tmp, "utf8"));
  assert.deepEqual(file2.sslSites, ["example.com"]);
  assert.deepEqual(file2.pingTargets, ["1.1.1.1"]);
  w.close();
});

test("历史接口：append/read/clear 持久化到文件", async () => {
  const tmp = join(tmpdir(), `fixflow-hist-${Date.now()}.json`);
  const w = await startWeb({ port: 0, services: [], databases: [], historyPath: tmp });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const post = async (body) => fetch(`${base}/api/history`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await post({ messages: [{ role: "user", text: "hi" }] })).status, 200);
  assert.equal((await post({ messages: [{ role: "assistant", text: "ok" }] })).status, 200);
  const got = await (await fetch(`${base}/api/history`)).json();
  assert.equal(got.messages.length, 2);
  assert.equal(got.messages[1].role, "assistant");
  const clear = await fetch(`${base}/api/history/clear`, { method: "POST" });
  assert.equal(clear.status, 200);
  const empty = await (await fetch(`${base}/api/history`)).json();
  assert.deepEqual(empty.messages, []);
  w.close();
});

test("chat 与 abort 走通会话", async () => {
  const w = await startWeb({ port: 0, services: [], databases: [] });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const r1 = await fetch(`${base}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: "检查系统" }),
  });
  assert.equal(r1.status, 200);
  const r2 = await fetch(`${base}/api/abort`, { method: "POST" });
  assert.equal(r2.status, 200);
  w.close();
});