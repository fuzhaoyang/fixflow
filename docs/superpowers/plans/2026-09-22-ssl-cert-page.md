# SSL 证书页重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 SSL 证书页从只读表格升级为完整的证书管理页（可视化、信息增强、本机发现、一键续签、多通道告警）。

**Architecture:** 新增 `src/ssl.js` 承载全部证书逻辑（解析/发现/续签/告警），`metrics.js` 与 `server.js` 调用它；前端在 `app.js` 重写 `renderSsl` 并新增管理弹窗。零第三方依赖，复用 `runCommand` 与 `/api/process` 的密码校验模式。

**Tech Stack:** Node.js ESM（node:test 测试）、原生 `http`、浏览器原生 JS、OpenSSL CLI。

**Spec:** `docs/superpowers/specs/2026-09-22-ssl-cert-page-design.md`

## Global Constraints

- 零第三方依赖，只用 Node 内置模块与系统命令。
- 测试命令：`npm test`（即 `node --test tests/`），新增测试用 `node:test` + `node:assert/strict`。
- 注释仅中文，只在必要处添加（项目现有代码注释风格：简洁中文）。
- 所有外部命令经 `runCommand`（`src/tools.js`），测试通过参数注入 `exec` 替身。
- 高危操作（续签）必须校验面板密码，失败返回 403 且不执行。
- 新增配置文件字段：`sslSites`（对象数组）、`sslAlerts`（`{ webhook, smtp }`）。
- 现有 `sslSites` 为 `string[]`，必须自动迁移为对象数组。

---

### Task 1: config 迁移与 sslAlerts 默认值

**Files:**
- Modify: `src/config.js`
- Test: `tests/config.test.js`

**Interfaces:**
- Produces: `normalizeSslSites(list)` → `Array<{id,type,host,port,path,label,enabled,source}>`；`loadConfig()` 返回的 `sslSites` 已归一化、`sslAlerts` 有默认值 `{ webhook:"", smtp:{} }`。

- [ ] **Step 1: 写失败测试**

在 `tests/config.test.js` 末尾追加：

```js
test("sslSites 旧字符串数组自动迁移为对象数组", () => {
  const dir = mkdtempSync(join(tmpdir(), "fixflow-"));
  const file = join(dir, "config.json");
  writeFileSync(file, JSON.stringify({ sslSites: ["example.com", "a.com:8443"] }));
  const cfg = loadConfig({ filePath: file });
  assert.equal(cfg.sslSites.length, 2);
  assert.equal(cfg.sslSites[0].type, "remote");
  assert.equal(cfg.sslSites[0].host, "example.com");
  assert.equal(cfg.sslSites[0].port, "443");
  assert.equal(cfg.sslSites[0].enabled, true);
  assert.equal(cfg.sslSites[1].host, "a.com");
  assert.equal(cfg.sslSites[1].port, "8443");
  assert.ok(cfg.sslSites[0].id);
});

test("sslSites 对象数组原样保留并补默认字段", () => {
  const dir = mkdtempSync(join(tmpdir(), "fixflow-"));
  const file = join(dir, "config.json");
  writeFileSync(file, JSON.stringify({ sslSites: [{ type: "local", path: "/etc/nginx/ssl/a.pem", enabled: false }] }));
  const cfg = loadConfig({ filePath: file });
  assert.equal(cfg.sslSites[0].type, "local");
  assert.equal(cfg.sslSites[0].path, "/etc/nginx/ssl/a.pem");
  assert.equal(cfg.sslSites[0].enabled, false);
  assert.equal(cfg.sslSites[0].source, "manual");
});

test("sslAlerts 默认值", () => {
  const dir = mkdtempSync(join(tmpdir(), "fixflow-"));
  const file = join(dir, "config.json");
  const cfg = loadConfig({ filePath: file });
  assert.deepEqual(cfg.sslAlerts, { webhook: "", smtp: {} });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/config.test.js`
Expected: FAIL（`cfg.sslSites[0].type` 为 undefined，因为仍是字符串）

- [ ] **Step 3: 实现**

替换 `src/config.js` 全文：

```js
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function normalizeSslSites(list) {
  if (!Array.isArray(list)) return [];
  return list.map((s, i) => {
    if (typeof s === "string") {
      const [host, port] = s.split(":");
      return { id: `c${i + 1}`, type: "remote", host: host || "", port: port || "443", path: "", label: "", enabled: true, source: "manual" };
    }
    return {
      id: s.id || `c${i + 1}`,
      type: s.type === "local" ? "local" : "remote",
      host: s.host || "",
      port: s.port || "443",
      path: s.path || "",
      label: s.label || "",
      enabled: s.enabled !== false,
      source: s.source || "manual",
    };
  });
}

export function loadConfig({ filePath = join(process.env.HOME || ".", ".config", "fixflow", "config.json") } = {}) {
  let file = {};
  try { file = JSON.parse(readFileSync(filePath, "utf8")); } catch {}

  return {
    apiKey: process.env.FIXFLOW_API_KEY || file.apiKey || "",
    baseUrl: process.env.FIXFLOW_BASE_URL || file.baseUrl || "https://api.openai.com/v1",
    model: process.env.FIXFLOW_MODEL || file.model || "kimi-k2.7-code",
    port: file.port || 2222,
    timeout: file.timeout || 30000,
    services: file.services || [],
    databases: file.databases || [],
    sslSites: normalizeSslSites(file.sslSites),
    pingTargets: file.pingTargets || [],
    sslAlerts: file.sslAlerts || { webhook: "", smtp: {} },
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/config.test.js`
Expected: PASS（含既有 3 条 + 新增 3 条）

- [ ] **Step 5: 提交**

```bash
git add src/config.js tests/config.test.js
git commit -m "feat(config): sslSites 迁移为对象数组并新增 sslAlerts"
```

---

### Task 2: ssl.js 证书解析（parseCertOutput / readCertFile / probeRemote）

**Files:**
- Create: `src/ssl.js`
- Test: `tests/ssl.test.js`

**Interfaces:**
- Produces:
  - `parseCertOutput(text)` → `{ cn, issuer, notBefore, notAfter, daysLeft, serial, sigAlgo, san: string[] }`
  - `readCertFile(path, exec?)` → 上述字段 + 可能 `{ error }`
  - `probeRemote(host, port, exec?)` → 上述字段 + `{ chain }` + 可能 `{ error }`
  - 内部 `shellQuote(s)`

- [ ] **Step 1: 写失败测试**

创建 `tests/ssl.test.js`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCertOutput, readCertFile } from "../src/ssl.js";

const SAMPLE = `subject=CN = test.example.com
issuer=C = US, O = Let's Encrypt, CN = R3
notBefore=Sep 22 00:00:00 2026 GMT
notAfter=Dec 21 00:00:00 2026 GMT
serial=0A:1B:2C
---SIG---
    Signature Algorithm: sha256WithRSAEncryption
X509v3 Subject Alternative Name: 
    DNS:test.example.com, DNS:www.test.example.com`;

test("parseCertOutput 解析各字段", () => {
  const c = parseCertOutput(SAMPLE);
  assert.equal(c.cn, "test.example.com");
  assert.match(c.issuer, /Let's Encrypt/);
  assert.equal(c.notAfter, "Dec 21 00:00:00 2026 GMT");
  assert.equal(c.serial, "0A:1B:2C");
  assert.equal(c.sigAlgo, "sha256WithRSAEncryption");
  assert.deepEqual(c.san, ["test.example.com", "www.test.example.com"]);
  assert.equal(typeof c.daysLeft, "number");
});

test("parseCertOutput 无 SAN 时不报错", () => {
  const c = parseCertOutput("subject=CN = a.com\nnotAfter=Dec 21 00:00:00 2026 GMT");
  assert.equal(c.cn, "a.com");
  assert.deepEqual(c.san, []);
});

function genCert() {
  const dir = mkdtempSync(join(tmpdir(), "ff-ssl-"));
  const cert = join(dir, "cert.pem");
  const key = join(dir, "key.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", key, "-out", cert,
    "-days", "30", "-nodes", "-subj", "/CN=test.example.com",
    "-addext", "subjectAltName=DNS:test.example.com,DNS:www.test.example.com"], { stdio: "ignore" });
  return cert;
}

test("readCertFile 读取真实证书", async () => {
  const cert = genCert();
  assert.ok(existsSync(cert));
  const c = await readCertFile(cert);
  assert.equal(c.cn, "test.example.com");
  assert.ok(c.san.includes("www.test.example.com"));
  assert.ok(c.daysLeft >= 28 && c.daysLeft <= 30);
});

test("readCertFile 文件不存在返回 error", async () => {
  const c = await readCertFile("/no/such/cert.pem");
  assert.ok(c.error);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/ssl.test.js`
Expected: FAIL（`Cannot find module '../src/ssl.js'`）

- [ ] **Step 3: 实现**

创建 `src/ssl.js`：

```js
import { runCommand } from "./tools.js";

export function shellQuote(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}

export function parseCertOutput(text) {
  const out = String(text || "");
  const g = (re) => (out.match(re) || [])[1]?.trim() || "";
  const subject = g(/^subject=\s*(.*)$/m);
  const cn = (subject.match(/CN\s*=\s*([^,]+)/) || [])[1]?.trim() || subject;
  const issuer = g(/^issuer=\s*(.*)$/m);
  const notBefore = g(/^notBefore=\s*(.*)$/m);
  const notAfter = g(/^notAfter=\s*(.*)$/m);
  const serial = g(/^serial=\s*(.*)$/m);
  const sigAlgo = g(/Signature Algorithm:\s*(.*)$/m);
  const lines = out.split("\n");
  const idx = lines.findIndex((l) => /Subject Alternative Name/.test(l));
  const san = idx >= 0
    ? (lines[idx + 1]?.match(/DNS:([^,\s]+)/g) || []).map((s) => s.slice(4))
    : [];
  let daysLeft = null;
  if (notAfter) {
    const d = new Date(notAfter);
    if (!Number.isNaN(d.getTime())) daysLeft = Math.floor((d - Date.now()) / 86400000);
  }
  return { cn, issuer, notBefore, notAfter, serial, sigAlgo, san, daysLeft };
}

const X509_FLAGS = "-noout -subject -issuer -dates -serial -ext subjectAltName";

export async function readCertFile(path, exec = runCommand) {
  const q = shellQuote(path);
  const r = await exec(`openssl x509 -in ${q} ${X509_FLAGS} 2>/dev/null; echo '---SIG---'; openssl x509 -in ${q} -noout -text 2>/dev/null | grep -m1 'Signature Algorithm'`);
  if (!/notAfter=/.test(r.stdout || "")) return { error: (r.stderr || "").trim() || "无法读取证书" };
  return parseCertOutput(r.stdout);
}

export async function probeRemote(host, port = "443", exec = runCommand) {
  const h = shellQuote(host);
  const p = shellQuote(port);
  const r = await exec(`OUT=$(echo | timeout 10 openssl s_client -connect ${h}:${p} -servername ${h} -showcerts 2>/dev/null); echo "$OUT" | openssl x509 ${X509_FLAGS} 2>/dev/null; echo '---SIG---'; echo "$OUT" | openssl x509 -noout -text 2>/dev/null | grep -m1 'Signature Algorithm'; echo '---CHAIN---'; echo "$OUT" | grep -c 'BEGIN CERTIFICATE'`);
  if (!/notAfter=/.test(r.stdout || "")) return { host, port, error: (r.stderr || "").trim() || "无法读取证书" };
  const parsed = parseCertOutput(r.stdout);
  const chain = parseInt((r.stdout.split("---CHAIN---")[1] || "").trim(), 10) || 1;
  return { ...parsed, chain };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/ssl.test.js`
Expected: PASS（4 条）

- [ ] **Step 5: 提交**

```bash
git add src/ssl.js tests/ssl.test.js
git commit -m "feat(ssl): 证书解析与本机/远程读取"
```

---

### Task 3: ssl.js 自动发现与合并采集

**Files:**
- Modify: `src/ssl.js`
- Test: `tests/ssl.test.js`

**Interfaces:**
- Consumes: `readCertFile`、`probeRemote`（Task 2）
- Produces:
  - `discoverNginxCerts(exec?)` → `string[]`
  - `discoverCertDirs(exec?)` → `string[]`
  - `mergeSslEntries({ manual, discovered })` → 归一化条目数组（去重）
  - `collectSslAll(config, exec?)` → `{ results: Array<entry & certFields> }`

- [ ] **Step 1: 写失败测试**

在 `tests/ssl.test.js` 追加：

```js
import { discoverNginxCerts, discoverCertDirs, mergeSslEntries, collectSslAll } from "../src/ssl.js";

test("discoverNginxCerts 解析证书路径并去重", async () => {
  const fake = async () => ({ stdout: "ssl_certificate /etc/nginx/ssl/a.pem;\nssl_certificate /etc/nginx/ssl/a.pem;\nssl_certificate /etc/nginx/ssl/b.pem;\n", stderr: "", exitCode: 0 });
  const paths = await discoverNginxCerts(fake);
  assert.deepEqual(paths.sort(), ["/etc/nginx/ssl/a.pem", "/etc/nginx/ssl/b.pem"]);
});

test("discoverCertDirs 返回扫描到的文件", async () => {
  const fake = async () => ({ stdout: "/etc/nginx/ssl/a.pem\n/etc/letsencrypt/live/x/fullchain.pem\n", stderr: "", exitCode: 0 });
  const paths = await discoverCertDirs(fake);
  assert.equal(paths.length, 2);
});

test("mergeSslEntries 按路径/域名去重", () => {
  const manual = [
    { id: "c1", type: "local", path: "/a.pem", enabled: true },
    { id: "c2", type: "remote", host: "a.com", port: "443", enabled: true },
  ];
  const merged = mergeSslEntries({ manual, discovered: ["/a.pem", "/b.pem"] });
  assert.equal(merged.length, 3);
  assert.ok(merged.some((e) => e.path === "/b.pem" && e.source === "discovered"));
});

test("collectSslAll 合并发现与手动并采集", async () => {
  const calls = [];
  const fake = async (cmd) => {
    calls.push(cmd);
    if (/grep -rhoE/.test(cmd)) return { stdout: "", stderr: "", exitCode: 1 };
    if (/find /.test(cmd)) return { stdout: "", stderr: "", exitCode: 0 };
    if (/openssl x509/.test(cmd)) return { stdout: "subject=CN = a.com\nnotAfter=Dec 21 00:00:00 2026 GMT\n", stderr: "", exitCode: 0 };
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  const r = await collectSslAll({ sslSites: [{ id: "c1", type: "remote", host: "a.com", port: "443", enabled: true }] }, fake);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].cn, "a.com");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/ssl.test.js`
Expected: FAIL（`discoverNginxCerts is not a function`）

- [ ] **Step 3: 实现**

在 `src/ssl.js` 末尾追加：

```js
export async function discoverNginxCerts(exec = runCommand) {
  const r = await exec("grep -rhoE 'ssl_certificate[^;]*' /etc/nginx 2>/dev/null");
  return [...new Set((r.stdout || "").split("\n")
    .map((l) => l.replace(/^ssl_certificate\s+/, "").trim())
    .filter((p) => p.endsWith(".pem") || p.endsWith(".crt")))];
}

export async function discoverCertDirs(exec = runCommand) {
  const dirs = ["/etc/nginx/ssl", "/etc/letsencrypt/live", "/etc/ssl/private", "/etc/pki/tls/certs"];
  const r = await exec(`find ${dirs.map(shellQuote).join(" ")} -maxdepth 3 -type f \\( -name '*.pem' -o -name '*.crt' \\) 2>/dev/null`);
  return [...new Set((r.stdout || "").split("\n").map((s) => s.trim()).filter(Boolean))];
}

export function mergeSslEntries({ manual = [], discovered = [] }) {
  const seen = new Set();
  const out = [];
  for (const e of manual) {
    const key = e.type === "local" ? `l:${e.path}` : `r:${e.host}:${e.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...e, source: e.source || "manual" });
  }
  for (const p of discovered) {
    const key = `l:${p}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `d:${p}`, type: "local", host: "", port: "", path: p, label: "", enabled: true, source: "discovered" });
  }
  return out;
}

export async function collectSslAll(config = {}, exec = runCommand) {
  const [nginxPaths, dirPaths] = await Promise.all([discoverNginxCerts(exec), discoverCertDirs(exec)]);
  const discovered = [...new Set([...nginxPaths, ...dirPaths])];
  const manual = (config.sslSites || []).filter((e) => e.enabled !== false);
  const merged = mergeSslEntries({ manual, discovered });
  const results = await Promise.all(merged.map(async (e) => {
    const base = { id: e.id, source: e.source, type: e.type, host: e.host, port: e.port, path: e.path, label: e.label };
    if (e.type === "local") return { ...base, ...(await readCertFile(e.path, exec)) };
    return { ...base, ...(await probeRemote(e.host, e.port, exec)) };
  }));
  return { results };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/ssl.test.js`
Expected: PASS（8 条）

- [ ] **Step 5: 提交**

```bash
git add src/ssl.js tests/ssl.test.js
git commit -m "feat(ssl): nginx/目录自动发现与合并采集"
```

---

### Task 4: ssl.js 续签工具探测与执行

**Files:**
- Modify: `src/ssl.js`
- Test: `tests/ssl.test.js`

**Interfaces:**
- Produces:
  - `detectRenewTool(exec?)` → `{ tool: "certbot"|"acme.sh"|null, path?: string }`
  - `renewCert(entry, exec?)` → `{ ok, tool, stdout?, stderr?, reloaded?, error? }`

- [ ] **Step 1: 写失败测试**

在 `tests/ssl.test.js` 追加：

```js
import { detectRenewTool, renewCert } from "../src/ssl.js";

test("detectRenewTool 优先 certbot", async () => {
  const fake = async (cmd) => cmd.includes("certbot")
    ? { stdout: "/usr/bin/certbot\n", stderr: "", exitCode: 0 }
    : { stdout: "", stderr: "", exitCode: 1 };
  assert.equal((await detectRenewTool(fake)).tool, "certbot");
});

test("detectRenewTool 无工具返回 null", async () => {
  const fake = async () => ({ stdout: "", stderr: "", exitCode: 1 });
  assert.equal((await detectRenewTool(fake)).tool, null);
});

test("renewCert 无工具返回错误", async () => {
  const fake = async () => ({ stdout: "", stderr: "", exitCode: 1 });
  const r = await renewCert({ cn: "a.com" }, fake);
  assert.equal(r.ok, false);
  assert.match(r.error, /certbot/);
});

test("renewCert 用 certbot 续签并重载 nginx", async () => {
  const cmds = [];
  const fake = async (cmd) => {
    cmds.push(cmd);
    if (cmd.includes("command -v certbot")) return { stdout: "/usr/bin/certbot\n", stderr: "", exitCode: 0 };
    if (cmd.includes("certbot renew")) return { stdout: "renewed", stderr: "", exitCode: 0 };
    if (cmd.includes("systemctl reload nginx")) return { stdout: "", stderr: "", exitCode: 0 };
    return { stdout: "", stderr: "", exitCode: 1 };
  };
  const r = await renewCert({ cn: "a.com" }, fake);
  assert.equal(r.ok, true);
  assert.equal(r.tool, "certbot");
  assert.equal(r.reloaded, true);
  assert.ok(cmds.some((c) => c.includes("certbot renew --cert-name 'a.com'")));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/ssl.test.js`
Expected: FAIL（`detectRenewTool is not a function`）

- [ ] **Step 3: 实现**

在 `src/ssl.js` 末尾追加：

```js
export async function detectRenewTool(exec = runCommand) {
  const cb = await exec("command -v certbot 2>/dev/null");
  if (cb.exitCode === 0 && cb.stdout.trim()) return { tool: "certbot", path: cb.stdout.trim().split("\n")[0] };
  const ac = await exec("command -v acme.sh 2>/dev/null || ls ~/.acme.sh/acme.sh 2>/dev/null");
  if (ac.exitCode === 0 && ac.stdout.trim()) return { tool: "acme.sh", path: ac.stdout.trim().split("\n")[0] };
  return { tool: null };
}

export async function renewCert(entry, exec = runCommand) {
  const { tool, path } = await detectRenewTool(exec);
  if (!tool) return { ok: false, error: "未检测到 certbot 或 acme.sh" };
  const cn = entry.cn || entry.host;
  if (!cn) return { ok: false, error: "无法确定证书域名" };
  const cmd = tool === "certbot"
    ? `certbot renew --cert-name ${shellQuote(cn)}`
    : `${shellQuote(path)} --renew -d ${shellQuote(cn)}`;
  const r = await exec(cmd, { timeout: 120000 });
  const reload = await exec("systemctl reload nginx");
  return { ok: r.exitCode === 0, tool, stdout: r.stdout, stderr: r.stderr, reloaded: reload.exitCode === 0 };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/ssl.test.js`
Expected: PASS（12 条）

- [ ] **Step 5: 提交**

```bash
git add src/ssl.js tests/ssl.test.js
git commit -m "feat(ssl): certbot/acme.sh 续签与 nginx 重载"
```

---

### Task 5: metrics.js 接入 collectSslAll

**Files:**
- Modify: `src/metrics.js`
- Modify: `tests/metrics.test.js`

**Interfaces:**
- Consumes: `collectSslAll`（Task 3）
- Produces: `collectAll(config)` 的 `ssl` 字段来自 `collectSslAll`；删除旧 `collectSsl`。

- [ ] **Step 1: 修改测试导入**

在 `tests/metrics.test.js` 第 3 行的 import 列表中，把 `collectSsl` 替换为 `collectSslAll`：

```js
import { collectAll, collectSystem, collectNetwork, collectServices, collectDatabases, collectSystemd, collectProcesses, collectSslAll, collectConnectivity, collectPorts, collectFirewall, collectNginxLogs, collectPyProcesses, collectDbSlow, collectDockerDetail } from "../src/metrics.js";
```

在文件末尾追加：

```js
test("collectSslAll 无配置时返回 results 数组", async () => {
  const r = await collectSslAll({ sslSites: [] });
  assert.ok(Array.isArray(r.results));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/metrics.test.js`
Expected: FAIL（`collectSslAll` 未从 metrics.js 导出）

- [ ] **Step 3: 实现**

在 `src/metrics.js` 顶部 import 区加入：

```js
import { collectSslAll } from "./ssl.js";
```

删除 `collectSsl` 函数（原第 195-207 行整段），并在 `collectAll` 中把：

```js
    ssl: await safe(() => collectSsl(config.sslSites || [])),
```

改为：

```js
    ssl: await safe(() => collectSslAll(config)),
```

在 `src/metrics.js` 末尾追加 re-export，保持测试可导入：

```js
export { collectSslAll };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/metrics.test.js`
Expected: PASS

- [ ] **Step 5: 全量测试**

Run: `npm test`
Expected: 全部 PASS（确认无其它地方引用旧 collectSsl）

- [ ] **Step 6: 提交**

```bash
git add src/metrics.js tests/metrics.test.js
git commit -m "refactor(metrics): SSL 采集切换到 collectSslAll"
```

---

### Task 6: server.js SSL 列表增删改查接口

**Files:**
- Modify: `src/web/server.js`
- Test: `tests/web.test.js`

**Interfaces:**
- Consumes: `collectSslAll`、`detectRenewTool`（Task 3/4）、`normalizeSslSites`（Task 1）
- Produces:
  - `GET /api/ssl` → `{ results, renewTool }`
  - `POST /api/ssl` `{ type, host?, port?, path?, label? }` → `{ ok, entry }`
  - `PATCH /api/ssl` `{ id, label?, enabled? }` → `{ ok }`
  - `DELETE /api/ssl` `{ id }` → `{ ok }`（discovered 条目 403）

- [ ] **Step 1: 写失败测试**

在 `tests/web.test.js` 末尾追加：

```js
test("SSL 接口：增删改查与手动条目保护", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };

  const add = await fetch(`${base}/api/ssl`, { method: "POST", headers: H, body: JSON.stringify({ type: "remote", host: "example.com", port: "443" }) });
  assert.equal(add.status, 200);
  const { entry } = await add.json();
  assert.ok(entry.id);

  const list = await fetch(`${base}/api/ssl`, { headers: { Cookie: cookie } });
  assert.equal(list.status, 200);
  const data = await list.json();
  assert.ok(data.results.some((r) => r.id === entry.id));
  assert.ok("renewTool" in data);

  const patch = await fetch(`${base}/api/ssl`, { method: "PATCH", headers: H, body: JSON.stringify({ id: entry.id, enabled: false, label: "测试" }) });
  assert.equal(patch.status, 200);

  const del = await fetch(`${base}/api/ssl`, { method: "DELETE", headers: H, body: JSON.stringify({ id: entry.id }) });
  assert.equal(del.status, 200);

  const delDiscovered = await fetch(`${base}/api/ssl`, { method: "DELETE", headers: H, body: JSON.stringify({ id: "d:/etc/nginx/ssl/x.pem" }) });
  assert.equal(delDiscovered.status, 403);

  w.close();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/web.test.js`
Expected: FAIL（`/api/ssl` 返回 404）

- [ ] **Step 3: 实现**

在 `src/web/server.js` 顶部 import 区加入：

```js
import { collectSslAll, detectRenewTool } from "../ssl.js";
import { normalizeSslSites } from "../config.js";
```

在 `startWeb` 开头（`config.sslSites = config.sslSites || [];` 处）改为：

```js
  config.sslSites = normalizeSslSites(config.sslSites);
  config.sslAlerts = config.sslAlerts || { webhook: "", smtp: {} };
```

在 `writeAuth` 之后新增统一的配置持久化 helper：

```js
  const persistConfig = async () => {
    const existing = await readConfigFile();
    const saved = { ...existing, baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, sslSites: config.sslSites, pingTargets: config.pingTargets, sslAlerts: config.sslAlerts };
    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(saved, null, 2));
  };
```

在路由链中（`/api/config` 分支之前）插入 SSL 分支：

```js
      } else if (url.pathname === "/api/ssl" && req.method === "GET") {
        const data = await collectSslAll(config);
        const { tool } = await detectRenewTool();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ...data, renewTool: tool }));
      } else if (url.pathname === "/api/ssl" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { type, host, port, path, label } = JSON.parse(body || "{}");
        if (type === "local" ? !path : !host) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: type === "local" ? "缺少证书路径" : "缺少域名" }));
          return;
        }
        const entry = {
          id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          type: type === "local" ? "local" : "remote",
          host: host || "", port: port || "443", path: path || "",
          label: label || "", enabled: true, source: "manual",
        };
        config.sslSites.push(entry);
        await persistConfig();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, entry }));
      } else if (url.pathname === "/api/ssl" && req.method === "PATCH") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { id, label, enabled } = JSON.parse(body || "{}");
        const entry = config.sslSites.find((e) => e.id === id);
        if (!entry) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "条目不存在" })); return; }
        if (label !== undefined) entry.label = String(label);
        if (enabled !== undefined) entry.enabled = Boolean(enabled);
        await persistConfig();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } else if (url.pathname === "/api/ssl" && req.method === "DELETE") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { id } = JSON.parse(body || "{}");
        const entry = config.sslSites.find((e) => e.id === id);
        if (!entry || entry.source !== "manual") {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "自动发现的证书不可删除" }));
          return;
        }
        config.sslSites = config.sslSites.filter((e) => e.id !== id);
        await persistConfig();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/web.test.js`
Expected: PASS（含新增 1 条）

- [ ] **Step 5: 提交**

```bash
git add src/web/server.js tests/web.test.js
git commit -m "feat(web): SSL 列表增删改查接口"
```

---

### Task 7: server.js 一键续签接口

**Files:**
- Modify: `src/web/server.js`
- Test: `tests/web.test.js`

**Interfaces:**
- Consumes: `renewCert`（Task 4）
- Produces: `POST /api/ssl/renew` `{ id, password }` → `{ ok, ...renewResult }`；密码错 403，非 local 400。

- [ ] **Step 1: 写失败测试**

在 `tests/web.test.js` 末尾追加：

```js
test("SSL 续签：密码错误 403，非 local 400", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const cookie = await registerAndLogin(base);
  const H = { Cookie: cookie, "Content-Type": "application/json" };

  const add = await fetch(`${base}/api/ssl`, { method: "POST", headers: H, body: JSON.stringify({ type: "local", path: "/etc/nginx/ssl/a.pem" }) });
  const { entry } = await add.json();

  const bad = await fetch(`${base}/api/ssl/renew`, { method: "POST", headers: H, body: JSON.stringify({ id: entry.id, password: "wrong" }) });
  assert.equal(bad.status, 403);

  const remote = await fetch(`${base}/api/ssl`, { method: "POST", headers: H, body: JSON.stringify({ type: "remote", host: "a.com" }) });
  const remoteEntry = (await remote.json()).entry;
  const notLocal = await fetch(`${base}/api/ssl/renew`, { method: "POST", headers: H, body: JSON.stringify({ id: remoteEntry.id, password: "secret123" }) });
  assert.equal(notLocal.status, 400);

  w.close();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/web.test.js`
Expected: FAIL（`/api/ssl/renew` 返回 404）

- [ ] **Step 3: 实现**

在 `src/web/server.js` 顶部 import 加入 `renewCert`：

```js
import { collectSslAll, detectRenewTool, renewCert } from "../ssl.js";
```

在 `/api/ssl` DELETE 分支之后插入：

```js
      } else if (url.pathname === "/api/ssl/renew" && req.method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { id, password } = JSON.parse(body || "{}");
        const auth = await readAuth();
        if (!auth || !verifyPassword(password || "", auth)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "密码错误，操作未执行" }));
          return;
        }
        const entry = config.sslSites.find((e) => e.id === id);
        if (!entry || entry.type !== "local") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "仅本机证书文件支持续签" }));
          return;
        }
        const data = await collectSslAll(config);
        const live = data.results.find((r) => r.id === id) || entry;
        const result = await renewCert({ ...entry, cn: live.cn });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/web.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/web/server.js tests/web.test.js
git commit -m "feat(web): SSL 一键续签接口（密码校验）"
```

---

### Task 8: 到期告警判定与通知

**Files:**
- Modify: `src/ssl.js`
- Modify: `src/web/server.js`
- Test: `tests/ssl.test.js`

**Interfaces:**
- Produces:
  - `checkSslAlerts(results, alerts)` → `{ alerts: Array<{key,label,daysLeft,level,notAfter}>, lastNotified }`（纯函数，30 警告 / 7 严重）
  - `sendWebhook(url, payload, fetchImpl?)` → `boolean`
  - `sendEmail(smtp, subject, body, exec?)` → `boolean`
- 接入：`/api/metrics` 采集后评估并推送，`POST /api/config` 接受 `sslAlerts`。

- [ ] **Step 1: 写失败测试**

在 `tests/ssl.test.js` 追加：

```js
import { checkSslAlerts, sendWebhook } from "../src/ssl.js";

test("checkSslAlerts 分级与去重", () => {
  const results = [
    { id: "c1", cn: "a.com", host: "a.com", notAfter: "X", daysLeft: 20 },
    { id: "c2", cn: "b.com", host: "b.com", notAfter: "Y", daysLeft: 3 },
    { id: "c3", cn: "c.com", host: "c.com", notAfter: "Z", daysLeft: 200 },
  ];
  const first = checkSslAlerts(results, { lastNotified: {} });
  assert.equal(first.alerts.length, 2);
  assert.equal(first.alerts.find((a) => a.key === "c1").level, "warn");
  assert.equal(first.alerts.find((a) => a.key === "c2").level, "critical");
  const second = checkSslAlerts(results, { lastNotified: first.lastNotified });
  assert.equal(second.alerts.length, 0);
});

test("sendWebhook 失败不抛错", async () => {
  const ok = await sendWebhook("http://127.0.0.1:1/x", { a: 1 }, async () => { throw new Error("x"); });
  assert.equal(ok, false);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/ssl.test.js`
Expected: FAIL（`checkSslAlerts is not a function`）

- [ ] **Step 3: 实现（ssl.js）**

在 `src/ssl.js` 末尾追加（含 `node:fs/promises`、`node:os`、`node:path` 顶部 import）：

```js
import { writeFile as fsWrite } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
```

```js
export function checkSslAlerts(results = [], alerts = {}) {
  const last = { ...(alerts.lastNotified || {}) };
  const out = [];
  for (const r of results) {
    if (typeof r.daysLeft !== "number") continue;
    const key = r.type === "local" ? `l:${r.path}` : `r:${r.host}:${r.port}`;
    const level = r.daysLeft <= 7 ? "critical" : r.daysLeft <= 30 ? "warn" : null;
    if (!level) continue;
    if (last[key] === r.notAfter) continue;
    out.push({ key, label: r.label || r.cn || r.host || r.path, daysLeft: r.daysLeft, level, notAfter: r.notAfter });
    last[key] = r.notAfter;
  }
  return { alerts: out, lastNotified: last };
}

export async function sendWebhook(url, payload, fetchImpl = fetch) {
  if (!url) return false;
  try {
    await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
    return true;
  } catch { return false; }
}

export async function sendEmail(smtp = {}, subject, body, exec = runCommand) {
  if (!smtp.to) return false;
  const has = await exec("command -v sendmail 2>/dev/null");
  if (has.exitCode !== 0 || !has.stdout.trim()) return false;
  const msg = `To: ${smtp.to}\nFrom: ${smtp.from || smtp.user || "fixflow"}\nSubject: ${subject}\n\n${body}\n`;
  const file = join(tmpdir(), `ff-mail-${Date.now()}.txt`);
  await fsWrite(file, msg);
  const r = await exec(`sendmail -t < ${shellQuote(file)}`);
  return r.exitCode === 0;
}
```

- [ ] **Step 4: 实现（server.js 接入）**

在 `src/web/server.js` import 中加入：

```js
import { collectSslAll, detectRenewTool, renewCert, checkSslAlerts, sendWebhook, sendEmail } from "../ssl.js";
```

在 `/api/metrics` 分支中，`const data = await collectAll(config);` 之后插入告警评估（失败静默）：

```js
        if (data.ssl?.results) {
          try {
            const { alerts, lastNotified } = checkSslAlerts(data.ssl.results, config.sslAlerts);
            if (alerts.length) {
              config.sslAlerts.lastNotified = lastNotified;
              await persistConfig();
              for (const a of alerts) {
                await sendWebhook(config.sslAlerts.webhook, a);
                await sendEmail(config.sslAlerts.smtp, `[Fixflow] 证书即将到期：${a.label}`, `${a.label} 剩余 ${a.daysLeft} 天（${a.notAfter}）`);
              }
            }
          } catch {}
        }
```

在 `/api/config` POST 分支中，把 `sslAlerts` 并入（在解析 body 后）：

```js
        const { baseUrl, apiKey, model, sslSites, pingTargets, sslAlerts } = JSON.parse(body || "{}");
        // ...已有赋值...
        if (sslAlerts && typeof sslAlerts === "object") config.sslAlerts = { ...config.sslAlerts, ...sslAlerts };
```

并把该分支末尾的 `saved` 写入改为调用 `await persistConfig();`（去掉重复的 writeFile 逻辑），返回体中加入 `sslAlerts: config.sslAlerts`。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 6: 提交**

```bash
git add src/ssl.js src/web/server.js tests/ssl.test.js
git commit -m "feat(ssl): 到期告警判定与 webhook/邮件通知"
```

---

### Task 9: 前端 HTML（设置通知字段 + SSL 添加/续签弹窗）

**Files:**
- Modify: `src/web/static/index.html`
- Test: `tests/web.test.js`

**Interfaces:**
- Produces DOM 元素 id：`cfg-ssl-webhook`、`cfg-smtp-host`、`cfg-smtp-port`、`cfg-smtp-user`、`cfg-smtp-pass`、`cfg-smtp-from`、`cfg-smtp-to`、`ssl-add-mask`、`ssl-add-type`、`ssl-add-host`、`ssl-add-port`、`ssl-add-path`、`ssl-add-label`、`ssl-add-save`、`ssl-add-cancel`、`ssl-add-btn`、`ssl-renew-mask`、`ssl-renew-text`、`ssl-renew-password`、`ssl-renew-err`、`ssl-renew-confirm`、`ssl-renew-cancel`。

- [ ] **Step 1: 写失败测试**

在 `tests/web.test.js` 末尾追加：

```js
test("首页包含 SSL 管理所需元素", async () => {
  const w = await makeServer();
  const base = `http://127.0.0.1:${w.server.address().port}`;
  const body = await (await fetch(`${base}/`)).text();
  for (const id of ["ssl-add-mask", "ssl-add-btn", "ssl-renew-mask", "cfg-ssl-webhook", "cfg-smtp-host"]) {
    assert.match(body, new RegExp(`id="${id}"`), `缺少 ${id}`);
  }
  w.close();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/web.test.js`
Expected: FAIL（缺少 `id="ssl-add-mask"`）

- [ ] **Step 3: 实现**

在 `index.html` 设置弹窗（`id="settings-mask"` 的 `.modal`）内、`cfg-model` 字段之后追加：

```html
    <div class="field">
      <label>证书到期告警 Webhook（钉钉/企业微信等，可留空）</label>
      <input id="cfg-ssl-webhook" type="text" placeholder="https://oapi.dingtalk.com/robot/send?access_token=...">
    </div>
    <div class="field">
      <label>邮件通知（SMTP，需系统已装 sendmail）</label>
      <div style="display:flex;gap:6px">
        <input id="cfg-smtp-host" type="text" placeholder="SMTP 主机">
        <input id="cfg-smtp-port" type="text" placeholder="端口" style="width:80px">
      </div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <input id="cfg-smtp-user" type="text" placeholder="用户名">
        <input id="cfg-smtp-pass" type="password" placeholder="密码">
      </div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <input id="cfg-smtp-from" type="text" placeholder="发件人">
        <input id="cfg-smtp-to" type="text" placeholder="收件人（逗号分隔）">
      </div>
    </div>
```

在 `proc-mask` 之前追加两个弹窗：

```html
<div class="modal-mask" id="ssl-add-mask">
  <div class="modal">
    <h2>➕ 添加监控</h2>
    <div class="field">
      <label>类型</label>
      <select id="ssl-add-type">
        <option value="remote">远程域名（外部站点/CDN）</option>
        <option value="local">本机证书文件</option>
      </select>
    </div>
    <div class="field" id="ssl-add-remote-fields">
      <label>域名与端口</label>
      <div style="display:flex;gap:6px">
        <input id="ssl-add-host" type="text" placeholder="example.com">
        <input id="ssl-add-port" type="text" placeholder="443" style="width:80px">
      </div>
    </div>
    <div class="field" id="ssl-add-local-fields" style="display:none">
      <label>证书文件路径</label>
      <input id="ssl-add-path" type="text" placeholder="/etc/nginx/ssl/example.pem">
    </div>
    <div class="field">
      <label>备注（可选）</label>
      <input id="ssl-add-label" type="text" placeholder="如：官网">
    </div>
    <div class="hint" id="ssl-add-err" style="color:var(--bad)"></div>
    <div class="modal-actions">
      <button class="btn" id="ssl-add-cancel">取消</button>
      <button class="btn" id="ssl-add-save">添加</button>
    </div>
  </div>
</div>
<div class="modal-mask" id="ssl-renew-mask">
  <div class="modal">
    <h2>🔄 续签证书</h2>
    <p class="modal-text" id="ssl-renew-text"></p>
    <div class="field">
      <label>登录密码</label>
      <input id="ssl-renew-password" type="password" placeholder="请输入登录密码以验证身份">
      <div class="hint" id="ssl-renew-err" style="color:var(--bad)"></div>
    </div>
    <div class="modal-actions">
      <button class="btn" id="ssl-renew-cancel">取消</button>
      <button class="btn" id="ssl-renew-confirm">确认续签</button>
    </div>
  </div>
</div>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/web.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/web/static/index.html tests/web.test.js
git commit -m "feat(web): SSL 管理弹窗与通知配置表单"
```

---

### Task 10: 前端 app.js 重写 renderSsl 与管理交互

**Files:**
- Modify: `src/web/static/app.js`
- Test: 手动验证（前端无自动化测试框架）

**Interfaces:**
- Consumes: `/api/ssl`、`/api/ssl/renew`、`/api/config`（Task 6-8）
- Produces: `renderSsl(m)` 渲染汇总卡 + 表格 + 操作；添加/续签弹窗交互；修复设置保存。

- [ ] **Step 1: 替换 renderSsl 函数**

把 `app.js` 中原 `renderSsl`（约 483-492 行）整段替换为：

```js
function sslLevel(daysLeft) {
  if (typeof daysLeft !== "number") return "na";
  if (daysLeft <= 7) return "bad";
  if (daysLeft <= 30) return "na";
  return "ok";
}

function sslBar(daysLeft) {
  const pct = typeof daysLeft !== "number" ? 0 : Math.max(0, Math.min(100, Math.round((daysLeft / 90) * 100)));
  const cls = sslLevel(daysLeft);
  return `<div class="ssl-bar"><div class="ssl-bar-fill ${cls}" style="width:${pct}%"></div></div>`;
}

function renderSsl(m) {
  const list = m?.results;
  if (!list) return `<pre>${escapeHtml(m?.error || "N/A")}</pre>`;
  const total = list.length;
  const warn = list.filter((s) => typeof s.daysLeft === "number" && s.daysLeft > 7 && s.daysLeft <= 30).length;
  const expired = list.filter((s) => typeof s.daysLeft === "number" && s.daysLeft <= 7).length;
  const tool = m.renewTool ? `可用（${m.renewTool}）` : "未检测到";
  const summary = `<div class="ssl-summary">
    <span>共 <b>${total}</b> 张</span>
    <span class="na">临期 ≤30 天 <b>${warn}</b></span>
    <span class="bad">严重 ≤7 天 <b>${expired}</b></span>
    <span>续签工具：${escapeHtml(tool)}</span>
    <button class="btn small" id="ssl-add-btn">➕ 添加监控</button>
  </div>`;
  if (!total) return summary + `<pre>（未发现证书，可点击「添加监控」手动添加）</pre>`;
  const rows = list.map((s) => {
    const cls = sslLevel(s.daysLeft);
    const expire = typeof s.daysLeft === "number" ? (s.daysLeft > 0 ? `${s.daysLeft} 天` : "已过期") : "—";
    const name = s.type === "local" ? escapeHtml(s.path) : `${escapeHtml(s.host)}:${escapeHtml(s.port)}`;
    const srcLabel = s.source === "discovered" ? `<span class="tag">自动</span>` : `<span class="tag">手动</span>`;
    const ops = [];
    if (s.type === "local" && m.renewTool) ops.push(`<a href="javascript:void(0)" data-ssl-action="renew" data-ssl-id="${escapeHtml(s.id)}" data-ssl-name="${escapeHtml(s.cn || s.path)}">续签</a>`);
    if (s.source === "manual") {
      ops.push(`<a href="javascript:void(0)" data-ssl-action="toggle" data-ssl-id="${escapeHtml(s.id)}" data-ssl-enabled="${s.enabled !== false}">${s.enabled === false ? "启用" : "停用"}</a>`);
      ops.push(`<a href="javascript:void(0)" data-ssl-action="del" data-ssl-id="${escapeHtml(s.id)}" class="danger">删除</a>`);
    }
    return `<tr><td>${name} ${srcLabel}</td><td>${escapeHtml(s.cn || "—")}</td><td>${escapeHtml(s.issuer || "—")}</td><td>${escapeHtml(s.notAfter || "—")}</td><td class="${cls}">${expire}${sslBar(s.daysLeft)}</td><td>${escapeHtml((s.san || []).join(", "))}</td><td>${escapeHtml(s.label || "—")}</td><td>${ops.join(" ") || "—"}</td></tr>`;
  }).join("");
  return summary + `<div class="card-body"><table class="svc-table"><thead><tr><th>域名/路径</th><th>CN</th><th>签发者</th><th>到期时间</th><th>剩余</th><th>SAN</th><th>备注</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
```

- [ ] **Step 2: 绑定交互（在 renderCards 末尾的 dot 逻辑之后追加事件委托）**

在 `app.js` 顶部 DOM 引用区附近定义元素：

```js
const sslAddMask = document.getElementById("ssl-add-mask");
const sslRenewMask = document.getElementById("ssl-renew-mask");
let sslRenewTarget = null;
```

在 `renderCards` 函数末尾（`cards.appendChild(card)` 循环外）确保仅绑定一次：把以下逻辑放到文件末尾初始化区：

```js
cards.addEventListener("click", async (e) => {
  const a = e.target.closest("[data-ssl-action]");
  if (!a) return;
  const action = a.dataset.sslAction;
  const id = a.dataset.sslId;
  if (action === "renew") {
    sslRenewTarget = { id, name: a.dataset.sslName };
    document.getElementById("ssl-renew-text").textContent = `即将续签：${a.dataset.sslName}，成功后自动重载 nginx。`;
    document.getElementById("ssl-renew-password").value = "";
    document.getElementById("ssl-renew-err").textContent = "";
    sslRenewMask.classList.add("show");
  } else if (action === "del") {
    if (!confirm("确认删除该监控条目？")) return;
    await fetch("api/ssl", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    refreshMetrics();
  } else if (action === "toggle") {
    await fetch("api/ssl", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, enabled: a.dataset.sslEnabled !== "true" }) });
    refreshMetrics();
  }
});

document.getElementById("ssl-add-btn")?.addEventListener("click", () => {
  document.getElementById("ssl-add-err").textContent = "";
  sslAddMask.classList.add("show");
});
document.getElementById("ssl-add-cancel").onclick = () => sslAddMask.classList.remove("show");
document.getElementById("ssl-add-type").onchange = (e) => {
  const local = e.target.value === "local";
  document.getElementById("ssl-add-remote-fields").style.display = local ? "none" : "";
  document.getElementById("ssl-add-local-fields").style.display = local ? "" : "none";
};
document.getElementById("ssl-add-save").onclick = async () => {
  const type = document.getElementById("ssl-add-type").value;
  const body = { type, label: document.getElementById("ssl-add-label").value.trim() };
  if (type === "local") body.path = document.getElementById("ssl-add-path").value.trim();
  else { body.host = document.getElementById("ssl-add-host").value.trim(); body.port = document.getElementById("ssl-add-port").value.trim() || "443"; }
  const res = await fetch("api/ssl", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { document.getElementById("ssl-add-err").textContent = data.error || "添加失败"; return; }
  sslAddMask.classList.remove("show");
  refreshMetrics();
};

document.getElementById("ssl-renew-cancel").onclick = () => sslRenewMask.classList.remove("show");
document.getElementById("ssl-renew-confirm").onclick = async () => {
  const errEl = document.getElementById("ssl-renew-err");
  const password = document.getElementById("ssl-renew-password").value.trim();
  if (!password) { errEl.textContent = "请输入登录密码"; return; }
  errEl.textContent = "";
  const btn = document.getElementById("ssl-renew-confirm");
  btn.disabled = true;
  try {
    const res = await fetch("api/ssl/renew", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sslRenewTarget.id, password }) });
    const data = await res.json();
    if (!res.ok || !data.ok) { errEl.textContent = data.error || data.stderr || "续签失败"; return; }
    sslRenewMask.classList.remove("show");
    refreshMetrics();
  } finally { btn.disabled = false; }
};
```

- [ ] **Step 3: 修复设置保存**

把 `app.js` 中 `cfg-save` 处理里的这两行：

```js
  const sslSites = cfgSslSites.value.trim().split("\n").map((s) => s.trim()).filter(Boolean);
  const pingTargets = cfgPingTargets.value.trim().split("\n").map((s) => s.trim()).filter(Boolean);
  if (sslSites.length) body.sslSites = sslSites;
  if (pingTargets.length) body.pingTargets = pingTargets;
```

替换为通知配置收集：

```js
  body.sslAlerts = {
    webhook: document.getElementById("cfg-ssl-webhook").value.trim(),
    smtp: {
      host: document.getElementById("cfg-smtp-host").value.trim(),
      port: document.getElementById("cfg-smtp-port").value.trim(),
      user: document.getElementById("cfg-smtp-user").value.trim(),
      pass: document.getElementById("cfg-smtp-pass").value,
      from: document.getElementById("cfg-smtp-from").value.trim(),
      to: document.getElementById("cfg-smtp-to").value.trim(),
    },
  };
```

- [ ] **Step 4: 手动验证**

启动面板（`node bin/fixflow.js web` 或项目既有启动方式），登录后进入「SSL 证书」：
- 汇总卡显示总数/临期/严重/续签工具
- 点击「添加监控」可添加远程域名与本机路径，列表出现
- 手动条目可停用/删除；自动发现条目无删除按钮
- 续签按钮仅在 local 且工具可用时出现，点开弹窗输错密码报「密码错误」
- 设置弹窗保存不再报错，通知字段可保存

- [ ] **Step 5: 提交**

```bash
git add src/web/static/app.js
git commit -m "feat(web): SSL 证书页重构（汇总卡/表格/管理交互）"
```

---

### Task 11: 样式与 README

**Files:**
- Modify: `src/web/static/index.html`（`<style>` 内）
- Modify: `README.md`

**Interfaces:**
- Produces: `.ssl-summary`、`.ssl-bar`、`.ssl-bar-fill`、`.tag` 样式；README 更新 SSL 页说明。

- [ ] **Step 1: 加样式**

在 `index.html` 的 `<style>` 中追加：

```css
.ssl-summary { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; font-size: 13px; }
.ssl-summary b { font-size: 15px; }
.ssl-summary .ok { color: var(--ok); } .ssl-summary .na { color: #f59e0b; } .ssl-summary .bad { color: var(--bad); }
.ssl-bar { height: 4px; background: rgba(255,255,255,.1); border-radius: 2px; margin-top: 4px; width: 80px; }
.ssl-bar-fill { height: 100%; border-radius: 2px; }
.ssl-bar-fill.ok { background: var(--ok); } .ssl-bar-fill.na { background: #f59e0b; } .ssl-bar-fill.bad { background: var(--bad); }
.tag { font-size: 10px; padding: 1px 4px; border-radius: 3px; background: rgba(255,255,255,.12); color: var(--muted); margin-left: 4px; }
```

- [ ] **Step 2: 更新 README**

在 README 的功能/监控章节补充 SSL 证书页说明：可视化汇总、自动发现（nginx/目录）、本机+远程监控、一键续签（certbot/acme.sh）、到期告警（页面/Webhook/邮件）。

- [ ] **Step 3: 全量测试**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 4: 提交**

```bash
git add src/web/static/index.html README.md
git commit -m "style(web): SSL 页样式与 README 更新"
```

---

## Self-Review

**Spec coverage:**
- 视觉重构 → Task 10/11（汇总卡 + 进度条 + 表格 + 样式）
- 信息增强（issuer/serial/sigAlgo/SAN/chain）→ Task 2
- 页面内管理列表 → Task 6/9/10
- 本机证书读取（nginx 解析 + 目录扫描 + 手动路径）→ Task 3/6/9/10
- 一键续签/部署 → Task 4/7/10
- 到期告警（页面/Webhook/邮件）→ Task 8/10（页面标色）+ 菜单 dot 沿用既有机制
- 数据模型迁移 → Task 1
- 测试 → 各任务内

**Placeholder scan:** 无 TBD/TODO；所有代码步骤含完整代码。

**Type consistency:**
- 条目结构 `{id,type,host,port,path,label,enabled,source}` 在 Task 1/3/6 一致
- `collectSslAll(config, exec)` 签名在 Task 3/5/6/7 一致
- `renewCert(entry, exec)` 返回 `{ok,tool,stdout,stderr,reloaded,error}` 在 Task 4/7 一致
- `checkSslAlerts(results, alerts)` 返回 `{alerts,lastNotified}` 在 Task 8 定义并使用一致
- 前端 id 与 Task 9 HTML、Task 10 JS 一一对应

**已知取舍（deliberate simplifications）:**
- 邮件仅走系统 `sendmail`（`runCommand` 无 stdin，curl-SMTP 需额外管道；无 sendmail 时静默降级，页面/Webhook 不受影响）。升级路径：扩展 `runCommand` 支持 stdin 或内置最小 SMTP 客户端。
- 告警评估挂在 `/api/metrics` 轮询上（无独立定时器），去重靠 `lastNotified`；面板不打开时不会评估。升级路径：加后台定时器。
