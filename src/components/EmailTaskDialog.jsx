import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Mail, X, Copy, Check } from "lucide-react";

/* =========================================================
   "Create tasks by email" — shows the task inbox address and
   how to write the email. The backend reads that inbox every minute.
   props: address, canAssign (tasks.assign), onClose()
========================================================= */

const EmailTaskDialog = ({ address, canAssign = false, onClose }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the address is still selectable */
    }
  };

  const example = [
    `To:      ${address}`,
    canAssign ? "Cc:      priya@company.com, john@company.com" : null,
    "Subject: [High] Prepare the monthly report",
    "",
    "Collect the KPIs from every team and share the summary.",
    "Due: 15 Nov 2026 5:00 PM",
    "Department: Development",
  ].filter((l) => l !== null).join("\n");

  return createPortal(
    <div style={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div style={styles.modal} role="dialog" aria-modal="true" aria-labelledby="email-task-title">
        <div style={styles.header}>
          <div style={styles.icon}><Mail size={18} /></div>
          <div style={{ flex: 1 }}>
            <h3 id="email-task-title" style={styles.title}>Create tasks by email</h3>
            <p style={styles.sub}>Send an email from your registered address — the task appears here within a minute and you get a confirmation reply.</p>
          </div>
          <button type="button" style={styles.close} onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        <div style={styles.body}>
          <div style={styles.addressRow}>
            <code style={styles.address}>{address}</code>
            <button type="button" style={styles.copy} onClick={copy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <ul style={styles.list}>
            <li><strong>Subject</strong> becomes the task title. Add <code>[High]</code> or <code>[Low]</code> to set the priority.</li>
            {canAssign ? (
              <li><strong>To / CC</strong> the people to assign (their email in the app). Several people → one task each. Nobody else → the task is yours.</li>
            ) : (
              <li>The task is assigned to <strong>you</strong>.</li>
            )}
            <li><strong>Body</strong> becomes the description. Optional lines: <code>Due: 15 Nov 2026 5:00 PM</code> (or <code>tomorrow 10 AM</code>), <code>Priority: High</code>, <code>Department: Development</code>{canAssign && <>, <code>Assign: name or email</code></>}.</li>
            <li><strong>Attachments</strong> are added to the task (up to 8 MB each, 10 files).</li>
          </ul>

          <div style={styles.exampleLabel}>Example</div>
          <pre style={styles.example}>{example}</pre>

          <p style={styles.note}>Only emails from your own registered address are accepted. If something is wrong (unknown person, bad date) you get a reply explaining why.</p>
        </div>
      </div>
    </div>,
    document.body
  );
};

const styles = {
  overlay: { position: "fixed", inset: 0, zIndex: 5000, background: "rgba(6,59,70,.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  modal: { width: "100%", maxWidth: 620, maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 20, overflow: "hidden", boxShadow: "0 35px 90px rgba(3,26,43,.35)" },
  header: { display: "flex", gap: 12, alignItems: "center", padding: "18px 22px", borderBottom: "1px solid #D5E7EE", background: "linear-gradient(135deg,#E9F7FB,#F4FCFD)" },
  icon: { width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,#123B5D,#16A6B8)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  title: { margin: 0, fontSize: 17, color: "#123B5D" },
  sub: { margin: "3px 0 0", fontSize: 12, color: "#6E8799", lineHeight: 1.5 },
  close: { width: 32, height: 32, borderRadius: 9, border: "1px solid #D5E7EE", background: "#fff", color: "#6E8799", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  body: { padding: "18px 22px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, fontSize: 13, color: "#123B5D" },
  addressRow: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  address: { flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 11, background: "#F3FAFB", border: "1px solid #D5E7EE", fontSize: 14, fontWeight: 700, wordBreak: "break-all" },
  copy: { display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRadius: 11, border: "none", background: "linear-gradient(135deg,#123B5D,#16A6B8)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  list: { margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 7, lineHeight: 1.55 },
  exampleLabel: { fontSize: 11, fontWeight: 800, letterSpacing: 1, color: "#6E8799", textTransform: "uppercase" },
  example: { margin: 0, padding: "12px 14px", borderRadius: 12, background: "#0B2A40", color: "#D9F3F7", fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  note: { margin: 0, fontSize: 12, color: "#6E8799", lineHeight: 1.5 },
};

export default EmailTaskDialog;
