# Fixflow 面板直连访问（对齐宝塔）

日期：2026-09-28
状态：需求已对齐

## 背景

面板当前只监听 `127.0.0.1:2222`，外网访问必须靠 nginx 反代。本次改为**安装后直接 `http://服务器IP:随机端口/<随机入口>/` 访问，不依赖 nginx**，对齐宝塔面板的访问规则：随机端口 + 随机安全入口路径 + 登录。启动时探测并打印内网/公网访问地址。

## 目标

1. 监听 `0.0.0.0`（不再仅回环）
2. 安装/首次运行时生成**随机端口**（10000-65535 空闲）与**随机安全入口路径**（12 位 hex），写入 config
3. 只有带入口前缀的请求可访问，其余 404（防扫描）
4. 启动时探测**内网 IP**（`os.networkInterfaces()`）+ **公网 IP**（外部回显，超时降级），打印完整访问地址
5. 登录鉴权不变
6. 零依赖

## 需求详情

### 一、config.json

```js
{
  port: 12345,            // 安装/首次运行随机生成，可改
  panelPath: "a1b2c3d4e5f6",  // 12 位 hex 安全入口，可改
  ...其余不变
}
```

- `loadConfig` 读取时：无 `panelPath` 保持空（由启动阶段补齐），无 `port` 用默认（见下）
- 生成时机：`startWeb` 启动时若 `config.panelPath` 为空 → 生成 12 位随机 hex 并写回 config.json；`config.port` 缺失或为旧默认 2222 时 → 随机选空闲端口并写回

### 二、端口生成

- 范围 10000-65535；用 `net.createServer` 试听或直接随机后由启动重试逻辑兜底
- 生成后写回 config.json（复用现有 config 写盘）
- 环境变量 `FIXFLOW_PORT` 可覆盖（可选）

### 三、服务端路由（server.js）

- `server.listen(port, "0.0.0.0")`
- 入口前缀 `base = "/" + panelPath`：
  - `url.pathname === base` 或 `base + "/"` → 返回 index.html
  - `url.pathname.startsWith(base + "/")` → `inner = pathname.slice(base.length)`，用 `inner` 路由（app.js / xterm.* / api/* / SSE 等全部如此）
  - 其他（`/`、无前缀 `/api/*`、`/app.js` 等）→ `res.writeHead(404); res.end("Not Found")`
- `/api/*` 的鉴权逻辑不变，只是路径在去前缀后判断
- SSE `/api/stream` 同样去前缀

### 四、IP 探测（启动时一次）

新增 `src/netip.js`（或并入 server.js）：

```js
export function lanIPs()            // os.networkInterfaces() 取非回环 IPv4 数组
export async function publicIP({ fetchImpl = fetch, timeout = 3000 } = {})
  // GET https://api.ipify.org?format=json → { ip }；失败返回 null
```

- 启动打印（`startWeb` 成功后）：
  ```
  面板访问地址：
    内网：http://<lan>:<port>/<panelPath>/
    公网：http://<pub>:<port>/<panelPath>/   （需能出公网 + 安全组/防火墙放行端口）
  ```
- 公网探测失败 → 只打印内网并提示"公网 IP 获取失败（可能无外网）"
- 内网可能有多个（多网卡）→ 逐个打印

### 五、安装/兼容

- postinstall 打印里，把访问地址改为带入口路径的提示（或提示"运行 fixflow web 查看访问地址"）
- 已有 config 无 `panelPath` → 启动时自动生成并写回
- nginx 反代仍可用：转发到 `127.0.0.1:<port>` 并保留路径（README 更新）
- 旧的 `127.0.0.1:2222` 直连不再有效（需带入口路径）

### 六、前端

- 无需改动：所有请求用相对 URL（`api/...`、`app.js`、`xterm.min.js`），页面在 `/<panelPath>/` 下天然带前缀
- 唯一注意：确认没有以 `/` 开头的绝对资源/接口引用（如有需改为相对）

### 七、安全

- 0.0.0.0 暴露公网，靠「随机端口 + 随机入口路径 + 登录」防护（宝塔同款）
- 本次不做 IP 白名单 / 面板 TLS（预留后续）

## 不做的事

- 不做面板 HTTPS（自签证书）
- 不做 IP 白名单
- 不做防火墙自动放行（仅启动提示）
- 不改登录/鉴权逻辑

## 测试（node --test）

1. **panelPath 生成**：`startWeb` 无 panelPath 时生成 12 位 hex 并写回 config
2. **路由**：
   - `/<panelPath>/` → 200（index.html）
   - `/<panelPath>/api/status` → 200
   - `/` → 404
   - `/api/status`（无前缀）→ 404
   - `/app.js`（无前缀）→ 404
3. **IP 探测**：`lanIPs()` 返回非回环地址；`publicIP` 用注入的 fetch 成功/失败/超时三态
4. 现有 web 测试适配（路由前缀）

## 风险与降级

| 场景 | 处理 |
|---|---|
| 无外网 | 公网 IP 为 null，只打印内网 |
| 端口被占用 | 启动 EADDRINUSE 重试（已有）；生成端口时尽量选空闲 |
| 已有用户习惯 127.0.0.1:2222 | 启动打印新地址；README 更新 |
| 多网卡 | 打印全部内网地址 |
| 云安全组未放行 | 启动提示"需在安全组/防火墙放行端口 <port>" |
