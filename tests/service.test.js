import test from "node:test";
import assert from "node:assert/strict";
import { buildServiceUnit, install, restart, restartIfActive } from "../src/service.js";

test("buildServiceUnit 生成合法 unit", () => {
  const unit = buildServiceUnit({ node: "/usr/bin/node", bin: "/opt/fixflow/bin/fixflow.js", home: "/root" });
  assert.match(unit, /ExecStart=\/usr\/bin\/node \/opt\/fixflow\/bin\/fixflow.js web/);
  assert.match(unit, /Environment=HOME=\/root/);
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
    ["pkill", "-9 -f bin/fixflow.js web"],
    ["sleep", "0.5"],
    ["systemctl", "daemon-reload"],
    ["systemctl", "enable fixflow"],
    ["systemctl", "restart fixflow"],
  ]);
});

test("systemctl 执行失败时后台拉起面板进程保证服务可用", async () => {
  let child = null;
  const r = await install({
    getuid: () => 0,
    node: "/usr/bin/node",
    bin: "/opt/fixflow/bin/fixflow.js",
    writeUnit: () => {},
    exec: () => ({ status: 1 }),
    spawnChild: (node, args, opts) => { child = { node, args, opts }; return { unref() { child.unrefCalled = true; } }; },
  });
  assert.equal(r.installed, false);
  assert.equal(child.node, "/usr/bin/node");
  assert.deepEqual(child.args, ["/opt/fixflow/bin/fixflow.js", "web"]);
  assert.equal(child.opts.detached, true);
  assert.equal(child.unrefCalled, true);
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
    isService: true,
  });
  assert.equal(r.method, "respawn");
  assert.equal(spawned, true);
});

test("restart：CLI 调用时先杀旧服务进程再拉起", () => {
  const calls = [];
  let spawned = false;
  const r = restart({
    exec: (cmd, args) => {
      calls.push([cmd, args.join(" ")]);
      if (cmd === "systemctl" && args[0] === "is-active") return { status: 1 };
      return { status: 0 };
    },
    spawnChild: () => ({ unref() { spawned = true; } }),
    entry: "/opt/fixflow/bin/fixflow.js",
    isService: false,
  });
  assert.equal(r.method, "respawn");
  assert.equal(spawned, true);
  assert.ok(calls.some(([c, a]) => c === "pkill" && a.includes("fixflow.js web")));
  assert.ok(calls.some(([c]) => c === "sleep"));
});

test("restartIfActive：服务激活时 systemctl restart", () => {
  const calls = [];
  const r = restartIfActive({
    exec: (cmd, args) => { calls.push([cmd, args.join(" ")]); return { status: 0 }; },
  });
  assert.equal(r.active, true);
  assert.deepEqual(calls, [
    ["systemctl", "is-active fixflow"],
    ["pkill", "-9 -f bin/fixflow.js web"],
    ["sleep", "0.5"],
    ["systemctl", "restart fixflow"],
  ]);
});

test("restartIfActive：未激活时不重启", () => {
  let restarted = false;
  const r = restartIfActive({
    exec: (cmd, args) => {
      if (cmd === "systemctl" && args[0] === "is-active") return { status: 1 };
      restarted = true;
      return { status: 0 };
    },
  });
  assert.equal(r.active, false);
  assert.equal(restarted, false);
});