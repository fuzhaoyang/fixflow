import test from "node:test";
import assert from "node:assert/strict";
import { buildAlertEmail } from "../src/metric-alerts.js";

const rule = { name: "CPU 高负载", metric: "cpu", op: ">=", threshold: 80, duration: 5, level: 1, recipients: ["a@x.com"], owner: "张三", runbookUrl: "https://rb" };
const inc = { id: "EVT-20260924-001", startedAt: Date.parse("2026-09-24T14:30:00Z"), peak: 98.5, recoveredAt: Date.parse("2026-09-24T14:45:00Z") };

test("触发主题格式", () => {
  const { subject } = buildAlertEmail("firing", { rule, incident: inc, value: 92.3, host: "prod-01", now: new Date("2026-09-24T14:35:00Z") });
  assert.equal(subject, "[P1-紧急] prod-01 CPU使用率告警 - 92.3%（持续5分钟）");
});

test("恢复主题与补充字段", () => {
  const { subject, html } = buildAlertEmail("recovery", { rule, incident: inc, value: 30, host: "prod-01" });
  assert.match(subject, /^\[恢复\] prod-01 CPU使用率已恢复/);
  assert.match(html, /恢复时间/);
  assert.match(html, /持续时长/);
  assert.match(html, /峰值/);
});

test("升级主题", () => {
  const { subject } = buildAlertEmail("escalation", { rule, incident: { ...inc, level: 1 }, value: 92, host: "prod-01", escalatedLevel: 1, now: new Date("2026-09-24T15:00:00Z") });
  assert.match(subject, /^\[升级-P1\] prod-01 CPU使用率告警未处理/);
});

test("正文含三层与关键字段", () => {
  const { html } = buildAlertEmail("firing", { rule, incident: inc, value: 92.3, host: "prod-01", panelBaseUrl: "https://ops.x", now: new Date("2026-09-24T14:35:00Z") });
  assert.match(html, /EVT-20260924-001/);
  assert.match(html, /张三/);
  assert.match(html, /Runbook|立即处理/);
});
test("聚合邮件主题与正文", () => {
  const events = [
    { rule: { ...rule, metric: "cpu", name: "CPU高" }, incident: { ...inc, level: 3, startedAt: Date.parse("2026-09-24T14:30:00Z") }, value: 92 },
    { rule: { ...rule, metric: "mem", name: "内存高" }, incident: { ...inc, level: 2, startedAt: Date.parse("2026-09-24T14:31:00Z") }, value: 88 },
  ];
  const { subject, html } = buildAlertEmail("aggregate", { host: "prod-01", events, rootCause: "疑似磁盘故障导致整体性能下降" });
  assert.match(subject, /^\[聚合告警\] prod-01 发生2条告警/);
  assert.match(html, /根因推测/);
  assert.match(html, /疑似磁盘故障/);
  assert.match(html, /优先级建议/);
});
