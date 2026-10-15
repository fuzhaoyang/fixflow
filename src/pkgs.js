// 包管理器抽象：apt / dnf / yum / apk / pacman / zypper
// 统一提供：检测、已装判定、搜索、版本、安装/卸载命令与输出解析
import { runCommand } from "./tools.js";

const PM_BIN = { apt: "apt-get", dnf: "dnf", yum: "yum", apk: "apk", pacman: "pacman", zypper: "zypper" };

export async function detectPkgManager({ run = runCommand } = {}) {
  const r = await run("command -v apt-get dnf yum apk pacman zypper 2>/dev/null");
  const have = new Set(String(r.stdout || "").split("\n").map((s) => s.trim()).filter(Boolean).map((p) => p.split("/").pop()));
  for (const fam of Object.keys(PM_BIN)) {
    if (have.has(PM_BIN[fam])) return { family: fam, name: PM_BIN[fam] };
  }
  return { family: "none", name: "" };
}

// 精选清单中 Debian 系包名到其它系的映射
const PKG_ALIASES = {
  "docker.io": { dnf: "docker", yum: "docker", apk: "docker", pacman: "docker", zypper: "docker" },
  "postgresql": { dnf: "postgresql-server", yum: "postgresql-server", apk: "postgresql", pacman: "postgresql", zypper: "postgresql-server" },
  "redis-server": { dnf: "redis", yum: "redis", apk: "redis", pacman: "redis", zypper: "redis" },
  "nginx-extras": { dnf: "nginx", yum: "nginx", apk: "nginx", pacman: "nginx-mainline", zypper: "nginx" },
};
export function resolvePkgName(family, name) {
  return (PKG_ALIASES[name] && PKG_ALIASES[name][family]) || name;
}

// 串行化包管理器命令：rpm/dpkg 的 Berkeley DB 不支持并发访问，并发会触发 DB_RUNRECOVERY
let pmChain = Promise.resolve();
export function withPmLock(fn) {
  const p = pmChain.then(fn, fn);
  pmChain = p.then(() => {}, () => {});
  return p;
}

// 识别包管理器数据库/锁异常，返回友好提示（无匹配返回 null）
export function pmErrorHint(text) {
  const t = String(text || "");
  if (/rpmdb|BDB\d|DB_RUNRECOVERY|\/var\/lib\/rpm/i.test(t)) return "系统软件包数据库异常（rpmdb 需恢复），请在服务器执行 rpm --rebuilddb 后重试";
  if (/Could not get lock|Unable to acquire|dpkg frontend|frontend lock|正在等待缓存锁/i.test(t)) return "软件包管理器被其它进程占用（锁），请稍后重试";
  return null;
}

// --- 已装判定 ---
export function listInstalledCmd(family) {
  switch (family) {
    case "apt": return "dpkg-query -W -f='${Status} ${Package}\\n'";
    case "dnf": case "yum": case "zypper": return "rpm -qa --qf='%{NAME}\\n'";
    case "apk": return "apk info";
    case "pacman": return "pacman -Qq";
    default: return null;
  }
}

// 解析 dpkg-query 输出，返回已安装包名集合（兼容多架构后缀 :amd64）
export function parseInstalledDpkg(stdout) {
  const out = new Set();
  for (const line of String(stdout || "").split("\n")) {
    if (!line.includes("install ok installed")) continue;
    const pkg = line.trim().split(/\s+/).pop().split(":")[0];
    if (pkg) out.add(pkg);
  }
  return out;
}

export function parseInstalledNames(text, family) {
  if (family === "apt") return parseInstalledDpkg(text);
  return new Set(String(text || "").split("\n").map((l) => l.trim()).filter(Boolean));
}

// --- 搜索 ---
export function searchCmd(family, q) {
  const Q = JSON.stringify(q);
  switch (family) {
    case "apt": return `apt-cache search -n ${Q} 2>/dev/null | head -50`;
    case "dnf": return `dnf search ${Q} 2>/dev/null | head -50`;
    case "yum": return `yum search ${Q} 2>/dev/null | head -50`;
    case "apk": return `apk search -d ${Q} 2>/dev/null | head -50`;
    case "pacman": return `pacman -Ss ${Q} 2>/dev/null | head -50`;
    case "zypper": return `zypper --non-interactive search ${Q} 2>/dev/null | head -50`;
    default: return null;
  }
}

export function parseSearch(text, family) {
  const t = String(text || "");
  const out = [];
  if (family === "apt" || family === "apk") {
    for (const l of t.split("\n")) {
      const sep = l.indexOf(" - ");
      if (sep > 0) out.push({ name: l.slice(0, sep).trim(), desc: l.slice(sep + 3).trim() });
    }
  } else if (family === "dnf" || family === "yum") {
    for (const l of t.split("\n")) {
      const sep = l.indexOf(" : ");
      if (sep < 0) continue;
      const name = l.slice(0, sep).trim().replace(/\.(x86_64|noarch|i686|aarch64|src)$/, "");
      const desc = l.slice(sep + 3).trim();
      if (name && !name.startsWith("Last metadata")) out.push({ name, desc });
    }
  } else if (family === "pacman") {
    for (const l of t.split("\n")) {
      const parts = l.trim().split(/\s+/);
      if (!parts.length || !parts[0].includes("/")) continue;
      const name = parts[0].split("/")[1];
      if (!name) continue;
      const desc = parts.slice(2).filter((w) => !/^\[/.test(w)).join(" ");
      out.push({ name, desc });
    }
  } else if (family === "zypper") {
    for (const l of t.split("\n")) {
      if (!l.includes("|")) continue;
      const c = l.split("|").map((s) => s.trim());
      const name = c[1];
      if (name === "Name" || !name) continue;
      out.push({ name, desc: c[3] || c[2] || "" });
    }
  }
  return out;
}

// --- 版本 ---
export function versionsCmd(family, pkg) {
  switch (family) {
    case "apt": return `LC_ALL=C apt-cache policy ${pkg} 2>/dev/null`;
    case "dnf": case "yum": return `${family} --showduplicates list ${pkg} 2>/dev/null`;
    case "apk": return `apk policy ${pkg} 2>/dev/null`;
    case "pacman": return `pacman -Si ${pkg} 2>/dev/null`;
    case "zypper": return `zypper --non-interactive info ${pkg} 2>/dev/null`;
    default: return null;
  }
}

// 解析 `LC_ALL=C apt-cache policy <pkg>` 输出
export function parseAptPolicy(text) {
  const t = String(text || "");
  const out = { installed: null, candidate: null, versions: [] };
  const inst = t.match(/^\s*Installed:\s*(.+)$/m);
  if (inst && inst[1].trim() && inst[1].trim() !== "(none)") out.installed = inst[1].trim();
  const cand = t.match(/^\s*Candidate:\s*(.+)$/m);
  if (cand && cand[1].trim()) out.candidate = cand[1].trim();
  let inTable = false;
  for (const line of t.split("\n")) {
    if (/^Version table:/i.test(line.trim())) { inTable = true; continue; }
    if (!inTable) continue;
    const m = line.match(/^\s*(\*\*\*)?\s*(\S+)\s+(\d+)\s*$/);
    if (m) out.versions.push({ version: m[2], priority: +m[3], isInstalled: !!m[1] });
  }
  return out;
}

export function parseVersions(text, family) {
  const t = String(text || "");
  if (family === "apt") return parseAptPolicy(t);
  const out = { installed: null, candidate: null, versions: [] };
  if (family === "dnf" || family === "yum") {
    let inAvail = false;
    for (const l of t.split("\n")) {
      if (/^Installed Packages/.test(l.trim())) { inAvail = false; continue; }
      if (/^Available Packages/.test(l.trim())) { inAvail = true; continue; }
      const f = l.trim().split(/\s+/);
      if (f.length < 2 || !/\d/.test(f[1])) continue;
      const ver = f[1];
      if (inAvail) {
        if (!out.candidate) out.candidate = ver;
        if (!out.versions.some((v) => v.version === ver)) out.versions.push({ version: ver, isInstalled: false });
      } else if (!out.installed) {
        out.installed = ver;
      }
    }
  } else if (family === "apk") {
    const inst = t.match(/installed:\s*(.+)/);
    if (inst && inst[1].trim()) out.installed = inst[1].trim();
    const avail = t.match(/available:\s*(.+)/);
    if (avail) {
      for (const v of avail[1].split(",")) {
        const ver = v.trim();
        if (!ver) continue;
        if (!out.candidate) out.candidate = ver;
        out.versions.push({ version: ver, isInstalled: ver === out.installed });
      }
    }
  } else if (family === "pacman" || family === "zypper") {
    const ver = t.match(/^Version\s*:\s*(.+)$/m);
    if (ver && ver[1].trim()) { out.candidate = ver[1].trim(); out.versions.push({ version: ver[1].trim(), isInstalled: false }); }
    if (family === "zypper") {
      const inst = t.match(/^Installed\s*:\s*(.+)$/m);
      if (inst && /yes/i.test(inst[1])) out.installed = out.candidate;
    }
  }
  return out;
}

// --- 安装 / 卸载 ---
export function installCmd(family, pkg, ver) {
  const v = ver ? "=" + ver : "";
  switch (family) {
    case "apt": return `DEBIAN_FRONTEND=noninteractive apt-get -o APT::Status-Fd=1 install -y ${pkg}${v}`;
    case "dnf": return `dnf install -y ${pkg}${v}`;
    case "yum": return `yum install -y ${pkg}${v}`;
    case "apk": return `apk add ${pkg}${v}`;
    case "pacman": return `pacman -S --noconfirm ${pkg}${v}`;
    case "zypper": return `zypper --non-interactive install ${pkg}${v}`;
    default: return null;
  }
}

export function uninstallCmd(family, pkg) {
  switch (family) {
    case "apt": return `DEBIAN_FRONTEND=noninteractive apt-get purge -y ${pkg}`;
    case "dnf": case "yum": return `${family} remove -y ${pkg}`;
    case "apk": return `apk del ${pkg}`;
    case "pacman": return `pacman -R --noconfirm ${pkg}`;
    case "zypper": return `zypper --non-interactive remove ${pkg}`;
    default: return null;
  }
}
