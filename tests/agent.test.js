import test from "node:test";
import assert from "node:assert/strict";
import { chat } from "../src/agent.js";

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