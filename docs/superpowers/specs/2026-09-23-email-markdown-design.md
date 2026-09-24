# Fixflow 告警邮件 Markdown 渲染

日期：2026-09-23
状态：需求已对齐

## 背景

告警定时任务把模型生成的报告作为邮件正文发送，但报告是 Markdown 格式（标题、加粗、列表、表格、引用等），当前 `sendEmail` 发的是纯文本单段邮件，客户端原样显示 Markdown 符号，未渲染样式。本次新增**零依赖 Markdown→HTML 渲染**，并改为发送 **multipart/alternative** 邮件（HTML 正文 + 纯文本兜底），样式为浅色简洁风。

## 目标

1. 服务端把报告 Markdown 渲染为带样式的 HTML
2. 邮件改为 `multipart/alternative`（HTML + 纯文本兜底）
3. 支持常用语法：标题、加粗/斜体、列表、表格、引用、围栏代码块、行内代码、链接、分割线
4. HTML 先转义再渲染，防注入
5. 浅色简洁风，内联 CSS，兼容主流邮箱
6. 零依赖、可单测

## 需求详情

### 一、src/markdown.js（新增，纯函数）

```js
mdToHtml(md) → string   // 返回 HTML 片段，块级元素自带内联 style（邮件友好，无需 <style> 块）
```

块级解析（按行）：
- 围栏代码块 ` ``` ` … ` ``` `（可带语言）→ `<pre><code>…</code></pre>`（内部转义，不解析行内）
- 标题 `#{1,6} ` → `<h1>…</h6>`
- 分割线 `---`/`***`/`___` → `<hr>`
- 引用 `> ` → `<blockquote>…</blockquote>`（连续行合并）
- 表格：`| a | b |` + 分隔行 `|---|---|` → `<table><thead>…<tbody>…`
- 无序列表 `- `/`* `/`+ `、有序列表 `1. ` → `<ul>/<ol><li>`
- 其余连续非空行为段落 `<p>`

行内解析（块内文本，**先 HTML 转义**）：
- `**粗**` → `<strong>`；`*斜*`/`_斜_` → `<em>`
- `` `code` `` → `<code>`
- `[文字](url)` → `<a href="url">文字</a>`（url 做转义/协议白名单：仅 http/https/mailto）
- 表格单元格内同样支持行内语法

转义：`& < > "` 先转义；行内代码/代码块内部只转义不再解析。

### 二、src/ssl.js sendEmail 改造

新增 `buildMime(smtp, subject, body)`（导出，便于测试）：
- 构造 MIME 邮件字符串：
  ```
  To: <to>
  From: <fromHeader>            // 非合法邮箱回退 user
  Subject: <rfc2047(subject)>
  MIME-Version: 1.0
  Content-Type: multipart/alternative; boundary="ff-<随机>"
  --ff-<随机>
  Content-Type: text/plain; charset=utf-8
  Content-Transfer-Encoding: base64

  <base64(报告原文)>
  --ff-<随机>
  Content-Type: text/html; charset=utf-8
  Content-Transfer-Encoding: base64

  <base64(HTML 正文)>
  --ff-<随机>--
  ```
- HTML 正文 = 邮件外壳（浅色内联 CSS）+ 顶部「fixflow 报表 · <本地时间>」+ `mdToHtml(body)`
- base64 按 76 字符换行
- 行尾统一 CRLF

`sendEmail(smtp, subject, body, exec)`：
- `msg = buildMime(...)`；host 走 `sendSmtp`，否则 sendmail 写文件发送
- 保持返回 boolean；SMTP 失败 `console.error` 真实原因

邮件 HTML 外壳（浅色简洁风）：
```html
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.7;max-width:760px">
  <div style="color:#6b7280;font-size:12px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;margin-bottom:12px">fixflow 报表 · {time}</div>
  {mdToHtml 结果，块级元素带内联样式}
</div>
```
- h1-h3 加粗、下边距；ul/ol 左内边距；blockquote 左边框灰底；table 全边框、表头浅灰底；pre/code 灰底等宽；hr 灰线

### 三、兼容与降级

| 场景 | 处理 |
|---|---|
| 报告含未支持语法 | 按段落原样（已转义）显示，不报错 |
| 纯文本客户端 | 显示纯文本部分（Markdown 源码） |
| HTML 注入（`<script>` 等） | 转义后不生效 |
| 未配 host（sendmail 路径） | 同样发 multipart 邮件 |

## 不做的事

- 不做完整 CommonMark 支持（仅常用子集）
- 不做图片/附件嵌入
- 不做 Markdown 之外的富文本
- 不改告警指令与调度逻辑

## 测试（node --test）

1. `tests/markdown.test.js`：
   - 标题/加粗/斜体/列表/引用/分割线/段落
   - 表格（表头 + 数据行）
   - 围栏代码块（内部不解析、已转义）
   - 行内代码
   - 链接（合法协议 + `javascript:` 被拒）
   - HTML 转义（`<script>` 不出现为标签）
2. `tests/smtp.test.js`：
   - `buildMime` 含 `multipart/alternative`、`text/plain`、`text/html`
   - HTML 部分 base64 解码后含 `<strong>`、`<table>` 等
   - 纯文本部分解码后含原始报告文本
   - SMTP 集成测试仍通过（发送成功）
