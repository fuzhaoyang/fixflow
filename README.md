# Fixflow 运维管家

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

### 方式 A：一键脚本（推荐新手）

把 `install.sh` 和 `fixflow-0.1.0.tgz` 放到服务器同一目录，然后：

```bash
bash install.sh
```

脚本会自动检查 Node.js、安装 Fixflow。**如果提示没有 Node.js**，按它给的提示先装 Node（约 1 分钟），再重新跑一遍。

### 方式 B：npm 全局安装

```bash
npm i -g ./fixflow-0.1.0.tgz
```

### 检查装好没有

```bash
fixflow --version
```

看到版本号（如 `0.1.0`）就装好了。

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

配置时选了「启动面板」的话，浏览器访问：

```
http://127.0.0.1:2222
```

面板功能：
- **账号登录**：首次访问需注册账号密码（存于 config.json），之后登录使用；会话 12 小时有效
- **监控总览**：CPU / 内存 / 磁盘 / 网络端口 / Nginx / 防火墙 / Docker / 进程，每 5 秒自动刷新
- **AI 对话**：直接打字让助手干活，回复逐字显示，修复操作弹「确认执行/拒绝」
- **设置**：左下角齿轮，随时改 Key / 模型 / 退出登录

> 面板默认只在本机可访问（安全）。想让**其他电脑**也能打开，见下面「五、绑定域名（可选）」。
> 忘记密码：在服务器上运行 `fixflow reset-password` 重置。CLI（`fixflow` 命令）不受登录限制。

---

## 五、绑定域名访问（可选，公网用）

把域名解析到服务器 IP 后，在 nginx 配置的 `server` 块里加：

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

然后 `nginx -t && nginx -s reload`，访问 `https://你的域名/fixflow/` 即可。

---

## 六、日常使用

### 命令行模式（不想要界面，SSH 里直接用）

```bash
fixflow
```

直接发指令，比如：

```
> 检查磁盘占用并汇报
> Nginx 配置有问题吗，帮我看看
> 防火墙开了哪些端口
> 帮我清理 /var/log 下 30 天前的日志
```

内置命令：`clear`（清空对话）、`exit` / `quit`（退出）。

任务运行中按 **Ctrl+C** 中止当前任务（同时中断模型请求），回到提示符；空闲时按 Ctrl+C 退出。用 **↑ / ↓ 方向键**可切换历史输入过的命令。

### 安全确认

所有会改动系统的操作（删除、安装、重启服务、写文件等）执行前都会让你确认：

```
[y/N] 执行: rm -f /var/log/nginx/old.log
```

输入 `y` 才执行，其他任何输入都视为拒绝。**系统里所有写入操作都过这一关，包括以 root 运行。**

---

## 七、配置说明（进阶）

配置文件：`~/.config/fixflow/config.json`

| 配置键 | 含义 | 默认值 |
|---|---|---|
| `apiKey` | 大模型 API Key | 必填 |
| `baseUrl` | 大模型 API 地址 | `https://api.openai.com/v1` |
| `model` | 模型名 | 向导选的模型 |
| `port` | 面板端口 | `2222` |
| `services` | 要监控的 HTTP 服务列表 | `[]` |
| `databases` | 要探活的数据库列表 | `[]` |

环境变量可覆盖（优先级更高）：`FIXFLOW_API_KEY` / `FIXFLOW_BASE_URL` / `FIXFLOW_MODEL`。安装时直接用环境变量可免交互：

```bash
FIXFLOW_API_KEY=sk-xxx FIXFLOW_BASE_URL=https://api.deepseek.com/v1 FIXFLOW_MODEL=deepseek-chat npm i -g ./fixflow-0.1.0.tgz
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