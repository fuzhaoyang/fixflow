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

export const HELP_TEXT = `=== Fixflow 帮助 ===

【怎么用】直接输入运维指令，例如：
   - 检查磁盘空间并汇报
   - 防火墙开了哪些端口
   - 帮我清理 /var/log 下 30 天前的日志

【内置命令】
   help / ?          显示本帮助
   clear / 清空历史  清空当前会话对话
   exit / quit       退出会话
   Ctrl+C（任务运行中） 中止当前任务（同时中断模型请求），回到提示符
   Ctrl+C（空闲时）     退出会话
   ↑ / ↓             切换历史输入过的命令

【工具说明（模型自动调用，无需手写）】
   run_command    执行命令检查/操作，删除/修改/安装类命令需先确认
   read_file      读取文件（日志、配置等）
   apply_fix      执行修复命令，执行前必须确认
   clear_history  按你的要求清空会话历史

【退出 / 终止 / 回退】
   - 终止当前任务：任务运行中按 Ctrl+C
   - 退出会话：exit / quit，或空闲时按 Ctrl+C
   - 已执行的修改无法自动撤销，但所有写操作执行前都会先经你确认

【重置模型 / 服务商 / Key】
   - 推荐：删除配置后重新进入配置向导
       rm -rf ~/.config/fixflow && fixflow
   - 或直接编辑 ~/.config/fixflow/config.json（baseUrl / model / apiKey）
   - 网页面板：左下角“设置”修改，保存即生效

【查看历史命令】
   - 当前会话：↑ / ↓ 方向键回看
   - Web 面板：历史自动保存于 ~/.config/fixflow/history.json，刷新自动恢复`;

export function makeConfirm(rl) {
  return async (command) => {
    const answer = await rl.question(`\n[y/N] 执行: ${command}\n`);
    return /^y/i.test(answer.trim());
  };
}

export async function startFlow(config) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const spinner = createSpinner();
  let busy = false;
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
      else if (e.type === "delta") spinner.setText("正在输出回复…");
    },
  });
  rl.on("SIGINT", () => {
    if (busy) {
      console.log("\n⏹ 正在中止当前任务（同时中断模型请求）…");
      session.abort();
    } else {
      console.log("\n再见！");
      process.exit(0);
    }
  });
  console.log("fixflow 服务器运维 Agent · Ctrl+C 中止任务/退出，↑↓ 切换历史命令");
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
    if (/^(help|帮助|\?)\s*$/i.test(input.trim())) {
      console.log(`\n${HELP_TEXT}\n`);
      continue;
    }
    if (/^(clear|清除历史|清空历史)\s*$/i.test(input.trim())) {
      session.clear();
      console.log("\n🧹 会话历史已清空\n");
      continue;
    }
    const start = Date.now();
    log(`用户指令: ${input}`);
    spinner.start("模型思考中…");
    busy = true;
    try {
      const out = await session.send(input);
      spinner.stop();
      log(`完成耗时: ${((Date.now() - start) / 1000).toFixed(1)}s`);
      if (out) console.log(`\n${out}\n`);
    } catch (e) {
      spinner.stop();
      log(`执行失败(${((Date.now() - start) / 1000).toFixed(1)}s): ${e.message}`);
      if (e.name === "AbortError") console.log("\n⏹ 已中止当前任务\n");
      else console.log(`\n❌ 执行失败: ${e.message}\n`);
    } finally {
      busy = false;
    }
  }
  rl.close();
}