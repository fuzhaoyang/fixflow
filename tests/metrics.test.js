import test from "node:test";
import assert from "node:assert/strict";
import { collectAll, collectSystem, collectServices, collectDatabases, collectSystemd, collectProcesses, collectSsl, collectConnectivity, collectPorts, collectFirewall, collectNginxLogs, collectPyProcesses, collectDbSlow, collectDockerDetail } from "../src/metrics.js";

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

test("collectSystem 返回 health 字段", async () => {
  const r = await collectSystem();
  assert.ok("health" in r || "error" in r);
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

test("collectProcesses 返回结构化进程与异常列表", async () => {
  const r = await collectProcesses();
  assert.ok("top" in r && "anomalies" in r || "error" in r);
  if (r.top) {
    assert.ok(Array.isArray(r.top));
    for (const p of r.top) {
      assert.equal(typeof p.pid, "number");
      assert.ok("cpu" in p && "mem" in p && "memKb" in p && "cmd" in p);
      assert.ok("service" in p);
    }
  }
});

test("collectSsl 对空列表返回空 results，不抛错", async () => {
  const r = await collectSsl([]);
  assert.ok("results" in r || "error" in r);
});

test("collectConnectivity 对空目标返回空 results", async () => {
  const r = await collectConnectivity([]);
  assert.ok("results" in r || "error" in r);
});

test("collectPorts 无参返回监听列表", async () => {
  const r = await collectPorts();
  assert.ok("listeners" in r || "error" in r);
});

test("collectFirewall 返回 riskyPorts 字段", async () => {
  const r = await collectFirewall();
  assert.ok("riskyPorts" in r, "缺少 riskyPorts 字段");
  assert.ok(Array.isArray(r.riskyPorts));
});

test("新增诊断采集函数不抛错", async () => {
  const n = await collectNginxLogs();
  assert.ok("errorLog" in n || "error" in n);
  const p = await collectPyProcesses();
  assert.ok("processes" in p || "error" in p);
  const d = await collectDockerDetail();
  assert.ok("stats" in d || "error" in d);
  const db = await collectDbSlow({ databases: [] });
  assert.ok(Array.isArray(db) || "error" in db);
});