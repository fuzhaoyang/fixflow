import test from "node:test";
import assert from "node:assert/strict";
import { buildServiceUnit, install, restart } from "../src/service.js";

test("buildServiceUnit 生成合法 unit", () => {
  const unit = buildServiceUnit({ node: "/usr/bin/node", bin: "/opt/fixflow/bin/fixflow.js" });
  assert.match(unit, /ExecStart=\/usr\/bin\/node \/opt\/fixflow\/bin\/fixflow.js web/);
  assert.match(unit, /Restart=always/);
  assert.match(unit, /WantedBy=multi-user.target/);
});

test("非 root 不写入、不执行 systemctl", async () => {
  const writes = [];
  let ran = false;
  const r = await install({
    getuid: () => 1000,
    writeUnit: (p, c) => writes.push([p, c]),
    exec: () => { ran = true; return { status: 0 }; },
  });
  assert.equal(r.installed, false);
  assert.equal(writes.length, 0);
  assert.equal(ran, false);
});

test("root 写入 unit 并依次执行 systemctl 序列", async () => {
  const calls = [];
  const r = await install({
    getuid: () => 0,
    node: "/usr/bin/node",
    bin: "/opt/fixflow/bin/fixflow.js",
    writeUnit: (p) => calls.push(["write", p]),
    exec: (cmd, args) => { calls.push([cmd, args.join(" ")]); return { status: 0 }; },
  });
  assert.equal(r.installed, true);
  assert.deepEqual(calls, [
    ["write", "/etc/systemd/system/fixflow.service"],
    ["systemctl", "daemon-reload"],
    ["systemctl", "enable fixflow"],
    ["systemctl", "restart fixflow"],
  ]);
});

test("systemctl 执行失败返回未安装", async () => {
  const r = await install({ getuid: () => 0, exec: () => ({ status: 1 }) });
  assert.equal(r.installed, false);
});

test("restart：systemd 激活时走 systemctl restart", () => {
  const calls = [];
  const r = restart({
    exec: (cmd, args) => { calls.push([cmd, args.join(" ")]); return { status: 0 }; },
  });
  assert.equal(r.method, "systemd");
  assert.deepEqual(calls, [["systemctl", "is-active fixflow"], ["systemctl", "restart fixflow"]]);
});

test("restart：非 systemd 时自重启新进程", () => {
  let spawned = false;
  const r = restart({
    exec: () => { const e = new Error(); e.status = 1; throw e; },
    spawnChild: () => ({ unref() { spawned = true; } }),
    entry: "/opt/fixflow/bin/fixflow.js",
  });
  assert.equal(r.method, "respawn");
  assert.equal(spawned, true);
});