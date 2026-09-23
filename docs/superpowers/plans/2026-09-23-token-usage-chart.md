# Token 用量图表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 采集所有 LLM 调用的 token 用量并按天聚合，在总览页以堆叠柱(输入+输出)+折线(总量)展示近 30 天。

**Architecture:** 新增 `src/usage.js`（内存 Map + `usage.json` 落盘），`agent.js` 解析 usage，`core.js` 通过 `onUsage` 上报，`server.js` 注入 store 并暴露 `/api/usage`、在 `/api/overview` 附 usage；前端流量/IO 图表卡加第三个 tab。

**Tech Stack:** Node.js ESM、原生 http、浏览器原生 JS、echarts（已在用）。

**Spec:** `docs/superpowers/specs/2026-09-23-token-usage-chart-design.md`

## Global Constraints

- 零第三方依赖；测试命令 `npm test`（`node --test tests/`）。
- `usage.json` 存于 config 目录，键为本地时区 `YYYY-MM-DD`。
- 流式响应无 usage 帧的调用不计（显示 0）。
- 注释仅中文，不加多余注释。

---

### Task 1: src/usage.js 用量存储

**Files:**
- Create: `src/usage.js`
- Test: `tests/usage.test.js`

**Interfaces:**
- Produces: `createUsageStore({ filePath })` → `{ record({promptTokens, completionTokens}), daily(days=30) }`

- [ ] **Step 1: 写失败测试**

创建 `tests/usage.test.js`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUsageStore, dayKey } from "../src/usage.js";

function tmpFile() { return join(mkdtempSync(join(tmpdir(), "ff-usage-")), "usage.json"); }

test("record 累加同一天多次", async () => {
  const s = await createUsageStore({ filePath: tmpFile() });
  await s.record({ promptTokens: 10, completionTokens: 5 });
  await s.record({ promptTokens: 20, completionTokens: 15 });
  const d = s.daily(1);
  assert.equal(d.length, 1);
  assert.equal(d[0].prompt, 30);
  assert.equal(d[0].completion, 20);
  assert.equal(d[0].total, 50);
  assert.equal(d[0].date, dayKey());
});

test("daily 补零并含今日", async () => {
  const s = await createUsageStore({ filePath: tmpFile() });
  await s.record({ promptTokens: 100, completionTokens: 0 });
  const d = s.daily(7);
  assert.equal(d.length, 7);
  assert.equal(d[d.length - 1].total, 100);
  assert.equal(d[0].total, 0);
});

test("90 天前的数据被清理", async () => {
  const file = tmpFile();
  writeFileSync(file, JSON.stringify({ "2020-01-01": { prompt: 1, completion: 1 } }));
  const s = await createUsageStore({ filePath: file });
  const d = s.daily(1);
  assert.ok(!d.some((x) => x.date === "2020-01-01"));
});

test("record 后落盘，重启后仍在", async () => {
  const file = tmpFile();
  const s1 = await createUsageStore({ filePath: file });
  await s1.record({ promptTokens: 42, completionTokens: 8 });
  const s2 = await createUsageStore({ filePath: file });
  const d = s2.daily(1);
  assert.equal(d[0].prompt, 42);
  assert.equal(d[0].completion, 8);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/usage.test.js`
Expected: FAIL（`Cannot find module '../src/usage.js'`）

- [ ] **Step 3: 实现**

创建 `src/usage.js`：

```js
import { readFile, writeFile } from "node:fs/promises";

export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function prune(data) {
  const cutoff = dayKey(new Date(Date.now() - 90 * 86400000));
  for (const k of Object.keys(data)) if (k < cutoff) delete data[k];
}

export async function createUsageStore({ filePath } = {}) {
  let data = {};
  if (filePath) {
    try { data = JSON.parse(await readFile(filePath, "utf8")); } catch {}
    prune(data);
  }
  const persist = async () => {
    if (!filePath) return;
    prune(data);
    await writeFile(filePath, JSON.stringify(data, null, 2)).catch(() => {});
  };
  return {
    async record({ promptTokens = 0, completionTokens = 0 } = {}) {
      const key = dayKey();
      const cur = data[key] || { prompt: 0, completion: 0 };
      cur.prompt += promptTokens;
      cur.completion += completionTokens;
      data[key] = cur;
      await persist();
    },
    daily(days = 30) {
      prune(data);
      const out = [];
      const today = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const key = dayKey(d);
        const e = data[key];
        out.push({ date: key, prompt: e?.prompt || 0, completion: e?.completion || 0, total: (e?.prompt || 0) + (e?.completion || 0) });
      }
      return out;
    },
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/usage.test.js`
Expected: PASS（4 条）

- [ ] **Step 5: 提交**

```bash
git add src/usage.js tests/usage.test.js
git commit -m "feat(usage): 每日 token 用量存储与聚合"
```

---

### Task 2: agent.js 解析 usage

**Files:**
- Modify: `src/agent.js`
- Test: `tests/agent.test.js`

**Interfaces:**
- Produces: `chat()` 返回值加 `usage?: { promptTokens, completionTokens }`；`streamChat()` 末尾 yield 对象加 `usage?: { promptTokens, completionTokens }`

- [ ] **Step 1: 写失败测试**

在 `tests/agent.test.js` 末尾追加：

```js
test("chat 解析 usage", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 12, completion_tokens: 34 } }) });
  const r = await chat({ apiKey: "k", baseUrl: "https://x/v1", model: "m", messages: [], tools: [] });
  assert.deepEqual(r.usage, { promptTokens: 12, completionTokens: 34 });
  globalThis.fetch = orig;
});

test("streamChat 流末 usage 帧被返回", async () => {
  const orig = globalThis.fetch;
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode("data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\n"));
      c.enqueue(enc.encode("data: {\"choices\":[{\"delta\":{}}],\"usage\":{\"prompt_tokens\":7,\"completion_tokens\":9}}\n\n"));
      c.enqueue(enc.encode("data: [DONE]\n\n"));
      c.close();
    },
  });
  globalThis.fetch = async () => ({ ok: true, body });
  let text = "";
  let usage = null;
  for await (const chunk of streamChat({ apiKey: "k", baseUrl: "https://x/v1", model: "m", messages: [], tools: [] })) {
    if (chunk.delta) text += chunk.delta;
    if (chunk.usage) usage = chunk.usage;
  }
  assert.equal(text, "hi");
  assert.deepEqual(usage, { promptTokens: 7, completionTokens: 9 });
  globalThis.fetch = orig;
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/agent.test.js`
Expected: FAIL（`r.usage` undefined）

- [ ] **Step 3: 实现**

在 `src/agent.js`：

`chat()` 的 return 改为：

```js
  const usage = data.usage ? { promptTokens: data.usage.prompt_tokens || 0, completionTokens: data.usage.completion_tokens || 0 } : undefined;
  return { text: msg.content || "", toolCalls, usage };
```

`streamChat()` 循环内（解析 json 后）加 usage 捕获：

```js
      if (json.usage) usage = json.usage;
```

函数顶部声明 `let usage;`（`const toolCalls = [];` 旁），末尾 yield 改为：

```js
  yield { toolCalls: toolCalls.map((tc) => ({ id: tc.id, name: tc.name, args: JSON.parse(tc.args || "{}") })), usage: usage ? { promptTokens: usage.prompt_tokens || 0, completionTokens: usage.completion_tokens || 0 } : undefined };
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/agent.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/agent.js tests/agent.test.js
git commit -m "feat(agent): 解析 LLM 响应 usage"
```

---

### Task 3: core.js onUsage 上报

**Files:**
- Modify: `src/core.js`

**Interfaces:**
- Consumes: `chat`/`streamChat` 返回的 `usage`
- Produces: `createSession` 新增参数 `onUsage(usage)`，`doSend` 每次 LLM 调用后调用 `onUsage(usage)`

- [ ] **Step 1: 修改 `createSession`**

```js
export function createSession({ config, onConfirm = async () => false, onEvent, onUsage = () => {}, llmChat = streamChat }) {
```

`doSend` 中，`llmChat` 返回后收集并上报。在流式 `for await` 内加：

```js
        if (chunk.usage) usage = chunk.usage;
```

非流式分支（`text = result?.text` 处）加 `usage = result?.usage;`。循环内 `const result = await llmChat({...});` 之后声明 `let usage;`。

在 `history.push(assistantMsg);` 之前插入：

```js
      if (usage) onUsage(usage);
```

- [ ] **Step 2: 验证**

Run: `npm test`
Expected: 无新增失败（现有 core 测试全过）

- [ ] **Step 3: 提交**

```bash
git add src/core.js
git commit -m "feat(core): LLM 用量经 onUsage 回调上报"
```

---

### Task 4: server.js 接入 store 与接口

**Files:**
- Modify: `src/web/server.js`
- Test: `tests/web.test.js`

**Interfaces:**
- Consumes: `createUsageStore`、`onUsage`
- Produces: `GET /api/usage?days=N` → `{ days }`；`/api/overview` 附 `usage`

- [ ] **Step 1: 写失败测试**

在 `tests/web.test.js` 末尾追加：

```js
test("/api/usage 未登录返回 401，登录后返回 days 数组", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const noauth = await fetch(`${base}/api/usage`);
  assert.equal(noauth.status, 401);
  const cookie = await registerAndLogin(base);
  const res = await fetch(`${base}/api/usage?days=7`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.days));
  assert.equal(data.days.length, 7);
  assert.ok("total" in data.days[0]);
  w.close();
});

test("/api/overview 返回 usage 数组", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const res = await fetch(`${base}/api/overview`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.usage));
  w.close();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/web.test.js`
Expected: FAIL（`/api/usage` 404）

- [ ] **Step 3: 实现**

`src/web/server.js`：

import 区加 `import { createUsageStore } from "../usage.js";`。

`startWeb` 中、`const session = createSession({...})` 之前：

```js
  const usageStore = await createUsageStore({ filePath: join(dirname(configPath), "usage.json") });
```

`createSession({ config, onEvent: broadcast, onConfirm: ..., })` 加参数：

```js
    onUsage: (u) => usageStore.record(u),
```

`/api/overview` 分支的响应对象加 `usage: usageStore.daily(30),`。

路由链（`/api/overview` 之后）加：

```js
      } else if (url.pathname === "/api/usage" && req.method === "GET") {
        const days = parseInt(url.searchParams.get("days") || "30", 10);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ days: usageStore.daily(Number.isFinite(days) ? days : 30) }));
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/web.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/web/server.js tests/web.test.js
git commit -m "feat(web): token 用量接口与 overview 附带"
```

---

### Task 5: 前端 index.html 增加 tab 与容器

**Files:**
- Modify: `src/web/static/index.html`
- Test: `tests/web.test.js`

**Interfaces:**
- Produces DOM：`#tab-token`、`#token-chart`、`#token-kpi`、`#token-today`、`#token-total30`

- [ ] **Step 1: 写失败测试**

在 `tests/web.test.js` 末尾追加：

```js
test("首页包含 Token 用量 tab 与容器", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const body = await (await fetch(`${base}/`)).text();
  for (const id of ["tab-token", "token-chart", "token-kpi", "token-today", "token-total30"]) {
    assert.match(body, new RegExp(`id="${id}"`), `缺少 ${id}`);
  }
  w.close();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/web.test.js`
Expected: FAIL（缺少 `id="tab-token"`）

- [ ] **Step 3: 实现**

`index.html` 流量卡：

```html
              <button class="seg-tab active" id="tab-traffic">流量</button>
              <button class="seg-tab" id="tab-io">磁盘IO</button>
              <button class="seg-tab" id="tab-token">Token 用量</button>
```

`kpi-row` 之后加 token 汇总行：

```html
          <div class="kpi-row" id="token-kpi" style="display:none">
            <div class="kpi"><span class="key">今日 token</span><span class="val" id="token-today">--</span></div>
            <div class="kpi"><span class="key">近30天 token</span><span class="val" id="token-total30">--</span></div>
          </div>
```

`chart-wrap` 内 `io-chart` 之后加：

```html
            <div id="token-chart" style="width:100%;height:100%;display:none"></div>
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/web.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/web/static/index.html tests/web.test.js
git commit -m "feat(web): 总览 Token 用量 tab 与容器"
```

---

### Task 6: 前端 app.js Token 图表渲染

**Files:**
- Modify: `src/web/static/app.js`

**Interfaces:**
- Consumes: `/api/overview` 的 `usage`
- Produces: `tokenChart`、`switchTrafficTab("token")`、`tokenChartOption(days)`、`fmtNum(n)`

- [ ] **Step 1: 实现（无前端自动化测试，改后语法检查+手动验证）**

`app.js`：

1. 顶部 `let ioChart = null;` 旁加 `let tokenChart = null;`。
2. `initOverview()` 中 `ioChart = echarts.init(...)` 后加：

```js
  tokenChart = echarts.init(document.getElementById("token-chart"));
```

3. `switchTrafficTab` 加 `document.getElementById("tab-token").onclick = () => switchTrafficTab("token");`（在 tab-io 监听旁）。`switchTrafficTab` 函数体重写：

```js
function switchTrafficTab(mode) {
  trafficTab = mode;
  document.getElementById("tab-traffic").classList.toggle("active", mode === "traffic");
  document.getElementById("tab-io").classList.toggle("active", mode === "io");
  document.getElementById("tab-token").classList.toggle("active", mode === "token");
  const isTraffic = mode === "traffic";
  const isToken = mode === "token";
  document.getElementById("traffic-chart").style.display = isTraffic ? "" : "none";
  document.getElementById("io-chart").style.display = mode === "io" ? "" : "none";
  document.getElementById("token-chart").style.display = isToken ? "" : "none";
  document.getElementById("nic-select").style.display = isTraffic ? "" : "none";
  document.getElementById("kpi-row").style.display = mode === "io" ? "" : "none";
  document.getElementById("token-kpi").style.display = isToken ? "" : "none";
  if (isToken) {
    document.getElementById("token-today").textContent = "--";
    document.getElementById("token-total30").textContent = "--";
  } else if (isTraffic) {
    document.getElementById("kpi-up-key").innerHTML = '<span class="dot up"></span>上行';
    document.getElementById("kpi-down-key").innerHTML = '<span class="dot down"></span>下行';
    document.getElementById("kpi-tx-key").textContent = "总发送";
    document.getElementById("kpi-rx-key").textContent = "总接收";
    const dots = document.querySelectorAll("#kpi-row .dot");
    dots[0].style.background = "#f97316";
    dots[1].style.background = "#3b82f6";
  } else {
    document.getElementById("kpi-up-key").innerHTML = '<span class="dot" style="background:#ec4899"></span>读取';
    document.getElementById("kpi-down-key").innerHTML = '<span class="dot" style="background:#06b6d4"></span>写入';
    document.getElementById("kpi-tx-key").textContent = "每秒读写 (IOPS)";
    document.getElementById("kpi-rx-key").textContent = "IO 延迟";
    const dots = document.querySelectorAll("#kpi-row .dot");
    dots[0].style.background = "#ec4899";
    dots[1].style.background = "#06b6d4";
  }
  const chart = isTraffic ? trafficChart : isToken ? tokenChart : ioChart;
  setTimeout(() => chart?.resize(), 0);
  renderChart();
}
```

4. 新增 `fmtNum` 与 `tokenChartOption`：

```js
function fmtNum(n) {
  if (!Number.isFinite(n)) return "--";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function tokenChartOption(days) {
  return {
    tooltip: { trigger: "axis" },
    legend: { data: ["输入 prompt", "输出 completion", "总 token"], textStyle: { color: "#94a3b8" }, top: 0 },
    grid: { left: 56, right: 20, top: 36, bottom: 28 },
    xAxis: { type: "category", data: days.map((d) => d.date.slice(5)), axisLabel: { color: "#94a3b8" } },
    yAxis: { type: "value", axisLabel: { color: "#94a3b8" }, splitLine: { lineStyle: { color: "rgba(255,255,255,.08)" } } },
    series: [
      { name: "输入 prompt", type: "bar", stack: "t", barMaxWidth: 22, data: days.map((d) => d.prompt), itemStyle: { color: "#3b82f6" } },
      { name: "输出 completion", type: "bar", stack: "t", barMaxWidth: 22, data: days.map((d) => d.completion), itemStyle: { color: "#ec4899" } },
      { name: "总 token", type: "line", smooth: true, data: days.map((d) => d.total), itemStyle: { color: "#fbbf24" }, lineStyle: { color: "#fbbf24", width: 2 } },
    ],
  };
}
```

5. `renderChart()` 开头加 token 分支：

```js
function renderChart() {
  if (trafficTab === "token") {
    const days = overviewData?.usage || [];
    if (tokenChart) tokenChart.setOption(tokenChartOption(days), true);
    const last = days[days.length - 1];
    document.getElementById("token-today").textContent = last ? fmtNum(last.total) : "--";
    document.getElementById("token-total30").textContent = fmtNum(days.reduce((s, d) => s + d.total, 0));
    return;
  }
  const chart = trafficTab === "traffic" ? trafficChart : ioChart;
  const option = chartOption(trafficTab);
  if (option) chart.setOption(option, true);
  renderKpi();
}
```

（原 `renderChart` 中 `const chart = trafficTab === "traffic" ? trafficChart : ioChart;` 保留给非 token 分支。）

- [ ] **Step 2: 语法检查**

Run: `node --check src/web/static/app.js`
Expected: 无输出（通过）

- [ ] **Step 3: 手动验证**

重启面板后总览页：
- 「Token 用量」tab 存在，切换后显示堆叠柱+折线
- 今日/近30天汇总数字显示
- 切回流量/IO 正常
- 在 Agent 对话发消息后，Token tab 数据增长

- [ ] **Step 4: 提交**

```bash
git add src/web/static/app.js
git commit -m "feat(web): 总览 Token 用量柱线组合图表"
```

---

### Task 7: 全量测试与收尾

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: 新增全部通过，仅剩基线 17 条 sandbox 失败

- [ ] **Step 2: 重启面板验证（root，2222）**

```bash
sudo pkill -f "bin/fixflow.js web"; sleep 1.5; cd <repo> && setsid nohup node bin/fixflow.js web > /tmp/fixflow-web.log 2>&1 < /dev/null &
```

打开总览页切到「Token 用量」tab 验证图表。

- [ ] **Step 3: 提交（如 Step 2 有额外改动）并提示打包**

## Self-Review

**Spec coverage:**
- agent usage 解析 → Task 2
- usage store + 90 天留存 → Task 1
- core onUsage → Task 3
- /api/usage + overview 附带 → Task 4
- 前端第三个 tab + 柱线组合 → Task 5/6
- 测试 → 各任务

**Placeholder scan:** 无 TBD/TODO，代码步骤完整。

**Type consistency:**
- `usage` 形态 `{ promptTokens, completionTokens }` 在 Task 1/2/3/4 一致（store record 用同字段）
- `createUsageStore` 返回 `{ record, daily }` 在 Task 1/4 一致
- `switchTrafficTab`/`renderChart` 的 `trafficTab` 三态在 Task 6 内一致
