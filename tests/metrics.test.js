import test from "node:test";
import assert from "node:assert/strict";
import { collectAll, collectServices, collectDatabases, collectSystemd } from "../src/metrics.js";

test("collectAll 返回全部模块（失败显示 N/A 不抛错）", async () => {
  const r = await collectAll({ services: [], databases: [] });
  for (const k of ["system", "network", "nginx", "firewall", "services", "databases", "docker", "systemd"]) {
    assert.ok(k in r, `缺少 ${k}`);
  }
});

test("collectSystemd 不抛错（无 systemd 时返回 error）", async () => {
  const r = await collectSystemd();
  assert.ok("services" in r || "error" in r);
  if (r.services) {
    for (const s of r.services) {
      assert.equal(typeof s.name, "string");
      assert.ok("state" in s && "memory" in s && "cpu" in s && "started" in s);
    }
  }
});

test("collectServices 用 HTTP 健康检查", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.match(String(url), /127\.0\.0\.1:8000\/health/);
    return { status: 200 };
  };
  const r = await collectServices({ services: [{ name: "app", url: "http://127.0.0.1:8000/health" }] });
  assert.equal(r[0].ok, true);
  globalThis.fetch = async () => { throw new Error("conn refused"); };
  const r2 = await collectServices({ services: [{ name: "app", url: "http://127.0.0.1:9999/x" }] });
  assert.equal(r2[0].ok, false);
  globalThis.fetch = orig;
});

test("collectDatabases 支持 postgres/mysql/redis", async () => {
  const dbs = [
    { name: "pg", type: "postgres" },
    { name: "rd", type: "redis" },
  ];
  const r = await collectDatabases({ databases: dbs });
  assert.equal(r.length, 2);
  assert.equal(typeof r[0].ok, "boolean");
});