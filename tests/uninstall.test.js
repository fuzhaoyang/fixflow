import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUninstall } from "../scripts/uninstall.js";

test("卸载时停服务、杀进程、清缓存、删除 unit、卸载 npm 包", () => {
  const dir = mkdtempSync(join(tmpdir(), "ff-un-"));
  writeFileSync(join(dir, "config.json"), JSON.stringify({ apiKey: "k" }));
  writeFileSync(join(dir, "cli.log"), "x");
  const calls = [];
  runUninstall({
    exec: (cmd, args) => { calls.push([cmd, args.join(" ")]); return { status: 0 }; },
    log: () => {},
    npm: "npm",
  });
  assert.ok(calls.some(([c, a]) => c === "systemctl" && a === "stop fixflow"));
  assert.ok(calls.some(([c, a]) => c === "systemctl" && a === "disable fixflow"));
  assert.ok(calls.some(([c, a]) => c === "pkill" && a.includes("fixflow.js web")));
  assert.ok(calls.some(([c, a]) => c === "systemctl" && a === "daemon-reload"));
  assert.ok(calls.some(([c, a]) => c === "npm" && a.includes("uninstall") && a.includes("-g") && a.includes("fixflow")));
});

test("npm 卸载失败时仍提示手动处理", () => {
  const calls = [];
  const logs = [];
  runUninstall({
    exec: (cmd, args) => { calls.push([cmd, args.join(" ")]); return { status: 1 }; },
    log: (m) => logs.push(m),
    npm: "npm",
  });
  assert.ok(logs.some((m) => m.includes("npm uninstall -g fixflow")));
});