# Fixflow 监控强化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 强化系统健康检查（Markdown 体检报告+分级+建议+复制/下载）、进程分析（排序切换+systemd 服务关联+异常识别）、端口扫描（多端口批量+服务名映射）。

**Architecture:** 健康分级/报告生成做成 metrics.js 中的纯函数（可单测，注入 mock 数据）；collectProcesses 升级为解析 ps 输出结构化为对象数组；collectPorts 支持多端口；新增 `/api/report` 接口；前端卡片增强。

**Tech Stack:** Node.js ≥18，零第三方依赖（node:test）。

**Spec:** `docs/superpowers/specs/2026-09-17-fixflow-monitor-enhance-design.md`

## Global Constraints

- 零第三方依赖，只允许 `node:` 内置模块
- 所有新函数复用 `runCommand` 或纯函数；失败返回 `{error}`，不影响其他模块
- 健康分级默认阈值：磁盘/内存 正常≤80% 警告>80% 异常>90%；负载 1min > 核数 判警告
- 异常进程规则：`%CPU > 100` 或 RSS > 总内存×10%
- 端口映射表内置约 20 项（见 spec 3.2），未知端口显示「未知服务」
- 前端排序切换不重新请求后端（数据已含 memKb）
- 报告下载格式 `.md`，复制用 `navigator.clipboard`

---

### Task 1: 健康检查纯函数 assessHealth

**Files:**
- Create: `src/health.js`
- Test: `tests/health.test.js`

**Interfaces:**
- Consumes: 无（纯函数，接收解析后的数据）
- Produces:
  - `parseDf(stdout) → [{ mount, usedPct }]`
  - `parseFree(stdout) → { usedPct }`（排除 buffer/cache）
  - `parseLoad(stdout, cpuCount) → { load, warn: boolean }`
  - `assessHealth({ df, free, load, cpuCount }) → { items: [{name, status, detail, advice}], risks: [string] }`
    - status ∈ `"ok" | "warn" | "bad"`
    - advice 为内置规则库文案（见 spec 1.2）

- [ ] **Step 1: 写失败测试**

创建 `tests/health.test.js`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseDf, parseFree, assessHealth } from "../src/health.js";

const DF = `Filesystem 1K-blocks Used Available Use% Mounted on
/dev/sda1 50000000 45000000 5000000 90% /
/dev/sda2 10000000 2000000 8000000 20% /data`;

const FREE = `              total        used        free      shared  buff/cache   available
Mem:       16000000     10000000     2000000      100000     4000000     5000000`;

test("parseDf 解析挂载点使用率", () => {
  const r = parseDf(DF);
  assert.deepEqual(r, [{ mount: "/", usedPct: 90 }, { mount: "/data", usedPct: 20 }]);
});

test("parseFree 排除 buffer/cache 计算 usedPct", () => {
  // used=10000000, buff/cache=4000000, total=16000000
  // (10000000 - 4000000) / 16000000 = 37.5
  const r = parseFree(FREE);
  assert.equal(Math.round(r.usedPct), 38);
});

test("assessHealth 分级与建议", () => {
  const r = assessHealth({ df: [{ mount: "/", usedPct: 90 }, { mount: "/data", usedPct: 20 }], free: 82, load: 3, cpuCount: 8 });
  const disk = r.items.find((i) => i.name.includes("/"));
  assert.equal(disk.status, "bad");
  assert.match(disk.advice, /90/);
  const mem = r.items.find((i) => i.name === "内存");
  assert.equal(mem.status, "warn");
  assert.ok(r.risks.length >= 2);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/health.test.js`
Expected: FAIL — `src/health.js` 不存在

- [ ] **Step 3: 实现**

创建 `src/health.js`：

```js
const warnPct = 80;
const badPct = 90;

export function parseDf(stdout) {
  return (stdout || "").split("\n").slice(1).map((l) => {
    const parts = l.trim().split(/\s+/);
    if (parts.length < 6) return null;
    const usedPct = parseInt((parts[4] || "0").replace("%", ""), 10);
    return { mount: parts[5], usedPct: Number.isFinite(usedPct) ? usedPct : 0 };
  }).filter(Boolean);
}

export function parseFree(stdout) {
  const m = (stdout || "").match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
  if (!m) return { usedPct: 0 };
  const total = Number(m[1]);
  const used = Number(m[2]);
  const cache = Number(m[5]);
  const real = Math.max(0, used - cache);
  return { usedPct: total ? Math.round((real / total) * 100) : 0 };
}

export function parseLoad(stdout) {
  const m = (stdout || "").match(/^([\d.]+)/);
  return { load: m ? parseFloat(m[1]) : 0 };
}

function statusOf(pct) {
  if (pct > badPct) return "bad";
  if (pct > warnPct) return "warn";
  return "ok";
}

export function assessHealth({ df = [], free = 0, load = 0, cpuCount = 1 }) {
  const items = [];
  const risks = [];
  for (const d of df) {
    const st = statusOf(d.usedPct);
    items.push({
      name: `磁盘 ${d.mount}`,
      status: st,
      detail: `${d.usedPct}%`,
      advice: st === "ok" ? "" : `磁盘 ${d.mount} 使用率 ${d.usedPct}%${d.usedPct > 90 ? "，超过 90% 请立即处理" : "，建议清理旧日志或扩容"}`,
    });
    if (st !== "ok") risks.push(items[items.length - 1].advice);
  }
  const memSt = statusOf(free);
  items.push({
    name: "内存",
    status: memSt,
    detail: `${free}%`,
    advice: memSt === "ok" ? "" : `内存使用率 ${free}%${free > 90 ? "，超过 90% 请立即处理" : "，建议检查常驻进程或扩容"}`,
  });
  if (memSt !== "ok") risks.push(items[items.length - 1].advice);
  if (load > cpuCount) {
    items.push({
      name: "系统负载",
      status: "warn",
      detail: `1分钟负载 ${load} / ${cpuCount} 核`,
      advice: `1分钟负载 ${load} 超过核数 ${cpuCount}，建议排查高 CPU 进程`,
    });
    risks.push(`1分钟负载 ${load} 超过核数 ${cpuCount}，建议排查高 CPU 进程`);
  } else {
    items.push({ name: "系统负载", status: "ok", detail: `1分钟负载 ${load} / ${cpuCount} 核`, advice: "" });
  }
  return { items, risks };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/health.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/health.js tests/health.test.js
git commit -m "feat(health): 健康分级纯函数与建议规则库"
```

---

### Task 2: collectSystem 接入健康评估 + /api/report 接口

**Files:**
- Modify: `src/metrics.js`（`collectSystem`、`collectAll`）
- Modify: `src/web/server.js`（新增 `/api/report`）
- Test: `tests/metrics.test.js`、`tests/web.test.js`

**Interfaces:**
- Consumes: `assessHealth`, `parseDf`, `parseFree`, `parseLoad` from `../health.js`
- Produces:
  - `collectSystem()` 返回新增 `health: { items, risks }`（内部用 `nproc` 取核数，失败默认 1）
  - `collectAll` 的 `system` 字段含 `health`
  - `GET /api/report` 返回 `text/markdown` 纯文本报告

- [ ] **Step 1: 写失败测试**

`tests/metrics.test.js` 追加：

```js
test("collectSystem 返回 health 字段", async () => {
  const r = await collectSystem();
  assert.ok("health" in r || "error" in r);
});
```

`tests/web.test.js` 追加：

```js
test("/api/report 返回 Markdown 报告", async () => {
  const w = await startWeb({ port: 0, services: [], databases: [] });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const res = await fetch(`${base}/api/report`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /# Fixflow 系统体检报告/);
  w.close();
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/metrics.test.js tests/web.test.js`
Expected: FAIL — health 字段/report 接口不存在

- [ ] **Step 3: metrics.js 实现**

顶部 import：

```js
import { assessHealth, parseDf, parseFree, parseLoad } from "./health.js";
```

`collectSystem` 改为：

```js
export async function collectSystem() {
  const [uptime, mem, disk, nproc] = await Promise.all([
    runCommand("uptime"), runCommand("free -m"), runCommand("df -h"), runCommand("nproc"),
  ]);
  const cpuCount = nproc.exitCode === 0 ? parseInt(nproc.stdout.trim() || "1", 10) || 1 : 1;
  const health = assessHealth({
    df: parseDf(disk.stdout || ""),
    free: parseFree(mem.stdout || "").usedPct,
    load: parseLoad(uptime.stdout || "").load,
    cpuCount,
  });
  return {
    uptime: { ok: uptime.exitCode === 0, detail: uptime.stdout || uptime.stderr },
    memory: { ok: mem.exitCode === 0, detail: mem.stdout || mem.stderr },
    disk: { ok: disk.exitCode === 0, detail: disk.stdout || disk.stderr },
    health,
  };
}
```

- [ ] **Step 4: web/server.js 新增 /api/report**

在 `/api/metrics` 分支后新增：

```js
      } else if (url.pathname === "/api/report") {
        const data = await collectAll(config);
        const s = data.system;
        const now = new Date().toLocaleString("zh-CN");
        let md = `# Fixflow 系统体检报告\n\n生成时间：${now}\n\n## 总览\n\n| 项目 | 状态 | 摘要 |\n|---|---|---|\n`;
        for (const it of s?.health?.items || []) {
          const icon = it.status === "ok" ? "✅ 正常" : it.status === "warn" ? "⚠️ 警告" : "❌ 异常";
          md += `| ${it.name} | ${icon} | ${it.detail} |\n`;
        }
        md += `\n## 风险项\n\n`;
        md += s?.health?.risks?.length
          ? s.health.risks.map((r) => `- ${r}`).join("\n") + "\n"
          : "未发现风险。\n";
        md += `\n## 系统详情\n\n`;
        for (const key of ["uptime", "memory", "disk"]) {
          const item = s?.[key];
          if (item) md += `### ${key}\n\n\`\`\`\n${item.detail}\n\`\`\`\n\n`;
        }
        res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8" });
        res.end(md);
      }
```

- [ ] **Step 5: 运行确认通过**

Run: `node --test tests/metrics.test.js tests/web.test.js`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/metrics.js src/web/server.js tests/metrics.test.js tests/web.test.js
git commit -m "feat(health): collectSystem 接入分级 + /api/report 接口"
```

---

### Task 3: collectProcesses 结构化 + systemd 服务 + 异常识别

**Files:**
- Modify: `src/metrics.js`
- Test: `tests/metrics.test.js`

**Interfaces:**
- Consumes: `runCommand`
- Produces:
  - `collectProcesses()` → `{ top: [{ pid, user, cpu, mem, memKb, cmd, service }], zombies, zombieDetail, anomalies: [string] }`（Top20，按 cpu 排序）
  - service 从 `/proc/{pid}/cgroup` 读 `system.slice/xxx.service`（取前 20 进程，逐进程读，失败留空）
  - 总内存从 `free` 取 KB

- [ ] **Step 1: 写失败测试**

`tests/metrics.test.js` 现有 `collectProcesses` 测试改为断言新结构：

```js
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
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/metrics.test.js`
Expected: FAIL — top 是 string 不是数组

- [ ] **Step 3: 实现**

替换 `collectProcesses`：

```js
const parsePsLine = (line) => {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 11) return null;
  return {
    user: parts[0],
    pid: parseInt(parts[1], 10),
    cpu: parseFloat(parts[2]),
    mem: parseFloat(parts[3]),
    memKb: parseInt(parts[5], 10),
    cmd: parts.slice(10).join(" "),
  };
};

export async function collectProcesses() {
  const [top, zombie, free, memtotal] = await Promise.all([
    runCommand("ps aux --sort=-%cpu | head -21"),
    runCommand("ps -eo stat,comm | awk '$1 ~ /Z/ {print $2}'"),
    runCommand("free -m"),
    runCommand("awk '/MemTotal/ {print $2}' /proc/meminfo"),
  ]);
  if (top.exitCode !== 0) return { error: top.stderr || "ps 不可用" };
  const totalMemKb = parseInt(memtotal.stdout.trim(), 10) || 0;
  const list = (top.stdout || "").split("\n").slice(1).map(parsePsLine).filter(Boolean).slice(0, 20);
  const anomalies = [];
  for (const p of list) {
    const cgroup = await runCommand(`cat /proc/${p.pid}/cgroup 2>/dev/null`);
    const m = (cgroup.stdout || "").match(/([\w-]+\.service)/);
    p.service = m ? m[1] : "";
    if (p.cpu > 100) anomalies.push(`进程 ${p.cmd} (PID ${p.pid}) CPU ${p.cpu}% 超阈值`);
    if (totalMemKb && p.memKb > totalMemKb * 0.1) anomalies.push(`进程 ${p.cmd} (PID ${p.pid}) 内存占用异常`);
  }
  const zombies = (zombie.stdout || "").split("\n").filter((l) => l.trim()).length;
  return { top: list, zombies, zombieDetail: zombie.stdout.trim(), anomalies };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/metrics.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/metrics.js tests/metrics.test.js
git commit -m "feat(metrics): 进程结构化+systemd服务+异常识别"
```

---

### Task 4: collectPorts 多端口 + 服务名映射

**Files:**
- Modify: `src/metrics.js`
- Test: `tests/metrics.test.js`

**Interfaces:**
- Produces: `collectPorts(ports: string|string[])` → `{ results: [{ port, service, ok, detail }] }`；无参返回 `collectNetwork()`；`portScan.results` 供前端
- 服务名映射表导出 `PORT_SERVICES`

- [ ] **Step 1: 写失败测试**

`tests/metrics.test.js` 追加：

```js
test("collectPorts 多端口批量与服务名映射", async () => {
  const r = await collectPorts("22,3306,99999");
  assert.ok("results" in r);
  assert.equal(r.results.length, 3);
  assert.equal(r.results[0].service, "ssh");
  assert.equal(r.results[1].service, "mysql");
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/metrics.test.js`
Expected: FAIL — results 不存在（现有返回 listeners）

- [ ] **Step 3: 实现**

在 metrics.js 顶部（或文件内）定义映射表：

```js
export const PORT_SERVICES = {
  22: "ssh", 25: "smtp", 53: "dns", 80: "http", 110: "pop3", 143: "imap",
  443: "https", 3306: "mysql", 5432: "postgres", 6379: "redis", 8080: "http-alt",
  8443: "https-alt", 9090: "prometheus", 27017: "mongodb", 9000: "php-fpm",
  9418: "git", 5000: "docker-registry", 2375: "docker", 11211: "memcached",
};
```

替换 `collectPorts`：

```js
export async function collectPorts(ports) {
  if (!ports) return collectNetwork();
  const list = String(ports).split(",").map((s) => s.trim()).filter(Boolean);
  const results = await Promise.all(list.map(async (p) => {
    const r = await runCommand(`ss -tulnp | grep ":${p} "`);
    return {
      port: p,
      service: PORT_SERVICES[String(p)] || "未知服务",
      ok: r.exitCode === 0,
      detail: r.stdout || `端口 ${p} 无监听`,
    };
  }));
  return { results };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/metrics.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/metrics.js tests/metrics.test.js
git commit -m "feat(metrics): 多端口批量查询+服务名映射"
```

---

### Task 5: 前端系统卡片报告 UI（复制/下载）

**Files:**
- Modify: `src/web/static/app.js`
- Modify: `src/web/static/index.html`

**Interfaces:**
- Consumes: `GET /api/report`（纯文本 Markdown）
- Produces: 系统卡片「生成报告」→ 拉取报告 → 渲染 + 「复制」「下载」按钮

- [ ] **Step 1: index.html 增加按钮样式**

在 `.btn` 样式区后追加（无需新增，复用 `.btn.small`）。

- [ ] **Step 2: app.js 系统卡片分支改为按钮组**

现有 `key === "system"` 分支改为：

```js
    } else if (key === "system") {
      card.innerHTML = `<h2>${label} <button class="btn small" id="report-btn" style="margin-left:8px">📄 生成报告</button></h2><pre>${escapeHtml(detail(m))}</pre><div id="report-box" style="display:none"><div style="margin-bottom:8px"><button class="btn small" id="report-copy">复制</button> <button class="btn small" id="report-dl">下载 .md</button></div><pre id="report-out"></pre></div>`;
    } else if (key === "network") {
```

- [ ] **Step 3: 绑定逻辑**

现有 `reportBtn.onclick` 块改为：

```js
    const reportBtn = card.querySelector("#report-btn");
    if (reportBtn) {
      reportBtn.onclick = async () => {
        const box = document.getElementById("report-box");
        const out = document.getElementById("report-out");
        const res = await fetch("/api/report");
        const report = await res.text();
        out.textContent = report;
        box.style.display = "";
        document.getElementById("report-copy").onclick = () => navigator.clipboard.writeText(report);
        document.getElementById("report-dl").onclick = () => {
          const blob = new Blob([report], { type: "text/markdown" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `fixflow-report-${Date.now()}.md`;
          a.click();
          URL.revokeObjectURL(a.href);
        };
      };
    }
```

- [ ] **Step 4: 验证**

Run: `node --check src/web/static/app.js`
Expected: 无语法错误

- [ ] **Step 5: 提交**

```bash
git add src/web/static/app.js src/web/static/index.html
git commit -m "feat(web): 体检报告复制/下载"
```

---

### Task 6: 前端进程卡片排序切换 + 异常展示

**Files:**
- Modify: `src/web/static/app.js`
- Modify: `src/web/static/index.html`

**Interfaces:**
- Consumes: `metrics.processes`（含 top 数组/anomalies）
- Produces: 进程卡内排序按钮（CPU/内存），异常行标红，表格渲染

- [ ] **Step 1: index.html 无需改（排序按钮放卡片内）**

- [ ] **Step 2: app.js 替换 renderProcesses**

```js
let procSort = "cpu";

function renderProcesses(m) {
  if (!m?.top) return `<pre>${escapeHtml(m?.error || "N/A")}</pre>`;
  const anomalies = (m.anomalies || []).map((a) => `<div style="color:var(--bad);font-size:12px">⚠️ ${escapeHtml(a)}</div>`).join("");
  const zombie = m.zombies > 0
    ? `<div style="color:var(--bad);margin-bottom:6px;font-size:12px">⚠️ 僵尸进程 ${m.zombies} 个：${escapeHtml(m.zombieDetail || "")}</div>`
    : "";
  const sortBtns = `<div style="margin-bottom:6px;display:flex;gap:6px">
    <button class="btn small ${procSort === "cpu" ? "report-active" : ""}" id="sort-cpu">按 CPU</button>
    <button class="btn small ${procSort === "mem" ? "report-active" : ""}" id="sort-mem">按内存</button></div>`;
  const list = [...m.top].sort((a, b) => procSort === "mem" ? b.memKb - a.memKb : b.cpu - a.cpu);
  const rows = list.map((p) => {
    const bad = p.cpu > 100;
    const style = bad ? " style='background:rgba(248,113,113,0.15);color:var(--bad)'" : "";
    return `<tr${style}><td>${p.pid}</td><td>${escapeHtml(p.user || "")}</td><td>${p.cpu}%</td><td>${p.mem}%</td><td>${p.memKb ? Math.round(p.memKb / 1024) + "MB" : "—"}</td><td>${escapeHtml(p.service || "—")}</td><td>${escapeHtml(p.cmd || "")}</td></tr>`;
  }).join("");
  return `${anomalies}${zombie}${sortBtns}<table class="svc-table"><thead><tr><th>PID</th><th>用户</th><th>CPU%</th><th>内存%</th><th>内存</th><th>systemd 服务</th><th>命令</th></tr></thead><tbody>${rows}</tbody></table>`;
}
```

- [ ] **Step 3: 绑定排序按钮（renderCards 的 reportBtn 块后追加）**

```js
    const sortCpu = card.querySelector("#sort-cpu");
    const sortMem = card.querySelector("#sort-mem");
    if (sortCpu) sortCpu.onclick = () => { procSort = "cpu"; renderCards(); };
    if (sortMem) sortMem.onclick = () => { procSort = "mem"; renderCards(); };
```

- [ ] **Step 4: index.html 加 active 按钮样式**

`.btn` 区追加：

```css
    .btn.report-active { background: var(--accent); outline: 2px solid var(--accent); outline-offset: 2px; }
```

- [ ] **Step 5: 验证**

Run: `node --check src/web/static/app.js`

- [ ] **Step 6: 提交**

```bash
git add src/web/static/app.js src/web/static/index.html
git commit -m "feat(web): 进程排序切换与异常展示"
```

---

### Task 7: 前端网络端口多结果渲染

**Files:**
- Modify: `src/web/static/app.js`

**Interfaces:**
- Consumes: `metrics.portScan.results`
- Produces: 端口查询结果逐端口渲染（含服务名/状态）

- [ ] **Step 1: app.js network 分支改渲染 portScan.results**

现有 `key === "network"` 分支中 `scan` 渲染改为：

```js
      const scan = metrics.portScan;
      const ping = metrics.pingResult;
      let scanHtml = "";
      if (scan?.results?.length) {
        scanHtml = `<pre>【端口占用】${scan.results.map((p) => `${p.port} (${p.service}): ${p.ok ? "监听中" : "未监听"}\n${p.detail}`).join("\n----\n")}</pre>`;
      }
      card.innerHTML = `<h2>${label}</h2><pre>${escapeHtml(detail(m))}</pre>${scanHtml}${ping ? `<pre>【连通性】${escapeHtml(JSON.stringify(ping.results || ping, null, 2))}</pre>` : ""}`;
```

- [ ] **Step 2: placeholder 更新**

`index.html` 端口输入 placeholder 改为 `查端口占用，如 22,3306,80`。

- [ ] **Step 3: 验证**

Run: `node --check src/web/static/app.js`

- [ ] **Step 4: 提交**

```bash
git add src/web/static/app.js src/web/static/index.html
git commit -m "feat(web): 端口多结果渲染与服务名"
```

---

## 收尾检查

- `node --test tests/` 全绿
- 重启面板验证：系统卡片报告复制/下载、进程排序切换、端口多查询（`22,3306,80`）
- `git push`
