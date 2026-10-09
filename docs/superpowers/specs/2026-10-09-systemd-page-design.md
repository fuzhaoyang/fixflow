# Fixflow 服务页扩展（操作 / 详情 / 日志 / 列表增强 / 告警）

日期：2026-10-09
状态：需求已对齐

## 背景

「服务」菜单页目前是只读列表：`collectSystemd()` 只跑 `systemctl show --type=service` + `ps`，返回 name/state/sub/path/CPU/内存/主PID/启动时间；前端 `renderSystemd()` 渲染一张表 + 搜索过滤，**无任何操作能力**（不能启停/重启/开机自启）、无服务详情、无日志、无依赖关系、无告警。

本次将服务页升级为**服务管理页**：提供启停/重启/重载/开机自启操作（登录密码确认 + 危险服务保护）、unit 详情与依赖、内嵌日志查看、列表汇总与筛选、failed 服务告警。全程零第三方依赖，复用现有 `runCommand`、`verifyPassword` 登录密码校验、`procMask` 密码弹窗与 `sslAlerts` 告警通道。

## 目标

1. **服务操作**：每个服务支持 start / stop / restart / reload / enable / disable，登录密码确认，危险服务禁止操作
2. **服务详情**：unit 描述、加载状态、重启次数、退出码、重启策略、依赖（After / Requires / RequiredBy）、单元文件启用状态
3. **服务日志**：页面内展开查看 `journalctl -u` 日志，行数可选
4. **列表增强**：汇总卡（active / failed / inactive）+ 状态筛选 + 单元类型筛选（service / socket / timer）
5. **告警**：新增 failed 服务时发 webhook + 邮件，恢复时通知，带去重

## 需求详情

### 一、数据采集增强（metrics.js `collectSystemd`）

命令升级为：

```
systemctl show --type=service,socket,timer -p Id,ActiveState,SubState,Description,LoadState,NRestarts,ExecMainStatus,Restart,Requires,After,RequiredBy,UnitFileState,FragmentPath,ActiveEnterTimestamp,MainPID,MemoryCurrent --no-pager
```

解析逻辑沿用现有 `split("\n\n")` 分块 + `key=value` 解析，扩展：

- `unitType`：由 `Id` 后缀推断（`.service` / `.socket` / `.timer`，缺省 `service`）
- `desc`：`Description`（默认 `""`）
- `loadState`：`LoadState`（loaded / error / not-found）
- `nRestarts`：`NRestarts`（数字）
- `exitStatus`：`ExecMainStatus`（退出码，`0` 表示无异常）
- `restartPolicy`：`Restart`（no / always / on-failure …）
- `requires` / `after` / `requiredBy`：分别解析 `Requires` / `After` / `RequiredBy`，按空白拆分去空，取每条 unit 名（去掉 `.service/.socket/.timer` 后缀）；无则为 `[]`
- `unitFileState`：`UnitFileState`（enabled / disabled / static / masked …）

返回结构：

```js
{
  summary: { active, failed, inactive, total },   // 由 services 实时统计
  services: [ { name, unitType, state, sub, desc, loadState, nRestarts, exitStatus, restartPolicy, requires, after, requiredBy, unitFileState, path, cpu, mem, memMb, mainPid, started } ],
  error: "systemctl 不可用" | undefined
}
```

- `summary` 统计：`ActiveState === "active"` 计 active；`ActiveState === "failed"` 计 failed；其余计 inactive
- 原有 `serviceKeywords` 过滤逻辑保留（仅过滤 name 前缀），`ps` 取 CPU/内存逻辑保留
- `collectUserProcs` 不变，前端仍合并展示

### 二、服务操作 API（server.js）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/systemd/op` | `{ unit, action, password }` 服务操作 |

校验顺序（与 `/api/process` 一致）：
1. `verifyPassword(password, auth)` 失败 → 403「密码错误，操作未执行」
2. unit 名不合法（含非 `[a-zA-Z0-9_.@-]`）→ 400
3. action 不在 `start / stop / restart / reload / enable / disable` → 400「不支持的操作」
4. **危险服务保护**：unit 名（去掉后缀）匹配黑名单 → 403「系统关键服务，禁止操作」

危险黑名单（沿用进程页保护精神，针对 unit 名）：

```js
const DANGEROUS_UNITS = /^(systemd|systemd-|dbus|NetworkManager|firewalld|networkd|resolved|journald|logind|udevd|sshd?|ssh|lightdm|gdm|sddm|display-manager|dde-|kwin|plymouth|getty|user@)/;
```

- 执行命令：`systemctl <action> <unit>`（unit 先补全 `.service` 若缺失且无后缀），`execCmd` 执行，`timeout: 20000`
- 成功/失败均记操作日志（复用 `system-ops.json`，op 标记 `systemd:<action>`）
- 返回 `{ ok, stdout, stderr }`；前端危险服务行操作按钮禁用

### 三、服务日志 API（server.js）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/systemd/logs` | `{ unit, lines }` 服务日志 |

- `lines` 钳制 50–2000（默认 200）
- 命令：`journalctl -u <unit> -n <lines> --no-pager -o cat`
- unit 补全 `.service`；返回 `{ ok, content }`，内容 `redactSecrets` 脱敏 + 截断

### 四、前端（app.js `renderSystemd` 重构）

页面形态（保留 `data-filter="systemd"` 菜单与搜索框）：

```
汇总卡：运行 active / 失败 failed / 停止 inactive / 总数
筛选：状态 tab（全部/运行/失败/停止）+ 类型 select（全部/service/socket/timer）
表格列：类型 | 名称 | 状态 | CPU | 内存% | 内存MB | PID | 启动时间 | 操作
```

- 每行操作按钮（按状态/单元文件状态显示）：
  - `active` 状态 → 停止 / 重启 / 重载；`inactive` → 启动
  - `unitFileState === "enabled"` → 「禁用开机自启」；否则 → 「启用开机自启」
  - 危险服务（name 匹配黑名单）→ 操作按钮全部禁用，tooltip「系统关键服务，禁止操作」
- 操作流程：点按钮 → 现有 `procMask` 密码弹窗（kind `systemd-op`，标题/正文含 unit 与动作）→ `POST /api/systemd/op`
- **行展开详情**（点击名称展开）：描述、加载状态、重启次数、退出码、重启策略、单元文件状态、依赖（After / Requires / RequiredBy 列表）、unit 路径
- **内嵌日志**：详情区提供行数 select（50/200/500/1000）+ 加载按钮 → `POST /api/systemd/logs` → 渲染 `<pre>`，支持「跟随」按钮（展开时每 5s 重新拉取一次）
- 危险保护名单与后端一致（前端复用同一正则判断按钮禁用）

### 五、告警（E，server.js）

- 新增周期检测：`setInterval(checkFailedServices, 60000)`（复用现有 `metricAlertTimer` 同生命周期，`deps.noAlertsTimer` 时跳过）
- `checkFailedServices()`：
  - 收集当前 failed 服务集合 `failedNow`（`systemctl --state=failed --no-legend` 解析 unit 名）
  - 对比 `lastFailedSet`（内存）：
    - **新增** failed 服务 → 发 webhook（`config.sslAlerts.webhook` 或 `metricAlertWebhook`）+ 邮件（`config.sslAlerts.smtp`，主题 `[Fixflow] 服务进入失败状态：<name>`）
    - **恢复**（原 failed 现正常）→ 发「已恢复」通知
  - 更新 `lastFailedSet`；失败静默（catch 吞掉）
- 首次启动 `lastFailedSet = null`（不触发存量 failed 告警，仅从运行期开始监测）
- 面板「服务」菜单状态点：`summary.failed > 0` 时标 `bad`

### 六、测试（node --test，沿用 tests/ 结构）

1. **collectSystemd 解析**：mock `systemctl show` 输出（含多属性、多依赖、`.socket/.timer` 类型），断言 unitType / requires / after / requiredBy / nRestarts / summary 统计正确
2. **op 接口**：密码错误 403、非法 action 400、**危险 unit 403**、合法操作命令构造正确（依赖注入 mock runCommand，参照现有测试风格）
3. **日志接口**：lines 钳制、命令构造、返回 content
4. **告警去重**：`checkFailedServices` 逻辑——新增触发、恢复触发、无变化不触发（提取为可注入函数测试）

## 不做的事

- 不做服务配置编辑（改 unit 文件 / daemon-reload 自动应用）
- 不做 socket/timer 的独立管理页（仅展示与筛选）
- 不做远程主机服务管理
- 不做 failed 服务的自动恢复（只告警，不自动重启）

## 风险与降级

| 场景 | 处理 |
|---|---|
| 服务过多导致 systemctl show 输出大 | 沿用现有 `split("\n\n")` 分块解析，一次采集不超时（`runCommand` 默认 30s） |
| 依赖属性为空 | `requires/after/requiredBy` 返回 `[]`，前端显示「—」 |
| journalctl 无权限/不可用 | 返回错误内容，前端显示失败原因 |
| 操作关键服务 | 前后端双重黑名单拦截，返回 403 |
| failed 服务检测命令失败 | 本轮静默跳过，下轮重试 |
| `systemctl show` 新增属性在旧 systemd 缺失 | 属性解析容错（缺字段给默认值），不中断采集 |
