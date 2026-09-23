# Fixflow 告警功能（定时任务 + 每日邮件报表）

日期：2026-09-23
状态：需求已对齐

## 背景

面板需要"告警"能力：用户配置告警内容（一段给模型的指令）、每日固定执行时间与收件邮箱，面板在固定时间自动调用模型生成报表并发送邮件。同时在面板头部放一个红色铃铛入口，弹窗内完成告警的增删改、手动执行与历史查看。零第三方依赖，复用现有 `createSession`（Agent）、`sendEmail`（系统 sendmail）与密码/鉴权模式。

## 目标

1. 头部账户左侧红色铃铛按钮（存在启用告警时常亮红点）
2. 弹窗：告警新增 / 编辑 / 删除 / 启停 / 手动立即执行
3. 每日固定时间自动执行告警指令，模型生成报表发邮件给该告警的收件人
4. 告警弹窗内独立 SMTP 邮箱配置（host / port / user / pass / from），收件人每条独立
5. 定时执行安全：需人工审批的高危操作自动拒绝，结果写入报告
6. 执行历史展示（成功 / 失败 + 摘要）

## 需求详情

### 一、数据模型

`config.json` 新增：

```js
alerts: [
  { id: "a<时间戳>", name: "每日日报", instruction: "检查磁盘、内存和关键服务，生成今日运维日报", time: "09:00", recipients: ["a@x.com"], enabled: true },
]
alertSmtp: { host: "", port: "", user: "", pass: "", from: "" }
```

- `time` 格式 `HH:MM`（本地时区，24 小时制）
- `recipients`：邮箱数组，逗号分隔录入
- `enabled=false` 不参与定时，但保留

执行历史单独文件 `alert-history.json`（config 目录）：

```js
{ "a123": [ { at: "2026-09-23 09:00:12", ok: true, subject: "每日日报", summary: "报告前 500 字", error: "" } ], ... }
```

- 每个告警保留最近 20 条

### 二、后端

#### 2.1 src/alerts.js（新增，零依赖、可单测）

```js
createAlertsManager({ config, configPath, onRun }) → { list(), save(alerts), smtp(), saveSmtp(s), history(id), runNow(id), tick() }
```

- `list()`：返回告警数组
- `save(alerts)`：写回 config.json（`alerts` 字段）
- `smtp()` / `saveSmtp(s)`：读写 `alertSmtp`（pass 脱敏在接口层做）
- `history(id)`：读取该告警最近执行记录
- `runNow(id)`：立即执行一条告警（返回 `{ ok, error? }`）
- `tick()`：调度检查 —— 遍历启用告警，若 `当前 HH:MM >= time` 且 `今天 id 未执行` 则执行；用内存 `Set` 记录 `id:今天` 防重复；面板错过的时间在启动 `tick` 时补执行（当天内）

执行流程（`run`）：
1. 用 `createSession({ config, onConfirm: async () => false, onEvent: () => {}, onUsage })` 创建**独立 session**（不污染聊天历史）
2. `session.send(instruction)` → `finalText`（模型完整回复）作为报告正文
3. 调用 `sendEmail({ ...alertSmtp, to: recipients.join(",") }, name, finalText)`（系统 sendmail）
4. 写历史：`{ at, ok, subject: name, summary: finalText.slice(0,500), error }`
5. 任何异常（模型失败 / sendmail 缺失 / 无收件人）→ `ok:false` + error 入历史

- 定时调度在 `server.js` 用 `setInterval(alerts.tick, 60000)` 驱动；启动时先 `tick()` 一次
- 并发保护：同一告警同一分钟不重复执行（内存标志）

#### 2.2 接口（server.js，全部走现有 auth）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/alerts` | `{ alerts, smtp: {host,port,user,from}（pass 脱敏）, history: { id: [...] }（仅每个最近 3 条） }` |
| POST | `/api/alerts` | 新增 `{ name, instruction, time, recipients[] }`，校验非空 |
| PATCH | `/api/alerts` | `{ id, name?, instruction?, time?, recipients?, enabled? }` |
| DELETE | `/api/alerts` | `{ id }` |
| POST | `/api/alerts/smtp` | 保存邮箱配置 `{ host, port, user, pass?, from }`（pass 留空表示不修改） |
| POST | `/api/alerts/run` | `{ id }` 手动立即执行，返回 `{ ok }` |

`startWeb` 创建 `AlertsManager`，responses 用 `JSON.stringify`。

### 三、前端

#### 3.1 头部铃铛

工具栏 `.conn-wrap` 内、账户按钮左侧加：

```html
<button class="bell-btn" id="bell-btn" title="告警">🔔<span class="bell-dot" id="bell-dot"></span></button>
```

- 有启用中的告警时 `#bell-dot` 显示红色圆点（`/api/alerts` 结果驱动）
- 点击打开告警弹窗

#### 3.2 告警弹窗（`#alert-mask`）

- **告警列表**：`名称 | 时间 | 收件人 | 状态(启用/停用) | 操作(编辑/删除/立即执行)`
- **新增/编辑表单**：名称、每日时间（`<input type="time">`）、收件邮箱（逗号分隔）、指令（textarea）
- **邮箱配置区**：host / port / user / password / from
- **执行历史区**：`at | 成功/失败 | subject | summary`（折叠展示）

### 四、安全与降级

| 场景 | 处理 |
|---|---|
| 定时执行需审批的操作 | `onConfirm` 自动拒绝，拒绝原因入模型上下文/报告 |
| 无 sendmail | 执行 `ok:false`，error「未检测到 sendmail」，历史可见 |
| 无收件人 | 跳过发送，`ok:false` |
| 面板在设定时刻未运行 | 当天内下次 tick 补执行；跨天不补 |
| 模型调用失败 | 报告为空，`ok:false` + error |

### 五、测试（node --test）

1. **alerts manager**（`tests/alerts.test.js`）：
   - 调度：`tick` 在到点后执行一次、同一分钟去重、enabled=false 不执行（注入可控的 session/send/mail 依赖）
   - 历史：保留 20 条、写入格式
   - 立即执行：`runNow` 成功/失败路径（mock send 抛错 → ok:false）
2. **接口**（`tests/web.test.js`）：CRUD、鉴权 401、PATCH 启停、run 400（不存在）
3. **前端元素**（`tests/web.test.js`）：`#bell-btn`、`#alert-mask` 存在

## 不做的事

- 不做真 SMTP 客户端（沿用系统 sendmail）
- 不做补发失败重试 / 告警订阅多面板
- 不做告警对告警的联动（如失败后再发一条）

## 依赖注入点

`createAlertsManager` 支持注入 `runCommand`（sendEmail 用）、`sessionFactory`（默认 SDK 创建独立 session）、`now()`（时钟，便于测试）、`setInterval`。