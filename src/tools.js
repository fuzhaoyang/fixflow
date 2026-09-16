import { exec } from "node:child_process";
import { readFile as fsReadFile } from "node:fs/promises";

const MAX_OUTPUT = 50 * 1024;
const truncate = (s) => (s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + "\n...[已截断]" : s);

const WRITE_CMDS = [
  /\brm\b/, /\bmv\b/, /\bcp\b/, /\bmkdir\b/, /\brmdir\b/, /\btouch\b/, /\btruncate\b/,
  /\bsed\b/, /\bawk\b/, /\bchmod\b/, /\bchown\b/, /\bchgrp\b/,
  /\b(apt|apt-get|yum|dnf|apk|pip|pip3|npm|gem|composer|brew)\b/,
  /\b(systemctl|service|journalctl --rotate)\b/,
  /\b(docker|podman|kubectl|helm)\b/,
  /\b(ufw|iptables|firewall-cmd|nft)\b/,
  /\bkill\b/, /\bkillall\b/, /\bpkill\b/, /\bpkill\b/, /\btee\b/, /\bdd\b/,
  /\b(shutdown|reboot|halt|poweroff)\b/, /\bcrontab\b/,
  /\b(python3?|python|perl|ruby|node|php|bash|sh)\s+(-c|-e)\b/,
];

export function isWriteCommand(command) {
  const c = String(command).trim();
  if (/>|>>|<\s|2>\s|&>/i.test(c)) return true;
  for (const re of WRITE_CMDS) {
    if (re.test(c)) return true;
  }
  return false;
}

export function runCommand(command, { timeout = 30000, signal } = {}) {
  return new Promise((resolve) => {
    const child = exec(command, { timeout, maxBuffer: MAX_OUTPUT }, (err, stdout, stderr) => {
      if (signal?.aborted) {
        resolve({ stdout: "", stderr: "命令已中止", exitCode: 1, aborted: true });
      } else {
        resolve({
          stdout: truncate(stdout || ""),
          stderr: truncate(stderr || ""),
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
    return { content: truncate(await fsReadFile(path, "utf8")), error: null };
  } catch (e) {
    return { content: "", error: e.message };
  }
}

export async function applyFix(command, onConfirm) {
  const ok = await onConfirm(command);
  if (!ok) return { confirmed: false, note: "用户拒绝执行" };
  const r = await runCommand(command);
  return { confirmed: true, ...r };
}