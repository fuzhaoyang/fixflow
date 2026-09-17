# Fixflow 监控强化：系统健康检查 / 进程分析 / 端口扫描

日期：2026-09-17
状态：需求已对齐

## 背景

Fixflow 面板监控功能基础版已上线（系统/进程/网络/防火墙/SSL/Nginx/Python/数据库/Docker/服务）。本次对「系统健康检查」「进程分析」「端口扫描」三个模块做强化，全部零第三方依赖，复用现有 `runCommand`。

## 目标

1. 一键报告升级为**人类可读 Markdown 体检报告**，带健康/警告/异常分级与建议
2. 系统卡片增加**负载阈值判断**、**磁盘使用率>80% 预警**
3. 报告支持**复制**与**下载（Markdown 文件）**
4. 进程列表支持**按 CPU / 内存双维度排序切换**
5. 进程展示**所属 systemd 服务**
6. **异常进程识别**（固定规则：CPU>100% 或单进程内存>总内存 10%）
7. 端口查询支持**多端口批量**（逗号分隔）
8. 端口显示**常见服务名映射**（22→ssh）

## 需求详情

### 一、系统健康检查

#### 1.1 健康分级规则（默认阈值，内置）

| 指标 | 数据源 | 正常 | 警告 | 异常 |
|---|---|---|---|---|
| 磁盘使用率 | `df -P` 每挂载点 | ≤80% | >80% | >90% |
| 内存使用率 | `free` used/total | ≤80% | >80% | >90% |
| 系统负载 | `/proc/loadavg` 1min 对 `nproc` | ≤核数 | 连续超过核数 | — |

- 磁盘按挂载点逐项评估，根分区单独提示
- 内存计算需排除 buffer/cache
- 负载无连续采样，仅按当前 1min 负载 > 核数 × 1.0 判警告（标注为瞬时值）
- 每项输出：状态（✅ 正常 / ⚠️ 警告 / ❌ 异常）+ 关键数值 + 建议文案

#### 1.2 内置建议规则库

```
磁盘使用率 >80%     → "磁盘 {mount} 使用率 {pct}%，建议清理旧日志/扩容"
内存使用率 >80%     → "内存使用率 {pct}%，建议检查常驻进程或扩容"
负载 > 核数         → "1分钟负载 {load} 超过核数 {cpu}，建议排查高 CPU 进程"
单挂载点使用率>90%   → "磁盘 {mount} 使用率超过 90%，属异常，请立即处理"
```

#### 1.3 体检报告结构（Markdown）

```markdown
# Fixflow 系统体检报告
生成时间：2026-09-17 12:00:00

## 总览
| 项目 | 状态 | 摘要 |
|---|---|---|
| 系统负载 | ✅ 正常 | 负载 0.5 / 8 核 |
| 内存 | ⚠️ 警告 | 82% |
| 磁盘 / | ✅ 正常 | 45% |
...

## 系统详情
- uptime / 内存 free 输出 / 磁盘 df 输出

## 风险项
- ⚠️ 磁盘 /data 使用率 85%，建议清理
- ❌ 磁盘 /logs 使用率 95%，请立即处理

## 建议
- 磁盘 /data 使用率 85%，建议清理旧日志或扩容
```

无风险项时「风险项」显示"未发现风险"。

#### 1.4 前端交互

- 系统卡片「生成报告」按钮点击后：
  - 调用新增接口 `GET /api/report`
  - 渲染 Markdown 文本块（保持现有 `pre` 纯文本展示，不做富渲染）
  - 报告上方两个按钮：**复制**（navigator.clipboard）、**下载**（Blob 下载 `.md` 文件）
- 报告在卡片内展示，不跳新页面

### 二、进程分析

#### 2.1 数据扩展

`collectProcesses()` 输出增强：

```json
{
  "top": [
    { "pid": 1234, "user": "root", "cpu": 1.2, "mem": 3.5, "memKb": 35000, "cmd": "nginx", "service": "nginx.service" }
  ],
  "zombies": 0,
  "zombieDetail": "",
  "anomalies": [ "进程 java (PID 1001) CPU 120% 超阈值" ]
}
```

- `ps aux --sort=-%cpu` 全量解析，取 Top 20
- 每进程增加 `service` 字段：从 `/proc/{pid}/cgroup` 读取 systemd 单元名（`cat /proc/{pid}/cgroup` 含 `system.slice/xxx.service`）
- service 匹配失败留空
- 内存字段双份：`%MEM` 与绝对 KB（`ps -o rss`），供排序与阈值判断

#### 2.2 排序切换

- 前端进程卡片加「按 CPU」「按内存」两个排序按钮（或 select）
- 点击后前端对已拉取的 Top 列表按对应字段排序重渲染，**不重新请求后端**（数据已含 memKb）
- 默认按 CPU

#### 2.3 异常进程规则（固定）

- CPU 使用率 > 100%（多核超过单核，`%CPU` 来自 ps 可 >100）
- 或 RSS 内存 > 总内存 × 10%（总内存来自 `free`）
- 命中任一规则 → 进程行标红 + 汇总到 `anomalies` 数组，卡片顶部展示

#### 2.4 前端展示

| PID | 用户 | CPU% | 内存% | 内存 | systemd 服务 | 命令 |
|---|---|---|---|---|---|---|
| 1001 | root | 120% 🔴 | 3.5% | 35MB | nginx.service | nginx: master |

- 异常行红色背景/文字
- 服务列有值显示服务名，无值显示 "—"
- 保留现有僵尸进程提示

### 三、端口扫描

#### 3.1 多端口批量

- `GET /api/metrics?port=22,3306` 支持逗号分隔
- `collectPorts()` 支持端口数组：对每个端口查 `ss -tulnp` 过滤，逐端口返回结果
- 返回结构：

```json
{
  "portScan": {
    "results": [
      { "port": 22, "service": "ssh", "ok": true, "detail": "tcp LISTEN ..." },
      { "port": 3306, "service": "mysql", "ok": false, "detail": "端口 3306 无监听" }
    ]
  }
}
```

#### 3.2 常用端口映射表（内置约 20 个）

| 端口 | 服务 |
|---|---|
| 22 | ssh |
| 25 | smtp |
| 53 | dns |
| 80 | http |
| 110 | pop3 |
| 143 | imap |
| 443 | https |
| 3306 | mysql |
| 5432 | postgres |
| 6379 | redis |
| 8080 | http-alt |
| 8443 | https-alt |
| 9090 | prometheus |
| 27017 | mongodb |
| 9000 | php-fpm/php |
| 9418 | git |
| 5000 | docker-registry |
| 2375 | docker |
| 11211 | memcached |
| 27017 | mongodb |

未知端口显示「未知服务」。

#### 3.3 前端

- 端口输入框 placeholder 改「查端口占用，如 22,3306,80」
- 结果逐端口列出：`22 (ssh) → 监听中/未监听`，未监听端口显示占用进程 detail
- 多端口用分隔线区分

## API 变更

| 接口 | 变更 |
|---|---|
| `GET /api/report` | 新增，返回 Markdown 体检报告纯文本 |
| `GET /api/metrics?port=` | 支持逗号分隔多端口，返回 `portScan.results` |
| `GET /api/metrics` | `processes` 字段结构升级（含 service/anomalies/memKb） |

## 非目标

- 不做健康分级的用户自定义阈值（本期固定默认值）
- 不做进程完整父子树
- 不做负载历史趋势图
- 不做端口扫描的历史记录

## 测试

- metrics：collectProcesses 解析含 service/anomalies 字段；collectPorts 多端口；健康规则函数（mock runCommand 输出）
- web：/api/report 返回非空 Markdown，含分级标记；?port=a,b 返回多结果
