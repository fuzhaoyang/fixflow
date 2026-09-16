import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createSession } from "./core.js";

const LOG_PATH = join(homedir(), ".config", "fixflow", "cli.log");

function log(msg) {
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function createSpinner() {
  if (!stdout.isTTY) {
    return { start() {}, setText() {}, stop() {} };
  }
  let timer = null;
  let frame = 0;
  let text = "";
  const render = () => {
    stdout.write(`\r\x1b[2K${FRAMES[frame]} ${text}`);
    frame = (frame + 1) % FRAMES.length;
  };
  return {
    start(t) { text = t; render(); timer = setInterval(render, 100); },
    setText(t) { text = t; },
    stop() { if (timer) clearInterval(timer); timer = null; stdout.write("\r\x1b[2K"); },
  };
}

export function toolLabel(ev) {
  const args = ev.args || {};
  if (ev.name === "read_file") return `cat ${args.path ?? ""}`;
  if (ev.name === "clear_history") return "清空历史";
  return args.command ?? args.path ?? ev.name;
}

export function makeConfirm(rl) {
  return async (command) => {
    const answer = await rl.question(`\n[y/N] 执行: ${command}\n`);
    return /^y/i.test(answer.trim());
  };
}

export async function startFlow(config) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const spinner = createSpinner();
  const session = createSession({
    config,
    onConfirm: async (command) => {
      spinner.stop();
      log(`确认请求: ${command}`);
      const ok = await makeConfirm(rl)(command);
      log(`确认结果: ${ok ? "同意" : "拒绝"}`);
      spinner.start("继续执行…");
      return ok;
    },
    onEvent: (e) => {
      if (e.type === "tool") {
        log(`工具调用: ${toolLabel(e)}`);
        spinner.setText(`正在执行: ${toolLabel(e)}`);
      } else if (e.type === "text") spinner.setText("思考中…");
    },
  });
  console.log("fixflow 服务器运维 Agent · 输入指令开始检查，Ctrl+C 退出");
  console.log("输入 clear 清除会话历史，exit/quit 退出");
  for (;;) {
    let input;
    try {
      input = await rl.question("> ");
    } catch {
      break; // stdin 关闭/EOF
    }
    if (input.trim() === "exit" || input.trim() === "quit") break;
    if (!input.trim()) continue;
    if (/^(clear|清除历史|清空历史)\s*$/i.test(input.trim())) {
      session.clear();
      console.log("\n🧹 会话历史已清空\n");
      continue;
    }
    const start = Date.now();
    log(`用户指令: ${input}`);
    spinner.start("模型思考中…");
    try {
      const out = await session.send(input);
      spinner.stop();
      log(`完成耗时: ${((Date.now() - start) / 1000).toFixed(1)}s`);
      if (out) console.log(`\n${out}\n`);
    } catch (e) {
      spinner.stop();
      log(`执行失败(${((Date.now() - start) / 1000).toFixed(1)}s): ${e.message}`);
      console.log(`\n❌ 执行失败: ${e.message}\n`);
    }
  }
  rl.close();
}