import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeKnowledge, isOpsQuestion, kbUrl, maskToken, normalizeSources, queryKnowledge, testKnowledge, formatKbAnswer, DEFAULT_MISS_TEXT } from "../src/kb.js";
import { startWeb } from "../src/web/server.js";

const testCaptchas = {
  create: () => ({ id: "test-captcha", code: "0000" }),
  verify: (id, code) => String(code) === "0000",
};

function sse(lines) {
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    start(c) {
      for (const line of lines) c.enqueue(enc.encode(line));
      c.close();
    },
  }), { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

test("isOpsQuestion 只匹配运维/产品知识问题", () => {
  assert.equal(isOpsQuestion("帮我检查磁盘空间"), true);
  assert.equal(isOpsQuestion("智能知识库聊天机器人功能公告里提到了哪些功能？"), true);
  assert.equal(isOpsQuestion("你好"), false);
  assert.equal(isOpsQuestion("谢谢！"), false);
  assert.equal(isOpsQuestion("今天天气怎么样"), false);
});

test("normalizeKnowledge 默认值与 Token 掩码", () => {
  const kb = normalizeKnowledge({});
  assert.equal(kb.url, "");
  assert.equal(kb.timeout, 60);
  assert.equal(kb.missText, DEFAULT_MISS_TEXT);
  assert.equal(kbUrl({ url: "http://localhost:8000/api/ask/stream" }), "http://localhost:8000/api/ask/stream");
  assert.equal(normalizeKnowledge({ baseUrl: "http://localhost:8000/", entry: "/api/ask/stream" }).url, "http://localhost:8000/api/ask/stream");
  assert.equal(maskToken("abcdef123456"), "••••3456");
});

test("queryKnowledge 解析命中、未命中和来源", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return sse([
      `data: ${JSON.stringify({ type: "token", content: "磁盘已满，" })}\n\n`,
      `data: ${JSON.stringify({ type: "token", content: "请清理日志。" })}\n\n`,
      `data: ${JSON.stringify({ type: "sources", sources: [{ title: "磁盘清理手册", url: "https://kb.example/disk" }] })}\n\n`,
      `data: ${JSON.stringify({ type: "done", content: "磁盘已满，请清理日志。" })}\n\n`,
    ]);
  };
  const r = await queryKnowledge(normalizeKnowledge({ url: "http://kb/api/ask/stream", token: "t" }), "磁盘满了", { fetchImpl, sessionId: "s1" });
  assert.equal(r.hit, true);
  assert.equal(r.answer, "磁盘已满，请清理日志。");
  assert.deepEqual(r.sources, [{ title: "磁盘清理手册", url: "https://kb.example/disk" }]);
  assert.equal(calls[0].opts.headers["X-API-Key"], "t");
  assert.deepEqual(JSON.parse(calls[0].opts.body), { question: "磁盘满了", session_id: "s1" });

  const miss = await queryKnowledge(normalizeKnowledge({ url: "http://kb/api/ask/stream" }), "火星税号", {
    fetchImpl: async () => sse([`data: ${JSON.stringify({ type: "done", content: "知识库中未找到相关信息。" })}\n\n`]),
  });
  assert.equal(miss.hit, false);
  assert.equal(miss.answer, "");
  assert.equal(formatKbAnswer("答案", [{ title: "来源", url: "https://a" }], "zh"), "答案\n\n---\n**来源**\n- [来源](https://a)");
  assert.deepEqual(normalizeSources({ data: [{ name: "n", link: "https://b" }] }), [{ title: "n", url: "https://b" }]);
});

test("testKnowledge 连接成功与失败", async () => {
  const ok = await testKnowledge(normalizeKnowledge({ url: "http://kb/api/ask/stream" }), {
    fetchImpl: async () => sse([`data: ${JSON.stringify({ type: "done", content: "未找到相关信息" })}\n\n`]),
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.miss, true);
  const bad = await testKnowledge(normalizeKnowledge({ url: "http://kb/api/ask/stream" }), { fetchImpl: async () => { throw new Error("boom"); } });
  assert.equal(bad.ok, false);
});

test("/api/kb 保存、掩码与自动连通测试", async () => {
  const kbServer = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ type: "done", content: "知识库中未找到相关信息。" })}\n\n`);
      res.end();
    });
  });
  await new Promise((r) => kbServer.listen(0, "127.0.0.1", r));
  const kbBase = `http://127.0.0.1:${kbServer.address().port}`;

  const dir = mkdtempSync(join(tmpdir(), "ff-kb-"));
  const cfg = join(dir, "config.json");
  writeFileSync(cfg, "{}");
  const w = await startWeb({ port: 0, services: [], databases: [], configPath: cfg }, { captchas: testCaptchas });
  const base = `http://127.0.0.1:${w.server.address().port}`;
  await fetch(`${base}/api/register`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "Secret123!", captchaCode: "0000" }),
  });
  const login = await fetch(`${base}/api/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "Secret123!", captchaCode: "0000" }),
  });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const H = { Cookie: cookie, "Content-Type": "application/json" };

  const save = await fetch(`${base}/api/kb`, {
    method: "POST", headers: H,
    body: JSON.stringify({ enabled: true, url: kbBase + "/api/ask/stream", token: "super-secret", timeout: 10 }),
  });
  const saved = await save.json();
  assert.equal(save.status, 200);
  assert.equal(saved.ok, true);
  assert.equal(saved.test.ok, true);
  assert.equal(saved.test.miss, true);
  assert.match(saved.knowledge.token, /^••••/);
  assert.equal(JSON.parse(readFileSync(cfg, "utf8")).knowledge.token, "super-secret");

  const get = await fetch(`${base}/api/kb`, { headers: { Cookie: cookie } });
  const got = await get.json();
  assert.match(got.token, /^••••cret$/);
  assert.equal(got.enabled, true);
  assert.equal(got.url, kbBase + "/api/ask/stream");

  const saveDefault = await fetch(`${base}/api/kb`, {
    method: "POST", headers: H,
    body: JSON.stringify({ url: kbBase + "/api/ask/stream" }),
  });
  assert.equal((await saveDefault.json()).knowledge.enabled, true);

  const testRes = await fetch(`${base}/api/kb/test`, { method: "POST", headers: H, body: JSON.stringify({ url: kbBase + "/api/ask/stream" }) });
  const tested = await testRes.json();
  assert.equal(tested.ok, true);

  await w.close();
  await new Promise((r) => kbServer.close(r));
});
