import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pagination, usePagination } from "../../components/Pagination";
import {
  ShieldCheck,
  Search,
  ChevronDown,
  ChevronUp,
  Pencil,
  Save,
  Users,
  LockKeyhole,
  ClipboardCheck,
  Database,
  BarChart3,
  MessageCircle,
  CalendarDays,
  CheckCircle2,
  Layers3,
  RefreshCw,
  EyeOff,
  SlidersHorizontal,
  UserCog,
  LifeBuoy,
  Settings2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import API from "../../api/config";
import { getStoredUser } from "../../services/permissions";

/* =========================================================
   Roles, modules and actions all come from the backend:
     GET  /api/permissions/catalog
     Admin      → GET/PUT /api/permissions/roles[/:role]   (his org's Manager / Team Member)
     SuperAdmin → GET/PUT /api/permissions/admins[/:id]    (what each Admin can use & grant)
========================================================= */

const MODULE_UI = {
  tasks: { icon: ClipboardCheck, description: "Manage tasks and assignments" },
  taskbank: { icon: Database, description: "Manage reusable task templates" },
  users: { icon: Users, description: "Manage organization users and roles" },
  calendar: { icon: CalendarDays, description: "Calendar, schedules and CSV import" },
  reports: { icon: BarChart3, description: "View and export organization reports" },
  communication: { icon: ClipboardCheck, description: "Minutes of meeting, recordings, chat and shared files" },
  chat: { icon: MessageCircle, description: "Messages, groups and attachments" },
  support: { icon: LifeBuoy, description: "FAQs and support tickets" },
  settings: { icon: Settings2, description: "Personal profile and preferences" },
};

const ACTION_LABELS = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  assign: "Assign",
  import: "Import",
  export: "Export",
};

const ROLE_DESCRIPTIONS = {
  Manager: "Team management within the organization",
  User: "Basic task access for team members",
};

// { tasks: ["view"] } ⇄ { "tasks.view": true }
const toState = (groups, permissions = {}) =>
  Object.fromEntries(
    groups.flatMap((g) =>
      g.permissions.map((action) => [
        `${g.id}.${action}`,
        Boolean(permissions?.[g.id]?.includes(action)),
      ])
    )
  );

const toPermissions = (groups, state) =>
  Object.fromEntries(
    groups.map((g) => [g.id, g.permissions.filter((action) => state[`${g.id}.${action}`])])
  );

const OceanToggle = ({ enabled, onChange, small = false, disabled = false }) => {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onChange}
      disabled={disabled}
      className={`ocean-toggle ${enabled ? "active" : ""} ${
        small ? "small" : ""
      }`}
      style={disabled ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
      aria-label={enabled ? "Disable permission" : "Enable permission"}
    >
      <span />
    </button>
  );
};

const Roles = () => {
  const sessionUser = getStoredUser();
  const isSuperAdmin = sessionUser?.role === "SuperAdmin";

  const [groups, setGroups] = useState([]); // modules from catalog
  const [defaults, setDefaults] = useState({});
  const [actionLabels, setActionLabels] = useState(ACTION_LABELS);
  const [grantable, setGrantable] = useState({});
  const [roles, setRoles] = useState([]);
  const [people, setPeople] = useState([]); // individual access (Admin only)
  const [mode, setMode] = useState("roles"); // "roles" | "people"
  const [selectedRoleId, setSelectedRoleId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All roles");

  const [permissionState, setPermissionState] = useState({});
  const [dirty, setDirty] = useState(false);

  const [expandedGroups, setExpandedGroups] = useState({});

  const [saveMessage, setSaveMessage] = useState("");

  const selectedRole =
    roles.find((role) => role.id === selectedRoleId) ||
    people.find((person) => person.id === selectedRoleId);
  const isPerson = Boolean(selectedRole?.userId);
  const peopleMode = !isSuperAdmin && mode === "people";
  const visibleItems = peopleMode ? people : roles;

  const loadData = useCallback(async (keepSelection) => {
    setLoading(true);
    setLoadError("");
    try {
      const catalogRes = await API.get("/api/permissions/catalog");
      const catalog = catalogRes.data?.data || {};
      const moduleGroups = (catalog.modules || []).map((m) => ({
        id: m.id,
        title: m.label,
        icon: MODULE_UI[m.id]?.icon || ShieldCheck,
        description: MODULE_UI[m.id]?.description || "",
        permissions: m.actions,
      }));
      setGroups(moduleGroups);
      setDefaults(catalog.defaults || {});
      if (catalog.actionLabels) setActionLabels({ ...ACTION_LABELS, ...catalog.actionLabels });
      setExpandedGroups((prev) =>
        Object.keys(prev).length ? prev : Object.fromEntries(moduleGroups.map((g) => [g.id, true]))
      );

      let list = [];
      let persons = [];
      if (isSuperAdmin) {
        const res = await API.get("/api/permissions/admins");
        const all = Object.fromEntries(moduleGroups.map((g) => [g.id, g.permissions]));
        setGrantable(all);
        list = (res.data?.data || []).map((admin) => ({
          id: admin._id,
          key: admin._id,
          name: admin.name,
          description: admin.companyName ? `${admin.companyName} · ${admin.email}` : admin.email,
          type: admin.isRestricted ? "Restricted" : "Full access",
          customized: admin.isRestricted,
          status: admin.status,
          permissions: admin.permissions,
          permissionCount: admin.permissionCount,
          users: admin.members,
        }));
      } else {
        const res = await API.get("/api/permissions/roles");
        setGrantable(res.data?.data?.grantable || {});
        list = (res.data?.data?.roles || []).map((r) => ({
          id: r.role,
          key: r.role,
          customRoleId: r.customRoleId || null,
          baseRole: r.baseRole || r.role,
          name: r.label,
          description: r.customRoleId
            ? r.description || `Organization role · ${r.baseRole === "Manager" ? "Manager" : "Team Member"} access level`
            : ROLE_DESCRIPTIONS[r.role] || "",
          type: r.customRoleId ? (r.isCustomized ? "Own permissions" : "Organization role") : r.isCustomized ? "Customized" : "Default",
          customized: r.isCustomized,
          status: `${r.activeUsers} active`,
          permissions: r.permissions,
          permissionCount: r.permissionCount,
          users: r.users,
        }));

        // ⭐ Individual access: one person's own permissions (overrides their role)
        const peopleRes = await API.get("/api/permissions/users");
        persons = (peopleRes.data?.data?.users || []).map((u) => ({
          id: `user:${u._id}`,
          key: `user:${u._id}`,
          userId: u._id,
          name: u.name,
          email: u.email,
          roleLabel: u.roleLabel,
          description: [u.roleLabel, u.department, u.email].filter(Boolean).join(" · "),
          type: u.hasOverride ? "Individual access" : "Role access",
          customized: u.hasOverride,
          status: u.status,
          permissions: u.permissions,
          rolePermissions: u.rolePermissions,
          permissionCount: u.permissionCount,
          users: 1,
        }));
      }

      setRoles(list);
      setPeople(persons);
      const next =
        (keepSelection && [...list, ...persons].find((r) => r.id === keepSelection)) ||
        (keepSelection?.startsWith?.("user:") ? persons[0] : null) ||
        list[0] ||
        null;
      setSelectedRoleId(next?.id || null);
      setPermissionState(toState(moduleGroups, next?.permissions));
      setDirty(false);
    } catch (err) {
      console.error("Role permissions load error:", err);
      setLoadError(err.response?.data?.message || "Failed to load roles and permissions.");
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredRoles = useMemo(() => {
    const q = search.toLowerCase();
    return visibleItems.filter((role) => {
      const matchesSearch =
        role.name.toLowerCase().includes(q) ||
        role.description.toLowerCase().includes(q);

      const matchesFilter =
        filter === "All roles" ||
        (filter === "Customized" && role.customized) ||
        (filter === "Default" && !role.customized);

      return matchesSearch && matchesFilter;
    });
  }, [visibleItems, search, filter]);

  const rolePage = usePagination(filteredRoles, { id: "roles", resetKey: `${search}|${filter}` });

  const isGrantable = (groupId, action) => Boolean(grantable?.[groupId]?.includes(action));

  const enabledPermissions = Object.values(permissionState).filter(Boolean).length;

  const totalPermissions = groups.reduce(
    (total, group) => total + group.permissions.length,
    0
  );

  const flash = (message) => {
    setSaveMessage(message);
    setTimeout(() => setSaveMessage(""), 2500);
  };

  const togglePermission = (groupId, permission) => {
    if (!isGrantable(groupId, permission)) return;
    const key = `${groupId}.${permission}`;

    setPermissionState((current) => ({
      ...current,
      [key]: !current[key],
    }));
    setDirty(true);
  };

  const toggleGroup = (group) => {
    const keys = group.permissions
      .filter((permission) => isGrantable(group.id, permission))
      .map((permission) => `${group.id}.${permission}`);

    const shouldEnable = keys.some((key) => !permissionState[key]);

    setPermissionState((current) => {
      const updated = { ...current };

      keys.forEach((key) => {
        updated[key] = shouldEnable;
      });

      return updated;
    });
    setDirty(true);
  };

  const loadDefaults = () => {
    if (!selectedRole) return;
    if (isPerson) {
      // A person's starting point is the access of their role
      setPermissionState(toState(groups, selectedRole.rolePermissions));
      setDirty(true);
      flash(`${selectedRole.roleLabel} permissions loaded — save to apply`);
      return;
    }
    // Admin accounts default to full access; member roles to the system defaults
    const base = isSuperAdmin ? grantable : defaults[selectedRole.baseRole || selectedRole.id] || {};
    const state = toState(groups, base);
    Object.keys(state).forEach((key) => {
      const [g, a] = key.split(".");
      if (!isGrantable(g, a)) state[key] = false;
    });
    setPermissionState(state);
    setDirty(true);
    flash("Default permissions loaded — save to apply");
  };

  const savePermissions = async () => {
    if (!selectedRole || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const permissions = toPermissions(groups, permissionState);
      if (isSuperAdmin) {
        await API.put(`/api/permissions/admins/${selectedRole.id}`, { permissions });
      } else if (isPerson) {
        await API.put(`/api/permissions/users/${selectedRole.userId}`, { permissions });
      } else if (selectedRole.customRoleId) {
        await API.put(`/api/permissions/custom-roles/${selectedRole.customRoleId}`, { permissions });
      } else {
        await API.put(`/api/permissions/roles/${selectedRole.id}`, { permissions });
      }
      await loadData(selectedRole.id);
      flash("Permissions saved successfully");
    } catch (err) {
      setSaveError(err.response?.data?.message || "Failed to save permissions.");
    } finally {
      setSaving(false);
    }
  };

  const resetPerson = async () => {
    if (!isPerson || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await API.put(`/api/permissions/users/${selectedRole.userId}`, { reset: true });
      await loadData(selectedRole.id);
      flash(`${selectedRole.name} now follows the ${selectedRole.roleLabel} role`);
    } catch (err) {
      setSaveError(err.response?.data?.message || "Failed to reset individual access.");
    } finally {
      setSaving(false);
    }
  };

  const switchMode = (next) => {
    if (next === mode) return;
    if (dirty) {
      setSaveError("You have unsaved changes — save or discard them first.");
      return;
    }
    const first = (next === "people" ? people : roles)[0] || null;
    setMode(next);
    setSearch("");
    setFilter("All roles");
    setSelectedRoleId(first?.id || null);
    setPermissionState(toState(groups, first?.permissions));
    setSaveError("");
  };

  const selectRole = (role) => {
    if (dirty && role.id !== selectedRoleId) {
      setSaveError("You have unsaved changes — save them or reload before switching roles.");
      return;
    }
    setSelectedRoleId(role.id);
    setPermissionState(toState(groups, role.permissions));
    setDirty(false);
    setSaveError("");
    setSaveMessage("");
  };

  const discardChanges = () => {
    setPermissionState(toState(groups, selectedRole?.permissions));
    setDirty(false);
    setSaveError("");
  };

  const toggleGroupExpanded = (id) => {
    setExpandedGroups((current) => ({
      ...current,
      [id]: !current[id],
    }));
  };

  return (
    <div className="roles-page">
      <style>{`
        * {
          box-sizing: border-box;
        }

        .roles-page {
          min-height: 100%;
          width: 100%;
          padding: 18px;
          background:
            radial-gradient(
              circle at 5% 0%,
              rgba(20, 184, 166, 0.09),
              transparent 28%
            ),
            radial-gradient(
              circle at 100% 15%,
              rgba(14, 165, 233, 0.08),
              transparent 30%
            ),
            #f5fafb;
          color: #0b2430;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .roles-shell {
          max-width: 1600px;
          margin: 0 auto;
        }

        .ocean-hero {
          position: relative;
          overflow: hidden;
          border-radius: 24px;
          padding: 26px;
          margin-bottom: 18px;
          color: white;
          background:
            linear-gradient(
              135deg,
              #063b46 0%,
              #075e67 42%,
              #0b8f87 75%,
              #10a79a 100%
            );
          box-shadow:
            0 18px 45px rgba(5, 77, 87, 0.18),
            inset 0 1px 0 rgba(255,255,255,.14);
        }

        .ocean-hero::before {
          content: "";
          position: absolute;
          width: 260px;
          height: 260px;
          border-radius: 50%;
          right: -90px;
          top: -120px;
          background: rgba(255,255,255,.08);
        }

        .ocean-hero::after {
          content: "";
          position: absolute;
          width: 180px;
          height: 180px;
          border-radius: 50%;
          left: 42%;
          bottom: -135px;
          background: rgba(255,255,255,.055);
        }

        .hero-content {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        .hero-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .hero-icon {
          width: 58px;
          height: 58px;
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,.13);
          border: 1px solid rgba(255,255,255,.2);
          backdrop-filter: blur(10px);
        }

        .hero-title {
          margin: 0;
          font-size: 28px;
          line-height: 1.1;
          font-weight: 800;
          letter-spacing: -.7px;
        }

        .hero-subtitle {
          margin: 7px 0 0;
          color: rgba(255,255,255,.76);
          font-size: 14px;
        }

        .add-role-button {
          border: 0;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 18px;
          border-radius: 13px;
          background: white;
          color: #087a73;
          font-weight: 750;
          cursor: pointer;
          box-shadow: 0 8px 22px rgba(0,0,0,.13);
          transition: .2s ease;
        }

        .add-role-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 25px rgba(0,0,0,.18);
        }

        .stats-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-bottom: 18px;
        }

        .stat-card {
          position: relative;
          overflow: hidden;
          padding: 18px;
          border: 1px solid #d9e8eb;
          border-radius: 18px;
          background: rgba(255,255,255,.92);
          box-shadow: 0 8px 24px rgba(11, 64, 74, .055);
        }

        .stat-card::after {
          content: "";
          position: absolute;
          right: -28px;
          bottom: -40px;
          width: 100px;
          height: 100px;
          border-radius: 50%;
          background: rgba(13,148,136,.06);
        }

        .stat-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .stat-icon {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: #e7f8f5;
          color: #079687;
        }

        .stat-label {
          color: #65808a;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .8px;
        }

        .stat-value {
          margin-top: 8px;
          font-size: 25px;
          font-weight: 800;
          color: #092f39;
        }

        .main-grid {
          display: grid;
          grid-template-columns: minmax(320px, 390px) minmax(0, 1fr);
          gap: 18px;
          align-items: start;
        }

        .panel {
          border: 1px solid #d8e7eb;
          border-radius: 20px;
          background: rgba(255,255,255,.95);
          box-shadow: 0 10px 32px rgba(7, 66, 78, .055);
          overflow: hidden;
        }

        .panel-header {
          padding: 20px;
          border-bottom: 1px solid #e5eef0;
        }

        .panel-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .panel-title {
          display: flex;
          align-items: center;
          gap: 9px;
          margin: 0;
          font-size: 18px;
          font-weight: 800;
          color: #092d37;
        }

        .panel-title svg {
          color: #079c91;
        }

        .panel-caption {
          margin: 5px 0 0;
          font-size: 12px;
          color: #73909a;
        }

        .filter-area {
          margin-top: 16px;
          display: grid;
          gap: 10px;
        }

        .search-box {
          position: relative;
        }

        .search-box svg {
          position: absolute;
          left: 13px;
          top: 50%;
          transform: translateY(-50%);
          color: #7c98a1;
        }

        .search-input,
        .select-input {
          width: 100%;
          height: 44px;
          border: 1px solid #d9e7eb;
          outline: none;
          border-radius: 12px;
          background: #f8fbfc;
          color: #153844;
          padding: 0 13px;
          font-size: 13px;
          transition: .2s ease;
        }

        .search-input {
          padding-left: 40px;
        }

        .search-input:focus,
        .select-input:focus {
          border-color: #0ba99a;
          box-shadow: 0 0 0 4px rgba(11,169,154,.09);
          background: white;
        }

        .role-list {
          padding: 14px;
          max-height: 690px;
          overflow-y: auto;
        }

        .role-card {
          position: relative;
          margin-bottom: 10px;
          padding: 16px;
          border: 1px solid #deeaed;
          border-radius: 16px;
          background: #fff;
          cursor: pointer;
          transition: .2s ease;
        }

        .role-card:last-child {
          margin-bottom: 0;
        }

        .role-card:hover {
          border-color: #9bded7;
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(5, 103, 109, .07);
        }

        .role-card.selected {
          border-color: #13ad9e;
          background:
            linear-gradient(
              135deg,
              #effcf9,
              #f7ffff
            );
          box-shadow:
            0 10px 25px rgba(9, 151, 138, .1),
            inset 4px 0 0 #0aa895;
        }

        .role-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .role-name-wrap {
          min-width: 0;
        }

        .role-name {
          margin: 0;
          font-size: 15px;
          font-weight: 800;
          color: #092e39;
        }

        .role-badge {
          display: inline-flex;
          margin-left: 7px;
          padding: 3px 7px;
          border-radius: 999px;
          background: #e5f7f4;
          color: #087d74;
          font-size: 10px;
          font-weight: 800;
        }

        .role-description {
          margin: 5px 0 0;
          color: #66828c;
          font-size: 12px;
        }

        .role-status {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-shrink: 0;
          font-size: 11px;
          color: #47646e;
        }

        .role-meta {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-top: 16px;
          color: #63808b;
          font-size: 11px;
        }

        .role-meta span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }

        .role-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 15px;
        }

        .edit-button,
        .delete-button {
          width: 34px;
          height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          border: 1px solid #dce9ec;
          background: #f8fbfc;
          color: #53727c;
          cursor: pointer;
          transition: .2s ease;
        }

        .edit-button:hover {
          background: #e8faf7;
          color: #078e83;
          border-color: #9dded7;
        }

        .delete-button:hover {
          background: #fff1f1;
          color: #ef4444;
          border-color: #fecaca;
        }

        .permissions-panel {
          min-height: 720px;
        }

        .permissions-header {
          padding: 20px;
          border-bottom: 1px solid #e4edef;
          background:
            linear-gradient(
              180deg,
              #fbffff,
              #f7fbfc
            );
        }

        .selected-user-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 12px;
          margin-top: 17px;
        }

        .info-box {
          min-height: 70px;
          padding: 13px;
          border: 1px solid #dce9ec;
          border-radius: 14px;
          background: white;
        }

        .info-label {
          display: block;
          margin-bottom: 6px;
          color: #7b969e;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .8px;
        }

        .info-value {
          color: #123640;
          font-size: 13px;
          font-weight: 750;
        }

        .permission-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 18px 20px 12px;
        }

        .access-heading h3 {
          margin: 0;
          font-size: 15px;
          color: #10343f;
        }

        .access-heading p {
          margin: 4px 0 0;
          color: #78929a;
          font-size: 12px;
        }

        .toolbar-actions {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .defaults-button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 0;
          background: transparent;
          color: #078c83;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .permission-count {
          padding: 5px 9px;
          border-radius: 999px;
          background: #e8f8f5;
          color: #087c74;
          font-size: 11px;
          font-weight: 800;
        }

        .permission-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          padding: 8px 20px 20px;
        }

        .permission-group {
          border: 1px solid #dce9ec;
          border-radius: 15px;
          overflow: hidden;
          background: #fff;
        }

        .permission-group-head {
          padding: 13px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          background:
            linear-gradient(
              90deg,
              #f1fbfa,
              #f8fcfd
            );
          border-bottom: 1px solid #e4edef;
        }

        .group-title-wrap {
          display: flex;
          align-items: center;
          gap: 9px;
          min-width: 0;
        }

        .group-icon {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          background: #dff7f3;
          color: #078f84;
          flex-shrink: 0;
        }

        .group-title {
          margin: 0;
          font-size: 12px;
          font-weight: 800;
          color: #173c46;
        }

        .group-description {
          margin: 2px 0 0;
          color: #78929a;
          font-size: 10px;
        }

        .group-expand {
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: #62808a;
          cursor: pointer;
        }

        .group-expand:hover {
          background: #e9f8f6;
          color: #078d83;
        }

        .permission-list {
          padding: 9px;
        }

        .permission-row {
          min-height: 42px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 9px;
        }

        .permission-row + .permission-row {
          margin-top: 4px;
        }

        .permission-row:hover {
          background: #f5fbfb;
        }

        .permission-name {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #254853;
          font-size: 11px;
          font-weight: 650;
        }

        .permission-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: #72bdb6;
        }

        .ocean-toggle {
          position: relative;
          width: 42px;
          height: 23px;
          padding: 0;
          border: 0;
          border-radius: 999px;
          background: #d6e3e6;
          cursor: pointer;
          transition: .2s ease;
          flex-shrink: 0;
        }

        .ocean-toggle span {
          position: absolute;
          width: 17px;
          height: 17px;
          left: 3px;
          top: 3px;
          border-radius: 50%;
          background: white;
          box-shadow: 0 2px 5px rgba(0,0,0,.15);
          transition: .2s ease;
        }

        .ocean-toggle.active {
          background: linear-gradient(135deg, #0a9f91, #12b6a5);
          box-shadow: 0 4px 12px rgba(9, 164, 148, .22);
        }

        .ocean-toggle.active span {
          transform: translateX(19px);
        }

        .ocean-toggle.small {
          width: 38px;
          height: 21px;
        }

        .ocean-toggle.small span {
          width: 15px;
          height: 15px;
          top: 3px;
          left: 3px;
        }

        .ocean-toggle.small.active span {
          transform: translateX(17px);
        }

        .permissions-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 15px 20px 20px;
          border-top: 1px solid #e3edef;
        }

        .save-status {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #078c83;
          font-size: 12px;
          font-weight: 700;
        }

        .save-button {
          border: 0;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 11px 18px;
          border-radius: 11px;
          color: white;
          background: linear-gradient(135deg, #078d82, #10a995);
          font-weight: 750;
          cursor: pointer;
          box-shadow: 0 7px 18px rgba(7, 141, 130, .2);
          transition: .2s ease;
        }

        .save-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 22px rgba(7, 141, 130, .28);
        }

        .empty-roles {
          padding: 45px 20px;
          text-align: center;
          color: #7b969e;
        }

        .empty-roles svg {
          margin-bottom: 10px;
          color: #94b8bd;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(4, 30, 36, .58);
          backdrop-filter: blur(7px);
        }

        .modal {
          width: min(460px, 100%);
          border-radius: 20px;
          overflow: hidden;
          background: white;
          box-shadow: 0 30px 80px rgba(0,0,0,.24);
          animation: modalIn .2s ease;
        }

        @keyframes modalIn {
          from {
            opacity: 0;
            transform: translateY(12px) scale(.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 19px 20px;
          border-bottom: 1px solid #e6eef0;
          background: linear-gradient(135deg, #effbf9, #ffffff);
        }

        .modal-header h3 {
          margin: 0;
          color: #0a303a;
          font-size: 17px;
        }

        .close-button {
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 9px;
          background: #f0f6f7;
          color: #54727b;
          cursor: pointer;
        }

        .close-button:hover {
          background: #e6f7f4;
          color: #078c83;
        }

        .modal-body {
          padding: 20px;
        }

        .modal-label {
          display: block;
          margin-bottom: 8px;
          color: #274751;
          font-size: 12px;
          font-weight: 750;
        }

        .modal-input {
          width: 100%;
          height: 46px;
          padding: 0 13px;
          border: 1px solid #cfe0e4;
          border-radius: 11px;
          outline: none;
          color: #153943;
          background: #fbfdfd;
        }

        .modal-input:focus {
          border-color: #0aa394;
          box-shadow: 0 0 0 4px rgba(10,163,148,.1);
        }

        .modal-hint {
          margin: 8px 0 0;
          color: #79939b;
          font-size: 11px;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 9px;
          padding: 14px 20px 20px;
        }

        .cancel-button,
        .modal-add-button {
          height: 40px;
          padding: 0 16px;
          border-radius: 10px;
          font-weight: 700;
          cursor: pointer;
        }

        .cancel-button {
          border: 1px solid #dbe7ea;
          background: #f7fafb;
          color: #526f79;
        }

        .modal-add-button {
          border: 0;
          background: linear-gradient(135deg, #078e82, #12aa99);
          color: white;
        }

        @media (max-width: 1100px) {
          .main-grid {
            grid-template-columns: 1fr;
          }

          .role-list {
            max-height: none;
          }

          .permission-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .roles-page {
            padding: 10px;
          }

          .hero-content {
            align-items: flex-start;
            flex-direction: column;
          }

          .stats-row {
            grid-template-columns: repeat(2, 1fr);
          }

          .selected-user-row {
            grid-template-columns: 1fr;
          }

          .permission-toolbar {
            align-items: flex-start;
            flex-direction: column;
          }

          .toolbar-actions {
            width: 100%;
            justify-content: space-between;
          }
        }

        @media (max-width: 480px) {
          .stats-row {
            grid-template-columns: 1fr;
          }

          .ocean-hero {
            padding: 20px;
          }

          .hero-title {
            font-size: 23px;
          }

          .role-card-top {
            flex-direction: column;
          }

          .role-status {
            align-self: flex-start;
          }

          .permissions-footer {
            align-items: flex-start;
            flex-direction: column;
          }

          .save-button {
            width: 100%;
            justify-content: center;
          }
        }

        /* ===== shared theme (matches Dashboard / Users / Tasks) ===== */
        .roles-page .access-heading h3 { font-weight: 800; color: var(--ts-text); }
        .roles-page .stat-icon { color: var(--ts-blue); background: #e8f4fa; }
        .roles-page .ocean-toggle.active { background: var(--ts-primary); }
        .roles-page .access-mode-switch {
          display: flex; gap: 6px; padding: 4px; margin: 12px 0 2px;
          background: #eef6f9; border: 1px solid #d5e7ee; border-radius: 12px;
        }
        .roles-page .access-mode-switch button {
          flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          padding: 8px 10px; border: none; border-radius: 9px; background: transparent;
          color: #4f6f7a; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit;
        }
        .roles-page .access-mode-switch button.active {
          background: #fff; color: var(--ts-text); box-shadow: 0 2px 8px rgba(18, 59, 93, .12);
        }
        .roles-page .access-mode-switch .mode-count {
          min-width: 20px; padding: 1px 6px; border-radius: 999px;
          background: #e8f4fa; color: var(--ts-blue); font-size: 10px;
        }
        .roles-page .ocean-hero {
          background: var(--ts-hero);
          border: var(--ts-hero-border);
          box-shadow: var(--ts-hero-shadow);
          color: var(--ts-on-hero);
        }

      `}</style>

      <div className="roles-shell">

        {/* ================= HERO ================= */}
        <section className="ocean-hero">
          <div className="hero-content">
            <div className="hero-left">
              <div className="hero-icon">
                <ShieldCheck size={29} />
              </div>

              <div>
                <h1 className="hero-title">
                  {isSuperAdmin ? "Admin Access Management" : "Role Management"}
                </h1>
                <p className="hero-subtitle">
                  {isSuperAdmin
                    ? "Control which modules and actions each Admin can use and grant to their users"
                    : "Configure access levels and permissions for the roles in your organization"}
                </p>
              </div>
            </div>

            <button
              className="add-role-button"
              onClick={() => loadData(selectedRoleId)}
              disabled={loading}
            >
              <RefreshCw size={17} />
              Reload
            </button>
          </div>
        </section>

        {loadError && (
          <div className="save-status" style={{ color: "#b34444", marginBottom: 14 }}>
            <AlertTriangle size={15} />
            {loadError}
          </div>
        )}

        {/* ================= STATS ================= */}
        <section className="stats-row">
          <div className="stat-card">
            <div className="stat-top">
              <span className="stat-label">{isSuperAdmin ? "Admins" : "Total Roles"}</span>

              <div className="stat-icon">
                <ShieldCheck size={19} />
              </div>
            </div>

            <div className="stat-value">{roles.length}</div>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span className="stat-label">{isSuperAdmin ? "Restricted" : "Customized"}</span>

              <div className="stat-icon">
                <Layers3 size={19} />
              </div>
            </div>

            <div className="stat-value">
              {roles.filter((role) => role.customized).length}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span className="stat-label">Permissions Available</span>

              <div className="stat-icon">
                <CheckCircle2 size={19} />
              </div>
            </div>

            <div className="stat-value">{totalPermissions}</div>
          </div>

          <div className="stat-card">
            <div className="stat-top">
              <span className="stat-label">Assigned Users</span>

              <div className="stat-icon">
                <Users size={19} />
              </div>
            </div>

            <div className="stat-value">
              {roles.reduce((total, role) => total + (role.users || 0), 0)}
            </div>
          </div>
        </section>

        {/* ================= MAIN ================= */}
        <div className="main-grid">

          {/* ================= ROLES ================= */}
          <section className="panel">
            <div className="panel-header">
              <div className="panel-title-row">
                <div>
                  <h2 className="panel-title">
                    <Layers3 size={19} />
                    {isSuperAdmin ? "Admins" : peopleMode ? "Individuals" : "Roles"}
                  </h2>

                  <p className="panel-caption">
                    {isSuperAdmin
                      ? "Select an Admin to manage the access they can use and grant"
                      : peopleMode
                      ? "Give one person their own access, separate from their role"
                      : "Select a role to manage its access"}
                  </p>
                </div>

                <SlidersHorizontal
                  size={18}
                  color="#7b969e"
                />
              </div>

              {!isSuperAdmin && (
                <div className="access-mode-switch" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!peopleMode}
                    className={!peopleMode ? "active" : ""}
                    onClick={() => switchMode("roles")}
                  >
                    <Layers3 size={14} /> Roles
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={peopleMode}
                    className={peopleMode ? "active" : ""}
                    onClick={() => switchMode("people")}
                  >
                    <UserCog size={14} /> Individuals
                    <span className="mode-count">{people.length}</span>
                  </button>
                </div>
              )}

              <div className="filter-area">
                <div className="search-box">
                  <Search size={17} />

                  <input
                    className="search-input"
                    placeholder={isSuperAdmin ? "Search admins..." : peopleMode ? "Search people..." : "Search roles..."}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <select
                  className="select-input"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="All roles">{peopleMode ? "Everyone" : "All roles"}</option>
                  <option value="Default">{isSuperAdmin ? "Full access" : peopleMode ? "Role access" : "Default"}</option>
                  <option value="Customized">{isSuperAdmin ? "Restricted" : peopleMode ? "Individual access" : "Customized"}</option>
                </select>
              </div>
            </div>

            <div className="role-list">
              {loading && roles.length === 0 ? (
                <div className="empty-roles">
                  <Loader2 size={30} />
                  <div>Loading…</div>
                </div>
              ) : filteredRoles.length === 0 ? (
                <div className="empty-roles">
                  <EyeOff size={35} />
                  <div>{isSuperAdmin ? "No admins found" : peopleMode ? "No people found" : "No roles found"}</div>
                </div>
              ) : (
                rolePage.items.map((role) => (
                  <div
                    key={role.key}
                    className={`role-card ${
                      selectedRoleId === role.id ? "selected" : ""
                    }`}
                    onClick={() => selectRole(role)}
                  >
                    <div className="role-card-top">
                      <div className="role-name-wrap">
                        <h3 className="role-name">
                          {role.name}

                          <span className="role-badge">{role.type}</span>
                        </h3>

                        <p className="role-description">
                          {role.description}
                        </p>
                      </div>

                      <div className="role-status">
                        {role.status}
                      </div>
                    </div>

                    <div className="role-meta">
                      <span>
                        <LockKeyhole size={13} />
                        {role.permissionCount} permissions
                      </span>

                      {role.userId ? (
                        <span>
                          <Users size={13} />
                          {role.roleLabel}
                        </span>
                      ) : (
                        <span>
                          <Users size={13} />
                          {role.users} users
                        </span>
                      )}
                    </div>

                    <div className="role-actions">
                      <span
                        style={{
                          fontSize: "10px",
                          color:
                            selectedRoleId === role.id
                              ? "#078c83"
                              : "#91a6ac",
                          fontWeight: 700,
                        }}
                      >
                        {selectedRoleId === role.id
                          ? "Currently selected"
                          : "Manage permissions"}
                      </span>

                      <div style={{ display: "flex", gap: 7 }}>
                        <button
                          className="edit-button"
                          title="Edit permissions"
                          onClick={(e) => {
                            e.stopPropagation();
                            selectRole(role);
                          }}
                        >
                          <Pencil size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div style={{ gridColumn: "1 / -1" }}>
                <Pagination {...rolePage} label={isSuperAdmin ? "admins" : peopleMode ? "people" : "roles"} />
              </div>
            </div>
          </section>

          {/* ================= PERMISSIONS ================= */}
          <section className="panel permissions-panel">
            <div className="permissions-header">
              <div className="panel-title-row">
                <div>
                  <h2 className="panel-title">
                    <ShieldCheck size={20} />
                    Permissions
                  </h2>

                  <p className="panel-caption">
                    {isSuperAdmin
                      ? "Their Managers and Team Members can never exceed this"
                      : isPerson
                      ? "Applies to this person only and replaces their role's access"
                      : "Options you do not have yourself are disabled"}
                  </p>
                </div>

                <div className="permission-count">
                  {enabledPermissions}/{totalPermissions} enabled
                </div>
              </div>

              <div className="selected-user-row">
                <div className="info-box">
                  <span className="info-label">{isSuperAdmin ? "Selected Admin" : isPerson ? "Selected Person" : "Selected Role"}</span>

                  <span className="info-value">
                    {selectedRole?.name || "None"}
                  </span>
                </div>

                <div className="info-box">
                  <span className="info-label">Configuration</span>

                  <span className="info-value">
                    {selectedRole?.type || "—"}
                  </span>
                </div>

                {isPerson ? (
                  <div className="info-box">
                    <span className="info-label">Role</span>

                    <span className="info-value">{selectedRole.roleLabel}</span>
                  </div>
                ) : (
                  <div className="info-box">
                    <span className="info-label">Assigned Users</span>

                    <span className="info-value">
                      {selectedRole?.users || 0} users
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="permission-toolbar">
              <div className="access-heading">
                <h3>Access Permissions</h3>

                <p>
                  Enable or disable individual capabilities. Saved changes apply immediately.
                </p>
              </div>

              <div className="toolbar-actions">
                <button
                  className="defaults-button"
                  onClick={loadDefaults}
                  disabled={!selectedRole}
                >
                  <RefreshCw size={13} />
                  {isPerson ? "Load role access" : "Load defaults"}
                </button>

                {isPerson && selectedRole.customized && (
                  <button
                    className="defaults-button"
                    onClick={resetPerson}
                    disabled={saving}
                    title="Remove this person's individual access so they follow their role again"
                  >
                    <UserCog size={13} />
                    Reset to role
                  </button>
                )}

                <span className="permission-count">
                  {enabledPermissions} enabled
                </span>
              </div>
            </div>

            <div className="permission-grid">
              {groups.map((group) => {
                const GroupIcon = group.icon;

                const groupKeys = group.permissions.map(
                  (permission) => `${group.id}.${permission}`
                );

                const groupEnabled = groupKeys.filter(
                  (key) => permissionState[key]
                ).length;

                const allEnabled =
                  groupEnabled === group.permissions.length;

                const anyGrantable = group.permissions.some((p) => isGrantable(group.id, p));

                return (
                  <div
                    className="permission-group"
                    key={group.id}
                  >
                    <div className="permission-group-head">
                      <div className="group-title-wrap">
                        <div className="group-icon">
                          <GroupIcon size={16} />
                        </div>

                        <div>
                          <h3 className="group-title">
                            {group.title}
                          </h3>

                          <p className="group-description">
                            {group.description}
                          </p>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <OceanToggle
                          small
                          enabled={allEnabled}
                          disabled={!selectedRole || !anyGrantable}
                          onChange={() => toggleGroup(group)}
                        />

                        <button
                          className="group-expand"
                          onClick={() =>
                            toggleGroupExpanded(group.id)
                          }
                        >
                          {expandedGroups[group.id] ? (
                            <ChevronUp size={15} />
                          ) : (
                            <ChevronDown size={15} />
                          )}
                        </button>
                      </div>
                    </div>

                    {expandedGroups[group.id] && (
                      <div className="permission-list">
                        {group.permissions.map((permission) => {
                          const key = `${group.id}.${permission}`;
                          const allowed = isGrantable(group.id, permission);

                          return (
                            <div
                              className="permission-row"
                              key={permission}
                              title={allowed ? undefined : "Your account does not have this permission, so you cannot grant it"}
                            >
                              <div className="permission-name">
                                <span className="permission-dot" />
                                {actionLabels[permission] || permission}
                              </div>

                              <OceanToggle
                                enabled={!!permissionState[key]}
                                disabled={!selectedRole || !allowed}
                                onChange={() =>
                                  togglePermission(
                                    group.id,
                                    permission
                                  )
                                }
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="permissions-footer">
              <div>
                {saveError ? (
                  <div className="save-status" style={{ color: "#b34444" }}>
                    <AlertTriangle size={15} />
                    {saveError}
                  </div>
                ) : saveMessage ? (
                  <div className="save-status">
                    <CheckCircle2 size={15} />
                    {saveMessage}
                  </div>
                ) : (
                  <span
                    style={{
                      color: "#78939b",
                      fontSize: 11,
                    }}
                  >
                    {dirty ? "You have unsaved changes." : "All changes saved."}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                {dirty && (
                  <button className="defaults-button" onClick={discardChanges} disabled={saving}>
                    Discard
                  </button>
                )}
                <button
                  className="save-button"
                  onClick={savePermissions}
                  disabled={!selectedRole || saving || !dirty}
                  style={!selectedRole || saving || !dirty ? { opacity: 0.6 } : undefined}
                >
                  {saving ? <Loader2 size={16} /> : <Save size={16} />}
                  {saving ? "Saving…" : isPerson ? "Save Individual Access" : "Save Permissions"}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Roles;
