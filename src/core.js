import { chat as defaultChat, streamChat } from "./agent.js";
import { runCommand, readFile, applyFix, isWriteCommand } from "./tools.js";

const TOOLS = [
  { type: "function", function: { name: "run_command", description: "执行 shell 命令检查服务器状态（只读诊断用）。", parameters: { type: "object", properties: { command: { type: "string", description: "要执行的命令" } }, required: ["command"] } } },
  { type: "function", function: { name: "read_file", description: "读取服务器上的文件内容（日志、配置等）。", parameters: { type: "object", properties: { path: { type: "string", description: "文件绝对路径" } }, required: ["path"] } } },
  { type: "function", function: { name: "apply_fix", description: "执行修复操作。调用前必须向用户说明原因，此命令需用户确认后才能执行。必须提供风险等级和影响范围。", parameters: { type: "object", properties: { command: { type: "string", description: "修复命令" }, reason: { type: "string", description: "为什么要执行这条命令" }, riskLevel: { type: "string", enum: ["low", "medium", "high"], description: "风险等级" }, impact: { type: "string", description: "预期影响范围/爆炸半径" } }, required: ["command", "reason", "riskLevel", "impact"] } } },
  { type: "function", function: { name: "clear_history", description: "清空当前会话的聊天历史。用户要求清除/清空历史时调用。", parameters: { type: "object", properties: {}, required: [] } } },
];

const SYSTEM_PROMPT = `你是 fixflow，一名专业的服务器运维助手。

【职责边界】你只提供排障建议、配置草案、脚本建议和变更预检。不要编造服务器状态或日志内容，信息不足时先向用户提出澄清问题。

【安全红线】
- 不得直接修改生产系统（所有改动都必须先给方案，经用户确认后再通过工具执行）
- 不得输出密码、私钥、Token、API Key 或其他敏感凭证（工具返回中已自动脱敏，你也不要推测或拼写）
- 遇到重启服务、修改防火墙、修改 Nginx、更新 SSL 证书、删除数据、修改生产配置等高风险操作，必须先输出变更计划和风险说明，并明确标记【需人工审批】；用户批准后才可执行。

【输出格式】检查与汇报全部使用 Markdown：标题用 #、列表用 -、表格用 |、代码块用 \`\`\`。需要用户确认的修复动作，先说明原因再调用 apply_fix。用户要求清空/清除聊天历史时，调用 clear_history。`;

const LANG_HINT = {
  zh: "【语言要求】默认用简体中文回答，除非用户明确要求使用其他语言。",
  en: "[Language] Respond in English by default, unless the user explicitly asks for another language.",
};

function buildSystemPrompt(lang) {
  return `${SYSTEM_PROMPT}\n\n${LANG_HINT[lang] || LANG_HINT.zh}`;
}

const HANDLERS = {
  run_command: async ({ command }, ctx) => {
    if (isWriteCommand(command)) {
      return applyFix({ command, riskLevel: "medium" }, ctx.onConfirm);
    }
    return runCommand(command, { signal: ctx.signal });
  },
  read_file: ({ path }) => readFile(path),
  apply_fix: (args, ctx) => applyFix(args, ctx.onConfirm),
  clear_history: (args, ctx) => ctx.clearHistory(),
};

function sanitizeHistory(history) {
  const responded = new Set();
  for (const m of history) {
    if (m.role === "tool") responded.add(m.tool_call_id);
  }
  const out = [];
  for (const m of history) {
    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length) {
      const kept = m.tool_calls.filter((tc) => responded.has(tc.id));
      if (!kept.length) {
        if (m.content) out.push({ role: "assistant", content: m.content });
        continue;
      }
      out.push({ ...m, content: m.content || "", tool_calls: kept });
      continue;
    }
    out.push(m);
  }
  return out;
}

export function createSession({ config, onConfirm = async () => false, onEvent, onUsage = () => {}, llmChat = streamChat }) {
  const history = [{ role: "system", content: buildSystemPrompt(config.lang) }];
  const ctx = { onConfirm };
  let controller = new AbortController();
  const safeEvent = (e) => { try { onEvent?.(e); } catch {} };
  function clearHistory() {
    history.length = 0;
    history.push({ role: "system", content: buildSystemPrompt(config.lang) });
    safeEvent({ type: "clear" });
    return { cleared: true };
  }
  ctx.clearHistory = clearHistory;
  async function doSend(input, images = []) {
    controller = new AbortController();
    ctx.signal = controller.signal;
    history[0] = { role: "system", content: buildSystemPrompt(config.lang) };
    history.push({ role: "user", content: images.length ? [{ type: "text", text: input }, ...images.map((url) => ({ type: "image_url", image_url: { url } }))] : input });
    for (;;) {
      let text = "";
      let toolCalls = [];
      const result = await llmChat({
        apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model,
        messages: sanitizeHistory(history), tools: TOOLS, signal: controller.signal,
      });
      if (result && typeof result[Symbol.asyncIterator] === "function") {
        let usage;
        for await (const chunk of result) {
          if (chunk.delta) { text += chunk.delta; safeEvent({ type: "delta", text: chunk.delta }); }
          if (Array.isArray(chunk.toolCalls)) toolCalls = chunk.toolCalls;
          if (chunk.usage) usage = chunk.usage;
        }
        if (usage) onUsage(usage);
      } else {
        text = result?.text || "";
        toolCalls = result?.toolCalls || [];
        if (text) safeEvent({ type: "text", text });
        if (result?.usage) onUsage(result.usage);
      }
      const assistantMsg = { role: "assistant", content: text || (toolCalls.length ? "" : null) };
      if (toolCalls.length) {
        assistantMsg.tool_calls = toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } }));
      }
      if (text || toolCalls.length) history.push(assistantMsg);
      if (!toolCalls.length) return text || "";
      for (const call of toolCalls) {
        let result;
        try {
          if (ctx.signal?.aborted) {
            result = { aborted: true };
          } else {
            const handler = HANDLERS[call.name];
            result = handler ? await handler(call.args, ctx) : { error: `未知工具 ${call.name}` };
          }
        } catch (e) {
          result = { error: String(e?.message || e) };
        }
        history.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        safeEvent({ type: "tool", name: call.name, args: call.args, result });
      }
    }
  }
  let sendChain = Promise.resolve();
  function send(input, images = []) {
    const task = sendChain.then(() => doSend(input, images));
    sendChain = task.catch(() => {});
    return task;
  }
  return {
    send,
    history,
    abort: () => controller.abort(),
    clear: clearHistory,
  };
}