# Fixflow Nginx 页面重构

日期：2026-09-22
状态：需求已对齐

## 背景

现有 Nginx 页是监控模块的一张朴素文本卡片：`collectNginx()` 只跑 `systemctl is-active nginx` 与 `nginx -t`，前端走通用 `detail(m)` 分支展示 key:value，没有专门渲染。本次升级为**完整的 Nginx 管理页**：可视化服务概览、配置文件查看与在线编辑、保存前校验并自动重载、修改前自动备份、重载/重启操作。全程零第三方依赖，复用现有 `runCommand` 与密码校验模式。

## 目标

1. **服务概览**：状态、版本、配置校验结果、worker 进程数、运行时长、监听端口与站点
2. **配置查看**：列出 `/etc/nginx` 下全部 `.conf`，点击查看内容
3. **配置修改**：在线编辑 → 保存时自动备份 → `nginx -t` 校验 → 通过则替换并 `systemctl reload nginx`，失败回滚
4. **服务操作**：一键重载 / 重启
5. **安全**：修改与重载/重启均需输入面板密码；配置路径限制在 `/etc/nginx` 下防穿越
6. **日志**：页面展示 `error.log` 最近若干行

## 需求详情

### 一、服务概览采集（metrics.js）

扩展 `collectNginx()`，返回结构化对象：

```js
{
  status: { ok: bool, detail: string },          // systemctl is-active nginx
  version: string,                                // nginx -v（stderr 输出）
  config: { ok: bool, detail: string },           // nginx -t
  workers: number,                                // worker 进程数
  uptime: string,                                 // 运行时长
  listens: [{ port: string, serverName: string, file: string }],  // 监听端口与站点
  error: string                                   // nginx 不可用时的原因
}
```

- 版本：`nginx -v 2>&1`，从输出中提取 `nginx/x.y.z`
- worker 进程数：`pgrep -c nginx` 或 `ps -C nginx --no-headers | wc -l`（主进程 + worker）
- 运行时长：`systemctl show nginx -p ActiveEnterTimestamp` 推算，或 `ps -o etimes= -C nginx` 取最大
- 监听端口与站点：`nginx -T 2>/dev/null`（dump 完整合并配置），逐 `server { ... }` 块解析 `listen` 端口与 `server_name`，并记录来源文件（`nginx -T` 输出以 `# configuration file <path>:` 分隔）

nginx 未安装/未运行时，返回 `{ error }`，前端友好提示。

### 二、配置文件读写（metrics.js）

新增函数：

```
listNginxConfs()              → find /etc/nginx -name '*.conf' -type f → [{ path, name }]
readNginxConf(path)           → 校验路径合法 → 读文件内容
writeNginxConf(path, content) → 备份 → 写临时 → nginx -t 校验 → 通过替换 + reload；失败回滚
```

- **路径安全**：所有 `path` 经 `realpath` 解析后必须以 `/etc/nginx/` 开头，否则拒绝（防 `../` 穿越与符号链接逃逸）
- **备份**：写入前复制原文件为 `<path>.bak.<YYYYMMDD-HHMMSS>`，保留最近 5 份（超出删除最旧）
- **校验与回滚**：先把新内容写入 `<path>.tmp`，再替换原文件；执行 `nginx -t`：
  - 通过 → `systemctl reload nginx`，返回成功
  - 失败 → 用备份还原原文件，删除 tmp，返回 `nginx -t` 的 stderr
- **写权限**：面板进程对文件无写权限时，返回明确错误（如「无写入权限，请以 root 运行面板或调整文件属主」）
- 文件不存在或不可读时返回对应错误

### 三、后端接口（server.js）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/nginx/confs` | 配置文件列表 `{ confs: [{ path, name }] }` |
| GET | `/api/nginx/conf?path=` | 读取单个配置 `{ path, content }` |
| POST | `/api/nginx/conf` | 保存 `{ path, content, password }` → 密码校验 → 备份+校验+reload |
| POST | `/api/nginx/reload` | 重载/重启 `{ action: "reload"\|"restart", password }` |

- 全部走现有 auth 校验（`needsAuth`）
- 密码校验复用 `/api/process` 模式：`readAuth()` + `verifyPassword(password, auth)`，失败返回 403「密码错误，操作未执行」
- 保存接口成功返回 `{ ok: true, output }`；`nginx -t` 失败返回 400 + stderr；路径非法返回 400
- reload：`systemctl reload nginx`；restart：`systemctl restart nginx`

### 四、前端

#### 4.1 页面布局（app.js `renderNginx(m)`）

替换现有默认 `detail(m)` 渲染，卡片结构：

- **概览区**：状态徽标、版本、配置校验结果、worker 数、运行时长
- **监听端口表**：端口 / server_name / 来源文件
- **配置文件列表**：文件名 + 「查看」按钮（主配置与站点配置同一列表）
- **操作按钮**：「重载」「重启」
- **最近错误日志**：`error.log` 尾部若干行（复用 `collectNginxLogs`）

#### 4.2 配置编辑弹窗

- 点击文件「查看」→ 弹窗加载内容到 `<textarea>`（只读展示 + 「编辑」切换为可编辑）
- 「保存」→ 弹出密码输入（复用 `procMask` 模式）→ `POST /api/nginx/conf`
- 成功：提示成功、刷新概览与文件列表；失败：在弹窗内显示 `nginx -t` 错误
- 重载/重启按钮同样走密码弹窗

#### 4.3 交互一致性

- 密码弹窗复用现有 `procMask`（标题/说明/密码框/确认），不新增独立弹窗组件
- 操作成功后 `refreshMetrics()` 刷新卡片

### 五、测试（node --test）

1. **路径穿越防护**：`readNginxConf`/`writeNginxConf` 对 `/etc/nginx/../etc/passwd` 等返回拒绝
2. **保存校验失败回滚**：注入 mock `runCommand` 使 `nginx -t` 失败，验证原文件被还原、返回错误
3. **reload 鉴权**：未登录 401、密码错误 403、正确密码执行命令（依赖注入 mock `runCommand`）
4. **配置列表**：`listNginxConfs` 返回结构正确（mock `find` 输出）

## 不做的事

- 不做配置语法高亮 / 富文本编辑器（用原生 `<textarea>`）
- 不做配置文件的增删（只编辑现有 `.conf`）
- 不做 nginx 安装 / 卸载
- 不做访问日志（access.log）分析，仅错误日志
- 不解析全部指令语义，监听端口仅从 `server` 块提取 `listen`/`server_name`

## 风险与降级

| 场景 | 处理 |
|---|---|
| 未安装 / 未运行 nginx | 概览区提示，配置文件区仍可查看（只读），操作按钮禁用 |
| 无 `/etc/nginx` 目录 | 文件列表返回空并提示 |
| 面板无写权限 | 保存返回明确错误提示，不破坏原文件 |
| `nginx -t` 失败 | 自动回滚到备份，弹窗显示错误，不 reload |
| `nginx -T` 不可用 | 监听端口区降级为 `ss -tlnp` 过滤 nginx 进程 |
| 备份文件过多 | 每文件仅保留最近 5 份 |
