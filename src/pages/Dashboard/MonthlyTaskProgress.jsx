import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarRange, CheckSquare, Hash, Loader2, Target, X, AlertCircle, Check } from "lucide-react";
import API from "../../api/config";

/* =========================================================
   Monthly Task
   MonthlyTaskFields   → settings block in the Create / Edit Task form
   MonthlySummaryChip  → "Oct 2026 · 35 / 100 (35%)" on the task card
   MonthlyProgressModal→ every date of the month; the assignee fills in their own counts
   Backend: GET /api/tasks/:id/monthly, PUT /api/tasks/:id/monthly/:date
   The assigned user adds only TODAY's count; the task's creator can correct earlier days
   (the server checks both from the login token).
========================================================= */

const c = {
  navy: "#123B5D",
  ocean: "#16A6B8",
  oceanDark: "#08798C",
  oceanSoft: "#E7F8FA",
  border: "#D5E7EE",
  muted: "#6E8799",
  text: "#16344D",
  white: "#FFFFFF",
  danger: "#B42318",
  dangerSoft: "#FEF3F2",
  success: "#0F8A5F",
  successSoft: "#E8F7F0",
};

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n) => String(n).padStart(2, "0");
const localISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shortDate = (iso, withYear = false) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "short", ...(withYear ? { year: "numeric" } : {}) });

export const daysInRange = (start, end) =>
  start && end && end >= start ? Math.round((new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000) + 1 : 0;

// "01 Oct – 31 Oct 2026" (older tasks without dates → their month)
export const monthLabel = (m) => {
  if (!m) return "";
  if (m.startDate && m.endDate) return `${shortDate(m.startDate)} – ${shortDate(m.endDate, true)}`;
  return `${MONTH_NAMES[m.month - 1]} ${m.year}`;
};

// New Monthly Task: today → last day of this month
export const defaultMonthlyConfig = () => {
  const now = new Date();
  return {
    startDate: localISO(now),
    endDate: localISO(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    target: "",
    trackingMethod: "number",
    unitPerCheck: 1,
  };
};

const isWhole = (v) => /^\d+$/.test(String(v ?? "").trim());

// Client-side check, same rules as the backend (services/monthlyTaskService.js)
export const validateMonthlyConfig = (m) => {
  if (!m?.startDate) return "Select the starting date.";
  if (!m?.endDate) return "Select the end date.";
  if (m.endDate < m.startDate) return "End date cannot be before the starting date.";
  if (daysInRange(m.startDate, m.endDate) > 366) return "The task can cover at most 366 days.";
  if (!isWhole(m.target) || Number(m.target) < 1) return "Enter a monthly target greater than 0 (whole number).";
  if (m.trackingMethod === "checkbox" && (!isWhole(m.unitPerCheck) || Number(m.unitPerCheck) < 1)) {
    return "Units per ticked day must be a whole number of at least 1.";
  }
  return "";
};

/* ---------------- Form block ---------------- */

export const MonthlyTaskFields = ({ value, onChange, isEdit = false }) => {
  const set = (patch) => onChange({ ...value, ...patch });
  const totalDays = daysInRange(value.startDate, value.endDate);

  return (
    <div style={fs.card}>
      <div style={fs.head}>
        <Target size={15} />
        <strong>Monthly target</strong>
        <span style={fs.headHint}>Each assigned user adds their own count every day.</span>
      </div>

      <div className="mt-grid" style={fs.grid}>
        <label style={fs.field}>
          <span style={fs.label}>Starting date <b style={fs.star}>*</b></span>
          <input
            type="date"
            value={value.startDate}
            onChange={(e) => set({ startDate: e.target.value })}
            style={fs.input}
          />
        </label>

        <label style={fs.field}>
          <span style={fs.label}>End date <b style={fs.star}>*</b></span>
          <input
            type="date"
            value={value.endDate}
            min={value.startDate || undefined}
            onChange={(e) => set({ endDate: e.target.value })}
            style={fs.input}
          />
        </label>

        <label style={fs.field}>
          <span style={fs.label}>Monthly target count <b style={fs.star}>*</b></span>
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={value.target}
            onChange={(e) => set({ target: e.target.value })}
            placeholder="e.g. 100"
            style={fs.input}
          />
        </label>
      </div>

      <div style={fs.field}>
        <span style={fs.label}>Daily tracking method</span>
        <div className="mt-methods" style={fs.methods}>
          {[
            { key: "number", icon: Hash, title: "Number", text: "Enter how many were completed each day" },
            { key: "checkbox", icon: CheckSquare, title: "Checkbox", text: "Tick the day when the daily work is done" },
          ].map(({ key, icon: Icon, title, text }) => {
            const active = value.trackingMethod === key;
            return (
              <button
                key={key}
                type="button"
                disabled={isEdit}
                onClick={() => set({ trackingMethod: key })}
                aria-pressed={active}
                style={{
                  ...fs.method,
                  borderColor: active ? c.ocean : c.border,
                  background: active ? c.oceanSoft : c.white,
                  cursor: isEdit ? "not-allowed" : "pointer",
                  opacity: isEdit && !active ? 0.55 : 1,
                }}
              >
                <Icon size={16} color={active ? c.oceanDark : c.muted} />
                <span>
                  <strong style={{ display: "block", fontSize: 12.5, color: c.navy }}>{title}</strong>
                  <span style={{ fontSize: 11, color: c.muted }}>{text}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {value.trackingMethod === "checkbox" && (
        <label style={{ ...fs.field, maxWidth: 260 }}>
          <span style={fs.label}>Units per ticked day</span>
          <input
            type="number"
            min="1"
            step="1"
            value={value.unitPerCheck}
            onChange={(e) => set({ unitPerCheck: e.target.value })}
            disabled={isEdit}
            style={fs.input}
          />
        </label>
      )}

      <p style={fs.note}>
        {totalDays ? `${totalDays} day${totalDays === 1 ? "" : "s"} tracked · due on the end date. ` : ""}
        Days with no entry count as 0. Assigned users add only today's count; you (the creator) can correct earlier days.
        {isEdit ? " The tracking method can't change once the task exists." : ""}
      </p>

      <style>{`
        @media (max-width: 640px) {
          .mt-grid { grid-template-columns: 1fr 1fr !important; }
          .mt-grid > label { min-width: 0; }
          .mt-grid > label:last-child { grid-column: 1 / -1; }
          .mt-methods { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};

const fs = {
  card: { display: "flex", flexDirection: "column", gap: 12, padding: 14, borderRadius: 14, border: `1px solid ${c.border}`, background: "#F7FCFD" },
  head: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, color: c.navy, fontSize: 13 },
  headHint: { fontSize: 11, color: c.muted, fontWeight: 500 },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
  field: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 },
  label: { fontSize: 12, fontWeight: 700, color: c.navy },
  star: { color: c.danger },
  input: { width: "100%", boxSizing: "border-box", minWidth: 0, height: 40, padding: "0 12px", borderRadius: 10, border: `1px solid ${c.border}`, background: c.white, color: c.text, fontSize: 13 },
  methods: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  method: { display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 12, border: "1px solid", textAlign: "left" },
  note: { margin: 0, fontSize: 11, color: c.muted },
};

/* ---------------- Card chip ---------------- */

export const MonthlySummaryChip = ({ monthly, onClick, label }) => {
  if (!monthly) return null;
  return (
    <button type="button" onClick={onClick} style={chip.wrap} title="Open daily progress">
      <CalendarRange size={12} />
      <span>{monthLabel(monthly)}</span>
      <span style={chip.sep}>·</span>
      <strong>{label ?? `${monthly.totalCompleted} / ${monthly.target}`}</strong>
      {label === undefined && <span>({monthly.percent}%)</span>}
    </button>
  );
};

const chip = {
  wrap: { display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${c.ocean}55`, background: c.oceanSoft, color: c.oceanDark, borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" },
  sep: { opacity: 0.5 },
};

/* ---------------- Daily progress window ---------------- */

const weekday = (date) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" });

const errorText = (err, fallback) => err?.response?.data?.message || err?.message || fallback;

/**
 * members: every person's copy of the task ({ id, assignedUser }) — one tab each.
 * The data of each tab comes only from that person's own copy.
 */
export const MonthlyProgressModal = ({ members, initialId, onClose, onChanged }) => {
  const [activeId, setActiveId] = useState(initialId || members[0]?.id);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [drafts, setDrafts] = useState({}); // date → { count, remarks }
  const [rowState, setRowState] = useState({}); // date → "saving" | "saved" | error text

  const load = useCallback(async (id) => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await API.get(`/api/tasks/${id}/monthly`);
      setData(res.data.data);
      setDrafts({});
      setRowState({});
    } catch (err) {
      setData(null);
      setLoadError(errorText(err, "Unable to load the daily progress."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(activeId);
  }, [activeId, load]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const monthly = data?.monthly;
  const isCheckbox = monthly?.trackingMethod === "checkbox";
  const canEdit = Boolean(data?.canEdit);
  // assignee → today only; creator → any day up to today
  const editMode = data?.editMode || (canEdit ? "today" : "none");
  const rowEditable = (date) =>
    editMode === "creator" ? date <= data.today : editMode === "today" ? date === data.today : false;

  const draftOf = (day) => drafts[day.date] || { count: String(day.count), remarks: day.remarks };

  const saveDay = async (day, patch) => {
    const draft = { ...draftOf(day), ...patch };
    const body = { remarks: draft.remarks || "" };
    if (isCheckbox) {
      body.checked = Boolean(patch.checked ?? day.checked);
    } else {
      if (!isWhole(draft.count)) {
        setRowState((s) => ({ ...s, [day.date]: "Enter a whole number (0 or more)." }));
        return;
      }
      body.count = Number(draft.count);
      // nothing changed → no request
      if (body.count === day.count && body.remarks === (day.remarks || "") && day.entered) return;
      if (body.count === 0 && !body.remarks && !day.entered) {
        setDrafts((d) => ({ ...d, [day.date]: undefined }));
        return;
      }
    }

    setRowState((s) => ({ ...s, [day.date]: "saving" }));
    try {
      const res = await API.put(`/api/tasks/${activeId}/monthly/${day.date}`, body);
      setData(res.data.data); // fresh totals straight from the server
      setDrafts((d) => {
        const next = { ...d };
        delete next[day.date];
        return next;
      });
      setRowState((s) => ({ ...s, [day.date]: "saved" }));
      setTimeout(() => setRowState((s) => (s[day.date] === "saved" ? { ...s, [day.date]: undefined } : s)), 1500);
      onChanged?.();
    } catch (err) {
      setRowState((s) => ({ ...s, [day.date]: errorText(err, "Could not save.") }));
    }
  };

  // open at today's row (the one an assignee fills in)
  const todayInRange = Boolean(data?.days?.some((d) => d.date === data.today));
  useEffect(() => {
    if (!todayInRange) return;
    document.getElementById(`mt-day-${data.today}`)?.scrollIntoView({ block: "center" });
  }, [activeId, todayInRange, data?.today]);

  const enteredDays = useMemo(() => (data?.days || []).filter((d) => d.entered).length, [data]);

  return createPortal(
    <div style={m.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={m.dialog} role="dialog" aria-modal="true" aria-label="Monthly task progress">
        <div style={m.header}>
          <div style={{ minWidth: 0 }}>
            <div style={m.kicker}><CalendarRange size={13} /> Monthly Task · {monthLabel(monthly) || "…"}</div>
            <h2 style={m.title}>{data?.task?.name || members.find((x) => x.id === activeId)?.name || "Monthly task"}</h2>
            {data?.task && (
              <div style={m.sub}>
                Assigned to <b>{data.task.assignedUser || "—"}</b>
                {data.task.assignedByName ? <> · by {data.task.assignedByName}</> : null}
                {data.task.department ? <> · {data.task.department}</> : null}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} style={m.close} aria-label="Close"><X size={18} /></button>
        </div>

        {members.length > 1 && (
          <div style={m.tabs} role="tablist" aria-label="Assigned users">
            {members.map((mem) => (
              <button
                key={mem.id}
                type="button"
                role="tab"
                aria-selected={mem.id === activeId}
                onClick={() => setActiveId(mem.id)}
                style={{ ...m.tab, ...(mem.id === activeId ? m.tabOn : {}) }}
              >
                {mem.assignedUser || "Unassigned"}
                {mem.monthly ? <span style={{ opacity: 0.75 }}> · {mem.monthly.percent}%</span> : null}
              </button>
            ))}
          </div>
        )}

        <div style={m.body}>
          {loading && !data ? (
            <div style={m.center}><Loader2 size={20} className="mt-spin" /> Loading daily progress…</div>
          ) : loadError ? (
            <div style={m.errorBox}><AlertCircle size={15} /> {loadError}</div>
          ) : data ? (
            <>
              <div className="mt-summary" style={m.summary}>
                {[
                  ["Monthly target", monthly.target],
                  ["Total completed", monthly.totalCompleted],
                  ["Remaining", monthly.remaining],
                  ["Completion", `${monthly.percent}%`],
                ].map(([k, v]) => (
                  <div key={k} style={m.stat}>
                    <span style={m.statLabel}>{k}</span>
                    <strong style={m.statValue}>{v}</strong>
                  </div>
                ))}
              </div>
              <div style={m.bar} aria-label={`${monthly.percent}% of the target`}>
                <i style={{ ...m.barFill, width: `${monthly.percent}%` }} />
              </div>
              <div style={m.info}>
                {isCheckbox
                  ? `Checkbox tracking — each ticked day adds ${monthly.unitPerCheck} to the total.`
                  : "Number tracking — enter how many were completed each day."}{" "}
                {enteredDays} of {data.days.length} days filled in; empty days count as 0.{" "}
                {editMode === "today"
                  ? "You can add today's count. Earlier days can only be corrected by the task's creator."
                  : editMode === "creator"
                    ? "As the task's creator you can correct any day up to today."
                    : "You can view this progress; only the assigned user (today) and the task's creator can change it."}
              </div>

              <div style={m.tableWrap}>
                <table style={m.table}>
                  <thead>
                    <tr>
                      <th style={m.th}>Date</th>
                      <th style={m.th}>{isCheckbox ? "Done" : "Completed"}</th>
                      <th style={{ ...m.th, width: "45%" }}>Remarks</th>
                      <th style={{ ...m.th, width: 90 }} aria-label="Save status" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.map((day) => {
                      const future = day.date > data.today;
                      const editable = rowEditable(day.date);
                      const draft = draftOf(day);
                      const state = rowState[day.date];
                      const isToday = day.date === data.today;
                      return (
                        <tr key={day.date} id={`mt-day-${day.date}`} style={{ background: isToday ? "#F2FBFC" : undefined, opacity: future ? 0.55 : 1 }}>
                          <td style={m.td}>
                            <span style={{ fontWeight: 700, color: c.navy }}>{weekday(day.date)}</span>
                            {isToday && <span style={m.todayTag}>Today</span>}
                          </td>
                          <td style={m.td}>
                            {isCheckbox ? (
                              <input
                                type="checkbox"
                                checked={day.checked}
                                disabled={!editable || state === "saving"}
                                onChange={(e) => saveDay(day, { checked: e.target.checked })}
                                aria-label={`Done on ${day.date}`}
                                style={{ width: 18, height: 18, accentColor: c.ocean }}
                              />
                            ) : editable ? (
                              <input
                                type="number"
                                min="0"
                                step="1"
                                inputMode="numeric"
                                value={draft.count}
                                onChange={(e) => setDrafts((d) => ({ ...d, [day.date]: { ...draft, count: e.target.value } }))}
                                onBlur={() => drafts[day.date] && saveDay(day, {})}
                                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                                aria-label={`Completed on ${day.date}`}
                                style={m.countInput}
                              />
                            ) : (
                              <span style={{ fontWeight: 800, color: day.count ? c.navy : c.muted }}>{day.count}</span>
                            )}
                            {!day.entered && !future && !editable && day.date < data.today && <span style={m.muted}> not entered</span>}
                          </td>
                          <td style={m.td}>
                            {editable ? (
                              <input
                                type="text"
                                maxLength={500}
                                value={draft.remarks}
                                placeholder="Optional"
                                onChange={(e) => setDrafts((d) => ({ ...d, [day.date]: { ...draft, remarks: e.target.value } }))}
                                onBlur={() => drafts[day.date] && saveDay(day, {})}
                                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                                aria-label={`Remarks for ${day.date}`}
                                style={m.remarksInput}
                              />
                            ) : (
                              <span style={{ color: day.remarks ? c.text : c.muted, fontSize: 12 }}>{day.remarks || "—"}</span>
                            )}
                          </td>
                          <td style={m.td}>
                            {state === "saving" && <span style={m.muted}><Loader2 size={12} className="mt-spin" /> Saving</span>}
                            {state === "saved" && <span style={{ color: c.success, fontSize: 11, fontWeight: 700 }}><Check size={12} /> Saved</span>}
                            {state && state !== "saving" && state !== "saved" && (
                              <span style={{ color: c.danger, fontSize: 11 }} role="alert">{state}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      </div>
      <style>{`
        .mt-spin { animation: mtSpin 1s linear infinite; vertical-align: -2px; }
        @keyframes mtSpin { to { transform: rotate(360deg); } }
        @media (max-width: 640px) { .mt-summary { grid-template-columns: 1fr 1fr !important; } }
      `}</style>
    </div>,
    document.body
  );
};

const m = {
  overlay: { position: "fixed", inset: 0, zIndex: 11000, background: "rgba(8,42,69,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  dialog: { width: "min(860px, 100%)", maxHeight: "calc(100vh - 32px)", display: "flex", flexDirection: "column", background: c.white, borderRadius: 18, boxShadow: "0 30px 80px rgba(8,42,69,.3)", overflow: "hidden" },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "16px 18px 12px", borderBottom: `1px solid ${c.border}` },
  kicker: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: c.oceanDark },
  title: { margin: "4px 0 2px", fontSize: 18, color: c.navy, overflowWrap: "anywhere" },
  sub: { fontSize: 12, color: c.muted },
  close: { border: 0, background: "transparent", color: c.muted, cursor: "pointer", padding: 4, flexShrink: 0 },
  tabs: { display: "flex", gap: 6, padding: "10px 18px 0", overflowX: "auto" },
  tab: { flexShrink: 0, border: `1px solid ${c.border}`, background: c.white, color: c.muted, borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  tabOn: { background: c.navy, borderColor: c.navy, color: c.white },
  body: { padding: "14px 18px 18px", overflowY: "auto" },
  center: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 40, color: c.muted },
  errorBox: { display: "flex", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, background: c.dangerSoft, color: c.danger, fontSize: 13 },
  summary: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 },
  stat: { padding: "10px 12px", borderRadius: 12, background: "#F7FCFD", border: `1px solid ${c.border}` },
  statLabel: { display: "block", fontSize: 10.5, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: c.muted },
  statValue: { display: "block", marginTop: 2, fontSize: 22, color: c.navy },
  bar: { height: 8, marginTop: 12, borderRadius: 999, background: "#E3EFF3", overflow: "hidden" },
  barFill: { display: "block", height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${c.ocean}, ${c.oceanDark})`, transition: "width .4s ease" },
  info: { margin: "10px 0 12px", fontSize: 12, color: c.muted },
  tableWrap: { border: `1px solid ${c.border}`, borderRadius: 12, overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 520 },
  th: { textAlign: "left", padding: "9px 10px", background: "#F2F8FA", color: c.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", borderBottom: `1px solid ${c.border}`, position: "sticky", top: 0 },
  td: { padding: "7px 10px", borderBottom: `1px solid #EEF5F7`, verticalAlign: "middle" },
  todayTag: { marginLeft: 6, padding: "1px 6px", borderRadius: 999, background: c.ocean, color: c.white, fontSize: 9.5, fontWeight: 800 },
  countInput: { width: 90, height: 32, padding: "0 8px", borderRadius: 8, border: `1px solid ${c.border}`, fontSize: 13, color: c.text },
  remarksInput: { width: "100%", boxSizing: "border-box", height: 32, padding: "0 8px", borderRadius: 8, border: `1px solid ${c.border}`, fontSize: 12.5, color: c.text },
  muted: { color: c.muted, fontSize: 11 },
};
