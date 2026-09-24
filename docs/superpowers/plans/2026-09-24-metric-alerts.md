# 指标阈值告警 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 按 superpowers:executing-plans 执行。

**Goal:** 指标阈值告警：定时采样 → 超阈持续触发/回落恢复 → 分级邮件/Webhook/面板红点 → 认领/升级 → 同主机聚合（含 AI 根因）。

**Architecture:** 新增 `src/metric-alerts.js`（采样/判定/事件/通知），`src/ssl.js` 扩展 `buildMime` 支持预渲染 HTML，`server.js` 挂载与接口，前端告警弹窗加「指标告警」tab。

**Spec:** `docs/superpowers/specs/2026-09-24-metric-alerts-design.md`

## Global Constraints
- 零依赖；`npm test`；事件状态存 `metric-incidents.json`；规则存 `config.metricAlerts`。
- 复用 `alertSmtp`（SMTP）、`sslAlerts.webhook`（Webhook）、`createSession`（AI 根因）。
- 阈值比较 `>=`/`<=`；持续时长以分钟计。

---

## 阶段一

### Task 1: 采样 + 规则/事件存储（src/metric-alerts.js 基础）

**Files:** Create `src/metric-alerts.js`; Create `tests/metric-alerts.test.js`

**Interfaces:**
- `METRICS`（5 类指标元数据）
- `sampleMetrics({ monitor, run })` → `{ cpu, mem, disk, net, sessions }`
- `createMetricAlerts({ config, configPath, monitor, exec, now, onNotify })` → `{ list, save, incidents, tick, ack, runRule }`

- [ ] **Step 1: 写失败测试** `tests/metric-alerts.test.js`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMetricAlerts, sampleMetrics, metricLabel } from "../src/metric-alerts.js";

const dir = () => mkdtempSync(join(tmpdir(), "ff-ma-"));

function fakeMonitor(values) {
  return { cpu: () => values.cpu, net: () => ({ samples: [{ up: { eth0: values.netBps / 2 }, down: { eth0: values.netBps / 2 } }] }) };
}

async function mk(cfgPath, values, nowRef) {
  const notified = [];
  const m = await createMetricAlerts({
    config: { baseUrl: "https://x", apiKey: "k", model: "m", metricAlerts: [], alertSmtp: { host: "h", from: "f@x.com" }, sslAlerts: { webhook: "" } },
    configPath: cfgPath,
    monitor: fakeMonitor(values),
    exec: async (cmd) => {
      if (cmd.includes("free")) return { exitCode: 0, stdout: "               total        used        free\nMem:           16000        9000        7000", stderr: "" };
      if (cmd.includes("df")) return { exitCode: 0, stdout: "Filesystem Size Used Avail Use% Mounted on\n/dev/sda1 100G 90G 10G 90% /", stderr: "" };
      if (cmd.includes("ss -s")) return { exitCode: 0, stdout: "Total: 500\nTCP:   1234 (estab 10, closed 5)", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    },
    now: () => new Date(nowRef.t),
    onNotify: (e) => notified.push(e),
  });
  m._notified = notified;
  return m;
}

test("metricLabel 名称", () => {
  assert.equal(metricLabel("cpu"), "CPU使用率");
  assert.equal(metricLabel("sessions"), "TCP会话数");
});

test("sampleMetrics 解析", async () => {
  const s = await sampleMetrics({ monitor: fakeMonitor({ cpu: 42, netBps: 1250000 }), run: async (cmd) => {
    if (cmd.includes("free")) return { stdout: "Mem: 16000 8000 8000 0 2000 6000" };
    if (cmd.includes("df")) return { stdout: "Filesystem Size Used Avail Use% Mounted on\n/dev/sda1 100G 90G 10G 90% /" };
    if (cmd.includes("ss -s")) return { stdout: "TCP:   1234 (estab 10)" };
    return { stdout: "" };
  } });
  assert.equal(s.cpu, 42);
  assert.equal(s.disk, 90);
  assert.equal(s.sessions, 1234);
  assert.ok(s.net > 0);
});

test("持续未达时长不触发，达到后触发一次", async () => {
  const cfgPath = join(dir(), "config.json");
  writeFileSync(cfgPath, JSON.stringify({ metricAlerts: [{ id: "m1", name: "CPU", metric: "cpu", op: ">=", threshold: 80, duration: 2, level: 1, recipients: ["a@x.com"], enabled: true }] }));
  const nowRef = { t: new Date("2026-09-24T10:00:00").getTime() };
  const m = await mk(cfgPath, { cpu: 95, netBps: 0 }, nowRef);
  nowRef.t += 60 * 1000; await m.tick();   // 第1分钟，未达 2 分钟
  assert.equal(m._notified.length, 0);
  nowRef.t += 60 * 1000; await m.tick();   // 第2分钟，达到
  assert.equal(m._notified.filter((e) => e.kind === "firing").length, 1);
  nowRef.t += 60 * 1000; await m.tick();   // 仍超阈，不重复触发
  assert.equal(m._notified.filter((e) => e.kind === "firing").length, 1);
});

test("回落触发恢复", async () => {
  const cfgPath = join(dir(), "config.json");
  writeFileSync(cfgPath, JSON.stringify({ metricAlerts: [{ id: "m1", name: "CPU", metric: "cpu", op: ">=", threshold: 80, duration: 1, level: 1, recipients: ["a@x.com"], enabled: true }] }));
  const nowRef = { t: new Date("2026-09-24T10:00:00").getTime() };
  const values = { cpu: 95, netBps: 0 };
  const m = await mk(cfgPath, values, nowRef);
  nowRef.t += 60 * 1000; await m.tick();
  assert.equal(m._notified.filter((e) => e.kind === "firing").length, 1);
  values.cpu = 30;
  nowRef.t += 60 * 1000; await m.tick();
  assert.equal(m._notified.filter((e) => e.kind === "recovery").length, 1);
});
```

- [ ] **Step 2: 运行确认失败** `node --test tests/metric-alerts.test.js` → FAIL

- [ ] **Step 3: 实现** `src/metric-alerts.js`（阶段一：采样 + 规则/事件存储 + 触发/恢复 + 调 `onNotify`；升级/聚合后续任务追加）：

```js
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { hostname } from "node:os";
import { parseDf, parseFree } from "./health.js";
import { runCommand } from "./tools.js";
import { dayKey } from "./usage.js";

export const METRICS = {
  cpu: { name: "CPU使用率", unit: "%" },
  mem: { name: "内存使用率", unit: "%" },
  disk: { name: "磁盘使用率", unit: "%" },
  net: { name: "网络流量", unit: "Mbps" },
  sessions: { name: "TCP会话数", unit: "个" },
};
export const metricLabel = (m) => METRICS[m]?.name || m;
export const LEVEL_NAME = { 1: "紧急", 2: "严重", 3: "重要", 4: "一般", 5: "提示" };

export async function sampleMetrics({ monitor, run = runCommand } = {}) {
  const out = { cpu: null, mem: null, disk: null, net: null, sessions: null };
  try { out.cpu = monitor?.cpu?.() ?? null; } catch {}
  const [free, df, ss] = await Promise.all([run("free -m"), run("df -h /"), run("ss -s 2>/dev/null")]);
  try { out.mem = parseFree(free.stdout || "").usedPct; } catch {}
  try { out.disk = parseDf(df.stdout || "").find((d) => d.mount === "/")?.usedPct ?? null; } catch {}
  try {
    const s = monitor?.net?.().samples || [];
    const last = s[s.length - 1];
    if (last) {
      let bps = 0;
      for (const v of Object.values(last.up || {})) bps += v;
      for (const v of Object.values(last.down || {})) bps += v;
      out.net = Math.round((bps * 8) / 1e6 * 100) / 100;
    }
  } catch {}
  const m = (ss.stdout || "").match(/TCP:\s*(\d+)/);
  out.sessions = m ? Number(m[1]) : null;
  return out;
}

export async function createMetricAlerts({ config, configPath, monitor, exec = runCommand, now = () => new Date(), onNotify = () => {} } = {}) {
  const statePath = join(dirname(configPath), "metric-incidents.json");
  const readCfg = async () => { try { return JSON.parse(await readFile(configPath, "utf8")); } catch { return {}; } };
  const writeCfg = async (patch) => { const e = await readCfg(); await writeFile(configPath, JSON.stringify({ ...e, ...patch }, null, 2)); };
  let state = { seq: 0, day: dayKey(now()), incidents: [] };
  try { state = { ...state, ...JSON.parse(await readFile(statePath, "utf8")) }; } catch {}
  const persist = async () => { await mkdir(dirname(statePath), { recursive: true }); await writeFile(statePath, JSON.stringify(state, null, 2)).catch(() => {}); };

  const list = async () => (await readCfg()).metricAlerts || [];
  const save = async (rules) => writeCfg({ metricAlerts: rules });
  const activeOf = (ruleId) => state.incidents.find((x) => x.ruleId === ruleId && x.state !== "resolved");
  const nextId = () => { const d = dayKey(now()); if (state.day !== d) { state.day = d; state.seq = 0; } state.seq += 1; return `EVT-${d.replace(/-/g, "")}-${String(state.seq).padStart(3, "0")}`; };

  const hit = (rule, v) => v != null && (rule.op === "<=" ? v <= rule.threshold : v >= rule.threshold);

  async function tick() {
    const rules = await list();
    const values = await sampleMetrics({ monitor, run: exec });
    const t = now().getTime();
    for (const r of rules) {
      if (!r.enabled) continue;
      const v = values[r.metric];
      const inc = activeOf(r.id);
      if (hit(r, v)) {
        if (!inc) {
          const startedAt = r._breachSince ?? (r._breachSince = t);   // 内存态，见实现说明
          if (t - startedAt >= (r.duration || 0) * 60000) {
            const event = { id: nextId(), ruleId: r.id, level: r.level || 3, state: "firing", startedAt, peak: v, lastValue: v, samples: 1, ackedAt: 0, escalatedAt: 0, recoveredAt: 0 };
            state.incidents.unshift(event);
            if (state.incidents.length > 200) state.incidents.length = 200;
            await persist();
            onNotify({ kind: "firing", rule: r, incident: event, value: v, host: hostname() });
          }
        } else {
          inc.lastValue = v; inc.samples++; inc.peak = r.op === "<=" ? Math.min(inc.peak, v) : Math.max(inc.peak, v);
          await persist();
        }
      } else {
        r._breachSince = 0;
        if (inc) { inc.state = "resolved"; inc.recoveredAt = t; await persist(); onNotify({ kind: "recovery", rule: r, incident: inc, value: v, host: hostname() }); }
      }
    }
  }

  return { list, save, incidents: () => state.incidents, tick, runRule: async () => tick() };
}
```

实现说明：`breachSince` 用规则对象上的内存字段 `_breachSince`（不落盘，重启后重新累计）。若需跨重启保持，改用独立 Map（本任务用内存即可）。

- [ ] **Step 4: 运行确认通过** `node --test tests/metric-alerts.test.js` → PASS

- [ ] **Step 5: 提交** `git add src/metric-alerts.js tests/metric-alerts.test.js && git commit -m "feat(metric-alerts): 指标采样与触发/恢复判定"`

---

### Task 2: 邮件渲染（主题 + HTML 正文）

**Files:** Modify `src/ssl.js`（`buildMime` 支持 `{ html }`）; Modify `src/metric-alerts.js`（`buildAlertEmail`）; Test `tests/metric-alert-mail.test.js`

**Interfaces:** `buildAlertEmail(kind, { rule, incident, value, host, panelBaseUrl, now })` → `{ subject, html }`

- [ ] **Step 1: 写失败测试**：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildAlertEmail } from "../src/metric-alerts.js";

const rule = { name: "CPU 高负载", metric: "cpu", op: ">=", threshold: 80, duration: 5, level: 1, recipients: ["a@x.com"], owner: "张三", runbookUrl: "https://rb" };
const inc = { id: "EVT-20260924-001", startedAt: Date.parse("2026-09-24T14:30:00Z"), peak: 98.5, recoveredAt: Date.parse("2026-09-24T14:45:00Z") };

test("触发主题格式", () => {
  const { subject } = buildAlertEmail("firing", { rule, incident: inc, value: 92.3, host: "prod-01", now: new Date("2026-09-24T14:35:00Z") });
  assert.equal(subject, "[P1-紧急] prod-01 CPU使用率告警 - 92.3%（持续5分钟）");
});

test("恢复主题与补充字段", () => {
  const { subject, html } = buildAlertEmail("recovery", { rule, incident: inc, value: 30, host: "prod-01" });
  assert.match(subject, /^\[恢复\] prod-01 CPU使用率已恢复/);
  assert.match(html, /恢复时间/);
  assert.match(html, /持续时长/);
  assert.match(html, /峰值/);
});

test("升级主题", () => {
  const { subject } = buildAlertEmail("escalation", { rule, incident: { ...inc, level: 1 }, value: 92, host: "prod-01", escalatedLevel: 1, now: new Date("2026-09-24T15:00:00Z") });
  assert.match(subject, /^\[升级-P1\] prod-01 CPU使用率告警未处理/);
});

test("正文含三层与关键字段", () => {
  const { html } = buildAlertEmail("firing", { rule, incident: inc, value: 92.3, host: "prod-01", panelBaseUrl: "https://ops.x", now: new Date("2026-09-24T14:35:00Z") });
  assert.match(html, /EVT-20260924-001/);
  assert.match(html, /张三/);
  assert.match(html, /Runbook|立即处理/);
});
```

- [ ] **Step 2: 运行确认失败** → FAIL

- [ ] **Step 3: 实现**

`src/ssl.js`：`buildMime(smtp, subject, body, opts = {})`，`opts.html` 存在时 HTML 部分用 `opts.html`，纯文本用 `opts.text ?? body`。

`src/metric-alerts.js` 增加：

```js
const LEVEL_TIME = { 1: "≤15 分钟", 2: "≤30 分钟", 3: "≤60 分钟", 4: "≤4 小时", 5: "≤24 小时" };
const fmt = (t) => new Date(t).toISOString().replace("T", " ").slice(0, 19);
const dur = (ms) => `${Math.max(1, Math.round(ms / 60000))} 分钟`;

export function buildAlertEmail(kind, { rule, incident, value, host, panelBaseUrl = "", now = () => new Date() }) {
  const metric = metricLabel(rule.metric);
  const unit = METRICS[rule.metric]?.unit || "";
  const lvl = incident.level || rule.level || 3;
  const lvlName = LEVEL_NAME[lvl];
  const val = `${value}${unit}`;
  if (kind === "firing") {
    return { subject: `[P${lvl}-${lvlName}] ${host} ${metric}告警 - ${val}（持续${rule.duration}分钟）`, html: alertHtml({ kind, rule, incident, host, lvl, lvlName, metric, unit, val, panelBaseUrl }) };
  }
  if (kind === "recovery") {
    return { subject: `[恢复] ${host} ${metric}已恢复 - ${fmt(incident.recoveredAt)}`, html: alertHtml({ kind, rule, incident, host, lvl, lvlName, metric, unit, val, panelBaseUrl }) };
  }
  const nl = incident.escalatedLevel || Math.max(1, lvl - 1);
  return { subject: `[升级-P${nl}] ${host} ${metric}告警未处理 - 已持续${dur(Date.now() - incident.startedAt)}`, html: alertHtml({ kind: "escalation", rule, incident, host, lvl: nl, lvlName: LEVEL_NAME[nl], metric, unit, val, panelBaseUrl }) };
}

function alertHtml({ kind, rule, incident, host, lvl, lvlName, metric, unit, val, panelBaseUrl }) {
  // 三层 HTML：行动召唤 / 诊断决策(字段表) / 调查上下文 + 底部按钮
  // 具体结构见 spec 4.2；字段缺失（标签/负责人/链接）不渲染对应行
  ...
}
```

（`alertHtml` 按 spec 4.2/4.3/4.4 组装；恢复邮件追加恢复时间/持续时长/峰值；升级邮件追加升级原因/新负责人。）

- [ ] **Step 4: 运行确认通过** → PASS

- [ ] **Step 5: 提交** `git add src/ssl.js src/metric-alerts.js tests/metric-alert-mail.test.js && git commit -m "feat(metric-alerts): 分级邮件模板与 HTML 正文"`

---

### Task 3: server.js 挂载与接口 + 通知接线

**Files:** Modify `src/web/server.js`; Test `tests/web.test.js`

- [ ] **Step 1: 写失败测试**（追加）：

```js
test("/api/metric-alerts 增删改查与鉴权", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  assert.equal((await fetch(`${base}/api/metric-alerts`)).status, 401);
  const cookie = await registerAndLogin(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  const add = await fetch(`${base}/api/metric-alerts`, { method: "POST", headers: H, body: JSON.stringify({ name: "CPU", metric: "cpu", op: ">=", threshold: 80, duration: 5, level: 1, recipients: ["a@x.com"] }) });
  assert.equal(add.status, 200);
  const { rule } = await add.json();
  const bad = await fetch(`${base}/api/metric-alerts`, { method: "POST", headers: H, body: JSON.stringify({ name: "", metric: "x" }) });
  assert.equal(bad.status, 400);
  const patch = await fetch(`${base}/api/metric-alerts`, { method: "PATCH", headers: H, body: JSON.stringify({ id: rule.id, enabled: false }) });
  assert.equal(patch.status, 200);
  const list = await (await fetch(`${base}/api/metric-alerts`, { headers: { Cookie: cookie } })).json();
  assert.equal(list.rules[0].enabled, false);
  const del = await fetch(`${base}/api/metric-alerts`, { method: "DELETE", headers: H, body: JSON.stringify({ id: rule.id }) });
  assert.equal(del.status, 200);
  w.close();
});
```

- [ ] **Step 2: 运行确认失败** → FAIL

- [ ] **Step 3: 实现** `server.js`：

- import `createMetricAlerts, buildAlertEmail, sampleMetrics`
- `startWeb` 内（`monitor` 之后）创建实例，`onNotify` 里：`const { subject, html } = buildAlertEmail(kind, {...})` → `sendEmail({...config.alertSmtp, to: rule.recipients.join(",")}, subject, "", { html })`；Webhook `sendWebhook(config.metricAlertWebhook || config.sslAlerts?.webhook, payload)`
- 定时：`if (!deps.noAlertsTimer && config.apiKey) setInterval(() => ma.tick(), 60000)`（与告警 timer 一起在 close 清理）
- 接口：`GET/POST/PATCH/DELETE /api/metric-alerts`、`POST /api/metric-alerts/ack`、`POST /api/metric-alerts/run`、`POST /api/metric-alerts/settings`（`panelBaseUrl`/`metricAlertWebhook`）

- [ ] **Step 4: 运行确认通过** → PASS

- [ ] **Step 5: 提交** `git commit -m "feat(web): 指标告警接口与调度接线"`

---

### Task 4: 前端「指标告警」管理

**Files:** Modify `index.html`; Modify `app.js`; Test `tests/web.test.js`

- [ ] Step 1：`index.html` 告警弹窗加二级 tab「日报告警 / 指标告警」；指标告警区含规则列表（分页 10）+ 规则表单 + 事件列表（分页 10，含「认领」）；铃铛红点纳入指标事件。
- [ ] Step 2：`app.js` 加 `refreshMetricAlerts()`/`renderMaRules()`/`renderMaIncidents()`/`saveMaRule()`/`maAck()`，复用 `renderPager`、`showLoading`。
- [ ] Step 3：`node --check` + `node --test tests/web.test.js`（含新元素 id 断言）。
- [ ] Step 4：提交。

---

## 阶段二：认领 + 升级

### Task 5: 升级判定 + 认领接口

- [ ] `metric-alerts.js`：`tick` 中 firing 事件未认领且 `now - startedAt >= escalateAfter`（默认 30）且未升级过 → 升级（level-1，最低 1）→ `onNotify({kind:"escalation"})`
- [ ] `ack(id)`：事件 state=ack、`ackedAt`；接口 `POST /api/metric-alerts/ack`
- [ ] 测试：升级一次且最高 P1；ack 后不再升级
- [ ] 提交

---

## 阶段三：聚合 + AI 根因

### Task 6: 聚合缓冲 + AI 根因

- [ ] `metric-alerts.js`：触发事件进聚合缓冲（按 host）；debounce 30s 到期取该 host 近 5 分钟事件，≥2 → `onNotify({kind:"aggregate", events:[...]})`，否则单发
- [ ] `buildAlertEmail("aggregate", {...})`：汇总 + 表格 + AI 根因（注入 `sessionFactory` 跑分析指令）+ 优先级建议
- [ ] 测试：≥2 聚合、单条单发、AI 失败降级
- [ ] 提交

## Self-Review
- Spec 覆盖：采样/判定/触发恢复 → T1；邮件 → T2；接口 → T3；前端 → T4；认领升级 → T5；聚合 AI → T6。
- 类型一致：规则 `{id,name,metric,op,threshold,duration,level,recipients,enabled,...}`；事件 `{id,ruleId,level,state,startedAt,peak,...}`；`buildAlertEmail(kind, ctx)` 一致。
