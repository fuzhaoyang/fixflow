import test from "node:test";
import assert from "node:assert/strict";
import { makeConfirm, toolLabel, HELP_TEXT } from "../src/cli.js";

test("makeConfirm：y/Y 接受，其他拒绝", async () => {
  const confirm = makeConfirm({
    question: async () => "y",
  });
  assert.equal(await confirm("rm -rf /"), true);
  const confirm2 = makeConfirm({
    question: async () => "n",
  });
  assert.equal(await confirm2("rm -rf /"), false);
});

test("toolLabel：提取命令本体", () => {
  assert.equal(toolLabel({ name: "run_command", args: { command: "df -h" } }), "df -h");
  assert.equal(toolLabel({ name: "read_file", args: { path: "/etc/nginx/nginx.conf" } }), "cat /etc/nginx/nginx.conf");
  assert.equal(toolLabel({ name: "apply_fix", args: { command: "rm -rf /tmp/x" } }), "rm -rf /tmp/x");
  assert.equal(toolLabel({ name: "clear_history", args: {} }), "清空历史");
});

test("HELP_TEXT 覆盖命令/工具/重置/历史说明", () => {
  assert.match(HELP_TEXT, /Ctrl\+C/);
  assert.match(HELP_TEXT, /run_command/);
  assert.match(HELP_TEXT, /apply_fix/);
  assert.match(HELP_TEXT, /重置/);
  assert.match(HELP_TEXT, /config\.json/);
  assert.match(HELP_TEXT, /方向键/);
  assert.match(HELP_TEXT, /exit/);
});