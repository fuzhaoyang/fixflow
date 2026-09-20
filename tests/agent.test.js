import test from "node:test";
import assert from "node:assert/strict";
import { chat, streamChat } from "../src/agent.js";

test("解析 tool_calls 与纯文本回复", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    assert.match(url, /\/chat\/completions$/);
    assert.equal(opts.headers.Authorization, "Bearer k1");
    const body = JSON.parse(opts.body);
    assert.equal(body.model, "m1");
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: {
          content: "",
          tool_calls: [{ id: "c1", type: "function", function: { name: "run_command", arguments: '{"command":"df -h"}' } }],
        } }],
      }),
    };
  };
  const r1 = await chat({ apiKey: "k1", baseUrl: "https://x/v1", model: "m1", messages: [], tools: [] });
  assert.equal(r1.toolCalls.length, 1);
  assert.deepEqual(r1.toolCalls[0], { id: "c1", name: "run_command", args: { command: "df -h" } });

  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "一切正常", tool_calls: undefined } }] }) });
  const r2 = await chat({ apiKey: "k1", baseUrl: "https://api/v1", model: "m1", messages: [], tools: [] });
  assert.equal(r2.text, "一切正常");
  assert.deepEqual(r2.toolCalls, []);
  globalThis.fetch = orig;
});

test("API 错误抛异常", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => "unauthorized" });
  await assert.rejects(() => chat({ apiKey: "", baseUrl: "x", model: "m", messages: [], tools: [] }));
  globalThis.fetch = orig;
});

test("网络失败自动重试一次，仍失败则暴露底层原因", async () => {
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, opts) => {
    calls++;
    if (calls < 2) { const e = new Error("fetch failed"); e.cause = { code: "ECONNRESET" }; throw e; }
    return { ok: true, json: async () => ({ choices: [{ message: { content: "ok", tool_calls: undefined } }] }) };
  };
  const r = await chat({ apiKey: "k", baseUrl: "https://x/v1", model: "m", messages: [], tools: [] });
  assert.equal(calls, 2);
  assert.equal(r.text, "ok");
  globalThis.fetch = orig;
});

test("重试耗尽后抛出带底层原因的错误", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => { const e = new Error("fetch failed"); e.cause = { code: "ECONNREFUSED" }; throw e; };
  await assert.rejects(
    () => chat({ apiKey: "k", baseUrl: "https://x/v1", model: "m", messages: [], tools: [] }),
    /ECONNREFUSED/,
  );
  globalThis.fetch = orig;
});

test("streamChat 流式解析内容增量与 tool_calls", async () => {
  const orig = globalThis.fetch;
  const enc = new TextEncoder();
  globalThis.fetch = async (url, opts) => {
    assert.equal(JSON.parse(opts.body).stream, true);
    return {
      ok: true,
      body: new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"你好，"}}]}\n\n'));
          ctrl.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"运维助手"}}]}\n\n'));
          ctrl.enqueue(enc.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"run_command","arguments":"{\\"command\\":\\"df -h\\"}"}}]}}]}\n\n'));
          ctrl.enqueue(enc.encode("data: [DONE]\n\n"));
          ctrl.close();
        },
      }),
    };
  };
  const deltas = [];
  let toolCalls = null;
  for await (const chunk of streamChat({ apiKey: "k1", baseUrl: "https://x/v1", model: "m1", messages: [], tools: [] })) {
    if (chunk.delta) deltas.push(chunk.delta);
    if (Array.isArray(chunk.toolCalls)) toolCalls = chunk.toolCalls;
  }
  assert.deepEqual(deltas, ["你好，", "运维助手"]);
  assert.deepEqual(toolCalls, [{ id: "c1", name: "run_command", args: { command: "df -h" } }]);
  globalThis.fetch = orig;
});

test("streamChat 分片数据跨块拼接", async () => {
  const orig = globalThis.fetch;
  const enc = new TextEncoder();
  const body = 'data: {"choices":[{"delta":{"content":"分段"}}]}\n\ndata: [DONE]\n\n';
  const mid = Math.floor(body.length / 2);
  globalThis.fetch = async () => ({
    ok: true,
    body: new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(enc.encode(body.slice(0, mid)));
        ctrl.enqueue(enc.encode(body.slice(mid)));
        ctrl.close();
      },
    }),
  });
  const deltas = [];
  for await (const chunk of streamChat({ apiKey: "k", baseUrl: "https://x/v1", model: "m", messages: [], tools: [] })) {
    if (chunk.delta) deltas.push(chunk.delta);
  }
  assert.deepEqual(deltas, ["分段"]);
  globalThis.fetch = orig;
});

test("请求超时抛异常而不挂起", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (url, opts) => new Promise((resolve, reject) => {
    opts.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });
  const t = Date.now();
  await assert.rejects(() => chat({ apiKey: "k", baseUrl: "https://x/v1", model: "m", messages: [], tools: [], timeout: 300 }), /超时/);
  assert.ok(Date.now() - t < 3000);
  globalThis.fetch = orig;
});