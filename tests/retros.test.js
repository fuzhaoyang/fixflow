import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRetroFromRecovery, readRetros, retroFilename, buildRetroMarkdown } from "../src/retros.js";
import { startWeb } from "../src/web/server.js";

const now = Date.now();
const incident = {
  id: "EVT-20261023-001",
  level: 2,
  state: "resolved",
  startedAt: now - 12 * 60000,
  firedAt: now - 12 * 60000,
  peak: 96,
  lastValue: 80,
  recoveredAt: now,
};
const rule = { id: "r1", metric: "mem", name: "内存超过 90%", op: ">=", threshold: 90, level: 2 };

test("createRetroFromRecovery 生成 AI 推测卡片并去重", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-retro-"));
  const file = join(dir, "retros.json");
  const card = await createRetroFromRecovery({
    filePath: file,
    incident,
    rule,
    host: "web-01",
    config: { apiKey: "x", baseUrl: "http://llm", model: "m" },
    llmChat: async () => ({ text: "可能是缓存增长导致内存占用升高。" }),
  });
  assert.equal(card.ai, true);
  assert.equal(card.incidentId, incident.id);
  assert.match(card.rootCause, /缓存增长/);
  assert.match(card.markdown, /根因推测（AI）/);
  assert.match(card.markdown, /事件概要/);
  assert.match(card.markdown, /web-01/);
  assert.match(retroFilename(card), /^复盘-web-01-内存使用率-\d{8}\.md$/);

  const again = await createRetroFromRecovery({ filePath: file, incident, rule, host: "web-01", config: {}, llmChat: async () => ({ text: "x" }) });
  assert.equal(again, null);
  assert.equal((await readRetros(file)).length, 1);
});

test("模型失败时仍生成卡片，根因写待补充", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-retro-"));
  const file = join(dir, "retros.json");
  const card = await createRetroFromRecovery({
    filePath: file,
    incident: { ...incident, id: "EVT-2" },
    rule,
    host: "web-02",
    config: { apiKey: "x", baseUrl: "http://llm", model: "m" },
    llmChat: async () => { throw new Error("boom"); },
  });
  assert.equal(card.ai, false);
  assert.equal(card.rootCause, "待补充");
  assert.match(card.markdown, /## 根因/);
  assert.doesNotMatch(card.markdown, /推测（AI）/);
});

const testCaptchas = {
  create: () => ({ id: "t", code: "0000" }),
  verify: (id, code) => String(code) === "0000",
};

test("/api/retros 列表、详情、下载，以及告警事件 retroId", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-retro-api-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, "{}");
  const card = {
    id: "EVT-20261023-001",
    incidentId: "EVT-20261023-001",
    title: "[P2] web-01 内存使用率异常复盘",
    host: "web-01",
    metric: "mem",
    metricLabel: "内存使用率",
    ruleName: "内存超过 90%",
    level: 2,
    startedAt: now - 12 * 60000,
    recoveredAt: now,
    durationMin: 12,
    peak: 96,
    threshold: 90,
    op: ">=",
    summary: "测试概要",
    rootCause: "可能是缓存增长。",
    ai: true,
    createdAt: new Date(now).toISOString(),
  };
  card.markdown = buildRetroMarkdown(card);
  writeFileSync(join(dir, "retros.json"), JSON.stringify([card]));
  writeFileSync(join(dir, "metric-incidents.json"), JSON.stringify({
    seq: 1,
    day: "2026-10-23",
    incidents: [incident],
  }));

  const w = await startWeb({ port: 0, services: [], databases: [], configPath: cfg }, { captchas: testCaptchas });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const H = { "Content-Type": "application/json" };
  await fetch(`${base}/api/register`, { method: "POST", headers: H, body: JSON.stringify({ username: "admin", password: "Secret123!", captchaCode: "0000" }) });
  const login = await fetch(`${base}/api/login`, { method: "POST", headers: H, body: JSON.stringify({ username: "admin", password: "Secret123!", captchaCode: "0000" }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const auth = { Cookie: cookie };

  const list = await (await fetch(`${base}/api/retros`, { headers: auth })).json();
  assert.equal(list.cards.length, 1);
  assert.equal(list.cards[0].id, card.id);
  assert.equal(list.cards[0].markdown, undefined);

  const detail = await (await fetch(`${base}/api/retros/${encodeURIComponent(card.id)}`, { headers: auth })).json();
  assert.match(detail.markdown, /内存使用率异常复盘/);

  const dl = await fetch(`${base}/api/retros/${encodeURIComponent(card.id)}/download`, { headers: auth });
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get("content-disposition") || "", /attachment/);
  assert.match(await dl.text(), /## 事件概要/);

  const alerts = await (await fetch(`${base}/api/metric-alerts`, { headers: auth })).json();
  assert.equal(alerts.incidents[0].retroId, card.id);

  await w.close();
});
