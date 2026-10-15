import test from "node:test";
import assert from "node:assert/strict";
import { parseInstalledNames, parseSearch, parseVersions, resolvePkgName, detectPkgManager, installCmd, uninstallCmd, pmErrorHint, withPmLock } from "../src/pkgs.js";

test("parseInstalledNames rpm/pacman/apk 按行取包名", () => {
  assert.deepEqual([...parseInstalledNames("nginx\nredis\nlibssl", "dnf")], ["nginx", "redis", "libssl"]);
  assert.deepEqual([...parseInstalledNames("nginx\nredis", "pacman")], ["nginx", "redis"]);
  assert.deepEqual([...parseInstalledNames("nginx\nbusybox", "apk")], ["nginx", "busybox"]);
});

test("parseSearch dnf 输出", () => {
  const t = "Last metadata expiration check: 0:05:00 ago\nAvailable Packages\nnginx.x86_64 : A high performance web server\nredis.x86_64 : A persistent key-value database\n";
  assert.deepEqual(parseSearch(t, "dnf"), [
    { name: "nginx", desc: "A high performance web server" },
    { name: "redis", desc: "A persistent key-value database" },
  ]);
});

test("parseSearch pacman 输出", () => {
  const t = "extra/nginx 1.22.0-1  A high performance web server\nextra/redis 7.0.5-2 [installed]  A persistent key-value database\n";
  assert.deepEqual(parseSearch(t, "pacman"), [
    { name: "nginx", desc: "A high performance web server" },
    { name: "redis", desc: "A persistent key-value database" },
  ]);
});

test("parseSearch zypper 输出", () => {
  const t = "S | Name | Type | Summary\n--+------+------+--------\n  | nginx | package | A high performance web server\n";
  assert.deepEqual(parseSearch(t, "zypper"), [{ name: "nginx", desc: "A high performance web server" }]);
});

test("parseSearch apk 输出", () => {
  assert.deepEqual(parseSearch("nginx - A high performance web server\nredis - A persistent key-value database\n", "apk"), [
    { name: "nginx", desc: "A high performance web server" },
    { name: "redis", desc: "A persistent key-value database" },
  ]);
});

test("parseVersions dnf 输出", () => {
  const t = "Installed Packages\nnginx.x86_64 1.18.0-1.el8 @baseos\nAvailable Packages\nnginx.x86_64 1.20.0-1.el8 baseos\nnginx.x86_64 1.20.1-1.el8 baseos\n";
  const out = parseVersions(t, "dnf");
  assert.equal(out.installed, "1.18.0-1.el8");
  assert.equal(out.candidate, "1.20.0-1.el8");
  assert.equal(out.versions.length, 2);
});

test("parseVersions apk 输出", () => {
  const t = "nginx:\n  installed: 1.20.0-r0\n  available: 1.22.0-r0, 1.20.0-r0\n";
  const out = parseVersions(t, "apk");
  assert.equal(out.installed, "1.20.0-r0");
  assert.equal(out.candidate, "1.22.0-r0");
  assert.deepEqual(out.versions.map((v) => v.version), ["1.22.0-r0", "1.20.0-r0"]);
  assert.equal(out.versions[1].isInstalled, true);
});

test("parseVersions pacman / zypper 输出", () => {
  const pac = parseVersions("Repository : extra\nName : nginx\nVersion : 1.22.0-1\n", "pacman");
  assert.equal(pac.candidate, "1.22.0-1");
  const zyp = parseVersions("Information for package nginx:\nVersion : 1.20.1-1.1\nInstalled : Yes\n", "zypper");
  assert.equal(zyp.candidate, "1.20.1-1.1");
  assert.equal(zyp.installed, "1.20.1-1.1");
});

test("resolvePkgName 按系映射精选清单", () => {
  assert.equal(resolvePkgName("apt", "docker.io"), "docker.io");
  assert.equal(resolvePkgName("dnf", "docker.io"), "docker");
  assert.equal(resolvePkgName("apk", "redis-server"), "redis");
  assert.equal(resolvePkgName("pacman", "postgresql"), "postgresql");
  assert.equal(resolvePkgName("dnf", "nginx"), "nginx");
});

test("detectPkgManager 按命令优先级识别", async () => {
  const runDnf = async (cmd) => (cmd.includes("command -v") ? { exitCode: 0, stdout: "/usr/bin/dnf\n/usr/bin/yum\n", stderr: "" } : { exitCode: 0, stdout: "", stderr: "" });
  assert.deepEqual(await detectPkgManager({ run: runDnf }), { family: "dnf", name: "dnf" });
  const runNone = async () => ({ exitCode: 0, stdout: "", stderr: "" });
  assert.deepEqual(await detectPkgManager({ run: runNone }), { family: "none", name: "" });
});

test("installCmd / uninstallCmd 各系命令", () => {
  assert.equal(installCmd("apt", "nginx", "1.2.3"), "DEBIAN_FRONTEND=noninteractive apt-get -o APT::Status-Fd=1 install -y nginx=1.2.3");
  assert.equal(installCmd("dnf", "nginx"), "dnf install -y nginx");
  assert.equal(installCmd("apk", "nginx", "1.2.3-r0"), "apk add nginx=1.2.3-r0");
  assert.equal(installCmd("pacman", "nginx"), "pacman -S --noconfirm nginx");
  assert.equal(uninstallCmd("apt", "nginx"), "DEBIAN_FRONTEND=noninteractive apt-get purge -y nginx");
  assert.equal(uninstallCmd("zypper", "nginx"), "zypper --non-interactive remove nginx");
  assert.equal(installCmd("none", "nginx"), null);
});

test("pmErrorHint 识别 rpmdb 损坏与锁占用", () => {
  assert.match(pmErrorHint("error: rpmdb: BDB0113 Thread/process failed"), /rpm --rebuilddb/);
  assert.match(pmErrorHint("cannot open Packages database in /var/lib/rpm"), /rpm --rebuilddb/);
  assert.match(pmErrorHint("E: Could not get lock /var/lib/dpkg/lock-frontend"), /占用/);
  assert.equal(pmErrorHint("Installed Packages\nnginx ..."), null);
});

test("withPmLock 串行执行（防并发访问 rpmdb）", async () => {
  const order = [];
  await Promise.all([
    withPmLock(async () => { order.push(1); await new Promise((r) => setTimeout(r, 20)); order.push(2); }),
    withPmLock(async () => { order.push(3); }),
  ]);
  assert.deepEqual(order, [1, 2, 3]);
});
