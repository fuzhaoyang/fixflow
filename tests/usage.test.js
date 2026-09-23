import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUsageStore, dayKey } from "../src/usage.js";

function tmpFile() { return join(mkdtempSync(join(tmpdir(), "ff-usage-")), "usage.json"); }

test("record 累加同一天多次", async () => {
  const s = await createUsageStore({ filePath: tmpFile() });
  await s.record({ promptTokens: 10, completionTokens: 5 });
  await s.record({ promptTokens: 20, completionTokens: 15 });
  const d = s.daily(1);
  assert.equal(d.length, 1);
  assert.equal(d[0].prompt, 30);
  assert.equal(d[0].completion, 20);
  assert.equal(d[0].total, 50);
  assert.equal(d[0].date, dayKey());
});

test("daily 补零并含今日", async () => {
  const s = await createUsageStore({ filePath: tmpFile() });
  await s.record({ promptTokens: 100, completionTokens: 0 });
  const d = s.daily(7);
  assert.equal(d.length, 7);
  assert.equal(d[d.length - 1].total, 100);
  assert.equal(d[0].total, 0);
});

test("90 天前的数据被清理", async () => {
  const file = tmpFile();
  writeFileSync(file, JSON.stringify({ "2020-01-01": { prompt: 1, completion: 1 } }));
  const s = await createUsageStore({ filePath: file });
  const d = s.daily(1);
  assert.ok(!d.some((x) => x.date === "2020-01-01"));
});

test("record 后落盘，重启后仍在", async () => {
  const file = tmpFile();
  const s1 = await createUsageStore({ filePath: file });
  await s1.record({ promptTokens: 42, completionTokens: 8 });
  const s2 = await createUsageStore({ filePath: file });
  const d = s2.daily(1);
  assert.equal(d[0].prompt, 42);
  assert.equal(d[0].completion, 8);
});
