import { chat as defaultChat } from "./agent.js";
import { runCommand, readFile, applyFix, isWriteCommand } from "./tools.js";

const TOOLS = [
  { type: "function", function: { name: "run_command", description: "执行 shell 命令检查服务器状态（只读诊断用）。", parameters: { type: "object", properties: { command: { type: "string", description: "要执行的命令" } }, required: ["command"] } } },
  { type: "function", function: { name: "read_file", description: "读取服务器上的文件内容（日志、配置等）。", parameters: { type: "object", properties: { path: { type: "string", description: "文件绝对路径" } }, required: ["path"] } } },
  { type: "function", function: { name: "apply_fix", description: "执行修复操作。调用前必须向用户说明原因，此命令需用户确认后才能执行。", parameters: { type: "object", properties: { command: { type: "string", description: "修复命令" }, reason: { type: "string", description: "为什么要执行这条命令" } }, required: ["command", "reason"] } } },
  { type: "function", function: { name: "clear_history", description: "清空当前会话的聊天历史。用户要求清除/清空历史时调用。", parameters: { type: "object", properties: {}, required: [] } } },
];

const SYSTEM_PROMPT = "你是 fixflow，一名专业的服务器运维助手。检查与汇报全部使用 Markdown 格式输出：标题用 #、列表用 -、表格用 |、代码块用 ```。需要用户确认的修复动作，先说明原因再调用 apply_fix。用户要求清空/清除聊天历史时，调用 clear_history。";

const HANDLERS = {
  run_command: async ({ command }, ctx) => {
    if (isWriteCommand(command)) {
      return applyFix(command, ctx.onConfirm);
    }
    return runCommand(command, { signal: ctx.signal });
  },
  read_file: ({ path }) => readFile(path),
  apply_fix: ({ command }, ctx) => applyFix(command, ctx.onConfirm),
  clear_history: (args, ctx) => ctx.clearHistory(),
};

export function createSession({ config, onConfirm = async () => false, onEvent, llmChat = defaultChat }) {
  const history = [{ role: "system", content: SYSTEM_PROMPT }];
  const ctx = { onConfirm };
  let controller = new AbortController();
  function clearHistory() {
    history.length = 0;
    history.push({ role: "system", content: SYSTEM_PROMPT });
    onEvent?.({ type: "clear" });
    return { cleared: true };
  }
  ctx.clearHistory = clearHistory;
  async function send(input, images = []) {
    controller = new AbortController();
    ctx.signal = controller.signal;
    history.push({ role: "user", content: images.length ? [{ type: "text", text: input }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))] : input });
    for (;;) {
      const { text, toolCalls } = await llmChat({
        apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model,
        messages: history, tools: TOOLS, signal: controller.signal,
      });
      const assistantMsg = { role: "assistant", content: text || "" };
      if (toolCalls.length) {
        assistantMsg.tool_calls = toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } }));
      }
      history.push(assistantMsg);
      if (text) onEvent?.({ type: "text", text });
      if (!toolCalls.length) return text || "";
      for (const call of toolCalls) {
        const handler = HANDLERS[call.name];
        const result = handler ? await handler(call.args, ctx) : { error: `未知工具 ${call.name}` };
        onEvent?.({ type: "tool", name: call.name, args: call.args, result });
        history.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
  }
  return {
    send,
    history,
    abort: () => controller.abort(),
    clear: clearHistory,
  };
}