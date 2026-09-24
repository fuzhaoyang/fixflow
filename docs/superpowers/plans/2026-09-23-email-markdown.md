# 告警邮件 Markdown 渲染 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 按 superpowers:executing-plans 执行。

**Goal:** 报告 Markdown 渲染为浅色简洁 HTML，邮件改为 multipart/alternative（HTML + 纯文本兜底）。

**Architecture:** 新增 `src/markdown.js`（纯函数 `mdToHtml`），`src/ssl.js` 新增 `buildMime` 并改造 `sendEmail`。零依赖。

**Spec:** `docs/superpowers/specs/2026-09-23-email-markdown-design.md`

## Global Constraints
- 零依赖；`npm test`；行尾 CRLF；先转义再渲染；链接协议白名单 http/https/mailto。

---

### Task 1: src/markdown.js + 测试

**Files:** Create `src/markdown.js`; Create `tests/markdown.test.js`

**Interfaces:** `mdToHtml(md)` → HTML 片段（元素自带内联 style）

- [ ] **Step 1: 写失败测试** `tests/markdown.test.js`：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { mdToHtml } from "../src/markdown.js";

test("标题/加粗/斜体", () => {
  const h = mdToHtml("# 标题\n\n**粗** 和 *斜*");
  assert.match(h, /<h1[^>]*>标题<\/h1>/);
  assert.match(h, /<strong>粗<\/strong>/);
  assert.match(h, /<em>斜<\/em>/);
});

test("列表", () => {
  const h = mdToHtml("- a\n- b\n\n1. x\n2. y");
  assert.match(h, /<ul[^>]*>[\s\S]*<li[^>]*>a<\/li>[\s\S]*<li[^>]*>b<\/li>[\s\S]*<\/ul>/);
  assert.match(h, /<ol[^>]*>[\s\S]*<li[^>]*>x<\/li>[\s\S]*<li[^>]*>y<\/li>[\s\S]*<\/ol>/);
});

test("表格", () => {
  const h = mdToHtml("| A | B |\n|---|---|\n| 1 | 2 |");
  assert.match(h, /<table[^>]*>/);
  assert.match(h, /<th[^>]*>A<\/th>/);
  assert.match(h, /<td[^>]*>1<\/td>/);
});

test("引用与分割线", () => {
  const h = mdToHtml("> 注意\n\n---");
  assert.match(h, /<blockquote[^>]*>[\s\S]*注意[\s\S]*<\/blockquote>/);
  assert.match(h, /<hr/);
});

test("围栏代码块内部不解析且转义", () => {
  const h = mdToHtml("```\n**x** <b>\n```");
  assert.match(h, /<pre/);
  assert.ok(h.includes("**x**"));
  assert.ok(h.includes("&lt;b&gt;"));
  assert.ok(!h.includes("<strong>"));
});

test("行内代码", () => {
  assert.match(mdToHtml("运行 `ls -l`"), /<code[^>]*>ls -l<\/code>/);
});

test("链接协议白名单", () => {
  assert.match(mdToHtml("[官网](https://x.com)"), /href="https:\/\/x\.com"/);
  assert.ok(!/javascript:/.test(mdToHtml("[x](javascript:alert(1))")));
});

test("HTML 转义防注入", () => {
  const h = mdToHtml("<script>alert(1)</script>");
  assert.ok(!h.includes("<script>"));
  assert.ok(h.includes("&lt;script&gt;"));
});
```

- [ ] **Step 2: 运行确认失败** `node --test tests/markdown.test.js` → FAIL

- [ ] **Step 3: 实现** `src/markdown.js`：

```js
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const CODE_STYLE = "background:#f3f4f6;padding:1px 5px;border-radius:4px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px";
const PRE_STYLE = "background:#f3f4f6;padding:10px 12px;border-radius:6px;overflow:auto;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;white-space:pre-wrap";

function inline(text) {
  const codes = [];
  let s = esc(text).replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => `<a href="${/^(https?:|mailto:)/i.test(u) ? u : "#"}" style="color:#2563eb">${t}</a>`);
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code style="${CODE_STYLE}">${codes[Number(i)]}</code>`);
  return s;
}

const isBlock = (l) => /^(#{1,6}\s|```|\s*>|\s*[-*+]\s|\s*\d+\.\s)/.test(l) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l) || /^\s*\|.*\|\s*$/.test(l);

export function mdToHtml(md) {
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const HS = { 1: "font-size:20px;margin:16px 0 8px", 2: "font-size:17px;margin:14px 0 6px", 3: "font-size:15px;margin:12px 0 6px" };
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      i++;
      const buf = [];
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre style="${PRE_STYLE}"><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const header = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      out.push(`<table style="border-collapse:collapse;margin:8px 0;font-size:13px"><thead><tr>${header.map((c) => `<th style="border:1px solid #e5e7eb;background:#f9fafb;padding:5px 9px;text-align:left">${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #e5e7eb;padding:5px 9px">${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { const lvl = Math.min(h[1].length, 3); out.push(`<h${lvl} style="${HS[lvl]}">${inline(h[2])}</h${lvl}>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push(`<hr style="border:none;border-top:1px solid #e5e7eb;margin:14px 0">`); i++; continue; }
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      out.push(`<blockquote style="border-left:3px solid #d1d5db;background:#f9fafb;margin:8px 0;padding:6px 12px;color:#4b5563">${inline(buf.join(" "))}</blockquote>`);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*+]\s+/, "")); i++; }
      out.push(`<ul style="margin:6px 0;padding-left:22px">${items.map((t) => `<li style="margin:3px 0">${inline(t)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++; }
      out.push(`<ol style="margin:6px 0;padding-left:22px">${items.map((t) => `<li style="margin:3px 0">${inline(t)}</li>`).join("")}</ol>`);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlock(lines[i])) { buf.push(lines[i]); i++; }
    out.push(`<p style="margin:8px 0">${inline(buf.join(" "))}</p>`);
  }
  return out.join("\n");
}
```

- [ ] **Step 4: 运行确认通过** `node --test tests/markdown.test.js` → PASS

- [ ] **Step 5: 提交** `git add src/markdown.js tests/markdown.test.js && git commit -m "feat(markdown): 零依赖 Markdown→HTML 渲染"`

---

### Task 2: ssl.js buildMime + sendEmail 改造

**Files:** Modify `src/ssl.js`; Modify `tests/smtp.test.js`

**Interfaces:** `buildMime(smtp, subject, body)` → MIME 字符串

- [ ] **Step 1: 改测试** `tests/smtp.test.js`：import 加 `buildMime`；新增用例并把原断言改为检查 multipart。

```js
import { sendEmail, buildMime } from "../src/ssl.js";

test("buildMime 生成 multipart/alternative 且 HTML 已渲染", () => {
  const msg = buildMime({ from: "a@x.com", to: "b@x.com", user: "u" }, "日报", "# 标题\n\n**粗体**\n\n| a | b |\n|---|---|\n| 1 | 2 |");
  assert.match(msg, /Content-Type: multipart\/alternative/);
  assert.match(msg, /text\/plain/);
  assert.match(msg, /text\/html/);
  const grab = (type) => {
    const m = msg.match(new RegExp(`Content-Type: ${type}; charset=utf-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`));
    return Buffer.from(m[1].replace(/\r\n/g, ""), "base64").toString("utf8");
  };
  const html = grab("text/html");
  assert.match(html, /<h1/);
  assert.match(html, /<strong>粗体<\/strong>/);
  assert.match(html, /<table/);
  assert.ok(grab("text/plain").includes("**粗体**"));
});
```

原「AUTH LOGIN 直连」用例断言改为：
```js
    assert.ok(commands.some((c) => c === "MAIL FROM:<a@x.com>"));
    assert.ok(commands.some((c) => c === "RCPT TO:<b@x.com>"));
    assert.ok(commands.some((c) => c.startsWith("Content-Type: multipart/alternative")));
```
「from 回退 user」用例保留 `MAIL FROM:<u>`，并把 `From: u` 断言保留（在 MIME 头里）。

- [ ] **Step 2: 运行确认失败** `node --test tests/smtp.test.js` → FAIL

- [ ] **Step 3: 实现** `src/ssl.js`：import `mdToHtml`；新增：

```js
import { mdToHtml } from "./markdown.js";

const pad2 = (n) => String(n).padStart(2, "0");
function wrapHtml(inner, date = new Date()) {
  const t = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  return `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.7;max-width:760px">`
    + `<div style="color:#6b7280;font-size:12px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;margin-bottom:12px">fixflow 报表 · ${t}</div>`
    + inner + `</div>`;
}

export function buildMime(smtp, subject, body) {
  const fromHeader = /^[^@\s<>]+@[^@\s<>]+$/.test(String(smtp.from || "")) ? smtp.from : (smtp.user || "fixflow");
  const b64 = (s) => Buffer.from(s, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  const boundary = `ff-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const html = wrapHtml(mdToHtml(body));
  return [
    `To: ${smtp.to}`,
    `From: ${fromHeader}`,
    `Subject: ${rfc2047(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(String(body)),
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}
```

`sendEmail` 改为：

```js
export async function sendEmail(smtp = {}, subject, body, exec = runCommand) {
  if (!smtp.to) return false;
  const msg = buildMime(smtp, subject, body);
  if (smtp.host) {
    const r = await sendSmtp({ ...smtp, message: msg });
    if (!r.ok) console.error(`[fixflow] SMTP 发送失败: ${r.error}`);
    return r.ok;
  }
  const has = await exec("command -v sendmail 2>/dev/null");
  if (has.exitCode !== 0 || !has.stdout.trim()) return false;
  const file = join(tmpdir(), `ff-mail-${Date.now()}.txt`);
  await fsWrite(file, msg);
  const r = await exec(`sendmail -t < ${shellQuote(file)}`);
  return r.exitCode === 0;
}
```

（删除旧的 `msg = To/From/Subject...` 单段构造；`rfc2047` 保留。）

- [ ] **Step 4: 运行确认通过** `node --test tests/smtp.test.js tests/alerts.test.js` → PASS

- [ ] **Step 5: 提交** `git add src/ssl.js tests/smtp.test.js && git commit -m "feat(ssl): 邮件改 multipart/alternative，正文 Markdown 渲染为 HTML"`

---

### Task 3: 全量测试与收尾

- [ ] **Step 1: 全量测试** `npm test` → 新增全绿，仅剩基线 17 条 sandbox 失败
- [ ] **Step 2: 重启面板** 让用户点「立即执行」查看 HTML 邮件效果

## Self-Review

**Spec 覆盖**：markdown 渲染 → Task 1；multipart/alternative + HTML 外壳 + base64 → Task 2；测试 → 各任务。

**类型一致**：`mdToHtml(md)`、`buildMime(smtp, subject, body)`、`sendEmail` 返回 boolean 全一致。