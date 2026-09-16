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