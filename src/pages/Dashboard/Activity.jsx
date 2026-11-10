import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity as ActivityIcon,
  Users,
  Wifi,
  LogIn,
  LogOut,
  MousePointerClick,
  Eye,
  ShieldAlert,
  RefreshCw,
  Search,
  Download,
  X,
  Clock,
} from "lucide-react";
import API from "../../api/config";

/* =========================================================
   ACTIVITY — Admin / SuperAdmin only
   People: last login, last seen, last page, online now.
   Activity log: every login, logout, page opened and change.
========================================================= */

const C = {
  teal: "#087f8c",
  tealSoft: "#edf8f9",
  border: "#e3edf0",
  text: "#1f3b4d",
  muted: "#6f8796",
  bg: "#ffffff",
};

const TYPE_META = {
  login: { label: "Login", color: "#0f9d58", bg: "#e8f7ef", icon: LogIn },
  logout: { label: "Logout", color: "#64748b", bg: "#f1f5f9", icon: LogOut },
  page_view: { label: "Viewed", color: "#2563eb", bg: "#eaf1ff", icon: Eye },
  action: { label: "Action", color: "#087f8c", bg: "#e6f6f7", icon: MousePointerClick },
  login_failed: { label: "Failed login", color: "#dc2626", bg: "#fdecec", icon: ShieldAlert },
};

const ROLE_COLOR = {
  SuperAdmin: "#7c3aed",
  Admin: "#b45309",
  Manager: "#2563eb",
  User: "#0f766e",
};

const fmtDateTime = (v) =>
  v
    ? new Date(v).toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const timeAgo = (v) => {
  if (!v) return "Never";
  const s = Math.max(0, Math.round((Date.now() - new Date(v).getTime()) / 1000));
  if (s < 60) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? "s" : ""} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d > 1 ? "s" : ""} ago`;
  return fmtDateTime(v);
};

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const downloadCsv = (name, header, rows) => {
  const text = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

const RoleBadge = ({ role }) => (
  <span
    style={{
      ...s.badge,
      color: ROLE_COLOR[role] || C.muted,
      background: `${ROLE_COLOR[role] || "#94a3b8"}14`,
    }}
  >
    {role}
  </span>
);

const TypeBadge = ({ type }) => {
  const m = TYPE_META[type] || TYPE_META.action;
  const Icon = m.icon;
  return (
    <span style={{ ...s.badge, color: m.color, background: m.bg }}>
      <Icon size={12} /> {m.label}
    </span>
  );
};

const StatCard = ({ icon: Icon, label, value, hint, color }) => (
  <div style={s.stat}>
    <div>
      <div style={s.statLabel}>{label}</div>
      <div style={s.statValue}>{value}</div>
      <div style={s.statHint}>{hint}</div>
    </div>
    <div style={{ ...s.statIcon, color, background: `${color}14` }}>
      <Icon size={20} />
    </div>
  </div>
);

const Activity = () => {
  const [tab, setTab] = useState("people");

  /* ---------- people ---------- */
  const [people, setPeople] = useState([]);
  const [summary, setSummary] = useState(null);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleError, setPeopleError] = useState("");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [peopleRole, setPeopleRole] = useState("");

  const loadPeople = useCallback(async () => {
    setPeopleLoading(true);
    setPeopleError("");
    try {
      const { data } = await API.get("/api/activity/users");
      setPeople(Array.isArray(data.data) ? data.data : []);
      setSummary(data.summary || null);
    } catch (err) {
      setPeopleError(err.response?.data?.message || err.message || "Unable to load activity");
    } finally {
      setPeopleLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  const shownPeople = useMemo(() => {
    const q = peopleSearch.trim().toLowerCase();
    return people.filter(
      (p) =>
        (!peopleRole || p.role === peopleRole) &&
        (!q || [p.name, p.email, p.department].some((v) => String(v || "").toLowerCase().includes(q)))
    );
  }, [people, peopleSearch, peopleRole]);

  /* ---------- log ---------- */
  const [logs, setLogs] = useState([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPages, setLogPages] = useState(1);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState("");
  const [filters, setFilters] = useState({ userId: "", type: "", role: "", from: "", to: "", search: "", page: 1 });
  const [searchInput, setSearchInput] = useState("");

  const loadLogs = useCallback(async () => {
    setLogLoading(true);
    setLogError("");
    try {
      const params = Object.fromEntries(Object.entries({ ...filters, limit: 50 }).filter(([, v]) => v !== ""));
      const { data } = await API.get("/api/activity/logs", { params });
      setLogs(Array.isArray(data.data) ? data.data : []);
      setLogTotal(data.total || 0);
      setLogPages(data.pages || 1);
    } catch (err) {
      setLogError(err.response?.data?.message || err.message || "Unable to load activity log");
    } finally {
      setLogLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (tab === "log") loadLogs();
  }, [tab, loadLogs]);

  // search box → filter after typing stops
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.search === searchInput ? f : { ...f, search: searchInput, page: 1 }));
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value, page: 1 }));

  const openPersonLog = (person) => {
    setFilters({ userId: person._id, type: "", role: "", from: "", to: "", search: "", page: 1 });
    setSearchInput("");
    setTab("log");
  };

  const selectedPerson = people.find((p) => String(p._id) === String(filters.userId));

  const exportPeople = () =>
    downloadCsv(
      "activity-people.csv",
      ["Name", "Email", "Role", "Department", "Status", "Online", "Last login", "Last seen", "Last page", "Last action", "Logins (7d)", "Actions (7d)", "Pages viewed (7d)", "Failed logins (7d)"],
      shownPeople.map((p) => [
        p.name, p.email, p.role, p.department, p.status, p.online ? "Yes" : "No",
        fmtDateTime(p.lastLoginAt), fmtDateTime(p.lastSeenAt), p.lastPage,
        p.lastAction ? `${p.lastAction.action} ${p.lastAction.detail || ""}`.trim() : "",
        p.logins7d, p.actions7d, p.views7d, p.failed7d,
      ])
    );

  const exportLog = async () => {
    try {
      const params = Object.fromEntries(Object.entries({ ...filters, page: 1, limit: 200 }).filter(([, v]) => v !== ""));
      const { data } = await API.get("/api/activity/logs", { params });
      downloadCsv(
        "activity-log.csv",
        ["Date & time", "Name", "Email", "Role", "Department", "Type", "Activity", "Details", "Page", "Device", "IP"],
        (data.data || []).map((r) => [
          fmtDateTime(r.at), r.userName, r.userEmail, r.role, r.department,
          TYPE_META[r.type]?.label || r.type, r.action, r.detail, r.page, r.device, r.ip,
        ])
      );
    } catch (err) {
      setLogError(err.response?.data?.message || "Export failed");
    }
  };

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.hero}>
        <div style={s.heroIcon}>
          <ActivityIcon size={24} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={s.h1}>Activity</h1>
          <p style={s.heroText}>Last login, last seen and everything your managers and users did</p>
        </div>
        <button
          type="button"
          style={s.ghostBtn}
          onClick={() => (tab === "people" ? loadPeople() : loadLogs())}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div style={s.stats}>
        <StatCard icon={Users} label="People" value={summary?.people ?? "—"} hint="Managers & users" color="#087f8c" />
        <StatCard icon={Wifi} label="Online now" value={summary?.online ?? "—"} hint="Active in last 5 min" color="#0f9d58" />
        <StatCard icon={LogIn} label="Logged in today" value={summary?.loggedInToday ?? "—"} hint="Since midnight" color="#2563eb" />
        <StatCard icon={MousePointerClick} label="Actions today" value={summary?.actionsToday ?? "—"} hint={`${summary?.neverLoggedIn ?? 0} never logged in`} color="#b45309" />
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        {[
          ["people", "People"],
          ["log", "Activity log"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{ ...s.tab, ...(tab === key ? s.tabActive : {}) }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "people" ? (
        <section style={s.panel}>
          <div style={s.toolbar}>
            <div style={s.searchBox}>
              <Search size={15} color={C.muted} />
              <input
                style={s.searchInput}
                placeholder="Search name, email, department…"
                value={peopleSearch}
                onChange={(e) => setPeopleSearch(e.target.value)}
              />
            </div>
            <select style={s.select} value={peopleRole} onChange={(e) => setPeopleRole(e.target.value)}>
              <option value="">All roles</option>
              <option value="Admin">Admin</option>
              <option value="Manager">Manager</option>
              <option value="User">User</option>
            </select>
            <button type="button" style={s.ghostBtn} onClick={exportPeople} disabled={!shownPeople.length}>
              <Download size={15} /> Export
            </button>
          </div>

          {peopleLoading ? (
            <div style={s.state}>Loading activity…</div>
          ) : peopleError ? (
            <div style={{ ...s.state, color: "#dc2626" }}>{peopleError}</div>
          ) : !shownPeople.length ? (
            <div style={s.state}>No people found.</div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    {["Person", "Role", "Last login", "Last seen", "Last page", "Last action", "7 days", ""].map((h) => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownPeople.map((p) => (
                    <tr key={p._id} style={s.tr}>
                      <td style={s.td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={s.avatar}>
                            {String(p.name || "?").charAt(0).toUpperCase()}
                            <span
                              title={p.online ? "Online" : "Offline"}
                              style={{ ...s.dot, background: p.online ? "#22c55e" : "#cbd5e1" }}
                            />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={s.name}>{p.name}</div>
                            <div style={s.sub}>{p.email}</div>
                            {p.department && <div style={s.sub}>{p.department}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={s.td}>
                        <RoleBadge role={p.role} />
                        {p.status === "Inactive" && <div style={{ ...s.sub, color: "#dc2626" }}>Inactive</div>}
                      </td>
                      <td style={s.td}>
                        <div style={s.cellMain}>{timeAgo(p.lastLoginAt)}</div>
                        <div style={{ ...s.sub, whiteSpace: "nowrap" }}>{p.lastLoginAt ? fmtDateTime(p.lastLoginAt) : ""}</div>
                      </td>
                      <td style={s.td}>
                        <div style={{ ...s.cellMain, color: p.online ? "#0f9d58" : C.text }}>
                          {p.online ? "Online now" : timeAgo(p.lastSeenAt)}
                        </div>
                        <div style={{ ...s.sub, whiteSpace: "nowrap" }}>{p.lastSeenAt ? fmtDateTime(p.lastSeenAt) : ""}</div>
                      </td>
                      <td style={s.td}>{p.lastPage || "—"}</td>
                      <td style={{ ...s.td, maxWidth: 220 }}>
                        {p.lastAction ? (
                          <>
                            <div style={s.cellMain}>{p.lastAction.action}</div>
                            {p.lastAction.detail && <div style={s.sub}>{p.lastAction.detail}</div>}
                            <div style={s.sub}>{timeAgo(p.lastAction.at)}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                        <div style={s.sub}>{p.logins7d} logins</div>
                        <div style={s.sub}>{p.actions7d} actions</div>
                        <div style={s.sub}>{p.views7d} pages</div>
                        {p.failed7d > 0 && <div style={{ ...s.sub, color: "#dc2626" }}>{p.failed7d} failed logins</div>}
                      </td>
                      <td style={s.td}>
                        <button type="button" style={s.linkBtn} onClick={() => openPersonLog(p)}>
                          <Clock size={14} /> View activity
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section style={s.panel}>
          <div style={s.toolbar}>
            <div style={s.searchBox}>
              <Search size={15} color={C.muted} />
              <input
                style={s.searchInput}
                placeholder="Search activity, task, name…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <select style={s.select} value={filters.userId} onChange={(e) => setFilter("userId", e.target.value)}>
              <option value="">Everyone</option>
              {people.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} ({p.role})
                </option>
              ))}
            </select>
            <select style={s.select} value={filters.role} onChange={(e) => setFilter("role", e.target.value)}>
              <option value="">All roles</option>
              <option value="Admin">Admin</option>
              <option value="Manager">Manager</option>
              <option value="User">User</option>
            </select>
            <select style={s.select} value={filters.type} onChange={(e) => setFilter("type", e.target.value)}>
              <option value="">All types</option>
              {Object.entries(TYPE_META).map(([k, m]) => (
                <option key={k} value={k}>{m.label}</option>
              ))}
            </select>
            <label style={s.dateLabel}>
              From
              <input type="date" style={s.select} value={filters.from} onChange={(e) => setFilter("from", e.target.value)} />
            </label>
            <label style={s.dateLabel}>
              To
              <input type="date" style={s.select} value={filters.to} onChange={(e) => setFilter("to", e.target.value)} />
            </label>
            <button type="button" style={s.ghostBtn} onClick={exportLog} disabled={!logs.length}>
              <Download size={15} /> Export
            </button>
          </div>

          {selectedPerson && (
            <div style={s.personBar}>
              Showing activity of <b>{selectedPerson.name}</b> ({selectedPerson.role}) · last login{" "}
              {timeAgo(selectedPerson.lastLoginAt)} · last seen {selectedPerson.online ? "online now" : timeAgo(selectedPerson.lastSeenAt)}
              <button type="button" style={s.clearBtn} onClick={() => setFilter("userId", "")}>
                <X size={14} /> Everyone
              </button>
            </div>
          )}

          {logLoading ? (
            <div style={s.state}>Loading activity log…</div>
          ) : logError ? (
            <div style={{ ...s.state, color: "#dc2626" }}>{logError}</div>
          ) : !logs.length ? (
            <div style={s.state}>No activity found for these filters.</div>
          ) : (
            <>
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      {["When", "Person", "Type", "Activity", "Device / IP"].map((h) => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((r) => (
                      <tr key={r._id} style={s.tr}>
                        <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                          <div style={s.cellMain}>{fmtDateTime(r.at)}</div>
                          <div style={s.sub}>{timeAgo(r.at)}</div>
                        </td>
                        <td style={s.td}>
                          <div style={s.name}>{r.userName || "—"}</div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <RoleBadge role={r.role} />
                            {r.department && <span style={s.sub}>{r.department}</span>}
                          </div>
                        </td>
                        <td style={s.td}>
                          <TypeBadge type={r.type} />
                        </td>
                        <td style={{ ...s.td, maxWidth: 320 }}>
                          <div style={s.cellMain}>{r.action}</div>
                          {r.detail && <div style={s.sub}>{r.detail}</div>}
                        </td>
                        <td style={s.td}>
                          <div style={s.sub}>{r.device || "—"}</div>
                          <div style={s.sub}>{r.ip || ""}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={s.pager}>
                <span style={s.sub}>
                  {logTotal} entries · page {filters.page} of {logPages}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    style={s.ghostBtn}
                    disabled={filters.page <= 1}
                    onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    style={s.ghostBtn}
                    disabled={filters.page >= logPages}
                    onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
};

const s = {
  page: { maxWidth: 1240, margin: "0 auto", width: "100%", boxSizing: "border-box", padding: "4px 0 32px" },
  hero: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    padding: "24px 26px",
    borderRadius: 20,
    background: "linear-gradient(135deg, #0b4f6c 0%, #087f8c 100%)",
    color: "#fff",
    marginBottom: 18,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    background: "rgba(255,255,255,0.14)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  h1: { margin: 0, fontSize: 26, fontWeight: 800 },
  heroText: { margin: "4px 0 0", fontSize: 14, opacity: 0.85 },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginBottom: 18 },
  stat: {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    padding: "18px 20px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  statLabel: { fontSize: 12, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  statValue: { fontSize: 28, fontWeight: 800, color: C.text, margin: "6px 0 2px" },
  statHint: { fontSize: 12, color: C.muted },
  statIcon: { width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" },
  tabs: { display: "flex", gap: 8, marginBottom: 12 },
  tab: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: C.border,
    background: C.bg,
    color: C.muted,
    borderRadius: 999,
    padding: "8px 18px",
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
  },
  tabActive: { background: C.teal, color: "#fff", borderColor: C.teal },
  panel: { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "hidden" },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    padding: "14px 16px",
    borderBottom: `1px solid ${C.border}`,
  },
  searchBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flex: "1 1 220px",
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "0 12px",
    background: "#fbfdfe",
  },
  searchInput: { border: "none", outline: "none", background: "transparent", padding: "9px 0", fontSize: 13, width: "100%" },
  select: {
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: "8px 10px",
    fontSize: 13,
    background: "#fbfdfe",
    color: C.text,
  },
  dateLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.muted, fontWeight: 600 },
  ghostBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: `1px solid ${C.border}`,
    background: C.tealSoft,
    color: C.teal,
    borderRadius: 10,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
  },
  linkBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    border: "none",
    background: "transparent",
    color: C.teal,
    fontWeight: 700,
    fontSize: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  personBar: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    padding: "10px 16px",
    background: C.tealSoft,
    color: C.text,
    fontSize: 13,
    borderBottom: `1px solid ${C.border}`,
  },
  clearBtn: {
    marginLeft: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    border: `1px solid ${C.border}`,
    background: "#fff",
    borderRadius: 8,
    padding: "4px 10px",
    fontSize: 12,
    cursor: "pointer",
    color: C.teal,
    fontWeight: 700,
  },
  tableWrap: { width: "100%", overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 980 },
  th: {
    textAlign: "left",
    padding: "11px 14px",
    fontSize: 11,
    fontWeight: 800,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    background: "#f7fbfc",
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap",
  },
  tr: { borderBottom: `1px solid #eef3f5` },
  td: { padding: "12px 14px", verticalAlign: "top", color: C.text },
  avatar: {
    position: "relative",
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: C.tealSoft,
    color: C.teal,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  dot: { position: "absolute", right: -1, bottom: -1, width: 11, height: 11, borderRadius: "50%", border: "2px solid #fff" },
  name: { fontWeight: 700, color: C.text },
  sub: { fontSize: 12, color: C.muted, lineHeight: 1.5 },
  cellMain: { fontWeight: 600 },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  state: { padding: "36px 20px", textAlign: "center", color: C.muted, fontSize: 13 },
  pager: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    padding: "12px 16px",
    borderTop: `1px solid ${C.border}`,
  },
};

export default Activity;
