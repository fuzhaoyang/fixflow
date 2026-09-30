import { escapeHtml } from "./util.js";
const CODE_STYLE = "background:#f3f4f6;padding:1px 5px;border-radius:4px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px";
const PRE_STYLE = "background:#f3f4f6;padding:10px 12px;border-radius:6px;overflow:auto;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;white-space:pre-wrap";

function inline(text) {
  const codes = [];
  let s = escapeHtml(text).replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => `<a href="${/^(https?:|mailto:)/i.test(u) ? u : "#"}" style="color:#2563eb">${t}</a>`);
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code style="${CODE_STYLE}">${codes[Number(i)]}</code>`);
  return s;
}

const isBlock = (l) => /^(#{1,6}\s|```|\s*>|\s*[-*+]\s|\s*\d+\.\s)/.test(l) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l) || /^\s*\|.*\|\s*$/.test(l);

export function mdToHtml(md) {
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const HS = { 1: "font-size:20px;margin:16px 0 8px", 2: "font-size:17px;margin:14px 0 6px", 3: "font-size:15px;margin:12px 0 6px" };
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      i++;
      const buf = [];
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre style="${PRE_STYLE}"><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const header = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      out.push(`<table style="border-collapse:collapse;margin:8px 0;font-size:13px"><thead><tr>${header.map((c) => `<th style="border:1px solid #e5e7eb;background:#f9fafb;padding:5px 9px;text-align:left">${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #e5e7eb;padding:5px 9px">${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { const lvl = Math.min(h[1].length, 3); out.push(`<h${lvl} style="${HS[lvl]}">${inline(h[2])}</h${lvl}>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push(`<hr style="border:none;border-top:1px solid #e5e7eb;margin:14px 0">`); i++; continue; }
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      out.push(`<blockquote style="border-left:3px solid #d1d5db;background:#f9fafb;margin:8px 0;padding:6px 12px;color:#4b5563">${inline(buf.join(" "))}</blockquote>`);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*+]\s+/, "")); i++; }
      out.push(`<ul style="margin:6px 0;padding-left:22px">${items.map((t) => `<li style="margin:3px 0">${inline(t)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++; }
      out.push(`<ol style="margin:6px 0;padding-left:22px">${items.map((t) => `<li style="margin:3px 0">${inline(t)}</li>`).join("")}</ol>`);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !isBlock(lines[i])) { buf.push(lines[i]); i++; }
    out.push(`<p style="margin:8px 0">${inline(buf.join(" "))}</p>`);
  }
  return out.join("\n");
}