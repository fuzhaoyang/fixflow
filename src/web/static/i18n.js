let curLang = "zh";
const I18N = { zh: {}, en: {} };

const I18N_ZH = {
  "group.monitor": "监控", "group.actions": "操作",
  "menu.overview": "总览", "menu.system": "系统", "menu.network": "网络", "menu.nginx": "Nginx",
  "menu.firewall": "防火墙", "menu.services": "Python 服务", "menu.databases": "数据库",
  "menu.docker": "Docker", "menu.processes": "进程", "menu.ssl": "SSL 证书", "menu.systemd": "服务",
  "menu.chat": "Agent 对话",
  "brand.name": "Fixflow 运维管家",
  "brand.sub": "服务器运维 AI Agent",
  "title.overview": "监控总览", "title.chat": "Agent 对话",
  "tool.menuToggle": "折叠/展开菜单", "tool.langToggle": "切换语言", "tool.search": "搜索服务…",
  "tool.settings": "设置", "tool.bell": "告警", "tool.account": "账号", "tool.themeToggle": "切换主题",
  "model.connected": "已连接", "model.connecting": "连接中…", "model.unavailable": "无法连接", "model.notSet": "未设置模型",
  "mon.report": "📄 生成报告", "mon.copy": "复制", "mon.downloadMd": "下载 .md",
  "mon.item": "项目", "mon.status": "状态", "mon.value": "数值", "mon.advice": "建议",
  "mon.ok": "正常", "mon.warn": "警告", "mon.bad": "异常",
  "mon.proto": "协议", "mon.state": "状态", "mon.local": "本地地址", "mon.proc": "进程", "mon.notConfigured": "（未配置）",
  "proc.thCpu": "按 CPU", "proc.thMem": "按内存", "proc.anomalyPrefix": "⚠️ ", "proc.zombie": "⚠️ 僵尸进程 {n} 个：{d}",
  "proc.restart": "重启", "proc.close": "关闭",
  "proc.pid": "PID", "proc.user": "用户", "proc.cpu": "CPU%", "proc.memPct": "内存%", "proc.mem": "内存", "proc.svc": "systemd 服务", "proc.cmd": "命令", "proc.ops": "操作",
  "srv.service": "服务", "srv.state": "状态", "srv.path": "服务路径", "srv.cpu": "占用cpu", "srv.mem": "占用内存%", "srv.memMb": "内容大小", "srv.started": "启动时间",
  "srv.noMatch": "未找到匹配「{q}」的服务", "srv.none": "（无服务）",
  "srv.type": "类型", "srv.name": "名称", "srv.svc": "服务", "srv.proc": "进程", "srv.running": "运行中", "srv.noMatchQ": "未找到匹配「{q}」的服务", "srv.noMatchCfg": "（无匹配服务，可在设置中配置服务白名单）",
  "ssl.host": "域名", "ssl.expire": "到期时间", "ssl.left": "剩余", "ssl.note": "备注",
  "ssl.days": "天", "ssl.expired": "已过期", "ssl.noConfig": "（未配置监控域名，可在设置中配置）",
  "ssl.sumTotal": "共 <b>{n}</b> 张", "ssl.sumWarn": "临期 ≤30 天", "ssl.sumBad": "严重 ≤7 天", "ssl.sumTool": "续签工具：{tool}",
  "ssl.addBtn": "➕ 添加监控", "ssl.empty": "（未发现证书，可点击「添加监控」手动添加）",
  "ssl.auto": "自动", "ssl.manual": "手动", "ssl.renew": "续签", "ssl.enable": "启用", "ssl.disable": "停用", "ssl.del": "删除",
  "ssl.toolAvail": "可用（{tool}）", "ssl.toolNone": "未检测到",
  "ssl.hostPath": "域名/路径", "ssl.cn": "CN", "ssl.issuer": "签发者", "ssl.san": "SAN", "ssl.ops": "操作",
  "ssl.renewText": "即将续签：{name}，成功后自动重载 nginx。",
  "auth.loginTitle": "登录 Fixflow", "auth.loginSub": "登录后即可使用服务器运维面板",
  "auth.registerTitle": "注册 Fixflow", "auth.registerSub": "注册后即可使用服务器运维面板",
  "auth.username": "用户名", "auth.password": "密码", "auth.captcha": "验证码",
  "auth.captchaPh": "输入图中数字", "auth.enterPh": "请输入用户名", "auth.pwdPh": "请输入密码",
  "auth.login": "登录", "auth.register": "注册", "auth.forgot": "忘记密码？",
  "auth.noAccount": "没有账号？去注册", "auth.hasAccount": "已有账号？去登录",
  "auth.restart": "🔄 重启服务", "auth.logout": "🚪 退出登录",
  "settings.title": "⚙️ 模型设置", "settings.apiUrl": "API 地址（Base URL）", "settings.apiKey": "API Key",
  "settings.apiKeyHint": "留空则保持不变", "settings.model": "模型",
  "settings.cancel": "取消", "settings.save": "保存", "settings.loadingModels": "拉取模型中…", "modal.close": "关闭",
  "restart.title": "🔄 重启服务", "restart.text": "重启后当前会话会重新开始（聊天记录保留在本地），页面将自动刷新。<br>确认重启 fixflow 服务吗？",
  "restart.confirm": "确认重启", "restart.cancel": "取消",
  "logout.title": "🚪 退出登录", "logout.text": "退出后需要重新输入账号密码才能使用面板。<br>确认退出登录吗？",
  "logout.confirm": "确认退出", "logout.cancel": "取消",
  "proc.title": "密码验证", "proc.pwdLabel": "登录密码", "proc.pwdPh": "请输入登录密码以验证身份",
  "proc.confirm": "确认执行", "proc.cancel": "取消", "proc.pwdRequired": "请输入登录密码", "proc.pwdErr": "密码错误，操作未执行",
  "proc.restartTitle": "🔄 重启进程", "proc.killTitle": "⏹️ 关闭进程",
  "proc.restartText": "确认重启进程 {pid}（服务 {svc}）吗？此操作需输入登录密码验证。",
  "proc.killText": "确认关闭进程 PID {pid} 吗？此操作需输入登录密码验证。",
  "fw.closeTitle": "🛡️ 关闭端口", "fw.closeText": "确认关闭端口 {port}/{proto}（{mode}）吗？此操作需输入登录密码验证。",
  "fw.state": "防火墙状态", "fw.enabled": "已启用", "fw.disabled": "未启用 / 降级", "fw.rules": "放行规则", "fw.open": "对全网开放", "fw.danger": "（危险 {n}）",
  "fw.closeBtn": "关闭端口", "fw.noRules": "未检测到防火墙规则", "fw.noRisk": "未发现对全网开放的端口 ✅",
  "fw.dangerTag": "危险", "fw.normalTag": "一般", "fw.modeDelete": "删除放行规则", "fw.modeDeny": "添加拒绝规则",
  "fw.noClose": "当前后端为 {backend}，暂不支持一键关闭",
  "fw.num": "#", "fw.action": "动作", "fw.proto": "协议", "fw.port": "端口", "fw.from": "来源", "fw.comment": "备注",
  "fw.bkFirewalld": "firewalld 已启用", "fw.bkUfw": "ufw 已启用", "fw.bkIptables": "未启用 / 降级",
  "fw.riskSection": "对全网开放的端口", "fw.ruleSection": "放行规则",
  "fs.mkdirTitle": "📁 新建文件夹", "fs.mkdirText": "确认在 {path} 下创建文件夹「{name}」？此操作需输入登录密码验证。",
  "fs.renameTitle": "✏️ 重命名", "fs.renameText": "将「{old}」重命名为「{new}」？此操作需输入登录密码验证。",
  "fs.deleteTitle": "🗑 删除", "fs.deleteText": "删除「{name}」？{note}删除后不可恢复！此操作需输入登录密码验证。",
  "fs.uploadTitle": "⬆️ 上传文件", "fs.uploadText": "上传「{name}」({size}) 到 {path}？此操作需输入登录密码验证。",
  "fs.writeTitle": "💾 保存文件", "fs.writeText": "保存修改到 {path}？此操作需输入登录密码验证。",
  "fs.dirRecursive": "目录将递归删除，",
  "fs.mkdirPrompt": "新建文件夹名称：", "fs.renamePrompt": "新名称：", "fs.sizeTooBig": "文件超过 50MB", "fs.singleOnly": "一次仅支持拖放单个文件",
  "auth.resetHint": "请在服务器上运行 fixflow reset-password 重置密码。",
  "chat.clear": "清空历史", "chat.clearTitle": "清空聊天历史", "chat.inputPh": "例如：检查磁盘占用，帮我清理旧日志（Enter 发送，Shift+Enter 换行）",
  "chat.welcomeTitle": "👋 你好，我是 Fixflow 运维管家", "chat.welcomeSub": "我虽然不会修空调，但服务器那点破事，交给我就行。",
  "chat.welcomeTip": "输入指令即可开干，比如「看看磁盘还够不够用」。放心，我不会在没得到你点头前动任何文件——毕竟我是运维，不是拆家工。",
  "chat.tagSys": "🖥 系统监控", "chat.tagNet": "🌐 网络检查", "chat.tagNginx": "🪶 Nginx 体检", "chat.tagFw": "🧯 防火墙巡检", "chat.tagPy": "🐍 Python 服务探活", "chat.tagDb": "🗄 数据库连接诊断", "chat.tagDocker": "🐳 Docker 状态", "chat.tagFix": "🛠 自动修复（先问过你）",
  "chat.attachTitle": "上传图片", "chat.sendTitle": "发送", "chat.stopTitle": "停止生成",
  "ov.load": "负载状态", "ov.cpu": "CPU 使用率", "ov.mem": "内存使用率", "ov.disk": "磁盘使用率", "ov.realtime": "实时", "ov.rootFs": "根分区", "ov.cores": "{n} 核",
  "ov.up": "上行", "ov.down": "下行", "ov.tx": "总发送", "ov.rx": "总接收", "ov.traffic": "流量", "ov.io": "磁盘IO", "ov.unit": "单位 {u}", "ov.unitCnt": "单位 个", "ov.unitK": "单位 k", "ov.unitM": "单位 M",
  "ov.tokenToday": "今日 Token", "ov.tokenTotal30": "30 天累计", "ov.tabToken": "Token 用量",
  "ov.nic": "网卡", "ov.all": "所有", "ov.unitKBs": "单位 KB/s", "ov.unitMBs": "单位 MB/s",
  "io.read": "读取", "io.write": "写入",
  "io.iops": "每秒读写 (IOPS)", "io.latency": "IO 延迟", "io.ops": "次",
  "ov.tokPrompt": "输入 prompt", "ov.tokCompletion": "输出 completion", "ov.tokTotal": "总 token",
  "term.title": "终端", "term.clear": "清空", "term.log": "记录", "term.close": "✕",
  "term.time": "时间", "term.user": "用户", "term.command": "命令",
  "term.connecting": "连接中…", "term.fail": "连接失败", "term.pwdHint": "此操作需输入登录密码验证。",
  "term.logTitle": "🖥 终端操作记录",
  "fs.newDir": "新建文件夹", "fs.upload": "上传", "fs.download": "下载", "fs.edit": "编辑", "fs.rename": "重命名", "fs.delete": "删除",
  "fs.fileName": "文件名", "fs.size": "大小", "fs.type": "类型", "fs.mtime": "修改时间", "fs.mode": "权限", "fs.user": "用户/用户组",
  "fs.dir": "目录", "fs.symlink": "符号链接", "fs.text": "文本", "fs.archive": "压缩包", "fs.binary": "二进制", "fs.image": "图片", "fs.file": "文件",
  "fs.editTitle": "📝 编辑文件", "fs.save": "保存", "fs.cancel": "取消",
  "nginx.title": "📄 Nginx 配置", "nginx.edit": "编辑", "nginx.close": "关闭", "nginx.saveReload": "保存并重载",
  "nginx.saveTitle": "💾 保存 Nginx 配置", "nginx.saveText": "确认保存 {path} 并重载 nginx 吗？此操作需输入登录密码验证。",
  "nginx.opReload": "重载", "nginx.opRestart": "重启", "nginx.opStart": "启动", "nginx.opStop": "停止",
  "nginx.opText": "确认{label} nginx 服务吗？此操作需输入登录密码验证。",
  "nginx.unknown": "未知", "nginx.version": "版本", "nginx.configCheck": "配置校验", "nginx.pass": "通过", "nginx.fail": "失败", "nginx.worker": "worker", "nginx.running": "运行",
  "nginx.opReloadCfg": "重载配置", "nginx.opRestartSvc": "重启服务", "nginx.opStopSvc": "停止服务", "nginx.opStartSvc": "启动服务",
  "nginx.errLog": "最近错误日志", "nginx.confsTitle": "配置文件", "nginx.loading": "加载中…", "nginx.noConf": "（无配置文件）",
  "nginx.view": "查看", "nginx.file": "文件", "nginx.path": "路径", "nginx.listenPort": "监听端口", "nginx.loadFail": "加载失败：{e}",
  "ssl.addTitle": "➕ 添加监控", "ssl.type": "类型", "ssl.typeRemote": "远程域名（外部站点/CDN）", "ssl.typeLocal": "本机证书文件", "ssl.hostPort": "域名与端口", "ssl.path": "证书文件路径", "ssl.remark": "备注（可选）", "ssl.add": "添加", "ssl.renewTitle": "🔄 续签证书", "ssl.renewConfirm": "确认续签",
  "alert.title": "🔔 告警管理", "alert.daily": "日报告警", "alert.metric": "指标告警", "alert.close": "关闭",
  "alert.smtpTitle": "邮箱配置（SMTP，发送走系统 sendmail）", "alert.smtpHost": "SMTP 主机", "alert.smtpPort": "端口", "alert.smtpUser": "用户名", "alert.smtpPass": "密码(留空不改)", "alert.smtpFrom": "发件人", "alert.saveSmtp": "保存邮箱配置",
  "alert.tabNew": "新增", "alert.tabList": "告警列表", "alert.tabHist": "执行历史",
  "alert.formTitle": "新增告警", "alert.name": "名称", "alert.time": "每日执行时间", "alert.recipients": "收件邮箱（逗号分隔）", "alert.instruction": "指令（模型每日执行，生成报表）",
  "alert.notifyTitle": "通知设置", "alert.panelUrl": "面板外网地址（邮件按钮链接）", "alert.webhook": "Webhook URL（留空复用 SSL 告警）",
  "alert.tabRules": "规则", "alert.tabIncidents": "事件", "alert.addRule": "➕ 新增规则", "alert.checkNow": "立即检测",
  "alert.ruleTitle": "新增规则", "alert.threshold": "阈值", "alert.duration": "持续(分钟)", "alert.extra": "选填：标签 / 负责人 / 链接 / 升级",
  "alert.env": "环境", "alert.service": "服务", "alert.team": "团队", "alert.owner": "负责人", "alert.runbook": "Runbook 链接", "alert.dashboard": "监控面板链接", "alert.log": "日志查询链接", "alert.escalateTo": "升级收件人（逗号分隔）", "alert.escalateAfter": "升级时长(分钟)",
  "alert.mCpu": "CPU使用率", "alert.mMem": "内存使用率", "alert.mDisk": "磁盘使用率", "alert.mNet": "网络流量", "alert.mSessions": "TCP会话数",
  "alert.l1": "P1 紧急", "alert.l2": "P2 严重", "alert.l3": "P3 重要", "alert.l4": "P4 一般", "alert.l5": "P5 提示",
  "alert.none": "（暂无告警）", "alert.noHist": "（暂无执行记录）", "alert.dailyFmt": "每天 {t}", "alert.run": "立即执行", "alert.edit": "编辑", "alert.ok": "成功", "alert.fail": "失败",
  "alert.noRules": "（暂无规则）", "alert.noIncidents": "（暂无事件）", "alert.durationFmt": "持续{t}分钟 · P{l}",
  "alert.resolved": "已恢复", "alert.ack": "已认领", "alert.unack": "未认领", "alert.claim": "认领",
  "alert.curFmt": "当前 {v} · 峰值 {p} · 开始 {t}",
  "app.title": "Fixflow 服务器运维面板",
  "net.portPh": "查端口占用，如 22,3306,80", "net.portBtn": "查端口",
  "net.pingPh": "连通性检测目标，如 1.1.1.1", "net.pingBtn": "检测",
  "net.scanTitle": "【端口占用】", "net.listening": "监听中", "net.notListening": "未监听", "net.pingTitle": "【连通性】",
  "help.title": "📖 Fixflow 使用文档", "help.back": "返回",
  "sys.os": "当前系统：{os} · {arch}", "sys.uptime": "持续运行：{up}",
  "mon.danger": "危险", "mon.guard": "警戒",
  "ssl.delConfirm": "确认删除该监控条目？", "ssl.addFail": "添加失败", "ssl.renewFail": "续签失败",
  "chat.me": "我", "chat.thinkingChars": "思考中", "chat.rejected": "（用户已拒绝）",
  "chat.cleared": "🧹 聊天历史已清空", "chat.aborted": "⚠️ 执行已中止",
  "term.starting": "正在启动 shell（首次加载需初始化环境），请稍候…", "term.noHist": "（暂无记录）",
  "fs.loading": "加载中…", "fs.unreachable": "无法访问文件系统", "fs.loadFail": "加载失败：{e}",
  "risk.label": "风险", "risk.low": "低", "risk.mid": "中", "risk.high": "高",
  "risk.approval": "🔒 变更审批单",
  "risk.reason": "变更理由", "risk.impact": "影响范围", "risk.command": "变更命令",
  "risk.reject": "拒绝", "risk.confirmed": "✅ 已确认执行，正在运行…", "risk.rejected": "❌ 已拒绝执行",
  "op.fail": "操作失败", "op.processing": "处理中…", "op.saveFail": "保存失败", "op.saved": "✅ 已保存",
  "auth.registerOk": "注册成功，请登录",
  "settings.modelCount": "共 {n} 个模型", "settings.loadModelsFail": "拉取失败：{msg}（请检查 API 地址和 Key）",
  "settings.keySet": "已配置：{key}", "settings.keyUnset": "未配置", "settings.saved": "✅ 配置成功！",
  "restart.restarting": "重启中…", "restart.triggered": "✅ 已触发重启，页面将自动刷新…", "restart.fail": "❌ 重启请求失败",
  "page.prev": "上一页", "page.next": "下一页",
  "alert.smtpSaved": "✅ 邮箱配置已保存",
  "alert.required": "名称/时间/指令/收件人必填", "alert.delConfirm": "确认删除该告警？",
  "alert.running": "正在执行告警：模型生成报表并发送邮件，请稍候…", "alert.done": "✅ 已执行", "alert.execFail": "执行失败",
  "alert.editTitle": "编辑告警", "alert.newRuleTitle": "新增规则", "alert.ruleRequired": "名称/阈值/收件人必填",
  "alert.sampling": "正在采样并检测指标…", "alert.delRuleConfirm": "确认删除该规则？", "alert.editRuleTitle": "编辑规则",
};

const I18N_EN = {
  "group.monitor": "Monitoring", "group.actions": "Actions",
  "menu.overview": "Overview", "menu.system": "System", "menu.network": "Network", "menu.nginx": "Nginx",
  "menu.firewall": "Firewall", "menu.services": "Python Services", "menu.databases": "Databases",
  "menu.docker": "Docker", "menu.processes": "Processes", "menu.ssl": "SSL Certificates", "menu.systemd": "Services",
  "menu.chat": "Agent Chat",
  "brand.name": "Fixflow Ops Assistant",
  "brand.sub": "Server Ops AI Agent",
  "title.overview": "Monitoring Overview", "title.chat": "Agent Chat",
  "tool.menuToggle": "Toggle menu", "tool.langToggle": "Switch language", "tool.search": "Search services…",
  "tool.settings": "Settings", "tool.bell": "Alerts", "tool.account": "Account", "tool.themeToggle": "Switch theme",
  "model.connected": "Connected", "model.connecting": "Connecting…", "model.unavailable": "Unavailable", "model.notSet": "No model set",
  "mon.report": "📄 Generate Report", "mon.copy": "Copy", "mon.downloadMd": "Download .md",
  "mon.item": "Item", "mon.status": "Status", "mon.value": "Value", "mon.advice": "Advice",
  "mon.ok": "OK", "mon.warn": "Warning", "mon.bad": "Error",
  "mon.proto": "Protocol", "mon.state": "State", "mon.local": "Local Address", "mon.proc": "Process", "mon.notConfigured": "(Not configured)",
  "proc.thCpu": "By CPU", "proc.thMem": "By Memory", "proc.anomalyPrefix": "⚠️ ", "proc.zombie": "⚠️ Zombie processes {n}: {d}",
  "proc.restart": "Restart", "proc.close": "Kill",
  "proc.pid": "PID", "proc.user": "User", "proc.cpu": "CPU%", "proc.memPct": "Mem%", "proc.mem": "Memory", "proc.svc": "systemd service", "proc.cmd": "Command", "proc.ops": "Action",
  "srv.service": "Service", "srv.state": "State", "srv.path": "Path", "srv.cpu": "CPU", "srv.mem": "Mem%", "srv.memMb": "Size", "srv.started": "Started",
  "srv.noMatch": "No services matching 「{q}」", "srv.none": "(no services)",
  "srv.type": "Type", "srv.name": "Name", "srv.svc": "Service", "srv.proc": "Process", "srv.running": "Running", "srv.noMatchQ": "No services matching 「{q}」", "srv.noMatchCfg": "(No matching services. Configure the service whitelist in settings.)",
  "ssl.host": "Host", "ssl.expire": "Expires", "ssl.left": "Left", "ssl.note": "Note",
  "ssl.days": "d", "ssl.expired": "Expired", "ssl.noConfig": "(No monitored domains configured. Configure in settings.)",
  "ssl.sumTotal": "Total <b>{n}</b>", "ssl.sumWarn": "Expiring ≤30d", "ssl.sumBad": "Critical ≤7d", "ssl.sumTool": "Renew tool: {tool}",
  "ssl.addBtn": "➕ Add Monitor", "ssl.empty": "(No certificates found. Click \"Add Monitor\" to add manually.)",
  "ssl.auto": "Auto", "ssl.manual": "Manual", "ssl.renew": "Renew", "ssl.enable": "Enable", "ssl.disable": "Disable", "ssl.del": "Delete",
  "ssl.toolAvail": "Available ({tool})", "ssl.toolNone": "Not detected",
  "ssl.hostPath": "Host/Path", "ssl.cn": "CN", "ssl.issuer": "Issuer", "ssl.san": "SAN", "ssl.ops": "Action",
  "ssl.renewText": "Renewing: {name}. nginx will reload after success.",
  "auth.loginTitle": "Login Fixflow", "auth.loginSub": "Log in to use the server ops panel",
  "auth.registerTitle": "Register Fixflow", "auth.registerSub": "Register to use the server ops panel",
  "auth.username": "Username", "auth.password": "Password", "auth.captcha": "Captcha",
  "auth.captchaPh": "Enter digits", "auth.enterPh": "Enter username", "auth.pwdPh": "Enter password",
  "auth.login": "Login", "auth.register": "Register", "auth.forgot": "Forgot password?",
  "auth.noAccount": "No account? Register", "auth.hasAccount": "Have account? Login",
  "auth.restart": "🔄 Restart service", "auth.logout": "🚪 Logout",
  "settings.title": "⚙️ Model Settings", "settings.apiUrl": "API Base URL", "settings.apiKey": "API Key",
  "settings.apiKeyHint": "Leave blank to keep unchanged", "settings.model": "Model",
  "settings.cancel": "Cancel", "settings.save": "Save", "settings.loadingModels": "Loading models…", "modal.close": "Close",
  "restart.title": "🔄 Restart Service", "restart.text": "The current session will restart after reboot (chat history stays local) and the page reloads.<br>Confirm restarting the fixflow service?",
  "restart.confirm": "Restart", "restart.cancel": "Cancel",
  "logout.title": "🚪 Logout", "logout.text": "You will need to log in again to use the panel.<br>Confirm logout?",
  "logout.confirm": "Logout", "logout.cancel": "Cancel",
  "proc.title": "Password Verify", "proc.pwdLabel": "Login password", "proc.pwdPh": "Enter login password to verify",
  "proc.confirm": "Confirm", "proc.cancel": "Cancel", "proc.pwdRequired": "Please enter login password", "proc.pwdErr": "Wrong password, operation not executed",
  "proc.restartTitle": "🔄 Restart Process", "proc.killTitle": "⏹️ Kill Process",
  "proc.restartText": "Confirm restarting process {pid} (service {svc})? Login password required.",
  "proc.killText": "Confirm killing PID {pid}? Login password required.",
  "fw.closeTitle": "🛡️ Close Port", "fw.closeText": "Confirm closing port {port}/{proto} ({mode})? Login password required.",
  "fw.state": "Firewall Status", "fw.enabled": "Enabled", "fw.disabled": "Disabled / Fallback", "fw.rules": "Rules", "fw.open": "Open to all", "fw.danger": "(dangerous {n})",
  "fw.closeBtn": "Close Port", "fw.noRules": "No firewall rules detected", "fw.noRisk": "No open-to-all ports ✅",
  "fw.dangerTag": "Danger", "fw.normalTag": "Normal", "fw.modeDelete": "Delete allow rule", "fw.modeDeny": "Add deny rule",
  "fw.noClose": "Backend {backend} does not support one-click close",
  "fw.num": "#", "fw.action": "Action", "fw.proto": "Protocol", "fw.port": "Port", "fw.from": "Source", "fw.comment": "Comment",
  "fw.bkFirewalld": "firewalld enabled", "fw.bkUfw": "ufw enabled", "fw.bkIptables": "Disabled / Fallback",
  "fw.riskSection": "Ports open to all", "fw.ruleSection": "Rules",
  "fs.mkdirTitle": "📁 New Folder", "fs.mkdirText": "Confirm creating folder 「{name}」 under {path}? Login password required.",
  "fs.renameTitle": "✏️ Rename", "fs.renameText": "Rename 「{old}」 to 「{new}」? Login password required.",
  "fs.deleteTitle": "🗑 Delete", "fs.deleteText": "Delete 「{name}」? {note}This cannot be undone! Login password required.",
  "fs.uploadTitle": "⬆️ Upload File", "fs.uploadText": "Upload 「{name}」 ({size}) to {path}? Login password required.",
  "fs.writeTitle": "💾 Save File", "fs.writeText": "Save changes to {path}? Login password required.",
  "fs.dirRecursive": "Folder will be deleted recursively, ",
  "fs.mkdirPrompt": "New folder name:", "fs.renamePrompt": "New name:", "fs.sizeTooBig": "File exceeds 50MB", "fs.singleOnly": "Only a single file can be dropped at a time",
  "auth.resetHint": "Run `fixflow reset-password` on the server to reset your password.",
  "chat.clear": "Clear history", "chat.clearTitle": "Clear chat history", "chat.inputPh": "e.g. Check disk usage, clean old logs (Enter to send, Shift+Enter newline)",
  "chat.welcomeTitle": "👋 Hi, I'm Fixflow Ops Assistant", "chat.welcomeSub": "I can't fix air conditioners, but server stuff — leave it to me.",
  "chat.welcomeTip": "Just type a command to get started, e.g. \"Check if disk is running out\". I won't touch any file without your approval — I'm an ops assistant, not a demolition crew.",
  "chat.tagSys": "🖥 System monitor", "chat.tagNet": "🌐 Network check", "chat.tagNginx": "🪶 Nginx check", "chat.tagFw": "🧯 Firewall scan", "chat.tagPy": "🐍 Python services", "chat.tagDb": "🗄 Database diagnostics", "chat.tagDocker": "🐳 Docker status", "chat.tagFix": "🛠 Auto-fix (ask first)",
  "chat.attachTitle": "Upload image", "chat.sendTitle": "Send", "chat.stopTitle": "Stop generating",
  "ov.load": "Load", "ov.cpu": "CPU Usage", "ov.mem": "Memory Usage", "ov.disk": "Disk Usage", "ov.realtime": "Live", "ov.rootFs": "Root", "ov.cores": "{n} cores",
  "ov.up": "Up", "ov.down": "Down", "ov.tx": "Total TX", "ov.rx": "Total RX", "ov.traffic": "Traffic", "ov.io": "Disk I/O", "ov.unit": "Unit {u}", "ov.unitCnt": "Unit pcs", "ov.unitK": "Unit k", "ov.unitM": "Unit M",
  "ov.tokenToday": "Today Tokens", "ov.tokenTotal30": "30-day Total", "ov.tabToken": "Token Usage",
  "ov.nic": "NIC", "ov.all": "All", "ov.unitKBs": "Unit KB/s", "ov.unitMBs": "Unit MB/s",
  "io.read": "Read", "io.write": "Write",
  "io.iops": "Read/Write (IOPS)", "io.latency": "IO latency", "io.ops": "ops",
  "ov.tokPrompt": "Prompt in", "ov.tokCompletion": "Completion out", "ov.tokTotal": "Total",
  "term.title": "Terminal", "term.clear": "Clear", "term.log": "Log", "term.close": "✕",
  "term.time": "Time", "term.user": "User", "term.command": "Command",
  "term.connecting": "Connecting…", "term.fail": "Connection failed", "term.pwdHint": "Login password required.",
  "term.logTitle": "🖥 Terminal History",
  "fs.newDir": "New Folder", "fs.upload": "Upload", "fs.download": "Download", "fs.edit": "Edit", "fs.rename": "Rename", "fs.delete": "Delete",
  "fs.fileName": "Name", "fs.size": "Size", "fs.type": "Type", "fs.mtime": "Modified", "fs.mode": "Permissions", "fs.user": "User/Group",
  "fs.dir": "Folder", "fs.symlink": "Symlink", "fs.text": "Text", "fs.archive": "Archive", "fs.binary": "Binary", "fs.image": "Image", "fs.file": "File",
  "fs.editTitle": "📝 Edit File", "fs.save": "Save", "fs.cancel": "Cancel",
  "nginx.title": "📄 Nginx Config", "nginx.edit": "Edit", "nginx.close": "Close", "nginx.saveReload": "Save & Reload",
  "nginx.saveTitle": "💾 Save Nginx Config", "nginx.saveText": "Confirm saving {path} and reloading nginx? Login password required.",
  "nginx.opReload": "reload", "nginx.opRestart": "restart", "nginx.opStart": "start", "nginx.opStop": "stop",
  "nginx.opText": "Confirm {label} the nginx service? Login password required.",
  "nginx.unknown": "Unknown", "nginx.version": "Version", "nginx.configCheck": "Config check", "nginx.pass": "OK", "nginx.fail": "Failed", "nginx.worker": "worker", "nginx.running": "Uptime",
  "nginx.opReloadCfg": "Reload config", "nginx.opRestartSvc": "Restart service", "nginx.opStopSvc": "Stop service", "nginx.opStartSvc": "Start service",
  "nginx.errLog": "Recent error logs", "nginx.confsTitle": "Config files", "nginx.loading": "Loading…", "nginx.noConf": "(No config files)",
  "nginx.view": "View", "nginx.file": "File", "nginx.path": "Path", "nginx.listenPort": "Listen ports", "nginx.loadFail": "Load failed: {e}",
  "ssl.addTitle": "➕ Add Monitor", "ssl.type": "Type", "ssl.typeRemote": "Remote domain (external site/CDN)", "ssl.typeLocal": "Local cert file", "ssl.hostPort": "Host & Port", "ssl.path": "Cert file path", "ssl.remark": "Remark (optional)", "ssl.add": "Add", "ssl.renewTitle": "🔄 Renew Cert", "ssl.renewConfirm": "Renew",
  "alert.title": "🔔 Alert Management", "alert.daily": "Daily", "alert.metric": "Metric", "alert.close": "Close",
  "alert.smtpTitle": "Email config (SMTP, sends via system sendmail)", "alert.smtpHost": "SMTP host", "alert.smtpPort": "Port", "alert.smtpUser": "Username", "alert.smtpPass": "Password (blank keeps)", "alert.smtpFrom": "From", "alert.saveSmtp": "Save SMTP",
  "alert.tabNew": "New", "alert.tabList": "Alert list", "alert.tabHist": "History",
  "alert.formTitle": "New alert", "alert.name": "Name", "alert.time": "Daily run time", "alert.recipients": "Recipients (comma separated)", "alert.instruction": "Instruction (model runs daily, generates report)",
  "alert.notifyTitle": "Notification settings", "alert.panelUrl": "Panel public URL (for email button link)", "alert.webhook": "Webhook URL (blank reuses SSL alert)",
  "alert.tabRules": "Rules", "alert.tabIncidents": "Incidents", "alert.addRule": "➕ Add rule", "alert.checkNow": "Check now",
  "alert.ruleTitle": "New rule", "alert.threshold": "Threshold", "alert.duration": "Duration (min)", "alert.extra": "Optional: tags / owner / links / escalation",
  "alert.env": "Environment", "alert.service": "Service", "alert.team": "Team", "alert.owner": "Owner", "alert.runbook": "Runbook link", "alert.dashboard": "Dashboard link", "alert.log": "Log query link", "alert.escalateTo": "Escalate to (comma separated)", "alert.escalateAfter": "Escalate after (min)",
  "alert.mCpu": "CPU usage", "alert.mMem": "Memory usage", "alert.mDisk": "Disk usage", "alert.mNet": "Network traffic", "alert.mSessions": "TCP sessions",
  "alert.l1": "P1 Critical", "alert.l2": "P2 Severe", "alert.l3": "P3 Important", "alert.l4": "P4 Minor", "alert.l5": "P5 Info",
  "alert.none": "(No alerts)", "alert.noHist": "(No history)", "alert.dailyFmt": "Daily {t}", "alert.run": "Run now", "alert.edit": "Edit", "alert.ok": "OK", "alert.fail": "Failed",
  "alert.noRules": "(No rules)", "alert.noIncidents": "(No incidents)", "alert.durationFmt": "for {t}min · P{l}",
  "alert.resolved": "Resolved", "alert.ack": "Acknowledged", "alert.unack": "Unacknowledged", "alert.claim": "Acknowledge",
  "alert.curFmt": "current {v} · peak {p} · started {t}",
  "app.title": "Fixflow Server Ops Panel",
  "net.portPh": "Check port usage, e.g. 22,3306,80", "net.portBtn": "Check Port",
  "net.pingPh": "Connectivity target, e.g. 1.1.1.1", "net.pingBtn": "Test",
  "net.scanTitle": "[Port usage]", "net.listening": "listening", "net.notListening": "not listening", "net.pingTitle": "[Connectivity]",
  "help.title": "📖 Fixflow Docs", "help.back": "Back",
  "sys.os": "System: {os} · {arch}", "sys.uptime": "Uptime: {up}",
  "mon.danger": "Danger", "mon.guard": "Caution",
  "ssl.delConfirm": "Confirm deleting this monitor?", "ssl.addFail": "Add failed", "ssl.renewFail": "Renew failed",
  "chat.me": "Me", "chat.thinkingChars": "Thinking", "chat.rejected": "(Rejected by user)",
  "chat.cleared": "🧹 Chat history cleared", "chat.aborted": "⚠️ Execution aborted",
  "term.starting": "Starting shell (first load initializes environment), please wait…", "term.noHist": "(No records)",
  "fs.loading": "Loading…", "fs.unreachable": "Cannot access file system", "fs.loadFail": "Load failed: {e}",
  "risk.label": "Risk", "risk.low": "Low", "risk.mid": "Medium", "risk.high": "High",
  "risk.approval": "🔒 Change Approval",
  "risk.reason": "Reason", "risk.impact": "Impact", "risk.command": "Command",
  "risk.reject": "Reject", "risk.confirmed": "✅ Confirmed, running…", "risk.rejected": "❌ Rejected",
  "op.fail": "Operation failed", "op.processing": "Processing…", "op.saveFail": "Save failed", "op.saved": "✅ Saved",
  "auth.registerOk": "Registered, please log in",
  "settings.modelCount": "{n} models", "settings.loadModelsFail": "Load failed: {msg} (check API URL and Key)",
  "settings.keySet": "Configured: {key}", "settings.keyUnset": "Not configured", "settings.saved": "✅ Settings saved!",
  "restart.restarting": "Restarting…", "restart.triggered": "✅ Restart triggered, page will reload…", "restart.fail": "❌ Restart request failed",
  "page.prev": "Prev", "page.next": "Next",
  "alert.smtpSaved": "✅ SMTP settings saved",
  "alert.required": "Name/time/instruction/recipients required", "alert.delConfirm": "Confirm deleting this alert?",
  "alert.running": "Running alert: model generates report and sends email, please wait…", "alert.done": "✅ Done", "alert.execFail": "Execution failed",
  "alert.editTitle": "Edit alert", "alert.newRuleTitle": "New rule", "alert.ruleRequired": "Name/threshold/recipients required",
  "alert.sampling": "Sampling and checking metrics…", "alert.delRuleConfirm": "Confirm deleting this rule?", "alert.editRuleTitle": "Edit rule",
};

Object.assign(I18N.zh, I18N_ZH);
Object.assign(I18N.en, I18N_EN);

I18N.zh["help.body"] = `<h3>一、它是什么</h3>
<p>Fixflow 是装在你自己服务器上的 AI 运维助手。用中文描述问题，它会调用命令检查服务器、定位问题，并在你确认后执行修复。所有删除 / 修改 / 安装类操作都必须经你确认。</p>

<h3>二、快速开始</h3>
<ul>
  <li>运行 <code>fixflow</code> 进入配置向导：选择服务商 → 粘贴 API Key → 选模型 → 选择是否启动面板。</li>
  <li>配置完成后自动自检，看到「✅ 全部正常」即成功。</li>
  <li>浏览器访问面板：<code>http://127.0.0.1:2222</code>。</li>
  <li>随时自检：<code>fixflow doctor</code>。</li>
</ul>

<h3>三、命令行使用（CLI）</h3>
<p>运行 <code>fixflow</code> 进入对话，直接发指令，例如：</p>
<pre>检查磁盘空间并汇报
防火墙开了哪些端口
帮我清理 /var/log 下 30 天前的日志</pre>
<h4>内置命令</h4>
<table>
  <tr><th>操作</th><th>作用</th></tr>
  <tr><td><code>help</code> / <code>?</code></td><td>显示帮助</td></tr>
  <tr><td><code>clear</code> / 清空历史</td><td>清空当前会话对话</td></tr>
  <tr><td><code>exit</code> / <code>quit</code></td><td>退出会话</td></tr>
  <tr><td>↑ / ↓ 方向键</td><td>切换历史输入过的命令</td></tr>
  <tr><td>Ctrl+C（任务运行中）</td><td>中止当前任务（同时中断模型请求）</td></tr>
  <tr><td>Ctrl+C（空闲时）</td><td>退出会话</td></tr>
</table>

<h3>四、Web 面板</h3>
<ul>
  <li><b>登录</b>：首次访问需注册账号密码，之后登录使用；会话 12 小时有效，可左下角「⚙️」退出登录。</li>
  <li><b>监控</b>：CPU / 内存 / 磁盘 / 网络端口 / Nginx / 防火墙 / Docker / 进程，每 5 秒刷新。</li>
  <li><b>AI 对话</b>：直接打字让助手干活，回复逐字显示；修复操作弹「确认执行 / 拒绝」。</li>
  <li><b>设置</b>：左下角「⚙️」→ 模型设置（改 API 地址 / Key / 模型）或重启服务。</li>
  <li><b>清空历史</b>：对话输入框上方「清空历史」按钮。</li>
  <li><b>忘记密码</b>：在服务器上运行 <code>fixflow reset-password</code> 重置。</li>
</ul>

<h3>五、工具与安全</h3>
<table>
  <tr><th>工具</th><th>用途</th><th>权限</th></tr>
  <tr><td>run_command</td><td>执行命令检查 / 操作</td><td>只读自动执行；删除/修改/安装类需确认</td></tr>
  <tr><td>read_file</td><td>读取日志、配置</td><td>自动执行</td></tr>
  <tr><td>apply_fix</td><td>执行修复命令</td><td>必须确认</td></tr>
  <tr><td>clear_history</td><td>清空会话历史</td><td>自动执行</td></tr>
</table>
<p>所有写入 / 删除 / 修改操作执行前都会弹确认，输入 <code>y</code> 才执行。已执行的修改无法自动撤销，但操作前都有确认环节。</p>

<h3>六、重置模型 / 服务商 / Key</h3>
<ul>
  <li>面板：左下角「⚙️ 设置」→ 模型设置，保存即生效。</li>
  <li>命令：<code>rm -rf ~/.config/fixflow</code> 后重新运行 <code>fixflow</code> 向导。</li>
  <li>直接编辑 <code>~/.config/fixflow/config.json</code>（baseUrl / model / apiKey）。</li>
  <li>每次重新安装后会自动要求重新配置，旧配置备份为 config.json.bak。</li>
</ul>

<h3>七、重启服务</h3>
<p>遇到对话异常（如模型返回 400 报错）可一键重启服务解决：左下角「⚙️ 设置」→「重启服务」，或命令行 <code>fixflow restart</code>。重启会清空内存会话（异常上下文随之消失），聊天记录保留在本地。</p>

<h3>八、常见问题</h3>
<table>
  <tr><th>现象</th><th>处理</th></tr>
  <tr><td>向导提示"无法连接"</td><td>服务器访问不了该 API 地址，检查外网 / 防火墙 / 地址</td></tr>
  <tr><td>提示"API Key 无效"</td><td>重新复制粘贴 Key</td></tr>
  <tr><td>面板打不开</td><td>运行 <code>fixflow doctor</code> 检查；未运行就 <code>fixflow web</code></td></tr>
  <tr><td>对话报 LLM API 400</td><td>多发生在会话上下文异常，点「重启服务」一键修复</td></tr>
  <tr><td>监控显示 N/A</td><td>对应组件没装（如没装 Docker），不影响其他功能</td></tr>
</table>`;

I18N.en["help.body"] = `<h3>1. What is it</h3>
<p>Fixflow is an AI ops assistant installed on your own server. Describe a problem in plain language and it will run commands to check the server, find the cause, and apply a fix after your confirmation. All delete / modify / install operations require your confirmation.</p>

<h3>2. Quick Start</h3>
<ul>
  <li>Run <code>fixflow</code> to enter the setup wizard: choose provider → paste API Key → pick model → choose whether to start the panel.</li>
  <li>After setup a self-check runs automatically; seeing "✅ All OK" means success.</li>
  <li>Open the panel in a browser: <code>http://127.0.0.1:2222</code>.</li>
  <li>Run a self-check anytime: <code>fixflow doctor</code>.</li>
</ul>

<h3>3. Command Line (CLI)</h3>
<p>Run <code>fixflow</code> to chat, then send instructions directly, e.g.:</p>
<pre>Check disk space and report
Which ports are open on the firewall
Clean logs older than 30 days under /var/log</pre>
<h4>Built-in commands</h4>
<table>
  <tr><th>Action</th><th>Effect</th></tr>
  <tr><td><code>help</code> / <code>?</code></td><td>Show help</td></tr>
  <tr><td><code>clear</code> / clear history</td><td>Clear current session chat</td></tr>
  <tr><td><code>exit</code> / <code>quit</code></td><td>Exit session</td></tr>
  <tr><td>↑ / ↓ arrow keys</td><td>Cycle through command history</td></tr>
  <tr><td>Ctrl+C (task running)</td><td>Abort current task (also interrupts the model request)</td></tr>
  <tr><td>Ctrl+C (idle)</td><td>Exit session</td></tr>
</table>

<h3>4. Web Panel</h3>
<ul>
  <li><b>Login</b>: register an account on first visit, then log in; session lasts 12 hours, logout via "⚙️" bottom-left.</li>
  <li><b>Monitoring</b>: CPU / memory / disk / network ports / Nginx / firewall / Docker / processes, refreshed every 5 seconds.</li>
  <li><b>AI Chat</b>: type directly to get the assistant working, replies stream word by word; fix operations show a "Confirm / Reject" prompt.</li>
  <li><b>Settings</b>: bottom-left "⚙️" → model settings (change API URL / Key / model) or restart service.</li>
  <li><b>Clear history</b>: "Clear history" button above the chat input.</li>
  <li><b>Forgot password</b>: run <code>fixflow reset-password</code> on the server.</li>
</ul>

<h3>5. Tools & Security</h3>
<table>
  <tr><th>Tool</th><th>Purpose</th><th>Permission</th></tr>
  <tr><td>run_command</td><td>Run commands to check / operate</td><td>Read-only auto; delete/modify/install need confirmation</td></tr>
  <tr><td>read_file</td><td>Read logs, configs</td><td>Auto</td></tr>
  <tr><td>apply_fix</td><td>Apply fix commands</td><td>Always confirm</td></tr>
  <tr><td>clear_history</td><td>Clear session history</td><td>Auto</td></tr>
</table>
<p>Every write / delete / modify operation asks for confirmation first; type <code>y</code> to run. Executed changes cannot be undone automatically, but everything is confirmed beforehand.</p>

<h3>6. Reset Model / Provider / Key</h3>
<ul>
  <li>Panel: bottom-left "⚙️ Settings" → model settings, saving takes effect immediately.</li>
  <li>Command: <code>rm -rf ~/.config/fixflow</code> then re-run the <code>fixflow</code> wizard.</li>
  <li>Edit <code>~/.config/fixflow/config.json</code> directly (baseUrl / model / apiKey).</li>
  <li>After each reinstall you will be asked to reconfigure; old config is backed up as config.json.bak.</li>
</ul>

<h3>7. Restart Service</h3>
<p>If chat misbehaves (e.g. LLM API 400), restart the service: bottom-left "⚙️ Settings" → "Restart service", or <code>fixflow restart</code>. Restart clears in-memory session (bad context disappears); chat history stays local.</p>

<h3>8. FAQ</h3>
<table>
  <tr><th>Symptom</th><th>Fix</th></tr>
  <tr><td>Wizard says "cannot connect"</td><td>Server cannot reach the API URL; check network / firewall / address</td></tr>
  <tr><td>"API Key invalid"</td><td>Copy and paste the Key again</td></tr>
  <tr><td>Panel won't open</td><td>Run <code>fixflow doctor</code>; if not running, run <code>fixflow web</code></td></tr>
  <tr><td>Chat gets LLM API 400</td><td>Usually a bad session context; click "Restart service" to fix in one click</td></tr>
  <tr><td>Monitoring shows N/A</td><td>Component not installed (e.g. no Docker); other features unaffected</td></tr>
</table>`;

function t(key) {
  return I18N[curLang][key] || I18N.zh[key] || key;
}

function applyLang(lang) {
  curLang = lang === "en" ? "en" : "zh";
  document.documentElement.lang = curLang;
  const btn = document.getElementById("lang-toggle");
  if (btn) btn.textContent = curLang === "zh" ? "EN" : "中文";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    const attr = el.dataset.i18nAttr;
    if (attr) el.setAttribute(attr, t(key));
    else el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  const titleEl = document.getElementById("view-title");
  if (titleEl && titleEl.dataset.i18nTitle) titleEl.textContent = t(titleEl.dataset.i18nTitle);
}
