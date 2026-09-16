# fixflow 设计文档

日期：2026-09-16

## 概述

fixflow 是一个零依赖的 Node.js 服务器运维 AI Agent。提供 **CLI 交互会话**
和 **Web 管理面板** 两种界面，共用同一套核心逻辑：大模型（OpenAI 兼容
function calling，默认 Kimi K2.7 Code）在服务器上自主检查问题、给出诊断，
修复操作逐条经用户确认后执行。

Web 面板提供系统/网络/Nginx/防火墙、Python 服务健康、数据库连接、
Docker 容器状态的实时监控展示，并可像 CLI 一样与 Agent 对话。

## 架构

```
                    ┌─────────────────────────────┐
  CLI (bin/fixflow.js)  ──┐                      │
                          ├──►  src/core.js  ◄──  ├──► src/tools.js
  Web 面板 (src/web.js) ──┘    Agent 循环 + 状态  │      run_command
                                (会话列表)        │      read_file
                                                 │      apply_fix
  HTTP/SSE   POST /api/chat                       └──► src/config.js
             POST /api/confirm                        src/status.js (监控采集)
             GET  /api/status (SSE 监控推送)
             GET  /api/metrics (监控 JSON)
             GET  /             (静态 HTML/JS)
```

CLI 与 Web 是核心 `core.js` 的两个驱动。Web 端通过 SSE 实时推送
模型输出 / 工具执行 / 确认请求；用户通过 HTTP 接口提交指令与确认。

## 核心机制（Agent Loop）

```
用户指令 → 调 LLM(历史 + 工具定义) → 模型返回 tool_calls
        → 执行工具（只读命令自动跑 / 修复命令弹确认）→ 结果回喂 → 循环
        → 模型输出最终结论
```

多会话：Web 面板可开多个会话，各自独立历史。CLI 单会话。

## 暴露给模型的工具（function calling）

| 工具 | 权限 | 说明 |
|---|---|---|
| `run_command(cmd)` | 自动执行 | ps/df/grep/curl 等，返回 stdout/stderr/exit code，带超时 |
| `read_file(path)` | 自动执行 | 读日志/配置 |
| `apply_fix(cmd, reason)` | 逐条确认 | 修复命令，执行前暂停展示给用户：`[y/N] 执行: <cmd>` |

"先检查后确认"：检查阶段模型自由跑只读命令；
修复阶段模型必须走 `apply_fix`，每条命令经用户确认。

## 监控指标（Web 面板）

Web 面板定期采集并展示，全部由 `run_command` 底层实现，采集失败
显示 N/A 不中断：

| 模块 | 指标 | 采集方式 |
|---|---|---|
| 系统 | CPU/内存/磁盘/负载/运行时间 | `uptime`、`free`、`df`、`vmstat` |
| 网络 | 端口监听/连接数/延迟 | `ss -tulnp`、`ping` |
| Nginx | 运行状态/配置语法/错误日志尾部 | `nginx -t`、`systemctl status nginx`、`tail` |
| 防火墙 | 状态/规则列表 | `ufw status` 或 `iptables -L` |
| Python 服务 | 进程/端口/健康端点(HTTP状态) | `systemctl`/`ps`、HTTP GET |
| 数据库 | 连接状态/连通性 | `pg_isready`、`mysqladmin ping`、`redis-cli ping` |
| Docker | 容器列表/状态/资源 | `docker ps -a`、`docker stats --no-stream` |

## 配置

- 环境变量：`FIXFLOW_API_KEY`、`FIXFLOW_BASE_URL`（默认
  `https://api.moonshot.cn/v1`）、`FIXFLOW_MODEL`（默认 `kimi-k2.7-code`）
- 配置文件 `~/.config/fixflow/config.json`：
  - 模型/API 配置
  - 监控目标：要检查的 Python 服务（名称、健康检查 URL/端口）、
    数据库实例、Docker（默认本机 docker）
  - 端口（默认 8080）、命令超时（默认 30s）
- 零依赖：Node 内置 `fetch`、`readline`、`http`、`child_process`

## 项目结构

```
fixflow/
  package.json          # bin 入口，type: module
  bin/fixflow.js        # CLI 入口：fixflow 进入交互会话 / fixflow web 启动面板
  src/config.js         # 读取环境变量 + 配置文件
  src/core.js           # AgentLoop（会话状态、历史、工具调度）
  src/tools.js          # run_command / read_file / apply_fix + 确认
  src/metrics.js        # 监控指标采集（系统/网络/Nginx/防火墙/Python/DB/Docker）
  src/agent-client.js   # LLM API 调用（fetch + function calling 解析）
  src/web/              # HTTP server + SSE + 前端 index.html/app.js
```

## 既定决策

- CLI 会话与 Web 面板共用 core.js；bin/fixflow.js 用子命令 `fixflow` / `fixflow web` 区分
- 修复命令逐条确认，不做命令黑名单（全盘访问，确认是唯一闸门）
- 会话内保留历史上下文；不做跨会话持久化
- 以当前用户身份执行命令，不做提权逻辑
- 超时：单条命令默认 30s 可配；输出截断保护（单次 50KB）
- Web 监听 127.0.0.1，无鉴权（本机使用）

## 错误处理

- 工具执行失败不中断 Agent Loop，stderr/exit code 回喂模型
- LLM API 调用失败：会话内提示重试或检查 key
- 监控采集失败显示 N/A
- Ctrl+C 退出 CLI；Web 进程按用户方式管理

## 测试

- 最小可运行检查：模拟 LLM 返回 apply_fix，验证确认/拒绝两路径；
  模拟一个工具采集函数返回结构
- 不引入测试框架