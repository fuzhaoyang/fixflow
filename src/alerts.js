import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createSession } from "./core.js";
import { sendEmail } from "./ssl.js";
import { runCommand } from "./tools.js";
import { formatDateTime } from "./metrics.js";
import { dayKey } from "./usage.js";
import { pad2 } from "./util.js";
import { readJsonFile } from "./config.js";

export async function createAlertsManager({ config, configPath, exec = runCommand, sessionFactory, now = () => new Date() } = {}) {
  const historyPath = join(dirname(configPath), "alert-history.json");
  const readCfg = () => readJsonFile(configPath);
  const writeCfg = async (patch) => {
    const existing = await readCfg();
    await writeFile(configPath, JSON.stringify({ ...existing, ...patch }, null, 2));
  };
  let history = {};
  try { history = JSON.parse(await readFile(historyPath, "utf8")); } catch {}
  const persistHistory = async () => {
    await mkdir(dirname(historyPath), { recursive: true });
    await writeFile(historyPath, JSON.stringify(history, null, 2)).catch(() => {});
  };
  const ranToday = new Set();
  const makeSession = sessionFactory || ((cfg) => createSession({ config: cfg, onConfirm: async () => false, onEvent: () => {}, onUsage: () => {} }));

  const list = async () => (await readCfg()).alerts || [];
  const save = async (alerts) => { await writeCfg({ alerts }); };
  const smtp = async () => (await readCfg()).alertSmtp || {};
  const saveSmtp = async (s) => {
    const cur = await smtp();
    await writeCfg({ alertSmtp: {
      host: s.host ?? cur.host ?? "", port: s.port ?? cur.port ?? "", user: s.user ?? cur.user ?? "",
      pass: s.pass ? s.pass : (cur.pass || ""), from: s.from ?? cur.from ?? "",
    } });
  };
  const historyFor = async (id) => history[id] || [];
  const addHistory = async (id, entry) => {
    const arr = (history[id] = history[id] || []);
    arr.unshift(entry);
    if (arr.length > 20) arr.length = 20;
    await persistHistory();
  };

  const run = async (alert) => {
    const entry = { at: formatDateTime(now()), ok: false, subject: alert.name, summary: "", error: "" };
    try {
      if (!alert.recipients?.length) throw new Error("未配置收件人");
      const session = makeSession(config);
      const report = await session.send(alert.instruction, []);
      entry.summary = String(report || "").slice(0, 500);
      const st = await smtp();
      const haveHost = Boolean(st.host);
      const sent = await sendEmail({ ...st, to: alert.recipients.join(",") }, alert.name, String(report || ""), exec);
      if (!sent) {
        throw new Error(haveHost
          ? "邮件发送失败：SMTP 连接/认证异常，请检查 host/port/user/pass（pass 为授权码）"
          : "邮件发送失败：未配置 SMTP（请到告警弹窗上方「邮箱配置」填写 host/port/user/pass/from）");
      }
      entry.ok = true;
    } catch (e) {
      entry.error = String(e?.message || e).slice(0, 500);
    }
    await addHistory(alert.id, entry);
    return entry;
  };

  const runNow = async (id) => {
    const alerts = await list();
    const a = alerts.find((x) => x.id === id);
    if (!a) return { ok: false, error: "告警不存在" };
    return run(a);
  };

  const tick = async () => {
    const alerts = await list();
    const n = now();
    const hm = `${pad2(n.getHours())}:${pad2(n.getMinutes())}`;
    const key = dayKey(n);
    for (const a of alerts) {
      if (!a.enabled || hm < (a.time || "")) continue;
      const k = `${a.id}:${key}`;
      if (ranToday.has(k)) continue;
      ranToday.add(k);
      await run(a).catch(() => {});
    }
  };

  return { list, save, smtp, saveSmtp, history: historyFor, runNow, tick };
}