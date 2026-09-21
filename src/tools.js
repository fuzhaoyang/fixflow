import { exec } from "node:child_process";
import { readFile as fsReadFile } from "node:fs/promises";

const MAX_OUTPUT = 50 * 1024;
const truncate = (s) => (s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + "\n...[已截断]" : s);

const SECRET_PATTERNS = [
  /(sk-[A-Za-z0-9]{16,})/g,
  /(AKIA[A-Z0-9]{16})/g,
  /(\bAIza[0-9A-Za-z_-]{35})/g,
  /(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/g,
  /(\bBearer\s+[A-Za-z0-9._-]{20,})/gi,
  /((?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["']?[^\s"'&|;]{6,})/gi,
];

export function redactSecrets(s) {
  if (typeof s !== "string") return s;
  let out = s;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "******");
  return out;
}

const WRITE_CMDS = [
  /\brm\b/, /\bmv\b/, /\bcp\b/, /\bmkdir\b/, /\brmdir\b/, /\btouch\b/, /\btruncate\b/,
  /\bsed\s+-i\b/, /\bawk\s+[\"'\`]?[^\"'\`]*(\>\s*[^;|&]|printf\s+[^\"'\`]*>)/,
  /\bchmod\b/, /\bchown\b/, /\bchgrp\b/,
  /(^|[;&|]\s*)(sudo\s+)?(apt|apt-get|yum|dnf|apk|pip|pip3|npm|gem|composer|brew)\b/,
  /\b(systemctl\s+(start|stop|restart|reload|enable|disable|daemon-reload)|service\s+\w+\s+(start|stop|restart|reload))\b/,
  /\b(ufw\s+(allow|deny|delete|enable|disable)|iptables\s+-[AID]\b|firewall-cmd\s+(--add|--remove|--permanent)|nft\s+add\b)\b/,
  /\bkill\b/, /\bkillall\b/, /\bpkill\b/, /\btee\b/, /\bdd\b/,
  /\b(shutdown|reboot|halt|poweroff)\b/, /\bcrontab\s+(-e|-r|-u\s+\w+\s+-e)\b/,
  /\b(docker|podman)\s+(rm|rmi|stop|start|restart|kill|run|build|pull|push|save|load|commit|tag|network\s+(create|rm)|volume\s+(create|rm))\b/,
  /\b(kubectl|helm)\s+(delete|apply|create|scale|rollout|drain|cordon)\b/,
  /\b(python3?|python|perl|ruby|node|php|bash|sh)\s+(-c|-e)\b/,
];

const READONLY_DOCKER = /\b(docker|podman)\s+(ps|images|df|inspect|logs|stats|top|version|info|network\s+ls|volume\s+ls|system\s+df|system\s+info)\b/;

export function isWriteCommand(command) {
  const c = String(command).trim();
  if (READONLY_DOCKER.test(c)) return false;
  if (/[^2]>\s*(?!>|&)/.test(c.replace(/2>>/g, "").replace(/2>/g, ""))) return true;
  for (const re of WRITE_CMDS) {
    if (re.test(c)) return true;
  }
  return false;
}

const DANGEROUS_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*[fr])[^;|]*\/\s*(?:--no-preserve-root)?\s*$/,
  /\bsudo\b/, /\bsu\s+-/, /\bchmod\s+-R\s+777\s+\//,
  /\bdd\s+if=.*of=\/dev\/(?:sda|sdb|nvme)/,
  /\b(?:mkfs|fdisk|parted)\b/,
  /\b>?\s*\/dev\/null\b/,
];

export function isDangerousCommand(command) {
  const c = String(command).trim();
  return DANGEROUS_PATTERNS.some((re) => re.test(c));
}

function execRestricted(command, { timeout = 30000, signal } = {}) {
  return new Promise((resolve) => {
    const wrapped = `runuser -u nobody -- sh -c ${JSON.stringify(command)}`;
    const child = exec(wrapped, { timeout, maxBuffer: MAX_OUTPUT }, (err, stdout, stderr) => {
      if (signal?.aborted) {
        resolve({ stdout: "", stderr: "命令已中止", exitCode: 1, aborted: true });
      } else {
        resolve({
          stdout: redactSecrets(truncate(stdout || "")),
          stderr: redactSecrets(truncate(stderr || "")),
          exitCode: err ? (typeof err.code === "number" ? err.code : 1) : 0,
        });
      }
    });
    if (signal) {
      signal.addEventListener("abort", () => child.kill("SIGKILL"), { once: true });
    }
  });
}

export function runCommand(command, { timeout = 30000, signal } = {}) {
  return new Promise((resolve) => {
    const child = exec(command, { timeout, maxBuffer: MAX_OUTPUT }, (err, stdout, stderr) => {
      if (signal?.aborted) {
        resolve({ stdout: "", stderr: "命令已中止", exitCode: 1, aborted: true });
      } else {
        resolve({
          stdout: redactSecrets(truncate(stdout || "")),
          stderr: redactSecrets(truncate(stderr || "")),
          exitCode: err ? (typeof err.code === "number" ? err.code : 1) : 0,
        });
      }
    });
    if (signal) {
      signal.addEventListener("abort", () => {
        child.kill("SIGKILL");
      }, { once: true });
    }
  });
}

export async function readFile(path) {
  try {
    return { content: redactSecrets(truncate(await fsReadFile(path, "utf8"))), error: null };
  } catch (e) {
    return { content: "", error: e.message };
  }
}

function canDropPrivileges() {
  return typeof process.getuid === "function" && process.getuid() === 0;
}

export async function applyFix({ command, reason = "", riskLevel = "medium", impact = "" }, onConfirm) {
  if (isDangerousCommand(command)) {
    return { confirmed: false, note: "已拦截：命令超出允许范围", blocked: true };
  }
  if (!canDropPrivileges()) {
    return { confirmed: false, note: "已拒绝：写命令需要 root 环境才能降权执行（沙箱限制）", blocked: true };
  }
  const ok = await onConfirm({ command, reason, riskLevel, impact });
  if (!ok) return { confirmed: false, note: "用户拒绝执行" };
  const r = await execRestricted(command);
  return { confirmed: true, ...r };
}