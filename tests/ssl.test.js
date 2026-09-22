import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCertOutput, readCertFile } from "../src/ssl.js";

const SAMPLE = `subject=CN = test.example.com
issuer=C = US, O = Let's Encrypt, CN = R3
notBefore=Sep 22 00:00:00 2026 GMT
notAfter=Dec 21 00:00:00 2026 GMT
serial=0A:1B:2C
---SIG---
    Signature Algorithm: sha256WithRSAEncryption
X509v3 Subject Alternative Name: 
    DNS:test.example.com, DNS:www.test.example.com`;

test("parseCertOutput 解析各字段", () => {
  const c = parseCertOutput(SAMPLE);
  assert.equal(c.cn, "test.example.com");
  assert.match(c.issuer, /Let's Encrypt/);
  assert.equal(c.notAfter, "Dec 21 00:00:00 2026 GMT");
  assert.equal(c.serial, "0A:1B:2C");
  assert.equal(c.sigAlgo, "sha256WithRSAEncryption");
  assert.deepEqual(c.san, ["test.example.com", "www.test.example.com"]);
  assert.equal(typeof c.daysLeft, "number");
});

test("parseCertOutput 无 SAN 时不报错", () => {
  const c = parseCertOutput("subject=CN = a.com\nnotAfter=Dec 21 00:00:00 2026 GMT");
  assert.equal(c.cn, "a.com");
  assert.deepEqual(c.san, []);
});

function genCert() {
  const dir = mkdtempSync(join(tmpdir(), "ff-ssl-"));
  const cert = join(dir, "cert.pem");
  const key = join(dir, "key.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", key, "-out", cert,
    "-days", "30", "-nodes", "-subj", "/CN=test.example.com",
    "-addext", "subjectAltName=DNS:test.example.com,DNS:www.test.example.com"], { stdio: "ignore" });
  return cert;
}

test("readCertFile 读取真实证书", async () => {
  const cert = genCert();
  assert.ok(existsSync(cert));
  const c = await readCertFile(cert);
  assert.equal(c.cn, "test.example.com");
  assert.ok(c.san.includes("www.test.example.com"));
  assert.ok(c.daysLeft >= 28 && c.daysLeft <= 30);
});

test("readCertFile 文件不存在返回 error", async () => {
  const c = await readCertFile("/no/such/cert.pem");
  assert.ok(c.error);
});

import { discoverNginxCerts, discoverCertDirs, mergeSslEntries, collectSslAll } from "../src/ssl.js";

test("discoverNginxCerts 解析证书路径并去重", async () => {
  const fake = async () => ({ stdout: "ssl_certificate /etc/nginx/ssl/a.pem;\nssl_certificate /etc/nginx/ssl/a.pem;\nssl_certificate /etc/nginx/ssl/b.pem;\n", stderr: "", exitCode: 0 });
  const paths = await discoverNginxCerts(fake);
  assert.deepEqual(paths.sort(), ["/etc/nginx/ssl/a.pem", "/etc/nginx/ssl/b.pem"]);
});

test("discoverCertDirs 返回扫描到的文件", async () => {
  const fake = async () => ({ stdout: "/etc/nginx/ssl/a.pem\n/etc/letsencrypt/live/x/fullchain.pem\n", stderr: "", exitCode: 0 });
  const paths = await discoverCertDirs(fake);
  assert.equal(paths.length, 2);
});

test("mergeSslEntries 按路径/域名去重", () => {
  const manual = [
    { id: "c1", type: "local", path: "/a.pem", enabled: true },
    { id: "c2", type: "remote", host: "a.com", port: "443", enabled: true },
  ];
  const merged = mergeSslEntries({ manual, discovered: ["/a.pem", "/b.pem"] });
  assert.equal(merged.length, 3);
  assert.ok(merged.some((e) => e.path === "/b.pem" && e.source === "discovered"));
});

test("collectSslAll 合并发现与手动并采集", async () => {
  const calls = [];
  const fake = async (cmd) => {
    calls.push(cmd);
    if (/grep -rhoE/.test(cmd)) return { stdout: "", stderr: "", exitCode: 1 };
    if (/find /.test(cmd)) return { stdout: "", stderr: "", exitCode: 0 };
    if (/openssl x509/.test(cmd)) return { stdout: "subject=CN = a.com\nnotAfter=Dec 21 00:00:00 2026 GMT\n", stderr: "", exitCode: 0 };
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  const r = await collectSslAll({ sslSites: [{ id: "c1", type: "remote", host: "a.com", port: "443", enabled: true }] }, fake);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].cn, "a.com");
});

import { detectRenewTool, renewCert } from "../src/ssl.js";

test("detectRenewTool 优先 certbot", async () => {
  const fake = async (cmd) => cmd.includes("certbot")
    ? { stdout: "/usr/bin/certbot\n", stderr: "", exitCode: 0 }
    : { stdout: "", stderr: "", exitCode: 1 };
  assert.equal((await detectRenewTool(fake)).tool, "certbot");
});

test("detectRenewTool 无工具返回 null", async () => {
  const fake = async () => ({ stdout: "", stderr: "", exitCode: 1 });
  assert.equal((await detectRenewTool(fake)).tool, null);
});

test("renewCert 无工具返回错误", async () => {
  const fake = async () => ({ stdout: "", stderr: "", exitCode: 1 });
  const r = await renewCert({ cn: "a.com" }, fake);
  assert.equal(r.ok, false);
  assert.match(r.error, /certbot/);
});

test("renewCert 用 certbot 续签并重载 nginx", async () => {
  const cmds = [];
  const fake = async (cmd) => {
    cmds.push(cmd);
    if (cmd.includes("command -v certbot")) return { stdout: "/usr/bin/certbot\n", stderr: "", exitCode: 0 };
    if (cmd.includes("certbot renew")) return { stdout: "renewed", stderr: "", exitCode: 0 };
    if (cmd.includes("systemctl reload nginx")) return { stdout: "", stderr: "", exitCode: 0 };
    return { stdout: "", stderr: "", exitCode: 1 };
  };
  const r = await renewCert({ cn: "a.com" }, fake);
  assert.equal(r.ok, true);
  assert.equal(r.tool, "certbot");
  assert.equal(r.reloaded, true);
  assert.ok(cmds.some((c) => c.includes("certbot renew --cert-name 'a.com'")));
});

import { checkSslAlerts, sendWebhook } from "../src/ssl.js";

test("checkSslAlerts 分级与去重", () => {
  const results = [
    { id: "c1", cn: "a.com", host: "a.com", notAfter: "X", daysLeft: 20 },
    { id: "c2", cn: "b.com", host: "b.com", notAfter: "Y", daysLeft: 3 },
    { id: "c3", cn: "c.com", host: "c.com", notAfter: "Z", daysLeft: 200 },
  ];
  const first = checkSslAlerts(results, { lastNotified: {} });
  assert.equal(first.alerts.length, 2);
  assert.equal(first.alerts.find((a) => a.key === "c1").level, "warn");
  assert.equal(first.alerts.find((a) => a.key === "c2").level, "critical");
  const second = checkSslAlerts(results, { lastNotified: first.lastNotified });
  assert.equal(second.alerts.length, 0);
});

test("sendWebhook 失败不抛错", async () => {
  const ok = await sendWebhook("http://127.0.0.1:1/x", { a: 1 }, async () => { throw new Error("x"); });
  assert.equal(ok, false);
});

test("collectSslAll 停用条目保留但不探测", async () => {
  let probed = false;
  const fake = async (cmd) => {
    if (/grep -rhoE/.test(cmd) || /find /.test(cmd)) return { stdout: "", stderr: "", exitCode: 0 };
    probed = true;
    return { stdout: "", stderr: "", exitCode: 0 };
  };
  const r = await collectSslAll({ sslSites: [{ id: "c1", type: "remote", host: "a.com", port: "443", enabled: false }] }, fake);
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].enabled, false);
  assert.equal(probed, false);
});
