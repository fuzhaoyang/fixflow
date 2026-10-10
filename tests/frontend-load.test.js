import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const STATIC = join(new URL("..", import.meta.url).pathname, "src", "web", "static");

function makeEl() {
  return new Proxy({}, {
    get(t, p) {
      if (p === "style") return new Proxy({}, { get: () => () => "", set: (o, k, v) => { o[k] = v; return true; }, setProperty() {}, getPropertyValue: () => "" });
      if (p === "classList") return { add() {}, remove() {}, toggle() {}, contains: () => false };
      if (p === "dataset") return {};
      if (p === "getContext") return () => new Proxy({}, { get: (o, k) => (typeof k === "string" && k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
      if (p === "querySelector") return () => makeEl();
      if (p === "querySelectorAll") return () => [];
      if (p === "appendChild" || p === "removeChild" || p === "insertBefore" || p === "focus" || p === "click" || p === "blur" || p === "remove") return () => makeEl();
      if (p === "addEventListener" || p === "removeEventListener") return () => {};
      if (p === "setAttribute" || p === "removeAttribute") return () => undefined;
      if (p === "getAttribute") return () => null;
      if (p === "scrollTo" || p === "focus") return () => {};
      return t[p] !== undefined ? t[p] : makeEl();
    },
    set(t, p, v) { t[p] = v; return true; },
    apply() { return makeEl(); },
  });
}

test("前端 script 链在 mock DOM 下可加载执行（拆分安全网）", () => {
  const html = readFileSync(join(STATIC, "index.html"), "utf8");
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.ok(srcs.length >= 2, `应至少 2 个 script，实际 ${srcs.length}`);

  const timers = new Set();
  const document = {
    getElementById: () => makeEl(),
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
    createElement: () => makeEl(),
    addEventListener: () => {},
    body: makeEl(),
    documentElement: makeEl(),
    head: makeEl(),
  };
  const context = vm.createContext({
    console,
    setTimeout: (fn, ms) => { timers.add(fn); return { fn }; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn) => { timers.add(fn); return { fn }; },
    clearInterval: (id) => timers.delete(id),
    document,
    window: { addEventListener: () => {}, removeEventListener: () => {}, requestAnimationFrame: () => 0, cancelAnimationFrame: () => {}, matchMedia: () => ({ matches: false }) },
    location: { hash: "", href: "", replace: () => {}, reload: () => {} },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "", headers: new Map(), url: "" }),
    navigator: {},
    URL, Blob,
    FileReader: class { constructor() { this.readAsDataURL = () => {}; } },
    performance,
    MutationObserver: class { constructor() {} observe() {} disconnect() {} takeRecords() { return []; } },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
  });

  for (const src of srcs) {
    const code = readFileSync(join(STATIC, src), "utf8");
    vm.runInContext(code, context, { filename: src });
  }
  assert.ok(true);
});
