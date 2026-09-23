import { setDefaultResultOrder } from "node:dns";

setDefaultResultOrder("ipv4first");

function cause(e) {
  const c = e?.cause;
  if (!c) return "";
  const m = c.message || c.code || String(c);
  return `（${m}）`;
}

async function fetchWithRetry(url, opts, { retries = 1, delay = 800 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, opts);
    } catch (e) {
      if (attempt >= retries || (opts.signal && opts.signal.aborted)) throw e;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export async function chat({ apiKey, baseUrl, model, messages, tools, signal, timeout = 120000 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`LLM 请求超时（${timeout / 1000}s 无响应）`)), timeout);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  let res;
  try {
    res = await fetchWithRetry(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, tools, tool_choice: "auto" }),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (ctrl.signal.aborted && !signal?.aborted) throw new Error(`LLM 请求超时（${timeout / 1000}s 无响应）`);
    throw new Error(`无法连接 LLM 服务: ${e.message}${cause(e)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (!res.ok) throw new Error(`LLM API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const msg = data.choices?.[0]?.message || {};
  const toolCalls = (msg.tool_calls || []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments || "{}"),
  }));
  return { text: msg.content || "", toolCalls, usage: data.usage ? { promptTokens: data.usage.prompt_tokens || 0, completionTokens: data.usage.completion_tokens || 0 } : undefined };
}

export async function* streamChat({ apiKey, baseUrl, model, messages, tools, signal, timeout = 120000 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`LLM 请求超时（${timeout / 1000}s 无响应）`)), timeout);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  let res;
  try {
    res = await fetchWithRetry(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, tools, tool_choice: "auto", stream: true }),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (ctrl.signal.aborted && !signal?.aborted) throw new Error(`LLM 请求超时（${timeout / 1000}s 无响应）`);
    throw new Error(`无法连接 LLM 服务: ${e.message}${cause(e)}`);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
  if (!res.ok) throw new Error(`LLM API ${res.status}: ${await res.text()}`);
  if (!res.body) throw new Error("LLM 响应无 body，无法流式读取");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const toolCalls = [];
  let usage;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const payload = t.slice(5).trim();
      if (payload === "[DONE]") continue;
      let json;
      try { json = JSON.parse(payload); } catch { continue; }
      if (json.usage) usage = json.usage;
      const delta = json.choices?.[0]?.delta || {};
      if (delta.content) yield { delta: delta.content };
      for (const tc of delta.tool_calls || []) {
        const slot = toolCalls[tc.index] || (toolCalls[tc.index] = { id: "", name: "", args: "" });
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.name = tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
      }
    }
  }
  yield { toolCalls: toolCalls.map((tc) => ({ id: tc.id, name: tc.name, args: JSON.parse(tc.args || "{}") })), usage: usage ? { promptTokens: usage.prompt_tokens || 0, completionTokens: usage.completion_tokens || 0 } : undefined };
}