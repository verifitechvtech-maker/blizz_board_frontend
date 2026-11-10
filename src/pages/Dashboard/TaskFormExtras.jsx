import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Gauge, Loader2, RotateCcw, Search, X } from "lucide-react";
import API from "../../api/config";

/* =========================================================
   Create Task form extras
   DepartmentMultiSelect → several departments as removable chips
   ReworkReferencePicker → searchable list of earlier tasks (GET /api/tasks/reference-options)
   EmployeeWorkload      → live workload of each selected person (GET /api/tasks/workload/:userId)
========================================================= */

const c = {
  navy: "#123B5D",
  ocean: "#16A6B8",
  oceanDark: "#08798C",
  oceanSoft: "#E7F8FA",
  blue: "#1677A8",
  blueLight: "#E6F4FA",
  border: "#D5E7EE",
  muted: "#6E8799",
  text: "#16344D",
  white: "#FFFFFF",
  danger: "#B42318",
};

const errorText = (err, fallback) => err?.response?.data?.message || err?.message || fallback;

/* ---------------- Departments ---------------- */

export const DepartmentMultiSelect = ({ departments, selected, onChange, inputStyle, users = [] }) => {
  const [viewingDepartment, setViewingDepartment] = useState("");
  const remaining = departments.filter((d) => !selected.includes(d.name));
  const viewedUsers = users.filter((user) => {
    const userDepartment =
      typeof user.department === "object"
        ? user.department?.name || user.department?.departmentName || ""
        : user.department || "";
    return String(userDepartment).trim().toLowerCase() === viewingDepartment.trim().toLowerCase();
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ position: "relative" }}>
        <select
          value=""
          onChange={(e) => e.target.value && onChange([...selected, e.target.value])}
          style={{ ...inputStyle, appearance: "none", paddingRight: 32 }}
          aria-label="Add a department"
        >
          <option value="">
            {selected.length ? (remaining.length ? "Add another department" : "All departments selected") : "Select departments"}
          </option>
          {remaining.map((d) => (
            <option key={d.id || d.name} value={d.name}>{d.name}</option>
          ))}
        </select>
        <ChevronDown size={15} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: c.muted, pointerEvents: "none" }} />
      </div>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {selected.map((name, i) => (
            <span key={name} style={chip.base} title={i === 0 ? "Primary department — gives the Task ID" : undefined}>
              {i === 0 && <b style={chip.primary}>Primary</b>}
              {name}
              <button
                type="button"
                onClick={() => setViewingDepartment((current) => current === name ? "" : name)}
                aria-label={`${viewingDepartment === name ? "Hide" : "View"} users in ${name}`}
                style={chip.view}
              >
                {viewingDepartment === name ? "Hide" : "View"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(selected.filter((n) => n !== name));
                  if (viewingDepartment === name) setViewingDepartment("");
                }}
                aria-label={`Remove ${name}`}
                style={chip.x}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {viewingDepartment && (
        <div style={departmentRoster.panel} aria-live="polite">
          <div style={departmentRoster.heading}>
            <strong>{viewingDepartment} users</strong>
            <span>{viewedUsers.length} {viewedUsers.length === 1 ? "user" : "users"}</span>
          </div>
          {viewedUsers.length ? (
            <div style={departmentRoster.list}>
              {viewedUsers.map((user) => (
                <div key={user.id} style={departmentRoster.user}>
                  <span>{user.name}</span>
                  {user.email && <span style={departmentRoster.email}>{user.email}</span>}
                </div>
              ))}
            </div>
          ) : (
            <div style={departmentRoster.empty}>No assignable users are listed for this department.</div>
          )}
        </div>
      )}
    </div>
  );
};

const chip = {
  base: { display: "inline-flex", alignItems: "center", gap: 6, background: c.blueLight, color: c.blue, borderRadius: 999, padding: "4px 6px 4px 10px", fontSize: 11, fontWeight: 700 },
  primary: { fontSize: 9, textTransform: "uppercase", letterSpacing: ".05em", background: c.blue, color: c.white, borderRadius: 999, padding: "1px 6px" },
  view: { border: 0, borderRadius: 999, background: c.white, color: c.blue, cursor: "pointer", fontSize: 10, fontWeight: 800, padding: "3px 7px" },
  x: { display: "flex", border: 0, background: "transparent", color: "inherit", cursor: "pointer", padding: 2 },
};

const departmentRoster = {
  panel: { border: `1px solid ${c.border}`, borderRadius: 10, background: c.white, overflow: "hidden" },
  heading: { display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 10px", color: c.navy, fontSize: 12, borderBottom: `1px solid ${c.border}` },
  list: { maxHeight: 180, overflowY: "auto" },
  user: { display: "flex", flexDirection: "column", gap: 2, padding: "7px 10px", color: c.text, fontSize: 12, borderBottom: `1px solid ${c.border}` },
  email: { color: c.muted, fontSize: 11 },
  empty: { padding: 10, color: c.muted, fontSize: 12 },
};

/* ---------------- Rework reference ---------------- */

export const ReworkReferencePicker = ({ value, onChange, required, inputStyle }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const wrapRef = useRef(null);

  // search the server as the user types (short pause between keystrokes)
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await API.get("/api/tasks/reference-options", { params: { search } });
        if (!cancelled) {
          setOptions(res.data.data || []);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(errorText(err, "Unable to load tasks."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, search]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => wrapRef.current && !wrapRef.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ ...inputStyle, display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left", cursor: "pointer" }}
      >
        <span style={{ color: value ? c.text : c.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value ? `#${value.referenceId} — ${value.name}` : required ? "Select the original task *" : "Select the original task (optional)"}
        </span>
        <ChevronDown size={15} color={c.muted} />
      </button>

      {open && (
        <div style={rp.panel}>
          <div style={rp.searchRow}>
            <Search size={14} color={c.muted} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Task ID, title or department"
              style={rp.search}
              aria-label="Search tasks"
            />
            {loading && <Loader2 size={14} className="tfx-spin" color={c.muted} />}
          </div>
          <div style={rp.list} role="listbox">
            {error && <div style={{ ...rp.empty, color: c.danger }}>{error}</div>}
            {!error && !loading && options.length === 0 && <div style={rp.empty}>No tasks found.</div>}
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={value?.id === o.id}
                onClick={() => {
                  onChange(o);
                  setOpen(false);
                }}
                style={{ ...rp.option, background: value?.id === o.id ? c.oceanSoft : c.white }}
              >
                <b style={rp.ref}>#{o.referenceId}</b>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: c.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
                  <span style={{ fontSize: 11, color: c.muted }}>
                    {[o.departments.join(", "), o.status, o.assignees.join(", ")].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {value && (
        <div style={rp.details}>
          <RotateCcw size={15} color={c.oceanDark} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: c.text }}>
            <div style={{ fontWeight: 800, color: c.navy }}>Rework of #{value.referenceId}: {value.name}</div>
            <div style={{ color: c.muted, marginTop: 2 }}>
              Department: {value.departments?.join(", ") || "—"}
              {value.status ? ` · Status: ${value.status}` : ""}
              {value.assignees?.length ? ` · Assigned to: ${value.assignees.join(", ")}` : ""}
              {value.dueDate ? ` · Due: ${value.dueDate}` : ""}
            </div>
          </div>
          <button type="button" onClick={() => onChange(null)} aria-label="Clear rework reference" style={chip.x}>
            <X size={13} />
          </button>
        </div>
      )}
      <style>{`.tfx-spin{animation:tfxSpin 1s linear infinite}@keyframes tfxSpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

const rp = {
  panel: { position: "absolute", top: 44, left: 0, right: 0, zIndex: 50, background: c.white, border: `1px solid ${c.border}`, borderRadius: 12, boxShadow: "0 18px 40px rgba(18,59,93,.16)", overflow: "hidden" },
  searchRow: { display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderBottom: `1px solid #EEF5F7` },
  search: { flex: 1, minWidth: 0, height: 38, border: 0, outline: "none", fontSize: 12.5, color: c.text },
  list: { maxHeight: 240, overflowY: "auto" },
  option: { width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: 0, borderBottom: "1px solid #F2F8FA", textAlign: "left", cursor: "pointer" },
  ref: { flexShrink: 0, fontSize: 11, color: c.blue, background: c.blueLight, borderRadius: 999, padding: "2px 8px" },
  empty: { padding: 14, textAlign: "center", fontSize: 12, color: c.muted },
  details: { display: "flex", gap: 10, padding: "10px 12px", borderRadius: 12, background: c.oceanSoft, border: `1px solid ${c.ocean}44` },
};

/* ---------------- Workload ---------------- */

const STATUS_STYLE = {
  Low: { color: "#0F8A5F", background: "#E8F7F0" },
  Medium: { color: "#B54708", background: "#FFF6E5" },
  High: { color: "#B42318", background: "#FEF3F2" },
};

const WorkloadCard = ({ userId, name }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  // fresh numbers every time this person is selected
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    API.get(`/api/tasks/workload/${userId}`)
      .then((res) => !cancelled && setData(res.data.data))
      .catch((err) => !cancelled && setError(errorText(err, "Unable to load workload.")));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const level = data ? STATUS_STYLE[data.status] : null;
  return (
    <div style={wl.card}>
      <div style={wl.head}>
        <Gauge size={14} color={c.oceanDark} />
        <strong style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data?.user?.name || name}</strong>
        {data && (
          <span
            style={{ ...wl.badge, ...level }}
            title={`Active load ${data.points} points (priority Low 1 … Critical 4, +2 overdue, +1 due within 3 days). Low ≤ ${data.limits.low}, Medium ≤ ${data.limits.medium}, High above.`}
          >
            {data.status} workload
          </span>
        )}
      </div>
      {error ? (
        <div style={{ fontSize: 11.5, color: c.danger }}>{error}</div>
      ) : !data ? (
        <div style={{ fontSize: 11.5, color: c.muted, display: "flex", alignItems: "center", gap: 6 }}>
          <Loader2 size={12} className="tfx-spin" /> Loading workload…
        </div>
      ) : (
        <div style={wl.grid}>
          {[
            ["Total", data.total],
            ["Pending", data.pending],
            ["In progress", data.inProgress + data.review],
            ["Completed", data.completed],
            ["Overdue", data.overdue],
          ].map(([label, n]) => (
            <div key={label} style={wl.stat}>
              <b style={{ fontSize: 15, color: label === "Overdue" && n ? c.danger : c.navy }}>{n}</b>
              <span style={wl.statLabel}>{label}</span>
            </div>
          ))}
        </div>
      )}
      {data?.overdue > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: c.danger }}>
          <AlertTriangle size={12} /> {data.overdue} overdue task{data.overdue === 1 ? "" : "s"}
        </div>
      )}
      <style>{`.tfx-spin{animation:tfxSpin 1s linear infinite}@keyframes tfxSpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

export const EmployeeWorkload = ({ userIds, nameOf }) => {
  if (!userIds.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
      {userIds.map((id) => (
        <WorkloadCard key={id} userId={id} name={nameOf(id)} />
      ))}
    </div>
  );
};

const wl = {
  card: { display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 12, border: `1px solid ${c.border}`, background: "#F7FCFD", minWidth: 0 },
  head: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: c.navy },
  badge: { flexShrink: 0, fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: "2px 8px", cursor: "help" },
  grid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 },
  stat: { display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 2px", borderRadius: 8, background: c.white, border: "1px solid #EEF5F7" },
  statLabel: { fontSize: 9.5, color: c.muted, fontWeight: 700, textAlign: "center", lineHeight: 1.2 },
};

/* ---------------- Start → end length + reminder ---------------- */

const dayMs = 24 * 60 * 60 * 1000;
const toMinutes = (t) => {
  const m = /^(\d{2}):(\d{2})$/.exec(t || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const fmtDay = (iso) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : "";
const fmtTime = (t) => {
  const m = toMinutes(t);
  if (m === null) return "";
  return new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

/**
 * How long a task runs, from its start and end:
 *   same day 09:00 → 16:00   → "7 hours"
 *   31 Oct → 2 Nov           → "3 days" (both days counted)
 * Returns { label, range } or null when it can't be worked out.
 */
export const taskDuration = (startDate, startTime, endDate, endTime) => {
  if (!startDate || !endDate || endDate < startDate) return null;
  const days = Math.round((new Date(`${endDate}T00:00:00Z`) - new Date(`${startDate}T00:00:00Z`)) / dayMs) + 1;
  const from = `${fmtDay(startDate)}${startTime ? ` ${fmtTime(startTime)}` : ""}`;
  const to = `${days === 1 ? "" : `${fmtDay(endDate)} `}${endTime ? fmtTime(endTime) : days === 1 ? "end of day" : ""}`.trim();
  if (days === 1) {
    const s = toMinutes(startTime);
    const e = toMinutes(endTime);
    if (s !== null && e !== null && e > s) {
      const mins = e - s;
      const h = Math.floor(mins / 60);
      const rest = mins % 60;
      const label = h ? `${h} hour${h === 1 ? "" : "s"}${rest ? ` ${rest} min` : ""}` : `${rest} min`;
      return { label, range: `${from} → ${to}` };
    }
    return { label: "1 day", range: from };
  }
  return { label: `${days} days`, range: `${from} → ${to}` };
};

export const REMINDER_CHOICES = [
  { value: "none", label: "No reminder" },
  { value: "at_start", label: "At the start time" },
  { value: "before_15m", label: "15 minutes before the end" },
  { value: "before_1h", label: "1 hour before the end" },
  { value: "before_1d", label: "1 day before the end" },
  { value: "custom", label: "Pick a date and time…" },
];

export const reminderSummary = (reminder) => {
  if (!reminder?.at) return "";
  const at = new Date(reminder.at).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });
  return `${reminder.sentAt ? "Reminded" : "Reminder"} ${at}`;
};

/* ---------------- Named reminders ---------------- */

// "🔔 2 reminders · next: Call the client 01 Nov, 10:30 am"
export const remindersSummary = (reminders = []) => {
  if (!reminders.length) return "";
  const next = reminders.filter((r) => !r.sentAt).sort((a, b) => new Date(a.at) - new Date(b.at))[0];
  const count = `${reminders.length} reminder${reminders.length === 1 ? "" : "s"}`;
  if (!next) return `${count} · all sent`;
  const at = new Date(next.at).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });
  return `${count} · next: ${next.title} ${at}`;
};

/* ---------------- Checklist (Desc · Type · Employee) ---------------- */

export const CHECKLIST_TYPES = ["Check", "Text", "Number"];

/** The "Add Checklist Details" table of the task form. */
export const ChecklistEditor = ({ value, onChange, users }) => {
  const [selected, setSelected] = useState([]);
  const descRefs = useRef({});
  const keyOf = (row, i) => row._id || row.key || String(i);

  const update = (i, patch) => onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => onChange([...value, { key: `${Date.now()}-${value.length}`, desc: "", type: "Check", employee: "" }]);
  const allKeys = value.map(keyOf);
  const allOn = value.length > 0 && selected.length === value.length;
  const toggle = (k) => setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const deleteSelected = () => {
    onChange(value.filter((r, i) => !selected.includes(keyOf(r, i))));
    setSelected([]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={ck.table} role="table" aria-label="Checklist">
        <div className="ck-row" style={{ ...ck.row, ...ck.head }} role="row">
          <span style={ck.cellBox}>
            <input
              type="checkbox"
              checked={allOn}
              onChange={() => setSelected(allOn ? [] : allKeys)}
              disabled={!value.length}
              aria-label="Select all rows"
            />
          </span>
          <span style={ck.cell}>Desc</span>
          <span style={ck.cell}>Type</span>
          <span style={ck.cell}>Employee</span>
          <span style={{ ...ck.cellBox, color: c.muted }} aria-hidden="true">⚙</span>
        </div>
        {value.map((row, i) => {
          const k = keyOf(row, i);
          return (
            <div className="ck-row" key={k} style={ck.row} role="row">
              <span style={ck.cellBox}>
                <input type="checkbox" checked={selected.includes(k)} onChange={() => toggle(k)} aria-label={`Select row ${i + 1}`} />
              </span>
              <span style={ck.cell}>
                <input
                  ref={(el) => (descRefs.current[k] = el)}
                  value={row.desc}
                  maxLength={300}
                  onChange={(e) => update(i, { desc: e.target.value })}
                  placeholder="Desc"
                  aria-label={`Row ${i + 1} description`}
                  style={ck.input}
                />
              </span>
              <span style={ck.cell}>
                <select value={row.type} onChange={(e) => update(i, { type: e.target.value })} aria-label={`Row ${i + 1} type`} style={ck.input}>
                  {CHECKLIST_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </span>
              <span style={ck.cell}>
                <select
                  value={row.employee || ""}
                  onChange={(e) => update(i, { employee: e.target.value })}
                  aria-label={`Row ${i + 1} employee`}
                  style={{ ...ck.input, color: row.employee ? c.text : c.muted }}
                >
                  <option value="">Employee</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                  {row.employee && !users.some((u) => String(u.id) === String(row.employee)) && (
                    <option value={row.employee}>{row.employeeName || "Current employee"}</option>
                  )}
                </select>
              </span>
              <span style={ck.cellBox}>
                <button type="button" onClick={() => descRefs.current[k]?.focus()} aria-label={`Edit row ${i + 1}`} style={ck.iconBtn}>
                  ✎
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={addRow} style={ck.btn}>Add Row</button>
        {selected.length > 0 && (
          <button type="button" onClick={deleteSelected} style={{ ...ck.btn, color: c.danger, background: "#FEF3F2" }}>
            Delete ({selected.length})
          </button>
        )}
      </div>
      {value.length === 0 && <div style={{ fontSize: 12.5, color: c.text }}>No checklist items added.</div>}
      <style>{`
        .ck-row input[type=checkbox]{width:15px;height:15px;accent-color:${c.ocean}}
        @media (max-width: 640px){ .ck-row{grid-template-columns:32px minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) 32px !important} }
      `}</style>
    </div>
  );
};

const ck = {
  table: { border: `1px solid ${c.border}`, borderRadius: 10, overflow: "hidden", background: c.white },
  row: { display: "grid", gridTemplateColumns: "44px minmax(0,1.6fr) minmax(0,1.2fr) minmax(0,1.2fr) 44px", borderBottom: `1px solid ${c.border}`, minHeight: 40, alignItems: "stretch" },
  head: { background: "#F5F7F9", fontSize: 12.5, color: c.muted, fontWeight: 600 },
  cell: { display: "flex", alignItems: "center", padding: "0 6px", borderLeft: `1px solid ${c.border}`, minWidth: 0 },
  cellBox: { display: "flex", alignItems: "center", justifyContent: "center", borderLeft: `1px solid ${c.border}` },
  input: { width: "100%", minWidth: 0, height: 34, border: 0, outline: "none", background: "transparent", fontSize: 13, color: c.text, padding: "0 4px" },
  iconBtn: { border: 0, background: "transparent", color: c.muted, cursor: "pointer", fontSize: 14 },
  btn: { border: 0, borderRadius: 8, padding: "6px 12px", background: "#F0F2F4", color: c.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
};

/** Checklist on the task card: tick Check rows, answer Text / Number rows. */
export const ChecklistView = ({ taskId, items, canAnswer, onChanged }) => {
  const [busy, setBusy] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState("");
  if (!items?.length) return null;
  const done = items.filter((i) => i.done).length;

  const save = async (item, body) => {
    setBusy(item._id);
    setError("");
    try {
      await API.patch(`/api/tasks/${taskId}/checklist/${item._id}`, body);
      onChanged?.();
    } catch (err) {
      setError(errorText(err, "Could not update the checklist."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={cv.wrap}>
      <div style={cv.head}>
        Checklist <b>{done}/{items.length}</b>
        <span style={cv.bar}><i style={{ ...cv.fill, width: `${Math.round((done / items.length) * 100)}%` }} /></span>
      </div>
      {items.map((item) => (
        <div key={item._id} style={cv.row}>
          {item.type === "Check" ? (
            <input
              type="checkbox"
              checked={item.done}
              disabled={!canAnswer(item) || busy === item._id}
              onChange={(e) => save(item, { done: e.target.checked })}
              aria-label={item.desc}
              style={{ width: 15, height: 15, accentColor: c.ocean }}
            />
          ) : (
            <span style={{ ...cv.dot, background: item.done ? c.ocean : c.border }} aria-hidden="true" />
          )}
          <span style={{ flex: 1, minWidth: 0, textDecoration: item.type === "Check" && item.done ? "line-through" : "none", color: item.done ? c.muted : c.text }}>
            {item.desc}
            {item.employee?.name && <span style={cv.emp}> · {item.employee.name}</span>}
          </span>
          {item.type !== "Check" &&
            (canAnswer(item) ? (
              <input
                value={drafts[item._id] ?? item.value}
                inputMode={item.type === "Number" ? "decimal" : "text"}
                placeholder={item.type === "Number" ? "Number" : "Answer"}
                onChange={(e) => setDrafts((d) => ({ ...d, [item._id]: e.target.value }))}
                onBlur={() => drafts[item._id] !== undefined && drafts[item._id] !== item.value && save(item, { value: drafts[item._id] })}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                disabled={busy === item._id}
                aria-label={`Answer for ${item.desc}`}
                style={cv.answer}
              />
            ) : (
              <span style={{ fontSize: 12, color: c.navy, fontWeight: 700 }}>{item.value || "—"}</span>
            ))}
          {busy === item._id && <Loader2 size={12} className="tfx-spin" color={c.muted} />}
        </div>
      ))}
      {error && <div style={{ fontSize: 11.5, color: c.danger }}>{error}</div>}
      <style>{`.tfx-spin{animation:tfxSpin 1s linear infinite}@keyframes tfxSpin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
};

const cv = {
  wrap: { display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: 12, border: `1px solid ${c.border}`, background: "#F9FCFD" },
  head: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: c.navy },
  bar: { flex: 1, maxWidth: 160, height: 6, borderRadius: 999, background: "#E3EFF3", overflow: "hidden", display: "inline-block" },
  fill: { display: "block", height: "100%", background: c.ocean, borderRadius: 999 },
  row: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginLeft: 4 },
  emp: { color: c.muted, fontSize: 11.5 },
  answer: { width: 120, height: 28, padding: "0 8px", borderRadius: 7, border: `1px solid ${c.border}`, fontSize: 12, outline: "none" },
};
