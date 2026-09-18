export async function chat({ apiKey, baseUrl, model, messages, tools, signal, timeout = 120000 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`LLM 请求超时（${timeout / 1000}s 无响应）`)), timeout);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  let res;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, tools, tool_choice: "auto" }),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (ctrl.signal.aborted && !signal?.aborted) throw new Error(`LLM 请求超时（${timeout / 1000}s 无响应）`);
    throw e;
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
  return { text: msg.content || "", toolCalls };
}

export async function* streamChat({ apiKey, baseUrl, model, messages, tools, signal, timeout = 120000 }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`LLM 请求超时（${timeout / 1000}s 无响应）`)), timeout);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  let res;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, tools, tool_choice: "auto", stream: true }),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (ctrl.signal.aborted && !signal?.aborted) throw new Error(`LLM 请求超时（${timeout / 1000}s 无响应）`);
    throw e;
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
  yield { toolCalls: toolCalls.map((tc) => ({ id: tc.id, name: tc.name, args: JSON.parse(tc.args || "{}") })) };
}