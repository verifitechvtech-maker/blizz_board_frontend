import { useNavigate } from "react-router-dom";
import API from "../../api/config";
import { Pagination, usePagination } from "../../components/Pagination";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ShieldCheck, Users, Building2, LogOut, UserCheck, UserRoundCog,
  ClipboardCheck, RefreshCw, Plus, X, KeyRound, Loader2, Search,
} from "lucide-react";
import { getStoredUser, ROLE_LABELS } from "../../services/permissions";
import { LifeBuoy, ChevronDown, ChevronUp } from "lucide-react";
import SupportTicketThread from "./SupportTicketThread";
import { unsubscribePushOnLogout } from "../../services/pushNotifications";
import { trackLogout } from "../../services/activity";

const TICKET_STATUSES = ["Open", "In Progress", "Resolved", "Closed"];
const PRIORITY_COLORS = { Urgent: "#be123c", High: "#c2410c", Medium: "#b45309", Low: "#0e7490" };

const emptyAdminForm = { companyName: "", name: "", email: "", password: "", phone: "", department: "" };

const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const user = getStoredUser();

  const [admins, setAdmins] = useState([]);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [taskStats, setTaskStats] = useState(null);
  const [resetRequests, setResetRequests] = useState(0);

  // ===== Support tickets raised by Admins / users =====
  const [tickets, setTickets] = useState([]);
  const [ticketFilter, setTicketFilter] = useState("Open");
  const [ticketSearch, setTicketSearch] = useState("");
  const [openTicket, setOpenTicket] = useState(null);
  const [ticketBusy, setTicketBusy] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("all");

  const [showCreate, setShowCreate] = useState(false);
  const [adminForm, setAdminForm] = useState(emptyAdminForm);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [adminRes, userRes, deptRes, statsRes, resetRes] = await Promise.all([
        API.get("/api/admins"),
        API.get("/api/users"),
        API.get("/api/departments"),
        API.get("/api/tasks/stats"),
        API.get("/api/password-requests").catch(() => ({ data: { count: 0 } })),
      ]);
      // Tickets load separately so a failure never hides the rest of the dashboard
      API.get("/api/support/tickets", { params: { scope: "all" } })
        .then((res) => setTickets(res.data.data || []))
        .catch(() => setTickets([]));
      setResetRequests(resetRes.data?.count || 0);
      setAdmins(adminRes.data.data || []);
      // /api/users returns Admins + members for SuperAdmin — the user table shows members
      setUsers((userRes.data.data || []).filter((u) => u.role !== "Admin"));
      setDepartments(deptRes.data.data || []);
      setTaskStats(statsRes.data.data || null);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to load dashboard data from the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const stats = useMemo(() => {
    const managers = users.filter((u) => u.role === "Manager").length;
    const active = users.filter((u) => u.status === "Active").length;
    const inactive =
      users.filter((u) => u.status !== "Active").length +
      admins.filter((a) => a.status !== "Active").length;
    return { managers, active, inactive };
  }, [users, admins]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const matchesOrg = orgFilter === "all" || String(u.admin_id) === orgFilter;
      const matchesSearch =
        !q ||
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q);
      return matchesOrg && matchesSearch;
    });
  }, [users, search, orgFilter]);

  const ticketCounts = useMemo(
    () => Object.fromEntries(TICKET_STATUSES.map((st) => [st, tickets.filter((t) => t.status === st).length])),
    [tickets]
  );

  const visibleTickets = useMemo(() => {
    const q = ticketSearch.trim().toLowerCase();
    return tickets.filter(
      (t) =>
        // the ticket you are working on stays visible even after its status changes
        (ticketFilter === "All" || t.status === ticketFilter || t._id === openTicket) &&
        (!q ||
          [t.ticketId, t.subject, t.message, t.raisedBy?.name, t.raisedBy?.email, t.organization]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)))
    );
  }, [tickets, ticketFilter, ticketSearch, openTicket]);

  const ticketPage = usePagination(visibleTickets, { id: "sa-tickets", resetKey: `${ticketFilter}|${ticketSearch}` });
  const adminPage = usePagination(admins, { id: "sa-admins" });
  const userPage = usePagination(filteredUsers, { id: "sa-users", resetKey: `${search}|${orgFilter}` });

  const replaceTicket = (updated) =>
    setTickets((prev) => prev.map((t) => (t._id === updated._id ? { ...t, ...updated, raisedBy: t.raisedBy, organization: t.organization, user: t.user } : t)));

  const changeTicketStatus = async (ticket, status) => {
    setTicketBusy(ticket._id);
    try {
      const res = await API.patch(`/api/support/tickets/${ticket._id}`, { status });
      replaceTicket(res.data.data);
      setNotice(`${ticket.ticketId} marked ${status}. The user has been emailed.`);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update the ticket.");
    } finally {
      setTicketBusy(null);
    }
  };

  const adminName = (id) => admins.find((a) => String(a._id) === String(id))?.name || "—";

  // ===== One Admin's organization (separate view per Admin) =====
  const [overviewId, setOverviewId] = useState(null);
  const [overview, setOverview] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [companyDraft, setCompanyDraft] = useState("");

  const openOverview = async (adminId) => {
    if (overviewId === adminId) {
      setOverviewId(null);
      setOverview(null);
      return;
    }
    setOverviewId(adminId);
    setOverview(null);
    setOverviewLoading(true);
    try {
      const res = await API.get(`/api/admins/${adminId}/overview`);
      setOverview(res.data.data);
      setCompanyDraft(res.data.data.admin.companyName || "");
      setTimeout(() => document.getElementById("admin-overview")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load this Admin's details.");
      setOverviewId(null);
    } finally {
      setOverviewLoading(false);
    }
  };

  const saveCompany = async () => {
    if (!overview || !companyDraft.trim()) return;
    try {
      await API.put(`/api/users/${overview.admin._id}`, { companyName: companyDraft.trim() });
      setOverview((o) => ({ ...o, admin: { ...o.admin, companyName: companyDraft.trim() } }));
      setNotice("Company name saved.");
      fetchData();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save the company name.");
    }
  };

  const toggleStatus = async (account) => {
    const next = account.status === "Active" ? "Inactive" : "Active";
    setBusyId(account._id);
    try {
      await API.put(`/api/users/${account._id}`, { status: next });
      setNotice(`${account.name} is now ${next}.`);
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update the account status.");
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!adminForm.companyName.trim() || !adminForm.name.trim() || !adminForm.email.trim() || !adminForm.password) {
      setFormError("Company name, admin name, email and password are required.");
      return;
    }
    if (adminForm.password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }
    setCreating(true);
    try {
      const res = await API.post("/api/admins", {
        ...adminForm,
        name: adminForm.name.trim(),
        email: adminForm.email.trim(),
        companyName: adminForm.companyName.trim(),
      });
      setShowCreate(false);
      setAdminForm(emptyAdminForm);
      // includes whether the verification email was sent
      setNotice(res.data?.message || "Admin account created.");
      await fetchData();
    } catch (err) {
      setFormError(err.response?.data?.message || "Failed to create the admin.");
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = () => {
    trackLogout(); // Activity page: "Logged out"
    unsubscribePushOnLogout(); // this browser stops getting this user's pushes
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  };

  const statusButton = (account) => (
    <button
      type="button"
      onClick={() => toggleStatus(account)}
      disabled={busyId === account._id}
      style={account.status === "Active" ? styles.smallBtnDanger : styles.smallBtn}
    >
      {busyId === account._id ? "Saving…" : account.status === "Active" ? "Deactivate" : "Activate"}
    </button>
  );

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.roleIcon}><ShieldCheck size={22} /></div>
            <div>
              <h1 style={styles.title}>SuperAdmin Dashboard</h1>
              <p style={styles.subtitle}>Welcome, {user?.name}</p>
            </div>
          </div>
          <div style={styles.headerActions}>
            <button onClick={fetchData} style={styles.ghostBtn} disabled={loading}>
              <RefreshCw size={15} style={loading ? styles.spin : undefined} /> Refresh
            </button>
            <button onClick={() => navigate("/dashboard/roles")} style={styles.ghostBtn}>
              <KeyRound size={15} /> Admin Access
            </button>
            <button onClick={handleLogout} style={styles.logoutBtn}>
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}
        {notice && <div style={styles.noticeBox}>{notice}</div>}

        <div style={styles.statsRow}>
          {[
            { icon: ShieldCheck, color: "#06b6d4", value: admins.length, label: "Admins" },
            { icon: Users, color: "#14b8a6", value: users.length, label: "Users" },
            { icon: UserRoundCog, color: "#0e7490", value: stats.managers, label: "Managers" },
            { icon: UserCheck, color: "#10b981", value: stats.active, label: "Active Users" },
            { icon: Building2, color: "#0891b2", value: departments.length, label: "Departments" },
            {
              icon: ClipboardCheck, color: "#0f766e",
              value: taskStats ? `${taskStats.completed}/${taskStats.total}` : "—",
              label: "Tasks Done",
            },
          ].map(({ icon: Icon, color, value, label }) => (
            <div key={label} style={styles.statCard}>
              <Icon size={24} color={color} />
              <div>
                <div style={styles.statNum}>{loading ? "…" : value}</div>
                <div style={styles.statLabel}>{label}</div>
              </div>
            </div>
          ))}
        </div>
        {ticketCounts.Open > 0 && !loading && (
          <div style={{ ...styles.noticeBox, background: "#ECFEFF", borderColor: "#A5F3FC", color: "#0e7490", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span><LifeBuoy size={14} style={{ verticalAlign: -2 }} /> {ticketCounts.Open} open support ticket(s) waiting for a reply.</span>
            <button style={styles.smallBtn} onClick={() => { setTicketFilter("Open"); document.getElementById("support-tickets")?.scrollIntoView({ behavior: "smooth" }); }}>View</button>
          </div>
        )}
        {resetRequests > 0 && !loading && (
          <div style={{ ...styles.noticeBox, background: "#FFFBF0", borderColor: "#F3DDA9", color: "#8a5a00", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span>{resetRequests} password reset request(s) are waiting for you.</span>
            <button style={styles.smallBtn} onClick={() => navigate("/dashboard/users")}>Review</button>
          </div>
        )}
        {stats.inactive > 0 && !loading && (
          <p style={styles.hint}>{stats.inactive} account(s) are currently inactive.</p>
        )}

        <div style={styles.section} id="support-tickets">
          <div style={styles.sectionHead}>
            <h2 style={styles.sectionTitle}><LifeBuoy size={17} style={{ verticalAlign: -3 }} /> Support Tickets</h2>
            <div style={styles.filters}>
              {["Open", "In Progress", "Resolved", "Closed", "All"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setTicketFilter(st)}
                  style={ticketFilter === st ? { ...styles.smallBtn, background: "#0e7490", color: "#fff", borderColor: "#0e7490" } : styles.smallBtn}
                >
                  {st} {st === "All" ? tickets.length : ticketCounts[st]}
                </button>
              ))}
              <div style={styles.searchBox}>
                <Search size={14} color="#71949d" />
                <input value={ticketSearch} onChange={(e) => setTicketSearch(e.target.value)} placeholder="Search tickets…" style={styles.searchInput} />
              </div>
            </div>
          </div>

          {loading ? (
            <p style={styles.empty}><Loader2 size={14} style={styles.spin} /> Loading…</p>
          ) : visibleTickets.length === 0 ? (
            <p style={styles.empty}>{tickets.length ? "No tickets in this view." : "No support tickets have been raised yet."}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {ticketPage.items.map((t) => {
                const isOpen = openTicket === t._id;
                return (
                  <div key={t._id} style={{ border: "1px solid #e0f2fe", borderRadius: 12, padding: "12px 14px", background: isOpen ? "#fbfeff" : "#fff" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#064b5a" }}>
                          <span style={{ color: "#0891b2", marginRight: 6 }}>{t.ticketId}</span>{t.subject}
                        </div>
                        <div style={{ fontSize: 12, color: "#608894", marginTop: 3 }}>
                          {t.raisedBy?.name || t.userEmail || "Unknown"}
                          {t.raisedBy?.role ? ` (${ROLE_LABELS[t.raisedBy.role] || t.raisedBy.role})` : ""}
                          {t.organization ? ` · ${t.organization}` : ""} · {t.category} · {new Date(t.createdAt).toLocaleString()}
                          {(t.responses || []).length ? ` · ${t.responses.length} repl${t.responses.length === 1 ? "y" : "ies"}` : ""}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 800, color: PRIORITY_COLORS[t.priority] || "#0e7490" }}>{t.priority}</span>
                      <select
                        value={t.status}
                        disabled={ticketBusy === t._id}
                        onChange={(e) => changeTicketStatus(t, e.target.value)}
                        style={styles.select}
                        aria-label={`Status of ${t.ticketId}`}
                      >
                        {TICKET_STATUSES.map((st) => <option key={st}>{st}</option>)}
                      </select>
                      <button type="button" style={styles.smallBtn} onClick={() => setOpenTicket(isOpen ? null : t._id)}>
                        {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {isOpen ? "Hide" : "Open & reply"}
                      </button>
                    </div>
                    {isOpen && <SupportTicketThread ticket={t} staff onUpdated={replaceTicket} />}
                  </div>
                );
              })}
              <Pagination {...ticketPage} label="tickets" />
            </div>
          )}
        </div>

        <div style={styles.section}>
          <div style={styles.sectionHead}>
            <h2 style={styles.sectionTitle}>All Admins</h2>
            <button style={styles.primaryBtn} onClick={() => { setFormError(""); setShowCreate(true); }}>
              <Plus size={15} /> New Admin
            </button>
          </div>
          {loading ? (
            <p style={styles.empty}><Loader2 size={14} style={styles.spin} /> Loading…</p>
          ) : admins.length === 0 ? (
            <p style={styles.empty}>No admins found</p>
          ) : (
          <>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Company</th>
                  <th style={styles.th}>Admin</th>
                  <th style={styles.th}>Created</th>
                  <th style={styles.th}>Users</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {adminPage.items.map((a) => (
                  <tr key={a._id} style={overviewId === a._id ? { background: "#ecfeff" } : undefined}>
                    <td style={styles.td}><strong>{a.companyName || <span style={styles.muted}>Not set</span>}</strong></td>
                    <td style={styles.td}>
                      {a.name}
                      <div style={styles.muted}>{a.email}</div>
                    </td>
                    <td style={styles.td}>{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : "-"}</td>
                    <td style={styles.td}>
                      {a.members}
                      {a.managers ? <span style={styles.muted}> ({a.managers} mgr)</span> : null}
                    </td>
                    <td style={styles.td}>
                      <span style={a.status === "Active" ? styles.badgeGreen : styles.badgeRed}>
                        {a.status}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.rowActions}>
                        <button
                          type="button"
                          style={overviewId === a._id ? { ...styles.smallBtn, background: "#0e7490", color: "#fff" } : styles.smallBtn}
                          onClick={() => openOverview(a._id)}
                        >
                          {overviewId === a._id ? "Hide details" : "Details"}
                        </button>
                        {statusButton(a)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination {...adminPage} label="admins" />
          </>
          )}
        </div>


        {overviewId && (
          <div style={styles.section} id="admin-overview">
            {overviewLoading || !overview ? (
              <p style={styles.empty}><Loader2 size={14} style={styles.spin} /> Loading this organization…</p>
            ) : (
              <>
                <div style={styles.sectionHead}>
                  <div>
                    <h2 style={styles.sectionTitle}>
                      <Building2 size={17} style={{ verticalAlign: -3 }} /> {overview.admin.companyName || "Company not set"}
                    </h2>
                    <div style={{ ...styles.muted, marginTop: 4, fontSize: 12 }}>
                      Admin: <strong>{overview.admin.name}</strong> · {overview.admin.email} · created{" "}
                      {new Date(overview.admin.createdAt).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                      {" "}· <span style={overview.admin.status === "Active" ? styles.badgeGreen : styles.badgeRed}>{overview.admin.status}</span>
                    </div>
                  </div>
                  <div style={styles.filters}>
                    <input
                      value={companyDraft}
                      onChange={(e) => setCompanyDraft(e.target.value)}
                      placeholder="Company name"
                      style={{ ...styles.input, padding: "8px 10px", fontSize: 13 }}
                      aria-label="Company name"
                    />
                    <button type="button" style={styles.smallBtn} onClick={saveCompany} disabled={!companyDraft.trim() || companyDraft.trim() === (overview.admin.companyName || "")}>
                      Save company
                    </button>
                    <button type="button" style={styles.iconBtn} onClick={() => openOverview(overviewId)} title="Close"><X size={16} /></button>
                  </div>
                </div>

                <div style={{ ...styles.statsRow, marginBottom: 18 }}>
                  {[
                    ["Team members", overview.stats.members],
                    ["Managers", overview.stats.managers],
                    ["Team Members", overview.stats.users],
                    ["Active", overview.stats.activeMembers],
                    ["Departments", overview.stats.departments],
                    ["Tasks", overview.stats.tasks.total],
                    ["Completed", `${overview.stats.tasks.completed} (${overview.stats.tasks.completionRate}%)`],
                    ["In progress", overview.stats.tasks.inProgress],
                    ["To do", overview.stats.tasks.todo],
                    ["Overdue", overview.stats.tasks.overdue],
                    ["Meetings", overview.stats.meetings],
                    ["Open tickets", overview.stats.openTickets],
                  ].map(([label, value]) => (
                    <div key={label} style={{ ...styles.statCard, minWidth: 120, padding: 14 }}>
                      <div>
                        <div style={{ ...styles.statNum, fontSize: 22 }}>{value}</div>
                        <div style={styles.statLabel}>{label}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <h3 style={{ ...styles.sectionTitle, fontSize: 15, marginBottom: 8 }}>Team ({overview.members.length})</h3>
                {overview.members.length === 0 ? (
                  <p style={styles.empty}>No users in this organization yet.</p>
                ) : (
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Name</th>
                        <th style={styles.th}>Role</th>
                        <th style={styles.th}>Department</th>
                        <th style={styles.th}>Joined</th>
                        <th style={styles.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.members.map((m) => (
                        <tr key={m._id}>
                          <td style={styles.td}>{m.name}<div style={styles.muted}>{m.email}</div></td>
                          <td style={styles.td}>{m.customRoleName || ROLE_LABELS[m.role] || m.role}</td>
                          <td style={styles.td}>{m.department || "-"}</td>
                          <td style={styles.td}>{new Date(m.createdAt).toLocaleDateString()}</td>
                          <td style={styles.td}><span style={m.status === "Active" ? styles.badgeGreen : styles.badgeRed}>{m.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <h3 style={{ ...styles.sectionTitle, fontSize: 15, margin: "20px 0 8px" }}>Recent tasks</h3>
                {overview.recentTasks.length === 0 ? (
                  <p style={styles.empty}>No tasks yet.</p>
                ) : (
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Task</th>
                        <th style={styles.th}>Assigned to</th>
                        <th style={styles.th}>Priority</th>
                        <th style={styles.th}>Due</th>
                        <th style={styles.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.recentTasks.map((t) => (
                        <tr key={t._id}>
                          <td style={styles.td}>{t.name}</td>
                          <td style={styles.td}>{t.assignedUser || "Unassigned"}</td>
                          <td style={styles.td}>{t.priority}</td>
                          <td style={styles.td}>{t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "-"}</td>
                          <td style={styles.td}>{t.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        )}

        <div style={styles.section}>
          <div style={styles.sectionHead}>
            <h2 style={styles.sectionTitle}>All Users</h2>
            <div style={styles.filters}>
              <div style={styles.searchBox}>
                <Search size={14} color="#71949d" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search users…"
                  style={styles.searchInput}
                />
              </div>
              <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} style={styles.select}>
                <option value="all">All organizations</option>
                {admins.map((a) => (
                  <option key={a._id} value={String(a._id)}>{a.companyName ? `${a.companyName} (${a.name})` : a.name}</option>
                ))}
              </select>
              <button style={styles.ghostBtn} onClick={() => navigate("/dashboard/users")}>
                Manage users
              </button>
            </div>
          </div>
          {loading ? (
            <p style={styles.empty}><Loader2 size={14} style={styles.spin} /> Loading…</p>
          ) : filteredUsers.length === 0 ? (
            <p style={styles.empty}>No users found</p>
          ) : (
          <>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Department</th>
                  <th style={styles.th}>Role</th>
                  <th style={styles.th}>Organization</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {userPage.items.map((u) => (
                  <tr key={u._id}>
                    <td style={styles.td}>{u.name}</td>
                    <td style={styles.td}>{u.email}</td>
                    <td style={styles.td}>{u.department || "-"}</td>
                    <td style={styles.td}>{u.customRoleName || ROLE_LABELS[u.role] || u.role}</td>
                    <td style={styles.td}>{u.organization?.companyName || u.organization?.name || adminName(u.admin_id)}</td>
                    <td style={styles.td}>
                      <span style={u.status === "Active" ? styles.badgeGreen : styles.badgeRed}>
                        {u.status}
                      </span>
                    </td>
                    <td style={styles.td}>{statusButton(u)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination {...userPage} label="users" />
          </>
          )}
        </div>
      </div>

      {showCreate && (
        <div style={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && !creating && setShowCreate(false)}>
          <form style={styles.modal} onSubmit={handleCreateAdmin}>
            <div style={styles.sectionHead}>
              <h2 style={styles.sectionTitle}>Create Admin</h2>
              <button type="button" style={styles.iconBtn} onClick={() => setShowCreate(false)} disabled={creating}>
                <X size={16} />
              </button>
            </div>
            <p style={styles.empty}>An Admin owns a separate organization with its own users, tasks and departments. They receive a verification email and can view this password once (30 seconds) after verifying.</p>
            {[
              ["companyName", "Company name *", "text"],
              ["name", "Admin full name *", "text"],
              ["email", "Email *", "email"],
              ["password", "Temporary password * (min 6)", "password"],
              ["phone", "Phone", "tel"],
              ["department", "Department", "text"],
            ].map(([key, label, type]) => (
              <label key={key} style={styles.field}>
                <span style={styles.fieldLabel}>{label}</span>
                <input
                  type={type}
                  value={adminForm[key]}
                  autoComplete={type === "password" ? "new-password" : "off"}
                  onChange={(e) => setAdminForm((f) => ({ ...f, [key]: e.target.value }))}
                  style={styles.input}
                />
              </label>
            ))}
            {formError && <div style={styles.errorBox}>{formError}</div>}
            <button type="submit" style={{ ...styles.primaryBtn, width: "100%", justifyContent: "center" }} disabled={creating}>
              {creating ? <Loader2 size={15} style={styles.spin} /> : <Plus size={15} />}
              {creating ? "Creating…" : "Create Admin"}
            </button>
          </form>
        </div>
      )}
      <style>{"@keyframes sa-spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
};

const styles = {
  page: { minHeight: "100vh", background: "#f0fdfa", padding: "30px" },
  container: { maxWidth: 1100, margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30, gap: 16, flexWrap: "wrap" },
  headerLeft: { display: "flex", alignItems: "center", gap: 15 },
  headerActions: { display: "flex", gap: 10, flexWrap: "wrap" },
  roleIcon: { width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg, #06b6d4, #14b8a6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" },
  title: { margin: 0, fontSize: 24, color: "#064b5a" },
  subtitle: { margin: "4px 0 0", color: "#608894", fontSize: 14 },
  logoutBtn: { display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  ghostBtn: { display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", background: "#fff", color: "#0e7490", border: "1px solid #bae6fd", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  primaryBtn: { display: "flex", alignItems: "center", gap: 7, padding: "9px 16px", background: "linear-gradient(135deg, #06b6d4, #14b8a6)", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700 },
  smallBtn: { padding: "6px 11px", background: "#ecfeff", color: "#0e7490", border: "1px solid #a5f3fc", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 700 },
  smallBtnDanger: { padding: "6px 11px", background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 700 },
  iconBtn: { width: 32, height: 32, borderRadius: 9, border: "1px solid #e0f2fe", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#608894" },
  statsRow: { display: "flex", gap: 20, marginBottom: 12, flexWrap: "wrap" },
  statCard: { flex: 1, minWidth: 150, background: "#fff", borderRadius: 16, padding: "20px", display: "flex", alignItems: "center", gap: 15, boxShadow: "0 4px 20px rgba(0,0,0,0.06)" },
  statNum: { fontSize: 28, fontWeight: 800, color: "#064b5a" },
  statLabel: { fontSize: 12, color: "#71949d", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 },
  hint: { margin: "0 0 20px", color: "#b45309", fontSize: 13 },
  section: { background: "#fff", borderRadius: 16, padding: "25px", marginBottom: 20, marginTop: 18, boxShadow: "0 4px 20px rgba(0,0,0,0.06)", overflowX: "auto" },
  sectionHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 15 },
  sectionTitle: { margin: 0, fontSize: 18, color: "#064b5a" },
  filters: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  searchBox: { display: "flex", alignItems: "center", gap: 6, border: "1px solid #e0f2fe", borderRadius: 10, padding: "0 10px", background: "#f8fdff" },
  searchInput: { border: "none", outline: "none", background: "transparent", padding: "9px 0", fontSize: 13, color: "#073b4c", width: 170 },
  select: { border: "1px solid #e0f2fe", borderRadius: 10, padding: "9px 10px", fontSize: 13, color: "#073b4c", background: "#f8fdff" },
  empty: { color: "#71949d", fontSize: 14, display: "flex", alignItems: "center", gap: 6 },
  muted: { color: "#71949d", fontSize: 11 },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 700, color: "#608894", borderBottom: "2px solid #e0f2fe", textTransform: "uppercase", letterSpacing: 0.8 },
  td: { padding: "12px 16px", fontSize: 13, color: "#073b4c", borderBottom: "1px solid #f0f9ff" },
  rowActions: { display: "flex", gap: 6, flexWrap: "wrap" },
  badgeGreen: { display: "inline-block", padding: "4px 10px", borderRadius: 6, background: "#d1fae5", color: "#065f46", fontSize: 11, fontWeight: 700 },
  badgeRed: { display: "inline-block", padding: "4px 10px", borderRadius: 6, background: "#fee2e2", color: "#991b1b", fontSize: 11, fontWeight: 700 },
  errorBox: { background: "#fff1f2", border: "1px solid #fecdd3", color: "#be123c", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14 },
  noticeBox: { background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#047857", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14 },
  overlay: { position: "fixed", inset: 0, background: "rgba(6,59,70,.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 1000 },
  modal: { width: "100%", maxWidth: 440, background: "#fff", borderRadius: 18, padding: 24, boxShadow: "0 24px 60px rgba(6,59,70,.25)", display: "flex", flexDirection: "column", gap: 12, maxHeight: "90vh", overflowY: "auto" },
  field: { display: "flex", flexDirection: "column", gap: 5 },
  fieldLabel: { fontSize: 12, fontWeight: 600, color: "#608894" },
  input: { border: "1px solid #e0f2fe", borderRadius: 10, padding: "10px 12px", fontSize: 14, color: "#073b4c", outline: "none" },
  spin: { animation: "sa-spin 1s linear infinite" },
};

export default SuperAdminDashboard;
