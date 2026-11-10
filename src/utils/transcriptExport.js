/* =========================================================
   Download a meeting transcript as a file — made in the browser, nothing extra on the server.
   lines: [{ name, time, text }]   format: "txt" | "doc" (opens in Word) | "csv" (Excel)
========================================================= */

export const TRANSCRIPT_FORMATS = [
  { value: "txt", label: "Text (.txt)" },
  { value: "doc", label: "Word (.doc)" },
  { value: "csv", label: "Excel (.csv)" },
];

const safeName = (s) => String(s || "meeting").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "meeting";

const escapeHtml = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// CSV cells; a leading = + - @ is prefixed so Excel never runs it as a formula
const csvCell = (v) => {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

const save = (content, type, filename) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadTranscript = ({ title, date, lines }, format = "txt") => {
  const name = safeName(title);
  const when = date ? new Date(date).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "";
  const speakers = [...new Set(lines.map((l) => l.name).filter(Boolean))];

  if (format === "csv") {
    const rows = [["Time", "Speaker", "Text"], ...lines.map((l) => [l.time, l.name, l.text])];
    save("﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8", `${name} - transcript.csv`);
    return;
  }

  if (format === "doc") {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} - transcript</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1f2937}h1{font-size:18pt;color:#123b5d;margin:0 0 4pt}
p.meta{color:#64748b;margin:0 0 12pt}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid #e5e7eb;padding:5pt 6pt;vertical-align:top}
td.t{color:#64748b;width:60pt;white-space:nowrap}td.s{font-weight:bold;color:#0e7490;width:120pt}</style></head><body>
<h1>${escapeHtml(title)} — Transcript</h1>
<p class="meta">${escapeHtml([when, speakers.length ? `Speakers: ${speakers.join(", ")}` : "", `${lines.length} lines`].filter(Boolean).join(" · "))}</p>
<table>${lines.map((l) => `<tr><td class="t">${escapeHtml(l.time)}</td><td class="s">${escapeHtml(l.name)}</td><td>${escapeHtml(l.text)}</td></tr>`).join("")}</table>
</body></html>`;
    save("﻿" + html, "application/msword", `${name} - transcript.doc`);
    return;
  }

  const header = [`${title} — Transcript`, when, speakers.length ? `Speakers: ${speakers.join(", ")}` : "", ""].filter((x, i) => x || i === 3);
  const body = lines.map((l) => `[${l.time}] ${l.name}: ${l.text}`);
  save([...header, ...body].join("\r\n"), "text/plain;charset=utf-8", `${name} - transcript.txt`);
};
