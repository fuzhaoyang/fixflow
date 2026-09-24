import test from "node:test";
import assert from "node:assert/strict";
import { mdToHtml } from "../src/markdown.js";

test("标题/加粗/斜体", () => {
  const h = mdToHtml("# 标题\n\n**粗** 和 *斜*");
  assert.match(h, /<h1[^>]*>标题<\/h1>/);
  assert.match(h, /<strong>粗<\/strong>/);
  assert.match(h, /<em>斜<\/em>/);
});

test("列表", () => {
  const h = mdToHtml("- a\n- b\n\n1. x\n2. y");
  assert.match(h, /<ul[^>]*>[\s\S]*<li[^>]*>a<\/li>[\s\S]*<li[^>]*>b<\/li>[\s\S]*<\/ul>/);
  assert.match(h, /<ol[^>]*>[\s\S]*<li[^>]*>x<\/li>[\s\S]*<li[^>]*>y<\/li>[\s\S]*<\/ol>/);
});

test("表格", () => {
  const h = mdToHtml("| A | B |\n|---|---|\n| 1 | 2 |");
  assert.match(h, /<table[^>]*>/);
  assert.match(h, /<th[^>]*>A<\/th>/);
  assert.match(h, /<td[^>]*>1<\/td>/);
});

test("引用与分割线", () => {
  const h = mdToHtml("> 注意\n\n---");
  assert.match(h, /<blockquote[^>]*>[\s\S]*注意[\s\S]*<\/blockquote>/);
  assert.match(h, /<hr/);
});

test("围栏代码块内部不解析且转义", () => {
  const h = mdToHtml("```\n**x** <b>\n```");
  assert.match(h, /<pre/);
  assert.ok(h.includes("**x**"));
  assert.ok(h.includes("&lt;b&gt;"));
  assert.ok(!h.includes("<strong>"));
});

test("行内代码", () => {
  assert.match(mdToHtml("运行 `ls -l`"), /<code[^>]*>ls -l<\/code>/);
});

test("链接协议白名单", () => {
  assert.match(mdToHtml("[官网](https://x.com)"), /href="https:\/\/x\.com"/);
  assert.ok(!/javascript:/.test(mdToHtml("[x](javascript:alert(1))")));
});

test("HTML 转义防注入", () => {
  const h = mdToHtml("<script>alert(1)</script>");
  assert.ok(!h.includes("<script>"));
  assert.ok(h.includes("&lt;script&gt;"));
});