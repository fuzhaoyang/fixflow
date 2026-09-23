# Fixflow 总览页 Token 用量图表

日期：2026-09-23
状态：需求已对齐

## 背景

面板的 Agent 对话会调用 LLM API 产生 token 消耗，但目前**没有任何采集**。`agent.js` 的 `chat`/`streamChat` 能拿到 OpenAI 兼容接口的 `usage`（prompt_tokens / completion_tokens），但未解析也未存储。本次新增**每日 token 用量统计**，并在总览页以**柱状图+折线图组合**展示。零第三方依赖，复用现有 echarts 与 runCommand 模式。

## 目标

1. 所有 LLM 调用（chat/completions）的 token 用量被采集
2. 按天聚合：prompt（输入）、completion（输出）、total（总量）
3. 总览页新增第三个 tab「Token 用量」：堆叠柱状图（prompt+completion）+ 折线（total）
4. 数据持久化到 `usage.json`，显示近 30 天、保留 90 天
5. 零依赖、可单测

## 需求详情

### 一、agent.js 解析 usage

- `chat()`（非流式）：从 `data.usage` 解析，返回值加 `usage: { promptTokens, completionTokens, totalTokens }`；无 usage 时为 `undefined`
- `streamChat()`（流式）：抓取流中带 `usage` 的 chunk（OpenAI 兼容接口在流末发送 `usage` 帧），在生成器结束时 yield `{ usage }`；无 usage 时不 yield
- `totalTokens = promptTokens + completionTokens`（接口已给 total 则直接用）

### 二、src/usage.js（新增，纯逻辑可单测）

```js
createUsageStore({ filePath })  → { record(usage), daily(days) }
```

- 内存 `Map<YYYY-MM-DD, {prompt, completion}>`，`record` 累加当天
- `daily(days=30)` → 返回 `[{ date, prompt, completion, total }]`，**无数据的日期补 0**（保证图表连续）
- 持久化：`record` 后写盘 `filePath`（config 目录下 `usage.json`），格式 `{ "YYYY-MM-DD": { prompt, completion } }`
- 留存：写入与读取时清理早于 90 天的条目
- 日期键用本地时区 `YYYY-MM-DD`

### 三、core.js 上报

- `createSession` 增加参数 `onUsage`（默认 no-op）
- `doSend` 多轮 tool-call 循环中，每次 `llmChat` 返回的 usage 累加；**每轮调用后即调用 `onUsage(usage)`**（当日总量在 store 侧累加）
- 流式路径从 `streamChat` yield 的 `{ usage }` 里取；非流式从返回体取

### 四、server.js 接入

- `startWeb` 创建 usage store（路径 `configPath` 同目录下 `usage.json`），注入 `createSession({ onUsage })`
- `GET /api/usage?days=30` → `{ days: [...], }`（需登录）
- `/api/overview` 返回体附 `usage: usageStore.daily(30)`（总览页每 2 秒轮询天然刷新）

### 五、前端

#### 5.1 index.html

- 现有流量/IO 图表卡新增第三个 tab 按钮 `#tab-token`「Token 用量」
- 新增图表容器 `<div id="token-chart">`（与 traffic-chart / io-chart 同级）
- 卡片内新增一行 token 汇总（当日总量、近 30 天总量）

#### 5.2 app.js

- 新增 `tokenChart` echarts 实例，`initOverview` 初始化
- `switchTrafficTab` 扩展支持 `"token"`：
  - 显示 `token-chart`，隐藏 traffic-chart / io-chart / nic-select / 流量 KPI 行
  - tab 按钮高亮切换逻辑沿用现有 `seg-tab` 机制
- 新选项 `tokenChartOption(days)`：x 轴日期，series：
  - 堆叠柱 1：prompt（色 `#3b82f6`）
  - 堆叠柱 2：completion（色 `#ec4899`）
  - 折线：total（色 `#fbbf24`）
- `renderChart()` 分支按当前 tab 渲染对应图表；overview 数据到位后刷新
- 单元：K 为单位展示（tooltip 显示原始值）

### 六、测试（node --test）

1. **usage store**（`tests/usage.test.js`）：
   - record 累加同一天多次
   - daily(7) 补零（含未来无数据天为 0、最近无使用天数补 0）
   - 90 天清理：写入 91 天前的条目后被移除
   - 持久化：record 后文件存在且内容正确；重启加载（新 store 读同一文件）数据仍在
2. **agent usage 解析**（`tests/agent.test.js`）：
   - `chat` 解析 usage（mock fetch）
   - `streamChat` 流末 usage 帧被 yield（mock fetch body 为 ReadableStream）
3. **server**（`tests/web.test.js`）：
   - `/api/usage` 未登录 401
   - `/api/overview` 返回含 `usage` 数组

## 不做的事

- 不做费用/成本估算（无单价配置）
- 不做按模型拆分统计（本期只按天聚合总量）
- 不做使用量告警
- 不统计 `/api/models`（列表接口不消耗 token）

## 风险与降级

| 场景 | 处理 |
|---|---|
| 部分模型流式响应不带 usage 帧 | 该调用不计（显示 0），不造假 |
| usage.json 损坏/缺失 | 按空数据启动，写盘时重建 |
| 时区跨日 | 用面板进程本地时区日期分桶 |
