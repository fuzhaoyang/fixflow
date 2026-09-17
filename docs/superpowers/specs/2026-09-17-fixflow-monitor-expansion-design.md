# Fixflow 监控扩展设计

日期：2026-09-17
状态：已批准（分节对齐）

## 背景

Fixflow 面板现有监控：系统、网络、Nginx、防火墙、Python 服务、数据库、Docker、服务（systemd）、总览。本次按菜单分类适配 10 项运维能力，全部先做基础可用版。

## 目标

- 每个菜单项对应清晰的功能域，数据实时（5s 刷新或手动查询）
- 不引入第三方依赖，复用 `runCommand`
- 失败模块显示 N/A，不影响其他模块
- 一键出报告（监控页内）

## 菜单与功能映射

| 菜单 | 归属功能 | 新增内容 |
|---|---|---|
| 系统 | 健康检查 | 一键报告按钮 |
| 进程（新） | 进程分析 | 资源占用 Top20、僵尸进程识别 |
| 网络 | 端口扫描 + 连通性 | 指定端口占用查询、ping/域名解析检测 |
| 防火墙 | 规则审查 | 开放风险端口识别 |
| SSL 证书（新） | 证书监控 | 有效期、到期预警 |
| Nginx | 诊断 | 错误日志 tail、站点列表 |
| Python 服务 | 服务检查 | 进程存活 |
| 数据库 | 连接测试 | 慢查询检测 |
| Docker | 容器监控 | 资源占用、日志、重启次数 |

## 配置扩展

`config.json` 新增字段：

```json
{
  "sslSites": ["example.com", "api.example.com"],
  "pingTargets": ["1.1.1.1", "baidu.com"]
}
```

- 面板设置页新增「SSL 监控域名」与「连通性目标」编辑（多行文本，一行一个）
- 保存后写回 config.json，热更新
- 手动输入用于临时查询，不覆盖配置

## 数据采集（metrics.js）

全部复用 `runCommand`，失败返回 `{error}`：

- `collectSystem`（已有）：uptime/free/df
- `collectProcesses()`：`ps aux --sort=-%cpu | head -20`，`ps -eo stat,comm | grep -c Z` 统计僵尸
- `collectPorts(port?)`：`ss -tulnp`；指定端口时 `ss -tulnp` 过滤 + `lsof -i :PORT` 进程
- `collectConnectivity(targets)`：对每个目标 `ping -c 2`、`getent hosts`；可选 traceroute
- `collectSsl(sites)`：对每个域名 `echo | openssl s_client -connect host:443 2>/dev/null | openssl x509 -noout -dates` 解析有效期，计算剩余天数，<30 天预警
- `collectNginxLogs()`：`tail -50 /var/log/nginx/error.log`；站点 `ls /etc/nginx/sites-enabled`
- `collectPyServices()`：`pgrep -fl python` + venv 检测
- `collectDbSlow()`：mysql `SHOW GLOBAL STATUS LIKE 'Slow_queries'` / postgres 慢查询统计 / redis `INFO stats` slowlog
- `collectDockerDetail()`：`docker stats --no-stream` + `docker logs --tail 30 --timestamps` + `docker inspect -f` 重启次数

## 前端（index.html / app.js）

- `MODULES` 新增：进程、SSL 证书
- 需参数菜单（网络/SSL/连通性）：卡片上方输入框 + 查询按钮，与搜索框同机制（仅对应视图显示）
- 状态点：异常模块红点，正常绿点
- 一键报告：系统卡片「生成报告」按钮，聚合全部指标渲染为 Markdown 文本块（可复制）

## API

`/api/metrics` 扩展字段：processes、ssl、dbSlow、dockerDetail 等。`/api/config` GET/POST 支持新配置字段。

## 测试

- metrics.test.js：各新采集函数不抛错、字段存在
- web.test.js：/api/config 保存 sslSites/pingTargets

## 非目标

- 不做钉钉/邮件告警推送
- 不做历史趋势图
- 不做 SSL 自动续期
