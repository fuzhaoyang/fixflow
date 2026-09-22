# Fixflow 防火墙页重构

日期：2026-09-22
状态：需求已对齐

## 背景

现有防火墙是监控模块的一张卡片：`collectFirewall()` 只跑 `ufw status` + `iptables -L -n`，前端用 `detail()` 把 JSON 键值对渲染成纯文本；仅在有 `riskyPorts` 时顶部加一行红字提醒。本次升级为**独立的防火墙管理页**：结构化展示 UFW 状态与放行规则、标记对全网开放的高风险端口并给出「一键关闭」入口（删除放行规则 / 添加拒绝规则两种模式，密码确认）。全程零第三方依赖，复用现有 `runCommand`、`verifyPassword` 密码校验与 procMask 弹窗模式。

## 目标

1. **结构化展示**：汇总卡（UFW 状态 / 规则数 / 对全网开放端口数）+ 放行规则表，替代纯文本
2. **风险识别**：解析对全网开放的端口，区分「危险」（数据库 / Redis / 管理面板等常见高风险端口）与「一般」
3. **一键加固**：每个对外开放端口提供「删除放行规则」或「添加拒绝规则」两种关闭模式，密码确认后执行
4. **降级兜底**：无 ufw 时退回现状（iptables 原始输出），不中断整体采集

## 需求详情

### 一、后端数据采集（metrics.js `collectFirewall` 增强）

返回结构升级为：

```js
{
  status: { ok: true, detail: "ufw active" | "ufw 不可用" },
  rules: [
    { num: 1, action: "ALLOW", proto: "TCP", port: "22", from: "Anywhere", comment: "" },
    { num: 2, action: "ALLOW", proto: "TCP", port: "80,443", from: "Anywhere", comment: "web" },
  ],
  riskyPorts: [
    { proto: "tcp", port: 3306, dangerous: true },
    { proto: "tcp", port: 9090, dangerous: false },
  ],
  raw: "ufw status numbered 原文或 iptables -L 原文"   // 降级兜底
}
```

- `rules`：解析 `ufw status numbered` 输出。行格式如 `[ 1] 22/tcp ALLOW IN Anywhere`，兼容：
  - 无序号行（`22/tcp ALLOW IN Anywhere`）
  - 端口范围/逗号（`80,443/tcp`）
  - IPv6 行（`22/tcp ALLOW IN Anywhere (v6)`，来源标 `Anywhere (v6)`，不重复计入 riskyPorts）
  - 只收集 `ALLOW` 且方向为 `IN` 的规则；`DENY`/`LIMIT` 行仅透传，不视为对外开放
- `riskyPorts`：对规则中 `from` 为 `Anywhere`（含 v6）的端口，按数字拆分逐个收集 `{ proto, port }`，并查危险端口表标记 `dangerous`：
  - 危险端口表（proto 默认 tcp）：`3306`(MySQL) `5432`(PostgreSQL) `6379`(Redis) `27017`(MongoDB) `9200`(ES) `8888` `888` `9090` `9000`(管理面板/内网工具) `2375` `2376`(Docker) 标记危险；`22`(SSH) 及其他端口视为一般
  - 非数字端口（如 `http` 服务名）跳过不收集
- 无 ufw（`ufw` 命令不存在 / status 非 active）时：`rules` 为空数组，`raw` 保留 `iptables -L -n` 原文，`riskyPorts` 保留现有正则解析结果，`status.detail` 说明当前兜底模式
- 原有 `iptables -L -n` 的调用保留用于 riskyPorts 兜底，不新增命令

### 二、后端接口（server.js）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/firewall/close` | `{ port, proto, mode, password }` 关闭端口，返回命令输出 |

- 走现有 `needsAuth` 校验（server.js:161）
- 校验顺序与 `/api/process` 一致（server.js:325）：
  1. `verifyPassword(password, auth)` 失败 → 403「密码错误，操作未执行」
  2. `port` 必须为 `1-65535` 整数 → 否则 400「无效的端口」
  3. `proto` 限定 `tcp` / `udp`（默认 `tcp`）→ 否则 400
  4. `mode` 限定 `deny` / `delete` → 否则 400「不支持的关闭模式」
- 命令构造：
  - `deny`：`ufw deny <port>/<proto>`（添加拒绝规则，优先级高、立即生效）
  - `delete`：`ufw delete allow <port>/<proto>`（移除放行规则）
- 执行 `execCmd(cmd, { timeout: 15000 })`，返回 `{ ok: exitCode===0, stdout, stderr }`
- 操作成功后无需落盘任何配置（ufw 自身持久化）

### 三、前端

#### 3.1 页面形态

保留左侧菜单项 `data-filter="firewall"`，点击后 `renderCards()` 分支里对 `key === "firewall"` 渲染专用视图，替换现在的纯文本分支（app.js:408）。数据仍来自 `/api/metrics` 的 `firewall` 字段，无需新增轮询。

#### 3.2 页面布局

```
汇总卡（3 格）：
  UFW 状态      active/inactive/兜底
  放行规则数    rules.length
  对全网开放    端口数（危险端口子计数，>0 标红）

规则表（svc-table）：
  序号 | 动作 | 协议 | 端口 | 来源 | 备注
  对 riskyPorts 中的端口，行背景标红/黄（dangerous 红、一般黄），首列加 ⚠️

风险区卡片（id=firewall-risk）：
  标题「对全网开放的端口」+ 说明文字
  每个端口一行：
    端口协议（如 3306/tcp） + [危险|一般] 标签 + 关闭模式下拉（删除放行规则 / 添加拒绝规则） + 「关闭端口」按钮
  无风险端口时显示「未发现对全网开放的端口 ✅」
```

- 端口来源列：有 comment 显示注释，否则 `—`
- 汇总卡与风险区的数字依据 `riskyPorts` 与 `rules` 实时计算

#### 3.3 关闭操作流程

1. 点「关闭端口」→ 弹现有 `procMask` 密码弹窗（复用 app.js:1184），标题「🛡️ 关闭端口」，正文 `确认关闭端口 3306/tcp（添加拒绝规则）吗？此操作需输入登录密码验证。`
2. 确认 → `POST /api/firewall/close { port, proto, mode, password }`
3. 成功 → 关闭弹窗、`refreshMetrics()` 刷新；403/400 → 弹窗内红字提示（复用 proc-err 展示）
4. 若 ufw 不可用（兜底模式）→ 「关闭端口」按钮禁用，tooltip「UFW 未启用，无法操作」

### 四、测试（node --test，沿用现有 tests/ 结构）

1. **`ufw status numbered` 解析**：mock 输出含 IPv6、端口范围 `80,443`、`Anywhere (v6)`、非 ALLOW 行，断言 rules / riskyPorts / dangerous 标记正确
2. **兜底降级**：ufw 命令失败时返回 iptables 原文 + 现有正则 riskyPorts，不抛错
3. **close 鉴权**：密码错误 403、端口非法 400、mode/proto 非法 400（依赖注入 mock runCommand，参照现有测试风格）

## 不做的事

- 不开放任意规则编辑（增删任意规则），只提供上述两种关闭模式
- 不接 firewalld / nftables 结构化解析（仅 ufw 结构化，其他降级原始输出）
- 不做来源 IP 白名单 / 限制 SSH 来源等进阶加固
- 不做防火墙自启动 / 重启失效检测

## 风险与降级

| 场景 | 处理 |
|---|---|
| 无 ufw（firewalld/nftables/裸 iptables） | 展示降级为原始输出，风险端口仍用现有正则识别，关闭按钮禁用并提示 |
| ufw 未 active | 同降级处理，按钮禁用 |
| `ufw status numbered` 输出格式异常 | rules 为空数组，raw 保留原文可查看，采集不中断 |
| 端口为服务名（如 `http`）| 跳过不收集，不报错 |
