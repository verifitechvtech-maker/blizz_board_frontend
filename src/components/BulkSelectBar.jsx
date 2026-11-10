import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";

/* =========================================================
   "Select all" + bulk delete for a list (Users, Tasks, Task Bank)
   const sel = useBulkSelect(selectableIds);   ← ids the user may act on (whole filtered list)
   <BulkSelectBar {...sel} label="tasks" onDelete={(ids) => …} />
   <SelectCheckbox checked={sel.isSelected(id)} onChange={() => sel.toggle(id)} />
   • only ids still in the list count as selected (filters / deletes drop the rest)
   • onDelete gets the selected ids; it should resolve to the ids that were deleted
========================================================= */

export const useBulkSelect = (selectableIds = []) => {
  const [picked, setPicked] = useState(() => new Set());
  const allowed = useMemo(() => selectableIds.map(String), [selectableIds]);
  const selectedIds = useMemo(() => allowed.filter((id) => picked.has(id)), [allowed, picked]);

  const isSelected = (id) => picked.has(String(id)) && allowed.includes(String(id));
  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      const key = String(id);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const allSelected = allowed.length > 0 && selectedIds.length === allowed.length;
  const toggleAll = () => setPicked(allSelected ? new Set() : new Set(allowed));
  const clear = () => setPicked(new Set());

  return { selectedIds, total: allowed.length, allSelected, isSelected, toggle, toggleAll, clear };
};

export const SelectCheckbox = ({ checked, onChange, label = "Select", style }) => (
  <input
    type="checkbox"
    checked={checked}
    onChange={onChange}
    onClick={(event) => event.stopPropagation()}
    aria-label={label}
    title={label}
    style={{ width: 16, height: 16, margin: 0, cursor: "pointer", accentColor: "#0e7490", flexShrink: 0, ...style }}
  />
);

const BulkSelectBar = ({ selectedIds, total, allSelected, toggleAll, clear, label = "items", onDelete }) => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const count = selectedIds.length;

  useEffect(() => {
    if (!count) setConfirming(false);
  }, [count]);

  if (!total) return null;

  const runDelete = async () => {
    setBusy(true);
    setNotice("");
    try {
      const deleted = (await onDelete(selectedIds)) || [];
      const failed = count - deleted.length;
      setNotice(failed ? `Deleted ${deleted.length} of ${count} ${label}. ${failed} could not be deleted.` : `Deleted ${deleted.length} ${label}.`);
      clear();
    } catch (err) {
      setNotice(err?.response?.data?.message || err?.message || `Could not delete the selected ${label}.`);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div style={styles.bar} role="region" aria-label={`Select ${label}`}>
      <label style={styles.all}>
        <SelectCheckbox
          checked={allSelected}
          onChange={toggleAll}
          label={allSelected ? `Unselect all ${label}` : `Select all ${label}`}
          style={{ opacity: 1 }}
        />
        Select all ({total})
      </label>

      {count > 0 && <span style={styles.count}>{count} selected</span>}

      {notice && !count && <span style={styles.notice} role="status">{notice}</span>}

      {count > 0 && onDelete && (
        <span style={styles.actions}>
          {confirming ? (
            <>
              <span style={styles.warn}>Delete {count} {label}? This can't be undone.</span>
              <button type="button" style={styles.ghost} onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
              <button type="button" style={styles.danger} onClick={runDelete} disabled={busy} autoFocus>
                {busy ? <Loader2 size={13} className="bulk-spin" /> : <Trash2 size={13} />} {busy ? "Deleting…" : "Yes, delete"}
              </button>
            </>
          ) : (
            <>
              <button type="button" style={styles.danger} onClick={() => setConfirming(true)}>
                <Trash2 size={13} /> Delete selected
              </button>
              <button type="button" style={styles.ghost} onClick={clear}>
                <X size={13} /> Clear
              </button>
            </>
          )}
        </span>
      )}
      <style>{"@keyframes bulkSpin{to{transform:rotate(360deg)}}.bulk-spin{animation:bulkSpin 1s linear infinite}"}</style>
    </div>
  );
};

const button = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "6px 11px",
  borderRadius: 9,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const styles = {
  bar: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    padding: "8px 12px",
    margin: "0 0 12px",
    borderRadius: 12,
    border: "1px solid #dbeef4",
    background: "#f6fbfd",
    fontSize: 12.5,
    color: "#1f3b4d",
  },
  all: { display: "inline-flex", alignItems: "center", gap: 7, fontWeight: 700, cursor: "pointer" },
  count: { padding: "3px 9px", borderRadius: 999, background: "#e0f4f8", color: "#0e7490", fontWeight: 800, fontSize: 11.5 },
  notice: { color: "#4b6b7d", fontSize: 12 },
  actions: { display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginLeft: "auto" },
  warn: { color: "#A83C55", fontWeight: 700 },
  danger: { ...button, border: "1px solid #A83C55", background: "#A83C55", color: "#fff" },
  ghost: { ...button, border: "1px solid #cfe3ea", background: "#fff", color: "#1f3b4d" },
};

export default BulkSelectBar;
