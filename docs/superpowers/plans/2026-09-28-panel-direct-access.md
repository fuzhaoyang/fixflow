# 面板直连访问 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 按 superpowers:executing-plans 执行。

**Goal:** 面板监听 0.0.0.0，安装时生成随机端口 + 随机安全入口路径（写入 config），`/<入口>/` 前缀路由（其余 404），启动探测内网/公网 IP 打印访问地址，新增 `fixflow default` 命令。

**Architecture:** 新增 `src/netip.js`（IP 探测）与 `src/panel-access.js`（端口/入口生成与持久化）；`server.js` 改监听与路由前缀；`bin/fixflow.js` 加 `default` 命令。零依赖。

**Spec:** `docs/superpowers/specs/2026-09-28-panel-direct-access-design.md`

## Global Constraints
- 零依赖；`npm test`。
- `panelPath` 为空时**不做前缀**（兼容测试与旧用法）；设置后强制前缀。
- 端口为 `null`/`undefined` 或旧默认 `2222` 时才随机生成；`0` 保持（测试用）。
- 启动时公网 IP 探测失败要降级，且仅在 `panelPath` 存在时探测（避免测试变慢）。

---

### Task 1: src/netip.js IP 探测

**Files:** Create `src/netip.js`; Create `tests/netip.test.js`

**Interfaces:** `lanIPs()` → `string[]`；`publicIP({ fetchImpl, timeout })` → `string|null`

- [ ] **Step 1: 写失败测试** `tests/netip.test.js`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { lanIPs, publicIP } from "../src/netip.js";

test("lanIPs 返回非回环 IPv4 数组", () => {
  const ips = lanIPs();
  assert.ok(Array.isArray(ips));
  assert.ok(!ips.includes("127.0.0.1"));
});

test("publicIP 成功", async () => {
  const ip = await publicIP({ fetchImpl: async () => ({ ok: true, json: async () => ({ ip: "1.2.3.4" }) }) });
  assert.equal(ip, "1.2.3.4");
});

test("publicIP 失败降级为 null", async () => {
  assert.equal(await publicIP({ fetchImpl: async () => { throw new Error("no net"); } }), null);
  assert.equal(await publicIP({ fetchImpl: async () => ({ ok: false }) }), null);
});
```

- [ ] **Step 2: 运行确认失败** `node --test tests/netip.test.js` → FAIL

- [ ] **Step 3: 实现** `src/netip.js`：

```js
import { networkInterfaces } from "node:os";

export function lanIPs() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list || []) if (i.family === "IPv4" && !i.internal) out.push(i.address);
  }
  return [...new Set(out)];
}

export async function publicIP({ fetchImpl = fetch, timeout = 3000 } = {}) {
  try {
    const res = await fetchImpl("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ip || null;
  } catch { return null; }
}
```

- [ ] **Step 4: 运行确认通过** → PASS
- [ ] **Step 5: 提交** `git add src/netip.js tests/netip.test.js && git commit -m "feat(netip): 内网/公网 IP 探测"`

---

### Task 2: src/panel-access.js 端口/入口生成

**Files:** Create `src/panel-access.js`; Create `tests/panel-access.test.js`

**Interfaces:** `ensurePanelAccess(config, { configPath, env })` → `{ port, panelPath }`；`buildUrls({ port, panelPath, lan, pub })` → `string[]`

- [ ] **Step 1: 写失败测试**：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensurePanelAccess } from "../src/panel-access.js";

test("缺 panelPath/端口时生成并写盘", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-pa-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, JSON.stringify({ port: 2222 }));
  const a = await ensurePanelAccess({ port: 2222 }, { configPath: cfg });
  assert.match(a.panelPath, /^[0-9a-f]{12}$/);
  assert.ok(a.port >= 10000 && a.port <= 65535);
  const saved = JSON.parse(readFileSync(cfg, "utf8"));
  assert.equal(saved.panelPath, a.panelPath);
  assert.equal(saved.port, a.port);
});

test("已有 panelPath 与自定义端口保持不变", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-pa-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, JSON.stringify({}));
  const a = await ensurePanelAccess({ port: 30000, panelPath: "abcdef123456" }, { configPath: cfg });
  assert.equal(a.port, 30000);
  assert.equal(a.panelPath, "abcdef123456");
});
```

- [ ] **Step 2: 运行确认失败** → FAIL

- [ ] **Step 3: 实现** `src/panel-access.js`：

```js
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import net from "node:net";

function portFree(p) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen(p, "0.0.0.0", () => srv.close(() => resolve(true)));
  });
}

async function pickPort() {
  for (let i = 0; i < 30; i++) {
    const p = 10000 + Math.floor(Math.random() * (65536 - 10000));
    if (await portFree(p)) return p;
  }
  return 10000 + Math.floor(Math.random() * 50000);
}

export async function ensurePanelAccess(config = {}, { configPath } = {}) {
  let changed = false;
  if (config.port == null || config.port === 2222) { config.port = await pickPort(); changed = true; }
  if (!config.panelPath) { config.panelPath = randomBytes(6).toString("hex"); changed = true; }
  if (changed && configPath) {
    let cur = {};
    try { cur = JSON.parse(await readFile(configPath, "utf8")); } catch {}
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify({ ...cur, port: config.port, panelPath: config.panelPath }, null, 2));
  }
  return { port: config.port, panelPath: config.panelPath };
}

export function buildUrls({ port, panelPath, lan = [], pub = null }) {
  const suffix = panelPath ? `/${panelPath}/` : "/";
  const urls = lan.map((ip) => `http://${ip}:${port}${suffix}`);
  if (pub) urls.push(`http://${pub}:${port}${suffix}`);
  return urls;
}
```

- [ ] **Step 4: 运行确认通过** → PASS
- [ ] **Step 5: 提交** `git commit -m "feat(panel-access): 随机端口/安全入口生成与持久化"`

---

### Task 3: server.js 路由前缀 + 0.0.0.0 + 启动打印

**Files:** Modify `src/web/server.js`; Test `tests/web.test.js`

- [ ] **Step 1: 写失败测试**（追加）：

```js
test("panelPath 前缀路由：带前缀可访问，无前缀 404", async () => {
  const w = await makeServer({ panelPath: "abcdef123456" });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  assert.equal((await fetch(`${base}/abcdef123456/`)).status, 200);
  assert.equal((await fetch(`${base}/abcdef123456/api/status`)).status, 200);
  assert.equal((await fetch(`${base}/`)).status, 404);
  assert.equal((await fetch(`${base}/api/status`)).status, 404);
  assert.equal((await fetch(`${base}/app.js`)).status, 404);
  w.close();
});
```

- [ ] **Step 2: 运行确认失败** → FAIL

- [ ] **Step 3: 实现** `server.js`：

1. import：`import { lanIPs, publicIP } from "../netip.js";`
2. 请求处理器开头（`const url = new URL(...)` 之后、try 内）加前缀剥离：

```js
      const base = config.panelPath ? "/" + config.panelPath : "";
      if (base) {
        if (url.pathname === base) { res.writeHead(301, { Location: base + "/" + (url.search || "") }); res.end(); return; }
        if (url.pathname === base + "/") url.pathname = "/";
        else if (url.pathname.startsWith(base + "/")) url.pathname = url.pathname.slice(base.length);
        else { res.writeHead(404); res.end("Not Found"); return; }
      }
```

3. 监听改 `0.0.0.0`：`server.listen(listenPort, "0.0.0.0", resolve)`
4. 启动打印（listen 成功后）：

```js
  if (config.panelPath) printAccess(address.port, config.panelPath);
```
新增函数（模块内）：
```js
  async function printAccess(port, panelPath) {
    const suffix = `/${panelPath}/`;
    const lan = lanIPs();
    console.log("面板访问地址：");
    for (const ip of lan) console.log(`  内网：http://${ip}:${port}${suffix}`);
    const pub = await publicIP();
    if (pub) console.log(`  公网：http://${pub}:${port}${suffix}`);
    else console.log("  公网：获取失败（可能无外网），请在云安全组/防火墙放行端口 " + port);
    console.log("  域名：把域名解析到本机后，用 http://域名:" + port + suffix + " 访问（无需 nginx）");
  }
```
（不 await，避免阻塞；仅在有 panelPath 时执行）

- [ ] **Step 4: 运行确认通过** → PASS
- [ ] **Step 5: 提交** `git commit -m "feat(web): 0.0.0.0 监听 + 安全入口前缀路由 + 启动打印访问地址"`

---

### Task 4: bin/fixflow.js `default` 命令

**Files:** Modify `bin/fixflow.js`; Test `tests/cli.test.js`（或新增）

- [ ] **Step 1: 实现**

import：`import { ensurePanelAccess, buildUrls } from "../src/panel-access.js";`、`import { lanIPs, publicIP } from "../src/netip.js";`

在 `cmd === "restart"` 之后加：

```js
if (cmd === "default") {
  const access = await ensurePanelAccess(config, { configPath: DEFAULT_CONFIG_PATH });
  const lan = lanIPs();
  const pub = await publicIP();
  const urls = buildUrls({ port: access.port, panelPath: access.panelPath, lan, pub });
  console.log("Fixflow 面板访问地址：");
  for (const u of urls) console.log("  " + u);
  if (!pub) console.log("  （公网 IP 获取失败，可能无外网）");
  console.log("  忘记密码可运行：fixflow reset-password");
  process.exit(0);
}
```

`web` 命令改为：`if (cmd === "web") { await ensurePanelAccess(config, { configPath: DEFAULT_CONFIG_PATH }); await startWeb(config); }`

- [ ] **Step 2: 手动验证** `node bin/fixflow.js default` 打印地址
- [ ] **Step 3: 提交** `git commit -m "feat(cli): fixflow default 打印面板访问地址；web 启动前确保端口/入口"`

---

### Task 5: 全量测试与重启验证

- [ ] **Step 1: 全量测试** `npm test` → 新增全绿，仅剩基线 17 条 sandbox 失败
- [ ] **Step 2: 重启面板** 用新启动方式，确认打印内网/公网地址、入口前缀生效
- [ ] **Step 3: `fixflow default` 验证**

## Self-Review
- Spec 覆盖：netip → T1；端口/入口生成 → T2；0.0.0.0+前缀路由+打印 → T3；fixflow default → T4；测试 → 各任务。
- 兼容：无 panelPath 不前缀（测试与旧用法）；端口 0 不改；公网探测仅在 panelPath 存在时执行。
