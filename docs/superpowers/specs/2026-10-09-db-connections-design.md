# Fixflow 数据库页：连接管理（P1）

日期：2026-10-09
状态：需求已对齐

## 背景

现有「数据库」菜单页基本是占位：连接靠 `config.databases` 手动配置 `{ name, type }`，后端 `collectDatabases` 只跑 `pg_isready` / `mysqladmin ping` / `redis-cli ping`（无主机/端口/账号参数，只能测本机默认实例），`collectDbSlow` 采集慢查询计数但前端从未展示；页面落到通用 `<pre>` 渲染原始文本，也没有增删改连接的管理界面。

本次（P1）将数据库页升级为**连接管理页**：面板内对 PostgreSQL / MySQL(MariaDB) / Redis / MongoDB / SQLite 五类连接做增删改查与真实连接测试，为后续 B 监控指标 / C 慢查询 / D 运维操作 / E 告警铺路。全程零第三方依赖，复用现有 `runCommand`、`persistConfig` 与密码弹窗模式。

## 目标

1. **连接管理**：面板内新增/编辑/删除/启停数据库连接（类型、主机、端口、库名、用户名、密码、SQLite 文件路径）
2. **真实连接测试**：使用配置的凭据对目标实例做真实连接（TCP + 认证），内联显示结果
3. **凭据安全**：密码允许存 config.json（0600），GET 接口脱敏，命令执行走环境变量不进命令行参数，日志脱敏
4. **五类类型**：PostgreSQL / MySQL / Redis / MongoDB / SQLite，任一客户端 CLI 缺失时明确提示

## 需求详情

### 一、配置模型（config.js）

新增字段 `dbConnections`（`loadConfig` 返回 `normalizeDbConnections(file.dbConnections)`）：

```js
[
  {
    id: "db1",
    name: "生产库",
    type: "postgres",            // postgres | mysql | redis | mongodb | sqlite
    host: "127.0.0.1",
    port: "5432",
    database: "app",
    user: "postgres",
    password: "secret",          // 可空；SQLite 无此项
    path: "",                    // 仅 sqlite：数据库文件路径
    enabled: true,
  },
]
```

- `normalizeDbConnections(list)`：兜底字段缺失（id 生成 `db_${n}`、port 默认、布尔归一），非法 type 过滤并丢弃
- `password` 空串表示未配置密码：连接测试/后续操作需手动输入，不自动连接

### 二、后端接口（server.js）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/db/connections` | 返回连接列表，`password` 一律 `""`（不回传，前端仅显示是否有密码标记 `hasPass`） |
| POST | `/api/db/connections` | `{ name, type, host, port, database, user, password, path, enabled }` 新增，落盘 config |
| PATCH | `/api/db/connections` | `{ id, ...字段 }` 修改；`password` 为空串时保持不变（区别于显式清空，显式清空用 `password: null`） |
| DELETE | `/api/db/connections` | `{ id }` 删除 |
| POST | `/api/db/test` | `{ id, password? }` 连接测试；`password` 缺省时用配置里已存的密码 |

- 全部走现有 `needsAuth` 鉴权
- 校验：`type` 限定五类；SQLite 必须 `path`；其余必须有 `host`/`user`；端口 1-65535
- 落盘复用现有 `persistConfig`（server.js），保存后返回脱敏后的最新列表
- 测试结果 `{ ok, detail, latencyMs }`，不返回任何含密码的输出

### 三、连接测试命令（metrics.js `testDbConnection`）

密码一律走**环境变量**（避免出现在命令行参数/进程列表）：

| 类型 | 命令（示例） | 成功判定 |
|---|---|---|
| postgres | `PGPASSWORD=*** psql -h host -p port -U user -d db -tAc 'select 1'` | exitCode 0 |
| mysql | `MYSQL_PWD=*** mysql -h host -P port -u user db -e 'select 1'` | exitCode 0 |
| redis | `REDISCLI_AUTH=*** redis-cli -h host -p port ping` | 输出含 `PONG` |
| mongodb | `MONGODB_URI='mongodb://user:***@host:port/db' mongosh --quiet --eval 'db.runCommand({ ping: 1 })'` | exitCode 0 |
| sqlite | `sqlite3 path 'select 1'` | exitCode 0（无凭据） |

- host / user / database / path 一律 `shellQuote` 转义，防注入
- password 注入 env，不进命令字符串；MongoDB 密码 URL 编码进 `MONGODB_URI` 环境变量
- CLI 缺失检测：先 `command -v psql/mysql/redis-cli/mongosh/sqlite3`，缺哪个返回明确提示「未安装 xxx，请先安装」
- 超时统一 15000ms；输出截断 + `redactSecrets` 脱敏
- 结果附带 `latencyMs`（命令耗时）

### 四、前端（数据库页）

#### 4.1 页面形态

保留 `data-filter="databases"` 菜单项，`renderCards()` 对 `key === "databases"` 渲染专用视图（替换现有通用 `<pre>` 分支）。数据来自 `/api/db/connections`（独立于 `/api/metrics`，进入页面/轮询时拉取）。

#### 4.2 页面布局

```
顶部工具条：+ 添加连接

连接卡片列表（每条一张卡，grid 自动换行）：
  名称 + 类型标签 + 状态点（enabled/disabled）
  主机:端口 · 库名 · 用户 [· 已存密码]
  操作：测试连接 / 编辑 / 启停 / 删除
  测试结果内联区（成功✓ / 失败✗ + 详情 + 耗时）
```

#### 4.3 新增/编辑表单（modal，复用 SSL 添加表单风格）

- 字段按类型切换：SQLite 只显示「名称 + 路径」；其余显示「名称 + 类型 + 主机 + 端口 + 库名 + 用户 + 密码」
- 密码输入框支持明文切换（复用现有 `.pwd-wrap` + 眼睛按钮模式），留空表示不存密码
- 保存 → `POST/PATCH /api/db/connections`

#### 4.4 测试连接流程

1. 点「测试连接」：若配置无密码 → 弹现有 `procMask` 密码弹窗输入；已有密码 → 直接测
2. `POST /api/db/test { id, password? }` → 内联显示 `✓ 连接成功（12ms）` 或 `✗ <detail>`
3. 失败原因展示（认证失败 / 连接超时 / 未安装 CLI / 主机不可达）

### 五、测试（node --test，沿用 tests/ 结构）

1. **normalizeDbConnections**：缺省字段兜底、非法 type 过滤、id 生成
2. **命令构造**：各类型命令 + `shellQuote` 转义（含引号/特殊字符的 host/user）、密码进 env 不进 argv
3. **test 接口鉴权与校验**：type 非法 / 端口非法 400；依赖注入 mock runCommand（参照现有测试风格）
4. **CRUD 持久化**：POST/PATCH/DELETE 后 config 文件内容正确，GET 不回传密码

## 不做的事（P1 边界）

- 不做监控指标 / 慢查询 / 备份 / Kill 查询 / 告警（后续 P2-P5）
- 不做任意 SQL 执行（查询控制台）
- 不做数据库驱动打包（保持零依赖，依赖系统 CLI）
- 不做连接池 / 心跳保活

## 风险与降级

| 场景 | 处理 |
|---|---|
| 客户端 CLI 未安装 | 连接测试返回明确安装提示，采集不中断 |
| 密码错误 / 主机不可达 / 超时 | 返回失败详情，不抛错 |
| 配置的 password 为空 | 测试时弹窗手动输入；不自动连接 |
| 主机/用户名含 shell 特殊字符 | `shellQuote` 转义，防注入 |
| 输出含密码（罕见回显） | `redactSecrets` 脱敏 + 截断 |
| mongosh 连接串特殊字符 | 密码 URL 编码，进环境变量 |
