import { runCommand } from "./tools.js";

export const MANAGERS = new Set(["systemd", "pm2", "docker", "supervisor", "custom"]);
export const normalizeManager = (value) => MANAGERS.has(String(value)) ? String(value) : "systemd";
const sq = (v) => "'" + String(v ?? "").replace(/'/g, "'\\''") + "'";
const ok = (r) => r?.exitCode === 0;
const out = (r) => String(r?.stdout || "").trim();

async function pm2List(run) {
  const r = await run("pm2 jlist 2>/dev/null").catch(() => null);
  try { return JSON.parse(out(r) || "[]"); } catch { return []; }
}

export async function serviceStatus(manager, service, { run = runCommand, statusCommand = "" } = {}) {
  if (manager === "systemd") {
    const r = await run(`systemctl is-active ${sq(service)}`).catch(() => null);
    const value = out(r);
    return { up: value === "active", detail: value || "unknown" };
  }
  if (manager === "pm2") {
    const list = await pm2List(run);
    const item = list.find((x) => x?.name === service);
    const value = item?.pm2_env?.status || "not-found";
    return { up: value === "online", detail: value };
  }
  if (manager === "docker") {
    const r = await run(`docker inspect -f '{{.State.Running}}' ${sq(service)} 2>/dev/null`).catch(() => null);
    const value = out(r);
    return { up: value === "true", detail: value || "not-found" };
  }
  if (manager === "supervisor") {
    const r = await run(`supervisorctl status ${sq(service)} 2>/dev/null`).catch(() => null);
    const value = out(r);
    return { up: /\bRUNNING\b/.test(value), detail: value || "not-found" };
  }
  if (manager === "custom") {
    if (!statusCommand) return { up: false, detail: "未配置状态检查命令" };
    const r = await run(statusCommand).catch(() => null);
    return { up: ok(r), detail: r ? `exit ${r.exitCode}` : "命令失败" };
  }
  return { up: false, detail: "未知管理器" };
}

export async function detectManager(service, { run = runCommand } = {}) {
  const evidence = [];
  const sys = await run(`systemctl show ${sq(service)} -p Id,LoadState --no-pager 2>/dev/null`).catch(() => null);
  if (/^Id=\S+/m.test(out(sys)) && /^LoadState=loaded$/m.test(out(sys))) return { manager: "systemd", evidence: ["systemd unit found"] };
  evidence.push("no systemd unit");

  const pm2 = await pm2List(run);
  if (pm2.some((x) => x?.name === service)) return { manager: "pm2", evidence: [...evidence, "pm2 process found"] };
  evidence.push("no pm2 process");

  const docker = await run("docker ps -a --format '{{.Names}}' 2>/dev/null").catch(() => null);
  if (out(docker).split("\n").map((s) => s.trim()).includes(service)) return { manager: "docker", evidence: [...evidence, "docker container found"] };
  evidence.push("no docker container");

  const sup = await run(`supervisorctl status ${sq(service)} 2>/dev/null`).catch(() => null);
  if (out(sup) && !/no such process|ERROR/i.test(out(sup))) return { manager: "supervisor", evidence: [...evidence, "supervisor program found"] };
  evidence.push("no supervisor program");
  return { manager: "custom", evidence };
}

export function actionCommand(manager, action = {}) {
  if (action.type === "run_command") return action.command || null;
  if (action.type === "webhook") return null;
  const verb = action.type === "reload_service" ? "reload" : "restart";
  if (manager === "systemd") return `systemctl ${verb} ${action.service || ""}`.trim();
  if (manager === "pm2") return `pm2 ${verb} ${action.service || ""}`.trim();
  if (manager === "docker") return `docker restart ${action.service || ""}`.trim();
  if (manager === "supervisor") return `supervisorctl restart ${action.service || ""}`.trim();
  return null;
}

export function verifyFor(manager, service, statusCommand = "") {
  if (manager !== "custom" && !service) return null;
  if (manager === "systemd") return { type: "service_active", service };
  if (manager === "pm2") return { type: "pm2_online", service };
  if (manager === "docker") return { type: "docker_running", service };
  if (manager === "supervisor") return { type: "supervisor_running", service };
  if (manager === "custom" && statusCommand) return { type: "custom_active", command: statusCommand };
  return null;
}
