import test from "node:test";
import assert from "node:assert/strict";
import { lanIPs, publicIP } from "../src/netip.js";

test("lanIPs 返回非回环 IPv4 数组", () => {
  const ips = lanIPs();
  assert.ok(Array.isArray(ips));
  assert.ok(!ips.includes("127.0.0.1"));
});

test("publicIP 成功", async () => {
  const ip = await publicIP({ fetchImpl: async () => ({ ok: true, json: async () => ({ ip: "1.2.3.4" }) }) });
  assert.equal(ip, "1.2.3.4");
});

test("publicIP 失败降级为 null", async () => {
  assert.equal(await publicIP({ fetchImpl: async () => { throw new Error("no net"); } }), null);
  assert.equal(await publicIP({ fetchImpl: async () => ({ ok: false }) }), null);
});