import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { sendEmail, buildMime } from "../src/ssl.js";

function startFakeSmtp() {
  const commands = [];
  const server = net.createServer((sock) => {
    let buf = "";
    let auth = 0;
    let inData = false;
    sock.write("220 fake ESMTP\r\n");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let i;
      while ((i = buf.indexOf("\r\n")) !== -1) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        commands.push(line);
        if (inData) {
          if (line === ".") { inData = false; sock.write("250 ok\r\n"); }
          continue;
        }
        const U = line.toUpperCase();
        if (/^(EHLO|HELO)/.test(U)) sock.write("250-fake\r\n250 SIZE 1048576\r\n");
        else if (U.startsWith("AUTH LOGIN")) sock.write("334 VXNlcm5hbWU6\r\n");
        else if (U.startsWith("MAIL FROM")) sock.write("250 ok\r\n");
        else if (U.startsWith("RCPT TO")) sock.write("250 ok\r\n");
        else if (U.startsWith("DATA")) { inData = true; sock.write("354 go\r\n"); }
        else if (U.startsWith("QUIT")) sock.write("221 bye\r\n");
        else if (auth === 0 && /^[A-Za-z0-9+/=]+={0,2}$/.test(line)) { auth = 1; sock.write("334 UGFzc3dvcmQ6\r\n"); }
        else if (auth === 1 && /^[A-Za-z0-9+/=]+={0,2}$/.test(line)) { auth = 2; sock.write("235 ok\r\n"); }
        else sock.write("250 ok\r\n");
      }
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ port: server.address().port, commands, server })));
}

test("sendEmail 通过 SMTP AUTH LOGIN 直连发送", async () => {
  const { port, commands, server } = await startFakeSmtp();
  try {
    const ok = await sendEmail({ host: "127.0.0.1", port, user: "u", pass: "p", from: "a@x.com", to: "b@x.com" }, "日报", "系统一切正常");
    assert.equal(ok, true);
    assert.ok(commands.some((c) => c.startsWith("AUTH LOGIN")));
    assert.ok(commands.some((c) => c === "MAIL FROM:<a@x.com>"));
    assert.ok(commands.some((c) => c === "RCPT TO:<b@x.com>"));
    assert.ok(commands.some((c) => c.startsWith("Content-Type: multipart/alternative")));
  } finally {
    server.close();
  }
});

test("buildMime 生成 multipart/alternative 且 HTML 已渲染", () => {
  const msg = buildMime({ from: "a@x.com", to: "b@x.com", user: "u" }, "日报", "# 标题\n\n**粗体**\n\n| a | b |\n|---|---|\n| 1 | 2 |");
  assert.match(msg, /Content-Type: multipart\/alternative/);
  assert.match(msg, /text\/plain/);
  assert.match(msg, /text\/html/);
  const grab = (type) => {
    const m = msg.match(new RegExp(`Content-Type: ${type}; charset=utf-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`));
    return Buffer.from(m[1].replace(/\r\n/g, ""), "base64").toString("utf8");
  };
  const html = grab("text/html");
  assert.match(html, /<h1/);
  assert.match(html, /<strong>粗体<\/strong>/);
  assert.match(html, /<table/);
  assert.ok(grab("text/plain").includes("**粗体**"));
});
test("sendEmail from 不是邮箱时回退 user", async () => {
  const { port, commands, server } = await startFakeSmtp();
  try {
    const ok = await sendEmail({ host: "127.0.0.1", port, user: "u", pass: "p", from: "80主机", to: "b@x.com" }, "主题", "正文");
    assert.equal(ok, true);
    assert.ok(commands.some((c) => c === "MAIL FROM:<u>"));
    assert.ok(commands.some((c) => c === "From: u"));
  } finally {
    server.close();
  }
});
