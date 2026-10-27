import test from "node:test";
import assert from "node:assert/strict";
import { detectManager, serviceStatus, actionCommand, verifyFor } from "../src/process-manager.js";

const fake = (handler) => async (cmd) => handler(cmd) || { exitCode: 1, stdout: "", stderr: "" };

test("detectManager 识别 systemd / pm2 / docker / supervisor / custom", async () => {
  assert.equal((await detectManager("web", { run: fake((c) => c.includes("systemctl show") ? { exitCode: 0, stdout: "Id=web.service\nLoadState=loaded\n" } : null) })).manager, "systemd");
  assert.equal((await detectManager("chatbot-server", { run: fake((c) => c.includes("pm2 jlist") ? { exitCode: 0, stdout: JSON.stringify([{ name: "chatbot-server", pm2_env: { status: "online" } }]) } : null) })).manager, "pm2");
  assert.equal((await detectManager("chatbot-server", { run: fake((c) => c.includes("docker ps") ? { exitCode: 0, stdout: "chatbot-server\n" } : null) })).manager, "docker");
  assert.equal((await detectManager("chatbot-server", { run: fake((c) => c.includes("supervisorctl status") ? { exitCode: 0, stdout: "chatbot-server RUNNING pid 1\n" } : null) })).manager, "supervisor");
  assert.equal((await detectManager("chatbot-server", { run: fake(() => null) })).manager, "custom");
  assert.equal((await detectManager("web", { run: fake((c) => c.includes("systemctl show") ? { exitCode: 0, stdout: "Id=web.service\n" } : null) })).manager, "custom");
});

test("serviceStatus 按管理器判断运行状态", async () => {
  assert.equal((await serviceStatus("systemd", "web", { run: fake((c) => c.includes("is-active") ? { exitCode: 0, stdout: "active\n" } : null) })).up, true);
  assert.equal((await serviceStatus("pm2", "web", { run: fake((c) => c.includes("pm2 jlist") ? { exitCode: 0, stdout: JSON.stringify([{ name: "web", pm2_env: { status: "stopped" } }]) } : null) })).up, false);
  assert.equal((await serviceStatus("docker", "web", { run: fake((c) => c.includes("docker inspect") ? { exitCode: 0, stdout: "true\n" } : null) })).up, true);
  assert.equal((await serviceStatus("supervisor", "web", { run: fake((c) => c.includes("supervisorctl status") ? { exitCode: 0, stdout: "web STOPPED\n" } : null) })).up, false);
  assert.equal((await serviceStatus("custom", "web", { run: fake((c) => c === "check-web" ? { exitCode: 0, stdout: "" } : null), statusCommand: "check-web" })).up, true);
});

test("actionCommand 按管理器生成动作命令", () => {
  assert.equal(actionCommand("systemd", { type: "restart_service", service: "web" }), "systemctl restart web");
  assert.equal(actionCommand("pm2", { type: "restart_service", service: "web" }), "pm2 restart web");
  assert.equal(actionCommand("docker", { type: "restart_service", service: "web" }), "docker restart web");
  assert.equal(actionCommand("supervisor", { type: "restart_service", service: "web" }), "supervisorctl restart web");
  assert.equal(actionCommand("custom", { type: "run_command", command: "cd /srv/web && ./start.sh" }), "cd /srv/web && ./start.sh");
});

test("verifyFor 生成管理器对应的断言", () => {
  assert.deepEqual(verifyFor("systemd", "web"), { type: "service_active", service: "web" });
  assert.deepEqual(verifyFor("pm2", "web"), { type: "pm2_online", service: "web" });
  assert.deepEqual(verifyFor("docker", "web"), { type: "docker_running", service: "web" });
  assert.deepEqual(verifyFor("supervisor", "web"), { type: "supervisor_running", service: "web" });
});
