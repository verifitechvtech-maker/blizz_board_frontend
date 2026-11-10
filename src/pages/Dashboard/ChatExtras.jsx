import React, { useEffect, useMemo, useRef, useState } from "react";
import { Smile, Paperclip, FileText, Download, X, Loader2, Users, Check, UserPlus, UserMinus, LogOut, Pencil } from "lucide-react";

/* =========================================================
   Chat additions: emoji picker, attachments, groups.
   Kept separate from DashboardChart.jsx to keep that file readable.
========================================================= */

export const CHAT_ALLOWED_EXT = ["jpg", "jpeg", "png", "gif", "webp", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "zip", "mp3", "mp4"];
export const CHAT_MAX_FILE = 8 * 1024 * 1024; // 8 MB per file (text is not limited)
export const CHAT_MAX_FILES = 5;

export const formatBytes = (n) =>
  !n ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

/* ---------------- Emoji picker (no external dependency) ---------------- */
const EMOJI_GROUPS = {
  Smileys: ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "🙂", "😉", "😍", "😘", "😎", "🤩", "🥳", "🤔", "😐", "😴", "😢", "😭", "😡", "😱", "🤯", "😇", "🙃", "😬", "🥲"],
  Gestures: ["👍", "👎", "👌", "✌️", "🤞", "👏", "🙌", "🙏", "💪", "👋", "🤝", "✋", "👀", "🫡"],
  Work: ["✅", "☑️", "❌", "⚠️", "📌", "📎", "📅", "⏰", "📈", "📊", "📝", "💡", "🚀", "🎯", "🔥", "⭐", "🏆", "🛠️", "📢", "💬"],
  Hearts: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🤍", "💯", "✨", "🎉", "🎊", "🙂‍↕️"],
};

export const EmojiPicker = ({ onPick, disabled }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("Smileys");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" className="composer-tool" onClick={() => setOpen((o) => !o)} disabled={disabled} title="Emoji" aria-label="Insert emoji">
        <Smile size={18} />
      </button>
      {open && (
        <div style={styles.emojiPanel} role="dialog" aria-label="Emoji picker">
          <div style={styles.emojiTabs}>
            {Object.keys(EMOJI_GROUPS).map((g) => (
              <button key={g} type="button" onClick={() => setTab(g)} style={{ ...styles.emojiTab, ...(tab === g ? styles.emojiTabActive : {}) }}>
                {g}
              </button>
            ))}
          </div>
          <div style={styles.emojiGrid}>
            {EMOJI_GROUPS[tab].map((e) => (
              <button key={e} type="button" style={styles.emoji} onClick={() => onPick(e)} aria-label={`Insert ${e}`}>
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------------- Attach button + selected files ---------------- */
export const validateChatFiles = (list, current = []) => {
  const accepted = [];
  const problems = [];
  for (const f of list) {
    const ext = f.name.split(".").pop().toLowerCase();
    if (!CHAT_ALLOWED_EXT.includes(ext)) problems.push(`${f.name}: file type not allowed`);
    else if (f.size > CHAT_MAX_FILE) problems.push(`${f.name}: larger than 8 MB`);
    else if (!f.size) problems.push(`${f.name}: empty file`);
    else accepted.push(f);
  }
  const room = CHAT_MAX_FILES - current.length;
  if (accepted.length > room) {
    problems.push(`At most ${CHAT_MAX_FILES} files per message`);
    accepted.splice(Math.max(room, 0));
  }
  return { accepted, problems };
};

export const AttachButton = ({ onFiles, disabled }) => {
  const ref = useRef(null);
  return (
    <>
      <button type="button" className="composer-tool" onClick={() => ref.current?.click()} disabled={disabled} title="Attach files (max 8 MB each)" aria-label="Attach files">
        <Paperclip size={18} />
      </button>
      <input
        ref={ref}
        type="file"
        multiple
        hidden
        accept={CHAT_ALLOWED_EXT.map((e) => `.${e}`).join(",")}
        onChange={(e) => {
          onFiles(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
    </>
  );
};

export const PendingFiles = ({ files, onRemove }) =>
  files.length ? (
    <div style={styles.pending}>
      {files.map((f, i) => (
        <span key={`${f.name}-${i}`} style={styles.pendingChip}>
          <FileText size={12} /> {f.name} <span style={{ color: "#7b969e" }}>{formatBytes(f.size)}</span>
          <button type="button" onClick={() => onRemove(i)} style={styles.chipX} aria-label={`Remove ${f.name}`}><X size={11} /></button>
        </span>
      ))}
    </div>
  ) : null;

/* ---------------- Attachments inside a message ---------------- */
const ImageThumb = ({ api, file }) => {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let revoked = "";
    api
      .get(`/chat/attachments/${encodeURIComponent(file.filename)}`, { params: { inline: 1 }, responseType: "blob" })
      .then((res) => {
        revoked = URL.createObjectURL(res.data);
        setUrl(revoked);
      })
      .catch(() => {});
    return () => revoked && URL.revokeObjectURL(revoked);
  }, [api, file.filename]);
  return url ? <img src={url} alt={file.name} style={styles.thumb} /> : <span style={styles.thumbPh}>Loading image…</span>;
};

export const MessageAttachments = ({ api, attachments = [], canDownload }) => {
  const [busy, setBusy] = useState("");
  if (!attachments.length) return null;

  const download = async (file) => {
    setBusy(file.filename);
    try {
      const res = await api.get(`/chat/attachments/${encodeURIComponent(file.filename)}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch {
      alert(`Could not download ${file.name}.`);
    } finally {
      setBusy("");
    }
  };

  return (
    <div style={styles.attachments}>
      {attachments.map((f) => (
        <div key={f.filename} style={styles.attachment}>
          {canDownload && /^image\//.test(f.mimetype) && <ImageThumb api={api} file={f} />}
          <div style={styles.attachmentRow}>
            <FileText size={14} />
            <span style={styles.attachmentName} title={f.name}>{f.name}</span>
            <span style={{ color: "#7b969e", fontSize: 10 }}>{formatBytes(f.size)}</span>
            {canDownload ? (
              <button type="button" style={styles.dl} onClick={() => download(f)} disabled={busy === f.filename} title="Download">
                {busy === f.filename ? <Loader2 size={12} /> : <Download size={12} />}
              </button>
            ) : (
              <span style={{ fontSize: 10, color: "#9a6a0a" }}>No access</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ---------------- Create group (tab inside "New conversation") ---------------- */
export const GroupCreator = ({ users, currentUserId, onCreate, busy }) => {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState([]);
  const list = useMemo(
    () =>
      users
        .filter((u) => String(u._id || u.id) !== String(currentUserId))
        .filter((u) => `${u.name} ${u.email} ${u.department}`.toLowerCase().includes(query.toLowerCase())),
    [users, query, currentUserId]
  );
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name, e.g. Release Team" maxLength={80} style={styles.input} autoFocus />
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people to add…" style={styles.input} />
      <div style={styles.memberList}>
        {list.map((u) => {
          const id = String(u._id || u.id);
          const on = picked.includes(id);
          return (
            <button type="button" key={id} onClick={() => toggle(id)} style={{ ...styles.member, ...(on ? styles.memberOn : {}) }}>
              <span style={{ ...styles.check, ...(on ? styles.checkOn : {}) }}>{on && <Check size={11} />}</span>
              <span style={{ flex: 1, textAlign: "left" }}>
                <strong style={{ display: "block", fontSize: 13 }}>{u.name}</strong>
                <span style={{ fontSize: 11, color: "#6E8799" }}>{[u.department, u.email].filter(Boolean).join(" · ")}</span>
              </span>
            </button>
          );
        })}
        {!list.length && <div style={{ padding: 12, fontSize: 12, color: "#6E8799" }}>No people found.</div>}
      </div>
      <button
        type="button"
        style={{ ...styles.primary, opacity: !name.trim() || !picked.length || busy ? 0.6 : 1 }}
        disabled={!name.trim() || !picked.length || busy}
        onClick={() => onCreate(name.trim(), picked)}
      >
        {busy ? <Loader2 size={14} /> : <Users size={14} />} Create group ({picked.length} member{picked.length === 1 ? "" : "s"})
      </button>
    </div>
  );
};

/* ---------------- Group members (info panel) ---------------- */
export const GroupMembersPanel = ({ group, users, currentUserId, canManage, onUpdate, onLeave }) => {
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState([]);
  const [rename, setRename] = useState(null);
  const memberIds = (group.participants || []).map((p) => String(p._id || p));
  const admins = (group.groupAdmins || []).map(String);
  const candidates = users.filter((u) => !memberIds.includes(String(u._id || u.id)));

  return (
    <div className="info-section">
      <div className="info-section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Members ({memberIds.length})</span>
        {canManage && (
          <span style={{ display: "flex", gap: 6 }}>
            <button type="button" style={styles.mini} onClick={() => setRename(rename === null ? group.name : null)} title="Rename"><Pencil size={12} /></button>
            <button type="button" style={styles.mini} onClick={() => setAdding((a) => !a)} title="Add members"><UserPlus size={12} /></button>
          </span>
        )}
      </div>

      {rename !== null && (
        <div style={{ display: "flex", gap: 6, margin: "6px 0" }}>
          <input value={rename} onChange={(e) => setRename(e.target.value)} style={{ ...styles.input, padding: "6px 8px" }} maxLength={80} />
          <button type="button" style={styles.mini} onClick={() => { onUpdate({ name: rename }); setRename(null); }} disabled={!rename.trim()}>
            <Check size={12} />
          </button>
        </div>
      )}

      {adding && (
        <div style={{ margin: "6px 0" }}>
          <div style={{ ...styles.memberList, maxHeight: 150 }}>
            {candidates.map((u) => {
              const id = String(u._id || u.id);
              const on = picked.includes(id);
              return (
                <button type="button" key={id} style={{ ...styles.member, ...(on ? styles.memberOn : {}) }} onClick={() => setPicked((p) => (on ? p.filter((x) => x !== id) : [...p, id]))}>
                  <span style={{ ...styles.check, ...(on ? styles.checkOn : {}) }}>{on && <Check size={11} />}</span>
                  <span style={{ fontSize: 12 }}>{u.name}</span>
                </button>
              );
            })}
            {!candidates.length && <div style={{ padding: 8, fontSize: 12, color: "#6E8799" }}>Everyone is already in this group.</div>}
          </div>
          <button type="button" style={{ ...styles.primary, marginTop: 6, padding: "7px 10px", fontSize: 12 }} disabled={!picked.length} onClick={() => { onUpdate({ addMemberIds: picked }); setPicked([]); setAdding(false); }}>
            <UserPlus size={12} /> Add {picked.length || ""}
          </button>
        </div>
      )}

      {(group.participants || []).map((p) => {
        const id = String(p._id || p);
        return (
          <div key={id} className="info-item" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ flex: 1 }}>
              {p.name || "Member"}
              {id === String(currentUserId) ? " (you)" : ""}
              {admins.includes(id) && <span style={styles.adminTag}>admin</span>}
            </span>
            {canManage && id !== String(currentUserId) && (
              <button type="button" style={{ ...styles.mini, color: "#be123c" }} onClick={() => onUpdate({ removeMemberIds: [id] })} title={`Remove ${p.name}`}>
                <UserMinus size={12} />
              </button>
            )}
          </div>
        );
      })}

      <button type="button" style={{ ...styles.mini, marginTop: 10, color: "#be123c", width: "100%", justifyContent: "center", padding: "7px" }} onClick={onLeave}>
        <LogOut size={12} /> Leave group
      </button>
    </div>
  );
};

const styles = {
  emojiPanel: { position: "absolute", bottom: "calc(100% + 8px)", left: 0, width: 300, background: "#fff", border: "1px solid #D5E7EE", borderRadius: 14, boxShadow: "0 18px 40px rgba(6,59,70,.18)", zIndex: 30, overflow: "hidden" },
  emojiTabs: { display: "flex", gap: 2, padding: 6, borderBottom: "1px solid #EEF5F6", background: "#F7FCFD" },
  emojiTab: { flex: 1, border: "none", background: "transparent", borderRadius: 8, padding: "5px 4px", fontSize: 11, fontWeight: 700, color: "#6E8799", cursor: "pointer" },
  emojiTabActive: { background: "#E8F7F8", color: "#0b8f87" },
  emojiGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, padding: 8, maxHeight: 200, overflowY: "auto" },
  emoji: { border: "none", background: "transparent", fontSize: 21, lineHeight: 1, padding: 6, borderRadius: 8, cursor: "pointer" },
  pending: { display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 2px 0" },
  pendingChip: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, background: "#F2FBFC", border: "1px solid #CFEAEE", borderRadius: 999, padding: "4px 6px 4px 9px", color: "#123B5D" },
  chipX: { border: "none", background: "transparent", cursor: "pointer", color: "#7b969e", display: "flex", padding: 2 },
  attachments: { display: "flex", flexDirection: "column", gap: 6, marginTop: 6 },
  attachment: { background: "rgba(255,255,255,.75)", border: "1px solid rgba(0,0,0,.06)", borderRadius: 10, padding: 6 },
  attachmentRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#123B5D" },
  attachmentName: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 },
  dl: { border: "1px solid #D5E7EE", background: "#fff", color: "#0b8f87", borderRadius: 7, padding: "3px 6px", cursor: "pointer", display: "flex" },
  thumb: { display: "block", maxWidth: 220, maxHeight: 180, borderRadius: 8, marginBottom: 5 },
  thumbPh: { display: "block", fontSize: 10, color: "#7b969e", marginBottom: 4 },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid #D5E7EE", borderRadius: 10, padding: "9px 11px", fontSize: 13, outline: "none", fontFamily: "inherit" },
  memberList: { maxHeight: 260, overflowY: "auto", border: "1px solid #E3EEF2", borderRadius: 12 },
  member: { width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "none", borderBottom: "1px solid #F1F6F8", background: "#fff", cursor: "pointer", color: "#123B5D" },
  memberOn: { background: "#F2FBFC" },
  check: { width: 18, height: 18, borderRadius: 6, border: "1.5px solid #BFD9E0", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 },
  checkOn: { background: "#16A6B8", borderColor: "#16A6B8" },
  primary: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 14px", borderRadius: 11, border: "none", background: "linear-gradient(135deg,#123B5D,#16A6B8)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" },
  mini: { display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid #D5E7EE", background: "#fff", color: "#0b8f87", borderRadius: 8, padding: "4px 7px", fontSize: 11, fontWeight: 700, cursor: "pointer" },
  adminTag: { marginLeft: 6, fontSize: 9, fontWeight: 800, color: "#0e7490", background: "#ECFEFF", borderRadius: 999, padding: "1px 6px" },
};
