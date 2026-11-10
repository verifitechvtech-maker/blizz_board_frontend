// Blizzboard UsersPage — Unique Ocean Flow Edition
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pagination, usePagination } from "../../components/Pagination";
import BulkSelectBar, { SelectCheckbox, useBulkSelect } from "../../components/BulkSelectBar";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { appLinks, canOpen, linkProps, pageParams, APP_LINK_CSS } from "../../utils/appLinks";

import {
  Users,
  Building2,
  ShieldCheck,
  UserRoundCog,
  Search,
  Upload,
  MoreHorizontal,
  Pencil,
  Trash2,
  Mail,
  Phone,
  BriefcaseBusiness,
  UserPlus,
  UserX,
  Building,
  ArrowUpRight,
  Filter,
  X,
  Plus,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  LockKeyhole,
  Activity,
  TrendingUp,
  BarChart3,
  Waves,
  CalendarDays,
  ChevronDown,
  UserRound,
  Eye,
  ClipboardList,
  Archive,
  FileText,
} from "lucide-react";
import { API_URL as ENV_API_URL } from "../../config/env";


const API_URL = ENV_API_URL;
const TOKEN_KEYS = [
  "token",
  "authToken",
  "accessToken",
  "jwt",
  "userToken",
];

const getAuthToken = () => {
  for (const key of TOKEN_KEYS) {
    const token =
      localStorage.getItem(key) || sessionStorage.getItem(key);

    if (token) {
      return token.replace(/^"|"$/g, "");
    }
  }

  return null;
};

const api = axios.create({
  baseURL: ENV_API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      TOKEN_KEYS.forEach((key) => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });
    }

    return Promise.reject(error);
  }
);

/* Role names come from the backend (GET /api/permissions/catalog). */
const ROLE_LABELS = {
  SuperAdmin: "Super Admin",
  Admin: "Admin",
  Manager: "Manager",
  User: "Team Member",
};

const roleLabel = (role) => ROLE_LABELS[role] || role || "Team Member";

// CSV / free-text role → backend enum value
const toRoleValue = (value) => {
  const v = String(value || "").trim().toLowerCase().replace(/[\s_-]/g, "");
  if (v === "admin") return "Admin";
  if (v === "manager") return "Manager";
  if (v === "superadmin") return "SuperAdmin";
  return "User"; // "user", "team member", "member", "employee", ""
};

const getSessionUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

const canDo = (user, moduleId, action) =>
  user?.role === "SuperAdmin" ||
  Boolean(user?.permissions?.[moduleId]?.includes(action));

// Kept only as a reference list — the page shows departments from the API.
// eslint-disable-next-line no-unused-vars
const DEFAULT_DEPARTMENTS = [
  {
    name: "Management",
    description: "Leadership and administration",
  },
  {
    name: "Development",
    description: "Software development team",
  },
  {
    name: "Marketing",
    description: "Marketing and communications",
  },
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
];

const UsersPage = () => {
  const [activeTab, setActiveTab] = useState("users");

  const [search, setSearch] = useState("");
  const [department, setDepartment] =
    useState("All Departments");
  const [role, setRole] = useState("All Roles");
  const navigate = useNavigate();

  // Opened from Tasks / Task Bank / Calendar / MoM: ?search=Priya or ?department=Sales
  useEffect(() => {
    const params = pageParams();
    if (params.get("search")) setSearch(params.get("search"));
    if (params.get("department")) setDepartment(params.get("department"));
  }, []);

  const [users, setUsers] = useState([]);

  const [departments, setDepartments] = useState([]);

  // Logged-in account + what it may do (backend still enforces everything)
  const [sessionUser] = useState(getSessionUser);
  const isSuperAdmin = sessionUser?.role === "SuperAdmin";
  const canCreateUsers = canDo(sessionUser, "users", "create");
  const canEditUsers = canDo(sessionUser, "users", "edit");
  const canDeleteUsers = canDo(sessionUser, "users", "delete");
  const canAssignRoles = canDo(sessionUser, "users", "assign");

  // Roles this account may hand out + organizations (SuperAdmin only)
  const [assignableRoles, setAssignableRoles] = useState([]);
  const [organizations, setOrganizations] = useState([]);

  // Organization-defined roles (managed like departments)
  const [customRoles, setCustomRoles] = useState([]);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleForm, setRoleForm] = useState({ name: "", description: "", baseRole: "User", adminId: "" });
  const [savingRole, setSavingRole] = useState(false);

  const fetchCustomRoles = async () => {
    try {
      const response = await api.get("/custom-roles");
      setCustomRoles(response.data?.data || []);
    } catch (error) {
      console.error("Failed to load roles:", error);
    }
  };

  // Roles usable for a user of this organization
  const rolesForOrg = (orgId) =>
    customRoles.filter((r) => !isSuperAdmin || !orgId || String(r.admin_id) === String(orgId));

  const openRoleModal = (role = null) => {
    setEditingRole(role);
    setRoleForm({
      name: role?.name || "",
      description: role?.description || "",
      baseRole: role?.baseRole || "User",
      adminId: role?.admin_id || organizations[0]?.id || "",
    });
    setShowRoleModal(true);
  };

  const saveRole = async (event) => {
    event.preventDefault();
    if (!roleForm.name.trim()) {
      showToast("Role name is required.", "error");
      return;
    }
    setSavingRole(true);
    try {
      const body = {
        name: roleForm.name.trim(),
        description: roleForm.description.trim(),
        baseRole: roleForm.baseRole,
        ...(isSuperAdmin && !editingRole ? { adminId: roleForm.adminId } : {}),
      };
      const response = editingRole
        ? await api.put(`/custom-roles/${editingRole._id}`, body)
        : await api.post("/custom-roles", body);
      showToast(response.data?.message || "Role saved.");
      setShowRoleModal(false);
      await Promise.all([fetchCustomRoles(), fetchUsers()]);
    } catch (error) {
      showToast(error.response?.data?.message || "Failed to save the role.", "error");
    } finally {
      setSavingRole(false);
    }
  };

  const deleteRole = async (role) => {
    if (!window.confirm(`Delete the role "${role.name}"?`)) return;
    try {
      const response = await api.delete(`/custom-roles/${role._id}`);
      showToast(response.data?.message || "Role deleted.");
      fetchCustomRoles();
    } catch (error) {
      showToast(error.response?.data?.message || "Failed to delete the role.", "error");
    }
  };

  // Forgot-password requests waiting for this administrator
  const [resetRequests, setResetRequests] = useState([]);
  const [resendingId, setResendingId] = useState(null);

  const fetchResetRequests = async () => {
    if (!canEditUsers) return;
    try {
      const response = await api.get("/password-requests");
      setResetRequests(response.data?.data || []);
    } catch (error) {
      console.error("Failed to load password requests:", error);
    }
  };

  const resendVerification = async (user) => {
    setResendingId(user.id);
    try {
      const response = await api.post(`/users/${user.id}/resend-verification`);
      showToast(response.data?.message || "Verification email sent.");
    } catch (error) {
      showToast(
        error.response?.data?.message || "Failed to resend the verification email.",
        "error"
      );
    } finally {
      setResendingId(null);
    }
  };

  const dismissResetRequest = async (request) => {
    try {
      await api.patch(`/password-requests/${request._id}/dismiss`);
      setResetRequests((prev) => prev.filter((r) => r._id !== request._id));
      showToast("Request dismissed.");
    } catch (error) {
      showToast(error.response?.data?.message || "Failed to dismiss the request.", "error");
    }
  };

  const [showUserModal, setShowUserModal] = useState(false);
  const [showDepartmentModal, setShowDepartmentModal] =
    useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDeleteDeptModal, setShowDeleteDeptModal] =
    useState(false);

  const [editingUser, setEditingUser] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);
  const [deleteDept, setDeleteDept] = useState(null);
  const [membersDept, setMembersDept] = useState(null); // department card → "View members"

  const emptyUserForm = {
    name: "",
    email: "",
    password: "",
    phone: "",
    department: "",
    role: "User",
    adminId: "",
  };

  const [userForm, setUserForm] = useState(emptyUserForm);

  const [departmentForm, setDepartmentForm] = useState({
    name: "",
    description: "",
    refPrefix: "",
  });

  // Same idea as the server: "Finance Flow" → FF, "Development" → DEV
  const suggestRefPrefix = (name) => {
    const words = String(name || "").toUpperCase().replace(/[^A-Z ]+/g, " ").split(/\s+/).filter(Boolean);
    if (!words.length) return "";
    return words.length > 1 ? words.map((w) => w[0]).join("").slice(0, 6) : words[0].slice(0, 3);
  };
  const [refPrefixTouched, setRefPrefixTouched] = useState(false);

  // Department card → change its reference code
  const [editingPrefixId, setEditingPrefixId] = useState(null);
  const [prefixDraft, setPrefixDraft] = useState("");
  const savePrefix = async (dept) => {
    const value = prefixDraft.trim().toUpperCase();
    if (!/^[A-Z]{1,6}$/.test(value)) {
      showToast("Reference code must be 1–6 letters (e.g. FF).", "error");
      return;
    }
    try {
      await api.patch(`/departments/${dept.id}`, { refPrefix: value });
      setEditingPrefixId(null);
      await fetchDepartments();
      showToast(`New ${dept.name} tasks will be numbered ${value}1, ${value}2…`);
    } catch (error) {
      showToast(error.response?.data?.message || "Failed to update the reference code.", "error");
    }
  };

  // Add Department → also put people in it: pick existing users or create new ones
  const emptyDeptMember = { name: "", email: "", phone: "", password: "", role: "User" };
  const [deptUserMode, setDeptUserMode] = useState("existing");
  const [deptMemberIds, setDeptMemberIds] = useState([]);
  const [deptMemberSearch, setDeptMemberSearch] = useState("");
  const [deptPickerOpen, setDeptPickerOpen] = useState(false);
  const [deptNewMembers, setDeptNewMembers] = useState([]);
  const [savingDepartment, setSavingDepartment] = useState(false);

  const closeDepartmentModal = () => {
    setShowDepartmentModal(false);
    setDepartmentForm({ name: "", description: "", refPrefix: "" });
    setRefPrefixTouched(false);
    setDeptUserMode("existing");
    setDeptMemberIds([]);
    setDeptMemberSearch("");
    setDeptPickerOpen(false);
    setDeptNewMembers([]);
  };

  // Add User → "+ Create new department" right inside the Department dropdown
  const [newDeptName, setNewDeptName] = useState("");
  const [creatingInlineDept, setCreatingInlineDept] = useState(false);
  const [showInlineDept, setShowInlineDept] = useState(false);
  useEffect(() => {
    if (!showUserModal) {
      setShowInlineDept(false);
      setNewDeptName("");
    }
  }, [showUserModal]);

  const fileInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);

  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({
      message,
      type,
    });

    setTimeout(() => {
      setToast(null);
    }, 2800);
  };

  /* =========================================================
     FETCH USERS
  ========================================================= */

  const fetchUsers = async () => {
    try {
      const response = await api.get("/users");

      const apiUsers = Array.isArray(response.data)
        ? response.data
        : response.data?.data || [];

      setUsers(
        apiUsers.map((user) => ({
          id: user._id || user.id,
          name: user.name || "",
          email: user.email || "",
          phone: user.phone || "",
          department: user.department || "",
          role: user.role || "User",
          status: user.status || "Active",
          adminId: user.admin_id || "",
          organization: user.organization?.name || "",
          // false → created by an admin, email link not opened yet
          emailVerified: user.emailVerified !== false,
          customRoleId: user.customRole || "",
          customRoleName: user.customRoleName || "",
          avatar:
            user.avatar ||
            user.name?.charAt(0)?.toUpperCase() ||
            "U",
        }))
      );
    } catch (error) {
      console.error("Failed to fetch users:", error);

      showToast(
        error.response?.status === 401
          ? "Session expired. Please log in again."
          : error.response?.data?.message ||
              "Failed to load users from server.",
        "error"
      );
    }
  };

  /* =========================================================
     FETCH DEPARTMENTS
  ========================================================= */

  const fetchDepartments = async () => {
  try {
    const response = await api.get("/departments", {
      params: {
        _t: Date.now(),
      },
    });

    console.log(
      "FULL DEPARTMENT API:",
      response.config.baseURL + response.config.url
    );

    console.log(
      "DEPARTMENT RESPONSE:",
      response.data
    );

    const apiDepts = Array.isArray(response.data)
      ? response.data
      : Array.isArray(response.data?.data)
      ? response.data.data
      : Array.isArray(response.data?.departments)
      ? response.data.departments
      : [];

    setDepartments(
      apiDepts
        .filter(Boolean)
        .map((dept) => ({
          id: dept._id || dept.id,
          name: dept.name || "",
          description:
            dept.description || "Organization department",
          status: dept.status || "Active",
          refPrefix: dept.refPrefix || "",
          nextReferenceId: dept.nextReferenceId || "",
        }))
    );
  } catch (error) {
    console.error(
      "GET /api/departments FAILED:",
      error
    );

    console.error(
      "Backend response:",
      error.response?.data
    );

    showToast(
      error.response?.data?.message ||
        "Failed to load departments.",
      "error"
    );
  }
};

  /* =========================================================
     FETCH ROLE OPTIONS (+ organizations for SuperAdmin)
  ========================================================= */

  const fetchRoleOptions = async () => {
    try {
      const response = await api.get("/permissions/catalog");
      setAssignableRoles(response.data?.data?.assignableRoles || []);
    } catch (error) {
      console.error("Failed to load role options:", error);
    }

    if (isSuperAdmin) {
      try {
        const response = await api.get("/admins");
        setOrganizations(
          (response.data?.data || []).map((admin) => ({
            id: admin._id,
            name: admin.name,
          }))
        );
      } catch (error) {
        console.error("Failed to load organizations:", error);
      }
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchDepartments();
    fetchRoleOptions();
    fetchResetRequests();
    fetchCustomRoles();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================================================
     FILTER USERS
  ========================================================= */

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const query = search.toLowerCase().trim();

      const matchesSearch =
        !query ||
        user.name?.toLowerCase().includes(query) ||
        user.email?.toLowerCase().includes(query) ||
        user.phone?.includes(query);

      const matchesDepartment =
        department === "All Departments" ||
        user.department === department;

      const matchesRole =
        role === "All Roles" ||
        (role.startsWith("custom:")
          ? String(user.customRoleId) === role.slice(7)
          : user.role === role && !user.customRoleId);

      return (
        matchesSearch &&
        matchesDepartment &&
        matchesRole
      );
    });
  }, [
    users,
    search,
    department,
    role,
  ]);

  // one page of users at a time (a new search / filter goes back to page 1)
  const userPage = usePagination(filteredUsers, { id: "users", resetKey: `${search}|${department}|${role}` });

  // "Select all" → bulk delete (never your own account)
  const myId = String(sessionUser?._id || sessionUser?.id || "");
  const selectableUserIds = useMemo(
    () => (canDeleteUsers ? filteredUsers.filter((u) => u.id && String(u.id) !== myId).map((u) => u.id) : []),
    [filteredUsers, canDeleteUsers, myId]
  );
  const userSelect = useBulkSelect(selectableUserIds);

  const deleteSelectedUsers = async (ids) => {
    const results = await Promise.allSettled(ids.map((id) => api.delete(`/users/${id}`)));
    const deleted = ids.filter((id, i) => results[i].status === "fulfilled");
    setUsers((previous) => previous.filter((user) => !deleted.includes(String(user.id))));
    if (!deleted.length && results[0]?.status === "rejected") throw results[0].reason;
    return deleted;
  };

  /* =========================================================
     STATS
  ========================================================= */

  const totalUsers = users.length;

  const totalDepartments = departments.length;

  const totalAdmins = users.filter(
    (user) => user.role === "Admin"
  ).length;

  const totalManagers = users.filter(
    (user) => user.role === "Manager"
  ).length;

  const activeUsers = users.filter(
    (user) => user.status === "Active"
  ).length;

  /* =========================================================
     DEPARTMENT STATS
  ========================================================= */

  const departmentStats = useMemo(() => {
    return departments.map((dept) => ({
      ...dept,
      count: users.filter(
        (user) => user.department === dept.name
      ).length,
    }));
  }, [users, departments]);

  const deptPage = usePagination(departmentStats, { id: "departments", pageSize: 20 });

  const maxDepartmentCount = Math.max(
    ...departmentStats.map(
      (item) => item.count
    ),
    1
  );

  const deptMemberCount = deleteDept
    ? users.filter(
        (user) =>
          user.department === deleteDept.name
      ).length
    : 0;

  /* =========================================================
     ACTIVITY TREND
  ========================================================= */

  const activityTrend = useMemo(() => {
    const base = Math.max(totalUsers, 1);

    return [
      Math.round(base * 0.35),
      Math.round(base * 0.55),
      Math.round(base * 0.48),
      Math.round(base * 0.7),
      Math.round(base * 0.85),
      base,
    ];
  }, [totalUsers]);

  const chartW = 600;
  const chartH = 190;

  const maxTrend = Math.max(
    ...activityTrend,
    1
  );

  const chartPoints = activityTrend.map(
    (value, index) => ({
      x:
        14 +
        (index * (chartW - 28)) /
          (activityTrend.length - 1),

      y:
        16 +
        (1 - value / maxTrend) *
          (chartH - 40),
    })
  );

  const linePath = chartPoints
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(
          1
        )},${point.y.toFixed(1)}`
    )
    .join(" ");

  const areaPath = `${linePath} L ${
    chartW - 14
  },${chartH - 2} L 14,${
    chartH - 2
  } Z`;

  /* =========================================================
     FILTER CLEAR
  ========================================================= */

  const clearFilters = () => {
    setSearch("");
    setDepartment("All Departments");
    setRole("All Roles");
  };

  /* =========================================================
     ADD USER
  ========================================================= */

  const openAddUser = () => {
    setEditingUser(null);

    setUserForm({
      ...emptyUserForm,
      role: assignableRoles.some((r) => r.value === "User")
        ? "User"
        : assignableRoles[0]?.value || "User",
      adminId: organizations[0]?.id || "",
      department:
        departments[0]?.name || "",
    });

    setShowUserModal(true);
  };

  /* =========================================================
     EDIT USER
  ========================================================= */

  const openEditUser = (user) => {
    setEditingUser(user);

    setUserForm({
      name: user.name || "",
      email: user.email || "",
      password: "",
      phone: user.phone || "",
      department: user.department || "",
      // organization-defined role shows as "custom:<id>" in the dropdown
      role: user.customRoleId ? `custom:${user.customRoleId}` : user.role || "User",
      adminId: user.adminId || "",
    });

    setShowUserModal(true);
  };

  /* =========================================================
     DELETE USER
  ========================================================= */

  const openDeleteUser = (user) => {
    setDeleteUser(user);
    setShowDeleteModal(true);
  };

  /* =========================================================
     DELETE DEPARTMENT
  ========================================================= */

  const openDeleteDept = (dept) => {
    setDeleteDept(dept);
    setShowDeleteDeptModal(true);
  };

  /* =========================================================
     SAVE USER
  ========================================================= */

  const handleSaveUser = async (event) => {
    event.preventDefault();

    if (
      !userForm.name.trim() ||
      !userForm.email.trim() ||
      !userForm.phone.trim() ||
      !userForm.department ||
      !userForm.role
    ) {
      showToast(
        "Please complete all required fields.",
        "error"
      );

      return;
    }

    if (
      !editingUser &&
      !userForm.password.trim()
    ) {
      showToast(
        "Password is required for a new user.",
        "error"
      );

      return;
    }

    if (
      isSuperAdmin &&
      !editingUser &&
      userForm.role !== "Admin" &&
      !userForm.adminId
    ) {
      showToast(
        "Select the organization (Admin) for this user.",
        "error"
      );

      return;
    }

    if (
      userForm.password.trim() &&
      userForm.password.trim().length < 6
    ) {
      showToast(
        "Password must be at least 6 characters.",
        "error"
      );

      return;
    }

    try {
      if (editingUser) {
        await api.put(
          `/users/${editingUser.id}`,
          {
            name: userForm.name.trim(),
            email: userForm.email.trim(),
            phone: userForm.phone.trim(),
            department: userForm.department,
            status:
              editingUser.status || "Active",
            // only sent when changed — role changes need users.assign
            ...(() => {
              const before = editingUser.customRoleId ? `custom:${editingUser.customRoleId}` : editingUser.role;
              if (userForm.role === before) return {};
              return userForm.role.startsWith("custom:")
                ? { customRoleId: userForm.role.slice(7) }
                : { role: userForm.role, ...(editingUser.customRoleId ? { customRoleId: "" } : {}) };
            })(),
            // Admin-set new password → user receives a one-time link to view it
            ...(userForm.password.trim()
              ? { password: userForm.password.trim() }
              : {}),
          }
        ).then((response) => {
          showToast(
            response.data?.message || "User updated successfully."
          );
        });

        if (userForm.password.trim()) {
          await fetchResetRequests();
        }
      } else {
        const response = await api.post(
          "/users",
          {
            name: userForm.name.trim(),
            email: userForm.email.trim(),
            password:
              userForm.password.trim(),
            phone: userForm.phone.trim(),
            department:
              userForm.department,
            status: "Active",
            ...(userForm.role.startsWith("custom:")
              ? { customRoleId: userForm.role.slice(7) }
              : { role: userForm.role }),
            ...(isSuperAdmin && userForm.role !== "Admin"
              ? { adminId: userForm.adminId }
              : {}),
          }
        );

        const createdUser =
          response.data?.data ||
          response.data;

        if (
          !createdUser?._id &&
          !createdUser?.id
        ) {
          throw new Error(
            "Server did not return the created user."
          );
        }

        showToast(
          response.data?.message ||
            "New user added successfully.",
          response.data?.emailSent === false ? "error" : "success"
        );
      }

      setShowUserModal(false);
      setEditingUser(null);
      setUserForm(emptyUserForm);

      await fetchUsers();
    } catch (error) {
      console.error(
        "User save failed:",
        error
      );

      showToast(
        error.response?.data?.message ||
          error.message ||
          "Failed to save user.",
        "error"
      );
    }
  };

  /* =========================================================
     ADD DEPARTMENT
  ========================================================= */

  const handleAddDepartment = async (event) => {
    event.preventDefault();

    const name = departmentForm.name.trim();
    const description =
      departmentForm.description.trim() ||
      "Organization department";

    if (!name) {
      showToast("Department name is required.", "error");
      return;
    }

    const exists = departments.some(
      (dept) =>
        dept.name?.trim().toLowerCase() ===
        name.toLowerCase()
    );

    if (exists) {
      showToast("Department already exists.", "error");
      return;
    }

    // new people typed into the dialog — checked before anything is saved
    const newMembers = deptNewMembers.filter((m) =>
      [m.name, m.email, m.phone, m.password].some((v) => v.trim())
    );
    for (const m of newMembers) {
      if (!m.name.trim() || !m.email.trim() || !m.password.trim()) {
        showToast("Each new user needs a name, email and password.", "error");
        return;
      }
      if (!/^\S+@\S+\.\S+$/.test(m.email.trim())) {
        showToast(`"${m.email}" is not a valid email address.`, "error");
        return;
      }
      if (m.password.trim().length < 6) {
        showToast(`Password for ${m.name.trim()} must be at least 6 characters.`, "error");
        return;
      }
    }

    // a code the user typed is sent; otherwise the server picks one that no other department uses
    const refPrefix = refPrefixTouched ? departmentForm.refPrefix.trim().toUpperCase() : "";
    if (refPrefix && !/^[A-Z]{1,6}$/.test(refPrefix)) {
      showToast("Reference code must be 1–6 letters (e.g. FF).", "error");
      return;
    }

    const payload = {
      name,
      description,
      status: "Active",
      ...(refPrefix ? { refPrefix } : {}),
    };

    if (savingDepartment) return;
    setSavingDepartment(true);

    try {
      console.log("POST /api/departments:", payload);

      const response = await api.post(
        "/departments",
        payload
      );

      console.log(
        "POST /api/departments response:",
        response.data
      );

      const created =
        response.data?.data || response.data;

      if (!created?._id && !created?.id) {
        throw new Error(
          "Backend did not return the created department."
        );
      }

      // put the chosen / new people in the department
      const results = await Promise.allSettled([
        ...deptMemberIds.map((id) =>
          api.put(`/users/${id}`, { department: created.name || name })
        ),
        ...newMembers.map((m) =>
          api.post("/users", {
            name: m.name.trim(),
            email: m.email.trim(),
            phone: m.phone.trim(),
            password: m.password.trim(),
            department: created.name || name,
            status: "Active",
            role: m.role,
          })
        ),
      ]);
      const failed = results.filter((r) => r.status === "rejected");
      const added = results.length - failed.length;

      closeDepartmentModal();

      // Always reload from MongoDB. Do not add a fake Date.now() ID.
      await fetchDepartments();
      if (results.length) await fetchUsers();

      if (failed.length) {
        showToast(
          `Department created${added ? `, ${added} user${added === 1 ? "" : "s"} added` : ""}. ` +
            `${failed.length} could not be added: ${failed[0].reason?.response?.data?.message || failed[0].reason?.message || "error"}`,
          "error"
        );
      } else {
        showToast(
          added
            ? `Department created with ${added} user${added === 1 ? "" : "s"}.`
            : "Department created successfully."
        );
      }
    } catch (error) {
      console.error("Department create failed:", error);
      console.error(
        "Department backend response:",
        error.response?.data
      );

      showToast(
        error.response?.data?.message ||
          error.message ||
          "Failed to create department in backend.",
        "error"
      );
    } finally {
      setSavingDepartment(false);
    }
  };

  // Add User form → create a department without leaving the form
  const handleInlineDepartment = async () => {
    const name = newDeptName.trim();
    if (!name) {
      showToast("Enter the new department's name.", "error");
      return;
    }
    const existing = departments.find((d) => d.name?.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      // already there → just pick it
      setUserForm((f) => ({ ...f, department: existing.name }));
      setShowInlineDept(false);
      setNewDeptName("");
      return;
    }
    setCreatingInlineDept(true);
    try {
      const response = await api.post("/departments", {
        name,
        description: "Organization department",
        status: "Active",
        ...(isSuperAdmin && userForm.adminId ? { adminId: userForm.adminId } : {}),
      });
      const created = response.data?.data || response.data;
      await fetchDepartments();
      setUserForm((f) => ({ ...f, department: created?.name || name }));
      setShowInlineDept(false);
      setNewDeptName("");
      showToast(`Department "${created?.name || name}" created.`);
    } catch (error) {
      showToast(error.response?.data?.message || "Failed to create department.", "error");
    } finally {
      setCreatingInlineDept(false);
    }
  };

  /* =========================================================
     DELETE DEPARTMENT
  ========================================================= */

  const confirmDeleteDept = async () => {
    if (!deleteDept) return;

    const departmentId =
      deleteDept.id || deleteDept._id;

    if (!departmentId) {
      showToast("Department ID is missing.", "error");
      return;
    }

    try {
      await api.delete(
        `/departments/${departmentId}`
      );

      await fetchDepartments();

      setShowDeleteDeptModal(false);
      setDeleteDept(null);

      showToast("Department deleted successfully.");
    } catch (error) {
      console.error("Department delete failed:", error);
      console.error(
        "Department backend response:",
        error.response?.data
      );

      showToast(
        error.response?.data?.message ||
          "Failed to delete department from backend.",
        "error"
      );
    }
  };

  /* =========================================================
     DELETE USER
  ========================================================= */

  const confirmDelete = async () => {
    if (!deleteUser) return;

    try {
      await api.delete(
        `/users/${deleteUser.id}`
      );

      setUsers((previous) =>
        previous.filter(
          (user) =>
            user.id !== deleteUser.id
        )
      );

      setShowDeleteModal(false);

      showToast(
        "User deleted successfully."
      );

      setDeleteUser(null);
    } catch (error) {
      console.error(
        "User delete failed:",
        error
      );

      showToast(
        error.response?.data?.message ||
          "Failed to delete user.",
        "error"
      );
    }
  };

  /* =========================================================
     CSV TEMPLATE
  ========================================================= */

  const downloadCSVTemplate = () => {
    const csv = [
      "Full Name,Email,Phone,Department,Role,Password",
      "John Doe,john@example.com,9876543210,Development,Team Member,ChangeMe#1",
      "Jane Smith,jane@example.com,9876543211,Marketing,Manager,ChangeMe#2",
    ].join("\n");

    const blob = new Blob(
      [csv],
      {
        type: "text/csv;charset=utf-8;",
      }
    );

    const url =
      URL.createObjectURL(blob);

    const link =
      document.createElement("a");

    link.href = url;
    link.download =
      "users-import-template.csv";

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    URL.revokeObjectURL(url);

    showToast(
      "CSV template downloaded."
    );
  };

  /* =========================================================
     FILE CHANGE
  ========================================================= */

  const handleFileChange = (event) => {
    const file =
      event.target.files?.[0];

    if (!file) return;

    if (
      !file.name
        .toLowerCase()
        .endsWith(".csv")
    ) {
      showToast(
        "Please upload a CSV file.",
        "error"
      );

      return;
    }

    setSelectedFile(file);
  };

  /* =========================================================
     CSV PARSER
  ========================================================= */

  const parseCSV = (text) => {
    const lines =
      text.trim().split(/\r?\n/);

    const headers = lines[0]
      .split(",")
      .map((header) =>
        header.trim()
      );

    return lines
      .slice(1)
      .map((line) => {
        const values = line
          .split(",")
          .map((value) =>
            value.trim()
          );

        const row = {};

        headers.forEach(
          (header, index) => {
            row[header] =
              values[index] || "";
          }
        );

        return row;
      });
  };

  /* =========================================================
     IMPORT USERS
  ========================================================= */

  const handleImport = async () => {
    if (!selectedFile) {
      showToast(
        "Please choose a CSV file first.",
        "error"
      );

      return;
    }

    try {
      const text =
        await selectedFile.text();

      const rows =
        parseCSV(text);

      if (!rows.length) {
        showToast(
          "The CSV file is empty.",
          "error"
        );

        return;
      }

      let successCount = 0;
      let failCount = 0;
      const failures = [];

      for (const row of rows) {
        // Every account needs its own password — no shared default
        const rowPassword = String(row["Password"] || row.password || "").trim();
        if (rowPassword.length < 6) {
          failCount += 1;
          failures.push(
            `${row["Email"] || row.email || "row"}: Password column missing or shorter than 6 characters`
          );
          continue;
        }

        try {
          await api.post(
            "/users",
            {
              name:
                row["Full Name"] ||
                row.name ||
                "",

              email:
                row["Email"] ||
                row.email ||
                "",

              phone:
                row["Phone"] ||
                row.phone ||
                "",

              department:
                row["Department"] ||
                row.department ||
                "",

              password: rowPassword,

              role: toRoleValue(
                row["Role"] || row.role
              ),
              ...(isSuperAdmin
                ? {
                    adminId:
                      row["Admin ID"] ||
                      organizations[0]?.id ||
                      "",
                  }
                : {}),
            }
          );

          successCount += 1;
        } catch (error) {
          failCount += 1;
          failures.push(
            `${row["Email"] || row.email || "row"}: ${
              error.response?.data?.message ||
              "failed"
            }`
          );
        }
      }

      await fetchUsers();

      if (failCount === 0) {
        showToast(
          `${successCount} users imported successfully.`
        );
      } else {
        console.warn("User import failures:", failures);
        showToast(
          `${successCount} imported, ${failCount} failed. ${
            failures[0] || ""
          }`,
          "error"
        );
      }

      setSelectedFile(null);
      setShowBulkModal(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error(
        "Import failed:",
        error
      );

      showToast(
        "Failed to import users.",
        "error"
      );
    }
  };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="users-page">
      <style>{APP_LINK_CSS + `

        /* =====================================================
           GLOBAL
        ===================================================== */

        * {
          box-sizing: border-box;
        }

        html,
        body,
        #root {
          margin: 0;
          min-height: 100%;
          background:
            linear-gradient(
              180deg,
              #e9f7fa 0%,
              #f5fbfd 48%,
              #edf8fb 100%
            );
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        button,
        input,
        select,
        textarea {
          font: inherit;
        }

        button {
          cursor: pointer;
        }

        /* =====================================================
           PAGE
        ===================================================== */

        .users-page {
          min-height: 100vh;
          padding: 24px 4%;
          color: #153b59;
          position: relative;
          overflow-x: hidden;

          background:
            radial-gradient(
              circle at 8% 10%,
              rgba(56, 189, 248, 0.13),
              transparent 26%
            ),
            radial-gradient(
              circle at 94% 20%,
              rgba(14, 165, 233, 0.09),
              transparent 27%
            ),
            linear-gradient(
              180deg,
              #eaf8fa 0%,
              #f7fcfd 52%,
              #edf8fb 100%
            );
        }

        .users-page::before {
          content: "";
          position: fixed;
          width: 420px;
          height: 420px;
          border-radius: 50%;
          right: -180px;
          top: 230px;
          background:
            radial-gradient(
              circle,
              rgba(14, 165, 233, 0.10),
              transparent 68%
            );
          pointer-events: none;
        }

        .users-page::after {
          content: "";
          position: fixed;
          width: 340px;
          height: 340px;
          border-radius: 50%;
          left: -180px;
          bottom: 80px;
          background:
            radial-gradient(
              circle,
              rgba(2, 132, 199, 0.08),
              transparent 68%
            );
          pointer-events: none;
        }

        .users-shell {
          width: min(1380px, 100%);
          margin: 0 auto;
          position: relative;
          z-index: 2;
        }

        /* =====================================================
           HERO
        ===================================================== */

        .users-hero {
          position: relative;
          overflow: hidden;

          min-height: 158px;
          padding: 28px 30px;

          border-radius: 24px;

          background:
            linear-gradient(
              135deg,
              #123f67 0%,
              #14577d 48%,
              #0f6b8f 100%
            );

          box-shadow:
            0 22px 48px
              rgba(16, 69, 101, 0.20);

          border: 1px solid
            rgba(255, 255, 255, 0.18);

          animation:
            heroEnter 0.65s ease both;
        }

        .users-hero::before {
          content: "";
          position: absolute;
          width: 300px;
          height: 300px;
          border-radius: 50%;
          right: -110px;
          top: -150px;

          background:
            radial-gradient(
              circle,
              rgba(103, 232, 249, 0.28),
              transparent 68%
            );
        }

        .users-hero::after {
          content: "";
          position: absolute;
          width: 220px;
          height: 220px;
          border-radius: 50%;
          left: 44%;
          bottom: -170px;

          border: 1px solid
            rgba(125, 211, 252, 0.20);
        }

        .hero-content {
          position: relative;
          z-index: 2;

          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        .hero-title-wrap {
          display: flex;
          align-items: center;
          gap: 18px;
        }

        .hero-icon {
          width: 52px;
          height: 52px;
          border-radius: 16px;

          display: flex;
          align-items: center;
          justify-content: center;

          color: #075985;

          background:
            linear-gradient(
              145deg,
              #b9f4ff,
              #67e8f9
            );

          box-shadow:
            0 10px 25px
              rgba(34, 211, 238, 0.22);

          animation:
            iconFloat 3.5s ease-in-out infinite;
        }

        .hero-title {
          margin: 0;

          color: #ffffff;

          font-size: 25px;
          line-height: 1.2;
          font-weight: 800;
          letter-spacing: -0.5px;
        }

        .hero-subtitle {
          margin: 6px 0 0;

          color:
            rgba(231, 248, 255, 0.76);

          font-size: 12px;
        }

        .hero-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .hero-btn {
          height: 38px;
          padding: 0 14px;

          display: inline-flex;
          align-items: center;
          gap: 7px;

          border-radius: 11px;

          border: 1px solid
            rgba(255, 255, 255, 0.22);

          background:
            rgba(255, 255, 255, 0.09);

          color: #ffffff;

          font-size: 11px;
          font-weight: 700;

          transition:
            transform 0.2s ease,
            background 0.2s ease,
            box-shadow 0.2s ease;
        }

        .hero-btn:hover {
          transform: translateY(-2px);

          background:
            rgba(255, 255, 255, 0.16);

          box-shadow:
            0 9px 22px
              rgba(0, 0, 0, 0.12);
        }

        .hero-btn.primary {
          background:
            linear-gradient(
              135deg,
              #9eefff,
              #4dd9f2
            );

          color: #0b4666;

          border-color:
            rgba(255, 255, 255, 0.30);
        }

        .hero-btn.primary:hover {
          background:
            linear-gradient(
              135deg,
              #c3f7ff,
              #67e8f9
            );
        }

        .hero-mini-stats {
          position: relative;
          z-index: 2;

          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 25px;

          margin-top: 25px;
        }

        .hero-mini-stat {
          display: flex;
          align-items: center;
          gap: 7px;

          color:
            rgba(233, 249, 255, 0.78);

          font-size: 10px;
        }

        .hero-mini-stat svg {
          color: #8beeff;
        }

        .hero-mini-stat strong {
          color: #ffffff;
          margin-left: 2px;
        }

        /* =====================================================
           STAT CARDS
        ===================================================== */

        .stats-grid {
          display: grid;

          grid-template-columns:
            repeat(4, minmax(0, 1fr));

          gap: 14px;

          margin-top: 16px;
        }

        .stat-card {
          position: relative;
          overflow: hidden;

          min-height: 112px;
          padding: 17px;

          border-radius: 17px;

          background:
            linear-gradient(
              145deg,
              rgba(255, 255, 255, 0.98),
              rgba(246, 252, 254, 0.98)
            );

          border: 1px solid
            rgba(32, 120, 150, 0.11);

          box-shadow:
            0 12px 30px
              rgba(25, 86, 112, 0.09);

          transition:
            transform 0.28s ease,
            box-shadow 0.28s ease,
            border-color 0.28s ease;

          animation:
            cardEnter 0.65s ease both;
        }

        .stat-card:nth-child(1) {
          animation-delay: 0.08s;
        }

        .stat-card:nth-child(2) {
          animation-delay: 0.14s;
        }

        .stat-card:nth-child(3) {
          animation-delay: 0.20s;
        }

        .stat-card:nth-child(4) {
          animation-delay: 0.26s;
        }

        .stat-card:hover {
          transform: translateY(-5px);

          box-shadow:
            0 20px 40px
              rgba(19, 91, 123, 0.14);

          border-color:
            rgba(14, 165, 233, 0.27);
        }

        .stat-card::before {
          content: "";
          position: absolute;

          top: 0;
          left: 0;
          right: 0;

          height: 3px;

          background:
            linear-gradient(
              90deg,
              #075985,
              #0ea5e9
            );
        }

        .stat-card:nth-child(2)::before {
          background:
            linear-gradient(
              90deg,
              #0e7490,
              #38bdf8
            );
        }

        .stat-card:nth-child(3)::before {
          background:
            linear-gradient(
              90deg,
              #1d4ed8,
              #60a5fa
            );
        }

        .stat-card:nth-child(4)::before {
          background:
            linear-gradient(
              90deg,
              #0369a1,
              #22d3ee
            );
        }

        .stat-glow {
          position: absolute;
          width: 110px;
          height: 110px;

          border-radius: 50%;

          right: -38px;
          top: -45px;

          background:
            radial-gradient(
              circle,
              rgba(14, 165, 233, 0.14),
              transparent 68%
            );
        }

        .stat-icon {
          width: 31px;
          height: 31px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 9px;

          color: #0284c7;

          background:
            #effaff;

          border: 1px solid
            #d2f3fb;
        }

        .stat-card:nth-child(2)
          .stat-icon {
          color: #2563eb;
          background: #eff6ff;
          border-color: #dbeafe;
        }

        .stat-card:nth-child(3)
          .stat-icon {
          color: #0369a1;
          background: #eff9ff;
          border-color: #d7effb;
        }

        .stat-card:nth-child(4)
          .stat-icon {
          color: #0e7490;
          background: #ecfeff;
          border-color: #cffafe;
        }

        .stat-label {
          margin-top: 11px;

          color: #64869a;

          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stat-value {
          margin-top: 4px;

          color: #102f49;

          font-size: 24px;
          line-height: 1;
          font-weight: 800;
        }

        .stat-meta {
          position: absolute;
          right: 15px;
          top: 20px;

          display: flex;
          align-items: center;
          gap: 3px;

          color: #0284c7;

          font-size: 8px;
          font-weight: 800;
        }

        /* =====================================================
           ANALYTICS
        ===================================================== */

        .analytics-grid {
          display: grid;

          grid-template-columns:
            minmax(0, 1.65fr)
            minmax(320px, 0.9fr);

          gap: 14px;

          margin-top: 16px;
        }

        .chart-card {
          position: relative;
          overflow: hidden;

          border-radius: 17px;

          background:
            rgba(255, 255, 255, 0.96);

          border: 1px solid
            rgba(32, 120, 150, 0.11);

          box-shadow:
            0 12px 30px
              rgba(25, 86, 112, 0.08);

          animation:
            cardEnter 0.7s ease both;

          transition:
            transform 0.25s ease,
            box-shadow 0.25s ease;
        }

        .chart-card:hover {
          transform: translateY(-3px);

          box-shadow:
            0 18px 38px
              rgba(20, 85, 112, 0.12);
        }

        .chart-card-header {
          padding: 17px 18px 10px;

          display: flex;
          justify-content: space-between;
          align-items: flex-start;

          border-bottom: 1px solid
            rgba(42, 120, 150, 0.07);
        }

        .chart-title-wrap {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .chart-icon {
          width: 30px;
          height: 30px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 9px;

          color: #0284c7;

          background:
            #effaff;

          border: 1px solid
            #d5f1fa;
        }

        .chart-title {
          margin: 0;

          color: #183d5b;

          font-size: 11px;
          font-weight: 800;
        }

        .chart-subtitle {
          margin-top: 3px;

          color: #86a3b1;

          font-size: 7px;
        }

        .chart-total {
          text-align: right;
        }

        .chart-total strong {
          color: #0e3552;

          font-size: 17px;
        }

        .chart-total span {
          display: block;

          margin-top: 2px;

          color: #0284c7;

          font-size: 7px;
          font-weight: 800;
          text-transform: uppercase;
        }

        .chart-body {
          padding: 7px 13px 14px;
        }

        .activity-chart {
          width: 100%;
          height: 220px;
          display: block;
        }

        .chart-grid-line {
          stroke:
            rgba(32, 105, 140, 0.10);
          stroke-width: 1;
        }

        .chart-area {
          fill:
            url(#usersOceanArea);
        }

        .chart-line {
          fill: none;
          stroke: #0284c7;
          stroke-width: 3;
          stroke-linecap: round;
          stroke-linejoin: round;

          filter:
            drop-shadow(
              0 4px 7px
              rgba(2, 132, 199, 0.18)
            );
        }

        .chart-point {
          fill: #ffffff;
          stroke: #08a6d9;
          stroke-width: 3;
        }

        .chart-label {
          fill: #87a4b2;
          font-size: 8px;
        }

        /* =====================================================
           DEPARTMENT DISTRIBUTION
        ===================================================== */

        .distribution-body {
          padding: 17px;
        }

        .distribution-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .distribution-row {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .distribution-top {
          display: flex;
          align-items: center;
          justify-content: space-between;

          color: #456b80;

          font-size: 8px;
          font-weight: 700;
        }

        .distribution-top strong {
          color: #143c59;
          font-size: 8px;
        }

        .distribution-track {
          height: 7px;

          overflow: hidden;

          border-radius: 999px;

          background:
            #e8f3f7;
        }

        .distribution-fill {
          height: 100%;

          border-radius: 999px;

          background:
            linear-gradient(
              90deg,
              #075985,
              #0ea5e9,
              #67e8f9
            );

          box-shadow:
            0 2px 7px
              rgba(14, 165, 233, 0.20);

          transition:
            width 0.7s ease;
        }

        .empty-department {
          padding: 25px 12px;

          text-align: center;

          color: #88a4b1;

          font-size: 9px;
        }

        /* =====================================================
           TABS
        ===================================================== */

        .tabs-wrap {
          margin-top: 16px;

          display: inline-flex;

          padding: 3px;

          border-radius: 12px;

          background:
            rgba(255, 255, 255, 0.86);

          border: 1px solid
            rgba(32, 120, 150, 0.10);

          box-shadow:
            0 7px 18px
              rgba(24, 83, 108, 0.06);
        }

        .tab-btn {
          border: none;

          background: transparent;

          color: #7292a1;

          padding: 9px 16px;

          border-radius: 9px;

          display: flex;
          align-items: center;
          gap: 7px;

          font-size: 9px;
          font-weight: 800;

          transition:
            all 0.2s ease;
        }

        .tab-btn:hover {
          color: #155277;
        }

        .tab-btn.active {
          color: #ffffff;

          background:
            linear-gradient(
              135deg,
              #075985,
              #0e7490
            );

          box-shadow:
            0 6px 15px
              rgba(7, 89, 133, 0.20);
        }

        .tab-count {
          min-width: 19px;
          height: 18px;

          padding: 0 5px;

          display: inline-flex;
          align-items: center;
          justify-content: center;

          border-radius: 999px;

          background:
            rgba(14, 165, 233, 0.10);

          color: #0284c7;

          font-size: 8px;
        }

        .tab-btn.active
          .tab-count {
          color: #075985;

          background:
            #dff8ff;
        }

        /* =====================================================
           FILTER CARD
        ===================================================== */

        .filter-card {
          margin-top: 12px;

          padding: 13px;

          border-radius: 15px;

          display: flex;
          align-items: center;
          gap: 10px;

          background:
            rgba(255, 255, 255, 0.94);

          border: 1px solid
            rgba(32, 120, 150, 0.10);

          box-shadow:
            0 10px 24px
              rgba(25, 86, 112, 0.07);

          animation:
            cardEnter 0.65s ease both;
        }

        .search-box {
          flex: 1;

          height: 37px;

          position: relative;
        }

        .search-box svg {
          position: absolute;
          left: 12px;
          top: 50%;

          transform:
            translateY(-50%);

          color: #6f98aa;
        }

        .search-input {
          width: 100%;
          height: 100%;

          padding: 0 13px 0 35px;

          border-radius: 10px;

          border: 1px solid
            #dbeef4;

          outline: none;

          background:
            #f7fcfd;

          color: #173b59;

          font-size: 10px;

          transition:
            border 0.2s ease,
            box-shadow 0.2s ease;
        }

        .search-input::placeholder {
          color: #91a9b5;
        }

        .search-input:focus {
          border-color:
            #55bce0;

          box-shadow:
            0 0 0 3px
              rgba(14, 165, 233, 0.08);
        }

        .filter-select {
          height: 37px;

          min-width: 145px;

          padding: 0 30px 0 11px;

          border-radius: 10px;

          border: 1px solid
            #dbeef4;

          outline: none;

          background:
            #f7fcfd;

          color: #365b71;

          font-size: 9px;
          font-weight: 600;
        }

        .filter-select:focus {
          border-color: #55bce0;
        }

        .clear-filter-btn {
          height: 37px;

          padding: 0 12px;

          border: 1px solid
            #d9edf4;

          border-radius: 10px;

          color: #36728d;

          background: #f8fcfd;

          display: flex;
          align-items: center;
          gap: 5px;

          font-size: 9px;
          font-weight: 700;

          transition: all 0.2s ease;
        }

        .clear-filter-btn:hover {
          color: #075985;

          border-color:
            #9ddced;

          background: #edfaff;
        }

        /* =====================================================
           SECTION HEADER
        ===================================================== */

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;

          margin: 20px 2px 11px;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;

          color: #163d5a;

          font-size: 12px;
          font-weight: 800;
        }

        .section-title-icon {
          width: 26px;
          height: 26px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 8px;

          color: #0284c7;

          background: #effaff;
          border: 1px solid #d8f2fa;
        }

        .result-count {
          color: #7595a4;
          font-size: 9px;
        }

        .add-dept-btn {
          height: 32px;
          padding: 0 14px;

          display: inline-flex;
          align-items: center;
          gap: 6px;

          border: none;
          border-radius: 10px;

          background:
            linear-gradient(
              135deg,
              #075985,
              #0ea5e9
            );

          color: #ffffff;

          font-size: 9px;
          font-weight: 800;

          box-shadow:
            0 7px 18px
              rgba(7, 89, 133, 0.22);

          transition: all 0.2s ease;
        }

        .add-dept-btn:hover {
          transform: translateY(-2px);

          box-shadow:
            0 10px 22px
              rgba(7, 89, 133, 0.28);
        }

        /* =====================================================
           USER GRID
        ===================================================== */

        .users-grid {
          display: grid;

          grid-template-columns:
            repeat(3, minmax(0, 1fr));

          gap: 13px;
        }

        .user-card {
          position: relative;

          overflow: hidden;

          padding: 17px;

          min-height: 185px;

          border-radius: 16px;

          background:
            linear-gradient(
              145deg,
              #ffffff,
              #f8fcfd
            );

          border: 1px solid
            rgba(32, 120, 150, 0.11);

          box-shadow:
            0 10px 26px
              rgba(25, 86, 112, 0.08);

          animation:
            userCardEnter 0.55s ease both;

          transition:
            transform 0.25s ease,
            box-shadow 0.25s ease,
            border-color 0.25s ease;
        }

        .user-card:hover {
          transform:
            translateY(-5px);

          border-color:
            rgba(14, 165, 233, 0.28);

          box-shadow:
            0 18px 35px
              rgba(18, 85, 115, 0.13);
        }

        .user-card::before {
          content: "";

          position: absolute;

          left: 0;
          right: 0;
          top: 0;

          height: 3px;

          background:
            linear-gradient(
              90deg,
              #075985,
              #0ea5e9
            );
        }

        .user-card:nth-child(3n + 2)::before {
          background:
            linear-gradient(
              90deg,
              #1d4ed8,
              #38bdf8
            );
        }

        .user-card:nth-child(3n)::before {
          background:
            linear-gradient(
              90deg,
              #0369a1,
              #22d3ee
            );
        }

        .user-card-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .user-avatar {
          width: 42px;
          height: 42px;

          border-radius: 13px;

          display: flex;
          align-items: center;
          justify-content: center;

          color: #ffffff;

          font-size: 14px;
          font-weight: 800;

          background:
            linear-gradient(
              135deg,
              #075985,
              #0ea5e9
            );

          box-shadow:
            0 8px 18px
              rgba(2, 132, 199, 0.19);
        }

        .user-card:nth-child(3n + 2)
          .user-avatar {
          background:
            linear-gradient(
              135deg,
              #1d4ed8,
              #38bdf8
            );
        }

        .user-card:nth-child(3n)
          .user-avatar {
          background:
            linear-gradient(
              135deg,
              #0369a1,
              #22d3ee
            );
        }

        .user-menu-btn {
          width: 29px;
          height: 29px;

          border-radius: 8px;

          display: flex;
          align-items: center;
          justify-content: center;

          border: 1px solid
            #e0eef3;

          color: #7898a7;

          background: #f9fcfd;

          transition:
            all 0.2s ease;
        }

        .user-menu-btn:hover {
          color: #075985;

          border-color:
            #a7dceb;

          background:
            #edfaff;
        }

        /* =====================================================
           USER CARD ACTION BUTTONS  (EDIT + DELETE)
        ===================================================== */

        .user-card-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .user-action-btn {
          width: 29px;
          height: 29px;

          border-radius: 8px;

          display: flex;
          align-items: center;
          justify-content: center;

          border: 1px solid
            #e0eef3;

          color: #7898a7;

          background: #f9fcfd;

          transition:
            all 0.2s ease;
        }

        .user-action-btn.edit:hover {
          color: #0284c7;

          border-color:
            #a7dceb;

          background: #edfaff;

          transform: translateY(-1px);
        }

        .user-action-btn.delete {
          color: #b45d5d;
        }

        .user-action-btn.delete:hover {
          color: #dc2626;

          border-color: #fecaca;

          background: #fef2f2;

          transform: translateY(-1px);

          box-shadow:
            0 6px 14px
              rgba(220, 38, 38, 0.16);
        }

        .user-name {
          margin: 12px 0 2px;

          color: #143a57;

          font-size: 12px;
          font-weight: 800;
        }

        .user-role {
          color: #6f91a1;

          font-size: 8px;
          font-weight: 600;
        }

        .user-details {
          display: flex;
          flex-direction: column;
          gap: 7px;

          margin-top: 13px;

          padding-top: 11px;

          border-top: 1px solid
            #edf4f7;
        }

        .user-detail {
          display: flex;
          align-items: center;
          gap: 7px;

          color: #68899a;

          font-size: 8px;
        }

        .user-detail svg {
          color: #1689b7;
          flex-shrink: 0;
        }

        .user-card-footer {
          margin-top: 12px;

          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;

          padding: 5px 8px;

          border-radius: 999px;

          color: #075985;

          background:
            #eaf8fd;

          border: 1px solid
            #ccecf7;

          font-size: 7px;
          font-weight: 800;
        }

        .status-dot {
          width: 5px;
          height: 5px;

          border-radius: 50%;

          background:
            #0ea5e9;

          box-shadow:
            0 0 0 3px
              rgba(14, 165, 233, 0.10);
        }

        .role-badge {
          padding: 5px 8px;

          border-radius: 7px;

          color: #365d74;

          background: #f1f7fa;

          font-size: 7px;
          font-weight: 800;
        }

        /* =====================================================
           EMPTY STATE
        ===================================================== */

        .empty-state {
          grid-column: 1 / -1;

          padding: 50px 20px;

          text-align: center;

          border-radius: 17px;

          background:
            rgba(255, 255, 255, 0.92);

          border: 1px dashed
            #b9dce8;
        }

        .empty-icon {
          width: 52px;
          height: 52px;

          margin: 0 auto 12px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 16px;

          color: #0e7490;

          background:
            #edfaff;
        }

        .empty-state h3 {
          margin: 0;

          color: #234a63;

          font-size: 13px;
        }

        .empty-state p {
          margin: 6px 0 0;

          color: #7898a6;

          font-size: 9px;
        }

        /* =====================================================
           DEPARTMENT GRID
        ===================================================== */

        .department-grid {
          display: grid;

          grid-template-columns:
            repeat(3, minmax(0, 1fr));

          gap: 13px;
        }

        .department-card {
          position: relative;
          overflow: hidden;

          padding: 18px;

          min-height: 170px;

          border-radius: 17px;

          background:
            linear-gradient(
              145deg,
              #ffffff,
              #f6fbfd
            );

          border: 1px solid
            rgba(32, 120, 150, 0.11);

          box-shadow:
            0 11px 28px
              rgba(25, 86, 112, 0.08);

          transition:
            transform 0.25s ease,
            box-shadow 0.25s ease;
        }

        .department-card:hover {
          transform:
            translateY(-5px);

          box-shadow:
            0 18px 36px
              rgba(20, 85, 112, 0.13);
        }

        .department-card::before {
          content: "";

          position: absolute;

          top: 0;
          left: 0;
          right: 0;

          height: 3px;

          background:
            linear-gradient(
              90deg,
              #075985,
              #38bdf8
            );
        }

        .department-card:nth-child(2)::before {
          background:
            linear-gradient(
              90deg,
              #1d4ed8,
              #60a5fa
            );
        }

        .department-card:nth-child(3)::before {
          background:
            linear-gradient(
              90deg,
              #0369a1,
              #22d3ee
            );
        }

        .department-header {
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .dept-icon-wrap {
          width: 40px;
          height: 40px;

          border-radius: 12px;

          display: flex;
          align-items: center;
          justify-content: center;

          color: #0284c7;

          background:
            linear-gradient(
              145deg,
              #effaff,
              #dcf3fb
            );

          border: 1px solid
            #d5f1fa;

          flex-shrink: 0;
        }

        .dept-info {
          min-width: 0;
        }

        .dept-name {
          margin: 0;

          color: #143a57;

          font-size: 12px;
          font-weight: 800;
        }

        .dept-desc {
          margin: 3px 0 0;

          color: #7d9dab;

          font-size: 8px;
          line-height: 1.5;
        }

        .dept-members-pill {
          margin-top: 14px;

          display: inline-flex;
          align-items: center;
          gap: 6px;

          padding: 6px 10px;

          border-radius: 999px;

          color: #075985;

          background: #eaf8fd;

          border: 1px solid
            #ccecf7;

          font-size: 8px;
          font-weight: 800;
        }

        .dept-card-footer {
          margin-top: 14px;

          padding-top: 12px;

          border-top: 1px solid
            #edf4f7;

          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .dept-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;

          padding: 5px 8px;

          border-radius: 999px;

          color: #075985;

          background: #eaf8fd;

          border: 1px solid
            #ccecf7;

          font-size: 7px;
          font-weight: 800;
        }

        .dept-delete-btn {
          height: 28px;

          padding: 0 10px;

          display: inline-flex;
          align-items: center;
          gap: 5px;

          border-radius: 8px;

          border: 1px solid
            #fecaca;

          color: #dc2626;

          background: #fef2f2;

          font-size: 8px;
          font-weight: 800;

          transition: all 0.2s ease;
        }

        .dept-delete-btn:hover {
          background: #fee2e2;

          transform: translateY(-1px);

          box-shadow:
            0 6px 14px
              rgba(220, 38, 38, 0.18);
        }

        /* =====================================================
           MODALS (SHARED)
        ===================================================== */

        .modal-overlay {
          position: fixed;
          inset: 0;

          display: flex;
          align-items: center;
          justify-content: center;

          padding: 20px;

          background:
            rgba(9, 42, 61, 0.45);

          backdrop-filter: blur(4px);

          z-index: 100;

          animation:
            overlayIn 0.2s ease both;
        }

        .modal-card {
          width: min(520px, 100%);
          max-height: 90vh;
          overflow-y: auto;

          border-radius: 20px;

          background: #ffffff;

          border: 1px solid
            rgba(32, 120, 150, 0.14);

          box-shadow:
            0 30px 70px
              rgba(9, 42, 61, 0.28);

          animation:
            modalEnter 0.3s ease both;
        }

        .modal-header {
          position: relative;

          padding: 20px 22px 14px;

          display: flex;
          align-items: flex-start;
          gap: 12px;

          border-bottom: 1px solid
            #eef6f9;
        }

        .modal-icon {
          width: 40px;
          height: 40px;

          flex-shrink: 0;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 12px;

          color: #0284c7;

          background: #effaff;

          border: 1px solid
            #d5f1fa;
        }

        .modal-header h3 {
          margin: 0;

          color: #143a57;

          font-size: 14px;
          font-weight: 800;
        }

        .modal-header p {
          margin: 4px 0 0;

          color: #7d9dab;

          font-size: 10px;
        }

        .modal-close {
          position: absolute;
          top: 16px;
          right: 16px;

          width: 30px;
          height: 30px;

          border-radius: 9px;

          display: flex;
          align-items: center;
          justify-content: center;

          border: 1px solid
            #e0eef3;

          color: #7898a7;

          background: #f9fcfd;

          transition: all 0.2s ease;
        }

        .modal-close:hover {
          color: #b91c1c;

          border-color: #fecaca;

          background: #fef2f2;
        }

        /* =====================================================
           FORMS
        ===================================================== */

        .modal-form {
          padding: 18px 22px 22px;

          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .form-row-2 {
          display: grid;

          grid-template-columns:
            1fr 1fr;

          gap: 12px;
        }

        .form-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .dept-modal { width: min(600px, 100%); }
        .dept-ref { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 11px; color: #4a6f83; }
        .dept-ref b { color: #0b4f6c; letter-spacing: .04em; }
        .dept-ref button { display: inline-flex; align-items: center; border: 1px solid #dbeef4; background: #fff; color: #1677a8; border-radius: 7px; padding: 3px 7px; font-size: 11px; font-weight: 700; cursor: pointer; }
        .dept-ref input { width: 70px; height: 26px; padding: 0 8px; border-radius: 7px; border: 1px solid #9fdde1; outline: none; font-size: 12px; font-weight: 700; letter-spacing: .04em; }
        .inline-dept { display: flex; gap: 6px; margin-top: 6px; }
        .inline-dept input { flex: 1; min-width: 0; height: 34px; padding: 0 10px; border-radius: 9px; border: 1px solid #9fdde1; outline: none; font-size: 12px; }
        .inline-dept .btn-primary, .inline-dept .btn-secondary { height: 34px; padding: 0 12px; }
        .dept-users { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 14px; border: 1px solid #dbeef4; background: #f7fcfd; }
        .dept-users-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
        .dept-users-head > span { color: #4a6f83; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; }
        .dept-users-head em { font-style: normal; text-transform: none; font-weight: 600; color: #7b969e; }
        .dept-mode { display: inline-flex; padding: 3px; border-radius: 10px; background: #e6f4f7; }
        .dept-mode button { border: 0; background: transparent; padding: 6px 12px; border-radius: 8px; font-size: 11.5px; font-weight: 700; color: #4a6f83; cursor: pointer; }
        .dept-mode button.on { background: #fff; color: #0b4f6c; box-shadow: 0 2px 6px rgba(9,42,61,.1); }
        .dept-picker { display: flex; flex-direction: column; gap: 8px; }
        .dept-picker-toggle { display: flex; align-items: center; justify-content: space-between; height: 38px; padding: 0 12px; border-radius: 10px; border: 1px solid #dbeef4; background: #fff; color: #123b5d; font-size: 12.5px; font-weight: 600; cursor: pointer; }
        .dept-picker-panel { border: 1px solid #dbeef4; border-radius: 12px; background: #fff; overflow: hidden; }
        .dept-picker-panel > input { width: 100%; box-sizing: border-box; height: 36px; padding: 0 12px; border: 0; border-bottom: 1px solid #eef5f7; outline: none; font-size: 12px; }
        .dept-picker-list { max-height: 200px; overflow-y: auto; }
        .dept-option { display: flex; align-items: center; gap: 10px; padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f2f8fa; }
        .dept-option:hover { background: #f2fbfc; }
        .dept-option input { width: 16px; height: 16px; accent-color: #16a6b8; flex-shrink: 0; }
        .dept-option-text { display: flex; flex-direction: column; min-width: 0; }
        .dept-option-text strong { font-size: 12.5px; color: #123b5d; }
        .dept-option-text small { font-size: 11px; color: #7b969e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dept-empty { padding: 14px; text-align: center; font-size: 12px; color: #7b969e; }
        .dept-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .dept-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 6px 4px 10px; border-radius: 999px; background: #e6f4fa; color: #1677a8; font-size: 11px; font-weight: 700; }
        .dept-chip button { display: flex; border: 0; background: transparent; color: inherit; cursor: pointer; padding: 2px; }
        .dept-hint { font-size: 10.5px; color: #7b969e; }
        .dept-new { display: flex; flex-direction: column; gap: 8px; }
        .dept-new-card { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 12px; border: 1px solid #dbeef4; background: #fff; }
        .dept-new-card input, .dept-new-card select { height: 36px; min-width: 0; padding: 0 10px; border-radius: 9px; border: 1px solid #dbeef4; outline: none; font-size: 12px; background: #fff; }
        .dept-new-top { display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; color: #123b5d; }
        .dept-new-top button { display: flex; border: 0; background: transparent; color: #7b969e; cursor: pointer; }
        .dept-add-more { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; }

        .form-field span {
          display: flex;
          align-items: center;
          gap: 5px;

          color: #4a6f83;

          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }

        .form-field input,
        .form-field select {
          height: 38px;

          padding: 0 12px;

          border-radius: 10px;

          border: 1px solid
            #dbeef4;

          outline: none;

          background: #f7fcfd;

          color: #173b59;

          font-size: 11px;

          transition:
            border 0.2s ease,
            box-shadow 0.2s ease;
        }

        .form-field input::placeholder {
          color: #a5bec9;
        }

        .form-field input:focus,
        .form-field select:focus {
          border-color: #55bce0;

          box-shadow:
            0 0 0 3px
              rgba(14, 165, 233, 0.10);
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;

          margin-top: 6px;
          padding-top: 14px;

          border-top: 1px solid
            #eef6f9;
        }

        .btn-secondary {
          height: 38px;

          padding: 0 16px;

          border-radius: 10px;

          border: 1px solid
            #d9edf4;

          color: #36728d;

          background: #f8fcfd;

          font-size: 11px;
          font-weight: 700;

          transition: all 0.2s ease;
        }

        .btn-secondary:hover {
          color: #075985;

          border-color: #9ddced;

          background: #edfaff;
        }

        .btn-primary {
          height: 38px;

          padding: 0 18px;

          display: inline-flex;
          align-items: center;
          gap: 7px;

          border: none;
          border-radius: 10px;

          background:
            linear-gradient(
              135deg,
              #075985,
              #0ea5e9
            );

          color: #ffffff;

          font-size: 11px;
          font-weight: 800;

          box-shadow:
            0 8px 20px
              rgba(7, 89, 133, 0.25);

          transition: all 0.2s ease;
        }

        .btn-primary:hover {
          transform: translateY(-2px);

          box-shadow:
            0 12px 26px
              rgba(7, 89, 133, 0.32);
        }

        .btn-primary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .btn-danger {
          height: 38px;

          padding: 0 18px;

          display: inline-flex;
          align-items: center;
          gap: 7px;

          border: none;
          border-radius: 10px;

          background:
            linear-gradient(
              135deg,
              #dc2626,
              #ef4444
            );

          color: #ffffff;

          font-size: 11px;
          font-weight: 800;

          box-shadow:
            0 8px 20px
              rgba(220, 38, 38, 0.25);

          transition: all 0.2s ease;
        }

        .btn-danger:hover {
          transform: translateY(-2px);

          background:
            linear-gradient(
              135deg,
              #b91c1c,
              #dc2626
            );

          box-shadow:
            0 12px 26px
              rgba(220, 38, 38, 0.32);
        }

        /* =====================================================
           DELETE MODALS (USER + DEPARTMENT)
        ===================================================== */

        .delete-modal {
          width: min(430px, 100%);

          padding: 26px 24px 22px;

          text-align: center;
        }

        .delete-icon-wrap {
          width: 56px;
          height: 56px;

          margin: 0 auto 14px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 18px;

          color: #dc2626;

          background: #fef2f2;

          border: 1px solid
            #fecaca;

          box-shadow:
            0 10px 24px
              rgba(220, 38, 38, 0.16);

          animation:
            pulseDanger 2s ease-in-out infinite;
        }

        .delete-title {
          margin: 0;

          color: #16324a;

          font-size: 15px;
          font-weight: 800;
        }

        .delete-message {
          margin: 8px 0 0;

          color: #6b8b9b;

          font-size: 11px;
          line-height: 1.6;
        }

        .delete-message strong {
          color: #b91c1c;
        }

        .delete-user-preview {
          margin: 16px 0 4px;

          padding: 12px 14px;

          display: flex;
          align-items: center;
          gap: 12px;

          text-align: left;

          border-radius: 12px;

          background: #f7fcfd;

          border: 1px solid
            #e2f1f7;
        }

        .preview-avatar {
          width: 38px;
          height: 38px;

          flex-shrink: 0;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 11px;

          color: #ffffff;

          font-size: 13px;
          font-weight: 800;

          background:
            linear-gradient(
              135deg,
              #075985,
              #0ea5e9
            );
        }

        .delete-user-preview strong {
          display: block;

          color: #143a57;

          font-size: 11px;
        }

        .delete-user-preview span {
          display: block;

          margin-top: 2px;

          color: #7d9dab;

          font-size: 9px;
        }

        .delete-modal .modal-actions {
          justify-content: center;

          margin-top: 16px;
        }

        /* =====================================================
           BULK IMPORT MODAL
        ===================================================== */

        .bulk-body {
          padding: 18px 22px 22px;

          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .bulk-steps {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .bulk-step {
          display: flex;
          align-items: center;
          gap: 10px;

          padding: 11px 13px;

          border-radius: 12px;

          color: #456b80;

          background: #f7fcfd;

          border: 1px solid
            #e2f1f7;

          font-size: 10px;
        }

        .bulk-step svg {
          color: #0284c7;
          flex-shrink: 0;
        }

        .bulk-template-btn {
          height: 36px;

          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;

          border-radius: 10px;

          border: 1px solid
            #d9edf4;

          color: #36728d;

          background: #f8fcfd;

          font-size: 10px;
          font-weight: 700;

          transition: all 0.2s ease;
        }

        .bulk-template-btn:hover {
          color: #075985;

          border-color: #9ddced;

          background: #edfaff;
        }

        .bulk-upload {
          display: block;

          padding: 22px;

          text-align: center;

          cursor: pointer;

          border: 2px dashed
            #b9dce8;

          border-radius: 14px;

          background: #f7fcfd;

          transition: all 0.2s ease;
        }

        .bulk-upload:hover {
          border-color: #55bce0;

          background: #edfaff;
        }

        .bulk-upload-icon {
          width: 44px;
          height: 44px;

          margin: 0 auto 10px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 13px;

          color: #0284c7;

          background: #effaff;

          border: 1px solid
            #d5f1fa;
        }

        .bulk-upload h4 {
          margin: 0;

          color: #143a57;

          font-size: 11px;
          font-weight: 800;
        }

        .bulk-upload p {
          margin: 4px 0 0;

          color: #7d9dab;

          font-size: 9px;
        }

        .file-chip {
          display: flex;
          align-items: center;
          gap: 8px;

          padding: 10px 12px;

          border-radius: 10px;

          color: #0e7490;

          background: #effaff;

          border: 1px solid
            #d5f1fa;

          font-size: 10px;
          font-weight: 700;
        }

        .file-chip button {
          margin-left: auto;

          display: flex;

          border: none;

          background: transparent;

          color: #7898a7;
        }

        .file-chip button:hover {
          color: #dc2626;
        }

        /* =====================================================
           TOAST
        ===================================================== */

        .toast {
          position: fixed;
          bottom: 26px;
          left: 50%;

          transform: translateX(-50%);

          z-index: 200;

          display: flex;
          align-items: center;
          gap: 9px;

          padding: 12px 18px;

          border-radius: 12px;

          font-size: 11px;
          font-weight: 700;

          box-shadow:
            0 14px 34px
              rgba(9, 42, 61, 0.22);

          animation:
            toastIn 0.3s ease both;
        }

        .toast.success {
          background:
            linear-gradient(
              135deg,
              #075985,
              #0e7490
            );

          color: #ffffff;

          border: 1px solid
            rgba(255, 255, 255, 0.2);
        }

        .toast.error {
          background:
            linear-gradient(
              135deg,
              #b91c1c,
              #ef4444
            );

          color: #ffffff;

          border: 1px solid
            rgba(255, 255, 255, 0.2);
        }

        /* =====================================================
           KEYFRAMES
        ===================================================== */

        @keyframes heroEnter {
          from {
            opacity: 0;
            transform: translateY(16px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes cardEnter {
          from {
            opacity: 0;
            transform: translateY(14px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes userCardEnter {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.98);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes iconFloat {
          0%,
          100% {
            transform: translateY(0);
          }

          50% {
            transform: translateY(-5px);
          }
        }

        @keyframes overlayIn {
          from {
            opacity: 0;
          }

          to {
            opacity: 1;
          }
        }

        @keyframes modalEnter {
          from {
            opacity: 0;
            transform: translateY(18px) scale(0.97);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes toastIn {
          from {
            opacity: 0;
            transform: translate(-50%, 14px);
          }

          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }

        @keyframes pulseDanger {
          0%,
          100% {
            box-shadow:
              0 10px 24px
                rgba(220, 38, 38, 0.16);
          }

          50% {
            box-shadow:
              0 10px 30px
                rgba(220, 38, 38, 0.30);
          }
        }

        /* =====================================================
           RESPONSIVE
        ===================================================== */

        @media (max-width: 1100px) {
          .stats-grid {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
          }

          .analytics-grid {
            grid-template-columns: 1fr;
          }

          .users-grid,
          .department-grid {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .users-grid,
          .department-grid {
            grid-template-columns: 1fr;
          }

          .form-row-2 {
            grid-template-columns: 1fr;
          }

          .hero-content {
            flex-direction: column;
            align-items: flex-start;
          }

          .filter-card {
            flex-wrap: wrap;
          }
        }

      
/* =========================================================
   Blizzboard OCEAN SIGNATURE UI
   Visual layer only — API/business logic remains unchanged
========================================================= */

:root {
  --ts-ocean-950: #031525;
  --ts-ocean-900: #06243a;
  --ts-ocean-800: #073b59;
  --ts-ocean-700: #075985;
  --ts-ocean-600: #087ea4;
  --ts-ocean-500: #0ea5c7;
  --ts-ocean-400: #22d3ee;
  --ts-ocean-300: #67e8f9;
  --ts-ocean-200: #a5f3fc;
  --ts-ocean-100: #cffafe;
  --ts-ink: #082032;
  --ts-muted: #527083;
  --ts-surface: rgba(255,255,255,.78);
  --ts-surface-strong: rgba(255,255,255,.92);
  --ts-border: rgba(8,126,164,.16);
  --ts-shadow: 0 22px 60px rgba(3,37,55,.12);
  --ts-radius: 24px;
}

.users-page {
  position: relative;
  isolation: isolate;
  min-height: 100%;
  overflow: hidden;
  color: var(--ts-ink);
  background:
    radial-gradient(circle at 8% 6%, rgba(34,211,238,.17), transparent 24%),
    radial-gradient(circle at 92% 14%, rgba(14,165,199,.13), transparent 25%),
    radial-gradient(circle at 50% 105%, rgba(103,232,249,.13), transparent 30%),
    linear-gradient(145deg, #effcff 0%, #f5fdff 45%, #e7f9fd 100%);
}

.users-page::before,
.users-page::after {
  content: "";
  position: absolute;
  z-index: -1;
  pointer-events: none;
  border-radius: 999px;
  filter: blur(3px);
  opacity: .72;
}

.users-page::before {
  width: 360px;
  height: 360px;
  right: -120px;
  top: 110px;
  background: radial-gradient(circle, rgba(34,211,238,.19), transparent 68%);
  animation: tsOrbFloat 12s ease-in-out infinite;
}

.users-page::after {
  width: 300px;
  height: 300px;
  left: -130px;
  bottom: 80px;
  background: radial-gradient(circle, rgba(8,126,164,.13), transparent 68%);
  animation: tsOrbFloat 15s ease-in-out infinite reverse;
}

.users-page > div {
  position: relative;
  z-index: 1;
}

/* HERO */
.users-page .users-header,
.users-page .page-header,
.users-page .hero,
.users-page .users-hero {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(103,232,249,.24);
  border-radius: 30px;
  background:
    radial-gradient(circle at 84% 10%, rgba(103,232,249,.20), transparent 26%),
    linear-gradient(135deg, #06263d 0%, #074b6a 54%, #087ea4 100%);
  box-shadow: 0 24px 70px rgba(3,50,72,.22);
}

.users-page .users-header::before,
.users-page .page-header::before,
.users-page .hero::before,
.users-page .users-hero::before {
  content: "";
  position: absolute;
  inset: auto -8% -62%;
  height: 180px;
  border-radius: 50%;
  background: rgba(255,255,255,.08);
  transform: rotate(-3deg);
  animation: tsWaveDrift 8s ease-in-out infinite;
}

.users-page .users-header::after,
.users-page .page-header::after,
.users-page .hero::after,
.users-page .users-hero::after {
  content: "";
  position: absolute;
  width: 170px;
  height: 170px;
  right: 5%;
  top: -65px;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 50%;
  box-shadow:
    0 0 0 24px rgba(255,255,255,.035),
    0 0 0 48px rgba(255,255,255,.025);
  animation: tsRingPulse 5s ease-in-out infinite;
}

/* CARDS */
.users-page .stat-card,
.users-page .stats-card,
.users-page .analytics-card,
.users-page .chart-card,
.users-page .department-card,
.users-page .user-card,
.users-page .table-card,
.users-page .content-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--ts-border);
  border-radius: var(--ts-radius);
  background:
    linear-gradient(145deg, rgba(255,255,255,.92), rgba(239,252,255,.72));
  box-shadow: var(--ts-shadow);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  transition:
    transform .35s cubic-bezier(.2,.8,.2,1),
    box-shadow .35s ease,
    border-color .35s ease;
}

.users-page .stat-card::before,
.users-page .stats-card::before,
.users-page .analytics-card::before,
.users-page .chart-card::before,
.users-page .department-card::before,
.users-page .user-card::before,
.users-page .table-card::before,
.users-page .content-card::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--ts-ocean-700), var(--ts-ocean-400), var(--ts-ocean-600));
  background-size: 220% 100%;
  animation: tsGradientFlow 4.5s linear infinite;
}

.users-page .stat-card:hover,
.users-page .stats-card:hover,
.users-page .analytics-card:hover,
.users-page .chart-card:hover,
.users-page .department-card:hover,
.users-page .user-card:hover,
.users-page .table-card:hover,
.users-page .content-card:hover {
  transform: translateY(-6px);
  border-color: rgba(14,165,199,.32);
  box-shadow: 0 28px 72px rgba(3,70,95,.17);
}

/* STAT ICONS */
.users-page .stat-icon,
.users-page .stats-icon,
.users-page .card-icon {
  position: relative;
  display: grid;
  place-items: center;
  border: 1px solid rgba(103,232,249,.35);
  background: linear-gradient(145deg, #063653, #087ea4);
  color: #dffcff;
  box-shadow: 0 12px 28px rgba(8,126,164,.22);
  animation: tsIconFloat 4s ease-in-out infinite;
}

.users-page .stat-icon::after,
.users-page .stats-icon::after,
.users-page .card-icon::after {
  content: "";
  position: absolute;
  inset: -8px;
  border: 1px solid rgba(34,211,238,.20);
  border-radius: inherit;
  animation: tsIconRipple 3s ease-out infinite;
}

/* BUTTONS */
.users-page button,
.users-page .btn-primary,
.users-page .primary-btn {
  transition:
    transform .22s ease,
    box-shadow .22s ease,
    background .22s ease,
    border-color .22s ease;
}

.users-page button:hover,
.users-page .btn-primary:hover,
.users-page .primary-btn:hover {
  transform: translateY(-2px);
}

.users-page .btn-primary,
.users-page .primary-btn {
  border: 1px solid rgba(103,232,249,.28);
  background: linear-gradient(135deg, #063653, #087ea4);
  color: #fff;
  box-shadow: 0 12px 28px rgba(8,126,164,.22);
}

.users-page .btn-primary:hover,
.users-page .primary-btn:hover {
  box-shadow: 0 16px 34px rgba(8,126,164,.30);
}

/* FILTER / TABS */
.users-page .tabs,
.users-page .tab-list,
.users-page .filter-bar,
.users-page .filters,
.users-page .toolbar {
  border-color: rgba(8,126,164,.13);
}

.users-page .tab,
.users-page .tab-button,
.users-page .filter-chip {
  position: relative;
  overflow: hidden;
  border-radius: 14px;
  transition: all .25s ease;
}

.users-page .tab::after,
.users-page .tab-button::after,
.users-page .filter-chip::after {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 0;
  height: 2px;
  background: var(--ts-ocean-400);
  transform: translateX(-50%);
  transition: width .3s ease;
}

.users-page .tab:hover::after,
.users-page .tab.active::after,
.users-page .tab-button:hover::after,
.users-page .tab-button.active::after {
  width: 70%;
}

/* USER AVATARS */
.users-page .avatar,
.users-page .user-avatar,
.users-page .profile-avatar {
  position: relative;
  overflow: visible;
  background: linear-gradient(145deg, #063653, #0ea5c7);
  color: white;
  border: 2px solid rgba(255,255,255,.72);
  box-shadow: 0 12px 28px rgba(8,126,164,.22);
  animation: tsAvatarFloat 5s ease-in-out infinite;
}

.users-page .avatar::before,
.users-page .user-avatar::before,
.users-page .profile-avatar::before {
  content: "";
  position: absolute;
  inset: -5px;
  border-radius: inherit;
  border: 1px solid rgba(34,211,238,.28);
  animation: tsAvatarRing 3.5s ease-out infinite;
}

/* DEPARTMENT VISUALIZATION */
.users-page .department-progress,
.users-page .progress-bar,
.users-page .distribution-bar {
  overflow: hidden;
  border-radius: 999px;
  background: rgba(8,126,164,.09);
}

.users-page .department-progress > *,
.users-page .progress-bar > *,
.users-page .distribution-bar > * {
  position: relative;
  overflow: hidden;
  border-radius: inherit;
  background: linear-gradient(90deg, #075985, #0ea5c7, #67e8f9);
  background-size: 180% 100%;
  animation: tsProgressFlow 3s linear infinite;
}

.users-page .department-progress > *::after,
.users-page .progress-bar > *::after,
.users-page .distribution-bar > *::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.42), transparent);
  transform: translateX(-100%);
  animation: tsShimmer 2.4s infinite;
}

/* CHART */
.users-page svg {
  overflow: visible;
}

.users-page .chart-line,
.users-page .trend-line,
.users-page .activity-line {
  stroke: #087ea4;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  filter: drop-shadow(0 5px 8px rgba(8,126,164,.18));
  stroke-dasharray: 900;
  stroke-dashoffset: 900;
  animation: tsChartDraw 1.8s cubic-bezier(.4,0,.2,1) forwards;
}

.users-page .chart-area,
.users-page .trend-area {
  fill: url(#oceanAreaGradient);
  opacity: .18;
  animation: tsAreaReveal 1.4s ease forwards;
}

/* MODALS */
.users-page .modal-overlay,
.users-page .overlay {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: rgba(2,25,39,.58);
  animation: tsOverlayIn .25s ease both;
}

.users-page .modal,
.users-page .modal-content,
.users-page .dialog {
  border: 1px solid rgba(103,232,249,.22);
  border-radius: 26px;
  background:
    radial-gradient(circle at 100% 0%, rgba(34,211,238,.10), transparent 30%),
    rgba(248,254,255,.97);
  box-shadow: 0 35px 100px rgba(1,25,40,.30);
  animation: tsModalIn .4s cubic-bezier(.16,1,.3,1) both;
}

.users-page input,
.users-page select,
.users-page textarea {
  border-color: rgba(8,126,164,.16);
  background: rgba(255,255,255,.80);
  color: var(--ts-ink);
  transition: border-color .2s ease, box-shadow .2s ease, background .2s ease;
}

.users-page input:focus,
.users-page select:focus,
.users-page textarea:focus {
  outline: none;
  border-color: rgba(14,165,199,.55);
  background: white;
  box-shadow: 0 0 0 4px rgba(34,211,238,.10);
}

/* TOAST */
.users-page .toast {
  border: 1px solid rgba(103,232,249,.25);
  background: linear-gradient(135deg, #063653, #087ea4);
  color: white;
  box-shadow: 0 18px 45px rgba(3,55,76,.28);
  animation: tsToastIn .42s cubic-bezier(.16,1,.3,1) both;
}

/* EMPTY STATE */
.users-page .empty-state,
.users-page .empty-users,
.users-page .empty-departments {
  border: 1px dashed rgba(8,126,164,.24);
  border-radius: 24px;
  background:
    radial-gradient(circle at 50% 0%, rgba(34,211,238,.10), transparent 45%),
    rgba(255,255,255,.58);
}

.users-page .empty-state svg,
.users-page .empty-users svg,
.users-page .empty-departments svg {
  color: var(--ts-ocean-600);
  filter: drop-shadow(0 8px 14px rgba(8,126,164,.18));
  animation: tsEmptyFloat 3.5s ease-in-out infinite;
}

/* BUBBLES */
.users-page .ocean-bubble,
.users-page .bubble {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  border: 1px solid rgba(255,255,255,.42);
  background: rgba(103,232,249,.10);
  animation: tsBubbleRise 8s linear infinite;
}

/* KEYFRAMES */
@keyframes tsOrbFloat {
  0%,100% { transform: translate3d(0,0,0) scale(1); }
  50% { transform: translate3d(-24px,18px,0) scale(1.08); }
}

@keyframes tsWaveDrift {
  0%,100% { transform: translateX(-2%) rotate(-3deg); }
  50% { transform: translateX(4%) rotate(1deg); }
}

@keyframes tsRingPulse {
  0%,100% { transform: scale(.92); opacity: .55; }
  50% { transform: scale(1.06); opacity: .9; }
}

@keyframes tsGradientFlow {
  0% { background-position: 0% 50%; }
  100% { background-position: 220% 50%; }
}

@keyframes tsIconFloat {
  0%,100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

@keyframes tsIconRipple {
  0% { transform: scale(.82); opacity: .65; }
  80%,100% { transform: scale(1.35); opacity: 0; }
}

@keyframes tsAvatarFloat {
  0%,100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-3px) rotate(1deg); }
}

@keyframes tsAvatarRing {
  0% { transform: scale(.92); opacity: .65; }
  100% { transform: scale(1.24); opacity: 0; }
}

@keyframes tsProgressFlow {
  0%,100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}

@keyframes tsShimmer {
  0% { transform: translateX(-100%); }
  55%,100% { transform: translateX(100%); }
}

@keyframes tsChartDraw {
  to { stroke-dashoffset: 0; }
}

@keyframes tsAreaReveal {
  from { opacity: 0; }
  to { opacity: .18; }
}

@keyframes tsOverlayIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes tsModalIn {
  from {
    opacity: 0;
    transform: translateY(24px) scale(.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes tsToastIn {
  from {
    opacity: 0;
    transform: translateY(18px) translateX(10px) scale(.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) translateX(0) scale(1);
  }
}

@keyframes tsEmptyFloat {
  0%,100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

@keyframes tsBubbleRise {
  0% {
    opacity: 0;
    transform: translateY(30px) scale(.7);
  }
  15% { opacity: .55; }
  100% {
    opacity: 0;
    transform: translateY(-150px) scale(1.15);
  }
}

/* RESPONSIVE */
@media (max-width: 1100px) {
  .users-page .users-header,
  .users-page .page-header,
  .users-page .hero,
  .users-page .users-hero {
    border-radius: 24px;
  }

  .users-page .stat-card,
  .users-page .stats-card,
  .users-page .analytics-card,
  .users-page .chart-card,
  .users-page .department-card,
  .users-page .user-card,
  .users-page .table-card,
  .users-page .content-card {
    border-radius: 20px;
  }
}

@media (max-width: 760px) {
  .users-page {
    padding: 12px;
  }

  .users-page .users-header,
  .users-page .page-header,
  .users-page .hero,
  .users-page .users-hero {
    border-radius: 20px;
  }

  .users-page .stat-card,
  .users-page .stats-card,
  .users-page .analytics-card,
  .users-page .chart-card,
  .users-page .department-card,
  .users-page .user-card,
  .users-page .table-card,
  .users-page .content-card {
    border-radius: 18px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .users-page *,
  .users-page *::before,
  .users-page *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: .01ms !important;
  }
}

`}</style>

      <div className="users-shell">
        {/* ================= HERO ================= */}
        <section className="users-hero">
          <div className="hero-content">
            <div className="hero-title-wrap">
              <div className="hero-icon">
                <Users size={24} />
              </div>

              <div>
                <h1 className="hero-title">
                  Users &amp; Departments
                </h1>

                <p className="hero-subtitle">
                  Manage your team members, roles and
                  organizational departments.
                </p>
              </div>
            </div>

            {canCreateUsers && (
            <div className="hero-actions">
              <button
                type="button"
                className="hero-btn"
                onClick={() => setShowBulkModal(true)}
              >
                <Upload size={13} /> Import CSV
              </button>

              <button
                type="button"
                className="hero-btn"
                onClick={() => setShowDepartmentModal(true)}
              >
                <Building2 size={13} /> Add Department
              </button>

              <button
                type="button"
                className="hero-btn primary"
                onClick={openAddUser}
              >
                <UserPlus size={13} /> Add User
              </button>
            </div>
            )}
          </div>

          <div className="hero-mini-stats">
            <div className="hero-mini-stat">
              <Activity size={12} /> Total Users
              <strong>{totalUsers}</strong>
            </div>

            <div className="hero-mini-stat">
              <ShieldCheck size={12} /> Admins
              <strong>{totalAdmins}</strong>
            </div>

            <div className="hero-mini-stat">
              <UserRoundCog size={12} /> Managers
              <strong>{totalManagers}</strong>
            </div>

            <div className="hero-mini-stat">
              <Building2 size={12} /> Departments
              <strong>{totalDepartments}</strong>
            </div>

            <div className="hero-mini-stat">
              <CalendarDays size={12} /> Active
              <strong>{activeUsers}</strong>
            </div>
          </div>
        </section>

        {/* ================= STATS ================= */}
        <div className="stats-grid">
          <div
            className="stat-card app-link-card"
            {...linkProps(() => {
              setActiveTab("users");
              setSearch("");
              setDepartment("All Departments");
              setRole("All Roles");
            }, "Show all users")}
          >
            <span className="stat-glow" />

            <div className="stat-icon">
              <Users size={15} />
            </div>

            <div className="stat-label">Total Users</div>

            <div className="stat-value">{totalUsers}</div>

            <div className="stat-meta">
              <TrendingUp size={9} /> {activeUsers} active
            </div>
          </div>

          <div
            className="stat-card app-link-card"
            {...linkProps(() => setActiveTab("departments"), "Show departments")}
          >
            <span className="stat-glow" />

            <div className="stat-icon">
              <Building2 size={15} />
            </div>

            <div className="stat-label">Departments</div>

            <div className="stat-value">
              {totalDepartments}
            </div>

            <div className="stat-meta">
              <ArrowUpRight size={9} /> View
            </div>
          </div>

          <div
            className="stat-card app-link-card"
            {...linkProps(() => {
              setActiveTab("users");
              setRole("Admin");
            }, "Show admins")}
          >
            <span className="stat-glow" />

            <div className="stat-icon">
              <ShieldCheck size={15} />
            </div>

            <div className="stat-label">Admins</div>

            <div className="stat-value">{totalAdmins}</div>
          </div>

          <div
            className="stat-card app-link-card"
            {...linkProps(() => {
              setActiveTab("users");
              setRole("Manager");
            }, "Show managers")}
          >
            <span className="stat-glow" />

            <div className="stat-icon">
              <UserRoundCog size={15} />
            </div>

            <div className="stat-label">Managers</div>

            <div className="stat-value">
              {totalManagers}
            </div>
          </div>
        </div>

        {/* ================= ANALYTICS ================= */}
        <div className="analytics-grid">
          <div className="chart-card">
            <div className="chart-card-header">
              <div className="chart-title-wrap">
                <div className="chart-icon">
                  <BarChart3 size={15} />
                </div>

                <div>
                  <h3 className="chart-title">
                    User Activity Trend
                  </h3>

                  <p className="chart-subtitle">
                    Last 6 months overview
                  </p>
                </div>
              </div>

              <div className="chart-total">
                <strong>{totalUsers}</strong>
                <span>Total</span>
              </div>
            </div>

            <div className="chart-body">
              <svg
                className="activity-chart"
                viewBox={`0 0 ${chartW} ${chartH}`}
              >
                <defs>
                  <linearGradient
                    id="usersOceanArea"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="rgba(14, 165, 233, 0.28)"
                    />

                    <stop
                      offset="100%"
                      stopColor="rgba(14, 165, 233, 0.02)"
                    />
                  </linearGradient>
                </defs>

                {[0.25, 0.5, 0.75].map((ratio) => (
                  <line
                    key={ratio}
                    className="chart-grid-line"
                    x1={14}
                    x2={chartW - 14}
                    y1={16 + ratio * (chartH - 40)}
                    y2={16 + ratio * (chartH - 40)}
                  />
                ))}

                <path className="chart-area" d={areaPath} />

                <path className="chart-line" d={linePath} />

                {chartPoints.map((point, index) => (
                  <circle
                    key={index}
                    className="chart-point"
                    cx={point.x}
                    cy={point.y}
                    r={4.5}
                  />
                ))}

                {MONTHS.map((month, index) => (
                  <text
                    key={month}
                    className="chart-label"
                    x={chartPoints[index]?.x}
                    y={chartH - 4}
                    textAnchor="middle"
                  >
                    {month}
                  </text>
                ))}
              </svg>
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-card-header">
              <div className="chart-title-wrap">
                <div className="chart-icon">
                  <Waves size={15} />
                </div>

                <div>
                  <h3 className="chart-title">
                    Department Distribution
                  </h3>

                  <p className="chart-subtitle">
                    Users per department
                  </p>
                </div>
              </div>
            </div>

            <div className="distribution-body">
              <div className="distribution-list">
                {departmentStats.length === 0 ? (
                  <div className="empty-department">
                    No departments yet.
                  </div>
                ) : (
                  departmentStats.map((dept) => (
                    <div
                      className="distribution-row"
                      key={dept.id}
                    >
                      <div className="distribution-top">
                        <strong>{dept.name}</strong>
                        <span>{dept.count} users</span>
                      </div>

                      <div className="distribution-track">
                        <div
                          className="distribution-fill"
                          style={{
                            width: `${
                              (dept.count /
                                maxDepartmentCount) *
                              100
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ================= TABS ================= */}
        <div className="tabs-wrap">
          <button
            type="button"
            className={
              activeTab === "users"
                ? "tab-btn active"
                : "tab-btn"
            }
            onClick={() => setActiveTab("users")}
          >
            <Users size={13} /> Users
            <span className="tab-count">{totalUsers}</span>
          </button>

          <button
            type="button"
            className={
              activeTab === "departments"
                ? "tab-btn active"
                : "tab-btn"
            }
            onClick={() => setActiveTab("departments")}
          >
            <Building2 size={13} /> Departments
            <span className="tab-count">
              {totalDepartments}
            </span>
          </button>

          <button
            type="button"
            className={
              activeTab === "roles"
                ? "tab-btn active"
                : "tab-btn"
            }
            onClick={() => setActiveTab("roles")}
          >
            <UserRoundCog size={13} /> Roles
            <span className="tab-count">
              {customRoles.length}
            </span>
          </button>
        </div>

        {/* ================= FILTERS ================= */}
        {activeTab === "users" && (
          <div className="filter-card">
            <div className="search-box">
              <Search size={14} />

              <input
                className="search-input"
                placeholder="Search users by name, email or phone..."
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
              />
            </div>

            <select
              className="filter-select"
              value={department}
              onChange={(event) =>
                setDepartment(event.target.value)
              }
            >
              <option value="All Departments">
                All Departments
              </option>

              {departments.map((dept) => (
                <option key={dept.id} value={dept.name}>
                  {dept.name}
                </option>
              ))}
            </select>

            <select
              className="filter-select"
              value={role}
              onChange={(event) =>
                setRole(event.target.value)
              }
            >
              <option value="All Roles">All Roles</option>
              {isSuperAdmin && (
                <option value="Admin">Admin</option>
              )}
              <option value="Manager">Manager</option>
              <option value="User">Team Member</option>
              {customRoles.map((r) => (
                <option key={r._id} value={`custom:${r._id}`}>
                  {r.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="clear-filter-btn"
              onClick={clearFilters}
            >
              <X size={12} /> Clear
            </button>
          </div>
        )}

        {/* ================= SECTION HEADER ================= */}
        <div className="section-header">
          <div className="section-title">
            <span className="section-title-icon">
              {activeTab === "users" ? (
                <UserRound size={13} />
              ) : (
                <Building size={13} />
              )}
            </span>

            {activeTab === "users"
              ? "Team Members"
              : activeTab === "roles"
              ? "Roles"
              : "Departments"}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span className="result-count">
              {activeTab === "users"
                ? `${filteredUsers.length} of ${totalUsers} users`
                : activeTab === "roles"
                ? `${customRoles.length} organization roles`
                : `${totalDepartments} departments`}
            </span>

            {activeTab === "roles" && canAssignRoles && (
              <button
                type="button"
                className="add-dept-btn"
                onClick={() => openRoleModal()}
              >
                <Plus size={12} /> Add Role
              </button>
            )}

            {activeTab === "departments" && canCreateUsers && (
              <button
                type="button"
                className="add-dept-btn"
                onClick={() => setShowDepartmentModal(true)}
              >
                <Plus size={12} /> Add Department
              </button>
            )}
          </div>
        </div>

        {/* ================= PASSWORD RESET REQUESTS ================= */}
        {activeTab === "users" && canEditUsers && resetRequests.length > 0 && (
          <div
            style={{
              margin: "0 0 16px",
              padding: 14,
              borderRadius: 16,
              background: "#FFFBF0",
              border: "1px solid #F3DDA9",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 13, color: "#8a5a00", marginBottom: 10 }}>
              <LockKeyhole size={14} />
              {resetRequests.length} password reset request{resetRequests.length === 1 ? "" : "s"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {resetRequests.map((request) => {
                const target = users.find((u) => String(u.id) === String(request.user._id));
                return (
                  <div
                    key={request._id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8,
                      padding: "9px 12px",
                      borderRadius: 12,
                      background: "#fff",
                      border: "1px solid #F1E6CC",
                      fontSize: 12,
                    }}
                  >
                    <span>
                      <strong>{request.user.name}</strong> ({request.user.email}) ·{" "}
                      {roleLabel(request.user.role)} · requested{" "}
                      {new Date(request.requestedAt).toLocaleString()}
                    </span>
                    <span style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={!target}
                        title={target ? undefined : "Account not in your list"}
                        onClick={() => target && openEditUser(target)}
                        style={{ padding: "6px 12px", fontSize: 11 }}
                      >
                        Set new password
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => dismissResetRequest(request)}
                        style={{ padding: "6px 12px", fontSize: 11 }}
                      >
                        Dismiss
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= USERS GRID ================= */}
        {activeTab === "users" && (
          <div className="users-grid">
            {canDeleteUsers && selectableUserIds.length > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <BulkSelectBar {...userSelect} label="users" onDelete={deleteSelectedUsers} />
              </div>
            )}
            {filteredUsers.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <UserX size={22} />
                </div>

                <h3>No users found</h3>

                <p>
                  Try adjusting your search or filters, or
                  add a new team member.
                </p>
              </div>
            ) : (
              userPage.items.map((user, index) => (
                <div
                  className="user-card"
                  key={user.id || index}
                  style={{
                    animationDelay: `${Math.min(
                      index * 0.05,
                      0.4
                    )}s`,
                    ...(userSelect.isSelected(user.id) ? { outline: "2px solid #0e7490", outlineOffset: 2 } : {}),
                  }}
                >
                  <div className="user-card-top">
                    <div className="user-avatar">
                      {user.avatar}
                    </div>

                    {/* ===== EDIT + DELETE BUTTONS ===== */}
                    <div className="user-card-actions">
                      {selectableUserIds.includes(user.id) && (
                        <SelectCheckbox
                          checked={userSelect.isSelected(user.id)}
                          onChange={() => userSelect.toggle(user.id)}
                          label={`Select ${user.name}`}
                          style={{ alignSelf: "center", marginRight: 2 }}
                        />
                      )}
                      {canEditUsers && (
                        <button
                          type="button"
                          className="user-action-btn edit"
                          title="Edit user"
                          onClick={() => openEditUser(user)}
                        >
                          <Pencil size={13} />
                        </button>
                      )}

                      {canDeleteUsers && (
                        <button
                          type="button"
                          className="user-action-btn delete"
                          title="Delete user"
                          onClick={() => openDeleteUser(user)}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  <h3 className="user-name">{user.name}</h3>

                  <span className="user-role">
                    {user.customRoleName || roleLabel(user.role)}
                    {isSuperAdmin && user.organization
                      ? ` · ${user.organization}`
                      : ""}
                  </span>

                  <div className="user-details">
                    <div className="user-detail">
                      <Mail size={11} />
                      {user.email || "No email"}
                    </div>

                    <div className="user-detail">
                      <Phone size={11} />
                      {user.phone || "No phone"}
                    </div>

                    <div className="user-detail">
                      <BriefcaseBusiness size={11} />
                      {user.department && canOpen.tasks() ? (
                        <span
                          className="app-link"
                          {...linkProps(
                            () => navigate(appLinks.tasks({ department: user.department })),
                            `Open ${user.department} tasks`
                          )}
                        >
                          {user.department}
                        </span>
                      ) : (
                        user.department || "No department"
                      )}
                    </div>
                  </div>

                  {(canOpen.tasks() || canOpen.mom()) && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0 4px" }}>
                      {canOpen.tasks() && (
                        <button
                          type="button"
                          className="app-jump"
                          onClick={() => navigate(appLinks.tasks({ assignee: user.id, assigneeName: user.name }))}
                          title={`Tasks assigned to ${user.name}`}
                        >
                          <ClipboardList size={11} /> Tasks
                        </button>
                      )}
                      {canOpen.mom() && (
                        <button
                          type="button"
                          className="app-jump"
                          onClick={() => navigate(appLinks.mom({ search: user.name }))}
                          title={`Meetings with ${user.name}`}
                        >
                          <CalendarDays size={11} /> Meetings
                        </button>
                      )}
                    </div>
                  )}

                  {!user.emailVerified && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        margin: "8px 0 4px",
                        padding: "6px 9px",
                        borderRadius: 9,
                        background: "#FFF7E6",
                        border: "1px solid #F3DDA9",
                        color: "#9a6a0a",
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <Mail size={11} /> Email not verified
                      </span>
                      {canEditUsers && (
                        <button
                          type="button"
                          onClick={() => resendVerification(user)}
                          disabled={resendingId === user.id}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "#0b8f87",
                            fontSize: 10,
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          {resendingId === user.id ? "Sending…" : "Resend link"}
                        </button>
                      )}
                    </div>
                  )}

                  <div className="user-card-footer">
                    <span className="status-badge">
                      <span className="status-dot" />
                      {user.status}
                    </span>

                    <span className="role-badge">
                      {user.customRoleName || roleLabel(user.role)}
                    </span>
                  </div>
                </div>
              ))
            )}
            <div style={{ gridColumn: "1 / -1" }}><Pagination {...userPage} label="users" /></div>
          </div>
        )}

        {/* ================= ROLES GRID (organization-defined roles) ================= */}
        {activeTab === "roles" && (
          <div className="department-grid">
            {customRoles.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <UserRoundCog size={22} />
                </div>
                <h3>No custom roles yet</h3>
                <p>
                  Add roles such as “Consultant” or “Team Lead”. Each role uses the
                  Manager or Team Member access level, and its permissions can be
                  fine-tuned on the Roles &amp; Permissions page.
                </p>
              </div>
            ) : (
              customRoles.map((r) => (
                <div className="department-card" key={r._id}>
                  <div className="department-header">
                    <div className="dept-icon-wrap">
                      <UserRoundCog size={17} />
                    </div>
                    <div className="dept-info">
                      <h3 className="dept-name">{r.name}</h3>
                      <p className="dept-desc">
                        {r.description || `${r.baseRoleLabel} access level`}
                      </p>
                    </div>
                  </div>

                  <div className="dept-members-pill">
                    <Users size={11} />
                    {r.users} {r.users === 1 ? "Member" : "Members"}
                  </div>

                  <div className="dept-card-footer">
                    <span className="dept-status-badge">
                      <span className="status-dot" />
                      {r.baseRoleLabel} access{r.hasOwnPermissions ? " · own permissions" : ""}
                    </span>
                    {canAssignRoles && (
                      <span style={{ display: "flex", gap: 6 }}>
                        <button type="button" className="dept-delete-btn" style={{ color: "#0e7490" }} onClick={() => openRoleModal(r)}>
                          <Pencil size={11} /> Edit
                        </button>
                        <button type="button" className="dept-delete-btn" onClick={() => deleteRole(r)}>
                          <Trash2 size={11} /> Delete
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ================= DEPARTMENTS GRID ================= */}
        {activeTab === "departments" && (
          <div className="department-grid">
            {departments.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <Building2 size={22} />
                </div>

                <h3>No departments yet</h3>

                <p>
                  Create your first department to start
                  organizing users.
                </p>
              </div>
            ) : (
              deptPage.items.map((dept, index) => (
                <div
                  className="department-card"
                  key={dept.id || index}
                >
                  <div className="department-header">
                    <div className="dept-icon-wrap">
                      <Building2 size={17} />
                    </div>

                    <div className="dept-info">
                      <h3 className="dept-name">
                        {dept.name}
                      </h3>

                      <p className="dept-desc">
                        {dept.description}
                      </p>
                    </div>
                  </div>

                  <div className="dept-members-pill">
                    <Users size={11} />
                    {dept.count}{" "}
                    {dept.count === 1
                      ? "Member"
                      : "Members"}
                  </div>

                  {dept.refPrefix && (
                    <div className="dept-ref">
                      {editingPrefixId === dept.id ? (
                        <>
                          <input
                            autoFocus
                            value={prefixDraft}
                            maxLength={6}
                            onChange={(event) => setPrefixDraft(event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") savePrefix(dept);
                              if (event.key === "Escape") setEditingPrefixId(null);
                            }}
                            aria-label={`Reference code for ${dept.name}`}
                          />
                          <button type="button" onClick={() => savePrefix(dept)}>Save</button>
                          <button type="button" onClick={() => setEditingPrefixId(null)} aria-label="Cancel">
                            <X size={11} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span title="Task reference code">
                            Ref code <b>{dept.refPrefix}</b> · next {dept.nextReferenceId}
                          </span>
                          {canEditUsers && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPrefixId(dept.id);
                                setPrefixDraft(dept.refPrefix);
                              }}
                              aria-label={`Change reference code of ${dept.name}`}
                              title="Change reference code"
                            >
                              <Pencil size={11} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
                    {canOpen.tasks() && (
                      <button type="button" className="app-jump"
                        onClick={() => navigate(appLinks.tasks({ department: dept.name }))}
                        title={`Tasks of ${dept.name}`}>
                        <ClipboardList size={11} /> Tasks
                      </button>
                    )}
                    {canOpen.calendar() && (
                      <button type="button" className="app-jump"
                        onClick={() => navigate(appLinks.calendar({ department: dept.name }))}
                        title={`${dept.name} in the Task Calendar`}>
                        <CalendarDays size={11} /> Calendar
                      </button>
                    )}
                    {canOpen.taskBank() && (
                      <button type="button" className="app-jump"
                        onClick={() => navigate(appLinks.taskBank({ search: dept.name }))}
                        title={`Task Bank items for ${dept.name}`}>
                        <Archive size={11} /> Task Bank
                      </button>
                    )}
                    {canOpen.mom() && (
                      <button type="button" className="app-jump"
                        onClick={() => navigate(appLinks.mom({ search: dept.name }))}
                        title={`Meetings of ${dept.name}`}>
                        <FileText size={11} /> MoM
                      </button>
                    )}
                  </div>

                  <div className="dept-card-footer">
                    <span className="dept-status-badge">
                      <span className="status-dot" />
                      {dept.status || "Active"}
                    </span>

                    <button
                      type="button"
                      className="dept-delete-btn"
                      style={{ color: "#0e7490", borderColor: "#bfe6ee", background: "#f0fafc", marginLeft: "auto", marginRight: 6 }}
                      onClick={() => setMembersDept(dept)}
                      title={`View members of ${dept.name}`}
                    >
                      <Eye size={11} /> View members
                    </button>

                    {canDeleteUsers && (
                      <button
                        type="button"
                        className="dept-delete-btn"
                        onClick={() => openDeleteDept(dept)}
                      >
                        <Trash2 size={11} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
            <div style={{ gridColumn: "1 / -1" }}><Pagination {...deptPage} label="departments" /></div>
          </div>
        )}

        {/* ================= ADD / EDIT USER MODAL ================= */}
        {showUserModal && (
          <div
            className="modal-overlay"
            onClick={() => setShowUserModal(false)}
          >
            <div
              className="modal-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <div className="modal-icon">
                  {editingUser ? (
                    <Pencil size={18} />
                  ) : (
                    <UserPlus size={18} />
                  )}
                </div>

                <div>
                  <h3>
                    {editingUser
                      ? "Edit User"
                      : "Add New User"}
                  </h3>

                  <p>
                    {editingUser
                      ? "Update the user's details below."
                      : "Fill in the details to create a new user."}
                  </p>
                </div>

                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setShowUserModal(false)}
                >
                  <X size={14} />
                </button>
              </div>

              <form
                className="modal-form"
                onSubmit={handleSaveUser}
              >
                <div className="form-row-2">
                  <label className="form-field">
                    <span>Full Name *</span>

                    <input
                      value={userForm.name}
                      onChange={(event) =>
                        setUserForm({
                          ...userForm,
                          name: event.target.value,
                        })
                      }
                      placeholder="e.g. John Doe"
                    />
                  </label>

                  <label className="form-field">
                    <span>Email *</span>

                    <input
                      type="email"
                      value={userForm.email}
                      onChange={(event) =>
                        setUserForm({
                          ...userForm,
                          email: event.target.value,
                        })
                      }
                      placeholder="john@company.com"
                    />
                  </label>
                </div>

                <div className="form-row-2">
                  <label className="form-field">
                    <span>Phone *</span>

                    <input
                      value={userForm.phone}
                      onChange={(event) =>
                        setUserForm({
                          ...userForm,
                          phone: event.target.value,
                        })
                      }
                      placeholder="9876543210"
                    />
                  </label>

                  <label className="form-field">
                    <span>
                      <LockKeyhole size={10} />{" "}
                      {editingUser ? "Set new password" : "Password *"}
                    </span>

                    <input
                      type="password"
                      autoComplete="new-password"
                      value={userForm.password}
                      onChange={(event) =>
                        setUserForm({
                          ...userForm,
                          password: event.target.value,
                        })
                      }
                      placeholder={
                        editingUser
                          ? "Leave empty to keep the current password"
                          : "Min 6 characters"
                      }
                    />
                    <small style={{ fontSize: 10, color: "#6b8a94", marginTop: 4 }}>
                      {editingUser
                        ? "The user gets an email link to view the new password once (30 seconds)."
                        : "The user verifies their email, then sees this password once for 30 seconds."}
                    </small>
                  </label>
                </div>

                <div className="form-row-2">
                  <label className="form-field">
                    <span>Department *</span>

                    <select
                      value={showInlineDept ? "__new__" : userForm.department}
                      onChange={(event) => {
                        if (event.target.value === "__new__") {
                          setShowInlineDept(true);
                          return;
                        }
                        setShowInlineDept(false);
                        setUserForm({
                          ...userForm,
                          department: event.target.value,
                        });
                      }}
                    >
                      <option value="">
                        Select department
                      </option>

                      {departments.map((dept) => (
                        <option
                          key={dept.id}
                          value={dept.name}
                        >
                          {dept.name}
                        </option>
                      ))}

                      {canCreateUsers && (
                        <option value="__new__">+ Create new department…</option>
                      )}
                    </select>

                    {showInlineDept && (
                      <div className="inline-dept">
                        <input
                          autoFocus
                          value={newDeptName}
                          onChange={(event) => setNewDeptName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleInlineDepartment();
                            }
                          }}
                          placeholder="New department name"
                          aria-label="New department name"
                        />
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={handleInlineDepartment}
                          disabled={creatingInlineDept}
                        >
                          {creatingInlineDept ? "…" : "Create"}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => {
                            setShowInlineDept(false);
                            setNewDeptName("");
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                  </label>

                  <label className="form-field">
                    <span>Role *</span>

                    <select
                      value={userForm.role}
                      disabled={
                        Boolean(editingUser) &&
                        (!canAssignRoles ||
                          // Admin ⇄ member conversion is not allowed
                          editingUser.role === "Admin")
                      }
                      onChange={(event) =>
                        setUserForm({
                          ...userForm,
                          role: event.target.value,
                        })
                      }
                    >
                      {/* keep the current value visible even if it is not assignable */}
                      {!assignableRoles.some(
                        (option) => option.value === userForm.role
                      ) && !userForm.role.startsWith("custom:") && (
                        <option value={userForm.role}>
                          {roleLabel(userForm.role)}
                        </option>
                      )}
                      {assignableRoles
                        .filter(
                          (option) =>
                            !editingUser ||
                            (option.value === "Admin") ===
                              (editingUser.role === "Admin")
                        )
                        .map((option) => (
                          <option
                            key={option.value}
                            value={option.value}
                          >
                            {option.label}
                          </option>
                        ))}
                      {editingUser?.role !== "Admin" &&
                        rolesForOrg(editingUser ? editingUser.adminId : userForm.adminId).length > 0 && (
                          <optgroup label="Organization roles">
                            {rolesForOrg(editingUser ? editingUser.adminId : userForm.adminId).map((r) => (
                              <option key={r._id} value={`custom:${r._id}`}>
                                {r.name} ({r.baseRoleLabel} access)
                              </option>
                            ))}
                          </optgroup>
                        )}
                    </select>
                  </label>

                  {isSuperAdmin &&
                    !editingUser &&
                    userForm.role !== "Admin" && (
                      <label className="form-field">
                        <span>Organization (Admin) *</span>

                        <select
                          value={userForm.adminId}
                          onChange={(event) =>
                            setUserForm({
                              ...userForm,
                              adminId: event.target.value,
                            })
                          }
                        >
                          <option value="">
                            Select organization
                          </option>
                          {organizations.map((org) => (
                            <option key={org.id} value={org.id}>
                              {org.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowUserModal(false)}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="btn-primary"
                  >
                    {editingUser
                      ? "Save Changes"
                      : "Create User"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================= DELETE USER MODAL ================= */}
        {showDeleteModal && deleteUser && (
          <div
            className="modal-overlay"
            onClick={() => setShowDeleteModal(false)}
          >
            <div
              className="modal-card delete-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="delete-icon-wrap">
                <Trash2 size={24} />
              </div>

              <h3 className="delete-title">Delete User</h3>

              <p className="delete-message">
                Are you sure you want to permanently delete{" "}
                <strong>"{deleteUser.name}"</strong>? This
                action cannot be undone.
              </p>

              <div className="delete-user-preview">
                <div className="preview-avatar">
                  {deleteUser.avatar}
                </div>

                <div>
                  <strong>{deleteUser.name}</strong>
                  <span>{deleteUser.email}</span>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="btn-danger"
                  onClick={confirmDelete}
                >
                  <Trash2 size={13} /> Yes, Delete User
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= DEPARTMENT MEMBERS MODAL ================= */}
        {membersDept && (() => {
          const members = users.filter((user) => user.department === membersDept.name);
          return (
            <div className="modal-overlay" onClick={() => setMembersDept(null)}>
              <div
                className="modal-card"
                role="dialog"
                aria-modal="true"
                aria-label={`Members of ${membersDept.name}`}
                onClick={(event) => event.stopPropagation()}
                style={{ maxWidth: 520 }}
              >
                <div className="modal-header">
                  <div className="modal-icon">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <h3>{membersDept.name}</h3>
                    <p>{members.length} {members.length === 1 ? "member" : "members"}</p>
                  </div>
                  <button type="button" className="modal-close" onClick={() => setMembersDept(null)} aria-label="Close">
                    <X size={16} />
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "55vh", overflowY: "auto", padding: "4px 2px" }}>
                  {members.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: "#607e93", textAlign: "center", padding: "18px 0" }}>
                      No users are in this department yet.
                    </p>
                  ) : (
                    members.map((member) => (
                      <div
                        key={member.id}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 11, border: "1px solid #dbeef4", background: "#fff" }}
                      >
                        <div className="preview-avatar" style={{ flexShrink: 0 }}>{member.avatar}</div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <strong style={{ display: "block", fontSize: 13, color: "#10324a" }}>{member.name}</strong>
                          <span style={{ display: "block", fontSize: 11.5, color: "#607e93", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {member.email || "No email"}
                          </span>
                        </div>
                        <span className="role-badge">{member.customRoleName || roleLabel(member.role)}</span>
                        <span className="status-badge"><span className="status-dot" />{member.status}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setDepartment(membersDept.name);
                      setActiveTab("users");
                      setMembersDept(null);
                    }}
                  >
                    Open in Users list
                  </button>
                  <button type="button" className="btn-primary" onClick={() => setMembersDept(null)}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ================= DELETE DEPARTMENT MODAL ================= */}
        {showDeleteDeptModal && deleteDept && (
          <div
            className="modal-overlay"
            onClick={() => setShowDeleteDeptModal(false)}
          >
            <div
              className="modal-card delete-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="delete-icon-wrap">
                <Trash2 size={24} />
              </div>

              <h3 className="delete-title">
                Delete Department
              </h3>

              <p className="delete-message">
                Are you sure you want to permanently delete{" "}
                <strong>"{deleteDept.name}"</strong>?
                {deptMemberCount > 0 &&
                  ` ${deptMemberCount} user(s) currently belong to this department.`}{" "}
                This action cannot be undone.
              </p>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    setShowDeleteDeptModal(false)
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="btn-danger"
                  onClick={confirmDeleteDept}
                >
                  <Trash2 size={13} /> Yes, Delete
                  Department
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= ADD DEPARTMENT MODAL ================= */}
        {showRoleModal && (
          <div className="modal-overlay" onClick={() => !savingRole && setShowRoleModal(false)}>
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-icon">
                  <UserRoundCog size={18} />
                </div>
                <div>
                  <h3>{editingRole ? "Edit Role" : "Add New Role"}</h3>
                  <p>Roles appear in the role list when you add or edit users.</p>
                </div>
                <button type="button" className="modal-close" onClick={() => setShowRoleModal(false)}>
                  <X size={14} />
                </button>
              </div>

              <form className="modal-form" onSubmit={saveRole}>
                {isSuperAdmin && !editingRole && (
                  <label className="form-field">
                    <span>Organization (Admin) *</span>
                    <select value={roleForm.adminId} onChange={(e) => setRoleForm({ ...roleForm, adminId: e.target.value })}>
                      {organizations.map((org) => (
                        <option key={org.id} value={org.id}>{org.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="form-field">
                  <span>Role Name *</span>
                  <input
                    value={roleForm.name}
                    onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                    placeholder="e.g. Consultant"
                    maxLength={60}
                  />
                </label>
                <label className="form-field">
                  <span>Description</span>
                  <input
                    value={roleForm.description}
                    onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                    placeholder="Short description (optional)"
                    maxLength={300}
                  />
                </label>
                <label className="form-field">
                  <span>Access level *</span>
                  <select value={roleForm.baseRole} onChange={(e) => setRoleForm({ ...roleForm, baseRole: e.target.value })}>
                    <option value="User">Team Member — works on own tasks</option>
                    <option value="Manager">Manager — manages the team's tasks</option>
                  </select>
                </label>
                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowRoleModal(false)}>Cancel</button>
                  <button type="submit" className="btn-primary" disabled={savingRole}>
                    {editingRole ? <Pencil size={13} /> : <Plus size={13} />} {savingRole ? "Saving…" : editingRole ? "Save Role" : "Create Role"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showDepartmentModal && (
          <div
            className="modal-overlay"
            onClick={closeDepartmentModal}
          >
            <div
              className="modal-card dept-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <div className="modal-icon">
                  <Building2 size={18} />
                </div>

                <div>
                  <h3>Add New Department</h3>

                  <p>
                    Create a department and add its people —
                    choose existing users or create new ones.
                  </p>
                </div>

                <button
                  type="button"
                  className="modal-close"
                  onClick={closeDepartmentModal}
                >
                  <X size={14} />
                </button>
              </div>

              <form
                className="modal-form"
                onSubmit={handleAddDepartment}
              >
                <label className="form-field">
                  <span>Department Name *</span>

                  <input
                    value={departmentForm.name}
                    onChange={(event) =>
                      setDepartmentForm({
                        ...departmentForm,
                        name: event.target.value,
                        // keep suggesting a code until the user types their own
                        ...(refPrefixTouched ? {} : { refPrefix: suggestRefPrefix(event.target.value) }),
                      })
                    }
                    placeholder="e.g. Finance"
                  />
                </label>

                <label className="form-field">
                  <span>Task reference code</span>

                  <input
                    value={departmentForm.refPrefix}
                    maxLength={6}
                    onChange={(event) => {
                      setRefPrefixTouched(true);
                      setDepartmentForm({
                        ...departmentForm,
                        refPrefix: event.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                      });
                    }}
                    placeholder="e.g. FF"
                  />
                  <small className="dept-hint">
                    {departmentForm.refPrefix
                      ? `Tasks in this department get IDs ${departmentForm.refPrefix}1, ${departmentForm.refPrefix}2, ${departmentForm.refPrefix}3…`
                      : "Letters only. Leave empty to create one from the name."}
                  </small>
                </label>

                <label className="form-field">
                  <span>Description</span>

                  <input
                    value={departmentForm.description}
                    onChange={(event) =>
                      setDepartmentForm({
                        ...departmentForm,
                        description: event.target.value,
                      })
                    }
                    placeholder="Short description (optional)"
                  />
                </label>

                {!isSuperAdmin && (canEditUsers || canCreateUsers) && (
                  <div className="dept-users">
                    <div className="dept-users-head">
                      <span>Add users <em>(optional)</em></span>
                      <div className="dept-mode" role="tablist" aria-label="How to add users">
                        {canEditUsers && (
                          <button
                            type="button"
                            role="tab"
                            aria-selected={deptUserMode === "existing"}
                            className={deptUserMode === "existing" ? "on" : ""}
                            onClick={() => setDeptUserMode("existing")}
                          >
                            Choose existing
                          </button>
                        )}
                        {canCreateUsers && (
                          <button
                            type="button"
                            role="tab"
                            aria-selected={deptUserMode === "new"}
                            className={deptUserMode === "new" ? "on" : ""}
                            onClick={() => {
                              setDeptUserMode("new");
                              if (!deptNewMembers.length) setDeptNewMembers([{ ...emptyDeptMember }]);
                            }}
                          >
                            Create new
                          </button>
                        )}
                      </div>
                    </div>

                    {deptUserMode === "existing" && canEditUsers && (() => {
                      const pickable = users.filter((u) => !["Admin", "SuperAdmin"].includes(u.role));
                      const q = deptMemberSearch.trim().toLowerCase();
                      const shown = pickable.filter((u) =>
                        !q || `${u.name} ${u.email} ${u.department}`.toLowerCase().includes(q)
                      );
                      const toggle = (id) =>
                        setDeptMemberIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
                      return (
                        <div className="dept-picker">
                          <button
                            type="button"
                            className="dept-picker-toggle"
                            onClick={() => setDeptPickerOpen((o) => !o)}
                            aria-expanded={deptPickerOpen}
                          >
                            {deptMemberIds.length
                              ? `${deptMemberIds.length} user${deptMemberIds.length === 1 ? "" : "s"} selected`
                              : "Select users"}
                            <ChevronDown size={14} />
                          </button>
                          {deptPickerOpen && (
                            <div className="dept-picker-panel">
                              <input
                                value={deptMemberSearch}
                                onChange={(event) => setDeptMemberSearch(event.target.value)}
                                placeholder="Search name, email or department"
                                aria-label="Search users"
                              />
                              <div className="dept-picker-list">
                                {shown.length === 0 && <div className="dept-empty">No users found.</div>}
                                {shown.map((u) => (
                                  <label key={u.id} className="dept-option">
                                    <input
                                      type="checkbox"
                                      checked={deptMemberIds.includes(u.id)}
                                      onChange={() => toggle(u.id)}
                                    />
                                    <span className="dept-option-text">
                                      <strong>{u.name}</strong>
                                      <small>{u.email}{u.department ? ` · now in ${u.department}` : ""}</small>
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}
                          {deptMemberIds.length > 0 && (
                            <div className="dept-chips">
                              {deptMemberIds.map((id) => {
                                const u = users.find((x) => x.id === id);
                                return (
                                  <span key={id} className="dept-chip">
                                    {u?.name || "User"}
                                    <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${u?.name || "user"}`}>
                                      <X size={10} />
                                    </button>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          <small className="dept-hint">Selected users move from their current department to this one.</small>
                        </div>
                      );
                    })()}

                    {deptUserMode === "new" && canCreateUsers && (
                      <div className="dept-new">
                        {deptNewMembers.map((m, i) => {
                          const set = (patch) =>
                            setDeptNewMembers((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                          return (
                            <div key={i} className="dept-new-card">
                              <div className="dept-new-top">
                                <strong>New user {deptNewMembers.length > 1 ? i + 1 : ""}</strong>
                                <button
                                  type="button"
                                  onClick={() => setDeptNewMembers((list) => list.filter((_, j) => j !== i))}
                                  aria-label="Remove this new user"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                              <div className="form-row-2">
                                <input value={m.name} onChange={(e) => set({ name: e.target.value })} placeholder="Full name *" aria-label="Full name" />
                                <input type="email" value={m.email} onChange={(e) => set({ email: e.target.value })} placeholder="Email *" aria-label="Email" />
                                <input value={m.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="Phone" aria-label="Phone" />
                                <input type="password" value={m.password} onChange={(e) => set({ password: e.target.value })} placeholder="Password * (min 6)" aria-label="Password" autoComplete="new-password" />
                              </div>
                              <select value={m.role} onChange={(e) => set({ role: e.target.value })} aria-label="Role">
                                <option value="User">Team Member</option>
                                {sessionUser?.role !== "Manager" && <option value="Manager">Manager</option>}
                              </select>
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          className="btn-secondary dept-add-more"
                          onClick={() => setDeptNewMembers((list) => [...list, { ...emptyDeptMember }])}
                        >
                          <Plus size={12} /> Add another user
                        </button>
                        <small className="dept-hint">Each new user gets an email to verify their account, like Add User.</small>
                      </div>
                    )}
                  </div>
                )}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={closeDepartmentModal}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={savingDepartment}
                  >
                    <Plus size={13} /> {savingDepartment ? "Creating…" : "Create Department"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================= BULK IMPORT MODAL ================= */}
        {showBulkModal && (
          <div
            className="modal-overlay"
            onClick={() => setShowBulkModal(false)}
          >
            <div
              className="modal-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <div className="modal-icon">
                  <FileSpreadsheet size={18} />
                </div>

                <div>
                  <h3>Import Users from CSV</h3>

                  <p>
                    Upload a CSV file to add multiple users
                    at once.
                  </p>
                </div>

                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setShowBulkModal(false)}
                >
                  <X size={14} />
                </button>
              </div>

              <div className="bulk-body">
                <div className="bulk-steps">
                  <div className="bulk-step">
                    <Download size={14} /> Step 1: Download
                    the CSV template.
                  </div>

                  <div className="bulk-step">
                    <FileSpreadsheet size={14} /> Step 2:
                    Fill in user details in the template.
                  </div>

                  <div className="bulk-step">
                    <Upload size={14} /> Step 3: Upload the
                    completed CSV file.
                  </div>
                </div>

                <button
                  type="button"
                  className="bulk-template-btn"
                  onClick={downloadCSVTemplate}
                >
                  <Download size={13} /> Download CSV
                  Template
                </button>

                <label className="bulk-upload">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    hidden
                    onChange={handleFileChange}
                  />

                  <div className="bulk-upload-icon">
                    <Upload size={18} />
                  </div>

                  <h4>Click to select a CSV file</h4>

                  <p>Only .csv files are supported</p>
                </label>

                {selectedFile && (
                  <div className="file-chip">
                    <FileSpreadsheet size={14} />
                    {selectedFile.name}

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);

                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                )}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowBulkModal(false)}
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleImport}
                    disabled={!selectedFile}
                  >
                    <Upload size={13} /> Import Users
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TOAST ================= */}
        {toast && (
          <div className={`toast ${toast.type}`}>
            {toast.type === "success" ? (
              <CheckCircle2 size={15} />
            ) : (
              <AlertCircle size={15} />
            )}

            {toast.message}
          </div>
        )}
      </div>
    </div>
  );
};

export default UsersPage;
