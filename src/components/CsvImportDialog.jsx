import React, { useRef, useState } from "react";
import { Upload, X, FileSpreadsheet, Loader2, Download, CheckCircle2, AlertTriangle } from "lucide-react";
import API from "../api/config";

/* =========================================================
   Shared CSV import: choose file → server validates (preview)
   → user confirms → rows are saved. Used by Tasks and Task Bank.
   props:
     endpoint   "/api/tasks/import"
     title      dialog title
     columns    [{ key, label }] shown in the preview table
     template   { filename, header, sample }  (downloadable example)
     help       short text about the columns
     onClose(), onImported(result)
========================================================= */

const CsvImportDialog = ({ endpoint, title, columns, template, help, onClose, onImported }) => {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const send = async (f, isPreview) => {
    const body = new FormData();
    body.append("file", f);
    const res = await API.post(`${endpoint}${isPreview ? "?preview=true" : ""}`, body);
    return res.data;
  };

  const choose = async (event) => {
    const f = event.target.files?.[0];
    event.target.value = "";
    if (!f) return;
    setError("");
    setPreview(null);
    if (!f.name.toLowerCase().endsWith(".csv")) return setError("Please choose a .csv file.");
    if (f.size === 0) return setError("The selected file is empty.");
    if (f.size > 2 * 1024 * 1024) return setError("The CSV file must be 2 MB or smaller.");
    setFile(f);
    setBusy("preview");
    try {
      setPreview(await send(f, true));
    } catch (err) {
      setError(err.response?.data?.message || "The file could not be checked.");
    } finally {
      setBusy("");
    }
  };

  const confirm = async () => {
    if (!file || !preview?.summary?.valid) return;
    setBusy("import");
    setError("");
    try {
      const result = await send(file, false);
      onImported?.(result);
    } catch (err) {
      setError(err.response?.data?.message || "Import failed.");
    } finally {
      setBusy("");
    }
  };

  const downloadTemplate = () => {
    const csv = [template.header, ...(template.sample || [])].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = template.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const summary = preview?.summary;

  return (
    <div style={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose?.()}>
      <div style={styles.modal} role="dialog" aria-modal="true" aria-label={title}>
        <div style={styles.header}>
          <div style={styles.icon}><FileSpreadsheet size={18} /></div>
          <div style={{ flex: 1 }}>
            <h3 style={styles.title}>{title}</h3>
            <p style={styles.sub}>{help}</p>
          </div>
          <button type="button" style={styles.close} onClick={onClose} disabled={Boolean(busy)} aria-label="Close"><X size={16} /></button>
        </div>

        <div style={styles.body}>
          <div style={styles.row}>
            <button type="button" style={styles.primary} onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>
              {busy === "preview" ? <Loader2 size={14} className="ts-spin" /> : <Upload size={14} />}
              {file ? "Choose another file" : "Choose CSV file"}
            </button>
            {template && (
              <button type="button" style={styles.ghost} onClick={downloadTemplate}>
                <Download size={14} /> Download template
              </button>
            )}
            {file && <span style={styles.fileName}>{file.name}</span>}
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={choose} />
          </div>

          {summary && (
            <div style={styles.summary}>
              <CheckCircle2 size={14} color="#17724A" />
              <span>
                <strong>{summary.valid}</strong> of {summary.total} row(s) ready
                {summary.invalid ? ` · ${summary.invalid} invalid` : ""}
                {summary.duplicates ? ` · ${summary.duplicates} duplicate` : ""}. Invalid and duplicate rows are skipped.
              </span>
            </div>
          )}

          {preview?.rows?.length > 0 && (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Row</th>
                    {columns.map((c) => <th key={c.key} style={styles.th}>{c.label}</th>)}
                    <th style={styles.th}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.line}>
                      <td style={{ ...styles.td, color: "#7b969e" }}>{r.line}</td>
                      {columns.map((c) => <td key={c.key} style={styles.td}>{Array.isArray(r[c.key]) ? r[c.key].join(", ") : r[c.key] || "—"}</td>)}
                      <td style={{ ...styles.td, fontWeight: 700, color: r.state === "valid" ? "#087d68" : r.state === "duplicate" ? "#9a6a0a" : "#b34444" }}>
                        {r.state === "valid" ? "Ready" : r.errors.join("; ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error && <div style={styles.error}><AlertTriangle size={14} /> {error}</div>}
        </div>

        <div style={styles.footer}>
          <button type="button" style={styles.ghost} onClick={onClose} disabled={Boolean(busy)}>Cancel</button>
          <button
            type="button"
            style={{ ...styles.primary, opacity: !summary?.valid || busy ? 0.6 : 1 }}
            onClick={confirm}
            disabled={!summary?.valid || Boolean(busy)}
          >
            {busy === "import" ? <Loader2 size={14} className="ts-spin" /> : <Upload size={14} />}
            {busy === "import" ? "Importing…" : summary?.valid ? `Import ${summary.valid} row${summary.valid === 1 ? "" : "s"}` : "Import"}
          </button>
        </div>
      </div>
      <style>{"@keyframes tsSpinImport{to{transform:rotate(360deg)}} .ts-spin{animation:tsSpinImport 1s linear infinite}"}</style>
    </div>
  );
};

const styles = {
  overlay: { position: "fixed", inset: 0, zIndex: 1300, background: "rgba(6,59,70,.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { width: "100%", maxWidth: 860, maxHeight: "92vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 35px 90px rgba(3,26,43,.35)", fontFamily: "inherit" },
  header: { display: "flex", gap: 12, alignItems: "center", padding: "18px 22px", borderBottom: "1px solid #D5E7EE", background: "linear-gradient(135deg,#E9F7FB,#F4FCFD)" },
  icon: { width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,#123B5D,#16A6B8)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  title: { margin: 0, fontSize: 17, color: "#123B5D" },
  sub: { margin: "3px 0 0", fontSize: 12, color: "#6E8799", lineHeight: 1.5 },
  close: { width: 32, height: 32, borderRadius: 9, border: "1px solid #D5E7EE", background: "#fff", color: "#6E8799", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  body: { padding: "18px 22px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 },
  row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  primary: { display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 11, border: "none", background: "linear-gradient(135deg,#123B5D,#16A6B8)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  ghost: { display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 14px", borderRadius: 11, border: "1px solid #D5E7EE", background: "#fff", color: "#16A6B8", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  fileName: { fontSize: 12, color: "#4f6f7a", fontWeight: 600 },
  summary: { display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "#123B5D", background: "#EAF8F1", border: "1px solid #BDE5D0", borderRadius: 12, padding: "10px 12px" },
  tableWrap: { maxHeight: 340, overflow: "auto", border: "1px solid #E1EEF0", borderRadius: 12 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { position: "sticky", top: 0, background: "#F3FAFB", textAlign: "left", padding: "8px 10px", color: "#4f6f7a", fontWeight: 700 },
  td: { padding: "7px 10px", borderTop: "1px solid #EEF5F6", color: "#123B5D", verticalAlign: "top" },
  error: { display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "#b34444", background: "#FDECEE", border: "1px solid #F5C6CF", borderRadius: 12, padding: "10px 12px" },
  footer: { display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 22px", borderTop: "1px solid #EEF5F6", background: "#FBFDFE" },
};

export default CsvImportDialog;
