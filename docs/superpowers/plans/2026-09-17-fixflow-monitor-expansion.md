# Fixflow 监控扩展实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按菜单分类补齐 10 项运维能力的基础版：进程分析、端口占用、连通性、SSL 证书监控、Nginx 诊断增强、Python 进程存活、慢查询检测、Docker 详情、一键报告。

**Architecture:** 全部复用现有 `runCommand` 模式在 `src/metrics.js` 新增采集函数；`/api/metrics` 由 `collectAll` 聚合扩展字段；前端沿用现有卡片/搜索框机制渲染，输入框仅在需参数的视图显示。

**Tech Stack:** Node.js ≥18，零第三方依赖（node:test 测试）。

**Spec:** `docs/superpowers/specs/2026-09-17-fixflow-monitor-expansion-design.md`

## Global Constraints

- 零第三方依赖，只允许 `node:` 内置模块
- 新采集函数一律复用 `runCommand`，失败返回 `{error}`，绝不影响其他模块
- 命令输出超限由 `runCommand` 截断（50KB），不额外处理
- 配置字段：`sslSites`（string[]）、`pingTargets`（string[]），默认 `[]`
- 手动输入查询不写入配置
- 前端新增交互控件仅在对应视图显示（`style="display:none"` 默认）

---

### Task 1: 配置扩展 sslSites / pingTargets

**Files:**
- Modify: `src/config.js:21-29`
- Test: `tests/config.test.js`

**Interfaces:**
- Consumes: 无
- Produces: `loadConfig()` 返回对象新增 `sslSites: string[]`、`pingTargets: string[]`

- [ ] **Step 1: 写失败测试**

在 `tests/config.test.js` 追加：

```js
test("配置新增 sslSites 与 pingTargets", () => {
  const dir = mkdtempSync(join(tmpdir(), "fixflow-"));
  const file = join(dir, "config.json");
  const cfg = loadConfig({ filePath: file });
  assert.deepEqual(cfg.sslSites, []);
  assert.deepEqual(cfg.pingTargets, []);
  writeFileSync(file, JSON.stringify({ sslSites: ["example.com"], pingTargets: ["1.1.1.1"] }));
  const cfg2 = loadConfig({ filePath: file });
  assert.deepEqual(cfg2.sslSites, ["example.com"]);
  assert.deepEqual(cfg2.pingTargets, ["1.1.1.1"]);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/config.test.js`
Expected: FAIL — 断言 `cfg.sslSites` 为 undefined

- [ ] **Step 3: 实现**

在 `src/config.js` 的 return 对象中 `databases` 后追加：

```js
    sslSites: file.sslSites || [],
    pingTargets: file.pingTargets || [],
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/config.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/config.js tests/config.test.js
git commit -m "feat(config): 新增 sslSites/pingTargets 配置字段"
```

---

### Task 2: metrics 新增 collectProcesses / collectSsl

**Files:**
- Modify: `src/metrics.js`（新增函数，`collectAll` 不动）
- Test: `tests/metrics.test.js`

**Interfaces:**
- Consumes: `runCommand` from `./tools.js`（已有）
- Produces:
  - `collectProcesses()` → `{ top: string, zombies: number, zombieDetail: string }`（失败 `{error}`）
  - `collectSsl(sites: string[])` → `{ results: [{ host, port, expiresIn, daysLeft, error? }] }`（失败 `{error}`）
  - 两者均加入 `collectAll` 的返回：`processes`、`ssl`

- [ ] **Step 1: 写失败测试**

在 `tests/metrics.test.js` 追加：

```js
test("collectProcesses 返回进程与僵尸统计", async () => {
  const r = await collectProcesses();
  assert.ok("top" in r && "zombies" in r || "error" in r);
  if (r.top) assert.equal(typeof r.top, "string");
});

test("collectSsl 对空列表返回空 results，不抛错", async () => {
  const r = await collectSsl([]);
  assert.ok("results" in r || "error" in r);
});
```

导入追加 `collectProcesses, collectSsl`。

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/metrics.test.js`
Expected: FAIL — collectProcesses 未定义

- [ ] **Step 3: 实现**

在 `src/metrics.js` 追加（`collectDocker` 之后、`collectAll` 之前）：

```js
export async function collectProcesses() {
  const [top, zombie] = await Promise.all([
    runCommand("ps aux --sort=-%cpu | head -21"),
    runCommand("ps -eo stat,comm | awk '$1 ~ /Z/ {print $2}'"),
  ]);
  if (top.exitCode !== 0) return { error: top.stderr || "ps 不可用" };
  const zombies = (zombie.stdout || "").split("\n").filter((l) => l.trim()).length;
  return { top: top.stdout, zombies, zombieDetail: zombie.stdout.trim() };
}

export async function collectSsl(sites = []) {
  const results = await Promise.all(sites.map(async (site) => {
    const host = site.split(":")[0];
    const port = site.includes(":") ? site.split(":")[1] : "443";
    const r = await runCommand(`timeout 10 bash -c 'echo | openssl s_client -connect ${host}:${port} -servername ${host} 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null'`);
    const m = (r.stdout || "").match(/notAfter=(.*)/);
    if (!m) return { host, port, error: r.stderr || "无法读取证书" };
    const daysLeft = Math.floor((new Date(m[1]) - Date.now()) / 86400000);
    return { host, port, notAfter: m[1], daysLeft };
  }));
  return { results };
}
```

`collectAll` 返回对象追加：

```js
    processes: await safe(collectProcesses),
    ssl: await safe(() => collectSsl(config.sslSites || [])),
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/metrics.test.js`
Expected: PASS（collectAll 测试的字段循环会报缺 processes/ssl，若报错则把两字段也加入断言列表）

- [ ] **Step 5: 提交**

```bash
git add src/metrics.js tests/metrics.test.js
git commit -m "feat(metrics): 进程分析 + SSL 证书监控"
```

---

### Task 3: metrics 新增 collectConnectivity / collectPorts

**Files:**
- Modify: `src/metrics.js`
- Test: `tests/metrics.test.js`

**Interfaces:**
- Consumes: `runCommand`
- Produces:
  - `collectConnectivity(targets: string[])` → `{ results: [{ target, pingOk, pingDetail, dns }] }`
  - `collectPorts(port?: string)` → `{ listeners: { ok, detail } }`；无参时返回 `collectNetwork()` 结果
  - 加入 `collectAll`：`connectivity`

- [ ] **Step 1: 写失败测试**

追加：

```js
test("collectConnectivity 对空目标返回空 results", async () => {
  const r = await collectConnectivity([]);
  assert.ok("results" in r || "error" in r);
});

test("collectPorts 无参返回监听列表", async () => {
  const r = await collectPorts();
  assert.ok("listeners" in r || "error" in r);
});
```

导入追加 `collectConnectivity, collectPorts`。

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/metrics.test.js`

- [ ] **Step 3: 实现**

```js
export async function collectConnectivity(targets = []) {
  const results = await Promise.all(targets.map(async (target) => {
    const [ping, dns] = await Promise.all([
      runCommand(`ping -c 2 -W 3 ${target}`),
      runCommand(`getent hosts ${target}`),
    ]);
    return {
      target,
      pingOk: ping.exitCode === 0,
      pingDetail: ping.stdout.trim() || ping.stderr.trim(),
      dns: dns.stdout.trim() || dns.stderr.trim() || "解析失败",
    };
  }));
  return { results };
}

export async function collectPorts(port) {
  if (!port) return collectNetwork();
  const r = await runCommand(`ss -tulnp | grep ":${port} "`);
  return {
    listeners: {
      ok: r.exitCode === 0,
      detail: r.stdout || `端口 ${port} 无监听`,
    },
  };
}
```

`collectAll` 追加：

```js
    connectivity: await safe(() => collectConnectivity(config.pingTargets || [])),
```

- [ ] **Step 4: 运行确认通过**

- [ ] **Step 5: 提交**

```bash
git add src/metrics.js tests/metrics.test.js
git commit -m "feat(metrics): 网络连通性 + 端口占用查询"
```

---

### Task 4: 防火墙开放风险端口识别

**Files:**
- Modify: `src/metrics.js`（`collectFirewall` 增强）
- Test: `tests/metrics.test.js`
- Modify: `src/web/static/app.js`

**Interfaces:**
- Produces: `collectFirewall()` 返回新增 `riskyPorts: [{ proto, port }]` —— 从 iptables 输出识别接受任意来源（`0.0.0.0/0`）的端口

- [ ] **Step 1: 写失败测试**

追加：

```js
test("collectFirewall 返回 riskyPorts 字段", async () => {
  const r = await collectFirewall();
  assert.ok("riskyPorts" in r || "status" in r);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/metrics.test.js`
Expected: FAIL — collectFirewall 返回无 riskyPorts

- [ ] **Step 3: 实现**

`collectFirewall` 现有 iptables 命令改为捕获带 `--line-numbers` 的全量输出，并在返回对象追加：

```js
export async function collectFirewall() {
  const [ufw, iptables] = await Promise.all([
    runCommand("ufw status"),
    runCommand("iptables -L -n --line-numbers"),
  ]);
  const isActive = ufw.stdout.includes("Status: active") || (ufw.exitCode === 0 && ufw.stdout.includes("active"));
  const riskyPorts = [];
  for (const line of (iptables.stdout || "").split("\n")) {
    const m = line.match(/ACCEPT\s+tcp\s+.*\s0\.0\.0\.0\/0\s+0\.0\.0\.0\/0\s+tcp\s+dpt:(\d+)/);
    if (m) riskyPorts.push({ proto: "tcp", port: Number(m[1]) });
  }
  return {
    status: { ok: true, detail: isActive ? "ufw active" : (ufw.stdout.trim() || "ufw 不可用") },
    rules: { ok: iptables.exitCode === 0, detail: iptables.stdout || iptables.stderr },
    riskyPorts,
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/metrics.test.js`

- [ ] **Step 5: 前端展示**

`app.js` `renderCards` 的 `key === "systemd"` 分支前增加防火墙分支：

```js
    } else if (key === "firewall" && m?.riskyPorts?.length) {
      const risk = `<div style="color:var(--bad);margin-bottom:6px;font-size:12px">⚠️ 对全网开放端口：${m.riskyPorts.map((p) => `${p.proto}/${p.port}`).join("、")}</div>`;
      card.innerHTML = `<h2>${label}</h2>${risk}<pre>${escapeHtml(detail(m))}</pre>`;
    } else if (key === "systemd") {
```

- [ ] **Step 6: 提交**

```bash
git add src/metrics.js tests/metrics.test.js src/web/static/app.js
git commit -m "feat(metrics): 防火墙开放风险端口识别"
```

---

### Task 5: metrics 新增 Nginx 日志 / Python 进程 / 慢查询 / Docker 详情

**Files:**
- Modify: `src/metrics.js`
- Test: `tests/metrics.test.js`

**Interfaces:**
- Produces:
  - `collectNginxLogs()` → `{ errorLog: string, sites: string }`
  - `collectPyProcesses()` → `{ processes: string, venvs: string }`
  - `collectDbSlow({ databases })` → `[{ name, ok, detail }]`
  - `collectDockerDetail()` → `{ stats: string, logs: string, restarts: string }`
  - 均加入 `collectAll`

- [ ] **Step 1: 写失败测试**

追加：

```js
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
```

导入追加 `collectNginxLogs, collectPyProcesses, collectDbSlow, collectDockerDetail`。

- [ ] **Step 2: 运行确认失败**

- [ ] **Step 3: 实现**

```js
export async function collectNginxLogs() {
  const [logs, sites] = await Promise.all([
    runCommand("tail -50 /var/log/nginx/error.log 2>&1"),
    runCommand("ls /etc/nginx/sites-enabled/ 2>/dev/null"),
  ]);
  if (logs.exitCode !== 0) return { error: logs.stderr || "nginx 日志不可用" };
  return { errorLog: logs.stdout, sites: sites.stdout.trim() || "（无站点目录）" };
}

export async function collectPyProcesses() {
  const [ps, venvs] = await Promise.all([
    runCommand("pgrep -fl python 2>/dev/null | head -20"),
    runCommand("ls -d /srv/*/venv /opt/*/venv ~/venv 2>/dev/null"),
  ]);
  if (ps.exitCode !== 0) return { error: "未发现 python 进程" };
  return { processes: ps.stdout.trim() || "无 python 进程", venvs: venvs.stdout.trim() || "（无常见 venv 目录）" };
}

export async function collectDbSlow({ databases = [] }) {
  const probes = {
    postgres: "psql -tAc 'SELECT count(*) FROM pg_stat_activity' 2>&1",
    mysql: "mysql -N -e 'SHOW GLOBAL STATUS LIKE \"Slow_queries\"' 2>&1 | tail -1",
    redis: "redis-cli SLOWLOG LEN 2>&1",
  };
  return Promise.all(databases.map(async (d) => {
    const cmd = probes[d.type];
    if (!cmd) return { name: d.name, ok: false, detail: `未知类型 ${d.type}` };
    const r = await runCommand(cmd);
    return { name: d.name, ok: r.exitCode === 0, detail: (r.stdout || r.stderr).trim() || "无输出" };
  }));
}

export async function collectDockerDetail() {
  const [stats, logs, restarts] = await Promise.all([
    runCommand("docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' 2>&1"),
    runCommand("docker ps -q | head -3 | xargs -I{} docker logs --tail 20 --timestamps {} 2>&1"),
    runCommand("for c in $(docker ps -aq); do docker inspect -f '{{.Name}} 重启{{.RestartCount}}次' $c; done 2>&1"),
  ]);
  if (stats.exitCode !== 0) return { error: stats.stderr || "docker 不可用" };
  return { stats: stats.stdout, logs: logs.stdout || "（无容器日志）", restarts: restarts.stdout || "（无容器）" };
}
```

`collectAll` 追加：

```js
    nginxLogs: await safe(collectNginxLogs),
    pyProcesses: await safe(collectPyProcesses),
    dbSlow: await safe(() => collectDbSlow(config)),
    dockerDetail: await safe(collectDockerDetail),
```

- [ ] **Step 4: 运行确认通过**

- [ ] **Step 5: 提交**

```bash
git add src/metrics.js tests/metrics.test.js
git commit -m "feat(metrics): Nginx 日志/Python 进程/慢查询/Docker 详情"
```

---

### Task 6: /api/config 支持保存 sslSites / pingTargets

**Files:**
- Modify: `src/web/server.js:76-92`
- Test: `tests/web.test.js`

**Interfaces:**
- Consumes: `config` 对象上的 `sslSites`/`pingTargets`
- Produces: GET `/api/config` 返回两者；POST 接受 `sslSites`（string[]）、`pingTargets`（string[]）并写盘热更新

- [ ] **Step 1: 写失败测试**

在 `tests/web.test.js` 的 config 测试末尾追加：

```js
  const post2 = await fetch(`${base}/api/config`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sslSites: ["example.com"], pingTargets: ["1.1.1.1"] }),
  });
  assert.equal(post2.status, 200);
  const file2 = JSON.parse((await import("node:fs")).readFileSync(tmp, "utf8"));
  assert.deepEqual(file2.sslSites, ["example.com"]);
  assert.deepEqual(file2.pingTargets, ["1.1.1.1"]);
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/web.test.js`
Expected: FAIL — file2.sslSites 为 undefined

- [ ] **Step 3: 实现**

`server.js` 的 `POST /api/config` 处理中，在 `if (model) config.model = model;` 后追加：

```js
        if (Array.isArray(sslSites)) config.sslSites = sslSites;
        if (Array.isArray(pingTargets)) config.pingTargets = pingTargets;
```

解构处改为：

```js
        const { baseUrl, apiKey, model, sslSites, pingTargets } = JSON.parse(body || "{}");
```

保存行改为：

```js
        const saved = { ...existing, baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, sslSites: config.sslSites, pingTargets: config.pingTargets };
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/web.test.js`

- [ ] **Step 5: 提交**

```bash
git add src/web/server.js tests/web.test.js
git commit -m "feat(web): config 接口支持 sslSites/pingTargets"
```

---

### Task 7: 前端 MODULES 增项与进程/SSL 卡片渲染

**Files:**
- Modify: `src/web/static/index.html`（菜单）
- Modify: `src/web/static/app.js`（MODULES、renderCards、renderSystemd 旁新增 render 函数）

**Interfaces:**
- Consumes: `/api/metrics` 返回的 `processes`、`ssl`、`connectivity`、`nginxLogs`、`pyProcesses`、`dbSlow`、`dockerDetail`
- Produces: 新菜单项「进程」「SSL 证书」；进程卡显示 Top 列表+僵尸数；SSL 卡显示表格

- [ ] **Step 1: 菜单 HTML**

在 `index.html` 「服务」菜单项前插入：

```html
      <button class="menu-item" data-view="monitor" data-filter="processes"><span class="dot"></span>进程</button>
      <button class="menu-item" data-view="monitor" data-filter="ssl"><span class="dot"></span>SSL 证书</button>
```

- [ ] **Step 2: MODULES 数组**

`app.js` MODULES 追加：

```js
  ["processes", "进程"],
  ["ssl", "SSL 证书"],
```

- [ ] **Step 3: renderCards 分支**

将 `renderCards` 中 `if (key === "systemd")` 改为：

```js
    if (key === "systemd") {
      card.innerHTML = `<h2>${label}</h2>${renderSystemd(m)}`;
    } else if (key === "processes") {
      card.innerHTML = `<h2>${label}</h2>${renderProcesses(m)}`;
    } else if (key === "ssl") {
      card.innerHTML = `<h2>${label}</h2>${renderSsl(m)}`;
    } else {
```

- [ ] **Step 4: render 函数**

`app.js` 在 `renderSystemd` 后追加：

```js
function renderProcesses(m) {
  if (!m?.top) return `<pre>${escapeHtml(m?.error || "N/A")}</pre>`;
  const zombie = m.zombies > 0
    ? `<div style="color:var(--bad);margin-bottom:6px;font-size:12px">⚠️ 僵尸进程 ${m.zombies} 个：${escapeHtml(m.zombieDetail || "")}</div>`
    : `<div style="color:var(--ok);margin-bottom:6px;font-size:12px">✅ 无僵尸进程</div>`;
  return zombie + `<pre>${escapeHtml(m.top)}</pre>`;
}

function renderSsl(m) {
  if (!m?.results) return `<pre>${escapeHtml(m?.error || "N/A")}</pre>`;
  if (!m.results.length) return `<pre>（未配置监控域名，可在设置中配置）</pre>`;
  const rows = m.results.map((s) => {
    const cls = s.daysLeft > 30 ? "ok" : s.daysLeft > 0 ? "na" : "bad";
    const expire = typeof s.daysLeft === "number" ? (s.daysLeft > 0 ? `${s.daysLeft} 天` : "已过期") : "—";
    return `<tr><td>${escapeHtml(s.host)}:${escapeHtml(s.port)}</td><td>${escapeHtml(s.notAfter || "—")}</td><td class="${cls}">${expire}</td><td>${escapeHtml(s.error || "")}</td></tr>`;
  }).join("");
  return `<table class="svc-table"><thead><tr><th>域名</th><th>到期时间</th><th>剩余</th><th>备注</th></tr></thead><tbody>${rows}</tbody></table>`;
}
```

- [ ] **Step 5: 设置页增加配置项**

`index.html` 设置弹层，模型字段后追加：

```html
    <div class="field">
      <label>SSL 监控域名（一行一个，如 example.com）</label>
      <textarea id="cfg-ssl-sites" class="field-textarea" rows="3"></textarea>
    </div>
    <div class="field">
      <label>连通性目标（一行一个，如 1.1.1.1）</label>
      <textarea id="cfg-ping-targets" class="field-textarea" rows="3"></textarea>
    </div>
```

`index.html` 的 `.field input, .field select` 选择器加 `textarea`，并补样式：

```css
    .field-textarea { width: 100%; padding: 9px 11px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 13px; outline: none; font-family: inherit; resize: vertical; }
    .field-textarea:focus { border-color: var(--accent); }
```

`app.js` `openSettings` 中填入值、`cfg-save` 中收集并提交（在 `newKey` 逻辑后）：

```js
  const sslSites = cfgSslSites.value.trim().split("\n").map((s) => s.trim()).filter(Boolean);
  const pingTargets = cfgPingTargets.value.trim().split("\n").map((s) => s.trim()).filter(Boolean);
  if (sslSites.length) body.sslSites = sslSites;
  if (pingTargets.length) body.pingTargets = pingTargets;
```

并新增元素引用与 `openSettings` 填充：

```js
const cfgSslSites = document.getElementById("cfg-ssl-sites");
const cfgPingTargets = document.getElementById("cfg-ping-targets");
```

在 `openSettings` 中：

```js
  cfgSslSites.value = (cfg.sslSites || []).join("\n");
  cfgPingTargets.value = (cfg.pingTargets || []).join("\n");
```

- [ ] **Step 6: 提交**

```bash
git add src/web/static/index.html src/web/static/app.js
git commit -m "feat(web): 进程与 SSL 证书菜单及设置配置"
```

---

### Task 8: 网络/连通性手动查询 + 一键报告

**Files:**
- Modify: `src/web/static/index.html`（网络卡片查询输入）
- Modify: `src/web/static/app.js`
- Modify: `src/web/server.js`（/api/metrics 支持 ?port= 与 ?ping= 参数）

**Interfaces:**
- Produces: `/api/metrics?port=8080` 返回带 `portScan` 字段；`/api/metrics?ping=1.1.1.1` 返回 `pingResult`；前端网络卡片带查询框

- [ ] **Step 1: server.js 支持查询参数**

`/api/metrics` 分支改为：

```js
      if (url.pathname === "/api/metrics") {
        const q = url.searchParams;
        const data = await collectAll(config);
        if (q.get("port")) data.portScan = await collectPorts(q.get("port"));
        if (q.get("ping")) data.pingResult = await collectConnectivity([q.get("ping")]);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      }
```

import 补 `collectPorts, collectConnectivity`。

- [ ] **Step 2: 网络卡片查询 UI**

`index.html`「网络」菜单项附近无需改。在 `#cards` 上方 `#view-monitor` 内加一个仅网络视图显示的查询条：

```html
    <div class="content" id="view-monitor">
      <div id="net-tools" style="display:none;margin-bottom:12px;display:flex;gap:8px;align-items:center">
        <input id="port-input" class="search-box" placeholder="查端口占用，如 8080">
        <button class="btn small" id="port-btn">查端口</button>
        <input id="ping-input" class="search-box" placeholder="连通性检测目标，如 1.1.1.1">
        <button class="btn small" id="ping-btn">检测</button>
      </div>
      <section class="cards" id="cards"></section>
    </div>
```

注意：该 div 默认 `display:none`，菜单点击网络视图时设为 flex。

- [ ] **Step 3: app.js 控制显隐 + 查询逻辑**

菜单点击处（网络分支）：

```js
      const netTools = document.getElementById("net-tools");
      netTools.style.display = currentFilter === "network" ? "flex" : "none";
```

新增查询处理（放在 `searchBox.addEventListener` 后）：

```js
const netTools = document.getElementById("net-tools");
const portBtn = document.getElementById("port-btn");
const pingBtn = document.getElementById("ping-btn");
portBtn.onclick = async () => {
  const port = document.getElementById("port-input").value.trim();
  if (!port) return;
  const res = await fetch(`/api/metrics?port=${encodeURIComponent(port)}`);
  metrics.portScan = (await res.json()).portScan;
  renderCards();
};
pingBtn.onclick = async () => {
  const target = document.getElementById("ping-input").value.trim();
  if (!target) return;
  const res = await fetch(`/api/metrics?ping=${encodeURIComponent(target)}`);
  metrics.pingResult = (await res.json()).pingResult;
  renderCards();
};
```

`renderCards` 网络卡片分支：

```js
    } else if (key === "network") {
      const scan = metrics.portScan;
      const ping = metrics.pingResult;
      card.innerHTML = `<h2>${label}</h2><pre>${escapeHtml(detail(m))}</pre>${scan ? `<pre>【端口占用】${escapeHtml(scan?.listeners?.detail || scan?.error || "N/A")}</pre>` : ""}${ping ? `<pre>【连通性】${escapeHtml(JSON.stringify(ping.results || ping, null, 2))}</pre>` : ""}`;
    } else {
```

- [ ] **Step 4: 一键报告按钮**

系统卡片分支（`key === "system"`）：

```js
    } else if (key === "system") {
      card.innerHTML = `<h2>${label} <button class="btn small" id="report-btn" style="margin-left:8px">📄 生成报告</button></h2><pre>${escapeHtml(detail(m))}</pre><pre id="report-out" style="display:none"></pre>`;
    } else {
```

`app.js` 渲染后绑定（`renderCards` 尾部、card append 之后）：

```js
    const reportBtn = card.querySelector("#report-btn");
    if (reportBtn) {
      reportBtn.onclick = async () => {
        const out = document.getElementById("report-out");
        const res = await fetch("/api/metrics");
        const data = await res.json();
        const report = Object.entries(data).map(([k, v]) => `## ${k}\n${JSON.stringify(v, null, 2)}`).join("\n\n");
        out.textContent = report;
        out.style.display = "";
      };
    }
```

- [ ] **Step 5: 验证**

Run: `node --test tests/` 全量通过。
手动：启动面板，网络视图点「查端口 22」「检测 1.1.1.1」，系统视图点「生成报告」。

- [ ] **Step 6: 提交**

```bash
git add src/web/server.js src/web/static/app.js src/web/static/index.html
git commit -m "feat(web): 端口/连通性手动查询 + 一键报告"
```

---

## 收尾检查

- `node --test tests/` 全绿
- 重启面板 `kill $(pgrep -f "bin/fixflow.js web")` 后 `nohup node bin/fixflow.js web &`
- 浏览器验证：进程/SSL 菜单渲染、网络查询、设置页保存 sslSites 后 SSL 卡片出现数据
- `git push`
