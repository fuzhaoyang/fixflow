# Fixflow 终端面板文件管理器

日期：2026-09-23
状态：需求已对齐

## 背景

终端面板（右侧 `term-pane`）当前只有终端交互。需要在**终端下方**增加文件管理区，参考宝塔文件管理器：左侧目录树 + 右侧文件列表，支持浏览与完整操作。零第三方依赖（Node 原生 `fs/promises` + 手写 multipart 解析）。

## 目标

1. **布局**：`term-pane` 内垂直分割——上方终端、下方文件管理器（中间可拖动分割条）
2. **目录树（左）**：层级展示、展开/折叠、选中高亮；懒加载（展开时拉取子目录）
3. **文件列表（右）**：列「文件名 / 大小 / 类型 / 修改时间 / 权限 / 用户/用户组」，列头可排序（文件名默认降序 `^`），行选中高亮，双击文件夹进入
4. **图标**：文件夹蓝色 📁、文件白色空白文档（SVG/emoji）
5. **操作**：新建文件夹、上传（multipart ≤50MB）、下载、编辑文本、重命名、删除（递归）；全部写操作统一密码确认
6. **浏览根**：从 `/` 开始，可浏览整个文件系统（生产 root 运行）

## 需求详情

### 一、后端接口（`server.js`）

新增路径安全函数：

```js
function safeFsPath(p) {
  if (!p || typeof p !== "string") return null;
  const abs = resolve(p);
  return abs.startsWith("/") ? abs : null;   // 允许整个文件系统，resolve 防 `..` 逃逸
}
```

用户/用户组名映射：读 `/etc/passwd` / `/etc/group` 构建 `uid→name` / `gid→name` 缓存（模块级 Map，首次读取后缓存）。

权限模式字符串：`lstat().mode` → `-rw-r--r--`（首字符 `d` 目录 / `l` 符号链接 / `-` 文件，后 9 位 rwx）。

| 方法 | 路径 | 参数 | 说明 |
|---|---|---|---|
| GET | `/api/fs/list` | `?path=` | 列目录 → `{ path, children: [{name,isDir,isSymlink,size,mtime,mode,uid,gid,user,group}] }`，`lstat` 逐项（Promise.all） |
| GET | `/api/fs/download` | `?path=` | 校验为文件，`createReadStream` 流式返回，`Content-Disposition: attachment` |
| POST | `/api/fs/read` | `{ path }` | 读文本（≤2MB，超出 400「文件过大」） |
| POST | `/api/fs/write` | `{ path, content, password }` | 写文本（覆盖），密码校验 |
| POST | `/api/fs/mkdir` | `{ path, name, password }` | 新建文件夹 |
| POST | `/api/fs/rename` | `{ path, newName, password }` | 重命名 |
| POST | `/api/fs/delete` | `{ path, password }` | 删除（`rm -rf` 语义：文件或目录递归），密码校验 |
| POST | `/api/fs/upload` | multipart（单文件 + `path` + `password`） | 保存到 `path/原名`，≤50MB，密码校验 |

- 全部走现有 `needsAuth`（`/api/` 前缀）
- 密码校验复用 `verifyPassword(password, auth)`（失败 403「密码错误，操作未执行」）
- 上传 multipart：零依赖手写解析——从 `Content-Type: multipart/form-data; boundary=...` 取 boundary，按 `\r\n--boundary` 切分字段与文件体，仅支持单文件 + `path`/`password` 两个文本字段；超 50MB 提前 413
- 错误统一 `{ error }`，`EACCES/ENOENT` 转友好提示「无权限 / 不存在」

### 二、前端

#### 2.1 布局（`index.html`）

`term-pane` 内改为：

```
term-head（标题栏：终端 | 清空/记录/✕）
term-terminal（终端，默认高 40%，可被分割条压缩）
term-fs-splitter（可拖动分割条，复用输入框拖动逻辑，改动 term-fs 高度）
fs-pane（文件管理器）：
  fs-toolbar（新建文件夹 | 上传 | 下载 | 编辑 | 重命名 | 删除，按钮按选中项启停）
  fs-body（左右两栏）
    fs-tree（目录树，左，~30%）
    fs-list-wrap（右，~70%）
      fs-table（表头 + 数据行）
```

#### 2.2 目录树（懒加载）

- 根 `/` 初始加载展开一级
- 每目录行：展开箭头（▶ 折叠 / ▼ 展开）+ 图标 + 名字；点击选中并触发右侧列表加载
- 展开时调 `/api/fs/list?path=<dir>` 只拿子目录填充（目录树只展示目录，不含文件）
- 选中目录浅蓝高亮（背景 `rgba(59,130,246,.15)`）

#### 2.3 文件列表

- 列：文件名（图标+名字）/ 大小（格式化 B/KB/MB/GB）/ 类型（目录/符号链接/文本/压缩包等按扩展名推断）/ 修改时间（YYYY-MM-DD HH:mm）/ 权限（rwx 字符串）/ 用户/用户组
- 排序：点击列头切换升/降序（当前列箭头 `^`/`v`），默认文件名降序
- 行点击选中（浅蓝高亮），双击文件夹进入（列表切换 + 树联动），双击文件进入编辑（文本）
- 图标：文件夹 `📁`（蓝）、文件白色空白文档（内联 SVG 文档图标，无填色）

#### 2.4 操作交互

- 全部写操作弹 **procMask 密码确认框**（扩展 `proc-confirm`：新增 `kind: "fs"` 分支，请求 `/api/fs/*`）
- 新建文件夹：弹输入框（文件名）→ 密码框 → POST
- 上传：`<input type=file>` 选择（≤50MB）→ 构造 FormData（含 path/password）→ 密码先弹框 → POST multipart
- 下载：`window.location` 或 `<a download>` 指向 `/api/fs/download?path=`
- 编辑：弹编辑弹窗（复用 nginx 编辑弹窗样式）读文本 → 保存走密码确认
- 删除：确认「删除后不可恢复」→ 密码 → POST
- 操作成功刷新当前目录列表 + 树

### 三、安全

- 所有写操作：`needsAuth` + `verifyPassword` 双重校验
- `safeFsPath` 强制绝对路径 + `resolve` 规范化，杜绝 `..` 逃逸
- 下载校验目标为文件（`lstat.isFile()`），防目录流式读取
- 读文本限制 2MB、上传限制 50MB（超限提前拒绝）
- 上传文件名 `basename` 清洗（防路径穿越）

### 四、测试（node --test）

1. **safeFsPath**：相对路径/`..` 逃逸拒绝、绝对路径通过
2. **/api/fs/list**：临时目录列出子项、无权限返回友好错误
3. **写操作鉴权**：未登录 401、密码错误 403 且不执行
4. **mkdir/rename/write/delete**：临时目录内走通 + 结果验证
5. **read 超限**：>2MB 返回 400
6. **upload**：构造 multipart 报文上传临时目录成功、超限 413、文件名穿越被清洗

## 不做的事

- 不做解压/压缩、移动/复制、权限（chmod/chown）修改
- 不做大文件分段上传（仅 ≤50MB 单请求）
- 不做二进制文件编辑（只读文本）
- 不做回收站（删除即 rm -rf，确认文案明示）

## 风险与降级

| 场景 | 处理 |
|---|---|
| 非 root 运行 | `lstat/readdir` EACCES → 返回「无权限」，树/列表相应目录空白并提示 |
| 大目录（上万文件） | 列表一次返回，前端虚拟滚动不做；超出时提示 |
| 符号链接指向系统关键路径 | 列表标 `→ 目标`，删除/重命名按 lstat 不跟随链接 |
| multipart 解析异常 | 返回 400「上传格式错误」，不破坏已有文件 |
