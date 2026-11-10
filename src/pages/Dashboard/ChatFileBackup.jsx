import React, { useCallback, useEffect, useState } from "react";
import API from "../../api/config";
import {
  Archive,
  Download,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Search,
  Trash2,
  AlertTriangle,
  MessageCircle,
} from "lucide-react";

/* =========================================================
   Settings → Chat file backup
   Every file shared in chat. When a disappearing message is
   deleted, its file is kept here ("Backed up").
   GET    /api/chat/backup
   GET    /api/chat/backup/:id/download
   DELETE /api/chat/backup/:id   (Admin / SuperAdmin)
========================================================= */

const FILTERS = [
  { value: "all", label: "All files" },
  { value: "backup", label: "Message deleted" },
  { value: "chat", label: "Still in chat" },
];

const formatBytes = (n = 0) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const formatDate = (d) =>
  d ? new Date(d).toLocaleString([], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

const ChatFileBackup = () => {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ files: 0, size: 0, inChat: 0, backedUp: 0 });
  const [canDelete, setCanDelete] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await API.get("/api/chat/backup", {
        params: { search: search.trim() || undefined, location: filter === "all" ? undefined : filter, page, limit },
      });
      setItems(res.data.data || []);
      setSummary(res.data.summary || { files: 0, size: 0, inChat: 0, backedUp: 0 });
      setCanDelete(Boolean(res.data.canDelete));
      setTotal(res.data.total || 0);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to load the chat file backup.");
    } finally {
      setLoading(false);
    }
  }, [search, filter, page]);

  // small delay while typing
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => setPage(1), [search, filter]);

  const download = async (item) => {
    setBusyId(item._id);
    setError("");
    try {
      const res = await API.get(`/api/chat/backup/${item._id}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      let message = "Unable to download the file.";
      try {
        message = JSON.parse(await err.response?.data?.text())?.message || message;
      } catch {
        /* keep the default */
      }
      setError(message);
    } finally {
      setBusyId("");
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete "${item.name}" from the backup permanently?`)) return;
    setBusyId(item._id);
    setError("");
    try {
      await API.delete(`/api/chat/backup/${item._id}`);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to delete the file.");
    } finally {
      setBusyId("");
    }
  };

  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <section className="section-card">
      <style>{`
        .cfb-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:4px 0 16px}
        .cfb-stat{padding:12px 14px;border:1px solid #dcebef;border-radius:12px;background:#f7fcfd}
        .cfb-stat strong{display:block;font-size:18px;color:#123B5D}
        .cfb-stat span{font-size:11px;color:#6E8799}
        .cfb-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px}
        .cfb-search{flex:1;min-width:200px;display:flex;align-items:center;gap:8px;padding:0 12px;height:40px;border:1px solid #d7e7eb;border-radius:10px;background:#fff}
        .cfb-search input{flex:1;min-width:0;border:0;outline:none;font:inherit;font-size:13px;background:transparent}
        .cfb-filter{height:40px;padding:0 10px;border:1px solid #d7e7eb;border-radius:10px;background:#fff;font:inherit;font-size:13px;color:#123B5D}
        .cfb-icon-btn{height:40px;width:40px;display:grid;place-items:center;border:1px solid #d7e7eb;border-radius:10px;background:#fff;color:#0b8f87;cursor:pointer}
        .cfb-list{display:flex;flex-direction:column;border:1px solid #e3eef1;border-radius:12px;overflow:hidden}
        .cfb-row{display:flex;align-items:center;gap:12px;padding:11px 14px;border-bottom:1px solid #eef5f6;background:#fff}
        .cfb-row:last-child{border-bottom:0}
        .cfb-file-icon{width:36px;height:36px;flex-shrink:0;display:grid;place-items:center;border-radius:10px;background:#E8F7F8;color:#0b8f87}
        .cfb-main{flex:1;min-width:0}
        .cfb-name{font-size:13px;font-weight:700;color:#123B5D;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .cfb-meta{margin-top:3px;font-size:11px;color:#6E8799;display:flex;flex-wrap:wrap;gap:4px 10px}
        .cfb-badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:10px;font-weight:800}
        .cfb-badge.backup{background:#FFF5E6;color:#a16207}
        .cfb-badge.chat{background:#E8F7F8;color:#0b8f87}
        .cfb-actions{display:flex;gap:6px;flex-shrink:0}
        .cfb-actions button{height:32px;padding:0 10px;display:flex;align-items:center;gap:5px;border:1px solid #d7e7eb;border-radius:8px;background:#fff;color:#0b6f6a;font-size:12px;font-weight:700;cursor:pointer}
        .cfb-actions button.danger{color:#b91c1c;border-color:#fecaca}
        .cfb-actions button:disabled{opacity:.5;cursor:not-allowed}
        .cfb-empty{padding:26px;text-align:center;color:#6E8799;font-size:13px}
        .cfb-error{display:flex;gap:8px;align-items:center;margin-bottom:12px;padding:10px 12px;border-radius:10px;background:#fef2f2;color:#b91c1c;font-size:12px}
        .cfb-pager{display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:12px;color:#6E8799}
        .cfb-pager button{height:32px;padding:0 12px;border:1px solid #d7e7eb;border-radius:8px;background:#fff;cursor:pointer}
        .cfb-pager button:disabled{opacity:.5;cursor:not-allowed}
        @media (max-width:640px){.cfb-row{flex-wrap:wrap}.cfb-actions{width:100%;justify-content:flex-end}}
      `}</style>

      <div className="section-header">
        <div className="section-title-wrap">
          <div className="section-icon">
            <Archive size={20} />
          </div>
          <div>
            <h2 className="section-title">Chat file backup</h2>
            <p className="section-description">
              Every file shared in chat is kept here. When a disappearing message is deleted, its file stays in this backup.
            </p>
          </div>
        </div>
      </div>

      <div className="cfb-stats">
        <div className="cfb-stat"><strong>{summary.files}</strong><span>Files in backup</span></div>
        <div className="cfb-stat"><strong>{summary.backedUp}</strong><span>From deleted messages</span></div>
        <div className="cfb-stat"><strong>{summary.inChat}</strong><span>Still in chats</span></div>
        <div className="cfb-stat"><strong>{formatBytes(summary.size)}</strong><span>Total size</span></div>
      </div>

      <div className="cfb-toolbar">
        <label className="cfb-search">
          <Search size={15} color="#63929d" />
          <input
            type="search"
            placeholder="Search by file name, sender or chat"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select className="cfb-filter" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter files">
          {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <button type="button" className="cfb-icon-btn" onClick={load} title="Refresh" aria-label="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {error && <div className="cfb-error"><AlertTriangle size={15} /> {error}</div>}

      <div className="cfb-list">
        {loading && !items.length ? (
          <div className="cfb-empty">Loading files...</div>
        ) : items.length === 0 ? (
          <div className="cfb-empty">
            {search || filter !== "all" ? "No files match your search." : "No files have been shared in chat yet."}
          </div>
        ) : (
          items.map((item) => {
            const Icon = /^image\//.test(item.mimetype) ? ImageIcon : FileText;
            return (
              <div className="cfb-row" key={item._id}>
                <span className="cfb-file-icon"><Icon size={17} /></span>
                <div className="cfb-main">
                  <div className="cfb-name" title={item.name}>{item.name}</div>
                  <div className="cfb-meta">
                    <span className={`cfb-badge ${item.location}`}>
                      {item.location === "backup" ? "Message deleted" : "In chat"}
                    </span>
                    <span>{formatBytes(item.size)}</span>
                    <span>by {item.senderName || "Unknown"}</span>
                    <span><MessageCircle size={10} style={{ verticalAlign: "-1px" }} /> {item.conversationName || item.conversationType}</span>
                    <span>{formatDate(item.sharedAt)}</span>
                  </div>
                </div>
                <div className="cfb-actions">
                  <button type="button" onClick={() => download(item)} disabled={busyId === item._id}>
                    <Download size={13} /> Download
                  </button>
                  {canDelete && item.location === "backup" && (
                    <button type="button" className="danger" onClick={() => remove(item)} disabled={busyId === item._id}>
                      <Trash2 size={13} /> Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {pages > 1 && (
        <div className="cfb-pager">
          <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>Previous</button>
          <span>Page {page} of {pages} · {total} files</span>
          <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page >= pages}>Next</button>
        </div>
      )}
    </section>
  );
};

export default ChatFileBackup;
