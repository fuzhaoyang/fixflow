# 服务页扩展实现计划（操作/详情/日志/列表增强/告警）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把只读的服务列表升级为服务管理页：启停/重启/重载/开机自启操作（登录密码确认 + 危险服务保护）、unit 详情与依赖、内嵌日志、汇总与筛选、failed 服务告警。

**Architecture:** 复用现有零依赖模式——`collectSystemd` 增强 `systemctl show` 属性采集（服务/socket/timer + 依赖/重启/退出码），server.js 新增 `/api/systemd/op` 与 `/api/systemd/logs` 接口（登录密码校验、危险黑名单、`systemctl`/`journalctl` 执行），前端重构 `renderSystemd`（汇总卡/筛选/操作/展开详情/日志），failed 服务检测复用 `sslAlerts` webhook/smtp 通道。

**Tech Stack:** Node.js ≥18（`node:test`），零第三方依赖；前端原生 JS + 现有 `procMask` 密码弹窗 / `svc-table` / `seg-tab` 样式。

**Spec:** `docs/superpowers/specs/2026-10-09-systemd-page-design.md`

## Global Constraints

- 零第三方依赖；运行环境仅要求 Node ≥18
- 危险服务黑名单（前后端同一正则）：`/^(systemd|systemd-|dbus|NetworkManager|firewalld|networkd|resolved|journald|logind|udevd|sshd?|ssh|lightdm|gdm|sddm|display-manager|dde-|kwin|plymouth|getty|user@)/`
- 服务操作统一走登录密码验证（`verifyPassword` 对面板 auth）
- 输出走现有 `redactSecrets` 脱敏；操作记入 `system-ops.json`（`appendSysOp`）
- 每个任务结尾 `git commit`；**提交只 stage 本任务文件**（工作区可能有并发未提交改动，勿带入）

---

### Task 1: collectSystemd 数据采集增强

**Files:**
- Modify: `src/metrics.js`（`collectSystemd`）
- Test: `tests/metrics.test.js`

**Interfaces:**
- Produces: `collectSystemd(keywords)` 返回 `{ summary: { active, failed, inactive, total }, services: [...] }`；每条 service 新增 `unitType / desc / loadState / nRestarts / exitStatus / restartPolicy / requires[] / after[] / requiredBy[] / unitFileState`

- [ ] **Step 1: 写失败测试**

在 `tests/metrics.test.js` 末尾追加（import 无需新增，`collectSystemd` 已导入）：

```js
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
  assert.deepEqual(nginx.requires, ["basic", "system"]);
  assert.deepEqual(nginx.after, ["network", "systemd-journald"]);
  assert.deepEqual(nginx.requiredBy, []);
  assert.equal(nginx.unitFileState, "enabled");
  assert.equal(r.services.find((s) => s.name === "cron").unitType, "timer");
  assert.equal(r.services.find((s) => s.name === "ssh").unitType, "socket");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test --test-name-pattern "collectSystemd 解析属性" tests/metrics.test.js`
Expected: FAIL（`collectSystemd(keywords, opts)` 不支持注入 run / 新字段缺失）

注意：当前 `collectSystemd(keywords = [])` 只接收 keywords，需改为 `collectSystemd(keywords = [], { run = runCommand } = {})` 支持注入。

- [ ] **Step 3: 实现**

`src/metrics.js` 替换 `collectSystemd`（约 610-648 行）：

```js
export async function collectSystemd(keywords = [], { run = runCommand } = {}) {
  const kws = (keywords || []).map((k) => String(k).toLowerCase()).filter(Boolean);
  const [r, ps] = await Promise.all([
    run("systemctl show --type=service,socket,timer -p Id,ActiveState,SubState,Description,LoadState,NRestarts,ExecMainStatus,Restart,Requires,After,RequiredBy,UnitFileState,FragmentPath,ActiveEnterTimestamp,MainPID,MemoryCurrent --no-pager"),
    run("ps -eo pid,%cpu,%mem --no-headers"),
  ]);
  if (r.exitCode !== 0) return { error: r.stderr || "systemctl 不可用" };
  const psMap = new Map();
  for (const line of (ps.stdout || "").split("\n")) {
    const p = line.trim().split(/\s+/);
    if (p.length >= 3) psMap.set(p[0], { cpu: p[1], mem: p[2] });
  }
  const depList = (v) => String(v || "").split(/\s+/).map((s) => s.replace(/\.(service|socket|timer)$/, "")).filter(Boolean);
  const services = [];
  for (const block of r.stdout.split("\n\n")) {
    const kv = {};
    for (const line of block.split("\n")) {
      const i = line.indexOf("=");
      if (i > -1) kv[line.slice(0, i)] = line.slice(i + 1);
    }
    if (!kv.Id || !kv.ActiveState) continue;
    const name = kv.Id.replace(/\.(service|socket|timer)$/, "");
    const unitType = (kv.Id.match(/\.(\w+)$/) || [])[1] || "service";
    if (kws.length && !kws.some((k) => name.toLowerCase().startsWith(k))) continue;
    const proc = psMap.get(kv.MainPID);
    const t = (kv.ActiveEnterTimestamp || "").match(/^\S+\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
    services.push({
      name,
      unitType,
      state: kv.ActiveState,
      sub: kv.SubState,
      desc: kv.Description || "",
      loadState: kv.LoadState || "",
      nRestarts: parseInt(kv.NRestarts, 10) || 0,
      exitStatus: parseInt(kv.ExecMainStatus, 10) || 0,
      restartPolicy: kv.Restart || "",
      requires: depList(kv.Requires),
      after: depList(kv.After),
      requiredBy: depList(kv.RequiredBy),
      unitFileState: kv.UnitFileState || "",
      path: kv.FragmentPath || "—",
      cpu: proc ? proc.cpu : "—",
      mem: proc ? proc.mem : "—",
      memMb: formatMemMb(kv.MemoryCurrent),
      mainPid: kv.MainPID,
      started: t ? t[1] : (kv.ActiveEnterTimestamp || "—"),
    });
  }
  services.sort((a, b) => a.name.localeCompare(b.name));
  const summary = { active: 0, failed: 0, inactive: 0, total: services.length };
  for (const s of services) {
    if (s.state === "active") summary.active++;
    else if (s.state === "failed") summary.failed++;
    else summary.inactive++;
  }
  return { summary, services };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/metrics.test.js`
Expected: 全部 PASS（含新测试；现有 collectSystemd 测试若引用旧结构，同步更新）

若现有测试 `collectSystemd 返回 health 字段` 类断言依赖旧结构，按新结构修正断言。

- [ ] **Step 5: Commit**

```bash
git add src/metrics.js tests/metrics.test.js
git commit -m "feat(metrics): collectSystemd 增强属性/依赖/类型与 summary"
```

---

### Task 2: 服务操作 API

**Files:**
- Modify: `src/web/server.js`
- Test: `tests/web.test.js`

**Interfaces:**
- Consumes: `execCmd`（server.js 现有）、`verifyPassword`（已导入）、`appendSysOp`（Task 依赖，已存在）
- Produces: `POST /api/systemd/op { unit, action, password }` → `{ ok, stdout, stderr }`

- [ ] **Step 1: 写失败测试**

在 `tests/web.test.js` 末尾追加：

```js
test("服务操作接口：鉴权/危险保护/执行", async () => {
  const runCommand = async (cmd) => ({ exitCode: cmd.startsWith("systemctl restart nginx.service") ? 0 : 1, stdout: "", stderr: "" });
  const w = await makeServer({}, { runCommand });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };

  const bad = await fetch(`${base}/api/systemd/op`, { method: "POST", headers: H, body: JSON.stringify({ unit: "nginx", action: "restart", password: "wrong" }) });
  assert.equal(bad.status, 403);

  const danger = await fetch(`${base}/api/systemd/op`, { method: "POST", headers: H, body: JSON.stringify({ unit: "dbus", action: "restart", password: "Secret123!" }) });
  assert.equal(danger.status, 403);

  const ok = await fetch(`${base}/api/systemd/op`, { method: "POST", headers: H, body: JSON.stringify({ unit: "nginx", action: "restart", password: "Secret123!" }) });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).ok, true);
  w.close();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test --test-name-pattern "服务操作接口" tests/web.test.js`
Expected: FAIL（404）

- [ ] **Step 3: 实现**

`src/web/server.js`：
- 在 `appendSysOp` 之后新增：

```js
  const DANGEROUS_UNITS = /^(systemd|systemd-|dbus|NetworkManager|firewalld|networkd|resolved|journald|logind|udevd|sshd?|ssh|lightdm|gdm|sddm|display-manager|dde-|kwin|plymouth|getty|user@)/;
  const SYS_ACTIONS = ["start", "stop", "restart", "reload", "enable", "disable"];
  const sysUnitName = (u) => (u.includes(".") ? u : `${u}.service`);
```

- 在 `/api/system/ops` GET 分支（`sendJson(res, { ops: await readSysOps() });`）之后插入：

```js
      } else if (url.pathname === "/api/systemd/op" && req.method === "POST") {
        const body = await readBody(req);
        const { unit, action, password } = JSON.parse(body || "{}");
        const auth = await readAuth();
        if (!auth || !verifyPassword(password || "", auth)) { sendJson(res, { error: "密码错误，操作未执行" }, 403); return; }
        if (!SYS_ACTIONS.includes(action)) { sendJson(res, { error: "不支持的操作" }, 400); return; }
        const u = String(unit || "").trim();
        if (!/^[a-zA-Z0-9_.@-]+$/.test(u)) { sendJson(res, { error: "非法的服务名" }, 400); return; }
        if (DANGEROUS_UNITS.test(u.replace(/\.(service|socket|timer)$/, ""))) { sendJson(res, { error: "系统关键服务，禁止操作" }, 403); return; }
        const unitName = sysUnitName(u);
        const cmd = `systemctl ${action} ${unitName}`;
        const r = await execCmd(cmd, { timeout: 20000 });
        await appendSysOp({ op: `systemd:${action}`, target: unitName, cmd, ok: r.exitCode === 0 });
        sendJson(res, { ok: r.exitCode === 0, stdout: r.stdout, stderr: r.stderr });
      }
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test --test-name-pattern "服务操作接口" tests/web.test.js`
Expected: PASS；再跑 `node --test tests/web.test.js` 确认无回归

- [ ] **Step 5: Commit**

```bash
git add src/web/server.js tests/web.test.js
git commit -m "feat(web): 服务操作接口（启停/重启/重载/自启，危险保护）"
```

---

### Task 3: 服务日志 API

**Files:**
- Modify: `src/web/server.js`
- Test: `tests/web.test.js`

**Interfaces:**
- Produces: `POST /api/systemd/logs { unit, lines }` → `{ ok, content }`

- [ ] **Step 1: 写失败测试**

在 `tests/web.test.js` 末尾追加：

```js
test("服务日志接口", async () => {
  const runCommand = async (cmd) => cmd.startsWith("journalctl -u nginx.service")
    ? { exitCode: 0, stdout: "line1\nline2\n", stderr: "" }
    : { exitCode: 1, stdout: "", stderr: "" };
  const w = await makeServer({}, { runCommand });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const res = await fetch(`${base}/api/systemd/logs`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({ unit: "nginx", lines: 500 }) });
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.ok, true);
  assert.match(d.content, /line1/);
  w.close();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test --test-name-pattern "服务日志接口" tests/web.test.js`
Expected: FAIL（404）

- [ ] **Step 3: 实现**

在 Task 2 新增的 `/api/systemd/op` 分支之后插入：

```js
      } else if (url.pathname === "/api/systemd/logs" && req.method === "POST") {
        const body = await readBody(req);
        const { unit, lines } = JSON.parse(body || "{}");
        const u = String(unit || "").trim();
        if (!/^[a-zA-Z0-9_.@-]+$/.test(u)) { sendJson(res, { error: "非法的服务名" }, 400); return; }
        const n = Math.max(50, Math.min(parseInt(lines, 10) || 200, 2000));
        const r = await execCmd(`journalctl -u ${sysUnitName(u)} -n ${n} --no-pager -o cat`, { timeout: 20000 });
        sendJson(res, { ok: r.exitCode === 0, content: r.stdout });
      }
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test --test-name-pattern "服务日志接口" tests/web.test.js`
Expected: PASS；再跑 `node --test tests/web.test.js` 确认无回归

- [ ] **Step 5: Commit**

```bash
git add src/web/server.js tests/web.test.js
git commit -m "feat(web): 服务日志接口（journalctl）"
```

---

### Task 4: failed 服务告警检测

**Files:**
- Modify: `src/metrics.js`、`src/web/server.js`
- Test: `tests/metrics.test.js`、`tests/web.test.js`

**Interfaces:**
- Produces:
  - `parseFailedServices(stdout)` → `string[]`
  - `diffFailedServices(prev, now)` → `{ newFailures: string[], recoveries: string[] }`
  - server 内 `checkFailedServices()`（内部，60s 定时，首轮只建基线）

- [ ] **Step 1: 写失败测试**

`tests/metrics.test.js` 末尾追加（import 增加 `parseFailedServices, diffFailedServices`）：

```js
test("parseFailedServices / diffFailedServices", () => {
  const now = parseFailedServices("nginx.service loaded failed failed Failed with result 'exit-code'.\ncron.timer loaded failed failed Failed with result 'timeout'.\n");
  assert.deepEqual(now, ["nginx.service", "cron.timer"]);
  const d = diffFailedServices(["nginx.service", "old.service"], ["nginx.service", "cron.timer"]);
  assert.deepEqual(d.newFailures, ["cron.timer"]);
  assert.deepEqual(d.recoveries, ["old.service"]);
  assert.deepEqual(diffFailedServices(null, ["x"]).newFailures, ["x"]);
  assert.deepEqual(diffFailedServices(["x"], ["x"]).newFailures, []);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test --test-name-pattern "parseFailedServices" tests/metrics.test.js`
Expected: FAIL（未导出）

- [ ] **Step 3: 实现**

`src/metrics.js` 在 `testDbConnection` 之后新增：

```js
export function parseFailedServices(stdout) {
  return String(stdout || "").split("\n").map((l) => l.trim().split(/\s+/)[0]).filter(Boolean);
}

export function diffFailedServices(prev, now) {
  const p = new Set(prev || []);
  const n = new Set(now || []);
  return { newFailures: (now || []).filter((s) => !p.has(s)), recoveries: (prev || []).filter((s) => !n.has(s)) };
}
```

`src/web/server.js`：
- 顶部 metrics import 追加 `parseFailedServices, diffFailedServices`
- 在 `metricAlertTimer` 定义之后新增：

```js
  let lastFailedSet = null;
  const checkFailedServices = async () => {
    try {
      const r = await execCmd("systemctl --state=failed --no-legend --no-pager");
      const failed = parseFailedServices(r.stdout || "");
      if (lastFailedSet === null) { lastFailedSet = failed; return; }
      const { newFailures, recoveries } = diffFailedServices(lastFailedSet, failed);
      lastFailedSet = failed;
      const hook = config.sslAlerts.webhook || config.metricAlertWebhook;
      for (const s of newFailures) {
        await sendWebhook(hook, { kind: "service-failed", unit: s });
        await sendEmail(config.sslAlerts.smtp, `[Fixflow] 服务进入失败状态：${s}`, `服务 ${s} 已进入 failed 状态，请检查。`);
      }
      for (const s of recoveries) {
        await sendWebhook(hook, { kind: "service-recovered", unit: s });
        await sendEmail(config.sslAlerts.smtp, `[Fixflow] 服务已恢复：${s}`, `服务 ${s} 已恢复正常。`);
      }
    } catch {}
  };
  let failedTimer = null;
  if (!deps.noAlertsTimer && config.apiKey) failedTimer = setInterval(checkFailedServices, 60000);
```

- 在 `close()` 的 `clearInterval(metricAlertTimer);` 之后加 `clearInterval(failedTimer);`

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/metrics.test.js`（parse/diff PASS）；`node --test --test-name-pattern "数据库连接|服务操作|服务日志" tests/web.test.js`（无回归）

- [ ] **Step 5: Commit**

```bash
git add src/metrics.js tests/metrics.test.js src/web/server.js
git commit -m "feat(web): failed 服务告警检测（webhook+邮件，去重）"
```

---

### Task 5: i18n 文案

**Files:**
- Modify: `src/web/static/i18n.js`

- [ ] **Step 1: 加中英文案**

`I18N_ZH` 的 `"srv.svc": ...` 所在行附近追加：

```js
  "srv.summaryActive": "运行", "srv.summaryFailed": "失败", "srv.summaryInactive": "停止", "srv.sumTotal": "总数",
  "srv.filterAll": "全部", "srv.filterRunning": "运行", "srv.filterFailed": "失败", "srv.filterStopped": "停止",
  "srv.typeAll": "全部类型", "srv.typeService": "服务", "srv.typeSocket": "Socket", "srv.typeTimer": "定时器",
  "srv.opStart": "启动", "srv.opStop": "停止", "srv.opRestart": "重启", "srv.opReload": "重载", "srv.opEnable": "启用自启", "srv.opDisable": "禁用自启",
  "srv.dangerous": "系统关键", "srv.ops": "操作",
  "srv.desc": "描述", "srv.loadState": "加载状态", "srv.unitFileState": "单元文件", "srv.nRestarts": "重启次数", "srv.exitStatus": "退出码", "srv.restartPolicy": "重启策略",
  "srv.depsAfter": "After 依赖", "srv.depsRequires": "Requires 依赖", "srv.depsRequiredBy": "被依赖",
  "srv.logs": "查看日志", "srv.logsHint": "（加载日志）", "srv.logsLoading": "加载中…", "srv.logsEmpty": "（无日志内容）",
  "srv.opConfirm": "确认对服务 {unit} 执行「{op}」？此操作需输入登录密码验证。", "srv.opDone": "操作已执行",
```

`I18N_EN` 对应位置追加：

```js
  "srv.summaryActive": "Running", "srv.summaryFailed": "Failed", "srv.summaryInactive": "Stopped", "srv.sumTotal": "Total",
  "srv.filterAll": "All", "srv.filterRunning": "Running", "srv.filterFailed": "Failed", "srv.filterStopped": "Stopped",
  "srv.typeAll": "All types", "srv.typeService": "Service", "srv.typeSocket": "Socket", "srv.typeTimer": "Timer",
  "srv.opStart": "Start", "srv.opStop": "Stop", "srv.opRestart": "Restart", "srv.opReload": "Reload", "srv.opEnable": "Enable auto-start", "srv.opDisable": "Disable auto-start",
  "srv.dangerous": "Critical", "srv.ops": "Actions",
  "srv.desc": "Description", "srv.loadState": "Load state", "srv.unitFileState": "Unit file", "srv.nRestarts": "Restarts", "srv.exitStatus": "Exit status", "srv.restartPolicy": "Restart policy",
  "srv.depsAfter": "After", "srv.depsRequires": "Requires", "srv.depsRequiredBy": "Required by",
  "srv.logs": "View logs", "srv.logsHint": "(load logs)", "srv.logsLoading": "Loading…", "srv.logsEmpty": "(no log content)",
  "srv.opConfirm": "Run \"{op}\" on service {unit}? Login password required.", "srv.opDone": "Operation executed",
```

- [ ] **Step 2: 验证**

Run: `node --test tests/i18n.test.js`
Expected: PASS（zh/en 键集合一致）

- [ ] **Step 3: Commit**

```bash
git add src/web/static/i18n.js
git commit -m "feat(web): 服务页 i18n 文案"
```

---

### Task 6: 前端 renderSystemd 重构与交互

**Files:**
- Modify: `src/web/static/app.js`
- Test: `tests/web.test.js`

**Interfaces:**
- Consumes: `api/systemd/op`、`api/systemd/logs`（Task 2/3）、`procMask`、`setProcPwdLabel`、`t()/icon()/escapeHtml()`
- Produces: 全局 `sysStateFilter` / `sysTypeFilter` / `openSdRows`；`renderSystemd(m)` 新结构；`[data-sysop|data-systoggle|data-sysfilter-*|data-syslog]` 交互；proc-confirm kind `systemd-op`

- [ ] **Step 1: 加渲染与交互代码**

在 `renderSystemdSkeleton` 之前插入以下代码，并替换 `renderSystemd`（约 908-930 行）：

```js
let sysStateFilter = "all";
let sysTypeFilter = "all";
let openSdRows = new Set();
const SYS_DANGEROUS = /^(systemd|systemd-|dbus|NetworkManager|firewalld|networkd|resolved|journald|logind|udevd|sshd?|ssh|lightdm|gdm|sddm|display-manager|dde-|kwin|plymouth|getty|user@)/;

function renderSystemd(m) {
  if (!m?.services) return `<pre>${escapeHtml(m?.error || "N/A")}</pre>`;
  const services = m.services || [];
  const summary = m.summary || {};
  const q = (searchBox.value || "").trim().toLowerCase();
  const list = services.filter((s) =>
    (sysStateFilter === "all" || s.state === sysStateFilter) &&
    (sysTypeFilter === "all" || s.unitType === sysTypeFilter) &&
    (!q || s.name.toLowerCase().includes(q))
  );
  const summaryHtml = `<div class="sys-summary">
    <span class="ok">${t("srv.summaryActive")} <b>${summary.active ?? 0}</b></span>
    <span class="bad">${t("srv.summaryFailed")} <b>${summary.failed ?? 0}</b></span>
    <span class="na">${t("srv.summaryInactive")} <b>${summary.inactive ?? 0}</b></span>
    <span>${t("srv.sumTotal")} <b>${services.length}</b></span>
  </div>`;
  const tabs = [["all", t("srv.filterAll")], ["active", t("srv.filterRunning")], ["failed", t("srv.filterFailed")], ["inactive", t("srv.filterStopped")]]
    .map(([v, label]) => `<button class="seg-tab${sysStateFilter === v ? " active" : ""}" data-sysfilter-state="${v}">${label}</button>`).join("");
  const typeOpts = [["all", t("srv.typeAll")], ["service", t("srv.typeService")], ["socket", t("srv.typeSocket")], ["timer", t("srv.typeTimer")]]
    .map(([v, label]) => `<option value="${v}"${sysTypeFilter === v ? " selected" : ""}>${label}</option>`).join("");
  const filterHtml = `<div class="sys-filters"><div class="seg-tabs">${tabs}</div><select class="fw-mode" data-sysfilter-type>${typeOpts}</select></div>`;
  if (!list.length) return summaryHtml + filterHtml + `<pre>${escapeHtml(q ? t("srv.noMatchQ").replace("{q}", q) : t("srv.noMatchCfg"))}</pre>`;
  const svcPids = new Set(services.map((s) => String(s.mainPid)));
  const procs = ((m.userProcs && m.userProcs.procs) || []).filter((p) => !svcPids.has(String(p.pid)));
  const procRows = procs.map((p) => `<tr><td>${t("srv.proc")}</td><td>${escapeHtml(p.name)}</td><td class="ok">${t("srv.running")}</td><td>${escapeHtml(p.cpu ?? "—")}</td><td>${escapeHtml(p.mem ?? "—")}</td><td>—</td><td>${p.pid}</td><td>—</td><td>—</td></tr>`).join("");
  const rows = list.map((s) => {
    const cls = s.state === "active" ? "ok" : s.state === "failed" ? "bad" : "na";
    const dangerous = SYS_DANGEROUS.test(s.name);
    const ops = [];
    if (!dangerous) {
      if (s.state === "active") ops.push(opBtn(s, "stop"), opBtn(s, "restart"), opBtn(s, "reload"));
      else ops.push(opBtn(s, "start"));
      ops.push(opBtn(s, s.unitFileState === "enabled" ? "disable" : "enable"));
    }
    const opHtml = ops.length ? `<span class="proc-ops">${ops.join("")}</span>` : (dangerous ? `<span class="tag">${t("srv.dangerous")}</span>` : "—");
    const typeTag = s.unitType === "service" ? "" : `<span class="tag">${s.unitType}</span>`;
    const open = openSdRows.has(s.name);
    return `<tr class="sys-row${open ? " open" : ""}">
      <td>${typeTag || t("srv.svc")}</td>
      <td><a href="javascript:void(0)" data-systoggle="${escapeHtml(s.name)}">${escapeHtml(s.name)}</a>${dangerous ? ` <span class="tag na">${t("srv.dangerous")}</span>` : ""}</td>
      <td class="${cls}">${escapeHtml(s.sub || s.state)}</td>
      <td>${escapeHtml(s.cpu ?? "—")}</td><td>${escapeHtml(s.mem ?? "—")}</td><td>${escapeHtml(s.memMb ?? "—")}</td>
      <td>${escapeHtml(s.mainPid || "—")}</td><td>${escapeHtml(s.started)}</td>
      <td>${opHtml}</td>
    </tr>${open ? `<tr class="sys-detail-row"><td colspan="9">${renderSdDetail(s)}</td></tr>` : ""}`;
  }).join("");
  return summaryHtml + filterHtml + `<div class="card-body"><table class="svc-table"><thead><tr><th>${t("srv.type")}</th><th>${t("srv.name")}</th><th>${t("srv.state")}</th><th>${t("srv.cpu")}</th><th>${t("srv.mem")}</th><th>${t("srv.memMb")}</th><th>PID</th><th>${t("srv.started")}</th><th>${t("srv.ops")}</th></tr></thead><tbody>${rows}${procRows}</tbody></table></div>`;
}

function opBtn(s, action) {
  const label = { start: t("srv.opStart"), stop: t("srv.opStop"), restart: t("srv.opRestart"), reload: t("srv.opReload"), enable: t("srv.opEnable"), disable: t("srv.opDisable") }[action];
  return `<a href="javascript:void(0)" data-sysop="${action}" data-unit="${escapeHtml(s.name)}">${label}</a>`;
}

function renderSdDetail(s) {
  const dep = (label, arr) => `<div class="sys-sub">${label}：${(arr || []).length ? arr.map(escapeHtml).join(", ") : "—"}</div>`;
  return `<div class="sys-detail">
    <div class="sys-sub">${t("srv.desc")}：${escapeHtml(s.desc || "—")}</div>
    <div class="sys-sub">${t("srv.loadState")}：${escapeHtml(s.loadState || "—")} · ${t("srv.unitFileState")}：${escapeHtml(s.unitFileState || "—")}</div>
    <div class="sys-sub">${t("srv.nRestarts")}：${s.nRestarts ?? "—"} · ${t("srv.exitStatus")}：${s.exitStatus ?? "—"} · ${t("srv.restartPolicy")}：${escapeHtml(s.restartPolicy || "—")}</div>
    ${dep(t("srv.depsAfter"), s.after)}
    ${dep(t("srv.depsRequires"), s.requires)}
    ${dep(t("srv.depsRequiredBy"), s.requiredBy)}
    <div style="margin-top:6px"><select class="fw-mode" data-syslog-lines><option value="50">50</option><option value="200" selected>200</option><option value="500">500</option><option value="1000">1000</option></select> <a href="javascript:void(0)" data-syslog="${escapeHtml(s.name)}">${t("srv.logs")}</a></div>
    <pre class="sys-log" id="syslog-${escapeHtml(s.name)}" style="display:none">${t("srv.logsHint")}</pre>
  </div>`;
}

cards.addEventListener("click", (e) => {
  const stateBtn = e.target.closest("[data-sysfilter-state]");
  if (stateBtn) { sysStateFilter = stateBtn.dataset.sysfilterState; renderCards(); return; }
  const typeSel = e.target.closest("[data-sysfilter-type]");
  if (typeSel) { sysTypeFilter = typeSel.value; renderCards(); return; }
  const tg = e.target.closest("[data-systoggle]");
  if (tg) { const n = tg.dataset.systoggle; if (openSdRows.has(n)) openSdRows.delete(n); else openSdRows.add(n); renderCards(); return; }
  const lg = e.target.closest("[data-syslog]");
  if (lg) { loadSysLog(lg.dataset.syslog); return; }
  const op = e.target.closest("[data-sysop]");
  if (!op) return;
  const unit = op.dataset.unit, action = op.dataset.sysop;
  const label = { start: t("srv.opStart"), stop: t("srv.opStop"), restart: t("srv.opRestart"), reload: t("srv.opReload"), enable: t("srv.opEnable"), disable: t("srv.opDisable") }[action];
  procTarget = { kind: "systemd-op", unit, action };
  document.getElementById("proc-title").textContent = `${label} ${unit}`;
  document.getElementById("proc-text").textContent = t("srv.opConfirm").replace("{unit}", unit).replace("{op}", label);
  document.getElementById("proc-err").textContent = "";
  const pw = document.getElementById("proc-password");
  pw.value = "";
  setProcPwdLabel("proc");
  procMask.classList.add("show");
  setTimeout(() => pw.focus(), 50);
});

async function loadSysLog(unit) {
  const pre = document.getElementById(`syslog-${unit}`);
  if (!pre) return;
  const lines = pre.closest(".sys-detail")?.querySelector("[data-syslog-lines]")?.value || 200;
  pre.style.display = "";
  pre.textContent = t("srv.logsLoading");
  try {
    const res = await fetch("api/systemd/logs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unit, lines: Number(lines) }) });
    const d = await res.json();
    pre.textContent = d.content || (d.error || t("srv.logsEmpty"));
  } catch (err) { pre.textContent = String(err); }
}
```

- 扩展 proc-confirm handler：
  - 在 `const isDbTest = kind === "db-test";` 后加 `const isSdOp = kind === "systemd-op";`
  - endpoint 表达式（在 `isDbTest ? "api/db/test" :` 前）加 `isSdOp ? "api/systemd/op" : `
  - payload 表达式（`isDbTest ? { id: procTarget.id, password } :` 后）加 `isSdOp ? { unit: procTarget.unit, action: procTarget.action, password } : `
  - 成功分支（`if (isDbTest) ... else { refreshMetrics(); }` 之前）加 `if (isSdOp) showSaveMsg(t("srv.opDone"), "ok");`
- 菜单状态点：在 `renderCards` 底部 dot 更新处（`const ok = Array.isArray(m) ? ... : m?.ok;`）改为 systemd 按 summary.failed 标色：

```js
      const ok = key === "systemd" ? !(m?.summary?.failed) : Array.isArray(m) ? m.every((x) => x.ok) : m?.ok;
```

- [ ] **Step 2: 静态验证**

在 `tests/web.test.js` 末尾追加：

```js
test("服务页前端：renderSystemd 交互钩子存在", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const js = await (await fetch(`${base}/app.js`)).text();
  assert.match(js, /data-sysop/);
  assert.match(js, /data-systoggle/);
  assert.match(js, /data-sysfilter-state/);
  assert.match(js, /api\/systemd\/op/);
  assert.match(js, /api\/systemd\/logs/);
  assert.match(js, /SYS_DANGEROUS/);
  w.close();
});
```

- [ ] **Step 3: 运行验证**

Run: `node --check src/web/static/app.js`；`node --test --test-name-pattern "服务页前端|服务操作接口|服务日志接口" tests/web.test.js`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add src/web/static/app.js tests/web.test.js
git commit -m "feat(web): 服务页汇总/筛选/操作/详情/日志交互"
```

---

### Task 7: 服务页样式

**Files:**
- Modify: `src/web/static/app.css`

- [ ] **Step 1: 加样式**

在 `db-result .na` 规则之后追加：

```css
    /* 服务页 */
    .sys-summary { display: flex; gap: 16px; padding: 10px 14px; background: var(--panel2); border: 1px solid var(--border); border-radius: var(--r-md); font-size: 13px; margin-bottom: 10px; }
    .sys-summary .ok { color: var(--ok); }
    .sys-summary .bad { color: var(--bad); }
    .sys-summary .na { color: var(--muted); }
    .sys-filters { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .sys-filters .seg-tabs { border-bottom: none; }
    .sys-filters select { margin-left: auto; }
    .sys-row.open td { background: var(--panel2); }
    .sys-detail-row td { background: var(--panel); border-top: 1px solid var(--border); }
    .sys-detail { padding: 4px 8px 8px; font-size: 12px; line-height: 1.7; }
    .sys-detail .sys-sub { color: var(--muted); }
    .sys-log { max-height: 200px; overflow: auto; margin-top: 6px; }
```

- [ ] **Step 2: 验证**

Run: `node --test tests/web.test.js`（确认不回归）
Expected: 全部 PASS

- [ ] **Step 3: Commit**

```bash
git add src/web/static/app.css
git commit -m "feat(web): 服务页样式"
```

---

## 收尾

- 重启 fixflow 服务（systemd），验证面板服务页：汇总卡、筛选、服务操作按钮（危险服务禁用）、行展开详情、日志查看
- 运行 `npm test`，确认无新增回归（已知 root 依赖用例失败与本次无关）
- 全量 commit 后建议 push
