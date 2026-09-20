import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, createSessionStore, parseCookie } from "../src/auth.js";

test("hashPassword/verifyPassword 正确校验", () => {
  const { salt, hash } = hashPassword("secret123");
  assert.ok(salt && hash);
  assert.equal(verifyPassword("secret123", { salt, hash }), true);
  assert.equal(verifyPassword("wrong", { salt, hash }), false);
});

test("verifyPassword 对缺失字段返回 false", () => {
  assert.equal(verifyPassword("x", {}), false);
});

test("session 创建/校验/过期/撤销", () => {
  const s = createSessionStore({ ttlMs: 1000 });
  const token = s.create();
  assert.equal(s.valid(token), true);
  s.revoke(token);
  assert.equal(s.valid(token), false);
});

test("session 过期后失效", async () => {
  const s = createSessionStore({ ttlMs: 30 });
  const token = s.create();
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(s.valid(token), false);
});

test("parseCookie 解析 cookie 头", () => {
  const c = parseCookie("fixflow_token=abc123; other=x");
  assert.equal(c.fixflow_token, "abc123");
  assert.equal(c.other, "x");
});