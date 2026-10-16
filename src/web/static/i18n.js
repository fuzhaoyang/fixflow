let curLang = "zh";
const I18N = { zh: {}, en: {} };

const I18N_ZH = {
  "group.monitor": "监控", "group.actions": "操作",
  "menu.overview": "总览", "menu.system": "系统", "menu.network": "网络", "menu.nginx": "Nginx",
  "menu.firewall": "防火墙", "menu.databases": "数据库",
  "menu.acl": "黑白名单",
  "menu.docker": "Docker", "menu.ssl": "SSL 证书", "menu.systemd": "服务", "menu.logs": "日志", "menu.store": "软件商店",
  "menu.chat": "Agent 对话",
  "docker.containers": "容器列表", "docker.name": "名称", "docker.image": "镜像", "docker.state": "状态", "docker.status": "状态详情", "docker.ports": "端口", "docker.created": "创建时间",
  "docker.stats": "资源占用", "docker.images": "镜像列表", "docker.repo": "仓库", "docker.tag": "标签", "docker.id": "镜像ID", "docker.size": "大小", "docker.since": "创建时间",
  "docker.prune": "清理悬空镜像", "docker.start": "启动", "docker.stop": "停止", "docker.restart": "重启", "docker.rm": "删除", "docker.detail": "详情", "docker.logs": "日志",
  "docker.detailTitle": "容器详情", "docker.detailIp": "IP 地址", "docker.detailMounts": "挂载卷", "docker.detailRestarts": "重启次数", "docker.detailRunning": "运行状态", "docker.cpu": "CPU", "docker.mem": "内存", "docker.running": "运行中", "docker.stopped": "已停止",
  "docker.noContainers": "无容器", "docker.loading": "加载中…", "docker.opTitle": "Docker 操作", "docker.opText": "输入密码确认：{label} {name}", "docker.opDone": "操作完成", "docker.pruneDone": "悬空镜像清理完成", "docker.inspectFail": "获取容器详情失败",
  "brand.name": "Fixflow 运维管家",
  "brand.sub": "服务器运维 AI Agent",
  "title.overview": "监控总览", "title.chat": "Agent 对话", "title.logs": "日志", "title.store": "软件商店",
  "logs.selectHint": "选择一个服务查看日志", "logs.filterPh": "筛选服务…", "logs.searchPh": "搜索日志…", "logs.loading": "加载中…",
  "logs.follow": "跟随", "logs.paused": "已暂停", "logs.copy": "复制", "logs.export": "导出", "logs.copied": "已复制",
  "logs.copyFail": "复制失败", "logs.none": "无匹配服务", "logs.empty": "（无日志内容）", "logs.aiAnalyze": "AI 帮我分析", "logs.aiAnalyzePrompt": "请分析以下日志，指出异常、错误和潜在问题，并给出简要结论：\n\n",
  "logs.sysGroup": "系统服务", "logs.dockerGroup": "Docker 容器", "logs.dockerPrefix": "容器 ",
  "logs.tabService": "服务日志", "logs.tabAudit": "面板操作日志",
  "store.title": "软件商店", "store.searchPh": "搜索软件（apt 源）…", "store.refresh": "刷新", "store.filterAll": "全部", "store.filterInstalled": "已安装", "store.filterMissing": "未安装",
  "store.loading": "加载中…", "store.empty": "没有匹配的软件", "store.installed": "已安装", "store.done": "已安装",
  "store.install": "安装", "store.installTitle": "安装软件", "store.installConfirm": "确认安装 {pkg}？此操作需要 root 权限并可能修改系统。", "store.doneMsg": "安装已完成",
  "store.uninstall": "卸载", "store.uninstallTitle": "卸载软件", "store.uninstallConfirm": "确认卸载 {pkg}？卸载后将移除该软件及其配置文件，不可恢复。", "store.uninstallMsg": "卸载已完成",
  "store.installing": "正在安装…", "store.uninstalling": "正在卸载…", "store.installErr": "安装失败，详情见日志", "store.uninstallErr": "卸载失败，详情见日志", "store.close": "关闭",
  "app.openManage": "点击管理此应用", "app.state": "状态", "app.ok": "运行中", "app.unknown": "状态未知", "app.fail": "加载失败", "app.svcHint": "操作需输入面板登录密码确认。",
  "app.sec.service": "服务", "app.sec.config": "配置修改", "app.sec.version": "切换版本", "app.sec.perf": "性能调整", "app.sec.load": "负载状态", "app.sec.logs": "错误日志",
  "app.installed": "已安装版本", "app.candidate": "候选版本", "app.installedMark": "已安装", "app.installVer": "安装此版本", "app.noVersion": "无可用版本", "app.installVerTitle": "安装指定版本", "app.installVerConfirm": "确认安装 nginx {ver}？此操作需要 root 权限。",
  "app.perf.workers": "处理进程(auto=自动)", "app.perf.conns": "最大并发连接数", "app.perf.keepalive": "连接超时时间(秒)", "app.perf.gzip": "开启压缩传输", "app.perf.gzipMin": "最小压缩文件(KB)", "app.perf.gzipLevel": "压缩率", "app.perf.maxBody": "最大上传文件(MB)", "app.perf.hashBucket": "服务器名hash表大小", "app.perf.headBuf": "请求头buffer大小(KB)", "app.perf.bodyBuf": "请求主体缓冲区(KB)", "app.perf.apply": "应用修改", "app.perf.applyConfirm": "应用修改将保存 nginx 配置并自动重载，配置校验失败会自动回滚。确认执行？", "app.perf.hint": "已存在的参数直接覆盖，缺失的参数自动写入对应块；保存后自动 nginx -t 校验并重载。",
  "app.loadActive": "活跃连接", "app.loadReading": "读取", "app.loadWriting": "写入", "app.loadWaiting": "等待", "app.loadRequests": "总请求数", "app.loadHandled": "已处理连接",
  "app.logTitle": "错误日志", "app.logRefresh": "刷新", "app.noLog": "暂无日志",
  "audit.title": "面板操作日志", "audit.searchPh": "搜索操作…", "audit.refresh": "刷新", "audit.export": "导出", "audit.clear": "清空",
  "audit.empty": "暂无操作记录", "audit.time": "时间", "audit.user": "用户", "audit.page": "页面", "audit.action": "操作", "audit.target": "对象", "audit.detail": "明细",
  "audit.nav": "导航", "audit.btn": "按钮", "audit.modal": "弹窗", "audit.edit": "修改", "audit.open": "打开", "audit.close": "关闭",
  "audit.clearConfirm": "确认清空面板操作日志？此操作不可恢复。",
  "audit.exportConfirm": "导出面板操作日志需要验证 root 密码，确定继续吗？",
  "db.addBtn": "添加连接", "db.empty": "（暂无数据库连接，点右上角添加）",
  "db.name": "名称", "db.type": "类型", "db.host": "主机", "db.port": "端口", "db.database": "库名", "db.user": "用户名", "db.password": "密码", "db.path": "数据库文件路径",
  "db.typePostgres": "PostgreSQL", "db.typeMysql": "MySQL / MariaDB", "db.typeRedis": "Redis", "db.typeMongo": "MongoDB", "db.typeSqlite": "SQLite",
  "db.testBtn": "测试连接", "db.editBtn": "编辑", "db.delBtn": "删除", "db.enableBtn": "启用", "db.disableBtn": "停用",
  "db.testing": "测试中…", "db.testOk": "连接成功", "db.testFail": "连接失败", "db.testingHint": "输入该连接密码以测试", "db.delConfirm": "确认删除该数据库连接？",
  "db.hasPass": "已存密码", "db.noPass": "未存密码", "db.pwdPh": "密码（留空则不存）", "db.saveBtn": "保存", "db.cancelBtn": "取消",
  "db.errSave": "保存失败", "db.errTest": "测试失败",
  "tool.menuToggle": "折叠/展开菜单", "tool.langToggle": "切换语言", "tool.search": "搜索服务…",
  "tool.settings": "设置", "version.prefix": "版本：", "version.tip": "Fixflow 运维管家", "tool.bell": "告警", "tool.account": "账号", "tool.themeToggle": "切换主题", "tool.modelTip": "点击设置模型",
  "model.connected": "已连接", "model.connecting": "连接中…", "model.unavailable": "无法连接", "model.notSet": "未设置模型",
  "mon.report": "生成报告", "mon.copy": "复制", "mon.downloadMd": "下载 .md",
  "mon.item": "项目", "mon.status": "状态", "mon.value": "数值", "mon.advice": "建议",
  "mon.ok": "正常", "mon.warn": "警告", "mon.bad": "异常",
  "mon.proto": "协议", "mon.state": "状态", "mon.local": "本地地址", "mon.proc": "进程", "mon.notConfigured": "（未配置）",
  "proc.ops": "操作",
  "srv.service": "服务", "srv.state": "状态", "srv.path": "服务路径", "srv.cpu": "占用cpu", "srv.mem": "占用内存%", "srv.memMb": "内容大小", "srv.started": "启动时间",
  "srv.noMatch": "未找到匹配「{q}」的服务", "srv.none": "（无服务）",
  "srv.type": "类型", "srv.name": "名称", "srv.svc": "服务", "srv.proc": "进程", "srv.running": "运行中", "srv.noMatchQ": "未找到匹配「{q}」的服务", "srv.noMatchCfg": "（无匹配服务，可在设置中配置服务白名单）",
  "srv.summaryActive": "运行", "srv.summaryFailed": "失败", "srv.summaryInactive": "停止", "srv.sumTotal": "总数",
  "srv.filterAll": "全部", "srv.filterRunning": "运行", "srv.filterFailed": "失败", "srv.filterStopped": "停止",
  "srv.typeAll": "全部类型", "srv.typeService": "服务", "srv.typeSocket": "Socket", "srv.typeTimer": "定时器",
  "srv.opStart": "启动", "srv.opStop": "停止", "srv.opRestart": "重启", "srv.opReload": "重载", "srv.opEnable": "启用自启", "srv.opDisable": "禁用自启",
  "srv.dangerous": "系统关键", "srv.ops": "操作",
  "srv.desc": "描述", "srv.loadState": "加载状态", "srv.unitFileState": "单元文件", "srv.nRestarts": "重启次数", "srv.exitStatus": "退出码", "srv.restartPolicy": "重启策略",
  "srv.depsAfter": "After 依赖", "srv.depsRequires": "Requires 依赖", "srv.depsRequiredBy": "被依赖",
  "srv.logs": "查看日志", "srv.logsHint": "（加载日志）", "srv.logsLoading": "加载中…", "srv.logsEmpty": "（无日志内容）",
  "srv.opConfirm": "确认对服务 {unit} 执行「{op}」？此操作需输入登录密码验证。", "srv.opDone": "操作已执行",
  "ssl.host": "域名", "ssl.expire": "到期时间", "ssl.left": "剩余", "ssl.note": "备注",
  "ssl.days": "天", "ssl.expired": "已过期", "ssl.noConfig": "（未配置监控域名，可在设置中配置）",
  "ssl.sumTotal": "共 <b>{n}</b> 张", "ssl.sumWarn": "临期 ≤30 天", "ssl.sumBad": "严重 ≤7 天", "ssl.sumTool": "续签工具：{tool}",
  "ssl.addBtn": "添加监控", "ssl.empty": "（未发现证书，可点击「添加监控」手动添加）",
  "ssl.auto": "自动", "ssl.manual": "手动", "ssl.renew": "续签", "ssl.enable": "启用", "ssl.disable": "停用", "ssl.del": "删除",
  "ssl.toolAvail": "可用（{tool}）", "ssl.toolNone": "未检测到",
  "ssl.hostPath": "域名/路径", "ssl.cn": "CN", "ssl.issuer": "签发者", "ssl.san": "SAN", "ssl.ops": "操作",
  "ssl.renewText": "即将续签：{name}，成功后自动重载 nginx。",
  "auth.loginTitle": "登录 Fixflow", "auth.loginSub": "登录后即可使用服务器运维面板",
  "auth.registerTitle": "注册 Fixflow", "auth.registerSub": "注册后即可使用服务器运维面板",
  "auth.username": "用户名", "auth.password": "密码", "auth.captcha": "验证码",
  "auth.captchaPh": "输入图中字符", "auth.enterPh": "请输入用户名", "auth.pwdPh": "请输入密码", "auth.pwdRule": "8-24 位，含大小写字母、数字和特殊字符", "auth.pwdWeak": "密码需 8-24 位，且包含大小写字母、数字和特殊字符", "auth.captchaTip": "点击刷新",
  "auth.login": "登录", "auth.register": "注册", "auth.forgot": "忘记密码？", "auth.forgotTitle": "重置密码",
  "auth.noAccount": "没有账号？去注册", "auth.hasAccount": "已有账号？去登录",
  "auth.tagline": "实时监控服务器状态，用大白话让 AI 助手排查并修复问题——无需记忆命令。",
  "auth.changePwd": "修改密码", "pwd.title": "修改密码", "pwd.current": "当前密码", "pwd.currentPh": "请输入当前密码", "pwd.new": "新密码", "pwd.newPh": "8-24 位，含大小写字母、数字和特殊字符", "pwd.confirm": "确认新密码", "pwd.confirmPh": "再次输入新密码", "pwd.weak": "新密码需 8-24 位，且包含大小写字母、数字和特殊字符", "pwd.mismatch": "两次输入的新密码不一致", "pwd.same": "新密码不能与当前密码相同", "pwd.done": "密码已修改，请重新登录", "pwd.fail": "修改失败", "pwd.eyeTitle": "显示/隐藏密码", "pwd.eyeShow": "显示密码", "pwd.eyeHide": "隐藏密码",
  "auth.restart": "重启服务", "auth.logout": "退出登录",
  "settings.title": "模型设置", "settings.apiUrl": "API 地址（Base URL）", "settings.apiKey": "API Key",
  "settings.apiKeyHint": "留空则保持不变", "settings.model": "模型",
  "settings.cancel": "取消", "settings.save": "保存", "settings.loadingModels": "拉取模型中…", "modal.close": "关闭", "modal.ok": "知道了",
  "restart.title": "重启服务", "restart.text": "重启后当前会话会重新开始（聊天记录保留在本地），页面将自动刷新。确认重启 fixflow 服务吗？",
  "restart.confirm": "确认重启", "restart.cancel": "取消",
  "logout.title": "退出登录", "logout.text": "退出后需要重新输入账号密码才能使用面板。确认退出登录吗？", "logout.cancel": "取消", "logout.confirm": "确认退出",
  "kicked.title": "登录已失效", "kicked.text": "该账号已在另一处登录，本机会话已下线。请重新登录。", "kicked.confirm": "重新登录",
  "proc.title": "密码验证", "proc.pwdLabel": "登录密码", "proc.pwdPh": "请输入登录密码以验证身份",
  "proc.confirm": "确认执行", "proc.cancel": "取消", "proc.pwdRequired": "请输入登录密码", "proc.pwdErr": "密码错误，操作未执行",
  "fw.closeTitle": "关闭端口", "fw.closeText": "确认关闭端口 {port}/{proto}（{mode}）吗？此操作需输入 root 密码验证。",
  "fw.state": "防火墙状态", "fw.enabled": "已启用", "fw.disabled": "未启用 / 降级", "fw.rules": "放行规则", "fw.open": "对全网开放", "fw.danger": "（危险 {n}）",
  "fw.closeBtn": "关闭端口", "fw.noRules": "未检测到防火墙规则", "fw.noRisk": "未发现对全网开放的端口",
  "fw.dangerTag": "危险", "fw.normalTag": "一般", "fw.modeDelete": "删除放行规则", "fw.modeDeny": "添加拒绝规则",
  "fw.noClose": "当前后端为 {backend}，暂不支持一键关闭",
  "fw.openBtn": "新增端口", "fw.openTitle": "新增开放端口", "fw.openHint": "开放防火墙端口（ufw allow），操作需输入 root 密码。",
  "fw.portPh": "80 或 80,443 或 8000-9000", "fw.invalidPort": "无效的端口（支持单个、逗号分隔或范围）",
  "fw.fromLabel": "来源（留空=全网）", "fw.fromPh": "192.168.1.0/24", "fw.invalidFrom": "无效的来源（需 IP 或网段，如 192.168.1.0/24）",
  "fw.rootPwdLabel": "root 密码", "fw.rootPwdPh": "请输入 root 密码",
  "fw.enableBtn": "启用防火墙", "fw.disableBtn": "停用防火墙", "fw.enableTitle": "启用防火墙", "fw.disableTitle": "停用防火墙",
  "fw.controlText": "确认{action} UFW 防火墙？此操作需输入 root 密码验证。", "fw.controlDone": "已{action}防火墙",
  "fw.policy": "默认策略：", "fw.conn": "连接数",
  "fw.batchCloseBtn": "批量关闭选中", "fw.batchTitle": "批量关闭端口", "fw.batchText": "确认关闭选中的 {n} 个端口（添加拒绝规则）？此操作需输入 root 密码验证。", "fw.batchDone": "已关闭 {n} 个端口",
  "fw.pickNone": "请先勾选要关闭的端口",
  "fw.hardenBtn": "一键加固危险端口", "fw.hardenTitle": "加固危险端口", "fw.hardenText": "确认对 {n} 个危险端口添加拒绝规则？此操作需输入 root 密码验证。", "fw.hardenNone": "没有危险端口需要加固",
  "fw.opSection": "操作记录", "fw.opTime": "时间", "fw.opAction": "操作", "fw.opTarget": "对象", "fw.noOps": "暂无操作记录", "fw.prev": "上一页", "fw.next": "下一页",
  "fw.opOpen": "开放端口", "fw.opDeny": "拒绝端口", "fw.opClose": "删除放行", "fw.opEnable": "启用防火墙", "fw.opDisable": "停用防火墙",
  "fw.opened": "已开放端口 {port}",
  "fw.num": "#", "fw.action": "动作", "fw.proto": "协议", "fw.port": "端口", "fw.from": "来源", "fw.comment": "备注",
  "fw.bkFirewalld": "firewalld 已启用", "fw.bkUfw": "ufw 已启用", "fw.bkIptables": "未启用 / 降级",
  "fw.riskSection": "对全网开放的端口", "fw.ruleSection": "放行规则",
  "acl.port": "面板端口", "acl.backend": "防火墙", "acl.counts": "黑 / 白",
  "acl.unavailable": "不可用", "acl.needUfw": "黑白名单仅支持 UFW 防火墙（当前后端不适用）",
  "acl.wlEmpty": "白名单为空 = 所有 IP 可访问；添加后仅白名单内 IP 可访问。", "acl.wlActive": "白名单已生效：仅 {n} 个 IP 可访问面板。",
  "acl.wlTitle": "白名单（仅以下 IP 可访问面板）", "acl.blTitle": "黑名单（以下 IP 禁止访问面板）",
  "acl.ip": "IP / 网段", "acl.comment": "备注", "acl.time": "添加时间", "acl.op": "操作",
  "acl.empty": "（暂无规则）", "acl.addBtn": "添加", "acl.del": "删除",
  "acl.curIp": "填入当前 IP", "acl.ipPh": "IP 或网段，如 1.2.3.4 / 192.168.1.0/24", "acl.commentPh": "备注（可选）",
  "acl.invalidIp": "无效的 IP（需 IPv4 或网段，如 192.168.1.0/24）",
  "acl.addWlTitle": "添加白名单", "acl.addBlTitle": "添加黑名单", "acl.addText": "确认将 {ip} 加入{list}？此操作需输入 root 密码验证。",
  "acl.delWlTitle": "移除白名单", "acl.delBlTitle": "移除黑名单", "acl.delText": "确认将 {ip} 移出名单？此操作需输入 root 密码验证。",
  "acl.addDone": "规则已添加", "acl.delDone": "规则已移除",
  "acl.loadFail": "加载失败：请确认已重启 fixflow 服务（若升级后仍如此，说明正在运行旧版本）",
  "fs.mkdirTitle": "新建文件夹", "fs.mkdirText": "确认在 {path} 下创建文件夹「{name}」？此操作需输入登录密码验证。",
  "fs.renameTitle": "重命名", "fs.renameText": "将「{old}」重命名为「{new}」？此操作需输入登录密码验证。",
  "fs.deleteTitle": "删除", "fs.deleteText": "删除「{name}」？{note}删除后不可恢复！此操作需输入登录密码验证。",
  "fs.uploadTitle": "上传文件", "fs.uploadText": "上传「{name}」({size}) 到 {path}？此操作需输入登录密码验证。",
  "fs.writeTitle": "保存文件", "fs.writeText": "保存修改到 {path}？此操作需输入登录密码验证。",
  "fs.dirRecursive": "目录将递归删除，",
  "fs.mkdirPrompt": "新建文件夹名称：", "fs.renamePrompt": "新名称：", "fs.sizeTooBig": "文件超过 50MB", "fs.singleOnly": "一次仅支持拖放单个文件",
  "auth.resetHint": "请在服务器上运行 fixflow reset-password 重置密码。",
  "ai.title": "提问AI？", "ai.fullscreen": "全屏",
  "chat.clear": "清空历史", "chat.clearTitle": "清空聊天历史", "chat.clearConfirm": "清空聊天历史需要验证 root 密码，确定要清空吗？", "chat.inputPh": "例如：检查磁盘占用，帮我清理旧日志（Enter 发送，Shift+Enter 换行）",
  "chat.welcomeTitle": "你好，我是 Fixflow 运维管家", "chat.welcomeSub": "我虽然不会修空调，但服务器那点破事，交给我就行。",
  "chat.welcomeTip": "输入指令即可开干，比如「看看磁盘还够不够用」。放心，我不会在没得到你点头前动任何文件——毕竟我是运维，不是拆家工。",
  "chat.tagSys": "系统监控", "chat.tagNet": "网络检查", "chat.tagNginx": "Nginx 体检", "chat.tagFw": "防火墙巡检", "chat.tagDb": "数据库连接诊断", "chat.tagDocker": "Docker 状态", "chat.tagFix": "自动修复（先问过你）",
  "chat.attachTitle": "上传图片", "chat.sendTitle": "发送", "chat.stopTitle": "停止生成",
  "ov.load": "负载状态", "ov.cpu": "CPU 使用率", "ov.mem": "内存使用率", "ov.disk": "磁盘使用率", "ov.realtime": "实时", "ov.rootFs": "根分区", "ov.cores": "{n} 核", "ov.panelMem": "面板内存", "ov.panelMemLimit": "上限",
  "ov.up": "上行", "ov.down": "下行", "ov.tx": "总发送", "ov.rx": "总接收", "ov.traffic": "流量", "ov.io": "磁盘IO", "ov.unit": "单位 {u}", "ov.unitCnt": "单位 个", "ov.unitK": "单位 k", "ov.unitM": "单位 M",
  "ov.tokenToday": "今日 Token", "ov.tokenTotal30": "30 天累计", "ov.tabToken": "Token 用量",
  "ov.nic": "网卡", "ov.all": "所有", "ov.unitKBs": "单位 KB/s", "ov.unitMBs": "单位 MB/s",
  "ov.healthChecking": "检查中…", "ov.healthOk": "✅ 全部正常", "ov.healthWarn": "⚠ {n} 项需关注", "ov.attention": "关注项",
  "ov.failedSvcs": "服务失败", "ov.sslWarn": "证书将到期",
  "ov.kpiSwap": "Swap", "ov.kpiTcp": "TCP 连接", "ov.kpiProcs": "进程数", "ov.kpiDocker": "运行容器", "ov.kpiUsers": "在线用户",
  "ov.tabTrend": "系统趋势", "ov.range": "时间范围",
  "ov.range5": "5 分钟", "ov.range15": "15 分钟", "ov.range30": "30 分钟", "ov.range60": "1 小时",
  "io.read": "读取", "io.write": "写入",
  "io.iops": "每秒读写 (IOPS)", "io.latency": "IO 延迟", "io.ops": "次",
  "ov.tokPrompt": "输入 prompt", "ov.tokCompletion": "输出 completion", "ov.tokTotal": "总 token",
  "term.title": "终端", "term.clear": "清空", "term.log": "记录", "term.files": "文件操作", "term.close": "✕",
  "term.time": "时间", "term.user": "用户", "term.command": "命令",
  "term.connecting": "连接中…", "term.fail": "连接失败", "term.pwdHint": "此操作需输入登录密码验证。",
  "term.logTitle": "终端操作记录",
  "term.searchPh": "搜索命令…", "term.userAll": "全部用户",
  "term.rangeAll": "全部时间", "term.rangeToday": "今天", "term.range7": "近7天", "term.range30": "近30天",
  "term.export": "导出", "term.copy": "复制命令", "term.copied": "已复制", "term.copyFail": "复制失败", "term.records": "条记录",
  "fs.newDir": "新建文件夹", "fs.upload": "上传", "fs.download": "下载", "fs.edit": "编辑", "fs.rename": "重命名", "fs.delete": "删除", "fs.closeFile": "关闭文件",
  "fs.fileName": "文件名", "fs.size": "大小", "fs.type": "类型", "fs.mtime": "修改时间", "fs.mode": "权限", "fs.user": "用户/用户组",
  "fs.dir": "目录", "fs.symlink": "符号链接", "fs.text": "文本", "fs.archive": "压缩包", "fs.binary": "二进制", "fs.image": "图片", "fs.file": "文件",
  "fs.editTitle": "编辑文件", "fs.save": "保存", "fs.cancel": "取消",
  "nginx.title": "Nginx 配置", "nginx.edit": "编辑", "nginx.close": "关闭", "nginx.saveReload": "保存并重载",
  "nginx.saveTitle": "保存 Nginx 配置", "nginx.saveText": "确认保存 {path} 并重载 nginx 吗？此操作需输入登录密码验证。",
  "nginx.opReload": "重载", "nginx.opRestart": "重启", "nginx.opStart": "启动", "nginx.opStop": "停止",
  "nginx.opText": "确认{label} nginx 服务吗？此操作需输入登录密码验证。",
  "nginx.unknown": "未知", "nginx.version": "版本", "nginx.configCheck": "配置校验", "nginx.pass": "通过", "nginx.fail": "失败", "nginx.worker": "worker", "nginx.running": "运行",
  "nginx.opReloadCfg": "重载配置", "nginx.opRestartSvc": "重启服务", "nginx.opStopSvc": "停止服务", "nginx.opStartSvc": "启动服务",
  "nginx.saveDone": "配置已保存并重载", "nginx.opDone": "「{action}」操作成功",
  "nginx.errLog": "最近错误日志", "nginx.confsTitle": "配置文件", "nginx.loading": "加载中…", "nginx.noConf": "（无配置文件）",
  "nginx.view": "查看", "nginx.file": "文件", "nginx.path": "路径", "nginx.listenPort": "监听端口", "nginx.loadFail": "加载失败：{e}",
  "ssl.addTitle": "添加监控", "ssl.type": "类型", "ssl.typeRemote": "远程域名（外部站点/CDN）", "ssl.typeLocal": "本机证书文件", "ssl.hostPort": "域名与端口", "ssl.path": "证书文件路径", "ssl.remark": "备注（可选）", "ssl.remarkPh": "如：官网", "ssl.add": "添加", "ssl.renewTitle": "续签证书", "ssl.renewConfirm": "确认续签",
  "alert.title": "告警管理", "alert.daily": "日报告警", "alert.metric": "指标告警", "alert.close": "关闭",
  "alert.smtpTitle": "邮箱配置（SMTP，发送走系统 sendmail）", "alert.smtpHost": "SMTP 主机", "alert.smtpPort": "端口", "alert.smtpUser": "用户名", "alert.smtpPass": "密码(留空不改)", "alert.smtpFrom": "发件人", "alert.saveSmtp": "保存邮箱配置",
  "alert.tabNew": "新增", "alert.tabList": "告警列表", "alert.tabHist": "执行历史",
  "alert.formTitle": "新增告警", "alert.name": "名称", "alert.time": "每日执行时间", "alert.recipients": "收件邮箱（逗号分隔）", "alert.instruction": "指令（模型每日执行，生成报表）",
  "alert.notifyTitle": "通知设置", "alert.panelUrl": "面板外网地址（邮件按钮链接）", "alert.webhook": "Webhook URL（留空复用 SSL 告警）",
  "alert.tabRules": "规则", "alert.tabIncidents": "事件", "alert.addRule": "新增规则", "alert.checkNow": "立即检测",
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
  "net.probePh": "远端端口探测，如 example.com:443", "net.probeBtn": "探测", "net.aiBtn": "AI 诊断",
  "net.scanTitle": "【端口占用】", "net.listening": "监听中", "net.notListening": "未监听", "net.pingTitle": "【连通性】",
  "net.trafficTitle": "网络流量", "net.connTitle": "端口连接数", "net.nicTitle": "网卡健康", "net.probeTitle": "远端端口探测",
  "net.dnsTitle": "DNS / 路由", "net.listenTitle": "监听端口",
  "net.listenCount": "监听端口数", "net.estTotal": "ESTAB 连接总数", "net.topConn": "连接最多端口", "net.port": "端口",
  "net.svcLabel": "服务", "net.conn": "连接数", "net.noConn": "暂无 ESTAB 连接", "net.noNic": "无网卡信息", "net.nic": "网卡",
  "net.state": "状态", "net.rx": "已收", "net.tx": "已发", "net.err": "错误(RX/TX)", "net.drop": "丢弃(RX/TX)",
  "net.probeHint": "在上方输入 host:port 探测远端端口", "net.probeOk": "连通", "net.probeFail": "不通",
  "net.noDns": "（无 nameserver）", "net.routes": "路由：", "net.noRoute": "（无路由）", "net.noListen": "无监听端口",
  "net.pingOk": "可达", "net.pingFail": "不可达",
  "net.aiPrompt": "请帮我诊断当前服务器的网络状况，分析以下信息并给出建议：",
  "net.aiListen": "\n监听端口：", "net.aiConn": "\n连接最多的端口：", "net.aiNic": "\n网卡状态：", "net.aiNone": "无",
  "help.title": "Fixflow 使用文档", "help.btn": "帮助文档", "help.back": "返回",
  "sys.os": "当前系统：{os} · {arch}", "sys.uptime": "持续运行：{up}",
  "sys.infoTitle": "系统信息", "sys.kernel": "内核", "sys.hostname": "主机名", "sys.arch": "架构", "sys.cpuModel": "CPU 型号", "sys.cpuCount": "CPU 核数", "sys.memTotal": "总内存", "sys.swapTotal": "Swap 总量", "sys.tz": "时区",
  "sys.healthTitle": "健康检查", "sys.loadTitle": "系统负载", "sys.loadHint": "1/5/15 分钟平均负载，持续超过 {n}（核数）说明任务在排队。",
  "sys.diskTitle": "磁盘明细", "sys.fs": "文件系统", "sys.size": "容量", "sys.used": "已用", "sys.avail": "可用", "sys.usePct": "使用率", "sys.mount": "挂载点",
  "sys.trendTitle": "资源趋势（30 分钟）", "sys.trendWait": "正在采集数据…", "sys.mem": "内存", "sys.disk": "磁盘",
  "sys.loginTitle": "登录安全", "sys.loginCurrent": "当前登录", "sys.loginRecent": "最近登录", "sys.loginFailed": "失败尝试", "sys.none": "（无）",
  "sys.sshTitle": "SSH 配置检查", "sys.sshItem": "检查项", "sys.sshValue": "当前值",
  "sys.updateTitle": "系统更新", "sys.updateCount": "有 {n} 个可用更新", "sys.updateSecurity": "含 {n} 个安全更新", "sys.updateNone": "系统已是最新，无可用更新", "sys.updateBtn": "一键升级",
  "sys.opTitle": "系统操作", "sys.cleanBtn": "一键清理", "sys.rebootBtn": "重启", "sys.shutdownBtn": "关机", "sys.opHistory": "操作记录", "sys.opDone": "操作已执行",
  "sys.cleanTitle": "一键清理", "sys.updateConfirm": "确认执行系统更新（apt-get upgrade）？此操作需输入 root 密码验证，可能耗时数分钟。", "sys.cleanConfirm": "确认清理 journal 日志（保留 7 天）、apt 缓存及 /tmp 中 7 天未访问的文件？此操作需输入 root 密码验证。", "sys.rebootTitle": "重启系统", "sys.shutdownTitle": "关闭系统", "sys.rebootConfirm": "确认重启服务器？系统将在 1 分钟后重启，面板会断开。此操作需输入 root 密码验证。", "sys.shutdownConfirm": "确认关闭服务器？系统将在 1 分钟后关机，面板会断开。此操作需输入 root 密码验证。",
  "sys.opUpdate": "系统更新", "sys.opClean": "清理", "sys.opReboot": "重启", "sys.opShutdown": "关机",
  "mon.danger": "危险", "mon.guard": "警戒",
  "ssl.delConfirm": "确认删除该监控条目？", "ssl.addFail": "添加失败", "ssl.renewFail": "续签失败",
  "chat.me": "我", "chat.thinkingChars": "思考中", "chat.rejected": "（用户已拒绝）",
  "chat.cleared": "聊天历史已清空", "chat.aborted": "执行已中止",
  "term.starting": "正在启动 shell（首次加载需初始化环境），请稍候…", "term.noHist": "（暂无记录）",
  "fs.loading": "加载中…", "fs.unreachable": "无法访问文件系统", "fs.loadFail": "加载失败：{e}",
  "risk.label": "风险", "risk.low": "低", "risk.mid": "中", "risk.high": "高",
  "risk.approval": "变更审批单",
  "risk.reason": "变更理由", "risk.impact": "影响范围", "risk.command": "变更命令",
  "risk.reject": "拒绝", "risk.confirmed": "已确认执行，正在运行…", "risk.rejected": "已拒绝执行",
  "op.fail": "操作失败", "op.processing": "处理中…", "op.saveFail": "保存失败", "op.saved": "已保存",
  "auth.registerOk": "注册成功，请登录",
  "settings.modelCount": "共 {n} 个模型", "settings.loadModelsFail": "拉取失败：{msg}（请检查 API 地址和 Key）",
  "settings.keySet": "已配置：{key}", "settings.keyUnset": "未配置", "settings.saved": "配置成功！",
  "settings.memLimit": "内存上限（MB）", "settings.memLimitHint": "面板进程内存超过该值时仅提示告警，不中断服务",
  "mem.alertText": "面板进程内存 {used}MB 已超过上限 {limit}MB", "mem.close": "知道了",
  "restart.restarting": "重启中…", "restart.triggered": "已触发重启，页面将自动刷新…", "restart.fail": "重启请求失败",
  "page.prev": "上一页", "page.next": "下一页",
  "alert.smtpSaved": "邮箱配置已保存",
  "alert.required": "名称/时间/指令/收件人必填", "alert.delConfirm": "确认删除该告警？",
  "alert.running": "正在执行告警：模型生成报表并发送邮件，请稍候…", "alert.done": "已执行", "alert.execFail": "执行失败",
  "alert.editTitle": "编辑告警", "alert.newRuleTitle": "新增规则", "alert.ruleRequired": "名称/阈值/收件人必填",
  "alert.sampling": "正在采样并检测指标…", "alert.delRuleConfirm": "确认删除该规则？", "alert.editRuleTitle": "编辑规则",
};

const I18N_EN = {
  "group.monitor": "Monitoring", "group.actions": "Actions",
  "menu.overview": "Overview", "menu.system": "System", "menu.network": "Network", "menu.nginx": "Nginx",
  "menu.firewall": "Firewall", "menu.databases": "Databases",
  "menu.acl": "Access Control",
  "menu.docker": "Docker", "menu.ssl": "SSL Certificates", "menu.systemd": "Services", "menu.logs": "Logs", "menu.store": "Software Store",
  "menu.chat": "Agent Chat",
  "docker.containers": "Containers", "docker.name": "Name", "docker.image": "Image", "docker.state": "State", "docker.status": "Status", "docker.ports": "Ports", "docker.created": "Created",
  "docker.stats": "Resource usage", "docker.images": "Images", "docker.repo": "Repository", "docker.tag": "Tag", "docker.id": "Image ID", "docker.size": "Size", "docker.since": "Created",
  "docker.prune": "Prune dangling images", "docker.start": "Start", "docker.stop": "Stop", "docker.restart": "Restart", "docker.rm": "Remove", "docker.detail": "Details", "docker.logs": "Logs",
  "docker.detailTitle": "Container Details", "docker.detailIp": "IP address", "docker.detailMounts": "Mounts", "docker.detailRestarts": "Restart count", "docker.detailRunning": "Status", "docker.cpu": "CPU", "docker.mem": "Memory", "docker.running": "Running", "docker.stopped": "Stopped",
  "docker.noContainers": "No containers", "docker.loading": "Loading…", "docker.opTitle": "Docker Operation", "docker.opText": "Enter password to confirm: {label} {name}", "docker.opDone": "Operation done", "docker.pruneDone": "Dangling images pruned", "docker.inspectFail": "Failed to fetch container details",
  "brand.name": "Fixflow Ops Assistant",
  "brand.sub": "Server Ops AI Agent",
  "title.overview": "Monitoring Overview", "title.chat": "Agent Chat", "title.logs": "Logs", "title.store": "Software Store",
  "logs.selectHint": "Select a service to view logs", "logs.filterPh": "Filter services…", "logs.searchPh": "Search logs…", "logs.loading": "Loading…",
  "logs.follow": "Follow", "logs.paused": "Paused", "logs.copy": "Copy", "logs.export": "Export", "logs.copied": "Copied",
  "logs.copyFail": "Copy failed", "logs.none": "No matching services", "logs.empty": "(no log content)", "logs.aiAnalyze": "AI analyze for me", "logs.aiAnalyzePrompt": "Analyze the following log, point out anomalies, errors and potential issues, then give a brief conclusion:\n\n",
  "logs.sysGroup": "System Services", "logs.dockerGroup": "Docker Containers", "logs.dockerPrefix": "Container ",
  "logs.tabService": "Service Logs", "logs.tabAudit": "Panel Audit Log",
  "store.title": "Software Store", "store.searchPh": "Search software (apt)…", "store.refresh": "Refresh", "store.filterAll": "All", "store.filterInstalled": "Installed", "store.filterMissing": "Not installed",
  "store.loading": "Loading…", "store.empty": "No matching software", "store.installed": "Installed", "store.done": "Installed",
  "store.install": "Install", "store.installTitle": "Install Software", "store.installConfirm": "Install {pkg}? This requires root privileges and may modify the system.", "store.doneMsg": "Install complete",
  "store.uninstall": "Uninstall", "store.uninstallTitle": "Uninstall Software", "store.uninstallConfirm": "Uninstall {pkg}? This will remove the software and its config files, and cannot be undone.", "store.uninstallMsg": "Uninstall complete",
  "store.installing": "Installing…", "store.uninstalling": "Uninstalling…", "store.installErr": "Install failed, see log", "store.uninstallErr": "Uninstall failed, see log", "store.close": "Close",
  "app.openManage": "Click to manage this app", "app.state": "State", "app.ok": "Running", "app.unknown": "Unknown", "app.fail": "Failed to load", "app.svcHint": "Operations require the panel login password.",
  "app.sec.service": "Service", "app.sec.config": "Config", "app.sec.version": "Version", "app.sec.perf": "Performance", "app.sec.load": "Load", "app.sec.logs": "Error logs",
  "app.installed": "Installed version", "app.candidate": "Candidate version", "app.installedMark": "Installed", "app.installVer": "Install this version", "app.noVersion": "No available versions", "app.installVerTitle": "Install specific version", "app.installVerConfirm": "Install nginx {ver}? This requires root privileges.",
  "app.perf.workers": "Worker processes (auto)", "app.perf.conns": "Max connections", "app.perf.keepalive": "Keepalive timeout (s)", "app.perf.gzip": "Enable gzip", "app.perf.gzipMin": "Min gzip size (KB)", "app.perf.gzipLevel": "Compression level", "app.perf.maxBody": "Max body size (MB)", "app.perf.hashBucket": "Server name hash bucket size", "app.perf.headBuf": "Header buffer size (KB)", "app.perf.bodyBuf": "Body buffer size (KB)", "app.perf.apply": "Apply", "app.perf.applyConfirm": "Applying saves nginx config and reloads it; invalid config rolls back automatically. Confirm?", "app.perf.hint": "Existing params are overwritten; missing ones are auto-added to the right block; nginx -t is run and config reloaded after saving.",
  "app.loadActive": "Active", "app.loadReading": "Reading", "app.loadWriting": "Writing", "app.loadWaiting": "Waiting", "app.loadRequests": "Total requests", "app.loadHandled": "Handled conns",
  "app.logTitle": "Error log", "app.logRefresh": "Refresh", "app.noLog": "No logs",
  "audit.title": "Panel Audit Log", "audit.searchPh": "Search actions…", "audit.refresh": "Refresh", "audit.export": "Export", "audit.clear": "Clear",
  "audit.empty": "No operation records", "audit.time": "Time", "audit.user": "User", "audit.page": "Page", "audit.action": "Action", "audit.target": "Target", "audit.detail": "Detail",
  "audit.nav": "Navigate", "audit.btn": "Button", "audit.modal": "Dialog", "audit.edit": "Edit", "audit.open": "Open", "audit.close": "Close",
  "audit.clearConfirm": "Clear the panel audit log? This cannot be undone.",
  "audit.exportConfirm": "Exporting the panel audit log requires root password verification. Continue?",
  "db.addBtn": "Add connection", "db.empty": "(No database connections, click add on the top right)",
  "db.name": "Name", "db.type": "Type", "db.host": "Host", "db.port": "Port", "db.database": "Database", "db.user": "Username", "db.password": "Password", "db.path": "Database file path",
  "db.typePostgres": "PostgreSQL", "db.typeMysql": "MySQL / MariaDB", "db.typeRedis": "Redis", "db.typeMongo": "MongoDB", "db.typeSqlite": "SQLite",
  "db.testBtn": "Test", "db.editBtn": "Edit", "db.delBtn": "Delete", "db.enableBtn": "Enable", "db.disableBtn": "Disable",
  "db.testing": "Testing…", "db.testOk": "Connected", "db.testFail": "Connection failed", "db.testingHint": "Enter this connection's password to test", "db.delConfirm": "Delete this database connection?",
  "db.hasPass": "Password stored", "db.noPass": "No password", "db.pwdPh": "Password (blank = not stored)", "db.saveBtn": "Save", "db.cancelBtn": "Cancel",
  "db.errSave": "Save failed", "db.errTest": "Test failed",
  "tool.menuToggle": "Toggle menu", "tool.langToggle": "Switch language", "tool.search": "Search services…",
  "tool.settings": "Settings", "version.prefix": "Version: ", "version.tip": "Fixflow Ops Panel", "tool.bell": "Alerts", "tool.account": "Account", "tool.themeToggle": "Switch theme", "tool.modelTip": "Click to set model",
  "model.connected": "Connected", "model.connecting": "Connecting…", "model.unavailable": "Unavailable", "model.notSet": "No model set",
  "mon.report": "Generate Report", "mon.copy": "Copy", "mon.downloadMd": "Download .md",
  "mon.item": "Item", "mon.status": "Status", "mon.value": "Value", "mon.advice": "Advice",
  "mon.ok": "OK", "mon.warn": "Warning", "mon.bad": "Error",
  "mon.proto": "Protocol", "mon.state": "State", "mon.local": "Local Address", "mon.proc": "Process", "mon.notConfigured": "(Not configured)",
  "proc.ops": "Action",
  "srv.service": "Service", "srv.state": "State", "srv.path": "Path", "srv.cpu": "CPU", "srv.mem": "Mem%", "srv.memMb": "Size", "srv.started": "Started",
  "srv.noMatch": "No services matching 「{q}」", "srv.none": "(no services)",
  "srv.type": "Type", "srv.name": "Name", "srv.svc": "Service", "srv.proc": "Process", "srv.running": "Running", "srv.noMatchQ": "No services matching 「{q}」", "srv.noMatchCfg": "(No matching services. Configure the service whitelist in settings.)",
  "srv.summaryActive": "Running", "srv.summaryFailed": "Failed", "srv.summaryInactive": "Stopped", "srv.sumTotal": "Total",
  "srv.filterAll": "All", "srv.filterRunning": "Running", "srv.filterFailed": "Failed", "srv.filterStopped": "Stopped",
  "srv.typeAll": "All types", "srv.typeService": "Service", "srv.typeSocket": "Socket", "srv.typeTimer": "Timer",
  "srv.opStart": "Start", "srv.opStop": "Stop", "srv.opRestart": "Restart", "srv.opReload": "Reload", "srv.opEnable": "Enable auto-start", "srv.opDisable": "Disable auto-start",
  "srv.dangerous": "Critical", "srv.ops": "Actions",
  "srv.desc": "Description", "srv.loadState": "Load state", "srv.unitFileState": "Unit file", "srv.nRestarts": "Restarts", "srv.exitStatus": "Exit status", "srv.restartPolicy": "Restart policy",
  "srv.depsAfter": "After", "srv.depsRequires": "Requires", "srv.depsRequiredBy": "Required by",
  "srv.logs": "View logs", "srv.logsHint": "(load logs)", "srv.logsLoading": "Loading…", "srv.logsEmpty": "(no log content)",
  "srv.opConfirm": "Run \"{op}\" on service {unit}? Login password required.", "srv.opDone": "Operation executed",
  "ssl.host": "Host", "ssl.expire": "Expires", "ssl.left": "Left", "ssl.note": "Note",
  "ssl.days": "d", "ssl.expired": "Expired", "ssl.noConfig": "(No monitored domains configured. Configure in settings.)",
  "ssl.sumTotal": "Total <b>{n}</b>", "ssl.sumWarn": "Expiring ≤30d", "ssl.sumBad": "Critical ≤7d", "ssl.sumTool": "Renew tool: {tool}",
  "ssl.addBtn": "Add Monitor", "ssl.empty": "(No certificates found. Click \"Add Monitor\" to add manually.)",
  "ssl.auto": "Auto", "ssl.manual": "Manual", "ssl.renew": "Renew", "ssl.enable": "Enable", "ssl.disable": "Disable", "ssl.del": "Delete",
  "ssl.toolAvail": "Available ({tool})", "ssl.toolNone": "Not detected",
  "ssl.hostPath": "Host/Path", "ssl.cn": "CN", "ssl.issuer": "Issuer", "ssl.san": "SAN", "ssl.ops": "Action",
  "ssl.renewText": "Renewing: {name}. nginx will reload after success.",
  "auth.loginTitle": "Login Fixflow", "auth.loginSub": "Log in to use the server ops panel",
  "auth.registerTitle": "Register Fixflow", "auth.registerSub": "Register to use the server ops panel",
  "auth.username": "Username", "auth.password": "Password", "auth.captcha": "Captcha",
  "auth.captchaPh": "Enter the code", "auth.enterPh": "Enter username", "auth.pwdPh": "Enter password", "auth.pwdRule": "8-24 chars with upper/lowercase letters, digits & symbols", "auth.pwdWeak": "Password must be 8-24 characters with upper/lowercase letters, digits and symbols", "auth.captchaTip": "Click to refresh",
  "auth.login": "Login", "auth.register": "Register", "auth.forgot": "Forgot password?", "auth.forgotTitle": "Reset Password",
  "auth.noAccount": "No account? Register", "auth.hasAccount": "Have account? Login",
  "auth.tagline": "Monitor your server in real time and let the AI assistant diagnose and fix issues in plain language — no commands to memorize.",
  "auth.changePwd": "Change Password", "pwd.title": "Change Password", "pwd.current": "Current password", "pwd.currentPh": "Enter current password", "pwd.new": "New password", "pwd.newPh": "8-24 chars with upper/lowercase letters, digits & symbols", "pwd.confirm": "Confirm new password", "pwd.confirmPh": "Re-enter new password", "pwd.weak": "New password must be 8-24 characters with upper/lowercase letters, digits and symbols", "pwd.mismatch": "The two passwords do not match", "pwd.same": "New password must differ from the current one", "pwd.done": "Password changed. Please log in again.", "pwd.fail": "Change failed", "pwd.eyeTitle": "Show/Hide password", "pwd.eyeShow": "Show password", "pwd.eyeHide": "Hide password",
  "auth.restart": "Restart service", "auth.logout": "Logout",
  "settings.title": "Model Settings", "settings.apiUrl": "API Base URL", "settings.apiKey": "API Key",
  "settings.apiKeyHint": "Leave blank to keep unchanged", "settings.model": "Model",
  "settings.cancel": "Cancel", "settings.save": "Save", "settings.loadingModels": "Loading models…", "modal.close": "Close", "modal.ok": "Got it",
  "restart.title": "Restart Service", "restart.text": "The current session will restart after reboot (chat history stays local) and the page reloads. Confirm restarting the fixflow service?",
  "restart.confirm": "Restart", "restart.cancel": "Cancel",
  "logout.title": "Logout", "logout.text": "You will need to log in again to use the panel. Confirm logout?", "logout.cancel": "Cancel", "logout.confirm": "Logout",
  "kicked.title": "Session Expired", "kicked.text": "This account has logged in elsewhere, and this session has been signed out. Please log in again.", "kicked.confirm": "Log in again",
  "logout.confirm": "Logout", "logout.cancel": "Cancel",
  "proc.title": "Password Verify", "proc.pwdLabel": "Login password", "proc.pwdPh": "Enter login password to verify",
  "proc.confirm": "Confirm", "proc.cancel": "Cancel", "proc.pwdRequired": "Please enter login password", "proc.pwdErr": "Wrong password, operation not executed",
  "fw.closeTitle": "Close Port", "fw.closeText": "Confirm closing port {port}/{proto} ({mode})? Root password required.",
  "fw.state": "Firewall Status", "fw.enabled": "Enabled", "fw.disabled": "Disabled / Fallback", "fw.rules": "Rules", "fw.open": "Open to all", "fw.danger": "(dangerous {n})",
  "fw.closeBtn": "Close Port", "fw.noRules": "No firewall rules detected", "fw.noRisk": "No open-to-all ports",
  "fw.dangerTag": "Danger", "fw.normalTag": "Normal", "fw.modeDelete": "Delete allow rule", "fw.modeDeny": "Add deny rule",
  "fw.noClose": "Backend {backend} does not support one-click close",
  "fw.openBtn": "Open Port", "fw.openTitle": "Open Firewall Port", "fw.openHint": "Open a firewall port (ufw allow). Root password required.",
  "fw.portPh": "80 or 80,443 or 8000-9000", "fw.invalidPort": "Invalid port (single, comma-separated or range)",
  "fw.fromLabel": "Source (blank = all)", "fw.fromPh": "192.168.1.0/24", "fw.invalidFrom": "Invalid source (IP or CIDR, e.g. 192.168.1.0/24)",
  "fw.rootPwdLabel": "Root password", "fw.rootPwdPh": "Enter root password",
  "fw.enableBtn": "Enable Firewall", "fw.disableBtn": "Disable Firewall", "fw.enableTitle": "Enable Firewall", "fw.disableTitle": "Disable Firewall",
  "fw.controlText": "Confirm {action} of UFW firewall? Root password required.", "fw.controlDone": "Firewall {action}",
  "fw.policy": "Default policy: ", "fw.conn": "Connections",
  "fw.batchCloseBtn": "Close Selected", "fw.batchTitle": "Batch Close Ports", "fw.batchText": "Confirm closing {n} selected ports (add deny rule)? Root password required.", "fw.batchDone": "Closed {n} ports",
  "fw.pickNone": "Select ports to close first",
  "fw.hardenBtn": "Harden Dangerous Ports", "fw.hardenTitle": "Harden Dangerous Ports", "fw.hardenText": "Confirm adding deny rules for {n} dangerous ports? Root password required.", "fw.hardenNone": "No dangerous ports to harden",
  "fw.opSection": "Operation Log", "fw.opTime": "Time", "fw.opAction": "Action", "fw.opTarget": "Target", "fw.noOps": "No operations yet", "fw.prev": "Prev", "fw.next": "Next",
  "fw.opOpen": "Open port", "fw.opDeny": "Deny port", "fw.opClose": "Delete allow", "fw.opEnable": "Enable firewall", "fw.opDisable": "Disable firewall",
  "fw.opened": "Port {port} opened",
  "fw.num": "#", "fw.action": "Action", "fw.proto": "Protocol", "fw.port": "Port", "fw.from": "Source", "fw.comment": "Comment",
  "fw.bkFirewalld": "firewalld enabled", "fw.bkUfw": "ufw enabled", "fw.bkIptables": "Disabled / Fallback",
  "fw.riskSection": "Ports open to all", "fw.ruleSection": "Rules",
  "acl.port": "Panel Port", "acl.backend": "Firewall", "acl.counts": "Black / White",
  "acl.unavailable": "Unavailable", "acl.needUfw": "Blacklist/Whitelist only works with UFW (not available on current backend)",
  "acl.wlEmpty": "Empty whitelist = all IPs allowed; once added, only whitelisted IPs can access.", "acl.wlActive": "Whitelist active: only {n} IP(s) can access the panel.",
  "acl.wlTitle": "Whitelist (only these IPs may access)", "acl.blTitle": "Blacklist (these IPs are denied)",
  "acl.ip": "IP / CIDR", "acl.comment": "Comment", "acl.time": "Added", "acl.op": "Actions",
  "acl.empty": "(No rules)", "acl.addBtn": "Add", "acl.del": "Remove",
  "acl.curIp": "Use my IP", "acl.ipPh": "IP or CIDR, e.g. 1.2.3.4 / 192.168.1.0/24", "acl.commentPh": "Comment (optional)",
  "acl.invalidIp": "Invalid IP (IPv4 or CIDR required, e.g. 192.168.1.0/24)",
  "acl.addWlTitle": "Add to Whitelist", "acl.addBlTitle": "Add to Blacklist", "acl.addText": "Add {ip} to {list}? Root password required.",
  "acl.delWlTitle": "Remove from Whitelist", "acl.delBlTitle": "Remove from Blacklist", "acl.delText": "Remove {ip} from the list? Root password required.",
  "acl.addDone": "Rule added", "acl.delDone": "Rule removed",
  "acl.loadFail": "Load failed: restart the fixflow service. If still failing after upgrade, an old version is running.",
  "fs.mkdirTitle": "New Folder", "fs.mkdirText": "Confirm creating folder 「{name}」 under {path}? Login password required.",
  "fs.renameTitle": "Rename", "fs.renameText": "Rename 「{old}」 to 「{new}」? Login password required.",
  "fs.deleteTitle": "Delete", "fs.deleteText": "Delete 「{name}」? {note}This cannot be undone! Login password required.",
  "fs.uploadTitle": "Upload File", "fs.uploadText": "Upload 「{name}」 ({size}) to {path}? Login password required.",
  "fs.writeTitle": "Save File", "fs.writeText": "Save changes to {path}? Login password required.",
  "fs.dirRecursive": "Folder will be deleted recursively, ",
  "fs.mkdirPrompt": "New folder name:", "fs.renamePrompt": "New name:", "fs.sizeTooBig": "File exceeds 50MB", "fs.singleOnly": "Only a single file can be dropped at a time",
  "auth.resetHint": "Run `fixflow reset-password` on the server to reset your password.",
  "ai.title": "Ask AI?", "ai.fullscreen": "Fullscreen",
  "chat.clear": "Clear history", "chat.clearTitle": "Clear chat history", "chat.clearConfirm": "Clearing chat history requires root password verification. Clear it now?", "chat.inputPh": "e.g. Check disk usage, clean old logs (Enter to send, Shift+Enter newline)",
  "chat.welcomeTitle": "Hi, I'm Fixflow Ops Assistant", "chat.welcomeSub": "I can't fix air conditioners, but server stuff — leave it to me.",
  "chat.welcomeTip": "Just type a command to get started, e.g. \"Check if disk is running out\". I won't touch any file without your approval — I'm an ops assistant, not a demolition crew.",
  "chat.tagSys": "System monitor", "chat.tagNet": "Network check", "chat.tagNginx": "Nginx check", "chat.tagFw": "Firewall scan", "chat.tagDb": "Database diagnostics", "chat.tagDocker": "Docker status", "chat.tagFix": "Auto-fix (ask first)",
  "chat.attachTitle": "Upload image", "chat.sendTitle": "Send", "chat.stopTitle": "Stop generating",
  "ov.load": "Load", "ov.cpu": "CPU Usage", "ov.mem": "Memory Usage", "ov.disk": "Disk Usage", "ov.realtime": "Live", "ov.rootFs": "Root", "ov.cores": "{n} cores", "ov.panelMem": "Panel Memory", "ov.panelMemLimit": "Limit",
  "ov.up": "Up", "ov.down": "Down", "ov.tx": "Total TX", "ov.rx": "Total RX", "ov.traffic": "Traffic", "ov.io": "Disk I/O", "ov.unit": "Unit {u}", "ov.unitCnt": "Unit pcs", "ov.unitK": "Unit k", "ov.unitM": "Unit M",
  "ov.tokenToday": "Today Tokens", "ov.tokenTotal30": "30-day Total", "ov.tabToken": "Token Usage",
  "ov.nic": "NIC", "ov.all": "All", "ov.unitKBs": "Unit KB/s", "ov.unitMBs": "Unit MB/s",
  "ov.healthChecking": "Checking…", "ov.healthOk": "✅ All good", "ov.healthWarn": "⚠ {n} issues", "ov.attention": "Attention",
  "ov.failedSvcs": "failed services", "ov.sslWarn": "certs expiring",
  "ov.kpiSwap": "Swap", "ov.kpiTcp": "TCP conns", "ov.kpiProcs": "Processes", "ov.kpiDocker": "Containers", "ov.kpiUsers": "Users",
  "ov.tabTrend": "System Trend", "ov.range": "Range",
  "ov.range5": "5 min", "ov.range15": "15 min", "ov.range30": "30 min", "ov.range60": "1 hour",
  "io.read": "Read", "io.write": "Write",
  "io.iops": "Read/Write (IOPS)", "io.latency": "IO latency", "io.ops": "ops",
  "ov.tokPrompt": "Prompt in", "ov.tokCompletion": "Completion out", "ov.tokTotal": "Total",
  "term.title": "Terminal", "term.clear": "Clear", "term.log": "Log", "term.files": "Files", "term.close": "✕",
  "term.time": "Time", "term.user": "User", "term.command": "Command",
  "term.connecting": "Connecting…", "term.fail": "Connection failed", "term.pwdHint": "Login password required.",
  "term.logTitle": "Terminal History",
  "term.searchPh": "Search commands…", "term.userAll": "All users",
  "term.rangeAll": "All time", "term.rangeToday": "Today", "term.range7": "Last 7 days", "term.range30": "Last 30 days",
  "term.export": "Export", "term.copy": "Copy command", "term.copied": "Copied", "term.copyFail": "Copy failed", "term.records": "records",
  "fs.newDir": "New Folder", "fs.upload": "Upload", "fs.download": "Download", "fs.edit": "Edit", "fs.rename": "Rename", "fs.delete": "Delete", "fs.closeFile": "Close files",
  "fs.fileName": "Name", "fs.size": "Size", "fs.type": "Type", "fs.mtime": "Modified", "fs.mode": "Permissions", "fs.user": "User/Group",
  "fs.dir": "Folder", "fs.symlink": "Symlink", "fs.text": "Text", "fs.archive": "Archive", "fs.binary": "Binary", "fs.image": "Image", "fs.file": "File",
  "fs.editTitle": "Edit File", "fs.save": "Save", "fs.cancel": "Cancel",
  "nginx.title": "Nginx Config", "nginx.edit": "Edit", "nginx.close": "Close", "nginx.saveReload": "Save & Reload",
  "nginx.saveTitle": "Save Nginx Config", "nginx.saveText": "Confirm saving {path} and reloading nginx? Login password required.",
  "nginx.opReload": "reload", "nginx.opRestart": "restart", "nginx.opStart": "start", "nginx.opStop": "stop",
  "nginx.opText": "Confirm {label} the nginx service? Login password required.",
  "nginx.unknown": "Unknown", "nginx.version": "Version", "nginx.configCheck": "Config check", "nginx.pass": "OK", "nginx.fail": "Failed", "nginx.worker": "worker", "nginx.running": "Uptime",
  "nginx.opReloadCfg": "Reload config", "nginx.opRestartSvc": "Restart service", "nginx.opStopSvc": "Stop service", "nginx.opStartSvc": "Start service",
  "nginx.saveDone": "Config saved and reloaded", "nginx.opDone": "「{action}」succeeded",
  "nginx.errLog": "Recent error logs", "nginx.confsTitle": "Config files", "nginx.loading": "Loading…", "nginx.noConf": "(No config files)",
  "nginx.view": "View", "nginx.file": "File", "nginx.path": "Path", "nginx.listenPort": "Listen ports", "nginx.loadFail": "Load failed: {e}",
  "ssl.addTitle": "Add Monitor", "ssl.type": "Type", "ssl.typeRemote": "Remote domain (external site/CDN)", "ssl.typeLocal": "Local cert file", "ssl.hostPort": "Host & Port", "ssl.path": "Cert file path", "ssl.remark": "Remark (optional)", "ssl.remarkPh": "e.g. official site", "ssl.add": "Add", "ssl.renewTitle": "Renew Cert", "ssl.renewConfirm": "Renew",
  "alert.title": "Alert Management", "alert.daily": "Daily", "alert.metric": "Metric", "alert.close": "Close",
  "alert.smtpTitle": "Email config (SMTP, sends via system sendmail)", "alert.smtpHost": "SMTP host", "alert.smtpPort": "Port", "alert.smtpUser": "Username", "alert.smtpPass": "Password (blank keeps)", "alert.smtpFrom": "From", "alert.saveSmtp": "Save SMTP",
  "alert.tabNew": "New", "alert.tabList": "Alert list", "alert.tabHist": "History",
  "alert.formTitle": "New alert", "alert.name": "Name", "alert.time": "Daily run time", "alert.recipients": "Recipients (comma separated)", "alert.instruction": "Instruction (model runs daily, generates report)",
  "alert.notifyTitle": "Notification settings", "alert.panelUrl": "Panel public URL (for email button link)", "alert.webhook": "Webhook URL (blank reuses SSL alert)",
  "alert.tabRules": "Rules", "alert.tabIncidents": "Incidents", "alert.addRule": "Add rule", "alert.checkNow": "Check now",
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
  "net.probePh": "Probe remote port, e.g. example.com:443", "net.probeBtn": "Probe", "net.aiBtn": "AI Diagnose",
  "net.scanTitle": "[Port usage]", "net.listening": "listening", "net.notListening": "not listening", "net.pingTitle": "[Connectivity]",
  "net.trafficTitle": "Network Traffic", "net.connTitle": "Port Connections", "net.nicTitle": "NIC Health", "net.probeTitle": "Remote Port Probe",
  "net.dnsTitle": "DNS / Routing", "net.listenTitle": "Listening Ports",
  "net.listenCount": "Listening ports", "net.estTotal": "Total ESTAB", "net.topConn": "Top port", "net.port": "Port",
  "net.svcLabel": "Service", "net.conn": "Connections", "net.noConn": "No ESTAB connections", "net.noNic": "No NIC info", "net.nic": "NIC",
  "net.state": "State", "net.rx": "RX", "net.tx": "TX", "net.err": "Errors(RX/TX)", "net.drop": "Drops(RX/TX)",
  "net.probeHint": "Enter host:port above to probe a remote port", "net.probeOk": "open", "net.probeFail": "closed",
  "net.noDns": "(no nameserver)", "net.routes": "Routes:", "net.noRoute": "(no routes)", "net.noListen": "No listening ports",
  "net.pingOk": "reachable", "net.pingFail": "unreachable",
  "net.aiPrompt": "Please diagnose this server's network status. Analyze the following and give advice:",
  "net.aiListen": "\nListening ports: ", "net.aiConn": "\nTop connection ports: ", "net.aiNic": "\nNIC states: ", "net.aiNone": "none",
  "help.title": "Fixflow Docs", "help.btn": "Help", "help.back": "Back",
  "sys.os": "System: {os} · {arch}", "sys.uptime": "Uptime: {up}",
  "sys.infoTitle": "System Info", "sys.kernel": "Kernel", "sys.hostname": "Hostname", "sys.arch": "Arch", "sys.cpuModel": "CPU model", "sys.cpuCount": "CPU cores", "sys.memTotal": "Total memory", "sys.swapTotal": "Swap total", "sys.tz": "Timezone",
  "sys.healthTitle": "Health Check", "sys.loadTitle": "System Load", "sys.loadHint": "1/5/15-min load average; sustained above {n} (cores) means tasks are queuing.",
  "sys.diskTitle": "Disks", "sys.fs": "Filesystem", "sys.size": "Size", "sys.used": "Used", "sys.avail": "Avail", "sys.usePct": "Use%", "sys.mount": "Mount",
  "sys.trendTitle": "Resource Trend (30 min)", "sys.trendWait": "Collecting data…", "sys.mem": "Memory", "sys.disk": "Disk",
  "sys.loginTitle": "Login Security", "sys.loginCurrent": "Current sessions", "sys.loginRecent": "Recent logins", "sys.loginFailed": "Failed attempts", "sys.none": "(none)",
  "sys.sshTitle": "SSH Config Check", "sys.sshItem": "Check", "sys.sshValue": "Current value",
  "sys.updateTitle": "System Updates", "sys.updateCount": "{n} update(s) available", "sys.updateSecurity": "{n} security", "sys.updateNone": "System is up to date", "sys.updateBtn": "Upgrade now",
  "sys.opTitle": "System Operations", "sys.cleanBtn": "Clean up", "sys.rebootBtn": "Reboot", "sys.shutdownBtn": "Shutdown", "sys.opHistory": "Operation log", "sys.opDone": "Operation executed",
  "sys.cleanTitle": "Clean up", "sys.updateConfirm": "Run system update (apt-get upgrade)? Root password required; may take several minutes.", "sys.cleanConfirm": "Clean journal logs (keep 7 days), apt cache, and /tmp files untouched for 7 days? Root password required.", "sys.rebootTitle": "Reboot", "sys.shutdownTitle": "Shutdown", "sys.rebootConfirm": "Reboot the server? It reboots in 1 minute and the panel disconnects. Root password required.", "sys.shutdownConfirm": "Shut down the server? It powers off in 1 minute and the panel disconnects. Root password required.",
  "sys.opUpdate": "Update", "sys.opClean": "Clean", "sys.opReboot": "Reboot", "sys.opShutdown": "Shutdown",
  "mon.danger": "Danger", "mon.guard": "Caution",
  "ssl.delConfirm": "Confirm deleting this monitor?", "ssl.addFail": "Add failed", "ssl.renewFail": "Renew failed",
  "chat.me": "Me", "chat.thinkingChars": "Thinking", "chat.rejected": "(Rejected by user)",
  "chat.cleared": "Chat history cleared", "chat.aborted": "Execution aborted",
  "term.starting": "Starting shell (first load initializes environment), please wait…", "term.noHist": "(No records)",
  "fs.loading": "Loading…", "fs.unreachable": "Cannot access file system", "fs.loadFail": "Load failed: {e}",
  "risk.label": "Risk", "risk.low": "Low", "risk.mid": "Medium", "risk.high": "High",
  "risk.approval": "Change Approval",
  "risk.reason": "Reason", "risk.impact": "Impact", "risk.command": "Command",
  "risk.reject": "Reject", "risk.confirmed": "Confirmed, running…", "risk.rejected": "Rejected",
  "op.fail": "Operation failed", "op.processing": "Processing…", "op.saveFail": "Save failed", "op.saved": "Saved",
  "auth.registerOk": "Registered, please log in",
  "settings.modelCount": "{n} models", "settings.loadModelsFail": "Load failed: {msg} (check API URL and Key)",
  "settings.keySet": "Configured: {key}", "settings.keyUnset": "Not configured", "settings.saved": "Settings saved!",
  "settings.memLimit": "Memory limit (MB)", "settings.memLimitHint": "Alert (no restart) when panel process memory exceeds this",
  "mem.alertText": "Panel memory {used}MB exceeds limit {limit}MB", "mem.close": "Got it",
  "restart.restarting": "Restarting…", "restart.triggered": "Restart triggered, page will reload…", "restart.fail": "Restart request failed",
  "page.prev": "Prev", "page.next": "Next",
  "alert.smtpSaved": "SMTP settings saved",
  "alert.required": "Name/time/instruction/recipients required", "alert.delConfirm": "Confirm deleting this alert?",
  "alert.running": "Running alert: model generates report and sends email, please wait…", "alert.done": "Done", "alert.execFail": "Execution failed",
  "alert.editTitle": "Edit alert", "alert.newRuleTitle": "New rule", "alert.ruleRequired": "Name/threshold/recipients required",
  "alert.sampling": "Sampling and checking metrics…", "alert.delRuleConfirm": "Confirm deleting this rule?", "alert.editRuleTitle": "Edit rule",
};

Object.assign(I18N.zh, I18N_ZH);
Object.assign(I18N.en, I18N_EN);


const FIG = {
setup: `<svg class="help-fig" viewBox="0 0 620 170" role="img">
  <rect x="15" y="30" width="180" height="110" rx="12" class="fg-panel"/>
  <circle cx="105" cy="62" r="16" class="fg-accent" opacity=".15"/>
  <path d="M99 62l5 5 9-10" class="fg-arrow-head"/>
  <text x="105" y="98" text-anchor="middle" class="fg-head">1 Install</text>
  <text x="105" y="116" text-anchor="middle" class="fg-text">npm i -g fixflow</text>
  <text x="105" y="132" text-anchor="middle" class="fg-text">run: fixflow</text>
  <path d="M205 85h55" class="fg-arrow"/><path d="M255 85l-9-6M255 85l-9 6" class="fg-arrow-head"/>
  <rect x="268" y="30" width="180" height="110" rx="12" class="fg-panel"/>
  <circle cx="358" cy="62" r="16" class="fg-accent" opacity=".15"/>
  <path d="M358 54v16M350 62h16" class="fg-arrow-head"/>
  <text x="358" y="98" text-anchor="middle" class="fg-head">2 Wizard</text>
  <text x="358" y="116" text-anchor="middle" class="fg-text">provider → key → model</text>
  <text x="358" y="132" text-anchor="middle" class="fg-text">start panel?</text>
  <path d="M458 85h55" class="fg-arrow"/><path d="M508 85l-9-6M508 85l-9 6" class="fg-arrow-head"/>
  <rect x="521" y="30" width="84" height="110" rx="12" class="fg-panel"/>
  <circle cx="563" cy="62" r="16" class="fg-accent" opacity=".15"/>
  <path d="M558 58l5 5 8-9" class="fg-arrow-head"/>
  <text x="563" y="98" text-anchor="middle" class="fg-head">3 Use</text>
  <text x="563" y="116" text-anchor="middle" class="fg-text">open panel</text>
  <text x="563" y="132" text-anchor="middle" class="fg-text">fixflow doctor</text>
</svg>`,
layout: `<svg class="help-fig" viewBox="0 0 620 210" role="img">
  <rect x="15" y="15" width="140" height="180" rx="10" class="fg-panel"/>
  <text x="85" y="36" text-anchor="middle" class="fg-head">Sidebar</text>
  <rect x="28" y="46" width="114" height="16" rx="5" class="fg-btn"/>
  <rect x="28" y="68" width="114" height="16" rx="5" class="fg-btn"/>
  <rect x="28" y="90" width="114" height="16" rx="5" class="fg-btn"/>
  <rect x="28" y="112" width="114" height="16" rx="5" class="fg-btn"/>
  <rect x="28" y="134" width="114" height="16" rx="5" class="fg-btn"/>
  <rect x="165" y="15" width="440" height="30" rx="8" class="fg-btn"/>
  <text x="180" y="34" class="fg-text">top bar: help · lang · bell · theme · account</text>
  <rect x="165" y="55" width="212" height="140" rx="10" class="fg-panel"/>
  <text x="271" y="75" text-anchor="middle" class="fg-head">Cards</text>
  <circle cx="225" cy="105" r="20" class="fg-ok" opacity=".18"/><circle cx="225" cy="105" r="13" class="fg-line"/>
  <circle cx="295" cy="105" r="20" class="fg-accent" opacity=".18"/><circle cx="295" cy="105" r="13" class="fg-line"/>
  <circle cx="225" cy="150" r="20" class="fg-warn" opacity=".18"/><circle cx="225" cy="150" r="13" class="fg-line"/>
  <circle cx="295" cy="150" r="20" class="fg-accent" opacity=".18"/><circle cx="295" cy="150" r="13" class="fg-line"/>
  <rect x="387" y="55" width="218" height="140" rx="10" class="fg-panel"/>
  <text x="496" y="75" text-anchor="middle" class="fg-head">Charts</text>
  <path d="M400 150 L440 132 L470 142 L500 120 L540 128 L585 100" class="fg-chart-line"/>
  <rect x="400" y="160" width="16" height="26" rx="3" class="fg-bar" opacity=".7"/>
  <rect x="424" y="150" width="16" height="36" rx="3" class="fg-bar" opacity=".5"/>
  <rect x="448" y="142" width="16" height="44" rx="3" class="fg-bar" opacity=".7"/>
  <rect x="472" y="154" width="16" height="32" rx="3" class="fg-bar" opacity=".5"/>
  <rect x="496" y="134" width="16" height="52" rx="3" class="fg-bar" opacity=".7"/>
  <rect x="520" y="160" width="16" height="26" rx="3" class="fg-bar" opacity=".5"/>
</svg>`,
topbar: `<svg class="help-fig" viewBox="0 0 620 80" role="img">
  <rect x="15" y="18" width="590" height="44" rx="8" class="fg-btn"/>
  <text x="30" y="44" class="fg-head">View title</text>
  <text x="130" y="44" class="fg-text">search box</text>
  <text x="220" y="44" class="fg-text">model status</text>
  <rect x="336" y="28" width="52" height="24" rx="6" class="fg-btn"/><text x="362" y="45" text-anchor="middle" class="fg-text">Help</text>
  <rect x="394" y="28" width="48" height="24" rx="6" class="fg-btn"/><text x="418" y="45" text-anchor="middle" class="fg-text">Lang</text>
  <rect x="448" y="28" width="48" height="24" rx="6" class="fg-btn"/><text x="472" y="45" text-anchor="middle" class="fg-text">Bell</text>
  <rect x="502" y="28" width="48" height="24" rx="6" class="fg-btn"/><text x="526" y="45" text-anchor="middle" class="fg-text">Theme</text>
  <rect x="556" y="28" width="40" height="24" rx="6" class="fg-btn"/><circle cx="576" cy="40" r="6" class="fg-line"/>
</svg>`,
system: `<svg class="help-fig" viewBox="0 0 620 180" role="img">
  <rect x="15" y="20" width="590" height="140" rx="10" class="fg-panel"/>
  <text x="30" y="45" class="fg-head">System health</text>
  <rect x="28" y="58" width="8" height="8" rx="2" class="fg-ok"/><rect x="44" y="56" width="300" height="12" rx="3" class="fg-btn"/><text x="354" y="66" class="fg-text">OK</text>
  <rect x="28" y="80" width="8" height="8" rx="2" class="fg-ok"/><rect x="44" y="78" width="300" height="12" rx="3" class="fg-btn"/><text x="354" y="88" class="fg-text">OK</text>
  <rect x="28" y="102" width="8" height="8" rx="2" class="fg-warn"/><rect x="44" y="100" width="300" height="12" rx="3" class="fg-btn"/><text x="354" y="110" class="fg-text">WARN</text>
  <rect x="28" y="124" width="8" height="8" rx="2" class="fg-ok"/><rect x="44" y="122" width="300" height="12" rx="3" class="fg-btn"/><text x="354" y="132" class="fg-text">OK</text>
  <rect x="492" y="56" width="100" height="24" rx="6" class="fg-btn-accent"/><text x="542" y="72" text-anchor="middle" class="fg-btn-txt-accent">Report</text>
  <rect x="492" y="88" width="100" height="24" rx="6" class="fg-btn"/><text x="542" y="104" text-anchor="middle" class="fg-text">Download .md</text>
</svg>`,
network: `<svg class="help-fig" viewBox="0 0 620 200" role="img">
  <rect x="15" y="20" width="360" height="160" rx="10" class="fg-panel"/>
  <text x="30" y="45" class="fg-head">Listening ports</text>
  <rect x="28" y="56" width="330" height="14" rx="3" class="fg-btn"/>
  <rect x="28" y="76" width="330" height="14" rx="3" class="fg-btn"/>
  <rect x="28" y="96" width="330" height="14" rx="3" class="fg-btn"/>
  <rect x="28" y="116" width="330" height="14" rx="3" class="fg-btn"/>
  <rect x="28" y="136" width="330" height="14" rx="3" class="fg-btn"/>
  <text x="28" y="168" class="fg-text">port lookup: which process uses port X?</text>
  <rect x="395" y="40" width="210" height="80" rx="10" class="fg-panel"/>
  <text x="500" y="62" text-anchor="middle" class="fg-head">Connectivity</text>
  <rect x="420" y="74" width="90" height="20" rx="5" class="fg-btn"/>
  <rect x="518" y="74" width="70" height="20" rx="5" class="fg-btn-accent"/><text x="553" y="88" text-anchor="middle" class="fg-btn-txt-accent">Ping</text>
  <text x="500" y="112" text-anchor="middle" class="fg-text">target + result</text>
</svg>`,
nginx: `<svg class="help-fig" viewBox="0 0 620 190" role="img">
  <rect x="15" y="20" width="460" height="150" rx="10" class="fg-panel"/>
  <text x="30" y="45" class="fg-head">nginx.conf</text>
  <rect x="28" y="56" width="420" height="12" rx="3" class="fg-btn"/>
  <rect x="28" y="74" width="420" height="12" rx="3" class="fg-btn"/>
  <rect x="28" y="92" width="380" height="12" rx="3" class="fg-btn"/>
  <rect x="28" y="110" width="300" height="12" rx="3" class="fg-btn"/>
  <rect x="28" y="128" width="420" height="12" rx="3" class="fg-btn"/>
  <rect x="492" y="40" width="112" height="26" rx="6" class="fg-btn-accent"/><text x="548" y="56" text-anchor="middle" class="fg-btn-txt-accent">Save &amp; reload</text>
  <rect x="492" y="76" width="112" height="26" rx="6" class="fg-btn"/><text x="548" y="92" text-anchor="middle" class="fg-text">Validate</text>
  <rect x="492" y="112" width="112" height="26" rx="6" class="fg-btn"/><text x="548" y="128" text-anchor="middle" class="fg-text">Error log</text>
  <text x="492" y="162" class="fg-text">status · start/stop</text>
</svg>`,
firewall: `<svg class="help-fig" viewBox="0 0 620 200" role="img">
  <rect x="15" y="20" width="460" height="160" rx="10" class="fg-panel"/>
  <text x="30" y="45" class="fg-head">Firewall rules</text>
  <circle cx="470" cy="41" r="5" class="fg-ok"/><text x="482" y="45" class="fg-text">enabled</text>
  <rect x="28" y="56" width="420" height="18" rx="4" class="fg-btn"/><text x="38" y="69" class="fg-text">80/tcp · web</text><text x="150" y="69" class="fg-ok">ALLOW</text>
  <rect x="28" y="80" width="420" height="18" rx="4" class="fg-btn"/><text x="38" y="93" class="fg-text">443/tcp · https</text><text x="150" y="93" class="fg-ok">ALLOW</text>
  <rect x="28" y="104" width="420" height="18" rx="4" class="fg-btn"/><text x="38" y="117" class="fg-text">22/tcp · ssh</text><text x="150" y="117" class="fg-warn">open to all</text>
  <rect x="28" y="128" width="420" height="18" rx="4" class="fg-btn"/><text x="38" y="141" class="fg-text">9000/tcp · panel</text><text x="150" y="141" class="fg-ok">ALLOW</text>
  <rect x="492" y="56" width="112" height="26" rx="6" class="fg-btn-accent"/><text x="548" y="72" text-anchor="middle" class="fg-btn-txt-accent">Close port</text>
  <rect x="492" y="92" width="112" height="26" rx="6" class="fg-btn"/><text x="548" y="108" text-anchor="middle" class="fg-text">Add rule</text>
</svg>`,
acl: `<svg class="help-fig" viewBox="0 0 620 150" role="img">
  <rect x="15" y="20" width="300" height="110" rx="10" class="fg-panel"/>
  <rect x="28" y="34" width="70" height="20" rx="5" class="fg-btn-accent"/><text x="63" y="48" text-anchor="middle" class="fg-btn-txt-accent">Black</text>
  <rect x="106" y="34" width="70" height="20" rx="5" class="fg-btn"/><text x="141" y="48" text-anchor="middle" class="fg-text">White</text>
  <rect x="28" y="64" width="240" height="14" rx="3" class="fg-btn"/>
  <rect x="28" y="84" width="240" height="14" rx="3" class="fg-btn"/>
  <rect x="28" y="104" width="240" height="14" rx="3" class="fg-btn"/>
  <rect x="360" y="60" width="220" height="50" rx="10" class="fg-panel"/>
  <text x="470" y="82" text-anchor="middle" class="fg-head">IP access control</text>
  <text x="470" y="98" text-anchor="middle" class="fg-text">applies to panel port · needs UFW</text>
</svg>`,
databases: `<svg class="help-fig" viewBox="0 0 620 190" role="img">
  <rect x="15" y="20" width="590" height="150" rx="10" class="fg-panel"/>
  <text x="30" y="45" class="fg-head">Connections</text>
  <rect x="492" y="34" width="100" height="22" rx="6" class="fg-btn-accent"/><text x="542" y="49" text-anchor="middle" class="fg-btn-txt-accent">Add</text>
  <rect x="28" y="56" width="560" height="18" rx="4" class="fg-btn"/><circle cx="46" cy="65" r="6" class="fg-ok" opacity=".8"/><text x="62" y="69" class="fg-text">PostgreSQL · app_db</text><rect x="480" y="58" width="96" height="14" rx="4" class="fg-btn"/><text x="528" y="68" text-anchor="middle" class="fg-text">test</text>
  <rect x="28" y="80" width="560" height="18" rx="4" class="fg-btn"/><circle cx="46" cy="89" r="6" class="fg-ok" opacity=".8"/><text x="62" y="93" class="fg-text">MySQL · cache_db</text>
  <rect x="28" y="104" width="560" height="18" rx="4" class="fg-btn"/><circle cx="46" cy="113" r="6" class="fg-warn" opacity=".8"/><text x="62" y="117" class="fg-text">Redis · session (stopped)</text>
  <rect x="28" y="128" width="560" height="18" rx="4" class="fg-btn"/><circle cx="46" cy="137" r="6" class="fg-ok" opacity=".8"/><text x="62" y="141" class="fg-text">SQLite · data.db</text>
</svg>`,
docker: `<svg class="help-fig" viewBox="0 0 620 200" role="img">
  <rect x="15" y="20" width="590" height="160" rx="10" class="fg-panel"/>
  <text x="30" y="45" class="fg-head">Containers</text>
  <rect x="28" y="56" width="560" height="26" rx="5" class="fg-btn"/>
  <circle cx="46" cy="69" r="6" class="fg-ok" opacity=".8"/><text x="62" y="73" class="fg-text">web-nginx</text><rect x="200" y="66" width="70" height="6" rx="3" class="fg-bar" opacity=".5"/><rect x="290" y="66" width="40" height="6" rx="3" class="fg-bar" opacity=".7"/>
  <rect x="28" y="88" width="560" height="26" rx="5" class="fg-btn"/>
  <circle cx="46" cy="101" r="6" class="fg-ok" opacity=".8"/><text x="62" y="105" class="fg-text">api-node</text><rect x="200" y="98" width="40" height="6" rx="3" class="fg-bar" opacity=".5"/><rect x="290" y="98" width="60" height="6" rx="3" class="fg-bar" opacity=".7"/>
  <rect x="28" y="120" width="560" height="26" rx="5" class="fg-btn"/>
  <circle cx="46" cy="133" r="6" class="fg-warn" opacity=".8"/><text x="62" y="137" class="fg-text">db-redis (stopped)</text>
  <text x="28" y="152" class="fg-text">actions: start · stop · restart · remove</text>
  <text x="280" y="152" class="fg-text">images · prune dangling</text>
  <text x="460" y="152" class="fg-text">logs · details</text>
</svg>`,
ssl: `<svg class="help-fig" viewBox="0 0 620 170" role="img">
  <rect x="15" y="20" width="280" height="130" rx="10" class="fg-panel"/>
  <text x="30" y="45" class="fg-head">example.com</text>
  <text x="30" y="63" class="fg-text">SAN: example.com · www.*</text>
  <rect x="30" y="76" width="220" height="8" rx="4" class="fg-btn"/>
  <rect x="30" y="76" width="150" height="8" rx="4" class="fg-ok" opacity=".8"/>
  <text x="30" y="100" class="fg-text">expires in 45 days</text>
  <rect x="30" y="112" width="80" height="24" rx="6" class="fg-btn-accent"/><text x="70" y="128" text-anchor="middle" class="fg-btn-txt-accent">Renew</text>
  <rect x="320" y="20" width="280" height="130" rx="10" class="fg-panel"/>
  <text x="335" y="45" class="fg-head">api.example.org</text>
  <text x="335" y="63" class="fg-text">SAN: api.example.org</text>
  <rect x="335" y="76" width="220" height="8" rx="4" class="fg-btn"/>
  <rect x="335" y="76" width="40" height="8" rx="4" class="fg-warn" opacity=".8"/>
  <text x="335" y="100" class="fg-text">expires in 5 days</text>
  <rect x="335" y="112" width="80" height="24" rx="6" class="fg-btn-accent"/><text x="375" y="128" text-anchor="middle" class="fg-btn-txt-accent">Renew</text>
</svg>`,
systemd: `<svg class="help-fig" viewBox="0 0 620 190" role="img">
  <rect x="15" y="20" width="590" height="150" rx="10" class="fg-panel"/>
  <text x="30" y="45" class="fg-head">Services</text>
  <rect x="28" y="56" width="560" height="26" rx="5" class="fg-btn"/>
  <circle cx="46" cy="69" r="6" class="fg-ok" opacity=".8"/><text x="62" y="73" class="fg-text">nginx</text><text x="470" y="73" class="fg-text">active (running)</text>
  <rect x="28" y="88" width="560" height="26" rx="5" class="fg-btn"/>
  <circle cx="46" cy="101" r="6" class="fg-ok" opacity=".8"/><text x="62" y="105" class="fg-text">fixflow</text><text x="470" y="105" class="fg-text">active (running)</text>
  <rect x="28" y="120" width="560" height="26" rx="5" class="fg-btn"/>
  <circle cx="46" cy="133" r="6" class="fg-bad" opacity=".8"/><text x="62" y="137" class="fg-text">mysql</text><text x="470" y="137" class="fg-text">failed</text>
  <text x="28" y="162" class="fg-text">start · stop · restart · reload · enable</text>
  <text x="280" y="162" class="fg-text">deps &amp; logs · filter</text>
</svg>`,
store: `<svg class="help-fig" viewBox="0 0 620 170" role="img">
  <rect x="15" y="20" width="182" height="130" rx="10" class="fg-panel"/>
  <rect x="28" y="34" width="34" height="34" rx="8" class="fg-accent" opacity=".5"/>
  <text x="45" y="56" text-anchor="middle" class="fg-btn-txt-accent">N</text>
  <text x="30" y="88" class="fg-head">Nginx</text>
  <text x="30" y="104" class="fg-text">web server</text>
  <rect x="28" y="114" width="70" height="22" rx="6" class="fg-btn-accent"/><text x="63" y="129" text-anchor="middle" class="fg-btn-txt-accent">Install</text>
  <rect x="219" y="20" width="182" height="130" rx="10" class="fg-panel"/>
  <rect x="232" y="34" width="34" height="34" rx="8" class="fg-accent" opacity=".5"/>
  <text x="249" y="56" text-anchor="middle" class="fg-btn-txt-accent">DB</text>
  <text x="234" y="88" class="fg-head">MySQL</text>
  <text x="234" y="104" class="fg-text">database</text>
  <rect x="232" y="114" width="70" height="22" rx="6" class="fg-btn-accent"/><text x="267" y="129" text-anchor="middle" class="fg-btn-txt-accent">Install</text>
  <rect x="423" y="20" width="182" height="130" rx="10" class="fg-panel"/>
  <rect x="436" y="34" width="34" height="34" rx="8" class="fg-accent" opacity=".5"/>
  <text x="453" y="56" text-anchor="middle" class="fg-btn-txt-accent">R</text>
  <text x="437" y="88" class="fg-head">Redis</text>
  <text x="437" y="104" class="fg-text">cache</text>
  <rect x="436" y="114" width="70" height="22" rx="6" class="fg-btn-accent"/><text x="471" y="129" text-anchor="middle" class="fg-btn-txt-accent">Install</text>
</svg>`,
logs: `<svg class="help-fig" viewBox="0 0 620 180" role="img">
  <rect x="15" y="20" width="590" height="140" rx="10" class="fg-panel"/>
  <rect x="28" y="34" width="200" height="20" rx="6" class="fg-btn"/><text x="38" y="48" class="fg-text">search…</text>
  <rect x="240" y="34" width="60" height="20" rx="6" class="fg-btn-accent"/><text x="270" y="48" text-anchor="middle" class="fg-btn-txt-accent">Filter</text>
  <rect x="512" y="34" width="80" height="20" rx="6" class="fg-btn"/><text x="552" y="48" text-anchor="middle" class="fg-text">Follow</text>
  <rect x="28" y="64" width="560" height="12" rx="3" class="fg-btn"/>
  <rect x="28" y="82" width="560" height="12" rx="3" class="fg-btn"/>
  <rect x="28" y="100" width="520" height="12" rx="3" class="fg-btn"/>
  <rect x="28" y="118" width="560" height="12" rx="3" class="fg-btn"/>
  <rect x="492" y="132" width="100" height="20" rx="6" class="fg-btn-accent"/><text x="542" y="146" text-anchor="middle" class="fg-btn-txt-accent">AI analyze</text>
  <text x="28" y="152" class="fg-text">copy · export · clear</text>
</svg>`,
chat: `<svg class="help-fig" viewBox="0 0 620 200" role="img">
  <rect x="15" y="20" width="590" height="160" rx="10" class="fg-panel"/>
  <text x="30" y="45" class="fg-head">Agent chat</text>
  <rect x="28" y="56" width="180" height="14" rx="7" class="fg-ok" opacity=".3"/><text x="38" y="66" class="fg-text">You: check disk usage</text>
  <rect x="370" y="60" width="210" height="20" rx="7" class="fg-accent" opacity=".15"/><text x="380" y="74" class="fg-text">Agent reply… streams</text>
  <rect x="28" y="88" width="180" height="14" rx="7" class="fg-ok" opacity=".3"/><text x="38" y="98" class="fg-text">You: delete old logs</text>
  <rect x="28" y="112" width="380" height="40" rx="8" class="fg-btn"/>
  <text x="38" y="128" class="fg-head">Change approval required</text>
  <text x="38" y="144" class="fg-text">rm /var/log/app/*.log · enter password</text>
  <rect x="420" y="120" width="70" height="24" rx="6" class="fg-btn-accent"/><text x="455" y="136" text-anchor="middle" class="fg-btn-txt-accent">Confirm</text>
  <rect x="496" y="120" width="70" height="24" rx="6" class="fg-btn"/><text x="531" y="136" text-anchor="middle" class="fg-text">Cancel</text>
  <text x="28" y="172" class="fg-text">input box · image upload · clear history</text>
</svg>`,
fs: `<svg class="help-fig" viewBox="0 0 620 190" role="img">
  <rect x="15" y="20" width="590" height="70" rx="10" class="fg-panel"/>
  <text x="30" y="45" class="fg-head">Terminal</text>
  <text x="30" y="65" class="fg-text">$ systemctl status nginx</text>
  <text x="30" y="80" class="fg-text">● nginx.service — active (running)</text>
  <rect x="15" y="102" width="590" height="70" rx="10" class="fg-panel"/>
  <text x="30" y="125" class="fg-head">Files</text>
  <rect x="28" y="136" width="420" height="14" rx="3" class="fg-btn"/>
  <rect x="28" y="154" width="380" height="14" rx="3" class="fg-btn"/>
  <rect x="492" y="120" width="100" height="22" rx="6" class="fg-btn-accent"/><text x="542" y="135" text-anchor="middle" class="fg-btn-txt-accent">Upload</text>
  <text x="492" y="160" class="fg-text">edit · rename · delete</text>
</svg>`,
alerts: `<svg class="help-fig" viewBox="0 0 620 190" role="img">
  <rect x="15" y="20" width="290" height="150" rx="10" class="fg-panel"/>
  <text x="30" y="45" class="fg-head">Daily report</text>
  <text x="30" y="64" class="fg-text">SMTP · time · instruction</text>
  <rect x="28" y="74" width="150" height="14" rx="3" class="fg-btn"/>
  <rect x="28" y="94" width="150" height="14" rx="3" class="fg-btn"/>
  <rect x="28" y="114" width="230" height="14" rx="3" class="fg-btn"/>
  <rect x="28" y="138" width="90" height="22" rx="6" class="fg-btn-accent"/><text x="73" y="153" text-anchor="middle" class="fg-btn-txt-accent">Save</text>
  <rect x="320" y="20" width="285" height="150" rx="10" class="fg-panel"/>
  <text x="335" y="45" class="fg-head">Metric rules</text>
  <rect x="335" y="56" width="250" height="14" rx="3" class="fg-btn"/><text x="345" y="66" class="fg-text">CPU &gt; 80% · P1</text>
  <rect x="335" y="76" width="250" height="14" rx="3" class="fg-btn"/><text x="345" y="86" class="fg-text">Memory &gt; 90% · P2</text>
  <rect x="335" y="96" width="250" height="14" rx="3" class="fg-btn"/><text x="345" y="106" class="fg-text">Disk &gt; 85% · P2</text>
  <rect x="335" y="138" width="90" height="22" rx="6" class="fg-btn-accent"/><text x="380" y="153" text-anchor="middle" class="fg-btn-txt-accent">New rule</text>
</svg>`,
settings: `<svg class="help-fig" viewBox="0 0 620 160" role="img">
  <rect x="15" y="20" width="590" height="120" rx="10" class="fg-panel"/>
  <text x="30" y="45" class="fg-head">Model settings</text>
  <text x="30" y="66" class="fg-text">API base URL</text>
  <rect x="28" y="74" width="300" height="14" rx="3" class="fg-btn"/>
  <text x="30" y="100" class="fg-text">API key</text>
  <rect x="28" y="108" width="300" height="14" rx="3" class="fg-btn"/>
  <text x="30" y="126" class="fg-text">Model</text>
  <rect x="28" y="134" width="150" height="14" rx="3" class="fg-btn"/>
  <rect x="492" y="76" width="100" height="26" rx="6" class="fg-btn-accent"/><text x="542" y="92" text-anchor="middle" class="fg-btn-txt-accent">Save</text>
  <rect x="492" y="112" width="100" height="26" rx="6" class="fg-btn"/><text x="542" y="128" text-anchor="middle" class="fg-text">Restart</text>
</svg>`,
account: `<svg class="help-fig" viewBox="0 0 620 150" role="img">
  <rect x="185" y="15" width="250" height="120" rx="12" class="fg-panel"/>
  <text x="310" y="40" text-anchor="middle" class="fg-head">Login / Register</text>
  <rect x="215" y="50" width="190" height="16" rx="4" class="fg-btn"/>
  <rect x="215" y="72" width="190" height="16" rx="4" class="fg-btn"/>
  <rect x="215" y="94" width="140" height="16" rx="4" class="fg-btn"/>
  <rect x="365" y="94" width="40" height="16" rx="4" class="fg-btn"/>
  <text x="310" y="108" text-anchor="middle" class="fg-text">username · password · captcha</text>
  <rect x="276" y="114" width="68" height="18" rx="6" class="fg-btn-accent"/><text x="310" y="127" text-anchor="middle" class="fg-btn-txt-accent">Sign in</text>
</svg>`,
confirm: `<svg class="help-fig" viewBox="0 0 620 180" role="img">
  <rect x="15" y="40" width="170" height="100" rx="12" class="fg-panel"/>
  <circle cx="100" cy="70" r="15" class="fg-accent" opacity=".15"/>
  <path d="M94 70l5 5 9-10" class="fg-arrow-head"/>
  <text x="100" y="102" text-anchor="middle" class="fg-head">Action</text>
  <text x="100" y="120" text-anchor="middle" class="fg-text">run_command · apply_fix</text>
  <path d="M195 90h55" class="fg-arrow"/><path d="M245 90l-9-6M245 90l-9 6" class="fg-arrow-head"/>
  <rect x="258" y="40" width="170" height="100" rx="12" class="fg-panel"/>
  <circle cx="343" cy="70" r="15" class="fg-warn" opacity=".2"/>
  <path d="M343 62v16M335 70h16" class="fg-arrow-head"/>
  <text x="343" y="102" text-anchor="middle" class="fg-head">Confirm</text>
  <text x="343" y="120" text-anchor="middle" class="fg-text">y · approve + password</text>
  <path d="M438 90h55" class="fg-arrow"/><path d="M488 90l-9-6M488 90l-9 6" class="fg-arrow-head"/>
  <rect x="501" y="40" width="104" height="100" rx="12" class="fg-panel"/>
  <circle cx="553" cy="70" r="15" class="fg-ok" opacity=".2"/>
  <path d="M547 70l5 5 9-10" class="fg-arrow-head"/>
  <text x="553" y="102" text-anchor="middle" class="fg-head">Executed</text>
</svg>`,
};

I18N.zh["help.body"] = `
<h3 id="get-started">入门</h3>
<h4 id="what-is">它是什么</h4>
<p>Fixflow 是装在你自己服务器上的 AI 运维助手。用中文描述问题，它会调用命令检查服务器、定位问题，并在你确认后执行修复。所有删除 / 修改 / 安装类操作都必须经你确认。</p>

<h4 id="quick-start">快速开始</h4>
${FIG.setup}
<ol>
  <li>安装：<code>npm i -g fixflow</code>，然后运行 <code>fixflow</code> 进入配置向导。</li>
  <li>向导：选服务商 → 粘贴 API Key → 选模型 → 选择是否启动面板。</li>
  <li>选择启动面板时，配置完成后会自动自检，看到「全部正常」即成功。</li>
  <li>访问面板：向导结束会打印访问地址（形如 <code>http://服务器IP:端口/随机入口/</code>）；忘记入口 / 端口时运行 <code>fixflow default</code> 重新查看。</li>
  <li>随时自检：<code>fixflow doctor</code>。</li>
</ol>

<h3 id="cli">命令行（CLI）</h3>
<h4 id="cli-sub">子命令</h4>
<table>
  <tr><th>命令</th><th>作用</th></tr>
  <tr><td><code>fixflow</code></td><td>未配置时进入配置向导；已配置则进入对话</td></tr>
  <tr><td><code>fixflow web</code></td><td>启动 Web 面板</td></tr>
  <tr><td><code>fixflow default</code></td><td>打印面板访问地址（忘记入口 / 端口时用）</td></tr>
  <tr><td><code>fixflow doctor</code></td><td>自检：Node 版本 / 配置 / 大模型连通 / 面板服务</td></tr>
  <tr><td><code>fixflow restart</code></td><td>重启面板服务</td></tr>
  <tr><td><code>fixflow reset-password</code></td><td>重置面板登录密码</td></tr>
  <tr><td><code>fixflow uninstall</code></td><td>卸载（停服务 + 卸载全局包，配置保留）</td></tr>
  <tr><td><code>fixflow --version</code></td><td>查看版本</td></tr>
</table>
<h4 id="cli-examples">对话示例</h4>
<pre>检查磁盘空间并汇报
防火墙开了哪些端口
Nginx 配置有问题吗，帮我看看
帮我清理 /var/log 下 30 天前的日志</pre>
<h4 id="cli-builtin">内置命令</h4>
<table>
  <tr><th>操作</th><th>作用</th></tr>
  <tr><td><code>help</code> / <code>?</code></td><td>显示帮助</td></tr>
  <tr><td><code>clear</code> / 清空历史</td><td>清空当前会话对话</td></tr>
  <tr><td><code>exit</code> / <code>quit</code></td><td>退出会话</td></tr>
  <tr><td>↑ / ↓ 方向键</td><td>切换历史输入过的命令</td></tr>
  <tr><td>Ctrl+C（任务运行中）</td><td>中止当前任务（同时中断模型请求）</td></tr>
  <tr><td>Ctrl+C（空闲时）</td><td>退出会话</td></tr>
</table>
<h3 id="web">登录与面板布局</h3>
<h4 id="account">账号与登录</h4>
${FIG.account}
<ol>
  <li>首次访问注册账号（用户名 + 密码 + 验证码），之后用同一账号登录。</li>
  <li>密码要求：8-24 位，且同时包含字母、数字和特殊字符。</li>
  <li>登录后会话 12 小时有效；点右上角账号名 → 「修改密码」（需输入当前密码，修改后需重新登录）。</li>
  <li>忘记密码：登录页点「忘记密码？」查看说明，或在服务器运行 <code>fixflow reset-password</code>。</li>
</ol>
<h4 id="topbar">顶部栏</h4>
${FIG.topbar}
<ul>
  <li><b>帮助文档</b>：打开本说明。</li>
  <li><b>语言</b>：中 / EN 实时切换（AI 回复语言跟随面板语言）。</li>
  <li><b>告警</b>：铃铛打开告警管理。</li>
  <li><b>主题</b>：亮 / 暗切换。</li>
  <li><b>账号菜单</b>：重启服务 / 修改密码 / 退出登录。</li>
</ul>

<h3 id="monitor">监控</h3>
<h4 id="view-overview">总览</h4>
${FIG.layout}
<p>监控总览自动刷新（总览约 3 秒、卡片约 10 秒）：</p>
<ul>
  <li>四张环形图：负载 / CPU / 内存 / 磁盘使用率。</li>
  <li>面板自身内存占用卡片。</li>
  <li>图表区：网络流量、磁盘 IO、Token 用量趋势。</li>
  <li>左下角菜单可切换到系统、网络等子页。</li>
</ul>
<h4 id="view-system">系统</h4>
${FIG.system}
<ol>
  <li>查看各项健康检查明细（服务 / 资源 / 关键组件状态）。</li>
  <li>点「生成报告」一键汇总，可复制或下载 .md 文件。</li>
  <li>有异常项时优先处理告警提示的组件。</li>
</ol>
<h4 id="view-network">网络</h4>
${FIG.network}
<ol>
  <li>「端口监听」：查看当前所有监听端口及其进程。</li>
  <li>「端口占用」：输入端口号查询被哪个进程占用。</li>
  <li>「连通性检测」：输入目标地址做 ping，看网络是否可达。</li>
</ol>
<h3 id="nginx-fw">Nginx 与防火墙</h3>
<h4 id="view-nginx">Nginx</h4>
${FIG.nginx}
<ol>
  <li>顶部查看运行状态与版本。</li>
  <li>「校验配置」检查语法；「错误日志」查看最近报错。</li>
  <li>点击配置文件名查看 / 编辑内容，保存后点「保存重载」生效。</li>
  <li>服务操作：启动 / 停止 / 重启。</li>
</ol>
<p class="help-tip">改配置前建议先校验，保存重载失败时页面会报错并保持原配置。</p>

<h4 id="view-firewall">防火墙</h4>
${FIG.firewall}
<ol>
  <li>查看防火墙状态与放行规则列表。</li>
  <li>「对全网开放」的端口会标红提示风险。</li>
  <li>点「关闭端口」可一键移除放行（敏感操作，需重输登录密码）。</li>
</ol>
<h4 id="view-acl">黑白名单</h4>
${FIG.acl}
<ol>
  <li>针对面板端口做 IP 访问控制，需已启用 UFW 防火墙。</li>
  <li><b>黑名单</b>：禁止的 IP；<b>白名单</b>：仅允许的 IP。</li>
  <li>新增 / 删除条目立即生效。</li>
</ol>

<h3 id="resources">资源管理</h3>
<h4 id="view-databases">数据库</h4>
${FIG.databases}
<ol>
  <li>点「添加」选择类型（PostgreSQL / MySQL / Redis / MongoDB / SQLite），填地址、账号密码。</li>
  <li>「测试连接」验证配置；「启用 / 停用」切换是否纳入管理；「删除」移除该连接。</li>
  <li>连接异常时列表会标记告警状态。</li>
</ol>
<h4 id="view-docker">Docker</h4>
${FIG.docker}
<ol>
  <li>容器列表：查看状态与 CPU / 内存占用。</li>
  <li>操作：启动 / 停止 / 重启 / 删除容器；查看详情与日志。</li>
  <li>镜像列表：可清理悬空镜像释放磁盘。</li>
</ol>
<h4 id="view-ssl">SSL 证书</h4>
${FIG.ssl}
<ol>
  <li>自动发现服务器上的证书，也可手动添加站点。</li>
  <li>每张卡显示到期进度与 SAN 域名；即将到期会标黄。</li>
  <li>点「续签」一键更新（敏感操作，需重输登录密码）。</li>
  <li>到期告警通过「告警管理」的指标规则触发。</li>
</ol>
<h4 id="view-services">服务</h4>
${FIG.systemd}
<ol>
  <li>systemd 服务列表，可按状态 / 类型筛选。</li>
  <li>操作：启动 / 停止 / 重启 / 重载 / 开机自启。</li>
  <li>点开详情：依赖关系、内嵌日志查看。</li>
  <li>failed 状态的服务会触发告警提示。</li>
</ol>
<h4 id="view-store">软件商店</h4>
${FIG.store}
<ol>
  <li>浏览可选软件，查看说明与版本。</li>
  <li>点「安装」执行安装（安装类操作会弹确认，需重输登录密码）。</li>
</ol>
<h4 id="view-logs">日志</h4>
${FIG.logs}
<ol>
  <li>选择来源：系统服务 / Docker 容器日志。</li>
  <li>搜索过滤关键字、按需「跟随」实时输出。</li>
  <li>复制 / 导出日志；或点「AI 分析」让模型解读报错。</li>
</ol>
<h3 id="interact">对话、终端与告警</h3>
<h4 id="chat">Agent 对话</h4>
${FIG.chat}
<ol>
  <li>直接打字让助手干活，回复逐字显示；支持上传图片。</li>
  <li>会改动系统的操作会弹「变更审批单」，确认后才执行。</li>
  <li>敏感操作（关端口、改配置、文件写操作、证书续签等）确认时还需重输登录密码。</li>
  <li>输入框上方「清空历史」清空当前会话；「终端」打开右侧终端。</li>
</ol>
<p class="help-tip">任务运行中可随时停止生成 / 中断任务。</p>

<h4 id="fs-terminal">终端与文件管理</h4>
${FIG.fs}
<ol>
  <li>内置 Web 终端，可直接在面板里执行命令。</li>
  <li>下方文件管理器：浏览目录、新建文件夹、上传 / 下载 / 编辑 / 重命名 / 删除文件。</li>
  <li>点终端栏「文件」按钮可折叠 / 展开文件模块（状态会记住）。</li>
</ol>
<h4 id="alerts">告警管理（右上角铃铛）</h4>
${FIG.alerts}
<ol>
  <li><b>日报告警</b>：配置 SMTP 邮箱，设定每日时间与指令，模型自动生成报表并发送。</li>
  <li><b>指标告警</b>：设置面板外网地址 / Webhook；按 CPU / 内存 / 磁盘 / 网络流量 / TCP 会话数设阈值、持续时间与级别（P1–P5）；事件可认领、恢复。</li>
  <li><b>面板内存</b>：在「设置」里配置面板进程内存上限，超出时页面顶部弹横幅提示（仅提示，不中断服务）。</li>
</ol>
<h4 id="settings">设置</h4>
${FIG.settings}
<ol>
  <li>左下角「设置」→ 模型设置：改 API 地址 / Key / 模型，保存即生效。</li>
  <li>可配置面板内存上限、重启服务、退出登录。</li>
</ol>

<h3 id="security">工具与安全</h3>
${FIG.confirm}
<table>
  <tr><th>工具</th><th>用途</th><th>权限</th></tr>
  <tr><td>run_command</td><td>执行命令检查 / 操作</td><td>只读自动执行；删除 / 修改 / 安装类需确认</td></tr>
  <tr><td>read_file</td><td>读取日志、配置</td><td>自动执行</td></tr>
  <tr><td>apply_fix</td><td>执行修复命令</td><td>必须确认</td></tr>
  <tr><td>clear_history</td><td>清空会话历史</td><td>自动执行</td></tr>
</table>
<p>所有写入 / 删除 / 修改操作执行前都会弹确认：命令行输入 <code>y</code> 才执行，面板点「确认执行」。已执行的修改无法自动撤销，但操作前都有确认环节。</p>

<h3 id="advanced">配置与进阶</h3>
<ul>
  <li>配置文件：<code>~/.config/fixflow/config.json</code>。常用键：<code>apiKey</code> / <code>baseUrl</code> / <code>model</code> / <code>port</code> / <code>services</code> / <code>databases</code> / <code>sslSites</code> / <code>pingTargets</code> / <code>memLimitMB</code> / <code>lang</code> / <code>theme</code>。</li>
  <li>环境变量可覆盖：<code>FIXFLOW_API_KEY</code> / <code>FIXFLOW_BASE_URL</code> / <code>FIXFLOW_MODEL</code>。</li>
  <li>面板监听 <code>0.0.0.0</code>，用「随机端口 + 随机入口路径」保护（无入口前缀的请求返回 404）；启动时会尝试自动放行本机防火墙端口。可用 nginx 反代绑定域名，或启用内置 HTTPS（自签证书）。</li>
  <li>常用命令：<code>systemctl status fixflow</code> / <code>restart fixflow</code> / <code>stop fixflow</code>；日志 <code>~/.config/fixflow/cli.log</code>。</li>
  <li>重置模型 / 服务商：面板「模型设置」保存即生效；或 <code>rm -rf ~/.config/fixflow</code> 后重新运行 <code>fixflow</code>。</li>
</ul>

<h3 id="faq">常见问题</h3>
<table>
  <tr><th>现象</th><th>处理</th></tr>
  <tr><td>向导提示"无法连接"</td><td>服务器访问不了该 API 地址，检查外网 / 防火墙 / 地址</td></tr>
  <tr><td>提示"API Key 无效"</td><td>重新复制粘贴 Key</td></tr>
  <tr><td>面板打不开</td><td>运行 <code>fixflow doctor</code> 检查；未运行就 <code>fixflow web</code></td></tr>
  <tr><td>对话报 LLM API 400</td><td>多为会话上下文异常，点「重启服务」一键修复</td></tr>
  <tr><td>监控显示 N/A</td><td>对应组件没装（如没装 Docker），不影响其他功能</td></tr>
  <tr><td>忘记面板密码</td><td>在服务器运行 <code>fixflow reset-password</code></td></tr>
</table>

`;

I18N.en["help.body"] = `
<h3 id="get-started">Getting Started</h3>
<h4 id="what-is">What is Fixflow</h4>
<p>Fixflow is an AI ops assistant installed on your own server. Describe a problem in plain language and it will run commands to check the server, find the cause, and apply a fix after your confirmation. All delete / modify / install operations require your confirmation.</p>

<h4 id="quick-start">Quick Start</h4>
${FIG.setup}
<ol>
  <li>Install: <code>npm i -g fixflow</code>, then run <code>fixflow</code> to enter the setup wizard.</li>
  <li>Wizard: choose provider → paste API Key → pick model → choose whether to start the panel.</li>
  <li>When you choose to start the panel, a self-check runs after setup; seeing "All OK" means success.</li>
  <li>Open the panel: the wizard prints the access URL (like <code>http://SERVER_IP:PORT/RANDOM_PATH/</code>); run <code>fixflow default</code> on the server to print it again if you forget the port / entry path.</li>
  <li>Run a self-check anytime: <code>fixflow doctor</code>.</li>
</ol>

<h3 id="cli">Command Line (CLI)</h3>
<h4 id="cli-sub">Subcommands</h4>
<table>
  <tr><th>Command</th><th>Effect</th></tr>
  <tr><td><code>fixflow</code></td><td>Setup wizard if unconfigured; otherwise start chatting</td></tr>
  <tr><td><code>fixflow web</code></td><td>Start the web panel</td></tr>
  <tr><td><code>fixflow default</code></td><td>Print the panel access URL (when you forget the port / entry path)</td></tr>
  <tr><td><code>fixflow doctor</code></td><td>Self-check: Node version / config / LLM connectivity / panel service</td></tr>
  <tr><td><code>fixflow restart</code></td><td>Restart the panel service</td></tr>
  <tr><td><code>fixflow reset-password</code></td><td>Reset the panel login password</td></tr>
  <tr><td><code>fixflow uninstall</code></td><td>Uninstall (stop service + remove global package, keep config)</td></tr>
  <tr><td><code>fixflow --version</code></td><td>Show version</td></tr>
</table>
<h4 id="cli-examples">Chat examples</h4>
<pre>Check disk space and report
Which ports are open on the firewall
Is my Nginx config OK?
Clean logs older than 30 days under /var/log</pre>
<h4 id="cli-builtin">Built-in commands</h4>
<table>
  <tr><th>Action</th><th>Effect</th></tr>
  <tr><td><code>help</code> / <code>?</code></td><td>Show help</td></tr>
  <tr><td><code>clear</code></td><td>Clear current session chat</td></tr>
  <tr><td><code>exit</code> / <code>quit</code></td><td>Exit session</td></tr>
  <tr><td>↑ / ↓ arrow keys</td><td>Cycle through command history</td></tr>
  <tr><td>Ctrl+C (task running)</td><td>Abort current task (also interrupts the model request)</td></tr>
  <tr><td>Ctrl+C (idle)</td><td>Exit session</td></tr>
</table>
<h3 id="web">Login &amp; Panel Layout</h3>
<h4 id="account">Account &amp; Login</h4>
${FIG.account}
<ol>
  <li>Register on first visit (username + password + captcha), then log in with the same account.</li>
  <li>Password rule: at least 8 characters with letters, digits and special characters.</li>
  <li>Sessions last 12 hours; click the account name (top-right) → "Change Password" (requires the current password; log in again afterwards).</li>
  <li>Forgot password: click "Forgot password?" on the login page, or run <code>fixflow reset-password</code> on the server.</li>
</ol>
<h4 id="topbar">Top Bar</h4>
${FIG.topbar}
<ul>
  <li><b>Help</b>: open this document.</li>
  <li><b>Language</b>: switch ZH / EN live (AI replies follow the panel language).</li>
  <li><b>Alerts</b>: the bell opens alert management.</li>
  <li><b>Theme</b>: light / dark.</li>
  <li><b>Account menu</b>: restart service / change password / log out.</li>
</ul>

<h3 id="monitor">Monitoring</h3>
<h4 id="view-overview">Overview</h4>
${FIG.layout}
<p>Auto-refresh: overview ~3s, cards ~10s.</p>
<ul>
  <li>Four ring cards: load / CPU / memory / disk usage.</li>
  <li>Panel process memory card.</li>
  <li>Charts: network traffic, disk IO, token usage trends.</li>
  <li>The left sidebar switches to System / Network and other sub-pages.</li>
</ul>
<h4 id="view-system">System</h4>
${FIG.system}
<ol>
  <li>View each health-check detail (services / resources / key component status).</li>
  <li>Click "Generate report" to summarize; copy or download the .md file.</li>
  <li>Handle failing components first.</li>
</ol>
<h4 id="view-network">Network</h4>
${FIG.network}
<ol>
  <li>"Listening ports": view all listening ports and their processes.</li>
  <li>"Port lookup": enter a port to find which process uses it.</li>
  <li>"Connectivity": ping a target to check reachability.</li>
</ol>
<h3 id="nginx-fw">Nginx &amp; Firewall</h3>
<h4 id="view-nginx">Nginx</h4>
${FIG.nginx}
<ol>
  <li>Check running status and version at the top.</li>
  <li>"Validate" checks syntax; "Error log" shows recent failures.</li>
  <li>Click a config file to view / edit; click "Save &amp; reload" to apply.</li>
  <li>Service actions: start / stop / restart.</li>
</ol>
<p class="help-tip">Validate before editing. If save-and-reload fails, the page reports the error and keeps the original config.</p>

<h4 id="view-firewall">Firewall</h4>
${FIG.firewall}
<ol>
  <li>Check firewall status and allow rules.</li>
  <li>Ports open to the whole internet are marked as a risk.</li>
  <li>"Close port" removes the allow rule (sensitive action, requires re-entering the login password).</li>
</ol>
<h4 id="view-acl">Blacklist / Whitelist</h4>
${FIG.acl}
<ol>
  <li>IP access control for the panel port; requires UFW enabled.</li>
  <li><b>Blacklist</b>: blocked IPs; <b>Whitelist</b>: only allowed IPs.</li>
  <li>Adding / removing entries takes effect immediately.</li>
</ol>

<h3 id="resources">Resources</h3>
<h4 id="view-databases">Databases</h4>
${FIG.databases}
<ol>
  <li>Click "Add", pick the type (PostgreSQL / MySQL / Redis / MongoDB / SQLite), fill in host, user and password.</li>
  <li>"Test" verifies the config; "Enable / Disable" toggles management; "Delete" removes the connection.</li>
  <li>Unhealthy connections are marked with an alert state.</li>
</ol>
<h4 id="view-docker">Docker</h4>
${FIG.docker}
<ol>
  <li>Container list: check status and CPU / memory usage.</li>
  <li>Actions: start / stop / restart / remove; view details and logs.</li>
  <li>Image list: prune dangling images to free disk.</li>
</ol>
<h4 id="view-ssl">SSL Certificates</h4>
${FIG.ssl}
<ol>
  <li>Certificates on the server are auto-discovered; you can also add sites manually.</li>
  <li>Each card shows the expiry bar and SAN domains; expiring soon is highlighted.</li>
  <li>"Renew" updates with one click (sensitive action, requires the login password).</li>
  <li>Expiry alerts fire through the metric rules in "Alert Management".</li>
</ol>
<h4 id="view-services">Services</h4>
${FIG.systemd}
<ol>
  <li>systemd service list, filterable by status / type.</li>
  <li>Actions: start / stop / restart / reload / enable on boot.</li>
  <li>Open a service for details, dependencies and inline logs.</li>
  <li>Failed services trigger an alert.</li>
</ol>
<h4 id="view-store">App Store</h4>
${FIG.store}
<ol>
  <li>Browse available software; check descriptions and versions.</li>
  <li>Click "Install" to install (install actions prompt for confirmation and the login password).</li>
</ol>
<h4 id="view-logs">Logs</h4>
${FIG.logs}
<ol>
  <li>Pick the source: system services / Docker container logs.</li>
  <li>Search and filter by keyword; "Follow" streams live output.</li>
  <li>Copy / export logs, or click "AI analyze" to have the model interpret errors.</li>
</ol>
<h3 id="interact">Chat, Terminal &amp; Alerts</h3>
<h4 id="chat">Agent Chat</h4>
${FIG.chat}
<ol>
  <li>Type directly and let the assistant work; replies stream word by word; image upload is supported.</li>
  <li>Operations that change the system show a "Change Approval" card and run only after you confirm.</li>
  <li>Sensitive actions (close port, config changes, file writes, cert renewal, etc.) also require re-entering the login password.</li>
  <li>"Clear history" above the input clears the session; "Terminal" opens the side terminal.</li>
</ol>
<p class="help-tip">You can stop generation / abort a task at any time while it runs.</p>

<h4 id="fs-terminal">Terminal &amp; File Manager</h4>
${FIG.fs}
<ol>
  <li>A built-in web terminal to run commands inside the panel.</li>
  <li>File manager below: browse, new folder, upload / download / edit / rename / delete.</li>
  <li>The "Files" button in the terminal bar collapses / expands the file module (state is remembered).</li>
</ol>
<h4 id="alerts">Alert Management (bell, top-right)</h4>
${FIG.alerts}
<ol>
  <li><b>Daily alerts</b>: configure SMTP, set a daily time and instruction; the model generates and emails a report.</li>
  <li><b>Metric alerts</b>: set the panel URL / webhook; rules on CPU / memory / disk / network / TCP sessions with threshold, duration and level (P1–P5); incidents can be claimed / resolved.</li>
  <li><b>Panel memory</b>: set the panel process memory limit in "Settings"; a banner appears at the top when exceeded (alert only, no service interruption).</li>
</ol>
<h4 id="settings">Settings</h4>
${FIG.settings}
<ol>
  <li>Bottom-left "Settings" → model settings: change API URL / Key / model, takes effect on save.</li>
  <li>Also configure the panel memory limit, restart the service, and log out.</li>
</ol>

<h3 id="security">Tools &amp; Security</h3>
${FIG.confirm}
<table>
  <tr><th>Tool</th><th>Purpose</th><th>Permission</th></tr>
  <tr><td>run_command</td><td>Run commands to check / operate</td><td>Read-only auto; delete / modify / install need confirmation</td></tr>
  <tr><td>read_file</td><td>Read logs, configs</td><td>Auto</td></tr>
  <tr><td>apply_fix</td><td>Apply fix commands</td><td>Always confirm</td></tr>
  <tr><td>clear_history</td><td>Clear session history</td><td>Auto</td></tr>
</table>
<p>Every write / delete / modify operation asks for confirmation first: type <code>y</code> in the CLI, or click "Confirm" in the panel. Executed changes cannot be undone automatically, but everything is confirmed beforehand.</p>

<h3 id="advanced">Configuration &amp; Advanced</h3>
<ul>
  <li>Config file: <code>~/.config/fixflow/config.json</code>. Common keys: <code>apiKey</code> / <code>baseUrl</code> / <code>model</code> / <code>port</code> / <code>services</code> / <code>databases</code> / <code>sslSites</code> / <code>pingTargets</code> / <code>memLimitMB</code> / <code>lang</code> / <code>theme</code>.</li>
  <li>Environment overrides: <code>FIXFLOW_API_KEY</code> / <code>FIXFLOW_BASE_URL</code> / <code>FIXFLOW_MODEL</code>.</li>
  <li>The panel listens on <code>0.0.0.0</code>, protected by a random port + random entry path (requests without the entry prefix return 404); it tries to open the local firewall port on startup. Bind a domain via an nginx reverse proxy, or enable built-in HTTPS (self-signed).</li>
  <li>Common commands: <code>systemctl status fixflow</code> / <code>restart fixflow</code> / <code>stop fixflow</code>; log at <code>~/.config/fixflow/cli.log</code>.</li>
  <li>Reset model / provider: save in "Model Settings", or <code>rm -rf ~/.config/fixflow</code> then re-run <code>fixflow</code>.</li>
</ul>

<h3 id="faq">FAQ</h3>
<table>
  <tr><th>Symptom</th><th>Fix</th></tr>
  <tr><td>Wizard says "cannot connect"</td><td>Server cannot reach the API URL; check network / firewall / address</td></tr>
  <tr><td>"API Key invalid"</td><td>Copy and paste the Key again</td></tr>
  <tr><td>Panel won't open</td><td>Run <code>fixflow doctor</code>; if not running, run <code>fixflow web</code></td></tr>
  <tr><td>Chat gets LLM API 400</td><td>Usually a bad session context; click "Restart service"</td></tr>
  <tr><td>Monitoring shows N/A</td><td>Component not installed (e.g. no Docker); other features unaffected</td></tr>
  <tr><td>Forgot panel password</td><td>Run <code>fixflow reset-password</code> on the server</td></tr>
</table>

`;

function t(key) {
  return I18N[curLang][key] || I18N.zh[key] || key;
}

function applyLang(lang) {
  curLang = lang === "en" ? "en" : "zh";
  document.documentElement.lang = curLang;
  document.querySelectorAll(".lang-btn").forEach((btn) => { btn.textContent = curLang === "zh" ? "EN" : "中文"; });
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    const attr = el.dataset.i18nAttr;
    if (attr) el.setAttribute(attr, t(key));
    else el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  if (window.buildHelpToc) window.buildHelpToc();
  else setTimeout(() => window.buildHelpToc && window.buildHelpToc(), 0);
  const titleEl = document.getElementById("view-title");
  if (titleEl && titleEl.dataset.i18nTitle) titleEl.textContent = t(titleEl.dataset.i18nTitle);
}
