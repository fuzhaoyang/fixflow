import test from "node:test";
import assert from "node:assert/strict";
import { collectAll, collectSystem, collectNetwork, collectServices, collectDatabases, collectSystemd, collectUserProcs, collectProcesses, collectSslAll, collectConnectivity, collectPorts, collectFirewall, collectNginxLogs, collectPyProcesses, collectDbSlow, collectDockerDetail, parseUfwStatus } from "../src/metrics.js";

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
      assert.ok("state" in s && "path" in s && "cpu" in s && "mem" in s && "memMb" in s && "started" in s);
    }
  }
});

test("collectSystemd 按白名单关键词过滤服务", async () => {
  const r = await collectSystemd(["__no_such_service_keyword__"]);
  if (r.services) assert.equal(r.services.length, 0);
});

test("collectUserProcs 只返回名称匹配关键词的进程", async () => {
  const r = await collectUserProcs(["node"]);
  if (r.procs) {
    for (const p of r.procs) {
      assert.ok(p.name.toLowerCase().startsWith("node"));
      assert.equal(typeof p.pid, "number");
    }
  }
  const none = await collectUserProcs(["__no_such_proc_keyword__"]);
  if (none.procs) assert.equal(none.procs.length, 0);
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

test("collectSslAll 对空列表返回空 results，不抛错", async () => {
  const r = await collectSslAll({ sslSites: [] });
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

test("collectNetwork 返回结构化 listeners items", async () => {
  const r = await collectNetwork();
  assert.ok("listeners" in r || "error" in r);
  if (r.listeners?.items) {
    assert.ok(Array.isArray(r.listeners.items));
    for (const i of r.listeners.items) {
      assert.ok("proto" in i && "state" in i && "local" in i);
    }
  }
});

test("collectPorts 多端口批量与服务名映射", async () => {
  const r = await collectPorts("22,3306,99999");
  assert.ok("results" in r);
  assert.equal(r.results.length, 3);
  assert.equal(r.results[0].service, "ssh");
  assert.equal(r.results[1].service, "mysql");
  assert.equal(r.results[2].service, "未知服务");
});

test("collectFirewall 返回 riskyPorts 字段", async () => {
  const r = await collectFirewall();
  assert.ok("riskyPorts" in r, "缺少 riskyPorts 字段");
  assert.ok(Array.isArray(r.riskyPorts));
  assert.ok("rules" in r && Array.isArray(r.rules));
});

test("parseUfwStatus 解析 ufw status numbered", () => {
  const out = `Status: active

     To                         Action      From
     --                         ------      ----
[ 1] 22/tcp                     ALLOW IN    Anywhere
[ 2] 80,443/tcp                 ALLOW IN    Anywhere                   # web
[ 3] 3306/tcp                   ALLOW IN    Anywhere
[ 4] 22/tcp (v6)                ALLOW IN    Anywhere (v6)
[ 5] 9090/tcp                   DENY IN     Anywhere
[ 6] 6379/tcp                   ALLOW IN    10.0.0.0/8
`;
  const { rules, riskyPorts } = parseUfwStatus(out);
  assert.equal(rules.length, 6);
  assert.deepEqual(rules[0], { num: 1, action: "ALLOW", proto: "tcp", port: "22", from: "Anywhere", comment: "" });
  assert.equal(rules[1].comment, "web");
  assert.equal(rules[1].port, "80,443");
  assert.equal(rules[3].from, "Anywhere (v6)");
  const keys = riskyPorts.map((p) => `${p.port}/${p.proto}`);
  assert.deepEqual(keys, ["22/tcp", "80/tcp", "443/tcp", "3306/tcp"]);
  assert.equal(riskyPorts.find((p) => p.port === 3306).dangerous, true);
  assert.equal(riskyPorts.find((p) => p.port === 22).dangerous, false);
});

test("parseUfwStatus 空/异常输出返回空", () => {
  assert.deepEqual(parseUfwStatus(""), { rules: [], riskyPorts: [] });
  assert.deepEqual(parseUfwStatus("Status: inactive"), { rules: [], riskyPorts: [] });
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
test("collectSslAll 无配置时返回 results 数组", async () => {
  const r = await collectSslAll({});
  assert.ok(Array.isArray(r.results));
});
