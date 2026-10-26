import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

const MAX = 500;
const DEDUP_MS = 10 * 60 * 1000;

export function normalizeSeverity(v) {
  if (typeof v === "number" && v >= 1 && v <= 5) return v;
  const s = String(v || "").toLowerCase();
  if (["critical", "fatal", "emergency", "p1", "紧急"].includes(s)) return 1;
  if (["high", "major", "p2", "严重"].includes(s)) return 2;
  if (["warning", "warn", "p3", "重要"].includes(s)) return 3;
  if (["info", "notice", "p4", "一般"].includes(s)) return 4;
  return 3;
}

export function normalizeAlertPayload(payload = {}, { now = Date.now(), host = hostname() } = {}) {
  const list = Array.isArray(payload.alerts) ? payload.alerts : [payload];
  const out = [];
  for (const a of list) {
    if (!a || typeof a !== "object") continue;
    const labels = a.labels && typeof a.labels === "object" ? a.labels : {};
    const annotations = a.annotations && typeof a.annotations === "object" ? a.annotations : {};
    const service = String(a.service || labels.service || labels.app || labels.job || labels.alertname || "unknown");
    const alertname = String(a.alertname || labels.alertname || a.title || "告警");
    const hostName = String(a.host || labels.host || labels.instance || host);
    const title = String(a.title || annotations.summary || annotations.description || alertname);
    const endsAt = Date.parse(a.endsAt || "");
    const status = a.status || payload.status || (Number.isFinite(endsAt) && endsAt < now ? "resolved" : "firing");
    const started = Date.parse(a.startsAt || "") || Number(a.startedAt) || now;
    const fingerprint = String(a.fingerprint || `${service}|${alertname}|${hostName}`);
    out.push({
      fingerprint,
      source: String(a.source || payload.source || (Array.isArray(payload.alerts) ? "alertmanager" : "generic")),
      service,
      host: hostName,
      alertname,
      title,
      severity: normalizeSeverity(a.severity ?? labels.severity),
      status: status === "resolved" ? "resolved" : "firing",
      startedAt: started,
      labels,
      annotations,
    });
  }
  return out;
}

export async function readIncidents(filePath) {
  try {
    const data = JSON.parse(await readFile(filePath, "utf8"));
    return { incidents: Array.isArray(data?.incidents) ? data.incidents : [] };
  } catch { return { incidents: [] }; }
}

export async function writeIncidents(filePath, state) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify({ incidents: (state.incidents || []).slice(0, MAX) }, null, 2));
}

let chain = Promise.resolve();
function serialize(fn) {
  const p = chain.then(fn);
  chain = p.then(() => {}, () => {});
  return p;
}

export function createOrMergeIncidents({ filePath, alerts, now = Date.now(), mergeOpen = false }) {
  return serialize(async () => {
    const state = await readIncidents(filePath);
    const results = [];
    for (const a of alerts) {
      const found = state.incidents.find((i) => i.fingerprint === a.fingerprint && i.status !== "resolved" && (a.status === "resolved" || mergeOpen || now - (i.lastSeen || i.startedAt) <= DEDUP_MS));
      if (found) {
        found.lastSeen = now;
        found.title = a.title || found.title;
        found.labels = { ...found.labels, ...a.labels };
        found.severity = Math.min(found.severity, a.severity);
        if (a.status === "resolved") {
          found.status = "resolved";
          found.resolvedAt = now;
          found.timeline.push({ ts: now, text: "告警恢复" });
          results.push({ incident: found, created: false, resolved: true });
        } else {
          found.timeline.push({ ts: now, text: "告警再次触发" });
          results.push({ incident: found, created: false, resolved: false });
        }
      } else {
        const incident = {
          id: a.id || "INC-" + randomUUID().slice(0, 8),
          fingerprint: a.fingerprint,
          source: a.source,
          service: a.service,
          host: a.host,
          alertname: a.alertname,
          title: a.title,
          severity: a.severity,
          status: a.status === "resolved" ? "resolved" : "open",
          startedAt: a.startedAt,
          lastSeen: now,
          resolvedAt: a.status === "resolved" ? now : 0,
          labels: a.labels || {},
          annotations: a.annotations || {},
          timeline: [{ ts: now, text: a.status === "resolved" ? "收到恢复告警" : "告警接入" }],
          evidence: [],
          rca: null,
          playbookAt: 0,
          rcaAt: 0,
          retroId: null,
        };
        state.incidents.unshift(incident);
        results.push({ incident, created: true, resolved: incident.status === "resolved" });
      }
    }
    state.incidents.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    await writeIncidents(filePath, state);
    return { incidents: state.incidents, results };
  });
}

export function updateIncident({ filePath, id, patch }) {
  return serialize(async () => {
    const state = await readIncidents(filePath);
    const inc = state.incidents.find((i) => i.id === id);
    if (!inc) return null;
    patch(inc);
    await writeIncidents(filePath, state);
    return inc;
  });
}

export function addEvidence({ filePath, id, evidence }) {
  return updateIncident({ filePath, id, patch: (inc) => {
    inc.evidence = evidence;
    inc.playbookAt = Date.now();
    inc.timeline.push({ ts: Date.now(), text: `取证完成（${evidence.length} 项）` });
  } });
}

export function setIncidentRca({ filePath, id, rca }) {
  return updateIncident({ filePath, id, patch: (inc) => {
    inc.rca = rca;
    inc.rcaAt = Date.now();
    inc.timeline.push({ ts: Date.now(), text: "RCA 生成完成" });
  } });
}

export function setRetroId({ filePath, id, retroId }) {
  return updateIncident({ filePath, id, patch: (inc) => { inc.retroId = retroId; } });
}

export function deleteIncidents({ filePath, ids = [] }) {
  const set = new Set((Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean));
  return serialize(async () => {
    const state = await readIncidents(filePath);
    const before = state.incidents.length;
    state.incidents = state.incidents.filter((i) => !set.has(i.id));
    await writeIncidents(filePath, state);
    return { deleted: before - state.incidents.length, incidents: state.incidents };
  });
}

export async function listIncidents(filePath) {
  const { incidents } = await readIncidents(filePath);
  return incidents;
}

export async function getIncident(filePath, id) {
  const { incidents } = await readIncidents(filePath);
  return incidents.find((i) => i.id === id) || null;
}
