# Fixflow 面板负载优化

日期：2026-09-22
状态：需求已对齐

## 背景

生产环境面板因**多会话高频轮询 + 每次采集 fork 大量子进程**形成正反馈振荡：

| # | 问题 | 量化 |
|---|---|---|
| 1 | 多会话高频轮询 | `/api/overview` 2.16 req/s、`/api/metrics` 0.81 req/s，≈4 个并发会话 |
| 2 | 每次采集 fork 大量子进程 | 单次 `/api/metrics` ≈ 30+ 次 exec；overview 7 次 |
| 3 | firewall 采集重灾区 | 每次 5+ 个 `firewall-cmd`（Python 进程 ~27MB RSS），实测 10 个并存、firewalld CPU 22% |
| 4 | 正反馈放大 | 0.8 req/s × 15s 服务时间 ≈ 12 并发 collectAll × 30 fork ≈ 360 fork/s |
| 5 | 僵尸进程无法回收 | 18 个 defunct（firewall-cmd/sh/cat/uname/ss），父进程 fixflow.js web |
| 6 | 长连接与 SSE 堆积 | 128 条 ESTABLISHED，多条服务端 Send-Q 1711~1722B 未发完 |
| 7 | 次要开销 | nginx -t 域名解析触发 sssd_nss、轮询抬高中断等 |
| 8 | 附带风险 | nginx.service boot 时 DNS 未就绪启动失败，当前靠宝塔手动拉起 |

已对齐的三个关键决策：

1. **监控刷新**：降频轮询 + 服务端缓存（**不做** SSE 推送替代轮询）
2. **缓存 TTL**：metrics 3s、overview 2s、firewall 15s、nginx 30s
3. **减 fork 深度**：标准（nginx 采集去 `-t`、`-T`/`-V` 结果缓存、firewall 改 `--list-all` 单命令）；**不做** /proc 全面改造

## 目标

1. **采集缓存 + 并发合并**：服务端对 `collectAll` / `collectStatus` / firewall / nginx 结果做 TTL 缓存（含 in-flight promise 合并），并发请求共享同一份数据，断裂正反馈
2. **减 fork**：单次 `/api/metrics` fork 30+ → **~12**（firewall 缓存后实际远低）
3. **连接治理**：broadcast 跳过不可写客户端、SSE 积压自动断开、非激活标签页暂停轮询
4. 僵尸进程、SSE 堆积、CPU 峰值随之消除

## 需求详情

### 一、服务端采集缓存（`server.js` 新增 TTL 缓存层）

```js
function createTtlCache(ttl) {
  const store = new Map();
  const cache = async (key, fn) => {
    const now = Date.now();
    const hit = store.get(key);
    if (hit && now < hit.until) return hit.promise;   // TTL 内共享同一 promise（并发合并）
    const p = fn().catch((e) => { store.delete(key); throw e; });  // 失败即失效，下次重试
    store.set(key, { promise: p, until: now + ttl });
    return p;
  };
  cache.clear = (key) => store.delete(key);            // 显式失效（如写配置后）
  return cache;
}
```

- `metricsCache = createTtlCache(3000)`：`/api/metrics` 与 `/api/report` 的 `collectAll(config)` 共用 key `"metrics"`
- `statusCache = createTtlCache(2000)`：`/api/overview` 的 `collectStatus()`
- nginx 配置列表缓存 `nginxConfCache = createTtlCache(30000)`：`writeNginxConf` 成功后调用 `nginxConfCache.clear("confs")` 再加 `nginxConfCache("confs", ...)` 或仅清空
- 并发语义：4 个会话 2s/5s 轮询时，服务端实际触发采集 ≈ 每 3s 一次（metrics）/ 每 2s 一次（status），而非 N×轮询间隔

### 二、减 fork（`metrics.js`）

#### 2.1 nginx 采集

`collectNginx()` 当前 6 命令：`systemctl is-active nginx`、`nginx -v`、`nginx -t`、`pgrep -c nginx`、`ps -eo etimes`、`nginx -T`。改为：

- **去掉 `nginx -t`**（配置校验保留在 `writeNginxConf` 写后回滚处）
- `nginx -v`、`nginx -T` **结果缓存 30s**（`createTtlCache(30000)`，key 分 `nginx-version` / `nginx-dump`）

实际每次采集仅 3 次 fork：`systemctl is-active`、`pgrep -c`、`ps ... etimes`。

#### 2.2 nginx 配置列表

`collectNginxConfs()`（`listNginxConfs` / `readNginxConf` / `writeNginxConf` 共用，`nginx -T` 解析）结果缓存 30s。写配置后**主动失效**（`writeNginxConf` 成功后 clear 缓存再重新加载）。

#### 2.3 firewall 采集

`collectFirewall()` 当前：`firewall-cmd --state` + `--get-default-zone` + `--list-ports` + `--list-services` + 每 service 一次 `--info-service`。改为：

- `--state` 探测不变（每次）
- `--get-default-zone` + `--list-all --zone=<zone>`（一次拿 ports + services + rich rules，替代 `--list-ports` + `--list-services` 两次独立调用）
- services 名 → 端口展开仍逐个 `--info-service`，但**整个 firewall 采集结果缓存 15s**（`createTtlCache(15000)`），实际每 15s 才跑一轮
- ufw 路径同样整体缓存 15s

#### 2.4 其他

- `/api/metrics` 里的 `detectRenewTool()`（`ssl.js`）结果缓存 30s

### 三、连接治理（`server.js` + 前端）

#### 3.1 broadcast 可写检查

```js
const broadcast = (event) => {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    if (res.destroyed || res.writableNeedDrain) continue;   // 不读/背压的客户端跳过
    try { res.write(data); } catch { clients.delete(res); }
  }
};
```

#### 3.2 SSE 积压自动断开

`setInterval`（每 15s）扫描 `clients`：`res.writableNeedDrain === true`（客户端缓冲满、不消费）则 `res.destroy()` 并移出集合。

#### 3.3 前端非激活标签页暂停轮询

`initPanel()` 的两个 `setInterval`（metrics 5s、overview 2s）改为变量持有；监听 `visibilitychange`：`document.hidden` 时 `clearInterval` 暂停，恢复可见时重建并立即刷新一次。Agent 对话 SSE 不受影响。

### 四、测试（node --test，沿用现有结构）

1. **createTtlCache**：同 key 连续调用只执行一次 fn 且返回同一引用；TTL 过期后重新执行；fn 抛错后缓存失效可重试
2. **缓存并发合并**：并发两次调用共享同一 promise（采集只触发一次）
3. **broadcast 跳过**：注入 `writableNeedDrain` mock 的 res，断言不被 write
4. **writeNginxConf 后缓存失效**：写成功后下一次 `listNginxConfs` 重新解析

## 不做的事

- 不做 SSE 推送替代轮询（保留轮询 + 缓存）
- 不做 /proc 全面改造（`collectStatus` 仍 7 条命令，靠 2s 缓存降频）
- 不处理系统层：dhclient、AliYunDun、tuned、sssd_nss
- nginx.service boot 失败属部署问题：**建议** systemd unit 加 `After=network-online.target` + `Wants=network-online.target`，不在本 spec 代码内修改

## 风险与降级

| 场景 | 处理 |
|---|---|
| 采集异常 | fn reject → 缓存清除，下次请求重试；不返回陈旧数据 |
| 缓存期间配置变化（改 nginx 配置） | write 成功即清缓存，下次读取即最新 |
| firewall-cmd 不可用 | 按现逻辑降级（iptables/ufw 兜底），缓存照常防护 |
| 单标签特殊情况需要即时数据 | 缓存 ≤3s，感知不明显 |

## 量化预期

- fork：`/api/metrics` 30+ → ~12 次/触发，且触发频率从 ~3/s（多会话叠加）→ 1/3s → 总 fork/s 降 **~95%**
- overview：7 次 fork × 2.16 req/s → 7 次 / 2s = 3.5 fork/s（原 15 fork/s）
- SSE Send-Q 堆积：broadcast 跳过 + 15s 检查自动断开 → 消失
- 僵尸进程：fork 洪泛消失后随 Node 事件循环空闲自然回收