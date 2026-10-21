import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectAll, collectSystem, collectNetwork, collectConnectionSummary, collectNicHealth, collectDnsRoute, collectRemoteProbe, collectDatabases, collectSystemd, collectUserProcs, collectSslAll, collectConnectivity, collectPorts, collectFirewall, collectNginxLogs, collectPyProcesses, collectDbSlow, collectDockerDetail, collectLogSources, collectLogs, parseUfwStatus, parseFirewalld, parseIptablesRules, parseConnections, parseUfwPolicy, parseNginxListens, listNginxConfs, readNginxConf, writeNginxConf, buildDbTestCommand, testDbConnection, parseFailedServices, diffFailedServices, parseDownState, diffDownServices } from "../src/metrics.js";

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

test("collectLogSources 解析 pm2 进程列表", async () => {
  const run = async (cmd) => {
    if (cmd.startsWith("systemctl")) return { exitCode: 0, stdout: "", stderr: "" };
    if (cmd.startsWith("docker")) return { exitCode: 1, stdout: "", stderr: "docker 不可用" };
    if (cmd.startsWith("pm2 jlist")) return { exitCode: 0, stdout: JSON.stringify([
      { name: "api", pm2_env: { status: "online" } },
      { name: "worker", pm2_env: { status: "stopped" } },
    ]), stderr: "" };
    return { exitCode: 1, stdout: "", stderr: "" };
  };
  const r = await collectLogSources({ run });
  assert.deepEqual(r.pm2, [{ name: "api", status: "online" }, { name: "worker", status: "stopped" }]);
  assert.equal(r.pm2Available, true);
});

test("collectLogSources pm2 未安装或输出异常时返回空列表", async () => {
  const run = async (cmd) => cmd.startsWith("pm2 jlist")
    ? { exitCode: 127, stdout: "pm2: command not found", stderr: "" }
    : { exitCode: 0, stdout: "", stderr: "" };
  const r = await collectLogSources({ run });
  assert.deepEqual(r.pm2, []);
  assert.equal(r.pm2Available, false);
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

test("collectLogs pm2 进程走 pm2 logs 并限行数", async () => {
  let seen = null;
  const run = async (cmd) => { seen = cmd; return { exitCode: 0, stdout: "pm2 line\n", stderr: "" }; };
  const r = await collectLogs({ pm2: "api", lines: 50 }, { run });
  assert.equal(r.source, "pm2");
  assert.equal(r.target, "api");
  assert.match(seen, /pm2 logs api --lines 50 --nostream/);
});

test("collectLogs 缺参返回错误", async () => {
  const r = await collectLogs({}, { run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) });
  assert.equal(r.exitCode, 1);
  assert.match(r.content, /缺少服务名/);
});

test("collectConnectionSummary 解析 ESTAB 连接数", async () => {
  const run = async () => ({ exitCode: 0, stdout: "State  Recv-Q Send-Q Local\nESTAB  0      0      0.0.0.0:80\nESTAB  0      0      0.0.0.0:80\nLISTEN 0      128    0.0.0.0:443\n", stderr: "" });
  const r = await collectConnectionSummary({ run });
  assert.deepEqual(r.est, { 80: 2 });
});

test("collectNicHealth 解析网卡数据与状态", async () => {
  const run = async (cmd) => cmd.includes("ip -o link")
    ? { exitCode: 0, stdout: "1: lo: <LOOPBACK,UP> state UNKNOWN\n2: eth0: <BROADCAST,MULTICAST,UP> state UP\n", stderr: "" }
    : { exitCode: 0, stdout: "Inter-|Receive|Transmit\n eth0: 100 1 2 3 0 0 0 0 200 2 3 4 0 0 0 0\n", stderr: "" };
  const r = await collectNicHealth({ run });
  assert.equal(r.nics.length, 1);
  assert.equal(r.nics[0].name, "eth0");
  assert.equal(r.nics[0].state, "UP");
  assert.equal(r.nics[0].rxBytes, 100);
  assert.equal(r.nics[0].txErr, 3);
});

test("collectDnsRoute 解析 nameserver 与路由", async () => {
  const run = async (cmd) => {
    if (cmd.includes("resolv.conf")) return { exitCode: 0, stdout: "nameserver 8.8.8.8\nsearch example.com\n", stderr: "" };
    if (cmd.includes("ip route")) return { exitCode: 0, stdout: "default via 192.168.1.1 dev eth0\n", stderr: "" };
    return { exitCode: 0, stdout: "192.168.1.5\n", stderr: "" };
  };
  const r = await collectDnsRoute({ run });
  assert.ok(r.nameservers.some((l) => l.includes("8.8.8.8")));
  assert.ok(r.routes.some((l) => l.includes("default")));
  assert.ok(r.addrs.includes("192.168.1.5"));
});

test("collectRemoteProbe 探测结果", async () => {
  const run = async () => ({ exitCode: 0, stdout: "open", stderr: "" });
  const ok = await collectRemoteProbe("example.com:443", { run });
  assert.equal(ok.ok, true);
  assert.equal(ok.host, "example.com");
  const bad = await collectRemoteProbe("bad", { run });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /host:port/);
});

test("buildDbTestCommand 密码进 env 不进命令串", () => {
  const { command, env } = buildDbTestCommand({ type: "postgres", host: "10.0.0.1", port: "5432", user: "app", database: "mydb" }, "p@ss");
  assert.match(command, /psql/);
  assert.ok(!command.includes("p@ss"), "密码不得出现在命令串");
  assert.equal(env.PGPASSWORD, "p@ss");
});

test("buildDbTestCommand 特殊字符 shell 转义", () => {
  const { command } = buildDbTestCommand({ type: "mysql", host: "a'; rm -rf /", port: "3306", user: "u'x", database: "db" }, "p");
  assert.ok(command.includes("'a'\\''; rm -rf /'"), "内嵌单引号应转义为 \\'");
});

test("testDbConnection 成功/失败/缺 CLI", async () => {
  const okRun = async (cmd, opts) => {
    if (cmd.startsWith("command -v redis-cli")) return { exitCode: 0, stdout: "/usr/bin/redis-cli", stderr: "" };
    if (cmd.startsWith("redis-cli")) return { exitCode: 0, stdout: "PONG\n", stderr: "" };
    return { exitCode: 1, stdout: "", stderr: "" };
  };
  const ok = await testDbConnection({ type: "redis", host: "h", port: "6379" }, { run: okRun });
  assert.equal(ok.ok, true);
  assert.equal(ok.detail.trim(), "PONG");
  assert.ok(Number.isFinite(ok.latencyMs));

  const noCli = await testDbConnection({ type: "sqlite", path: "/tmp/x.db" }, { run: async () => ({ exitCode: 1, stdout: "", stderr: "" }) });
  assert.equal(noCli.ok, false);
  assert.match(noCli.detail, /sqlite3/);
});

test("collectSystemd 解析属性/依赖/类型与 summary", async () => {
  const show = `Id=nginx.service
ActiveState=active
SubState=running
Description=nginx web server
LoadState=loaded
NRestarts=3
ExecMainStatus=0
Restart=on-failure
Requires=basic.target system.slice
After=network.target systemd-journald.socket
RequiredBy=
UnitFileState=enabled
FragmentPath=/lib/systemd/system/nginx.service
ActiveEnterTimestamp=Sun 2026-10-04 08:00:00 CST
MainPID=1234
MemoryCurrent=1048576

Id=cron.timer
ActiveState=failed
SubState=failed
Description=Cron timer
LoadState=loaded
NRestarts=0
ExecMainStatus=1
Restart=no
Requires=
After=basic.target
RequiredBy=multi-user.target
UnitFileState=enabled

Id=ssh.socket
ActiveState=inactive
SubState=dead
Description=SSH socket
LoadState=loaded
NRestarts=0
ExecMainStatus=0
Restart=no
Requires=
After=network.target
RequiredBy=
UnitFileState=static
`;
  const run = async (cmd) => cmd.startsWith("systemctl show")
    ? { exitCode: 0, stdout: show, stderr: "" }
    : { exitCode: 0, stdout: "1234 2.5 3.2\n", stderr: "" };
  const r = await collectSystemd([], { run });
  assert.equal(r.services.length, 3);
  assert.deepEqual(r.summary, { active: 1, failed: 1, inactive: 1, total: 3 });
  const nginx = r.services.find((s) => s.name === "nginx");
  assert.equal(nginx.unitType, "service");
  assert.equal(nginx.desc, "nginx web server");
  assert.equal(nginx.loadState, "loaded");
  assert.equal(nginx.nRestarts, 3);
  assert.equal(nginx.exitStatus, 0);
  assert.equal(nginx.restartPolicy, "on-failure");
  assert.deepEqual(nginx.requires, ["basic.target", "system.slice"]);
  assert.deepEqual(nginx.after, ["network.target", "systemd-journald"]);
  assert.deepEqual(nginx.requiredBy, []);
  assert.equal(nginx.unitFileState, "enabled");
  assert.equal(r.services.find((s) => s.name === "cron").unitType, "timer");
  assert.equal(r.services.find((s) => s.name === "ssh").unitType, "socket");
});

test("parseFailedServices / diffFailedServices", () => {
  const now = parseFailedServices("nginx.service loaded failed failed Failed with result 'exit-code'.\ncron.timer loaded failed failed Failed with result 'timeout'.\n");
  assert.deepEqual(now, ["nginx.service", "cron.timer"]);
  const d = diffFailedServices(["nginx.service", "old.service"], ["nginx.service", "cron.timer"]);
  assert.deepEqual(d.newFailures, ["cron.timer"]);
  assert.deepEqual(d.recoveries, ["old.service"]);
  assert.deepEqual(diffFailedServices(null, ["x"]).newFailures, ["x"]);
  assert.deepEqual(diffFailedServices(["x"], ["x"]).newFailures, []);
});

test("parseDownState 解析 systemctl is-active 结果", () => {
  assert.deepEqual(parseDownState({ exitCode: 0, stdout: "active\n" }), { up: true, found: true, state: "active" });
  assert.deepEqual(parseDownState({ exitCode: 3, stdout: "inactive" }), { up: false, found: true, state: "inactive" });
  assert.deepEqual(parseDownState({ exitCode: 3, stdout: "failed" }), { up: false, found: true, state: "failed" });
  assert.deepEqual(parseDownState({ exitCode: 4, stdout: "inactive" }), { up: false, found: false, state: "inactive" });
});

test("diffDownServices 只在状态变化时产生 down/recovered", () => {
  const up = { up: true, found: true };
  const down = { up: false, found: true, state: "inactive" };
  assert.deepEqual(diffDownServices({ nginx: up }, { nginx: down }), [{ kind: "down", name: "nginx", state: "inactive" }]);
  assert.deepEqual(diffDownServices({ nginx: down }, { nginx: down }), []);
  assert.deepEqual(diffDownServices({ nginx: down }, { nginx: up }), [{ kind: "recovered", name: "nginx" }]);
  assert.deepEqual(diffDownServices({}, { nginx: down }), [{ kind: "down", name: "nginx", state: "inactive" }]);
  assert.deepEqual(diffDownServices({ nginx: down }, { nginx: { up: false, found: false, state: "inactive" } }), []);
  assert.deepEqual(diffDownServices({ nginx: { up: false, found: false, state: "inactive" } }, { nginx: down }), [{ kind: "down", name: "nginx", state: "inactive" }]);
});
