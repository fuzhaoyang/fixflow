# 数据库页连接管理（P1）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把占位的「数据库」菜单页升级为连接管理页：面板内对 PostgreSQL / MySQL / Redis / MongoDB / SQLite 五类连接做增删改查与真实连接测试，密码存 config.json（0600）、走环境变量执行、全程脱敏。

**Architecture:** 复用现有零依赖模式——连接测试通过 `runCommand` 调用系统 CLI（`psql`/`mysql`/`redis-cli`/`mongosh`/`sqlite3`），密码注入 env（不进入命令行参数）。配置新增 `dbConnections` 字段（config.js 规范化），server.js 提供 CRUD + 测试接口（镜像 SSL 页的 `/api/ssl` 模式），前端数据库页专用渲染 + 增删改表单（镜像 SSL 页 modal 模式）。

**Tech Stack:** Node.js ≥18（`node:test`、`node:child_process`），零第三方依赖，前端原生 JS + 现有 `procMask` 密码弹窗 / `pwd-eye` 明文切换 / `svc-table` 样式。

**Spec:** `docs/superpowers/specs/2026-10-09-db-connections-design.md`

## Global Constraints

- 零第三方依赖；运行环境仅要求 Node ≥18
- 密码永不进入命令行参数、永不写日志、GET 接口永不回传；输出统一走 `redactSecrets`
- 新增类型仅限 `postgres | mysql | redis | mongodb | sqlite`
- 复用现有 `runCommand` / `persistConfig` / `shellQuote` / `procMask` / `pwd-eye`
- 每个任务结尾必须 `git commit`；**提交时只 stage 本任务涉及的文件**（当前工作区可能有他人未提交的 `i18n.js` 改动，不要带进来）

---

### Task 1: runCommand 支持 env 注入

**Files:**
- Modify: `src/tools.js`（`runExec` 与 `runCommand`）
- Test: `tests/tools.test.js`

**Interfaces:**
- Produces: `runCommand(command, opts)` 新增可选 `opts.env`（对象，合并进子进程环境变量）；返回不变 `{ exitCode, stdout, stderr }`

- [ ] **Step 1: 写失败测试**

在 `tests/tools.test.js` 末尾追加：

```js
test("runCommand 支持 env 注入且不回显到命令串", async () => {
  const r = await runCommand('echo "$DB_PASS"', { env: { DB_PASS: "s3cret!" } });
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /s3cret!/);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/tools.test.js`
Expected: 该测试 FAIL（env 未传入，输出为空）

- [ ] **Step 3: 实现**

`src/tools.js` `runExec`（约 95-97 行）：

```js
function runExec(command, { timeout = 30000, signal, env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", command], { detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/tools.test.js`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools.js tests/tools.test.js
git commit -m "feat(tools): runCommand 支持 env 注入"
```

---

### Task 2: config.js 增加 dbConnections 规范化

**Files:**
- Modify: `src/config.js`
- Test: `tests/config.test.js`

**Interfaces:**
- Produces: `normalizeDbConnections(list)` → 规范化后的连接数组；`loadConfig()` 返回新增 `dbConnections` 字段（结构见 spec 配置模型）

- [ ] **Step 1: 写失败测试**

在 `tests/config.test.js` 末尾追加：

```js
import { loadConfig, normalizeDbConnections } from "../src/config.js";
```
（把第 3 行的 import 改为上述两行）

```js
test("normalizeDbConnections 兜底与非法类型过滤", () => {
  const r = normalizeDbConnections([
    { name: "pg", type: "postgres", host: "h", user: "u", password: "p" },
    { type: "oracle" },
    "string-entry",
    null,
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "db1");
  assert.equal(r[0].port, "5432");
  assert.equal(r[0].enabled, true);
});

test("dbConnections 从配置文件加载并规范化", () => {
  const dir = mkdtempSync(join(tmpdir(), "fixflow-"));
  const file = join(dir, "config.json");
  const cfg = loadConfig({ filePath: file });
  assert.deepEqual(cfg.dbConnections, []);
  writeFileSync(file, JSON.stringify({ dbConnections: [{ name: "r", type: "redis", host: "127.0.0.1", port: 6379 }] }));
  const cfg2 = loadConfig({ filePath: file });
  assert.equal(cfg2.dbConnections[0].type, "redis");
  assert.equal(cfg2.dbConnections[0].port, "6379");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/config.test.js`
Expected: 新增测试 FAIL（normalizeDbConnections 未定义 / dbConnections 未返回）

- [ ] **Step 3: 实现**

`src/config.js` 在 `normalizeSslSites` 之后新增：

```js
const DB_TYPES = new Set(["postgres", "mysql", "redis", "mongodb", "sqlite"]);

export function normalizeDbConnections(list) {
  if (!Array.isArray(list)) return [];
  return list.map((d, i) => {
    if (typeof d !== "object" || d === null || !DB_TYPES.has(d.type)) return null;
    return {
      id: d.id || `db${i + 1}`,
      name: d.name || `${d.type} ${i + 1}`,
      type: d.type,
      host: d.host || "",
      port: String(d.port || (d.type === "sqlite" ? "" : "5432")),
      database: d.database || "",
      user: d.user || "",
      password: d.password || "",
      path: d.path || "",
      enabled: d.enabled !== false,
    };
  }).filter(Boolean);
}
```

`loadConfig` 返回对象中 `databases` 之后新增：

```js
    dbConnections: normalizeDbConnections(file.dbConnections),
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/config.test.js`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.js tests/config.test.js
git commit -m "feat(config): 新增 dbConnections 连接配置规范化"
```

---

### Task 3: metrics.js 连接测试命令构造与执行

**Files:**
- Modify: `src/metrics.js`
- Test: `tests/metrics.test.js`

**Interfaces:**
- Consumes: `runCommand`（tools.js，Task 1 的 env 支持）、`shellQuote`（ssl.js 已导出）
- Produces:
  - `buildDbTestCommand(conn, password)` → `{ command: string, env: object }`（纯函数，command 不含密码，密码全在 env）
  - `testDbConnection(conn, { password = "", run = runCommand, now = Date.now } = {})` → `{ ok, detail, latencyMs }`

- [ ] **Step 1: 写失败测试**

在 `tests/metrics.test.js` 末尾追加（顶部 import 增加 `buildDbTestCommand, testDbConnection`）：

```js
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
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/metrics.test.js`
Expected: 新增测试 FAIL（buildDbTestCommand / testDbConnection 未定义）

- [ ] **Step 3: 实现**

`src/metrics.js` 顶部 import 改为：

```js
import { collectSslAll, shellQuote } from "./ssl.js";
```

在 `collectSystem` 之前新增：

```js
export function buildDbTestCommand(conn, password = "") {
  const q = shellQuote;
  const env = {};
  let command = "";
  switch (conn.type) {
    case "postgres":
      if (password) env.PGPASSWORD = password;
      command = `psql -h ${q(conn.host)} -p ${q(conn.port)} -U ${q(conn.user)} -d ${q(conn.database)} -tAc 'select 1'`;
      break;
    case "mysql":
      if (password) env.MYSQL_PWD = password;
      command = `mysql -h ${q(conn.host)} -P ${q(conn.port)} -u ${q(conn.user)} ${q(conn.database)} -e 'select 1'`;
      break;
    case "redis":
      if (password) env.REDISCLI_AUTH = password;
      command = `redis-cli -h ${q(conn.host)} -p ${q(conn.port)} ping`;
      break;
    case "mongodb":
      env.MONGODB_URI = `mongodb://${encodeURIComponent(conn.user)}:${encodeURIComponent(password)}@${conn.host}:${conn.port}/${conn.database}`;
      command = "mongosh --quiet $MONGODB_URI --eval 'db.runCommand({ ping: 1 })'";
      break;
    case "sqlite":
      command = `sqlite3 ${q(conn.path)} 'select 1'`;
      break;
  }
  return { command, env };
}

const DB_CLI = { postgres: "psql", mysql: "mysql", redis: "redis-cli", mongodb: "mongosh", sqlite: "sqlite3" };

export async function testDbConnection(conn, { password = "", run = runCommand, now = Date.now } = {}) {
  const start = now();
  const cli = DB_CLI[conn.type];
  const probe = await run(`command -v ${cli} 2>/dev/null`);
  if (probe.exitCode !== 0 || !String(probe.stdout || "").trim()) {
    return { ok: false, detail: `未检测到 ${cli} 客户端，请先安装`, latencyMs: now() - start };
  }
  const { command, env } = buildDbTestCommand(conn, password);
  const r = await run(command, { env, timeout: 15000 });
  const ok = conn.type === "redis" ? /PONG/.test(r.stdout || "") : r.exitCode === 0;
  const detail = String(r.stdout || r.stderr || "无输出").trim().slice(0, 300);
  return { ok, detail, latencyMs: now() - start };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/metrics.test.js tests/tools.test.js`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/metrics.js tests/metrics.test.js
git commit -m "feat(metrics): 数据库连接测试命令构造与执行（密码走 env）"
```

---

### Task 4: server.js 数据库连接 CRUD 与测试接口

**Files:**
- Modify: `src/web/server.js`
- Test: `tests/web.test.js`

**Interfaces:**
- Consumes: `testDbConnection`（metrics.js，Task 3）、`persistConfig`（server.js 现有）、`config.dbConnections`（Task 2）
- Produces:
  - `GET /api/db/connections` → `{ connections: [{ ...conn, password: "", hasPass }] }`
  - `POST /api/db/connections` → `{ ok, entry }`（entry 同样脱敏）
  - `PATCH /api/db/connections` → `{ ok }`（password 空串=保持，null=清空）
  - `DELETE /api/db/connections` → `{ ok }`
  - `POST /api/db/test` → `{ ok, detail, latencyMs }`

- [ ] **Step 1: 写失败测试**

在 `tests/web.test.js` 末尾追加：

```js
test("数据库连接 CRUD 与测试接口", async () => {
  const runCommand = async (cmd) => {
    if (cmd.startsWith("command -v psql")) return { exitCode: 0, stdout: "/usr/bin/psql", stderr: "" };
    if (cmd.startsWith("psql")) return { exitCode: 0, stdout: "1\n", stderr: "" };
    return { exitCode: 1, stdout: "", stderr: "" };
  };
  const w = await makeServer({}, { runCommand });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };

  const add = await fetch(`${base}/api/db/connections`, { method: "POST", headers: H, body: JSON.stringify({ name: "pg1", type: "postgres", host: "127.0.0.1", user: "postgres", password: "pw" }) });
  assert.equal(add.status, 200);
  const addData = await add.json();
  assert.equal(addData.entry.password, "");
  assert.equal(addData.entry.hasPass, true);
  const id = addData.entry.id;

  const list = await (await fetch(`${base}/api/db/connections`, { headers: { Cookie: cookie } })).json();
  assert.equal(list.connections.length, 1);
  assert.equal(list.connections[0].password, "");
  assert.equal(list.connections[0].hasPass, true);

  const t = await fetch(`${base}/api/db/test`, { method: "POST", headers: H, body: JSON.stringify({ id }) });
  const td = await t.json();
  assert.equal(td.ok, true);
  assert.match(td.detail, /1/);

  const del = await fetch(`${base}/api/db/connections`, { method: "DELETE", headers: H, body: JSON.stringify({ id }) });
  assert.equal(del.status, 200);
  const list2 = await (await fetch(`${base}/api/db/connections`, { headers: { Cookie: cookie } })).json();
  assert.equal(list2.connections.length, 0);
  w.close();
});

test("数据库连接接口校验：非法类型 400", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const res = await fetch(`${base}/api/db/connections`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ name: "x", type: "oracle" }) });
  assert.equal(res.status, 400);
  w.close();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/web.test.js`
Expected: 新增测试 FAIL（404 / 断言不成立）

- [ ] **Step 3: 实现**

`src/web/server.js`：
- 顶部 import（约 11 行）在 metrics.js import 中追加 `testDbConnection`：

```js
import { collectAll, collectPorts, collectConnectivity, formatDateTime, formatUptime, listNginxConfs, readNginxConf, writeNginxConf, createTtlCache, collectLogSources, collectLogs, testDbConnection } from "../metrics.js";
```

- `persistConfig`（约 207-213 行）saved 对象追加：

```js
    dbConnections: config.dbConnections,
```

- 新增 helper（放在 `appendSysOp` 之后）：

```js
  const DB_DEFAULT_PORT = { postgres: "5432", mysql: "3306", redis: "6379", mongodb: "27017", sqlite: "" };
  const DB_TYPES = new Set(["postgres", "mysql", "redis", "mongodb", "sqlite"]);
  const sanitizeConn = (c) => ({ ...c, password: "", hasPass: Boolean(c.password) });
  const validateDbConn = ({ type, host, user, path }) => {
    if (!DB_TYPES.has(type)) return "不支持的数据库类型";
    if (type === "sqlite") return path ? null : "缺少数据库文件路径";
    if (!host) return "缺少主机";
    if (!user) return "缺少用户名";
    return null;
  };
  const dbTest = (conn, password) => testDbConnection(conn, { run: execCmd });
```

- 在 `/api/ssl` DELETE 分支之后、`/api/ssl/renew` 之前插入：

```js
      } else if (url.pathname === "/api/db/connections" && req.method === "GET") {
        sendJson(res, { connections: config.dbConnections.map(sanitizeConn) });
      } else if (url.pathname === "/api/db/connections" && req.method === "POST") {
        const body = await readBody(req);
        const { name, type, host, port, database, user, password, path, enabled } = JSON.parse(body || "{}");
        const err = validateDbConn({ type, host, user, path });
        if (err) { sendJson(res, { error: err }, 400); return; }
        const entry = {
          id: `db${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          name: String(name || ""), type: String(type),
          host: host || "", port: String(port || DB_DEFAULT_PORT[type]),
          database: database || "", user: user || "", password: password || "",
          path: path || "", enabled: enabled !== false,
        };
        config.dbConnections.push(entry);
        await persistConfig();
        sendJson(res, { ok: true, entry: sanitizeConn(entry) });
      } else if (url.pathname === "/api/db/connections" && req.method === "PATCH") {
        const body = await readBody(req);
        const { id, name, type, host, port, database, user, password, path, enabled } = JSON.parse(body || "{}");
        const entry = config.dbConnections.find((c) => c.id === id);
        if (!entry) { sendJson(res, { error: "连接不存在" }, 404); return; }
        if (type !== undefined && !DB_TYPES.has(type)) { sendJson(res, { error: "不支持的数据库类型" }, 400); return; }
        if (name !== undefined) entry.name = String(name);
        if (type !== undefined) entry.type = String(type);
        if (host !== undefined) entry.host = host;
        if (port !== undefined) entry.port = String(port);
        if (database !== undefined) entry.database = database;
        if (user !== undefined) entry.user = user;
        if (password === null) entry.password = "";
        else if (password) entry.password = String(password);
        if (path !== undefined) entry.path = path;
        if (enabled !== undefined) entry.enabled = Boolean(enabled);
        await persistConfig();
        sendJson(res, { ok: true });
      } else if (url.pathname === "/api/db/connections" && req.method === "DELETE") {
        const body = await readBody(req);
        const { id } = JSON.parse(body || "{}");
        const before = config.dbConnections.length;
        config.dbConnections = config.dbConnections.filter((c) => c.id !== id);
        if (config.dbConnections.length === before) { sendJson(res, { error: "连接不存在" }, 404); return; }
        await persistConfig();
        sendJson(res, { ok: true });
      } else if (url.pathname === "/api/db/test" && req.method === "POST") {
        const body = await readBody(req);
        const { id, password } = JSON.parse(body || "{}");
        const entry = config.dbConnections.find((c) => c.id === id);
        if (!entry) { sendJson(res, { error: "连接不存在" }, 404); return; }
        const r = await dbTest(entry, password === undefined ? entry.password : String(password || ""));
        sendJson(res, r);
      }
```

- `config.dbConnections` 需要先初始化（`startWeb` 顶部，约 181-183 行）追加：

```js
  config.dbConnections = normalizeDbConnections(config.dbConnections);
```

- 顶部 import（约 12 行）`import { loadConfig, normalizeSslSites, readJsonFile } from "../config.js";` 追加 `normalizeDbConnections`。

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/web.test.js`
Expected: 新增测试 PASS，原有测试不回归

- [ ] **Step 5: Commit**

```bash
git add src/web/server.js tests/web.test.js
git commit -m "feat(web): 数据库连接 CRUD 与测试接口"
```

---

### Task 5: i18n 文案

**Files:**
- Modify: `src/web/static/i18n.js`

- [ ] **Step 1: 加中英文案**

在 `I18N_ZH` 的 `"logs.sysGroup"` 行后追加：

```js
  "db.addBtn": "添加连接", "db.empty": "（暂无数据库连接，点右上角添加）",
  "db.name": "名称", "db.type": "类型", "db.host": "主机", "db.port": "端口", "db.database": "库名", "db.user": "用户名", "db.password": "密码", "db.path": "数据库文件路径",
  "db.typePostgres": "PostgreSQL", "db.typeMysql": "MySQL / MariaDB", "db.typeRedis": "Redis", "db.typeMongo": "MongoDB", "db.typeSqlite": "SQLite",
  "db.testBtn": "测试连接", "db.editBtn": "编辑", "db.delBtn": "删除", "db.enableBtn": "启用", "db.disableBtn": "停用",
  "db.testing": "测试中…", "db.testOk": "连接成功", "db.testFail": "连接失败", "db.testingHint": "输入该连接密码以测试", "db.delConfirm": "确认删除该数据库连接？",
  "db.hasPass": "已存密码", "db.noPass": "未存密码", "db.pwdPh": "密码（留空则不存）", "db.saveBtn": "保存", "db.cancelBtn": "取消",
  "db.errSave": "保存失败", "db.errTest": "测试失败",
```

在 `I18N_EN` 的 `"logs.sysGroup"` 行后追加：

```js
  "db.addBtn": "Add connection", "db.empty": "(No database connections, click add on the top right)",
  "db.name": "Name", "db.type": "Type", "db.host": "Host", "db.port": "Port", "db.database": "Database", "db.user": "Username", "db.password": "Password", "db.path": "Database file path",
  "db.typePostgres": "PostgreSQL", "db.typeMysql": "MySQL / MariaDB", "db.typeRedis": "Redis", "db.typeMongo": "MongoDB", "db.typeSqlite": "SQLite",
  "db.testBtn": "Test", "db.editBtn": "Edit", "db.delBtn": "Delete", "db.enableBtn": "Enable", "db.disableBtn": "Disable",
  "db.testing": "Testing…", "db.testOk": "Connected", "db.testFail": "Connection failed", "db.testingHint": "Enter this connection's password to test", "db.delConfirm": "Delete this database connection?",
  "db.hasPass": "Password stored", "db.noPass": "No password", "db.pwdPh": "Password (blank = not stored)", "db.saveBtn": "Save", "db.cancelBtn": "Cancel",
  "db.errSave": "Save failed", "db.errTest": "Test failed",
```

- [ ] **Step 2: 验证**

Run: `node --test tests/i18n.test.js`
Expected: PASS（zh/en 键集合一致）

- [ ] **Step 3: Commit**

```bash
git add src/web/static/i18n.js
git commit -m "feat(web): 数据库页 i18n 文案"
```

---

### Task 6: index.html 数据库连接表单 modal

**Files:**
- Modify: `src/web/static/index.html`

- [ ] **Step 1: 加 modal 标记**

在 `ssl-add-mask`（约 568 行）之前插入：

```html
    <div class="modal-mask" id="db-add-mask">
      <div class="modal">
        <button class="modal-close" id="db-add-close" title="关闭" data-i18n="modal.close" data-i18n-attr="title">✕</button>
        <h2><span id="db-add-title" data-i18n="db.addBtn">添加连接</span></h2>
        <input type="hidden" id="db-add-id">
        <div class="field"><label data-i18n="db.name">名称</label><input id="db-add-name" type="text" placeholder="如：生产库"></div>
        <div class="field"><label data-i18n="db.type">类型</label>
          <select id="db-add-type">
            <option value="postgres" data-i18n="db.typePostgres">PostgreSQL</option>
            <option value="mysql" data-i18n="db.typeMysql">MySQL / MariaDB</option>
            <option value="redis" data-i18n="db.typeRedis">Redis</option>
            <option value="mongodb" data-i18n="db.typeMongo">MongoDB</option>
            <option value="sqlite" data-i18n="db.typeSqlite">SQLite</option>
          </select>
        </div>
        <div class="field" id="db-add-host-field"><label data-i18n="db.host">主机</label><input id="db-add-host" type="text" placeholder="127.0.0.1"></div>
        <div class="field" id="db-add-port-field"><label data-i18n="db.port">端口</label><input id="db-add-port" type="text" placeholder="5432"></div>
        <div class="field" id="db-add-database-field"><label data-i18n="db.database">库名</label><input id="db-add-database" type="text" placeholder="app"></div>
        <div class="field" id="db-add-user-field"><label data-i18n="db.user">用户名</label><input id="db-add-user" type="text"></div>
        <div class="field" id="db-add-password-field"><label data-i18n="db.password">密码</label><div class="pwd-wrap"><input id="db-add-password" type="password" data-i18n="db.pwdPh" data-i18n-attr="placeholder"><button type="button" class="pwd-eye" title="显示/隐藏密码" data-i18n="pwd.eyeTitle" data-i18n-attr="title" aria-label="显示/隐藏密码"><svg class="eye-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg><svg class="eye-closed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 20L20 4"/></svg></button></div></div>
        <div class="field" id="db-add-path-field" style="display:none"><label data-i18n="db.path">数据库文件路径</label><input id="db-add-path" type="text" placeholder="/srv/data/app.db"></div>
        <div class="hint" id="db-add-err" style="color:var(--bad)"></div>
        <div class="modal-actions">
          <button class="btn" id="db-add-cancel" data-i18n="db.cancelBtn">取消</button>
          <button class="btn" id="db-add-save" data-i18n="db.saveBtn">保存</button>
        </div>
      </div>
    </div>
```

- [ ] **Step 2: 静态验证**

Run: `node --test tests/web.test.js`（下一步 Task 7 会加断言；这里只需确认 `node --check` 不适用，跑一次现有 web.test.js 确认没破坏）
Expected: 现有测试仍 PASS

- [ ] **Step 3: Commit**

```bash
git add src/web/static/index.html
git commit -m "feat(web): 数据库连接新增/编辑表单 modal"
```

---

### Task 7: app.js 数据库页渲染与交互

**Files:**
- Modify: `src/web/static/app.js`

**Interfaces:**
- Consumes: `fetch("api/db/connections")`、`fetch("api/db/test")`、`procMask`（现有密码弹窗）、`t()`、`icon()`、`escapeHtml()`
- Produces: `renderDbConnections(list)`（渲染列表）、`loadDbConnections()`（拉取并渲染）、`[data-db-*]` 点击处理

- [ ] **Step 1: 加渲染分支**

在 `renderCards()` 的 `} else if (key === "firewall") {` 分支之后新增：

```js
    } else if (key === "databases") {
      card.innerHTML = `<h2>${label} <button class="btn small" data-db-add style="margin-left:8px">${t("db.addBtn")}</button></h2><div id="db-list"><pre>${t("fs.loading")}</pre></div>`;
      loadDbConnections();
```

- [ ] **Step 2: 加渲染与交互函数**

在 `renderSsl` 函数之前插入以下代码：

```js
async function loadDbConnections() {
  const el = document.getElementById("db-list");
  if (!el) return;
  try {
    const res = await fetch("api/db/connections");
    const data = await res.json();
    renderDbConnections(data.connections || []);
  } catch { el.innerHTML = `<pre>${t("fs.loadFail").replace("{e}", "")}</pre>`; }
}

function renderDbConnections(list) {
  const el = document.getElementById("db-list");
  if (!el) return;
  if (!list.length) { el.innerHTML = `<pre class="hint">${t("db.empty")}</pre>`; return; }
  const typeLabel = { postgres: t("db.typePostgres"), mysql: t("db.typeMysql"), redis: t("db.typeRedis"), mongodb: t("db.typeMongo"), sqlite: t("db.typeSqlite") };
  el.innerHTML = `<div class="db-grid">` + list.map((c) => {
    const addr = c.type === "sqlite" ? escapeHtml(c.path) : `${escapeHtml(c.host)}:${escapeHtml(c.port)}`;
    const db = c.type === "sqlite" ? "" : `<span class="db-sub">${t("db.database")} ${escapeHtml(c.database || "—")}</span>`;
    const user = c.type === "sqlite" ? "" : `<span class="db-sub">${t("db.user")} ${escapeHtml(c.user || "—")}</span>`;
    const pass = c.hasPass ? `<span class="tag ok">${t("db.hasPass")}</span>` : `<span class="tag">${t("db.noPass")}</span>`;
    const state = c.enabled ? "" : ` class="na"`;
    const ops = `<span class="proc-ops">
      <a href="javascript:void(0)" data-db-action="test" data-db-id="${escapeHtml(c.id)}">${t("db.testBtn")}</a>
      <a href="javascript:void(0)" data-db-action="edit" data-db-id="${escapeHtml(c.id)}">${t("db.editBtn")}</a>
      <a href="javascript:void(0)" data-db-action="toggle" data-db-id="${escapeHtml(c.id)}" data-db-enabled="${c.enabled !== false}">${c.enabled === false ? t("db.enableBtn") : t("db.disableBtn")}</a>
      <a href="javascript:void(0)" data-db-action="del" data-db-id="${escapeHtml(c.id)}" class="danger">${t("db.delBtn")}</a>
    </span>`;
    return `<div class="db-card"><div class="db-head"><b${state}>${escapeHtml(c.name)}</b><span class="tag">${typeLabel[c.type] || c.type}</span>${pass}</div>
      <div class="db-addr">${addr}</div>${db}${user}
      <div class="db-ops">${ops}</div>
      <div class="db-result" id="db-result-${escapeHtml(c.id)}"></div></div>`;
  }).join("") + `</div>`;
}

document.addEventListener("click", async (e) => {
  const add = e.target.closest("[data-db-add]");
  if (add) { openDbModal(); return; }
  const a = e.target.closest("[data-db-action]");
  if (!a) return;
  const id = a.dataset.dbId;
  const action = a.dataset.dbAction;
  const resEl = document.getElementById(`db-result-${id}`);
  if (action === "test") {
    const conn = await fetchDbConn(id);
    if (!conn) return;
    if (conn.hasPass) { runDbTest(id, ""); }
    else {
      procTarget = { kind: "db-test", id };
      document.getElementById("proc-title").textContent = t("db.testBtn");
      document.getElementById("proc-text").textContent = t("db.testingHint");
      document.getElementById("proc-err").textContent = "";
      const pw = document.getElementById("proc-password");
      pw.value = "";
      setProcPwdLabel("proc");
      procMask.classList.add("show");
      setTimeout(() => pw.focus(), 50);
    }
  } else if (action === "edit") {
    const conn = await fetchDbConn(id);
    if (conn) openDbModal(conn);
  } else if (action === "toggle") {
    await fetch("api/db/connections", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled: a.dataset.dbEnabled !== "true" }) });
    loadDbConnections();
  } else if (action === "del") {
    if (!confirm(t("db.delConfirm"))) return;
    await fetch("api/db/connections", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    loadDbConnections();
  }
});

async function fetchDbConn(id) {
  try {
    const res = await fetch("api/db/connections");
    const data = await res.json();
    return (data.connections || []).find((c) => c.id === id);
  } catch { return null; }
}

async function runDbTest(id, password) {
  const resEl = document.getElementById(`db-result-${id}`);
  if (resEl) resEl.innerHTML = `<span class="na">${t("db.testing")}</span>`;
  try {
    const res = await fetch("api/db/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(password ? { id, password } : { id }) });
    const d = await res.json();
    if (resEl) resEl.innerHTML = d.ok ? `<span class="ok">✓ ${t("db.testOk")}${Number.isFinite(d.latencyMs) ? `（${d.latencyMs}ms）` : ""}</span>` : `<span class="bad">✗ ${escapeHtml(d.detail || d.error || t("db.testFail"))}</span>`;
  } catch (err) {
    if (resEl) resEl.innerHTML = `<span class="bad">✗ ${escapeHtml(String(err))}</span>`;
  }
}

const dbAddMask = document.getElementById("db-add-mask");
function openDbModal(conn) {
  document.getElementById("db-add-id").value = conn?.id || "";
  document.getElementById("db-add-name").value = conn?.name || "";
  document.getElementById("db-add-type").value = conn?.type || "postgres";
  document.getElementById("db-add-host").value = conn?.host || "";
  document.getElementById("db-add-port").value = conn?.port || "";
  document.getElementById("db-add-database").value = conn?.database || "";
  document.getElementById("db-add-user").value = conn?.user || "";
  document.getElementById("db-add-password").value = "";
  document.getElementById("db-add-path").value = conn?.path || "";
  document.getElementById("db-add-err").textContent = "";
  document.getElementById("db-add-title").textContent = conn ? t("db.editBtn") : t("db.addBtn");
  dbSyncTypeFields();
  dbAddMask.classList.add("show");
  setTimeout(() => document.getElementById("db-add-name").focus(), 50);
}
function dbSyncTypeFields() {
  const isSqlite = document.getElementById("db-add-type").value === "sqlite";
  for (const f of ["db-add-host-field", "db-add-port-field", "db-add-database-field", "db-add-user-field", "db-add-password-field"]) {
    document.getElementById(f).style.display = isSqlite ? "none" : "";
  }
  document.getElementById("db-add-path-field").style.display = isSqlite ? "" : "none";
}
document.getElementById("db-add-close").onclick = () => dbAddMask.classList.remove("show");
document.getElementById("db-add-cancel").onclick = () => dbAddMask.classList.remove("show");
dbAddMask.addEventListener("click", (e) => { if (e.target === dbAddMask) dbAddMask.classList.remove("show"); });
document.getElementById("db-add-type").onchange = dbSyncTypeFields;
document.getElementById("db-add-save").onclick = async () => {
  const id = document.getElementById("db-add-id").value;
  const body = { name: document.getElementById("db-add-name").value.trim() };
  const isSqlite = document.getElementById("db-add-type").value === "sqlite";
  if (isSqlite) { body.type = "sqlite"; body.path = document.getElementById("db-add-path").value.trim(); }
  else {
    body.type = document.getElementById("db-add-type").value;
    body.host = document.getElementById("db-add-host").value.trim();
    body.port = document.getElementById("db-add-port").value.trim();
    body.database = document.getElementById("db-add-database").value.trim();
    body.user = document.getElementById("db-add-user").value.trim();
    const pw = document.getElementById("db-add-password").value;
    if (pw) body.password = pw;
  }
  const method = id ? "PATCH" : "POST";
  const payload = id ? { ...body, id } : body;
  const res = await fetch("api/db/connections", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) { document.getElementById("db-add-err").textContent = data.error || t("db.errSave"); return; }
  dbAddMask.classList.remove("show");
  loadDbConnections();
};
```

- 在 `proc-confirm` handler 中扩展（`const isSys = kind === "sys";` 之后加）：

```js
  const isDbTest = kind === "db-test";
```
endpoint 分支改为：

```js
      const endpoint = isFw ? "api/firewall/close" : isFwCtl ? "api/firewall/control" : isNginxSave ? "api/nginx/conf" : isNginxOp ? "api/nginx/reload" : isFs ? `api/fs/${fsOp}` : isSys ? `api/system/${procTarget.op}` : isDbTest ? "api/db/test" : "api/process";
```
payload 分支（isSys 之后）加：

```js
                : isDbTest
                  ? { id: procTarget.id, password }
                  : { ...procTarget, password };
```
成功分支（`if (isSys) showSaveMsg(...)` 之后，替换原有的 `refreshMetrics();`）：

```js
    if (isDbTest) { runDbTest(procTarget.id, password); } else { refreshMetrics(); }
```
说明：db 列表来自 `/api/db/connections`，不依赖 `refreshMetrics`；且 `refreshMetrics` 会重建卡片 DOM，把刚写入的测试结果清掉，所以 db-test 分支跳过它。

- [ ] **Step 3: 静态验证 + 全量回归**

在 `tests/web.test.js` 末尾追加：

```js
test("数据库页前端：renderDb 相关钩子存在", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const js = await (await fetch(`${base}/app.js`)).text();
  const html = await (await fetch(`${base}/`)).text();
  assert.match(js, /loadDbConnections/);
  assert.match(js, /renderDbConnections/);
  assert.match(js, /api\/db\/connections/);
  assert.match(js, /api\/db\/test/);
  assert.match(html, /id="db-add-mask"/);
  assert.match(html, /id="db-add-type"/);
  w.close();
});
```

Run: `node --test tests/web.test.js tests/i18n.test.js`
Expected: 全部 PASS（含新增静态断言）

- [ ] **Step 4: Commit**

```bash
git add src/web/static/app.js tests/web.test.js
git commit -m "feat(web): 数据库页连接列表、测试与增删改交互"
```

---

### Task 8: app.css 数据库页样式

**Files:**
- Modify: `src/web/static/app.css`

- [ ] **Step 1: 加样式**

在 `.trend-legend` 规则之后追加：

```css
    /* 数据库连接页 */
    .db-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
    .db-card { background: var(--panel2); border: 1px solid var(--border); border-radius: var(--r-md); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
    .db-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .db-head b.na { color: var(--muted); }
    .db-addr { font-family: var(--font-mono); color: var(--text); }
    .db-sub { font-size: 12px; color: var(--muted); }
    .db-ops { margin-top: auto; padding-top: 6px; }
    .db-result { font-size: 12px; min-height: 16px; }
    .db-result .ok { color: var(--ok); }
    .db-result .bad { color: var(--bad); }
    .db-result .na { color: var(--muted); }
```

- [ ] **Step 2: 验证**

Run: `node --test tests/web.test.js`（确认不回归）
Expected: 全部 PASS

- [ ] **Step 3: Commit**

```bash
git add src/web/static/app.css
git commit -m "feat(web): 数据库连接卡片样式"
```

---

## 收尾

完成后在面板（浏览器）验证数据库页：
1. 打开「数据库」菜单 → 显示「（暂无数据库连接，点右上角添加）」
2. 添加一条 PostgreSQL 连接（本机 5432，输入密码）→ 出现在列表
3. 点「测试连接」（已有密码直接测）→ 显示 `✓ 连接成功（xx ms）`
4. 编辑名称/端口 → 保存生效；删除 → 列表移除
5. 刷新页面后连接仍在（config 已持久化），密码不回显

运行 `npm test` 全量确认无新回归（已知的 root 依赖用例失败与本次无关）。
