import test from "node:test";
import assert from "node:assert/strict";
import { createSession } from "../src/core.js";

function fakeLlm(plan) {
  let i = 0;
  return async () => {
    const step = plan[i++] || plan[plan.length - 1];
    return step;
  };
}

function fakeStreamLlm(plan) {
  let i = 0;
  return async function* () {
    const step = plan[i++] || plan[plan.length - 1];
    for (const delta of step.deltas || []) yield { delta };
    yield { toolCalls: step.toolCalls || [] };
  };
}

test("流式 llmChat：逐段广播 delta 事件并累积完整历史", async () => {
  const events = [];
  const s = createSession({
    config: {},
    onEvent: (e) => events.push(e),
    llmChat: fakeStreamLlm([{ deltas: ["磁盘", "占用", "正常"], toolCalls: [] }]),
  });
  const out = await s.send("检查磁盘");
  assert.equal(out, "磁盘占用正常");
  assert.equal(events.filter((e) => e.type === "delta").length, 3);
  assert.deepEqual(events.filter((e) => e.type === "delta").map((e) => e.text), ["磁盘", "占用", "正常"]);
  const assistant = s.history.filter((m) => m.role === "assistant")[0];
  assert.equal(assistant.content, "磁盘占用正常");
});

test("流式 llmChat：工具循环后收尾", async () => {
  const events = [];
  const s = createSession({
    config: {},
    onEvent: (e) => events.push(e),
    llmChat: fakeStreamLlm([
      { deltas: [], toolCalls: [{ id: "c1", name: "run_command", args: { command: "df -h" } }] },
      { deltas: ["处理完成"], toolCalls: [] },
    ]),
  });
  const out = await s.send("检查磁盘");
  assert.equal(out, "处理完成");
  assert.ok(events.some((e) => e.type === "tool"));
  assert.equal(s.history.filter((m) => m.role === "tool").length, 1);
});

test("纯文本回复直接返回", async () => {
  const s = createSession({ config: {}, llmChat: fakeLlm([{ text: "一切正常", toolCalls: [] }]) });
  assert.equal(await s.send("检查磁盘"), "一切正常");
});

test("带 tool_calls 的 assistant 消息原样回传", async () => {
  const s = createSession({
    config: {},
    llmChat: fakeLlm([
      { text: "", toolCalls: [{ id: "c1", name: "run_command", args: { command: "df -h" } }] },
      { text: "磁盘正常", toolCalls: [] },
    ]),
  });
  await s.send("检查磁盘");
  const assistant = s.history.filter((m) => m.role === "assistant")[0];
  assert.equal(assistant.tool_calls.length, 1);
  assert.equal(assistant.content, null);
  assert.equal(assistant.tool_calls[0].function.name, "run_command");
  assert.equal(JSON.parse(assistant.tool_calls[0].function.arguments).command, "df -h");
});

test("会话可被中止（abort）", async () => {
  const s = createSession({
    config: {},
    llmChat: async ({ signal }) => {
      await new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("请求已中止")), { once: true });
      });
    },
  });
  const p = s.send("慢请求");
  setTimeout(() => s.abort(), 50);
  await assert.rejects(p, /中止/);
});

test("send 带图片生成 OpenAI 视觉消息格式", async () => {
  const s = createSession({
    config: {},
    llmChat: fakeLlm([{ text: "收到图片", toolCalls: [] }]),
  });
  await s.send("看这张图", ["data:image/png;base64,AAAA"]);
  const user = s.history.find((m) => m.role === "user");
  assert.equal(typeof user.content, "object");
  assert.equal(user.content[0].type, "text");
  assert.equal(user.content[1].type, "image_url");
  assert.equal(user.content[1].image_url.url, "data:image/png;base64,AAAA");
});

test("clear_history 工具清空会话并广播 clear 事件", async () => {
  const events = [];
  const s = createSession({
    config: {},
    onEvent: (e) => events.push(e),
    llmChat: fakeLlm([
      { text: "", toolCalls: [{ id: "c1", name: "clear_history", args: {} }] },
      { text: "已清空", toolCalls: [] },
    ]),
  });
  await s.send("清除历史");
  assert.equal(s.history.filter((m) => m.role !== "system").length, 2); // user + assistant
  assert.ok(events.some((e) => e.type === "clear"));
});

test("配置热更新：修改 config 对象后 llmChat 收到新值", async () => {
  const config = { apiKey: "old", baseUrl: "https://a/v1", model: "m-old" };
  let seen = {};
  const s = createSession({
    config,
    llmChat: async (opts) => { seen = { apiKey: opts.apiKey, baseUrl: opts.baseUrl, model: opts.model }; return { text: "ok", toolCalls: [] }; },
  });
  await s.send("hi");
  config.model = "m-new";
  await s.send("hi2");
  assert.equal(seen.model, "m-new");
  assert.equal(seen.apiKey, "old");
});

test("run_command 命中写操作时需确认（非 root 环境被沙箱拒绝）", async () => {
  const confirmations = [];
  const s = createSession({
    config: {},
    onConfirm: async (cmd) => { confirmations.push(cmd); return false; },
    llmChat: fakeLlm([
      { text: "", toolCalls: [{ id: "c1", name: "run_command", args: { command: "rm -rf /tmp/x" } }] },
      { text: "已处理", toolCalls: [] },
    ]),
  });
  const out = await s.send("清理临时文件");
  assert.equal(out, "已处理");
  const toolMsg = s.history.filter((m) => m.role === "tool")[0];
  const content = JSON.parse(toolMsg.content);
  assert.equal(content.blocked, true);
  assert.equal(content.confirmed, false);
});

test("apply_fix 被拦截后继续直到有结论", async () => {
  const events = [];
  const s = createSession({
    config: {},
    onConfirm: async (cmd) => cmd.includes("allow"),
    onEvent: (e) => events.push(e),
    llmChat: fakeLlm([
      { text: "", toolCalls: [{ id: "c1", name: "apply_fix", args: { command: "rm -rf /", reason: "危险", riskLevel: "high", impact: "全部" } }] },
      { text: "", toolCalls: [{ id: "c2", name: "apply_fix", args: { command: "ufw allow 8080", reason: "放行", riskLevel: "high", impact: "防火墙" } }] },
      { text: "已处理", toolCalls: [] },
    ]),
  });
  const out = await s.send("排查防火墙");
  assert.equal(out, "已处理");
  assert.equal(s.history.filter((m) => m.role === "tool").length, 2);
  const toolMsg = s.history.filter((m) => m.role === "tool")[0];
  assert.equal(JSON.parse(toolMsg.content).blocked, true);
  const toolMsg2 = s.history.filter((m) => m.role === "tool")[1];
  assert.equal(JSON.parse(toolMsg2.content).blocked, true);
  assert.ok(events.some((e) => e.type === "tool"));
});

test("工具执行抛错时仍为所有 tool_call 写响应并继续", async () => {
  const s = createSession({
    config: {},
    onConfirm: async () => { throw new Error("用户确认被中止"); },
    llmChat: fakeLlm([
      {
        text: "", toolCalls: [
          { id: "c1", name: "apply_fix", args: { command: "rm -rf /", reason: "t", riskLevel: "high", impact: "x" } },
          { id: "c2", name: "run_command", args: { command: "echo hi" } },
        ],
      },
      { text: "处理完成", toolCalls: [] },
    ]),
  });
  const out = await s.send("测试");
  assert.equal(out, "处理完成");
  const tools = s.history.filter((m) => m.role === "tool");
  assert.equal(tools.length, 2);
  assert.deepEqual(tools.map((t) => t.tool_call_id), ["c1", "c2"]);
  assert.ok(JSON.parse(tools[0].content).blocked);
  assert.ok(!JSON.parse(tools[1].content).error);
});

test("onEvent 抛错不中断工具循环，历史仍完整", async () => {
  const s = createSession({
    config: {},
    onEvent: () => { throw new Error("SSE 客户端断开"); },
    llmChat: fakeLlm([
      {
        text: "", toolCalls: [
          { id: "c1", name: "run_command", args: { command: "echo a" } },
          { id: "c2", name: "run_command", args: { command: "echo b" } },
        ],
      },
      { text: "ok", toolCalls: [] },
    ]),
  });
  const out = await s.send("测试");
  assert.equal(out, "ok");
  assert.equal(s.history.filter((m) => m.role === "tool").length, 2);
});

test("发送前净化缺失 tool 响应的残缺 tool_calls", async () => {
  let seen = null;
  const s = createSession({
    config: {},
    llmChat: async ({ messages }) => { seen = messages; return { text: "ok", toolCalls: [] }; },
  });
  s.history.push({
    role: "assistant", content: "我先看看",
    tool_calls: [
      { id: "ghost1", type: "function", function: { name: "run_command", arguments: "{}" } },
      { id: "real1", type: "function", function: { name: "read_file", arguments: "{}" } },
    ],
  });
  s.history.push({ role: "tool", tool_call_id: "real1", content: "{}" });
  await s.send("继续");
  const broken = seen.filter((m) => m.role === "assistant" && m.tool_calls)[0];
  assert.equal(broken.tool_calls.length, 1);
  assert.equal(broken.tool_calls[0].id, "real1");
});

test("并发 send 被串行化，历史不被交错插入", async () => {
  const llmCalls = [];
  let releaseA;
  const gate = new Promise((r) => { releaseA = r; });
  const s = createSession({
    config: {},
    llmChat: async ({ messages }) => {
      llmCalls.push(messages.filter((m) => m.role === "user").map((m) => m.content));
      if (llmCalls.length === 1) await gate;
      return { text: "ok", toolCalls: [] };
    },
  });
  const pA = s.send("A");
  const pB = s.send("B");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(llmCalls.length, 1, "第二个 send 必须等第一个完成后才开始");
  releaseA();
  await Promise.all([pA, pB]);
  assert.equal(llmCalls.length, 2);
  const users = s.history.filter((m) => m.role === "user");
  assert.deepEqual(users.map((m) => m.content), ["A", "B"]);
});