# Fixflow 运维管家

Fixflow 是一款运行在服务器上的 **AI 运维 Agent**：连接大模型（OpenAI 兼容 API，支持 function calling），自动检查服务器状态、诊断问题，并通过工具（执行命令、读取文件等）实际帮你处理。

- **两种界面**：终端 CLI 交互会话（`fixflow`）与 Web 监控面板（`fixflow web`）
- **安全第一**：所有写入 / 删除 / 修改操作必须经你确认后才执行
- **零第三方依赖**：仅依赖 Node.js ≥ 18 内置能力（fetch、readline、http 等）

## 目录

- [它是什么](#它是什么)
- [工作原理](#工作原理)
- [环境要求](#环境要求)
- [安装](#安装)
- [快速开始](#快速开始)
- [配置](#配置)
- [CLI 使用](#cli-使用)
- [Web 面板](#web-面板)
- [Agent 工具与安全模型](#agent-工具与安全模型)
- [操作日志](#操作日志)
- [常见问题](#常见问题)
- [开发](#开发)

## 它是什么

Fixflow 把大模型接到你的服务器上，让它像一个有运维权限的助手：

- 用自然语言描述问题，Agent 会自动调用命令/工具去查，例如「检查磁盘占用」「防火墙开了哪些端口」「看看 Nginx 配置有没有问题」。
- 发现问题后，Agent 会给出修复方案；需要改动系统时（删除文件、安装软件、重启服务等），它会先弹出确认，你点头才执行。
- 配合 Web 面板，还能实时监控 CPU / 内存 / 磁盘 / 网络端口 / Nginx / 防火墙 / Python 服务 / 数据库 / Docker，并保持一个长会话。

适合：个人服务器、小型业务服务器、日常巡检与排障。它不是外部 SaaS，而是直接跑在你自己服务器上的程序。

## 工作原理

```
你 ──(自然语言)──> Fixflow ──> LLM（OpenAI 兼容 API, function calling）
                        │  ^
                        v  │
                工具调用（执行 shell / 读文件 / 修复命令）
                        │
                写入类操作 ──> 弹确认 ──y/n──> 执行/拒绝
```

- Agent 通过 function calling 让模型决定调用哪些工具。
- 只读诊断命令自动执行；命中**写操作关键词**（见下方安全模型）的命令转为「确认后执行」。
- 模型本身拿不到你的服务器，工具层是唯一的执行出口，安全闸门在确认环节。

## 环境要求

| 项 | 要求 |
|---|---|
| Node.js | ≥ 18（内置 fetch，无需 npm 依赖） |
| 大模型 API | OpenAI 兼容的 `/chat/completions` 与 `/models` 网关 |
| 权限 | 建议以有运维权限的用户运行（root 可修复系统级问题） |
| 网络 | 服务器能访问 LLM API；面板仅监听 `127.0.0.1` |

## 安装

### 从 npm 安装（全局）

```bash
npm i -g fixflow
```

### 本地测试安装

```bash
npm pack                                # 生成 fixflow-0.1.0.tgz
npm i -g ./fixflow-0.1.0.tgz --prefix /tmp/test-fixflow
HOME=/tmp/test-home /tmp/test-fixflow/bin/fixflow
```

### 检查安装

```bash
fixflow --version      # 输出版本号，如 0.1.0
```

### 更新 / 卸载

```bash
npm update -g fixflow
npm uninstall -g fixflow
```

> 卸载不会删除 `~/.config/fixflow/` 下的配置、历史与日志（API Key、会话历史、操作日志），如需彻底清除请手动删除该目录。

## 快速开始

安装后第一次运行，若未配置会进入交互式配置向导：

```bash
fixflow
```

向导步骤：

1. **API 地址**（回车使用默认 `https://api.openai.com/v1`）
2. **API Key**
3. 自动拉取网关的**模型列表**，输入编号选择，或直接输入模型名
4. 配置写入 `~/.config/fixflow/config.json`，并打印面板地址与 CLI 用法

之后运行：

```bash
fixflow        # 进入 CLI 交互会话
fixflow web    # 启动 Web 面板
```

## 配置

配置来源（优先级从高到低）：**环境变量 > 配置文件** `~/.config/fixflow/config.json`。

| 环境变量 | 配置文件键 | 默认值 |
|---|---|---|
| `FIXFLOW_API_KEY` | `apiKey` | 必填，无默认 |
| `FIXFLOW_BASE_URL` | `baseUrl` | `https://api.openai.com/v1` |
| `FIXFLOW_MODEL` | `model` | `kimi-k2.7-code` |
| — | `port` | `2222`（面板监听端口） |
| — | `services` | `[]`（Python 服务健康检查列表） |
| — | `databases` | `[]`（数据库探活列表） |

配置示例：

```json
{
  "apiKey": "sk-xxxxxxxxxxxxxxxxxxxx",
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-4o",
  "port": 2222,
  "services": [
    { "name": "订单服务", "url": "http://127.0.0.1:8000/health" }
  ],
  "databases": [
    { "name": "主库", "type": "postgres" },
    { "name": "缓存", "type": "redis" }
  ]
}
```

`databases` 支持类型：

| type | 探活命令 |
|---|---|
| `postgres` | `pg_isready` |
| `mysql` | `mysqladmin ping` |
| `redis` | `redis-cli ping` |

> 端口说明：默认端口为 `2222`，无需配置即可访问；如需改端口，直接在配置 `port` 字段或面板设置中修改。

## CLI 使用

```bash
fixflow
```

进入 REPL 后直接输入运维指令，例如：

```
> 检查磁盘占用并汇报
> Nginx 配置有问题吗，帮我看看 /etc/nginx/
> 防火墙开了哪些端口
> 帮我清理 /var/log 下 30 天前的日志
> 这个服务器上跑了哪些 Docker 容器
```

### CLI 内置命令

| 命令 | 作用 |
|---|---|
| `clear` / `清除历史` / `清空历史` | 清空当前会话历史（对话上下文） |
| `exit` / `quit` | 退出会话 |
| `Ctrl+C` | 强制退出 |

### 写操作确认

所有写入、删除、修改类命令（`rm`、`mv`、`sed -i`、`apt install`、`systemctl restart`、重定向 `>` 等）执行前都会弹确认，输入 `y` 执行，其他输入拒绝：

```
[y/N] 执行: rm -f /var/log/nginx/old.log
```

## Web 面板

```bash
fixflow web
```

浏览器访问 `http://127.0.0.1:2222`（默认仅监听本机，端口见启动输出或配置）。

### 监控

左侧菜单查看，每 5 秒自动刷新：

- **系统**：uptime、内存（free -m）、磁盘（df -h）
- **网络**：监听端口（ss -tulnp）
- **Nginx**：运行状态 + 配置语法检查（nginx -t）
- **防火墙**：ufw 状态 + iptables 规则
- **Python 服务**：配置的 HTTP 健康检查（`services`）
- **数据库**：探活（`databases` 配置）
- **Docker**：容器列表与状态

### 对话

与 CLI 相同的 Agent 会话，支持：

- Markdown 渲染（标题、列表、表格、代码块、引用、链接）
- 图片上传（按钮或 Ctrl+V 粘贴，发送给模型做视觉识别）
- 修复请求以「确认执行 / 拒绝」按钮呈现（不再是终端 y/N）
- 停止按钮中止当前请求，与 LLM API 的 120s 超时

### 设置

左下角 ⚙️ 可修改 API 地址 / Key / 模型（模型下拉自动拉取），保存后热更新生效，无需重启。

### 清空历史

输入框上方「清空历史」按钮，或对话中让模型调用清空工具。

## Agent 工具与安全模型

### 工具列表

| 工具 | 权限 | 用途 |
|---|---|---|
| `run_command(cmd)` | 自动执行（写类命令需确认） | 执行命令检查/操作；命中写入/删除/修改关键词或重定向时，转为确认后执行 |
| `read_file(path)` | 自动执行 | 读取日志、配置文件 |
| `apply_fix(cmd, reason)` | 逐条确认 | 修复命令，执行前必须经你确认 |
| `clear_history` | 自动执行 | 清空会话历史（指令中要求清除历史时触发） |

### 安全模型

- **只读命令自动执行**：`ps` / `df` / `cat` / `grep` / `curl` 等
- **写类命令一律确认**：匹配到删除 / 修改 / 安装 / 服务操作等关键词，或含重定向（`>`、`>>`、`2>`）、管道喂给解释器（`python -c`、`bash -c` 等），即使当前用户是 root 也需确认
- **以当前用户身份执行**：root 跑就是 root，确认是写操作的唯一闸门
- 命令输出上限 50KB，超出截断

### 会话历史

- CLI：会话内保留，`clear` 命令清空
- Web：历史持久化到服务端文件 `~/.config/fixflow/history.json`（跨浏览器、跨重启保留），刷新后自动恢复，可一键清空；最多保留最近 200 条
- 模型也可通过 `clear_history` 工具在用户要求时清空历史

## 操作日志

CLI 每次操作记录到 `~/.config/fixflow/cli.log`：

```bash
tail -f ~/.config/fixflow/cli.log      # 实时跟踪
tail -20 ~/.config/fixflow/cli.log     # 最近 20 条
grep "失败" ~/.config/fixflow/cli.log  # 查错误
```

记录内容：指令、工具调用、确认结果、耗时、错误。

## 常见问题

- **LLM API 400/401**：检查 `apiKey`/`baseUrl` 是否正确，可用 `curl $FIXFLOW_BASE_URL/models` 验证网关。
- **首次运行没进向导**：说明已有配置（环境变量或 config.json）。
- **端口被占用**：修改配置 `port` 或结束占用进程。
- **监控显示 N/A**：对应命令不可用（如未装 nginx/docker），不影响其他模块。
- **Agent 无响应/卡住**：LLM 请求超过 120s 会自动超时报错返回（日志记录），可查看 `cli.log` 定位。
- **想换模型**：Web 面板设置里改，或改配置 `model`。

## 开发

```bash
npm test                 # 运行全部测试（node:test）
node bin/fixflow.js      # 本地直接跑 CLI（未全局安装时）
node bin/fixflow.js web  # 本地直接跑面板
```