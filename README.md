# Fixflow 运维管家

[![npm](https://img.shields.io/npm/v/fixflow.svg)](https://www.npmjs.com/package/fixflow)

Fixflow 是一款装在你自己服务器上的 **AI 运维助手**。用大白话说话，它就能帮你检查服务器、发现问题、并（在你确认后）动手修好。

```
你：「看看磁盘还够不够用」
Fixflow：调用命令检查 → 汇报磁盘使用情况 + 给出建议
```

- 不用懂 Linux 命令，用中文描述就行
- 所有删除、修改、安装类操作，**必须你点头才执行**
- 免费开源自用，零第三方依赖，只要求服务器有 Node.js ≥ 18

---

## 一、开始之前，你需要准备

1. **一台 Linux 服务器**（云服务器或自己的机器都行），能用 SSH 登录
2. **一个"大模型 API Key"**

### 什么是 API Key？

API Key 相当于"大模型的钥匙"，去模型服务商官网注册一个账号，创建一个 Key，复制粘贴即可。新用户通常有免费额度，够日常用。

| 服务商 | 注册地址 | 说明 |
|---|---|---|
| DeepSeek | https://platform.deepseek.com | 便宜、国内直连，推荐新手 |
| Moonshot Kimi | https://platform.moonshot.cn | 中文对话能力强 |
| OpenAI | https://platform.openai.com | 需海外网络 |

> 登录官网 → 找到「API Keys / 密钥管理」→ 创建一个 → 复制 Key（形如 `sk-xxxxxxxx`）。**别把这个 Key 发给任何人**。

3. **Node.js ≥ 18**（Fixflow 的运行环境，见下方安装）

---

## 二、安装

> 安装需要 root 权限：会注册 systemd 面板服务，并尝试放行本机防火墙端口。

### 方式 A：npm 全局安装（推荐）

```bash
sudo npm i -g fixflow
```

### 方式 B：离线安装

内网或没有 npm 源时，把 `fixflow-*.tgz` 安装包传到服务器，然后：

```bash
sudo npm i -g ./fixflow-*.tgz
```

如果同目录还提供了 `install.sh`，也可以直接 `bash install.sh`，脚本会自动匹配最新的 `fixflow-*.tgz`，并先检查 Node.js。

### 检查装好没有

```bash
fixflow --version
```

看到版本号（如 `0.1.0`）就装好了。

> 安装完成后终端会直接打印面板访问链接；如果当时没保存，运行 `fixflow default` 重新获取，格式见「四、打开面板」。

---

## 三、配置（跟着走，5 分钟）

运行：

```bash
fixflow
```

会进入配置向导，一共 4 步：

1. **选服务商**：输入编号选 DeepSeek / Kimi / OpenAI（地址自动填好，不用懂"API 地址"）
2. **粘贴 API Key**：回车后自动联网校验，错了会提示你重新粘贴
3. **选模型**：从拉到的模型列表输编号
4. **选是否启动面板**：输入 `y`（推荐），面板立刻后台运行

完成后自动自检，看到 **「✅ 全部正常」** 就成功了。

> 之前配置过想重配：`fixflow` 会沿用旧配置；想彻底重来：`rm -rf ~/.config/fixflow` 再运行 `fixflow`。
>
> **每次重新安装（`npm i -g` 覆盖）后会自动要求重新配置**模型 / 地址 / Key（旧配置不会静默沿用）。覆盖前旧配置会显示在向导里，并自动备份为 `~/.config/fixflow/config.json.bak`，需要时可恢复。

### 随时自检

```bash
fixflow doctor
```

自动检查 Node 版本 / 配置 / 大模型连通性 / 面板服务，哪项有问题会给修复建议。

---

## 四、打开面板

配置时选了「启动面板」的话，安装/配置向导结束会**直接打印访问链接**。端口和入口路径是随机生成的，实际以终端输出为准，例如：

```text
面板访问地址（请确保安全组/防火墙放行端口 12345）：
  http://192.168.1.20:12345/ab12cd34/
  http://203.0.113.10:12345/ab12cd34/
  https://192.168.1.20:8443/ab12cd34/
```

- `http://内网IP:端口/入口/`：局域网内访问
- `http://公网IP:端口/入口/`：公网访问，需要云厂商安全组和本机防火墙都放行该端口
- `https://IP:8443/入口/`：面板自带 HTTPS（自签证书，浏览器首次访问会提示不安全，确认继续即可）

忘了地址或入口，随时在服务器运行 `fixflow default` 重新打印：

```bash
fixflow default
```

> 首次打开需要用面板注册账号；登录后所有危险操作还会二次确认。下面这些功能都在左侧菜单或「Agent 对话」里。

面板功能：
- **账号登录**：首次访问需注册账号密码（存于 config.json），之后登录使用；会话 12 小时有效
- **监控总览**：负载 / CPU / 内存 / 磁盘 / 面板内存环形图，流量 / 磁盘IO / Token 用量图表（时间范围可回看 7 天，按分钟聚合存于 `~/.config/fixflow/monitor-history.jsonl`）；系统 / 网络 / Nginx / 防火墙 / 黑白名单 / 数据库 / Docker / SSL 证书 / 服务 / 日志分页，自动刷新
- **服务管理**：systemd 服务的启停 / 重启 / 重载 / 开机自启（危险服务保护 + root / sudo 密码确认）、详情与依赖、内嵌日志、failed 告警
- **SSL 证书**：自动发现（解析 nginx 配置 + 扫描常见目录）+ 手动添加（远程域名 / 本机证书路径），展示签发者 / 到期时间 / 剩余天数进度条 / SAN；本机证书可一键续签（自动探测 certbot / acme.sh 并重载 nginx，需输入 root / sudo 密码）；到期前 30 天警告、7 天严重，页面标色 + Webhook + 邮件通知
- **日志 / 终端 / 文件管理**：系统与 Docker 日志检索（搜索 / 跟随 / 导出 / AI 分析）、内置 Web 终端、文件浏览 / 上传 / 下载 / 编辑
- **告警管理**：日报告警（SMTP）+ 指标告警（CPU / 内存 / 磁盘 / 网络流量 / TCP 会话数阈值与级别）+ 服务下线/恢复通知，面板内存超限横幅提示
- **自动化**：独立「自动化」页管理规则，支持服务下线、指标阈值、HTTP 探测、定时四种触发；动作支持重启/重载服务、白名单命令、Webhook；内置冷却、每小时限次、失败退避、运行历史和审计。创建规则推荐在「Agent 对话」右侧点击「自动化」进入自动化模式，用自然语言同时生成规则和本机测试脚本，脚本内可查看触发条件、动作、verify 断言，点「运行测试」在本机真实执行（需二次确认，失败会自动恢复服务）
- **事件与复盘**：事件列表和复盘列表都支持搜索、分页、单个/批量删除；删除需要输入 root / sudo 密码二次验证（面板以 root 运行时也会降权校验，不会出现任意密码都通过）。事件每页 5 条，复盘每页 15 条
- **AI 对话**：直接打字让助手干活，回复逐字显示，修复操作弹「确认执行/拒绝」；自动化模式和普通对话共用同一个聊天窗和历史
- **设置**：左下角齿轮，随时改 Key / 模型 / 面板内存上限 / 退出登录

> 面板监听 `0.0.0.0`，用「随机端口 + 随机入口路径」保护（无入口前缀的请求返回 404）；启动时会尝试自动放行本机防火墙端口。想让**其他电脑**也能打开，见下面「五、绑定域名（可选）」，或用面板「黑白名单」按 IP 限制访问。
> 忘记密码：在服务器上运行 `fixflow reset-password` 重置。CLI（`fixflow` 命令）不受登录限制。

### 服务下线自动修复 + 邮件通知（示例）

以 nginx 为例：

1. 在「告警 → 邮箱配置」填好 SMTP 和收件人，先发一封测试邮件确认可达
2. 打开「Agent 对话」，点击输入栏中的「自动化」进入自动化模式
3. 描述需求，例如：`nginx 挂了就重启，测试脚本先停 nginx 再断言恢复`
4. 模型返回规则和测试脚本；点「应用」打开规则弹窗，检查后「保存」
5. 点「运行测试」可在本机真实停服/恢复，确认 verify 断言通过；也可以直接用「立即运行」
6. 之后 nginx 下线时：自动重启并按冷却/退避重试；持续未恢复 5 分钟后合并发一封「自动化未恢复」，之后 1 小时、再每 6 小时提醒一次；恢复后发一封「自动化已恢复」。防抖窗口内自愈不发邮件，重试过程不再逐次发邮件

> 已有启用 `service_down` 规则的服务，原来的下服务监控不会再重复发下线/恢复邮件，避免双份通知。自动化页的「命令白名单」只约束 `run_command` 和 `command_exit` 断言，前缀匹配，不是安全沙箱，建议只放精确前缀。自动化支持 systemd / PM2 / Docker / Supervisor / 自定义命令；规则里可选择进程管理器，或点「检测」按服务名自动探测。

---

## 五、绑定域名访问（可选，公网用）

把域名解析到服务器 IP 后，在 nginx 配置的 `server` 块里加：

> 下面示例里的 `2222` 和 `/fixflow/` 是**占位**：把端口换成你面板的实际端口、路径换成实际入口（在服务器运行 `fixflow default` 查看），否则会 404。

```nginx
location = /fixflow { return 301 /fixflow/; }

location /fixflow/ {
    proxy_pass http://127.0.0.1:2222/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;          # AI 回复是流式的，必须关缓冲
    proxy_read_timeout 86400s;
    client_max_body_size 50m;
}
```

然后 `nginx -t && nginx -s reload`，用「你的域名 + 实际入口路径」访问即可。

---

## 六、日常使用

### 命令行模式（不想要界面，SSH 里直接用）

```bash
fixflow
```

常用子命令（不进入对话，直接执行）：

| 命令 | 作用 |
|---|---|
| `fixflow web` | 启动网页面板 |
| `fixflow default` | 查看面板访问地址（忘了端口 / 入口时用） |
| `fixflow doctor` | 自检 Node / 配置 / 模型连通 / 面板服务 |
| `fixflow restart` | 重启面板服务 |
| `fixflow reset-password` | 重置面板登录密码 |
| `fixflow uninstall` | 卸载（停服务 + 卸载全局包，配置保留） |
| `fixflow --version` | 查看版本 |

直接发指令，比如：

```
> 检查磁盘占用并汇报
> Nginx 配置有问题吗，帮我看看
> 防火墙开了哪些端口
> 帮我清理 /var/log 下 30 天前的日志
```

内置命令：`help` / `?`（显示帮助）、`clear`（清空对话）、`exit` / `quit`（退出）。

任务运行中按 **Ctrl+C** 中止当前任务（同时中断模型请求），回到提示符；空闲时按 Ctrl+C 退出。用 **↑ / ↓ 方向键**可切换历史输入过的命令。

### 安全确认

所有会改动系统的操作（删除、安装、重启服务、写文件等）执行前都会让你确认：

```
[y/N] 执行: rm -f /var/log/nginx/old.log
```

输入 `y` 才执行，其他任何输入都视为拒绝。**系统里所有写入操作都过这一关，包括以 root 运行。**

> 面板以 root 运行时，二次密码验证优先校验 **root 密码**；如果 root 账号未设置密码或已被锁定，会回退到 `config.json` 中 `adminUser` 指定的非 root sudo 账号。两者都没有时，请先设置 root 密码或配置 `adminUser`，否则二次验证会一直失败。

---

## 七、配置说明（进阶）

配置文件：`~/.config/fixflow/config.json`

| 配置键 | 含义 | 默认值 |
|---|---|---|
| `apiKey` | 大模型 API Key | 必填 |
| `baseUrl` | 大模型 API 地址 | `https://api.openai.com/v1` |
| `model` | 模型名 | 向导选的模型 |
| `port` | 面板端口 | 随机端口 |
| `panelPath` | 面板入口路径（防扫描） | 随机路径 |
| `memLimitMB` | 面板进程内存上限（MB），超出仅告警 | `1024` |
| `services` | 要监控的 HTTP 服务列表 | `[]` |
| `databases` | 数据库连接列表 | `[]` |
| `sslSites` | SSL 证书监控列表 | `[]` |
| `pingTargets` | 连通性检测目标 | `[]` |
| `downServices` | 服务异常关闭监控（非 active 即发邮件，收件人填「告警→邮箱配置」） | `["nginx"]` |
| `automationCommands` | 自动化 `run_command` 动作的命令前缀白名单；留空禁用该动作 | `[]` |
| `adminUser` | root 运行面板时，root 密码校验失败后的备用 sudo 账号（root 账号未设置密码/被锁定时使用） | 空 |
| `serviceHide` | 服务页额外隐藏的 systemd 服务名（不含类型后缀） | `[]` |
| `serviceHideSockets` | 服务页额外隐藏的 socket 名称 | `[]` |
| `alertSmtp` | 告警邮件 SMTP 配置（host / port / user / pass / from / to，面板「告警→邮箱配置」写入） | `{}` |
| `lang` / `theme` | 面板语言 / 主题 | `zh` / `dark` |

环境变量可覆盖（优先级更高）：`FIXFLOW_API_KEY` / `FIXFLOW_BASE_URL` / `FIXFLOW_MODEL`。安装时直接用环境变量可免交互：

```bash
sudo FIXFLOW_API_KEY=sk-xxx FIXFLOW_BASE_URL=https://api.deepseek.com/v1 FIXFLOW_MODEL=deepseek-chat npm i -g fixflow
```

### 常用运维命令

```bash
systemctl status fixflow    # 面板服务状态（root 安装时自动注册）
systemctl restart fixflow   # 重启面板
systemctl stop fixflow      # 停止面板
tail -f ~/.config/fixflow/cli.log   # 实时看操作日志
```

---

## 八、常见问题

| 现象 | 原因与处理 |
|---|---|
| 向导第 2 步提示"无法连接" | 服务器访问不了该 API 地址。检查服务器外网、防火墙，或换一个服务商 |
| 提示"API Key 无效" | Key 复制错了/过期了，重新复制粘贴 |
| 面板打不开 | `fixflow doctor` 查看面板服务是否运行；没运行就 `fixflow web` |
| 对话没反应 | 看右上角连接状态；`fixflow doctor` 检查 API 连通性 |
| 回复要等很久 | 生成较长的回复需要时间，现已支持逐字显示，首字很快 |
| 监控显示 N/A | 对应组件没装（如没装 Docker），不影响其他功能 |
| 想彻底卸载 | `fixflow uninstall`（停止服务+卸载全局包+清理缓存，配置保留），**不要**直接用 `npm uninstall`（不会停止服务） |

---

## 九、开发

```bash
npm test                 # 运行全部测试
node bin/fixflow.js      # 本地直接跑 CLI
node bin/fixflow.js web  # 本地直接跑面板
```