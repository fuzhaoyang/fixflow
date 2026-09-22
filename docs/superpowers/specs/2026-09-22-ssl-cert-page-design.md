# Fixflow SSL 证书页重构

日期：2026-09-22
状态：需求已对齐

## 背景

现有 SSL 证书页是监控模块的一张朴素表格（域名 / 到期时间 / 剩余 / 备注），只展示远程探测的 `notAfter`；域名列表在设置弹窗的文本框里手动维护。本次升级为**完整的 SSL 证书管理页**：可视化重构、证书信息增强、本机证书发现与读取、一键续签/部署、多通道到期告警。全程零第三方依赖，复用现有 `runCommand` 与密码校验模式。

## 目标

1. **视觉重构**：汇总卡 + 进度条 + 表格，替代纯文本表格
2. **信息更丰富**：签发者、签发/到期时间、序列号、签名算法、SAN、证书链
3. **页面内管理监控列表**：增删改、启停、单独刷新，配置从设置弹窗搬进页面
4. **本机证书文件读取**：nginx 配置自动解析 + 常见目录扫描 + 手动路径
5. **一键续签/部署**：自动探测 certbot/acme.sh，续签后重载 nginx，密码确认
6. **到期告警**：页面 + Webhook + 邮件，固定阈值（30 警告 / 7 严重）
7. **数据模型迁移**：`sslSites` 从 `string[]` 升级为对象数组，旧配置自动迁移

## 需求详情

### 一、数据模型与配置迁移

`sslSites` 从字符串数组升级为对象数组：

```js
sslSites: [
  { id: "c1", type: "remote", host: "example.com", port: 443, label: "", enabled: true, source: "manual" },
  { id: "c2", type: "local",  path: "/etc/nginx/ssl/a.pem", label: "", enabled: true, source: "manual" },
]
```

- `id`：服务端生成，格式 `c<递增>` 或时间戳哈希，保证唯一
- `type=remote`：`openssl s_client` 远程探测
- `type=local`：`openssl x509 -in <path>` 本地读文件
- `enabled=false`：保留但不采集
- **迁移**：启动时检测到旧 `string[]`，逐条转换为 `{ type:"remote", host, port:443, enabled:true, source:"manual" }` 并落盘
- 新增通知配置字段：`sslAlerts: { webhook: "", smtp: { host, port, user, pass, from, to } }`

### 二、自动发现（不落盘，刷新时实时合并）

三种来源与手动列表去重后合并展示：

| 来源 | 实现 | 识别键 |
|---|---|---|
| nginx 解析 | `grep -rh ssl_certificate /etc/nginx 2>/dev/null` 收集证书路径 | 文件路径 |
| 目录扫描 | `find` `/etc/nginx/ssl`、`/etc/letsencrypt/live/*`、`/etc/ssl/private` 等常见目录下的 `*.pem|*.crt` | 文件路径 |
| 手动列表 | config.sslSites | host:port / 路径 |

- 去重规则：local 按路径去重（同路径只显示一条）；remote 按 host:port 去重
- 自动发现的条目不可删改，标注来源标签（nginx/目录扫描/手动）
- nginx 不可用时静默跳过，不报错

### 三、证书信息采集

新增 `metrics.js` 函数：

```
readCertFile(path)   → openssl x509 -noout -subject -issuer -dates -serial -fingerprint -ext subjectAltName 解析
probeRemote(host,port)→ openssl s_client -connect host:port -servername host -showcerts + readCert 链信息
discoverNginxCerts() → 解析 nginx 配置 → 证书路径清单
discoverCertDirs()   → 扫描常见目录 → 证书路径清单
collectSslAll(config)→ 合并发现+手动，逐条采集，统一返回
```

每条采集输出：

```js
{
  id, source, type, host, port, path, label, enabled,   // 定位信息
  cn, issuer, notBefore, notAfter, daysLeft,             // 核心信息
  serial, sigAlgo, san: ["a.com","b.com"],               // 增强信息
  error                                                // 读取失败时的原因
}
```

- `daysLeft = floor((notAfter - now) / 86400000)`
- `probeRemote` 用 `-showcerts` 带回证书链长度；`readCertFile` 从文件读完整链
- 远程探测失败（超时/无证书）返回 `error`，不中断整体采集

### 四、后端接口（server.js）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ssl` | 合并列表 + 实时探测结果 |
| POST | `/api/ssl` | 添加手动条目 `{ type, host?, port?, path?, label? }`，校验必填，返回新条目 |
| PATCH | `/api/ssl` | 更新 `{ id, label?, enabled? }` |
| DELETE | `/api/ssl` | 删除手动条目（自动发现条目返回 403） |
| POST | `/api/ssl/renew` | `{ id, password }` 校验面板密码 → 探测续签工具 → 执行续签 → reload nginx，返回输出 |

- 全部走现有 auth 校验（`needsAuth`）
- `renew` 仅接受 `type=local` 条目（远程探测域名无本地证书可续签），否则返回 400
- 手动条目增删改后写回 config.json
- `renew` 密码校验复用 `/api/process` 模式（server.js:325）：`verifyPassword(password, auth)` 失败返回 403「密码错误，操作未执行」
- 续签工具探测：`command -v certbot` / `command -v acme.sh`，取存在的；都没有返回 400「未检测到 certbot 或 acme.sh」
- 执行命令：certbot `certbot renew --cert-name <name>`；acme.sh `acme.sh --renew -d <domain>`（由证书 CN 推导）；成功后 `systemctl reload nginx`

### 五、前端

#### 5.1 页面布局

- 顶部汇总卡：总数 / ≤30 天 / 已过期 / 续签工具状态（certbot/acme.sh 可用性）
- 主表格列：域名·类型 / 签发者 / 到期时间（+剩余天数进度条）/ SAN / 备注 / 操作
- 操作：单独刷新、续签（local 且续签工具可用才显示）、编辑 label、启停、删除
- 添加按钮 → 弹窗选择类型（远程域名 `host:port` / 本机路径）
- 排序：剩余天数升序/降序；筛选：按类型、按状态（正常/临期/过期）
- 删除续签走「续签」确认弹窗，删除走确认框；续签复用现有 `procMask` 密码弹窗

#### 5.2 设置弹窗

- 移除旧 `sslSites` 文本框（管理已搬进页面）
- 新增通知配置：Webhook URL、SMTP（host/port/user/pass/from/to），与模型设置并存于同一弹窗
- 保存走现有 `POST /api/config`，新增字段并入

### 六、到期告警（固定阈值 30 警告 / 7 严重）

- **页面**：表格行标色（≤30 黄、≤7 或已过期红）+ 菜单 dot 红点（已有机制）
- **Webhook**：`fetch` POST JSON `{ cert, daysLeft, notAfter, level }` 到配置的 URL
- **邮件**：零依赖，配置 SMTP 参数后用系统 `sendmail` 或 `curl smtps://` 发送（探测可用性，不可用降级为日志）
- **去重**：config 持久化 `sslAlerts.lastNotified: { <certKey>: <notAfter> }`，同一证书同一 notAfter 只通知一次；续签成功（notAfter 变化）后清除
- 评估时机：每次 `/api/metrics` 采集后在后端执行；通知失败不影响主流程

### 七、测试（node --test）

1. **config 迁移**：旧 `string[]` 自动转对象数组
2. **readCertFile**：测试内用 `openssl req -x509` 生成临时自签证书，验证 CN/issuer/dates/serial/SAN 解析
3. **renew 鉴权**：密码错误返回 403、工具缺失返回 400（依赖注入 mock）
4. **接口**：ssl 增删改查基本流程

## 不做的事

- 不集成自动定时续签（只做手动一键续签）
- 不做证书上传/替换本机文件（只读展示 + 续签工具续签）
- 不接 DNS 验证插件
- 告警阈值固定 30/7，不做每证书单独配置

## 风险与降级

| 场景 | 处理 |
|---|---|
| 无 nginx | 自动发现跳过，手动 local/remote 仍可用 |
| 无 certbot/acme.sh | 续签按钮隐藏/禁用，页面提示工具缺失 |
| SMTP 不可用 | 邮件降级为日志，页面/Webhook 不受影响 |
| 远程探测超时 | 单条标 error，整体不中断 |
