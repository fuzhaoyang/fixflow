import test from "node:test";
import assert from "node:assert/strict";
import { createTtlCache } from "../src/metrics.js";

test("createTtlCache TTL 内只执行一次并共享 promise", async () => {
  let n = 0;
  const c = createTtlCache(5000);
  const fn = async () => { n++; await new Promise((r) => setTimeout(r, 10)); return n; };
  const [a, b] = await Promise.all([c("k", fn), c("k", fn)]);
  assert.equal(n, 1);
  assert.equal(a, b);
});

test("createTtlCache 过期后重新执行", async () => {
  let n = 0;
  const c = createTtlCache(30);
  assert.equal(await c("k", async () => ++n), 1);
  assert.equal(await c("k", async () => ++n), 1);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(await c("k", async () => ++n), 2);
});

test("createTtlCache clear 后重新执行", async () => {
  let n = 0;
  const c = createTtlCache(5000);
  assert.equal(await c("k", async () => ++n), 1);
  c.clear("k");
  assert.equal(await c("k", async () => ++n), 2);
});

test("createTtlCache 不同 key 互不影响", async () => {
  let a = 0, b = 0;
  const c = createTtlCache(5000);
  await c("a", async () => ++a);
  await c("b", async () => ++b);
  assert.equal(a, 1);
  assert.equal(b, 1);
});

test("createTtlCache fn 抛错后缓存失效可重试", async () => {
  const c = createTtlCache(5000);
  await assert.rejects(() => c("k", async () => { throw new Error("x"); }));
  assert.equal(await c("k", async () => 42), 42);
});