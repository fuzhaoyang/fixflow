# Fixflow 指标阈值告警（Metric Alert）

日期：2026-09-24
状态：需求已对齐

## 背景

现有告警是「每日让模型跑指令生成报表」。本次新增**指标阈值告警**：面板定时采集指标，超阈值且持续一段时间即触发事件，按分级模板发送邮件/Webhook 并在面板提示，支持恢复、升级与告警风暴聚合。零第三方依赖，复用现有 `sendEmail`/SMTP 配置、`sendWebhook`、`createSession`（AI 根因）。

## 目标

1. 规则化指标监测：CPU/内存/磁盘使用率、网络流量、TCP 会话数
2. 超阈值**持续 N 分钟**触发，回落恢复
3. 分级（P1-P5）邮件模板（主题/正文/底部）
4. 未认领超时自动升级
5. 同主机 5 分钟窗口 ≥2 条聚合为一封（含 AI 根因推测）
6. 面板铃铛未读红点 + 事件认领
7. 零依赖、可单测

## 需求详情

### 一、数据模型

`config.json` 新增：

```js
metricAlerts: [
  {
    id: "m<时间戳>", name: "CPU 高负载",
    metric: "cpu"|"mem"|"disk"|"net"|"sessions",
    op: ">="|"<=", threshold: 80, duration: 5,   // duration 分钟
    level: 1, recipients: ["ops@x.com"], enabled: true,
    // 选填：
    env: "", service: "", team: "", owner: "",
    runbookUrl: "", dashboardUrl: "", logUrl: "",
    escalateTo: [], escalateAfter: 30            // 分钟，未认领超时升级
  }
],
panelBaseUrl: "",          // 面板外网地址，用于邮件按钮链接
metricAlertWebhook: ""     // 指标告警 webhook（留空复用 sslAlerts.webhook）
```

事件状态持久化到 `metric-incidents.json`（config 目录）：

```js
{
  seq: 3,                  // 当日序号，用于生成 EVT-ID
  day: "2026-09-24",
  incidents: [
    { id: "EVT-20260924-001", ruleId, level, state: "firing"|"ack"|"resolved",
      startedAt, breachSince, peak, ackedAt, escalatedAt, escalatedLevel, recoveredAt, notifiedAt,
      lastValue, samples: 0 }
  ]
}
```

- 每个规则同时最多一个未结束事件（firing/ack）
- 事件列表保留最近 200 条（含已恢复）

### 二、指标采集（每 60 秒）

新增 `src/metrics-sample.js`（或并入 alerts 模块）：

```js
sampleMetrics({ monitor, run }) → { cpu, mem, disk, net, sessions, host }
```

- cpu：`monitor.cpu()`（百分比）
- mem：`parseFree(free -m 输出)` 的 usedPct
- disk：`parseDf(df -h /)` 根分区 usedPct
- net：最近一次采样所有网卡 rx+tx 速率之和，换算 Mbps（`monitor.net().samples` 末点）
- sessions：`ss -s` 解析 `TCP: N` 或统计 `/proc/net/tcp` 行数
- host：`os.hostname()`；IP：`hostname -I` 首个（缓存）

无 monitor 时用 `runCommand` 现采（cpu 用 `/proc/stat` 差值）。

### 三、判定与生命周期（`src/metric-alerts.js`）

```js
createMetricAlerts({ config, configPath, monitor, onEvent, sample = sampleMetrics, now, exec })
  → { list, save, tick, incidents, ack, tickEscalation, runNow }
```

`tick()`（每 60s 调用）：
1. 采样一次指标
2. 遍历启用规则：
   - 命中（按 op/threshold 比较当前值）：
     - 无未结束事件 → 记录 `breachSince`（连续超阈起点）；当 `now - breachSince >= duration` → **触发**：建事件(firing)、更新 peak、发通知（或进聚合缓冲）
     - 已有事件 → 更新 `lastValue`/`peak`/`samples`
   - 未命中：
     - 有 firing/ack 事件 → **恢复**：state=resolved、`recoveredAt`、发恢复邮件
     - 无事件 → 清 breachSince
3. 升级检查（见五）

阈值比较：`op === ">=" ? value >= threshold : value <= threshold`。

### 四、通知

#### 4.1 主题

- 触发：`[P{level}-{级别名}] {host} {指标名}告警 - {当前值}{单位}（持续{duration}分钟）`
- 恢复：`[恢复] {host} {指标名}已恢复 - {recoveredAt}`
- 升级：`[升级-P{新级别}] {host} {指标名}告警未处理 - 已持续{升级时长}分钟`
- 聚合：`[聚合告警] {host} 发生{n}条告警 - {最早触发时间}`

级别名：1 紧急 / 2 严重 / 3 重要 / 4 一般 / 5 提示。

#### 4.2 正文（HTML）

指标告警邮件正文是**结构化 HTML**（非 Markdown）。在 `src/ssl.js` 增加：`buildMime(smtp, subject, body, { html })` —— 传入 `html` 时 HTML 部分直接用该内容，纯文本部分用 `stripHtml(html)` 或传入的文本；不传 `html` 时沿用现有 `mdToHtml(body)` 逻辑（每日报表告警不受影响）。

三层结构：
1. **行动召唤层**：级别徽标 + 处理时效 + 通知方式；一句话简要；受影响对象（主机名/IP/服务/实例/环境）
2. **诊断决策层**：字段表（指标/阈值/当前值/趋势/持续时间/告警时间 ISO8601/业务标签/负责人/事件ID）
   - 趋势：与 5 分钟前采样比较（↑/↓ 百分比），无历史则 "—"
3. **调查上下文层**：处理建议（按指标内置规则 1-3 条）、Runbook/监控面板/日志链接、关联告警（同窗口其它事件）

底部：`本邮件由智能运维助手自动发送，请勿回复。` + 按钮（查看详情/认领/静默 → `panelBaseUrl`；立即处理 → runbookUrl）+ 支持联系方式（可选，配置项）。

级别处理时效/通知方式内置：
| 级别 | 时效 | 通知 |
|---|---|---|
| P1 紧急 | ≤15 分钟 | 邮件+Webhook（电话/短信标注为不适用） |
| P2 严重 | ≤30 分钟 | 邮件+Webhook |
| P3 重要 | ≤60 分钟 | 邮件+Webhook |
| P4 一般 | ≤4 小时 | 邮件 |
| P5 提示 | ≤24 小时 | 邮件 |

#### 4.3 恢复邮件补充

恢复时间、持续时长（recoveredAt - startedAt）、峰值记录。

#### 4.4 升级邮件补充

升级原因（"原负责人未在 N 分钟内认领"）、新负责人（升级收件人）、升级通知对象。

#### 4.5 渠道

- 邮件：`sendEmail({...alertSmtp, to: recipients}, subject, html)`（复用现有 SMTP 配置）
- Webhook：`sendWebhook(url, payload)`（payload 含 event/level/metric/value/host/incidentId）
- 面板红点：未读未恢复事件数（前端轮询 `/api/metric-alerts` 驱动）

### 五、升级

- 触发时 `escalateAfter` 缺省 30 分钟
- 事件 state=firing 且 `now - startedAt >= escalateAfter` 且未升级过该级别 → 升级：`level = max(1, level-1)`、`escalatedAt`、`escalatedLevel`、state 仍 firing，发升级邮件给 `recipients + escalateTo`
- 认领（ack）后不再升级
- 已到 P1 不再升级

### 六、聚合（告警风暴）

- 触发事件时进入「聚合缓冲」，按 host 分组
- 缓冲 debounce 30 秒（给同窗口事件合并机会）；到期后取该 host **最近 5 分钟窗口**内所有刚触发事件：
  - ≥2 条 → 发送**聚合邮件**（不逐条发）
  - =1 条 → 发送单条触发邮件
- 聚合邮件正文：汇总（总数/最高级别/涉及服务）、告警表格（级别/指标/当前值/持续）、**AI 根因推测**（`createSession` 跑一段分析指令，输入各告警摘要，输出推测）、处理优先级建议
- 事件仍各自进入生命周期（恢复/升级独立）

### 七、后端接口（server.js）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/metric-alerts` | `{ rules, incidents(最近 200), unread, panelBaseUrl, webhook }` |
| POST | `/api/metric-alerts` | 新增规则 |
| PATCH | `/api/metric-alerts` | 改规则 / 启停 |
| DELETE | `/api/metric-alerts` | 删除规则 |
| POST | `/api/metric-alerts/ack` | `{ id }` 认领事件 |
| POST | `/api/metric-alerts/run` | `{ id }` 立即采样并判定该规则（调试） |
| POST | `/api/metric-alerts/settings` | `{ panelBaseUrl, webhook }` |

- 全部走现有 auth
- `startWeb` 创建 metric alerts 实例，`setInterval(tick, 60000)`（有 apiKey 或始终运行；测试可关）

### 八、前端

- 告警弹窗顶部 tab 增加「指标告警」，与「新增/告警列表/执行历史」并列（或改为两级：日报告警 / 指标告警）
- **规则列表**：名称/指标+阈值/级别/状态/操作（编辑/启停/删除/立即检测）
- **规则表单**：核心必填（指标/运算符/阈值/持续/级别/收件人）+ 折叠的选填（标签/负责人/链接/升级收件人+时长）
- **事件列表**：级别徽标/主机/指标/当前值/持续/状态（未认领/已认领/已恢复）/操作（认领）
- 铃铛红点：存在未认领未恢复事件时亮红
- 邮件链接使用 `panelBaseUrl`

### 九、测试（node --test）

1. `tests/metric-alerts.test.js`：
   - 采样解析（ss -s、/proc/net/tcp 计数）
   - 判定：未达持续不触发；达持续触发一次；回落恢复；再次超阈重新触发
   - 升级：未认领超时升一级、最高 P1、认领后不升级
   - 聚合：同主机 5 分钟 ≥2 条走聚合、单条走单发
   - 事件 ID 生成（EVT-YYYYMMDD-NNN）
2. `tests/metric-alert-mail.test.js`：主题格式（触发/恢复/升级/聚合）、正文含三层与字段、恢复补充字段
3. `tests/web.test.js`：接口 CRUD、ack、鉴权

### 十、分阶段实现

- **阶段一**：数据模型 + 采样 + 判定（触发/恢复）+ 触发/恢复邮件 + 规则管理 UI + 面板红点
- **阶段二**：认领 + 升级
- **阶段三**：聚合 + AI 根因

## 不做的事

- 不做电话/短信（无网关），P1 通知方式如实标注"邮件+Webhook"
- 不做自定义命令指标（本期 5 类内置）
- 不做告警规则之间的依赖/静默期高级策略（静默按钮仅前端预留入口）
- 不做趋势的长期存储（仅内存保留近 10 分钟采样点）

## 风险与降级

| 场景 | 处理 |
|---|---|
| 无 `ss`/`/proc/net/tcp` | sessions 采集失败记 0，不触发该项 |
| 网络采样不足（刚启动） | net 项跳过，不判定 |
| 无 SMTP/sendmail | 邮件失败入事件 error，Webhook/面板仍可用 |
| 面板重启 | 事件状态从 `metric-incidents.json` 恢复；重启后重新采样判定 |
| AI 根因调用失败 | 聚合邮件降级为无根因段落 |
| panelBaseUrl 未配 | 邮件按钮指向 runbook/留空，不生成无效链接 |
