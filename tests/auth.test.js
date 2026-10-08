import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, hashPasswordAsync, verifyPasswordAsync, isStrongPassword, createCaptchaStore, createSessionStore, parseCookie } from "../src/auth.js";

test("hashPassword/verifyPassword 正确校验", () => {
  const { salt, hash } = hashPassword("secret123");
  assert.ok(salt && hash);
  assert.equal(verifyPassword("secret123", { salt, hash }), true);
  assert.equal(verifyPassword("wrong", { salt, hash }), false);
});

test("verifyPassword 对缺失字段返回 false", () => {
  assert.equal(verifyPassword("x", {}), false);
});

test("verifyPassword 对畸形 hash/超长密码返回 false 而非抛错", () => {
  assert.equal(verifyPassword("x", { salt: "aa", hash: "zz" }), false);
  assert.equal(verifyPassword("x".repeat(5000), { salt: "aa", hash: "00".repeat(64) }), false);
});

test("hashPasswordAsync/verifyPasswordAsync 正确校验", async () => {
  const { salt, hash } = await hashPasswordAsync("Secret123!");
  assert.equal(await verifyPasswordAsync("Secret123!", { salt, hash }), true);
  assert.equal(await verifyPasswordAsync("wrong", { salt, hash }), false);
});

test("isStrongPassword 拒绝弱口令/长度越界，接受强口令", () => {
  assert.equal(isStrongPassword("Secret123!"), true);
  assert.equal(isStrongPassword("short1!"), false);
  assert.equal(isStrongPassword("secret123!"), false);
  assert.equal(isStrongPassword("SECRET123!"), false);
  assert.equal(isStrongPassword("Secret123"), false);
  assert.equal(isStrongPassword("password1!"), false);
  assert.equal(isStrongPassword("A1!" + "x".repeat(200)), false);
  assert.equal(isStrongPassword("A1!" + "x".repeat(21)), true);
  assert.equal(isStrongPassword("A1!" + "x".repeat(22)), false);
});

test("验证码长度不符/错误返回 false 而非抛错，正确码大小写不敏感", () => {
  const cs = createCaptchaStore();
  const { id } = cs.create();
  assert.equal(cs.verify(id, "1"), false);

  const cs2 = createCaptchaStore();
  const { id: id2, code: code2 } = cs2.create();
  assert.equal(cs2.verify(id2, "!!!!!"), false);
  assert.equal(cs2.verify(id2, code2), false);

  const cs3 = createCaptchaStore();
  const { id: id3, code: code3 } = cs3.create();
  assert.equal(cs3.verify(id3, code3.toLowerCase()), true);
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