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
