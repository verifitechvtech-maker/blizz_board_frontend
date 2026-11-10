import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users, Search, RefreshCw, Download, Loader2, AlertTriangle, ChevronRight, ChevronDown, X, Award, Clock3,
  CalendarDays, CheckCircle2, RotateCcw, ListChecks, Paperclip, MessageSquare, Star, TrendingUp, UserRound,
} from "lucide-react";
import API from "../../api/config";
import { Pagination, usePagination } from "../../components/Pagination";

/* =========================================================
   Individual reports — one row per person (assigned, completed,
   pending, in progress, overdue, completion & on-time rate).
   Data: GET /api/reports/individual (organization-scoped).
========================================================= */

const DATE_RANGES = ["All time", "Today", "Last 7 days", "Last 30 days", "This month", "Last month", "This year"];

const pct = (n) => (n === null || n === undefined ? "—" : `${n}%`);

const fmtDate = (v) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (v) =>
  v
    ? new Date(v).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

const TIMELINESS = {
  on_time: { label: "On time", cls: "good" },
  late: { label: "Completed late", cls: "bad" },
  overdue: { label: "Overdue", cls: "bad" },
  in_time: { label: "Within deadline", cls: "info" },
  no_deadline: { label: "No deadline", cls: "muted" },
};

const COMMENT_LABEL = { comment: "Comment", submitted: "Sent for review", completed: "Approved", rework: "Rework requested" };

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const downloadCsv = (filename, rows) => {
  const url = URL.createObjectURL(new Blob(["\ufeff" + rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// One task in a person's report — summary line, expands to every detail
// Fill in fields an older server does not send, so the report never breaks
const withDefaults = (t) => ({
  ...t,
  subtasks: t.subtasks && typeof t.subtasks === "object" && !Array.isArray(t.subtasks) ? t.subtasks : { done: 0, total: 0 },
  checklist: t.checklist && typeof t.checklist === "object" && !Array.isArray(t.checklist) ? t.checklist : { done: 0, total: 0 },
  attachments: typeof t.attachments === "number" ? t.attachments : Array.isArray(t.attachments) ? t.attachments.length : 0,
  comments: Array.isArray(t.comments) ? t.comments : [],
  history: Array.isArray(t.history) ? t.history : [],
  departments: Array.isArray(t.departments) ? t.departments : t.department ? [t.department] : [],
  timeliness: t.timeliness || "no_deadline",
  daysTaken: t.daysTaken ?? null,
});

const TaskReportCard = ({ t }) => {
  const [open, setOpen] = useState(false);
  const tl = TIMELINESS[t.timeliness] || TIMELINESS.no_deadline;
  const took =
    t.status === "Completed"
      ? t.timeTaken
        ? `Took ${t.timeTaken}${t.daysTaken !== null ? ` (${t.daysTaken} day${t.daysTaken === 1 ? "" : "s"})` : ""}`
        : "Completed"
      : t.openFor
        ? `Open for ${t.openFor}`
        : "";
  return (
    <div className={`ir-task ${open ? "open" : ""}`}>
      <button type="button" className="ir-task-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`ir-status s-${String(t.status).replace(/\s/g, "").toLowerCase()}`}>{t.status}</span>
        <span className="ir-task-name">
          {t.referenceId && <em>#{t.referenceId}</em>} {t.name}
        </span>
        <ChevronDown size={14} className="ir-chev" />
        <span className="ir-task-sub">
          <span><CalendarDays size={11} /> {fmtDate(t.plannedStart || t.assignedAt)} → {fmtDate(t.deadline || t.dueDate)}</span>
          {took && <span className="strong"><Clock3 size={11} /> {took}</span>}
          <span className={`ir-pill ${tl.cls}`}>
            {tl.label}
            {t.lateBy ? ` · ${t.lateBy}` : t.earlyBy ? ` · ${t.earlyBy} early` : ""}
          </span>
          {t.reviewScore ? <span className="ir-pill good"><Star size={10} /> {t.reviewScore}/10</span> : null}
          {t.reworkCount ? <span className="ir-pill warn"><RotateCcw size={10} /> {t.reworkCount} rework</span> : null}
        </span>
      </button>

      {open && (
        <div className="ir-task-body">
          {t.description && <p className="ir-desc">{t.description}</p>}
          <div className="ir-grid">
            {[
              ["Task ID", t.referenceId ? `#${t.referenceId}` : "—"],
              ["Type", t.taskType === "rework" ? "Rework" : t.taskType === "monthly" ? "Monthly" : "Standard"],
              ["Priority", t.priority || "—"],
              ["Department", t.departments?.join(", ") || "—"],
              ["Assigned by", t.assignedByName || "—"],
              ["Assigned on", fmtDateTime(t.assignedAt)],
              ["Planned start", fmtDateTime(t.plannedStart)],
              ["Deadline", fmtDateTime(t.deadline)],
              ["Planned duration", t.plannedTime || "—"],
              ["Started work", fmtDateTime(t.startedAt)],
              ["Sent for review", fmtDateTime(t.submittedAt)],
              ["Completed on", fmtDateTime(t.completedAt)],
              ["Days taken", t.daysTaken !== null ? `${t.daysTaken} day${t.daysTaken === 1 ? "" : "s"} (${t.timeTaken})` : t.openFor ? `Still open · ${t.openFor}` : "—"],
              ["Working time", t.workTime ? `${t.workTime} (start → done)` : "—"],
              ["On time?", `${tl.label}${t.lateBy ? ` by ${t.lateBy}` : t.earlyBy ? ` · ${t.earlyBy} early` : ""}`],
              ["Review score", t.reviewScore ? `${t.reviewScore}/10 · +${t.points} points` : "—"],
              ["Reworks", String(t.reworkCount || 0)],
            ].map(([k, v]) => (
              <div key={k}><span>{k}</span><strong>{v}</strong></div>
            ))}
          </div>

          <div className="ir-chips">
            <span><ListChecks size={12} /> Subtasks {t.subtasks.done}/{t.subtasks.total}</span>
            <span><CheckCircle2 size={12} /> Checklist {t.checklist.done}/{t.checklist.total}</span>
            <span><Paperclip size={12} /> {t.attachments} attachment{t.attachments === 1 ? "" : "s"}</span>
            <span><MessageSquare size={12} /> {t.comments.length} comment{t.comments.length === 1 ? "" : "s"}</span>
          </div>

          {t.history.length > 0 && (
            <>
              <h5>Status timeline</h5>
              <ol className="ir-timeline">
                {t.history.map((h, i) => (
                  <li key={i}>
                    <strong>{h.from ? `${h.from} → ${h.to}` : h.to}</strong>
                    <span>{fmtDateTime(h.at)}{h.byName ? ` · ${h.byName}` : ""}</span>
                    {h.note && <em>{h.note}</em>}
                  </li>
                ))}
              </ol>
            </>
          )}

          {t.comments.length > 0 && (
            <>
              <h5>Comments</h5>
              <div className="ir-comments">
                {t.comments.map((c, i) => (
                  <div key={i} className={`ir-comment c-${c.decision}`}>
                    <div>
                      <strong>{c.byName || "Someone"}</strong> · {COMMENT_LABEL[c.decision] || "Comment"}
                      {c.score ? ` · ${c.score}/10` : ""} <span>{fmtDateTime(c.at)}</span>
                    </div>
                    <p>{c.text}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const IndividualReports = () => {
  const [filters, setFilters] = useState({ dateRange: "All time", department: "All Departments", role: "All Roles", userId: "" });
  const [search, setSearch] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [departments, setDepartments] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selected, setSelected] = useState(null); // person detail
  const [detail, setDetail] = useState(null);
  const [personSummary, setPersonSummary] = useState(null);
  const [taskFilter, setTaskFilter] = useState("All");
  const [taskSearch, setTaskSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = { ...filters };
      if (!params.userId) delete params.userId;
      const res = await API.get("/api/reports/individual", { params });
      setData(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load individual reports.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  // filter options from the backend
  useEffect(() => {
    API.get("/api/departments").then((r) => setDepartments((r.data.data || []).map((d) => d.name))).catch(() => {});
    API.get("/api/custom-roles").then((r) => setRoles(r.data.data || [])).catch(() => {});
  }, []);

  const openPerson = async (person) => {
    setSelected(person);
    setDetail(null);
    setPersonSummary(null);
    setTaskFilter("All");
    setTaskSearch("");
    try {
      const params = { ...filters, userId: person.userId };
      const res = await API.get("/api/reports/individual", { params });
      setDetail((res.data.data.tasks || []).map(withDefaults));
      setPersonSummary(res.data.data.personSummary || null);
    } catch {
      setDetail([]);
    }
  };

  const shownTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase();
    return (detail || []).filter((t) => {
      if (taskFilter === "Overdue" ? t.timeliness !== "overdue" : taskFilter === "Late" ? t.timeliness !== "late" : taskFilter !== "All" && t.status !== taskFilter) return false;
      return !q || `${t.referenceId} ${t.name} ${t.description} ${t.departments?.join(" ")}`.toLowerCase().includes(q);
    });
  }, [detail, taskFilter, taskSearch]);

  // Every task of this person with all its details → CSV
  const exportPersonCsv = () => {
    if (!selected || !detail) return;
    const header = [
      "Task ID", "Task name", "Description", "Type", "Priority", "Department", "Status", "Assigned by",
      "Assigned on", "Planned start", "Deadline", "Planned duration", "Started work", "Sent for review", "Completed on",
      "Days taken", "Time taken", "Working time", "Still open for", "On time?", "Late by", "Early by",
      "Review score", "Points", "Reworks", "Subtasks done", "Checklist done", "Attachments", "Comments",
    ];
    const rows = detail.map((t) => [
      t.referenceId, t.name, t.description, t.taskType, t.priority, t.departments?.join(", "), t.status, t.assignedByName,
      fmtDateTime(t.assignedAt), fmtDateTime(t.plannedStart), fmtDateTime(t.deadline), t.plannedTime, fmtDateTime(t.startedAt),
      fmtDateTime(t.submittedAt), fmtDateTime(t.completedAt), t.daysTaken ?? "", t.timeTaken, t.workTime,
      t.status === "Completed" ? "" : t.openFor, (TIMELINESS[t.timeliness] || {}).label, t.lateBy, t.earlyBy,
      t.reviewScore ?? "", t.points, t.reworkCount, `${t.subtasks.done}/${t.subtasks.total}`,
      `${t.checklist.done}/${t.checklist.total}`, t.attachments,
      t.comments.map((c) => `${c.byName} (${COMMENT_LABEL[c.decision] || "Comment"}): ${c.text}`).join(" | "),
    ]);
    const safeName = String(selected.name || "person").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    downloadCsv(`report-${safeName}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

  const people = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.people || []).filter((p) => !q || `${p.name} ${p.email} ${p.department} ${p.roleLabel}`.toLowerCase().includes(q));
  }, [data, search]);

  const peoplePage = usePagination(people, { id: "individual-reports", resetKey: `${search}|${JSON.stringify(filters)}` });

  const exportCsv = () => {
    const header = ["Name", "Email", "Department", "Role", "Assigned", "Completed", "In progress", "Pending", "Review", "Overdue", "Completion %", "On-time %", "Avg completion (h)", "Avg days to complete", "Points"];
    const lines = people.map((p) =>
      [p.name, p.email, p.department, p.roleLabel, p.assigned, p.completed, p.inProgress, p.pending, p.review, p.overdue, p.completionRate, p.onTimeRate ?? "", p.avgCompletionHours ?? "", p.avgCompletionDays ?? "", p.pointsEarned]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const url = URL.createObjectURL(new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `individual-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const totals = data?.totals;

  return (
    <div className="individual-reports">
      <section className="configuration-card ir-filters">
        <div className="ir-filter-grid">
          <label>
            <span>Date range</span>
            <select value={filters.dateRange} onChange={set("dateRange")}>
              {DATE_RANGES.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          <label>
            <span>Department</span>
            <select value={filters.department} onChange={set("department")}>
              <option>All Departments</option>
              {departments.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          <label>
            <span>Role</span>
            <select value={filters.role} onChange={set("role")}>
              <option>All Roles</option>
              <option value="Manager">Manager</option>
              <option value="User">Team Member</option>
              {roles.map((r) => <option key={r._id} value={`custom:${r._id}`}>{r.name}</option>)}
            </select>
          </label>
          <label>
            <span>Person</span>
            <select value={filters.userId} onChange={set("userId")}>
              <option value="">Everyone</option>
              {(data?.people || []).map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
            </select>
          </label>
          <label className="ir-search">
            <span>Search</span>
            <div>
              <Search size={14} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, department…" />
            </div>
          </label>
          <div className="ir-actions">
            <button type="button" className="ir-btn" onClick={load} disabled={loading} title="Refresh">
              <RefreshCw size={14} className={loading ? "ir-spin" : ""} />
            </button>
            <button type="button" className="ir-btn primary" onClick={exportCsv} disabled={!people.length}>
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>
      </section>

      {totals && (
        <section className="ir-kpis">
          {[
            ["People", totals.people],
            ["Assigned", totals.assigned],
            ["Completed", `${totals.completed} (${totals.completionRate}%)`],
            ["In progress", totals.inProgress],
            ["Pending", totals.pending],
            ["Overdue", totals.overdue],
          ].map(([label, value]) => (
            <div className="ir-kpi" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </section>
      )}

      <section className="table-card ir-table-card">
        <div className="ir-table-head">
          <h3><Users size={16} /> Individual performance</h3>
          <span>{people.length} {people.length === 1 ? "person" : "people"}</span>
        </div>

        {error ? (
          <div className="ir-state error"><AlertTriangle size={16} /> {error}</div>
        ) : loading && !data ? (
          <div className="ir-state"><Loader2 size={16} className="ir-spin" /> Loading…</div>
        ) : !people.length ? (
          <div className="ir-state">No people match these filters.</div>
        ) : (
          <div className="ir-table-wrap">
            <table className="ir-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Assigned</th>
                  <th>Completed</th>
                  <th>In progress</th>
                  <th>Pending</th>
                  <th>Overdue</th>
                  <th>Completion</th>
                  <th>On time</th>
                  <th>Avg days</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {peoplePage.items.map((p) => (
                  <tr key={p.userId} onClick={() => openPerson(p)}>
                    <td>
                      <strong>{p.name}</strong>
                      <small>{p.department || "No department"}</small>
                    </td>
                    <td>{p.roleLabel}</td>
                    <td>{p.assigned}</td>
                    <td className="good">{p.completed}</td>
                    <td>{p.inProgress}</td>
                    <td>{p.pending}</td>
                    <td className={p.overdue ? "bad" : ""}>{p.overdue}</td>
                    <td>
                      <div className="ir-bar"><span style={{ width: `${p.completionRate}%` }} /></div>
                      <small>{p.completionRate}%</small>
                    </td>
                    <td>{pct(p.onTimeRate)}</td>
                    <td>{p.avgCompletionDays ?? "—"}</td>
                    <td><ChevronRight size={14} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination {...peoplePage} label="people" />
          </div>
        )}
      </section>

      {selected && (
        <div className="ir-overlay" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}>
          <aside className="ir-drawer" role="dialog" aria-label={`Report for ${selected.name}`}>
            <div className="ir-drawer-head">
              <div>
                <h3>{selected.name}</h3>
                <p>{[selected.roleLabel, selected.department, selected.email].filter(Boolean).join(" · ")}</p>
              </div>
              <button type="button" className="ir-btn" onClick={() => setSelected(null)} aria-label="Close"><X size={15} /></button>
            </div>
            <div className="ir-kpis small">
              {[
                ["Assigned", selected.assigned],
                ["Completed", selected.completed],
                ["In progress", selected.inProgress],
                ["Pending", selected.pending],
                ["Review", selected.review],
                ["Overdue", selected.overdue],
              ].map(([label, value]) => (
                <div className="ir-kpi" key={label}><span>{label}</span><strong>{value}</strong></div>
              ))}
            </div>
            <div className="ir-facts">
              <span><Award size={14} /> {selected.pointsEarned} points earned{personSummary?.avgScore ? ` · average score ${personSummary.avgScore}/10` : ""}</span>
              <span>
                <Clock3 size={14} />
                {personSummary?.avgDaysToComplete !== null && personSummary?.avgDaysToComplete !== undefined
                  ? `${personSummary.avgDaysToComplete} days on average to complete a task`
                  : selected.avgCompletionHours !== null
                    ? `${selected.avgCompletionHours} h average to complete`
                    : "No completed tasks yet"}
              </span>
              <span>
                <TrendingUp size={14} /> On-time completion: <strong>{pct(selected.onTimeRate)}</strong>
                {personSummary ? ` (${personSummary.onTime} on time · ${personSummary.late} late)` : ""}
              </span>
              {personSummary?.fastest && (
                <span><CheckCircle2 size={14} /> Fastest: {personSummary.fastest.name} — {personSummary.fastest.timeTaken}</span>
              )}
              {personSummary?.slowest && personSummary.slowest.name !== personSummary.fastest?.name && (
                <span><Clock3 size={14} /> Longest: {personSummary.slowest.name} — {personSummary.slowest.timeTaken}</span>
              )}
              {personSummary?.reworks ? <span><RotateCcw size={14} /> {personSummary.reworks} rework request{personSummary.reworks === 1 ? "" : "s"}</span> : null}
            </div>

            <div className="ir-tasks-head">
              <h4><UserRound size={14} /> Task-wise report {detail ? `(${shownTasks.length}/${detail.length})` : ""}</h4>
              <button type="button" className="ir-btn primary small" onClick={exportPersonCsv} disabled={!detail?.length}>
                <Download size={13} /> Export tasks
              </button>
            </div>
            {detail && detail.length > 0 && (
              <div className="ir-task-tools">
                <div className="ir-tabs">
                  {["All", "To Do", "In Progress", "Review", "Completed", "Late", "Overdue"].map((f) => (
                    <button key={f} type="button" className={taskFilter === f ? "active" : ""} onClick={() => setTaskFilter(f)}>
                      {f}
                    </button>
                  ))}
                </div>
                <div className="ir-task-search">
                  <Search size={13} />
                  <input value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} placeholder="Search task name or ID…" />
                </div>
              </div>
            )}
            {!detail ? (
              <div className="ir-state"><Loader2 size={14} className="ir-spin" /> Loading tasks…</div>
            ) : !detail.length ? (
              <div className="ir-state">No tasks in this period.</div>
            ) : !shownTasks.length ? (
              <div className="ir-state">No tasks match this filter.</div>
            ) : (
              <div className="ir-task-list">
                {shownTasks.map((t) => <TaskReportCard key={t._id} t={t} />)}
              </div>
            )}
          </aside>
        </div>
      )}

      <style>{`
        .individual-reports { display: flex; flex-direction: column; gap: 16px; }
        /* .configuration-card (report.jsx) has no padding and clips overflow — give the filters their own */
        .ir-filters { padding: 16px 18px 18px; margin-bottom: 0; }
        .ir-filter-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(0, 1.3fr) auto; gap: 12px; align-items: end; }
        .ir-filter-grid > * { min-width: 0; }
        .ir-filter-grid select { width: 100%; min-width: 0; }
        .ir-filter-grid label { display: flex; flex-direction: column; gap: 6px; font-size: 11px; font-weight: 700; color: #4f6f7a; text-transform: uppercase; letter-spacing: .4px; }
        .ir-filter-grid select, .ir-search > div { height: 40px; border: 1px solid #d6e8ec; border-radius: 11px; background: #fff; padding: 0 10px; font-size: 13px; color: #082f3a; font-weight: 500; text-transform: none; letter-spacing: 0; }
        .ir-search > div { display: flex; align-items: center; gap: 6px; color: #7b969e; }
        .ir-search input { border: none; outline: none; flex: 1; min-width: 0; font-size: 13px; background: transparent; color: #082f3a; }
        .ir-actions { display: flex; gap: 8px; justify-content: flex-end; }
        .ir-btn { display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 12px; border-radius: 11px; border: 1px solid #d6e8ec; background: #fff; color: #0e7490; font-weight: 700; font-size: 13px; cursor: pointer; }
        .ir-btn.primary { background: linear-gradient(135deg, #123b5d, #16a6b8); color: #fff; border: none; }
        .ir-btn:disabled { opacity: .55; cursor: not-allowed; }
        .ir-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
        .ir-kpi { background: rgba(255,255,255,.92); border: 1px solid #d6e8ec; border-radius: 15px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 8px 28px rgba(23,50,77,.045); }
        .ir-kpi span { font-size: 11px; font-weight: 700; color: #7b969e; text-transform: uppercase; letter-spacing: .5px; }
        .ir-kpi strong { font-size: 22px; color: #082f3a; }
        .ir-kpis.small .ir-kpi { padding: 10px 12px; }
        .ir-kpis.small .ir-kpi strong { font-size: 18px; }
        .ir-table-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; border-bottom: 1px solid #e6f0f2; }
        .ir-table-head h3 { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 15px; color: #082f3a; }
        .ir-table-head span { font-size: 12px; color: #7b969e; }
        .ir-table-wrap { overflow-x: auto; }
        .ir-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .ir-table th { text-align: left; padding: 11px 14px; font-size: 11px; color: #608894; text-transform: uppercase; letter-spacing: .5px; background: #f6fbfc; }
        .ir-table td { padding: 11px 14px; border-top: 1px solid #eef5f6; color: #123b5d; vertical-align: middle; }
        .ir-table tbody tr { cursor: pointer; transition: .15s; }
        .ir-table tbody tr:hover { background: #f4fbfc; }
        .ir-table td small { display: block; color: #7b969e; font-size: 11px; margin-top: 2px; }
        .ir-table td.good { color: #17724a; font-weight: 700; }
        .ir-table td.bad { color: #a83c55; font-weight: 700; }
        .ir-bar { width: 90px; height: 6px; border-radius: 99px; background: #e6f0f2; overflow: hidden; }
        .ir-bar span { display: block; height: 100%; background: linear-gradient(90deg, #16a6b8, #0ea5a0); }
        .ir-state { display: flex; align-items: center; gap: 8px; padding: 22px 18px; color: #6e8799; font-size: 13px; }
        .ir-state.error { color: #a83c55; }
        .ir-spin { animation: irSpin 1s linear infinite; }
        @keyframes irSpin { to { transform: rotate(360deg); } }
        .ir-overlay { position: fixed; inset: 0; z-index: 1200; background: rgba(6,59,70,.35); display: flex; justify-content: flex-end; }
        .ir-drawer { width: min(860px, 100%); height: 100%; overflow-y: auto; background: #fff; padding: 20px; display: flex; flex-direction: column; gap: 14px; box-shadow: -20px 0 50px rgba(6,59,70,.2); }
        .ir-drawer-head { display: flex; justify-content: space-between; gap: 10px; }
        .ir-drawer-head h3 { margin: 0; color: #082f3a; }
        .ir-drawer-head p { margin: 4px 0 0; font-size: 12px; color: #6e8799; }
        .ir-drawer h4 { margin: 4px 0 0; font-size: 13px; color: #082f3a; }
        .ir-facts { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: #123b5d; background: #f4fbfc; border: 1px solid #e3eef2; border-radius: 12px; padding: 12px; }
        .ir-facts span { display: flex; align-items: center; gap: 7px; }
        .ir-task-list { display: flex; flex-direction: column; gap: 6px; }
        .ir-tasks-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .ir-tasks-head h4 { display: flex; align-items: center; gap: 6px; }
        .ir-btn.small { height: 32px; font-size: 12px; padding: 0 10px; }
        .ir-task-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
        .ir-tabs { display: flex; flex-wrap: wrap; gap: 4px; }
        .ir-tabs button { border: 1px solid #d6e8ec; background: #fff; color: #4f6f7a; border-radius: 999px; padding: 4px 10px; font-size: 11.5px; font-weight: 700; cursor: pointer; }
        .ir-tabs button.active { background: #123b5d; border-color: #123b5d; color: #fff; }
        .ir-task-search { display: flex; align-items: center; gap: 6px; border: 1px solid #d6e8ec; border-radius: 10px; padding: 0 9px; height: 32px; color: #7b969e; min-width: 0; flex: 1 1 180px; max-width: 260px; }
        .ir-task-search input { border: none; outline: none; flex: 1; min-width: 0; font-size: 12.5px; background: transparent; color: #082f3a; }
        .ir-task { border: 1px solid #e3eef2; border-radius: 12px; font-size: 13px; background: #fff; }
        .ir-task.open { border-color: #b9dde4; box-shadow: 0 6px 20px rgba(23,50,77,.06); }
        .ir-task-head { width: 100%; display: grid; grid-template-columns: auto 1fr auto; gap: 4px 8px; align-items: center; padding: 9px 11px; border: none; background: transparent; text-align: left; cursor: pointer; font: inherit; }
        .ir-task-name { color: #123b5d; font-weight: 700; min-width: 0; overflow-wrap: anywhere; }
        .ir-task-name em { font-style: normal; color: #0e7490; font-size: 11.5px; margin-right: 4px; }
        .ir-chev { color: #7b969e; transition: transform .15s; }
        .ir-task.open .ir-chev { transform: rotate(180deg); }
        .ir-task-sub { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; font-size: 11.5px; color: #6e8799; }
        .ir-task-sub > span { display: inline-flex; align-items: center; gap: 4px; }
        .ir-task-sub .strong { color: #123b5d; font-weight: 700; }
        .ir-pill { border-radius: 999px; padding: 2px 8px; font-size: 10.5px; font-weight: 800; background: #eef5f8; color: #54758f; }
        .ir-pill.good { background: #eaf8f1; color: #17724a; }
        .ir-pill.bad { background: #fdecef; color: #a83c55; }
        .ir-pill.warn { background: #fff8eb; color: #b45309; }
        .ir-pill.info { background: #eef6ff; color: #1d4ed8; }
        .ir-task-body { border-top: 1px solid #eef5f6; padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 10px; }
        .ir-desc { margin: 0; font-size: 12.5px; color: #38546a; white-space: pre-wrap; }
        .ir-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px 12px; }
        .ir-grid > div { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
        .ir-grid span { font-size: 10.5px; font-weight: 700; color: #7b969e; text-transform: uppercase; letter-spacing: .4px; }
        .ir-grid strong { font-size: 12.5px; color: #082f3a; overflow-wrap: anywhere; }
        .ir-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .ir-chips span { display: inline-flex; align-items: center; gap: 4px; background: #f4fbfc; border: 1px solid #e3eef2; border-radius: 999px; padding: 3px 9px; font-size: 11.5px; color: #38546a; font-weight: 600; }
        .ir-task-body h5 { margin: 2px 0 0; font-size: 12px; color: #082f3a; }
        .ir-timeline { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: #38546a; }
        .ir-timeline li span { color: #7b969e; margin-left: 6px; font-size: 11px; }
        .ir-timeline li em { display: block; font-size: 11.5px; color: #6e8799; }
        .ir-comments { display: flex; flex-direction: column; gap: 6px; }
        .ir-comment { border: 1px solid #dcebef; background: #f7fbfc; border-radius: 10px; padding: 7px 10px; font-size: 11.5px; color: #38546a; }
        .ir-comment span { color: #7b969e; margin-left: 4px; }
        .ir-comment p { margin: 3px 0 0; font-size: 12.5px; color: #082f3a; white-space: pre-wrap; overflow-wrap: anywhere; }
        .ir-comment.c-submitted { background: #eef6ff; border-color: #bfdbfe; }
        .ir-comment.c-completed { background: #f0fdf4; border-color: #bbf7d0; }
        .ir-comment.c-rework { background: #fff8eb; border-color: #f5c77e; }
        .ir-status { font-size: 10px; font-weight: 800; border-radius: 999px; padding: 3px 8px; background: #eef7fa; color: #2f6f91; }
        .ir-status.s-completed { background: #eaf8f1; color: #17724a; }
        .ir-status.s-inprogress { background: #fff7e6; color: #b7791f; }
        .ir-status.s-review { background: #f1eefc; color: #6b4fc8; }
        .ir-btn.primary { white-space: nowrap; }
        @media (max-width: 1200px) {
          .ir-filter-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .ir-search { grid-column: span 2; }
        }
        @media (max-width: 720px) {
          .ir-filters { padding: 14px; }
          .ir-filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .ir-search, .ir-actions { grid-column: 1 / -1; }
          .ir-actions .ir-btn.primary { flex: 1; justify-content: center; }
        }
        @media (max-width: 460px) {
          .ir-filter-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
};

export default IndividualReports;
