import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectAll, collectSystem, collectNetwork, collectDatabases, collectSystemd, collectUserProcs, collectSslAll, collectConnectivity, collectPorts, collectFirewall, collectNginxLogs, collectPyProcesses, collectDbSlow, collectDockerDetail, collectLogSources, collectLogs, parseUfwStatus, parseFirewalld, parseIptablesRules, parseConnections, parseUfwPolicy, parseNginxListens, listNginxConfs, readNginxConf, writeNginxConf } from "../src/metrics.js";

test("collectAll 返回全部模块（失败显示 N/A 不抛错）", async () => {
  const r = await collectAll({ databases: [] });
  for (const k of ["system", "network", "nginx", "firewall", "databases", "docker", "systemd"]) {
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

test("parseIptablesRules 解析 iptables -L -n", () => {
  const out = [
    "Chain INPUT (policy ACCEPT)",
    "num  target     prot opt source               destination",
    "1    ACCEPT     tcp  0.0.0.0/0            0.0.0.0/0            tcp dpt:22",
    "2    ACCEPT     tcp  192.168.1.0/24       0.0.0.0/0            tcp dpt:3306",
  ].join("\n");
  const rules = parseIptablesRules(out);
  assert.equal(rules.length, 2);
  assert.equal(rules[0].port, "22");
  assert.equal(rules[0].from, "Anywhere");
  assert.equal(rules[1].from, "192.168.1.0/24");
});

test("parseConnections 统计 ESTAB 连接数按端口聚合", () => {
  const out = [
    "State  Recv-Q Send-Q Local Address:Port Peer Address:Port",
    "LISTEN 0      128    0.0.0.0:80 0.0.0.0:*",
    "ESTAB  0      0      0.0.0.0:80 1.2.3.4:5000",
    "ESTAB  0      0      0.0.0.0:80 1.2.3.5:5001",
    "ESTAB  0      0      0.0.0.0:443 1.2.3.6:6000",
    "TIME_WAIT 0 0  0.0.0.0:80 1.2.3.7:6001",
  ].join("\n");
  assert.deepEqual(parseConnections(out), { 80: 2, 443: 1 });
});

test("parseUfwPolicy 提取默认策略", () => {
  assert.equal(parseUfwPolicy("Status: active\nDefault: deny (incoming), allow (outgoing)\n"), "deny (incoming), allow (outgoing)");
  assert.equal(parseUfwPolicy(""), "");
});

test("parseFirewalld 解析 ports + services，含范围与去重", () => {
  const { rules, riskyPorts } = parseFirewalld(
    "20/tcp 22/tcp 39000-40000/tcp",
    { ssh: ["22/tcp"], http: ["80/tcp"] },
  );
  const keys = riskyPorts.map((p) => `${p.port}/${p.proto}`);
  assert.ok(keys.includes("20/tcp"));
  assert.ok(keys.includes("80/tcp"));
  assert.ok(keys.includes("39000-40000/tcp"));
  assert.equal(keys.filter((k) => k === "22/tcp").length, 1);
  assert.equal(rules.find((r) => r.port === "80").comment, "http");
  assert.equal(riskyPorts.find((p) => p.port === 80).dangerous, false);
});

test("parseFirewalld 危险端口与范围标记", () => {
  const single = parseFirewalld("2375/tcp", {});
  assert.equal(single.riskyPorts.find((p) => p.port === 2375).dangerous, true);
  const range = parseFirewalld("2000-3000/tcp", {});
  assert.equal(range.riskyPorts[0].dangerous, true);
  const udp = parseFirewalld("53/udp", {});
  assert.equal(udp.riskyPorts[0].proto, "udp");
});

test("parseFirewalld 空输入返回空", () => {
  assert.deepEqual(parseFirewalld("", {}), { rules: [], riskyPorts: [] });
  assert.deepEqual(parseFirewalld(undefined, undefined), { rules: [], riskyPorts: [] });
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

test("parseNginxListens 解析 listen 与 server_name", () => {
  const dump = [
    "# configuration file /etc/nginx/sites-enabled/a.conf:",
    "server {",
    "    listen 80;",
    "    server_name example.com www.example.com;",
    "}",
    "# configuration file /etc/nginx/sites-enabled/b.conf:",
    "server {",
    "    listen 443 ssl;",
    "    server_name api.example.com;",
    "}",
  ].join("\n");
  const l = parseNginxListens(dump);
  assert.equal(l.length, 2);
  assert.equal(l[0].port, "80");
  assert.equal(l[0].serverName, "example.com www.example.com");
  assert.equal(l[1].port, "443");
  assert.equal(l[1].serverName, "api.example.com");
});

test("listNginxConfs 用 nginx -T 解析全部配置路径", async () => {
  const run = async () => ({ exitCode: 0, stdout: "# configuration file /etc/nginx/nginx.conf:\n# configuration file /usr/local/nginx/conf.d/a.conf:\n", stderr: "" });
  const r = await listNginxConfs({ run });
  assert.equal(r.confs.length, 2);
  assert.equal(r.confs[0].name, "nginx.conf");
  assert.equal(r.confs[1].path, "/usr/local/nginx/conf.d/a.conf");
});

test("readNginxConf 支持 nginx -T 列出的非 /etc/nginx 路径", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-nginx-"));
  const f = join(dir, "site.conf");
  writeFileSync(f, "server{}");
  const run = async () => ({ exitCode: 0, stdout: `# configuration file ${f}:\n`, stderr: "" });
  const r = await readNginxConf(f, { run });
  assert.equal(r.content, "server{}");
});

test("readNginxConf 拒绝不在 nginx -T 列表中的路径", async () => {
  const run = async () => ({ exitCode: 0, stdout: "# configuration file /etc/nginx/nginx.conf:\n", stderr: "" });
  const r = await readNginxConf("/etc/nginx/conf.d/nope.conf", { run });
  assert.equal(r.error, "路径不合法");
});

test("writeNginxConf 拒绝路径穿越", async () => {
  const r = await writeNginxConf("/etc/nginx/../etc/passwd", "x", { baseDir: "/etc/nginx/" });
  assert.equal(r.ok, false);
  assert.match(r.error, /路径不合法/);
});

test("writeNginxConf 校验通过后写入并 reload", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-nginx-"));
  const f = join(dir, "nginx.conf");
  writeFileSync(f, "OLD");
  const calls = [];
  const run = async (cmd) => { calls.push(cmd); return { exitCode: 0, stdout: "ok", stderr: "" }; };
  const r = await writeNginxConf(f, "NEW", { run, baseDir: dir + "/" });
  assert.equal(r.ok, true);
  assert.equal(readFileSync(f, "utf8"), "NEW");
  assert.ok(calls.some((c) => c.includes("systemctl reload nginx")));
});

test("writeNginxConf 校验失败时回滚原文件", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-nginx-"));
  const f = join(dir, "nginx.conf");
  writeFileSync(f, "OLD");
  const run = async (cmd) => cmd.includes("nginx -t")
    ? { exitCode: 1, stdout: "", stderr: "syntax error" }
    : { exitCode: 0, stdout: "", stderr: "" };
  const r = await writeNginxConf(f, "BROKEN", { run, baseDir: dir + "/" });
  assert.equal(r.ok, false);
  assert.match(r.error, /syntax error/);
  assert.equal(readFileSync(f, "utf8"), "OLD");
});

test("collectLogSources 解析 systemd 单元与 docker 容器", async () => {
  const run = async (cmd) => cmd.startsWith("systemctl")
    ? { exitCode: 0, stdout: "nginx.service loaded active running Nginx\nsshd.service loaded inactive dead SSH\n", stderr: "" }
    : { exitCode: 0, stdout: "web_app | Up 5 minutes\ndb | Exited (0)\n", stderr: "" };
  const r = await collectLogSources({ run });
  assert.equal(r.systemd[0].name, "nginx");
  assert.equal(r.systemd[0].state, "active");
  assert.equal(r.systemd[1].state, "inactive");
  assert.equal(r.docker[0].name, "web_app");
  assert.match(r.docker[1].status, /Exited/);
  assert.equal(r.dockerAvailable, true);
});

test("collectLogs 拼 systemd 单元命令并限行数", async () => {
  let seen = null;
  const run = async (cmd) => { seen = cmd; return { exitCode: 0, stdout: "line1\nline2\n", stderr: "" }; };
  const r = await collectLogs({ service: "nginx", lines: 200 }, { run });
  assert.equal(r.source, "systemd");
  assert.equal(r.target, "nginx.service");
  assert.equal(r.content, "line1\nline2\n");
  assert.match(seen, /journalctl -u nginx.service -n 200 --no-pager -o cat/);
});

test("collectLogs docker 容器走 docker logs 且限行数上限", async () => {
  let seen = null;
  const run = async (cmd) => { seen = cmd; return { exitCode: 0, stdout: "log", stderr: "" }; };
  const r = await collectLogs({ container: "web_app", lines: 99999 }, { run });
  assert.equal(r.source, "docker");
  assert.match(seen, /docker logs --tail 5000 --timestamps web_app/);
});

test("collectLogs 缺参返回错误", async () => {
  const r = await collectLogs({}, { run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) });
  assert.equal(r.exitCode, 1);
  assert.match(r.content, /缺少服务名/);
});
