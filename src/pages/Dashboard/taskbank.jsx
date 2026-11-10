import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { appLinks, canOpen, linkProps, pageParams, APP_LINK_CSS } from "../../utils/appLinks";
import CsvImportDialog from "../../components/CsvImportDialog";
import { Pagination, usePagination } from "../../components/Pagination";
import BulkSelectBar, { SelectCheckbox, useBulkSelect } from "../../components/BulkSelectBar";

import {
  Archive,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  Edit3,
  FileText,
  Filter,
  Grid2X2,
  Lightbulb,
  List,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Paperclip,
  Users,
  X,
  Zap,
} from "lucide-react";
import { API_URL as ENV_API_URL } from "../../config/env";

/* =========================================================
   API CONFIG
   ========================================================= */

const API_BASE_URL =
  ENV_API_URL;

const API_URL = API_BASE_URL.endsWith("/")
  ? `${API_BASE_URL}taskbank`
  : `${API_BASE_URL}/taskbank`;

// Files on repository items — same rules as task attachments on the server
const FILE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "zip"];
const MAX_FILE_SIZE = 8 * 1024 * 1024; // must match the backend (8 MB)
const MAX_FILES = 10;
const fileSize = (n) => (!n ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

// Authenticated download (files are not public)
const downloadBankFile = async (file) => {
  const origin = API_BASE_URL.replace(/\/api\/?$/, "");
  const response = await fetch(`${origin}${file.url}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
  });
  if (!response.ok) {
    alert("This file could not be downloaded.");
    return;
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

// Keep authentication consistent with the rest of the application.
const getAuthToken = () => {
  const keys = ["token", "authToken", "accessToken", "jwt", "userToken"];

  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value) return value;
  }

  return "";
};

const getAuthHeaders = (includeJson = false) => {
  const headers = {};

  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }

  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
};

const clearAuthAndNotify = () => {
  ["token", "authToken", "accessToken", "jwt", "userToken"].forEach((key) => {
    localStorage.removeItem(key);
  });
  window.dispatchEvent(new Event("auth-expired"));
};

const apiFetch = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...getAuthHeaders(Boolean(options.body) && !(options.body instanceof FormData)),
      ...(options.headers || {}),
    },
  });

  let json = null;
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    json = await response.json();
  } else {
    const raw = await response.text();
    json = raw ? { message: raw } : {};
  }

  if (response.status === 401) {
    clearAuthAndNotify();
  }

  if (!response.ok) {
    throw new Error(
      json?.message ||
        json?.error ||
        `Request failed with status ${response.status}`
    );
  }

  return json;
};

const extractData = (body) => {
  if (body?.data !== undefined) return body.data;
  if (body?.taskBank !== undefined) return body.taskBank;
  if (body?.taskbank !== undefined) return body.taskbank;
  if (body?.item !== undefined) return body.item;
  if (body?.result !== undefined) return body.result;
  return body;
};

const extractList = (body) => {
  const data = extractData(body);

  if (Array.isArray(data)) return data;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.tasks)) return body.tasks;
  if (Array.isArray(body?.taskBank)) return body.taskBank;
  return [];
};

// Logged-in account (role + permissions from the backend). Only used to hide
// actions — the API enforces the same rules.
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

// Mongo gives _id + ISO dates — map them so the UI keeps using item.id.
const mapItem = (raw = {}) => {
  const item = raw?.item || raw?.data || raw;

  return {
    ...item,
    id: item._id || item.id,
    title: item.title || item.name || "",
    description: item.description || "",
    category: item.category || "General",
    department:
      typeof item.department === "object"
        ? item.department?.name || item.department?.departmentName || ""
        : item.department || "",
    type: item.type || "Template",
    priority: item.priority || "Medium",
    status:
      item.status ||
      (item.type === "Idea" ? "Draft" : "Ready to Assign"),
    // "" means the estimated time was switched off for this item
    estimatedTime: item.estimatedTime ?? "1 hour",
    usageCount: Number(item.usageCount || 0),
    assignments: Array.isArray(item.assignments) ? item.assignments : [],
    attachments: Array.isArray(item.attachments) ? item.attachments : [],
    assignedCount: Number(item.assignedCount || 0),
    lastAssignedTo: item.lastAssignedTo || "",
    createdAt: item.createdAt ? String(item.createdAt).split("T")[0] : "",
    tags: Array.isArray(item.tags)
      ? item.tags
      : typeof item.tags === "string"
      ? item.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [],
  };
};

/* =========================================================
   MAIN COMPONENT
   ========================================================= */

const TaskBank = () => {
  const [repository, setRepository] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All Categories");
  const [department, setDepartment] = useState("All Departments");
  const [type, setType] = useState("All Types");
  const [priority, setPriority] = useState("All Priorities");
  // ?item=<id> (from a task's "From Task Bank" link) shows just that item; "used" = assigned before
  const [itemFilter, setItemFilter] = useState("");
  const [usedOnly, setUsedOnly] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const params = pageParams();
    if (params.get("search")) setSearch(params.get("search"));
    if (params.get("item")) setItemFilter(params.get("item"));
  }, []);

  const [viewMode, setViewMode] = useState("grid");

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState("new");

  const [selectedItem, setSelectedItem] = useState(null);

  const [menuId, setMenuId] = useState(null);

  const [sessionUser] = useState(getSessionUser);
  const isSuperAdmin = sessionUser?.role === "SuperAdmin";
  const canCreate = canDo(sessionUser, "taskbank", "create");
  const canEdit = canDo(sessionUser, "taskbank", "edit");
  const canDelete = canDo(sessionUser, "taskbank", "delete");
  const canAssign = canDo(sessionUser, "taskbank", "assign");
  const canImport = canDo(sessionUser, "taskbank", "import");
  const [showImport, setShowImport] = useState(false);

  // Assignment dialog
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignMode, setAssignMode] = useState("assign");
  const [assignForm, setAssignForm] = useState({
    userId: "",
    department: "",
    dueDate: "",
    priority: "Medium",
  });
  const [assignUsers, setAssignUsers] = useState([]);
  const [assignDepartments, setAssignDepartments] = useState([]);
  const [assignOptionsLoaded, setAssignOptionsLoaded] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState("");

  // Only departments that actually have users in them
  const userDepartments = useMemo(
    () =>
      [...new Set(assignUsers.map((u) => String(u.department || "").trim()).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b)
      ),
    [assignUsers]
  );

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "General",
    department: "Management",
    type: "Template",
    priority: "Medium",
    useEstimate: false, // on/off switch for Estimated Time
    estimatedTime: "1 hour",
    useTags: false,     // on/off switch for Tags
    tags: "",
    keepFiles: [], // files already on the item (edit)
    newFiles: [],  // files picked in this form
  });

  /* =======================================================
     LOAD DATA FROM API
     ======================================================= */

  const loadItems = async () => {
    try {
      setLoading(true);
      setError("");

      const json = await apiFetch(API_URL);
      const items = extractList(json);

      setRepository(items.map(mapItem));
    } catch (err) {
      console.error("Task Bank load error:", err);
      setError(err.message || "Cannot reach the Task Bank server.");
    } finally {
      setLoading(false);
    }
  };

  // Load existing records first. Do not automatically seed production data.
  useEffect(() => {
    loadItems();
  }, []);

  /* =======================================================
     FILTER OPTIONS
     ======================================================= */

  const categories = useMemo(() => {
    return [
      "All Categories",
      ...new Set(repository.map((item) => item.category)),
    ];
  }, [repository]);

  const departments = useMemo(() => {
    return [
      "All Departments",
      ...new Set(repository.map((item) => item.department)),
    ];
  }, [repository]);

  /* =======================================================
     FILTERED DATA
     ======================================================= */

  const filteredRepository = useMemo(() => {
    const query = search.toLowerCase().trim();

    return repository.filter((item) => {
      const matchesSearch =
        !query ||
        String(item.title || "").toLowerCase().includes(query) ||
        String(item.description || "").toLowerCase().includes(query) ||
        String(item.category || "").toLowerCase().includes(query) ||
        String(item.department || "").toLowerCase().includes(query) ||
        (item.tags || []).some((tag) =>
          String(tag).toLowerCase().includes(query)
        );

      const matchesCategory =
        category === "All Categories" || item.category === category;

      const matchesDepartment =
        department === "All Departments" || item.department === department;

      const matchesType = type === "All Types" || item.type === type;

      const matchesPriority =
        priority === "All Priorities" || item.priority === priority;

      const matchesLink = (!itemFilter || item.id === itemFilter) && (!usedOnly || item.usageCount > 0);

      return (
        matchesSearch &&
        matchesCategory &&
        matchesDepartment &&
        matchesType &&
        matchesPriority &&
        matchesLink
      );
    });
  }, [repository, search, category, department, type, priority, itemFilter, usedOnly]);

  // one page at a time (grid and list share it)
  const bankPage = usePagination(filteredRepository, {
    id: "taskbank",
    resetKey: `${search}|${category}|${department}|${type}|${priority}|${itemFilter}|${usedOnly}`,
  });

  /* =======================================================
     STATISTICS
     ======================================================= */

  const totalRepository = repository.length;

  const readyToAssign = repository.filter(
    (item) => item.status === "Ready to Assign"
  ).length;

  const ideas = repository.filter(
    (item) => item.type === "Idea" || item.status === "Draft"
  ).length;

  const recentlyUsed = repository.filter(
    (item) => item.usageCount > 0
  ).length;

  const departmentCount = new Set(
    repository.map((item) => item.department)
  ).size;

  /* =======================================================
     MODAL
     ======================================================= */

  const openNewModal = (mode = "new", item = null) => {
    setModalMode(mode);
    setSelectedItem(item);

    if (item) {
      setForm({
        title: item.title,
        description: item.description,
        category: item.category,
        department: item.department,
        type: item.type,
        priority: item.priority,
        useEstimate: Boolean(item.estimatedTime),
        estimatedTime: item.estimatedTime || "1 hour",
        useTags: Array.isArray(item.tags) ? item.tags.length > 0 : Boolean(item.tags),
        tags: Array.isArray(item.tags)
          ? item.tags.join(", ")
          : String(item.tags || ""),
        keepFiles: item.attachments || [],
        newFiles: [],
      });
    } else {
      setForm({
        title: "",
        description: "",
        category: "General",
        department: "",
        type: mode === "idea" ? "Idea" : "Template",
        priority: "Medium",
        useEstimate: false,
        estimatedTime: "1 hour",
        useTags: false,
        tags: "",
        keepFiles: [],
        newFiles: [],
      });
    }

    setMenuId(null);
    setShowModal(true);
    // departments for the dropdown come from the organization's users
    loadAssignOptions().catch((err) => console.error("Department load error:", err));
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedItem(null);
  };

  /* =======================================================
     CREATE / UPDATE  →  POST & PUT
     ======================================================= */

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (saving) return;

    const title = form.title.trim();
    const description = form.description.trim();

    if (!title) {
      alert("Please enter a task bank title.");
      return;
    }

    if (!description) {
      alert("Please enter a description.");
      return;
    }

    setSaving(true);

    const payload = {
      title,
      description,
      category: form.category.trim() || "General",
      department: form.department.trim() || "Management",
      type: form.type || "Template",
      priority: form.priority || "Medium",
      estimatedTime: form.useEstimate ? form.estimatedTime.trim() || "1 hour" : "",
      tags: form.useTags
        ? form.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [],
    };

    try {
      const isEdit = Boolean(selectedItem?.id);

      // multipart so the picked files are uploaded with the item
      const body = new FormData();
      Object.entries(payload).forEach(([key, value]) =>
        body.append(key, Array.isArray(value) ? value.join(",") : String(value ?? ""))
      );
      if (isEdit) body.append("keepAttachments", JSON.stringify(form.keepFiles.map((f) => f.filename)));
      form.newFiles.forEach((file) => body.append("files", file));

      const json = await apiFetch(
        isEdit ? `${API_URL}/${selectedItem.id}` : API_URL,
        {
          method: isEdit ? "PUT" : "POST",
          body,
        }
      );

      const rawSaved = extractData(json);
      const saved = mapItem(rawSaved);

      if (!saved.id) {
        throw new Error("The server saved the item but did not return its ID.");
      }

      // Reload from MongoDB so the UI exactly matches the backend.
      await loadItems();
      closeModal();
    } catch (err) {
      console.error("Task Bank save error:", err);
      alert(err.message || "Failed to save Task Bank item.");
    } finally {
      setSaving(false);
    }
  };

  /* =======================================================
     DELETE  →  DELETE /api/taskbank/:id
     ======================================================= */

  // "Select all" → bulk delete
  const selectableBankIds = useMemo(
    () => (canDelete ? filteredRepository.map((item) => item.id).filter(Boolean) : []),
    [filteredRepository, canDelete]
  );
  const bankSelect = useBulkSelect(selectableBankIds);

  const deleteSelectedItems = async (ids) => {
    const results = await Promise.allSettled(
      ids.map((id) => apiFetch(`${API_URL}/${id}`, { method: "DELETE", headers: getAuthHeaders() }))
    );
    const deleted = ids.filter((id, i) => results[i].status === "fulfilled");
    await loadItems();
    if (!deleted.length && results[0]?.status === "rejected") throw results[0].reason;
    return deleted;
  };

  const deleteItem = async (id) => {
    const item = repository.find((x) => x.id === id);

    if (!item) return;

    const confirmed = window.confirm(
      `Delete "${item.title}" from Task Bank?`
    );

    if (!confirmed) return;

    try {
      await apiFetch(`${API_URL}/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });

      await loadItems();
    } catch (err) {
      console.error("Task Bank delete error:", err);
      alert(err.message || "Failed to delete item.");
    } finally {
      setMenuId(null);
    }
  };

  /* =======================================================
     ASSIGN  →  POST /api/taskbank/:id/assign
     ======================================================= */

  // Real users + departments of the organization (loaded once, on first assign)
  const loadAssignOptions = async () => {
    if (assignOptionsLoaded) return;
    const base = API_BASE_URL.replace(/\/$/, "");
    const [usersRes, deptRes] = await Promise.allSettled([
      apiFetch(`${base}/users/assignable`),
      apiFetch(`${base}/departments`),
    ]);
    if (usersRes.status === "rejected" && deptRes.status === "rejected") {
      throw usersRes.reason;
    }
    const usersJson = usersRes.status === "fulfilled" ? usersRes.value : [];
    const deptJson = deptRes.status === "fulfilled" ? deptRes.value : [];
    setAssignUsers(
      extractList(usersJson).map((u) => ({
        id: u._id || u.id,
        name: u.name || u.email,
        email: u.email || "",
        department: u.department || "",
      }))
    );
    setAssignDepartments(
      extractList(deptJson)
        .map((d) => d.name)
        .filter(Boolean)
    );
    setAssignOptionsLoaded(true);
  };

  // Opens the dialog — the user must pick WHO receives the task
  const assignTask = async (id) => {
    const item = repository.find((x) => x.id === id);
    if (!item) return;

    setMenuId(null);
    setAssignError("");
    // Already assigned → the button means "Reassign" (move the task, no duplicate)
    setAssignMode(item.assignedCount > 0 ? "reassign" : "assign");
    setAssignForm({
      userId: "",
      department: item.department || "",
      dueDate: "",
      priority: ["High", "Medium", "Low"].includes(item.priority)
        ? item.priority
        : "Medium",
    });
    setAssignTarget(item);

    try {
      await loadAssignOptions();
    } catch (err) {
      setAssignError(err.message || "Failed to load users.");
    }
  };

  const submitAssign = async (e) => {
    e.preventDefault();
    if (!assignTarget || assigning) return;

    if (!assignForm.userId) {
      setAssignError("Select the user to assign this task to.");
      return;
    }

    setAssigning(true);
    setAssignError("");

    try {
      const json = await apiFetch(`${API_URL}/${assignTarget.id}/${assignMode === "reassign" ? "reassign" : "assign"}`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({
          assignedUser: assignForm.userId,
          department: assignForm.department,
          dueDate: assignForm.dueDate || undefined,
          priority: assignForm.priority,
        }),
      });

      // Reload guarantees usageCount / "Assigned to" come from MongoDB
      await loadItems();
      setAssignTarget(null);
      alert(json?.message || `"${assignTarget.title}" assigned successfully.`);
    } catch (err) {
      console.error("Task Bank assign error:", err);
      setAssignError(err.message || "Failed to assign item.");
    } finally {
      setAssigning(false);
    }
  };

  /* =======================================================
     DUPLICATE  →  POST /api/taskbank/:id/duplicate
     ======================================================= */

  const duplicateItem = async (item) => {
    try {
      await apiFetch(`${API_URL}/${item.id}/duplicate`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({}),
      });

      await loadItems();
    } catch (err) {
      console.error("Task Bank duplicate error:", err);
      alert(err.message || "Failed to duplicate item.");
    } finally {
      setMenuId(null);
    }
  };

  /* =======================================================
     SEED SAMPLE DATA
     ======================================================= */

  const seedSampleData = async () => {
    try {
      setLoading(true);
      setError("");

      await apiFetch(`${API_URL}/seed`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify({}),
      });

      await loadItems();
    } catch (err) {
      // Some existing backends expose seed as GET instead of POST.
      // Retry GET only when POST is rejected by the server.
      try {
        await apiFetch(`${API_URL}/seed`, {
          method: "GET",
          headers: getAuthHeaders(),
        });
        await loadItems();
      } catch (retryErr) {
        console.error("Task Bank seed error:", retryErr);
        alert(retryErr.message || err.message || "Failed to load sample data.");
        setLoading(false);
      }
    }
  };

  /* =======================================================
     CLEAR FILTERS
     ======================================================= */

  const clearFilters = () => {
    setSearch("");
    setCategory("All Categories");
    setDepartment("All Departments");
    setType("All Types");
    setPriority("All Priorities");
    setItemFilter("");
    setUsedOnly(false);
  };

  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <div className="task-bank-page">

      <div className="task-bank-background-orb orb-one" />
      <div className="task-bank-background-orb orb-two" />

      <div className="task-bank-container">

        {/* ================= HERO ================= */}

        <section className="task-bank-hero">

          <div className="hero-left">

            <div className="hero-icon">
              <Archive size={25} />
            </div>

            <div>
              <div className="hero-title-row">
                <h1>Task Bank</h1>

                <span className="hero-badge">
                  <Sparkles size={12} />
                  Smart Repository
                </span>
              </div>

              <p>
                Store reusable tasks, ideas and templates — then assign them
                whenever your team needs them.
              </p>
            </div>

          </div>

          {(canCreate || canImport) && (
          <div className="hero-actions">

            {canImport && (
              <button className="secondary-btn" onClick={() => setShowImport(true)}>
                <Upload size={16} />
                Import
              </button>
            )}

            {canCreate && (<>
            <button
              className="secondary-btn"
              onClick={() => openNewModal("idea")}
            >
              <Lightbulb size={16} />
              Save Idea
            </button>

            <button
              className="primary-btn"
              onClick={() => openNewModal("new")}
            >
              <Plus size={17} />
              New Repository Item
            </button>
            </>)}

          </div>
          )}

        </section>

        {/* ================= STAT CARDS ================= */}

        <section className="stats-grid">

          <StatCard
            onOpen={clearFilters}
            label="TOTAL REPOSITORY"
            value={totalRepository}
            description="Saved reusable items"
            icon={<Archive size={17} />}
            variant="blue"
          />

          <StatCard
            onOpen={() => { clearFilters(); setType("Template"); }}
            label="READY TO ASSIGN"
            value={readyToAssign}
            description="Prepared task templates"
            icon={<Send size={17} />}
            variant="green"
          />

          <StatCard
            onOpen={() => { clearFilters(); setType("Idea"); }}
            label="IDEAS & DRAFTS"
            value={ideas}
            description="Ideas waiting to develop"
            icon={<Lightbulb size={17} />}
            variant="yellow"
          />

          <StatCard
            onOpen={() => { clearFilters(); setUsedOnly(true); }}
            label="RECENTLY USED"
            value={recentlyUsed}
            description="Previously assigned items"
            icon={<RotateCcw size={17} />}
            variant="purple"
          />

          <StatCard
            onOpen={canOpen.users() ? () => navigate(appLinks.users()) : undefined}
            label="DEPARTMENTS"
            value={departmentCount}
            description="Departments represented"
            icon={<Users size={17} />}
            variant="pink"
          />

        </section>

        {/* ================= QUICK ACTIONS ================= */}

        <section className="quick-actions">

          <QuickAction
            icon={<Copy size={18} />}
            title="Create Task Template"
            description="Build a reusable task for future assignments."
            onClick={() => openNewModal("new")}
          />

          <QuickAction
            icon={<Lightbulb size={18} />}
            title="Store New Idea"
            description="Save an idea now and develop it later."
            onClick={() => openNewModal("idea")}
            variant="yellow"
          />

          <QuickAction
            icon={<Zap size={18} />}
            title="Ready to Assign"
            description="View tasks that can be assigned immediately."
            onClick={() => {
              setType("Template");
              setSearch("");
              setCategory("All Categories");
              setDepartment("All Departments");
              setPriority("All Priorities");
            }}
            variant="green"
          />

        </section>

        {/* ================= SEARCH PANEL ================= */}

        <section className="filter-card">

          <div className="section-heading">

            <div className="section-heading-left">

              <div className="section-icon">
                <Filter size={17} />
              </div>

              <div>
                <h2>Search Repository</h2>
                <p>Find saved tasks, templates and ideas.</p>
              </div>

            </div>

            <div className="view-switch">

              <button
                className={viewMode === "grid" ? "active" : ""}
                onClick={() => setViewMode("grid")}
                title="Grid view"
              >
                <Grid2X2 size={15} />
              </button>

              <button
                className={viewMode === "list" ? "active" : ""}
                onClick={() => setViewMode("list")}
                title="List view"
              >
                <List size={16} />
              </button>

            </div>

          </div>

          <div className="filters-row">

            <div className="search-box">

              <Search size={16} />

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search task ideas, templates..."
              />

              {search && (
                <button
                  className="clear-search"
                  onClick={() => setSearch("")}
                >
                  <X size={14} />
                </button>
              )}

            </div>

            <SelectBox
              value={category}
              onChange={setCategory}
              options={categories}
            />

            <SelectBox
              value={department}
              onChange={setDepartment}
              options={departments}
            />

            <SelectBox
              value={type}
              onChange={setType}
              options={["All Types", "Template", "Idea"]}
            />

            <SelectBox
              value={priority}
              onChange={setPriority}
              options={["All Priorities", "High", "Medium", "Low"]}
            />

            <button
              className="clear-filter-btn"
              onClick={clearFilters}
            >
              <RotateCcw size={14} />
              Clear
            </button>

          </div>

        </section>

        {/* ================= REPOSITORY HEADER ================= */}

        <div className="repository-header">

          <div>
            <h2>Task Repository</h2>

            <span>
              Showing{" "}
              <strong>{filteredRepository.length}</strong>{" "}
              of {repository.length}
            </span>
          </div>

          <div className="repository-summary">
            <BookOpen size={15} />
            Reusable workspace library
          </div>

        </div>

        {/* ================= LOADING ================= */}

        {loading && (
          <section className="empty-state">
            <div className="empty-icon">
              <Archive size={31} />
            </div>
            <h3>Loading Task Bank...</h3>
            <p>Fetching items from the server.</p>
          </section>
        )}

        {/* ================= ERROR ================= */}

        {!loading && error && (
          <section className="empty-state">
            <div className="empty-icon">
              <X size={31} />
            </div>
            <h3>Could not load Task Bank</h3>
            <p>{error}</p>
            <button className="primary-btn" onClick={loadItems}>
              <RotateCcw size={15} />
              Retry
            </button>
          </section>
        )}

        {/* ================= EMPTY ================= */}

        {!loading && !error && filteredRepository.length === 0 && (
          <section className="empty-state">

            <div className="empty-icon">
              <Archive size={31} />
            </div>

            <h3>No Repository Items Found</h3>

            <p>
              {repository.length === 0
                ? isSuperAdmin
                  ? "Your Task Bank is empty. Load the shared sample templates or create your first item."
                  : "Your Task Bank is empty. Create your first item to get started."
                : "No task bank items match your current filters."}
            </p>

            {repository.length === 0 && !isSuperAdmin ? (
              canCreate && (
                <button className="primary-btn" onClick={() => openNewModal("new")}>
                  <Plus size={15} />
                  Create Item
                </button>
              )
            ) : repository.length === 0 ? (
              <button className="primary-btn" onClick={seedSampleData}>
                <Sparkles size={15} />
                Load Sample Data
              </button>
            ) : (
              <button className="primary-btn" onClick={clearFilters}>
                <RotateCcw size={15} />
                Reset Filters
              </button>
            )}

          </section>
        )}

        {!loading && !error && selectableBankIds.length > 0 && (
          <BulkSelectBar {...bankSelect} label="items" onDelete={deleteSelectedItems} />
        )}

        {(itemFilter || usedOnly) && (
          <div className="app-filter-chips">
            <span>Showing only:</span>
            {itemFilter && (
              <button type="button" className="app-filter-chip" onClick={() => setItemFilter("")} title="Show all items">
                {repository.find((i) => i.id === itemFilter)?.title || "One item"} <X size={12} />
              </button>
            )}
            {usedOnly && (
              <button type="button" className="app-filter-chip" onClick={() => setUsedOnly(false)} title="Remove this filter">
                Assigned before <X size={12} />
              </button>
            )}
          </div>
        )}

        {/* ================= GRID ================= */}

        {!loading && !error && viewMode === "grid" &&
          filteredRepository.length > 0 && (
            <div className="repository-grid">

              {bankPage.items.map((item) => (
                <RepositoryCard
                  key={item.id}
                  item={item}
                  menuId={menuId}
                  setMenuId={setMenuId}
                  onAssign={canAssign ? assignTask : undefined}
                  onEdit={canEdit ? openNewModal : undefined}
                  onDelete={canDelete ? deleteItem : undefined}
                  onDuplicate={canCreate ? duplicateItem : undefined}
                  selected={bankSelect.isSelected(item.id)}
                  onSelect={canDelete ? () => bankSelect.toggle(item.id) : undefined}
                />
              ))}

            </div>
          )}

        {/* ================= LIST ================= */}

        {!loading && !error && viewMode === "list" &&
          filteredRepository.length > 0 && (
            <div className="repository-list">

              {bankPage.items.map((item) => (
                <RepositoryListItem
                  key={item.id}
                  item={item}
                  menuId={menuId}
                  setMenuId={setMenuId}
                  onAssign={canAssign ? assignTask : undefined}
                  onEdit={canEdit ? openNewModal : undefined}
                  onDelete={canDelete ? deleteItem : undefined}
                  onDuplicate={canCreate ? duplicateItem : undefined}
                  selected={bankSelect.isSelected(item.id)}
                  onSelect={canDelete ? () => bankSelect.toggle(item.id) : undefined}
                />
              ))}

            </div>
          )}

        {!loading && !error && filteredRepository.length > 0 && (
          <Pagination {...bankPage} label="items" />
        )}

      </div>

      {/* ================= MODAL ================= */}

      {showModal && (
        <RepositoryModal
          form={form}
          setForm={setForm}
          onClose={closeModal}
          onSubmit={handleSubmit}
          editing={Boolean(selectedItem)}
          saving={saving}
          mode={modalMode}
          departments={userDepartments}
          departmentsLoading={!assignOptionsLoaded}
        />
      )}

      {showImport && (
        <CsvImportDialog
          endpoint="/api/taskbank/import"
          title="Import Task Bank items from CSV"
          help="Columns: Title*, Description*, Category, Department, Type (Template or Idea), Priority (High, Medium, Low), Estimated Time, Tags (separate with ; ). Items whose title already exists are skipped."
          columns={[
            { key: "title", label: "Title" },
            { key: "category", label: "Category" },
            { key: "department", label: "Department" },
            { key: "type", label: "Type" },
            { key: "priority", label: "Priority" },
            { key: "tags", label: "Tags" },
          ]}
          template={{
            filename: "task-bank-import-template.csv",
            header: "Title,Description,Category,Department,Type,Priority,Estimated Time,Tags",
            sample: ["Monthly security review,Review access rights and logs,Security,IT,Template,High,3 hours,security; monthly"],
          }}
          onClose={() => setShowImport(false)}
          onImported={(result) => {
            setShowImport(false);
            loadItems();
            alert(result.message || "Items imported.");
          }}
        />
      )}

      {assignTarget && (
        <AssignModal
          item={assignTarget}
          form={assignForm}
          setForm={setAssignForm}
          users={assignUsers}
          departments={assignDepartments}
          loading={!assignOptionsLoaded && !assignError}
          mode={assignMode}
          saving={assigning}
          error={assignError}
          onClose={() => !assigning && setAssignTarget(null)}
          onSubmit={submitAssign}
        />
      )}

      {/* ================= CSS ================= */}

      <style>{APP_LINK_CSS + `

        * {
          box-sizing: border-box;
        }

        .task-bank-page {
          min-height: 100vh;
          position: relative;
          overflow-x: hidden;
          padding: 28px 24px 70px;
          background:
            radial-gradient(circle at 8% 5%, rgba(81, 210, 225, 0.18), transparent 27%),
            radial-gradient(circle at 94% 12%, rgba(124, 96, 230, 0.12), transparent 30%),
            linear-gradient(135deg, #edfafd 0%, #f7fbfd 44%, #f4f3fc 100%);
          color: #173653;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .task-bank-container {
          width: 100%;
          max-width: 1480px;
          margin: 0 auto;
          position: relative;
          z-index: 100;
        }

        .task-bank-background-orb {
          position: fixed;
          border-radius: 999px;
          pointer-events: none;
          filter: blur(3px);
          z-index: 0;
        }

        .orb-one {
          width: 360px;
          height: 360px;
          left: -180px;
          top: 300px;
          background: rgba(55, 202, 215, 0.08);
        }

        .orb-two {
          width: 420px;
          height: 420px;
          right: -220px;
          top: 450px;
          background: rgba(102, 83, 220, 0.08);
        }

        /* HERO */

        .task-bank-hero {
          min-height: 120px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding: 25px 28px;
          border: 1px solid rgba(125, 178, 202, 0.35);
          border-radius: 21px;
          background: linear-gradient(135deg, rgba(255,255,255,0.96), rgba(238,249,252,0.94));
          box-shadow: 0 15px 35px rgba(23, 72, 100, 0.07), inset 0 1px 0 rgba(255,255,255,0.9);
          position: relative;
          overflow: hidden;
        }

        .task-bank-hero::after {
          content: "";
          position: absolute;
          width: 250px;
          height: 250px;
          border-radius: 50%;
          right: -80px;
          top: -130px;
          background: rgba(73, 202, 220, 0.1);
        }

        .hero-left {
          display: flex;
          align-items: center;
          gap: 17px;
          min-width: 0;
          position: relative;
          z-index: 1;
        }

        .hero-icon {
          width: 52px;
          height: 52px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 15px;
          color: white;
          background: linear-gradient(145deg, #143e69, #0c72a1);
          box-shadow: 0 9px 22px rgba(14, 92, 132, 0.23);
        }

        .hero-title-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
        }

        .hero-title-row h1 {
          margin: 0;
          color: #123554;
          font-size: 25px;
          font-weight: 800;
          letter-spacing: -0.6px;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 9px;
          border-radius: 999px;
          color: #0b6e82;
          background: #e2f7f7;
          border: 1px solid #c8ecef;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }

        .hero-left p {
          margin: 6px 0 0;
          color: #6b879e;
          font-size: 12px;
          line-height: 1.5;
        }

        .hero-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          position: relative;
          z-index: 3;
        }

        button {
          font-family: inherit;
        }

        .primary-btn,
        .secondary-btn {
          height: 40px;
          border-radius: 10px;
          padding: 0 15px;
          border: 1px solid transparent;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 750;
          transition: 0.2s ease;
          white-space: nowrap;
        }

        .primary-btn {
          color: white;
          background: linear-gradient(135deg, #123f69, #177eaa);
          box-shadow: 0 7px 17px rgba(18, 86, 125, 0.2);
        }

        .primary-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 22px rgba(18, 86, 125, 0.27);
        }

        .primary-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .secondary-btn {
          color: #1d5b7b;
          background: rgba(255,255,255,0.85);
          border-color: #cfe1ea;
        }

        .secondary-btn:hover {
          background: #fff;
          border-color: #9dc4d5;
        }

        /* STATS */

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
          margin-top: 13px;
        }

        .stat-card {
          min-height: 110px;
          padding: 17px 18px;
          border-radius: 15px;
          border: 1px solid #d5e3ea;
          background: rgba(255,255,255,0.92);
          box-shadow: 0 7px 20px rgba(30, 76, 101, 0.045);
          position: relative;
          overflow: hidden;
          transition: 0.2s ease;
        }

        .stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 26px rgba(30, 76, 101, 0.08);
        }

        .stat-card::before {
          content: "";
          position: absolute;
          height: 2px;
          left: 0;
          right: 0;
          top: 0;
        }

        .stat-card.blue::before { background: #2785b5; }
        .stat-card.green::before { background: #19a78a; }
        .stat-card.yellow::before { background: #e4ae3b; }
        .stat-card.purple::before { background: #7568dc; }
        .stat-card.pink::before { background: #cb6ea9; }

        .stat-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .stat-label {
          color: #7890a3;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.8px;
        }

        .stat-icon {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .stat-card.blue .stat-icon { color: #2a80aa; background: #eaf6fb; }
        .stat-card.green .stat-icon { color: #1b9a81; background: #e9f8f2; }
        .stat-card.yellow .stat-icon { color: #c99625; background: #fff7df; }
        .stat-card.purple .stat-icon { color: #7162ce; background: #f1effd; }
        .stat-card.pink .stat-icon { color: #b75c94; background: #f9edf6; }

        .stat-value {
          margin-top: 6px;
          color: #173b5c;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.7px;
        }

        .stat-description {
          margin-top: 3px;
          color: #89a0b1;
          font-size: 9px;
        }

        /* QUICK ACTIONS */

        .quick-actions {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 13px;
        }

        .quick-action {
          min-height: 59px;
          padding: 10px 15px;
          display: flex;
          align-items: center;
          gap: 11px;
          text-align: left;
          cursor: pointer;
          border-radius: 13px;
          border: 1px solid #d7e5eb;
          background: rgba(255,255,255,0.83);
          transition: 0.2s ease;
          position: relative;
        }

        .quick-action:hover {
          transform: translateY(-1px);
          background: #fff;
          border-color: #b7d3df;
          box-shadow: 0 8px 20px rgba(34, 83, 107, 0.07);
        }

        .quick-icon {
          width: 31px;
          height: 31px;
          border-radius: 9px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #237ba3;
          background: #eaf6fb;
        }

        .quick-action.yellow .quick-icon { color: #c38e24; background: #fff6dc; }
        .quick-action.green .quick-icon { color: #159377; background: #e6f8f1; }

        .quick-content {
          min-width: 0;
          flex: 1;
        }

        .quick-title {
          color: #194264;
          font-size: 10px;
          font-weight: 800;
        }

        .quick-description {
          margin-top: 2px;
          color: #8299aa;
          font-size: 8px;
        }

        .quick-arrow {
          color: #7d9aab;
        }

        /* FILTER */

        .filter-card {
          margin-top: 13px;
          padding: 16px;
          border-radius: 15px;
          border: 1px solid #d5e3ea;
          background: rgba(255,255,255,0.92);
          box-shadow: 0 8px 24px rgba(31, 79, 102, 0.045);
        }

        .section-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }

        .section-heading-left {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .section-icon {
          width: 30px;
          height: 30px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #267ba1;
          background: #e9f5fa;
        }

        .section-heading h2 {
          margin: 0;
          color: #193e5c;
          font-size: 13px;
          font-weight: 800;
        }

        .section-heading p {
          margin: 2px 0 0;
          color: #8ba0b0;
          font-size: 8px;
        }

        .view-switch {
          display: flex;
          padding: 3px;
          border: 1px solid #d6e4eb;
          border-radius: 9px;
          background: #f8fbfc;
        }

        .view-switch button {
          width: 29px;
          height: 27px;
          border: 0;
          border-radius: 6px;
          color: #7791a2;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .view-switch button.active {
          color: #216f96;
          background: white;
          box-shadow: 0 2px 7px rgba(36, 81, 102, 0.09);
        }

        .filters-row {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 1fr 1fr auto;
          gap: 8px;
        }

        .search-box,
        .select-box {
          height: 36px;
          border: 1px solid #d6e5ec;
          border-radius: 9px;
          background: #fbfdfe;
          display: flex;
          align-items: center;
        }

        .search-box {
          padding: 0 10px;
          gap: 8px;
          color: #8ca3b1;
        }

        .search-box input {
          width: 100%;
          border: 0;
          outline: none;
          background: transparent;
          color: #31556e;
          font-size: 10px;
        }

        .search-box input::placeholder {
          color: #9bb0bc;
        }

        .clear-search {
          width: 20px;
          height: 20px;
          border: 0;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          cursor: pointer;
          color: #7893a4;
          background: #edf3f6;
        }

        .select-box {
          position: relative;
          padding: 0 10px;
        }

        .select-box select {
          appearance: none;
          width: 100%;
          height: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          color: #48677d;
          font-size: 9px;
          cursor: pointer;
          padding-right: 16px;
        }

        .select-arrow {
          position: absolute;
          right: 8px;
          color: #829baa;
          pointer-events: none;
        }

        .clear-filter-btn {
          height: 36px;
          padding: 0 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          border: 1px solid #d6e5ec;
          border-radius: 9px;
          background: #f7fafb;
          color: #648196;
          cursor: pointer;
          font-size: 9px;
          font-weight: 700;
        }

        .clear-filter-btn:hover {
          background: white;
          color: #236f94;
        }

        /* REPOSITORY HEADER */

        .repository-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin: 19px 2px 10px;
        }

        .repository-header h2 {
          margin: 0;
          color: #173c5c;
          font-size: 14px;
          font-weight: 850;
        }

        .repository-header span {
          display: block;
          margin-top: 3px;
          color: #879dac;
          font-size: 8px;
        }

        .repository-header span strong {
          color: #357392;
        }

        .repository-summary {
          display: flex;
          align-items: center;
          gap: 5px;
          color: #7893a3;
          font-size: 8px;
        }

        /* GRID */

        .repository-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 13px;
        }

        .repository-card {
          min-height: 250px;
          position: relative;
          padding: 16px;
          border: 1px solid #d4e3ea;
          border-radius: 15px;
          background: rgba(255,255,255,0.94);
          box-shadow: 0 7px 22px rgba(26, 71, 95, 0.045);
          overflow: visible;
          transition: 0.22s ease;
        }

        .repository-card::before {
          content: "";
          position: absolute;
          height: 2px;
          top: 0;
          left: 0;
          right: 0;
          border-radius: 15px 15px 0 0;
          background: linear-gradient(90deg, #2185b3, #6974df, #d85e9d);
        }

        .repository-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 14px 32px rgba(25, 72, 99, 0.09);
        }

        .card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .badge-group {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 5px;
        }

        .item-badge {
          padding: 4px 7px;
          border-radius: 999px;
          font-size: 7px;
          font-weight: 850;
          letter-spacing: 0.35px;
          text-transform: uppercase;
        }

        .item-badge.template { color: #287399; background: #eaf6fb; }
        .item-badge.idea { color: #ae7b17; background: #fff5d8; }
        .item-badge.ready { color: #16866f; background: #e5f7f0; }
        .item-badge.draft { color: #ad7c1c; background: #fff4dc; }

        .more-button {
          width: 27px;
          height: 27px;
          border: 1px solid #d9e6ec;
          border-radius: 8px;
          background: #fbfdfe;
          color: #6e8a9b;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .more-button:hover {
          background: white;
          color: #246d91;
        }

        .card-menu {
          position: absolute;
          top: 49px;
          right: 15px;
          z-index: 10;
          width: 145px;
          padding: 5px;
          border: 1px solid #d6e4eb;
          border-radius: 10px;
          background: white;
          box-shadow: 0 15px 30px rgba(25, 66, 89, 0.14);
        }

        .repository-list-item .card-menu {
          top: 58px;
          right: 12px;
        }

        .card-menu button {
          width: 100%;
          height: 31px;
          padding: 0 8px;
          display: flex;
          align-items: center;
          gap: 8px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #4d6d81;
          cursor: pointer;
          text-align: left;
          font-size: 9px;
          font-weight: 650;
        }

        .card-menu button:hover {
          background: #f2f8fa;
          color: #216e94;
        }

        .card-menu button.danger {
          color: #c05656;
        }

        .card-title {
          margin: 17px 0 6px;
          color: #173b5a;
          font-size: 13px;
          font-weight: 850;
          line-height: 1.35;
        }

        .card-description {
          min-height: 38px;
          color: #7892a3;
          font-size: 9px;
          line-height: 1.55;
        }

        .card-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 12px;
        }

        .meta-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 5px 7px;
          border-radius: 7px;
          color: #58788c;
          background: #f3f8fa;
          border: 1px solid #e3edf1;
          font-size: 7px;
          font-weight: 700;
        }

        .priority-high { color: #bd5b5b; background: #fff0f0; border-color: #f5dada; }
        .priority-medium { color: #b17d1f; background: #fff7e5; border-color: #f5e5bc; }
        .priority-low { color: #43816f; background: #ebf8f3; border-color: #d8eee7; }

        .bank-files{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
        .bank-file{display:inline-flex;align-items:center;gap:4px;max-width:100%;border:1px solid #d5e7ee;background:#fff;color:#1677a8;border-radius:999px;padding:3px 9px;font-size:10.5px;font-weight:700;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .tags {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: 11px;
        }

        .tag {
          color: #6d8797;
          font-size: 7px;
          font-weight: 700;
        }

        .tag::before {
          content: "#";
          color: #8da7b5;
        }

        .card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 15px;
          padding-top: 11px;
          border-top: 1px solid #edf2f4;
        }

        .usage {
          display: flex;
          align-items: center;
          gap: 5px;
          color: #839aa9;
          font-size: 8px;
        }

        .assign-btn {
          height: 30px;
          padding: 0 10px;
          display: flex;
          align-items: center;
          gap: 5px;
          border: 0;
          border-radius: 8px;
          color: white;
          background: linear-gradient(135deg, #174b76, #2386ad);
          cursor: pointer;
          font-size: 8px;
          font-weight: 800;
        }

        .assign-btn:hover {
          box-shadow: 0 6px 14px rgba(22, 85, 118, 0.2);
        }

        /* LIST */

        .repository-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .repository-list-item {
          min-height: 78px;
          padding: 12px 15px;
          display: grid;
          grid-template-columns: 2fr 1.2fr 1fr auto;
          align-items: center;
          gap: 15px;
          position: relative;
          border: 1px solid #d5e3ea;
          border-radius: 13px;
          background: rgba(255,255,255,0.94);
          box-shadow: 0 5px 15px rgba(26, 71, 95, 0.035);
        }

        .repository-list-item::before {
          content: "";
          position: absolute;
          width: 3px;
          left: 0;
          top: 10px;
          bottom: 10px;
          border-radius: 0 5px 5px 0;
          background: linear-gradient(#2587b2, #6f6ddd);
        }

        .list-main {
          min-width: 0;
        }

        .list-title {
          margin-top: 7px;
          color: #1a405e;
          font-size: 11px;
          font-weight: 800;
        }

        .list-description {
          margin-top: 3px;
          color: #839aa9;
          font-size: 8px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .list-meta {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
        }

        .list-department {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #5f7c8d;
          font-size: 8px;
          font-weight: 700;
        }

        .list-action {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        /* EMPTY */

        .empty-state {
          min-height: 280px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          border: 1px dashed #cbdde5;
          border-radius: 16px;
          background: rgba(255,255,255,0.7);
        }

        .empty-icon {
          width: 62px;
          height: 62px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 18px;
          color: #7ea2b4;
          background: #edf6f9;
        }

        .empty-state h3 {
          margin: 13px 0 4px;
          color: #41667e;
          font-size: 13px;
        }

        .empty-state p {
          margin: 0 0 15px;
          color: #8ba1af;
          font-size: 9px;
        }

        /* MODAL */

        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 5000; /* above the sticky header + nav bar */
          padding: 25px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(11, 36, 55, 0.38);
          backdrop-filter: blur(7px);
        }

        .modal {
          width: min(650px, 100%);
          max-height: calc(100vh - 50px);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid #d4e3ea;
          background: white;
          box-shadow: 0 30px 80px rgba(13, 52, 75, 0.25);
        }

        .modal-header {
          padding: 19px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #e7eef2;
          background: linear-gradient(135deg, #f4fcfd, #f7f6fd);
        }

        .modal-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .modal-header-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          background: linear-gradient(135deg, #174b75, #2586ad);
        }

        .modal-title {
          margin: 0;
          color: #193d5a;
          font-size: 15px;
          font-weight: 850;
        }

        .modal-subtitle {
          margin: 3px 0 0;
          color: #8ca1af;
          font-size: 8px;
        }

        .modal-close {
          width: 31px;
          height: 31px;
          border: 1px solid #dbe7ec;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #7892a2;
          background: white;
          cursor: pointer;
        }

        .modal-close:hover {
          color: #b34e59;
          background: #fff5f5;
        }

        .modal-header,
        .modal-footer {
          flex-shrink: 0;
        }

        .modal > form {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }

        .modal-body {
          padding: 20px;
          flex: 1;
          min-height: 0;
          overflow-y: auto;
        }

        .toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .switch {
          position: relative;
          width: 34px;
          height: 19px;
          flex-shrink: 0;
          padding: 0;
          border: none;
          border-radius: 999px;
          background: #cfdde5;
          cursor: pointer;
          transition: background 0.18s ease;
        }

        .switch span {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 15px;
          height: 15px;
          border-radius: 50%;
          background: white;
          box-shadow: 0 1px 3px rgba(13, 52, 75, 0.25);
          transition: transform 0.18s ease;
        }

        .switch.on {
          background: #2586ad;
        }

        .switch.on span {
          transform: translateX(15px);
        }

        .switch:focus-visible {
          outline: 2px solid #7db5ca;
          outline-offset: 2px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 13px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .form-group.full {
          grid-column: 1 / -1;
        }

        .form-group label {
          color: #47677c;
          font-size: 9px;
          font-weight: 800;
        }

        .form-group input,
        .form-group textarea,
        .form-group select {
          width: 100%;
          border: 1px solid #d6e4eb;
          outline: none;
          border-radius: 9px;
          background: #fbfdfe;
          color: #365a70;
          font-size: 10px;
          font-family: inherit;
          transition: 0.18s ease;
        }

        .form-group input,
        .form-group select {
          height: 38px;
          padding: 0 10px;
        }

        .form-group textarea {
          min-height: 90px;
          resize: vertical;
          padding: 10px;
          line-height: 1.5;
        }

        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
          border-color: #7db5ca;
          background: white;
          box-shadow: 0 0 0 3px rgba(45, 142, 176, 0.08);
        }

        .form-help {
          color: #9aadb9;
          font-size: 7px;
        }

        .modal-footer {
          padding: 14px 20px;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          border-top: 1px solid #e8eff2;
          background: #fbfdfe;
        }

        .cancel-btn {
          height: 37px;
          padding: 0 14px;
          border: 1px solid #d6e4eb;
          border-radius: 9px;
          color: #627f91;
          background: white;
          cursor: pointer;
          font-size: 10px;
          font-weight: 750;
        }

        /* RESPONSIVE */

        @media (max-width: 1200px) {

          .stats-grid {
            grid-template-columns: repeat(3, 1fr);
          }

          .filters-row {
            grid-template-columns: 1.6fr 1fr 1fr;
          }

          .clear-filter-btn {
            width: 100%;
          }

          .repository-grid {
            grid-template-columns: repeat(2, 1fr);
          }

        }

        @media (max-width: 850px) {

          .task-bank-page {
            padding: 18px 13px 50px;
          }

          .task-bank-hero {
            flex-direction: column;
            align-items: flex-start;
          }

          .hero-actions {
            width: 100%;
          }

          .hero-actions button {
            flex: 1;
          }

          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .quick-actions {
            grid-template-columns: 1fr;
          }

          .filters-row {
            grid-template-columns: 1fr 1fr;
          }

          .search-box {
            grid-column: 1 / -1;
          }

          .repository-grid {
            grid-template-columns: 1fr;
          }

          .repository-list-item {
            grid-template-columns: 1fr;
          }

          .list-action {
            justify-content: flex-start;
          }

        }

        @media (max-width: 560px) {

          .stats-grid {
            grid-template-columns: 1fr;
          }

          .filters-row {
            grid-template-columns: 1fr;
          }

          .hero-actions {
            flex-direction: column;
          }

          .hero-actions button {
            width: 100%;
          }

          .form-grid {
            grid-template-columns: 1fr;
          }

          .repository-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }

        }

        /* ===== shared theme (matches Dashboard / Users / Tasks) ===== */
        .task-bank-page { background: var(--ts-page-bg); }
        .task-bank-page .orb-one,
        .task-bank-page .orb-two { background: radial-gradient(circle, rgba(22,166,184,.13), transparent 70%); }
        .task-bank-page .task-bank-hero {
          background: var(--ts-hero);
          border: var(--ts-hero-border);
          box-shadow: var(--ts-hero-shadow);
          color: var(--ts-on-hero);
        }
        .task-bank-page .hero-title-row h1 { color: var(--ts-on-hero); }
        .task-bank-page .hero-left p { color: var(--ts-on-hero-muted); }
        .task-bank-page .hero-badge { background: var(--ts-glass); color: #e6fbfd; border-color: var(--ts-glass-border); }
        .task-bank-page .task-bank-hero .hero-icon { background: var(--ts-glass); color: #fff; border: 1px solid var(--ts-glass-border); box-shadow: none; }
        .task-bank-page .task-bank-hero .secondary-btn { background: var(--ts-glass); color: #fff; border-color: var(--ts-glass-border); }
        .task-bank-page .task-bank-hero .secondary-btn:hover { background: rgba(255,255,255,.22); }
        .task-bank-page .task-bank-hero .primary-btn { background: var(--ts-primary); box-shadow: var(--ts-primary-shadow); }
        .task-bank-page .stat-card.purple::before { background: #1677a8; }
        .task-bank-page .stat-card.pink::before { background: #0f6b8f; }
        .task-bank-page .stat-card.purple .stat-icon { color: #1677a8; background: #e8f4fa; }
        .task-bank-page .stat-card.pink .stat-icon { color: #0f6b8f; background: #e6f3f7; }
        .task-bank-page .repository-card::before { background: linear-gradient(90deg, #123f67, #16a6b8, #5fd3dd); }


      `}</style>

    </div>
  );
};

/* =========================================================
   STAT CARD
   ========================================================= */

const StatCard = ({ label, value, description, icon, variant = "blue", onOpen }) => (
  <div
    className={`stat-card ${variant}${onOpen ? " app-link-card" : ""}`}
    {...(onOpen ? linkProps(onOpen, `Show ${label.toLowerCase()}`) : {})}
  >
    <div className="stat-top">
      <span className="stat-label">{label}</span>
      <div className="stat-icon">{icon}</div>
    </div>
    <div className="stat-value">{value}</div>
    <div className="stat-description">{description}</div>
  </div>
);

/* =========================================================
   QUICK ACTION
   ========================================================= */

const QuickAction = ({ icon, title, description, onClick, variant = "" }) => (
  <button className={`quick-action ${variant}`} onClick={onClick}>
    <div className="quick-icon">{icon}</div>
    <div className="quick-content">
      <div className="quick-title">{title}</div>
      <div className="quick-description">{description}</div>
    </div>
    <ArrowRight size={14} className="quick-arrow" />
  </button>
);

/* =========================================================
   SELECT BOX
   ========================================================= */

const SelectBox = ({ value, onChange, options }) => (
  <div className="select-box">
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
    <ChevronDown size={13} className="select-arrow" />
  </div>
);

/* =========================================================
   REPOSITORY CARD (GRID VIEW)
   ========================================================= */

const RepositoryCard = ({
  item,
  menuId,
  setMenuId,
  onAssign,
  onEdit,
  onDelete,
  onDuplicate,
  selected = false,
  onSelect,
}) => {
  const navigate = useNavigate();
  const isMenuOpen = menuId === item.id;

  const typeClass = item.type === "Idea" ? "idea" : "template";
  const statusClass = item.status === "Ready to Assign" ? "ready" : "draft";
  const priorityClass =
    item.priority === "High"
      ? "high"
      : item.priority === "Medium"
      ? "medium"
      : "low";

  return (
    <div className="repository-card" style={selected ? { outline: "2px solid #0e7490", outlineOffset: 2 } : undefined}>

      <div className="card-top">

        <div className="badge-group">
          {onSelect && <SelectCheckbox checked={selected} onChange={onSelect} label={`Select ${item.title}`} />}
          <span className={`item-badge ${typeClass}`}>{item.type}</span>
          <span className={`item-badge ${statusClass}`}>{item.status}</span>
        </div>

        <button
          className="more-button"
          onClick={() => setMenuId(isMenuOpen ? null : item.id)}
        >
          <MoreHorizontal size={15} />
        </button>

      </div>

      {isMenuOpen && (onEdit || onDuplicate || onDelete) && (
        <div className="card-menu">
          {onEdit && (
          <button onClick={() => onEdit("edit", item)}>
            <Edit3 size={12} />
            Edit Item
          </button>
          )}
          {onDuplicate && (
          <button onClick={() => onDuplicate(item)}>
            <Copy size={12} />
            Duplicate
          </button>
          )}
          {onDelete && (
          <button className="danger" onClick={() => onDelete(item.id)}>
            <Trash2 size={12} />
            Delete
          </button>
          )}
        </div>
      )}

      <h3 className="card-title">{item.title}</h3>

      <p className="card-description">{item.description}</p>

      <div className="card-meta">
        <span className="meta-pill">
          <ClipboardList size={10} />
          {item.category}
        </span>
        <span
          className={`meta-pill${item.department && canOpen.users() ? " app-link" : ""}`}
          {...(item.department && canOpen.users()
            ? linkProps(() => navigate(appLinks.users({ department: item.department })), `People in ${item.department}`)
            : {})}
        >
          <Users size={10} />
          {item.department}
        </span>
        <span className={`meta-pill priority-${priorityClass}`}>
          <Zap size={10} />
          {item.priority}
        </span>
        {item.estimatedTime && (
          <span className="meta-pill">
            <FileText size={10} />
            {item.estimatedTime}
          </span>
        )}
      </div>

      <div className="tags">
        {(item.tags || []).map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>

      {item.attachments?.length > 0 && (
        <div className="bank-files">
          {item.attachments.map((file) => (
            <button
              key={file.filename}
              type="button"
              className="bank-file"
              onClick={() => downloadBankFile(file)}
              title={`Download ${file.name}`}
            >
              <Paperclip size={10} /> {file.name}
            </button>
          ))}
        </div>
      )}

      {item.lastAssignedTo && (
        <div
          className={`usage${canOpen.tasks() ? " app-link" : ""}`}
          style={{ marginTop: 8 }}
          {...(canOpen.tasks()
            ? linkProps(
                () => navigate(appLinks.tasks({ template: item.id, templateName: item.title })),
                `Open the tasks created from this item (${item.assignments.map((a) => a.userName).join(", ")})`
              )
            : { title: item.assignments.map((a) => a.userName).join(", ") })}
        >
          <Users size={11} />
          Assigned to {item.lastAssignedTo}
          {item.assignedCount > 1 ? ` +${item.assignedCount - 1} more` : ""}
        </div>
      )}

      <div className="card-footer">
        <span className="usage">
          <RotateCcw size={11} />
          Used {item.usageCount || 0}x
        </span>
        {onAssign && (
        <button className="assign-btn" onClick={() => onAssign(item.id)}>
          <Send size={11} />
          {item.assignedCount > 0 ? "Reassign" : "Assign"}
        </button>
        )}
      </div>

    </div>
  );
};

/* =========================================================
   REPOSITORY LIST ITEM (LIST VIEW)
   ========================================================= */

const RepositoryListItem = ({
  item,
  menuId,
  setMenuId,
  onAssign,
  onEdit,
  onDelete,
  onDuplicate,
  selected = false,
  onSelect,
}) => {
  const navigate = useNavigate();
  const isMenuOpen = menuId === item.id;

  const typeClass = item.type === "Idea" ? "idea" : "template";
  const statusClass = item.status === "Ready to Assign" ? "ready" : "draft";

  return (
    <div className="repository-list-item" style={selected ? { outline: "2px solid #0e7490", outlineOffset: 2 } : undefined}>

      <div className="list-main">

        <div className="badge-group">
          {onSelect && <SelectCheckbox checked={selected} onChange={onSelect} label={`Select ${item.title}`} />}
          <span className={`item-badge ${typeClass}`}>{item.type}</span>
          <span className={`item-badge ${statusClass}`}>{item.status}</span>
        </div>

        <div className="list-title">{item.title}</div>

        <div className="list-description">{item.description}</div>

      </div>

      <div className="list-meta">
        <span className="meta-pill">
          <ClipboardList size={10} />
          {item.category}
        </span>
        <span className="meta-pill">
          <Zap size={10} />
          {item.priority}
        </span>
        {item.estimatedTime && (
          <span className="meta-pill">
            <FileText size={10} />
            {item.estimatedTime}
          </span>
        )}
      </div>

      <div
        className={`list-department${item.department && canOpen.users() ? " app-link" : ""}`}
        {...(item.department && canOpen.users()
          ? linkProps(() => navigate(appLinks.users({ department: item.department })), `People in ${item.department}`)
          : {})}
      >
        <Users size={11} />
        {item.department}
      </div>

      <div className="list-action">

        <span
          className={`usage${item.lastAssignedTo && canOpen.tasks() ? " app-link" : ""}`}
          {...(item.lastAssignedTo && canOpen.tasks()
            ? linkProps(
                () => navigate(appLinks.tasks({ template: item.id, templateName: item.title })),
                `Open the tasks created from this item (last: ${item.lastAssignedTo})`
              )
            : { title: item.lastAssignedTo ? `Last assigned to ${item.lastAssignedTo}` : undefined })}
        >
          <RotateCcw size={11} />
          {item.usageCount || 0}x
          {item.lastAssignedTo ? ` · ${item.lastAssignedTo}` : ""}
        </span>

        {onAssign && (

        <button className="assign-btn" onClick={() => onAssign(item.id)}>
          <Send size={11} />
          {item.assignedCount > 0 ? "Reassign" : "Assign"}
        </button>

        )}

        <button
          className="more-button"
          onClick={() => setMenuId(isMenuOpen ? null : item.id)}
        >
          <MoreHorizontal size={15} />
        </button>

        {isMenuOpen && (onEdit || onDuplicate || onDelete) && (
          <div className="card-menu">
            {onEdit && (
            <button onClick={() => onEdit("edit", item)}>
              <Edit3 size={12} />
              Edit Item
            </button>
            )}
            {onDuplicate && (
            <button onClick={() => onDuplicate(item)}>
              <Copy size={12} />
              Duplicate
            </button>
            )}
            {onDelete && (
            <button className="danger" onClick={() => onDelete(item.id)}>
              <Trash2 size={12} />
              Delete
            </button>
            )}
          </div>
        )}

      </div>

    </div>
  );
};

/* =========================================================
   REPOSITORY MODAL
   ========================================================= */

/* Attachments field of the repository item form */
const FilePicker = ({ form, setForm }) => {
  const inputRef = React.useRef(null);
  const [problem, setProblem] = useState("");
  const total = form.keepFiles.length + form.newFiles.length;

  const addFiles = (list) => {
    const errors = [];
    const picked = [];
    for (const file of Array.from(list || [])) {
      const ext = file.name.split(".").pop().toLowerCase();
      if (!FILE_EXTENSIONS.includes(ext)) errors.push(`${file.name} is not a supported file type`);
      else if (file.size > MAX_FILE_SIZE) errors.push(`${file.name} is larger than 8 MB`);
      else if (!file.size) errors.push(`${file.name} is empty`);
      else if (!form.newFiles.some((f) => f.name === file.name && f.size === file.size)) picked.push(file);
    }
    const room = MAX_FILES - total;
    if (picked.length > room) errors.push(`At most ${MAX_FILES} files per item`);
    setForm((f) => ({ ...f, newFiles: [...f.newFiles, ...picked.slice(0, Math.max(room, 0))] }));
    setProblem(errors.join(". "));
  };

  return (
    <div className="file-picker">
      <div
        className="file-drop"
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
      >
        <Upload size={16} />
        <span>Click to upload or drag &amp; drop</span>
        <small>PDF, Word, Excel, PowerPoint, images, CSV, TXT, ZIP · up to 8 MB each · {MAX_FILES} files</small>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept={FILE_EXTENSIONS.map((e) => `.${e}`).join(",")}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {problem && <div className="file-problem">{problem}</div>}
      {total > 0 && (
        <div className="file-list">
          {form.keepFiles.map((file) => (
            <span key={file.filename} className="file-chip">
              <Paperclip size={11} /> {file.name} <em>{fileSize(file.size)}</em>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => setForm((f) => ({ ...f, keepFiles: f.keepFiles.filter((x) => x.filename !== file.filename) }))}
              >
                <X size={11} />
              </button>
            </span>
          ))}
          {form.newFiles.map((file, i) => (
            <span key={`${file.name}-${i}`} className="file-chip new">
              <Paperclip size={11} /> {file.name} <em>{fileSize(file.size)} · new</em>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => setForm((f) => ({ ...f, newFiles: f.newFiles.filter((_, j) => j !== i) }))}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <style>{`
        .file-drop{display:flex;flex-direction:column;align-items:center;gap:4px;padding:16px;border:1.5px dashed #9fdde1;border-radius:12px;background:#f5fbfc;color:#0b6f7d;font-size:12.5px;font-weight:700;cursor:pointer;text-align:center}
        .file-drop small{font-weight:500;color:#6e8799;font-size:11px}
        .file-drop:focus-visible{outline:3px solid #16a6b8;outline-offset:2px}
        .file-problem{margin-top:6px;font-size:11.5px;color:#b42318}
        .file-list{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
        .file-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 6px 4px 9px;border-radius:999px;background:#e6f4fa;color:#1677a8;font-size:11.5px;font-weight:700;max-width:100%}
        .file-chip.new{background:#e8f7f0;color:#0f8a5f}
        .file-chip em{font-style:normal;font-weight:500;opacity:.8}
        .file-chip button{display:flex;border:0;background:transparent;color:inherit;cursor:pointer;padding:2px}
      `}</style>
    </div>
  );
};

const RepositoryModal = ({
  form,
  setForm,
  onClose,
  onSubmit,
  editing,
  saving,
  mode,
  departments = [],
  departmentsLoading = false,
}) => {
  const handleChange = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const toggle = (key) => () => setForm((f) => ({ ...f, [key]: !f[key] }));

  // keep an item's existing department selectable even if no user is in it any more
  const departmentOptions = [...new Set([form.department, ...departments].filter(Boolean))];

  // new item → preselect the first department once the list is loaded
  useEffect(() => {
    if (!form.department && departments.length) {
      setForm((f) => (f.department ? f : { ...f, department: departments[0] }));
    }
  }, [departments, form.department, setForm]);

  // lock the page scroll behind the dialog
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">

          <div className="modal-header-left">

            <div className="modal-header-icon">
              {editing ? <Edit3 size={17} /> : <Archive size={17} />}
            </div>

            <div>
              <h3 className="modal-title">
                {editing
                  ? "Edit Repository Item"
                  : mode === "idea"
                  ? "Save New Idea"
                  : "New Repository Item"}
              </h3>
              <p className="modal-subtitle">
                Saved items can be assigned to any team member later.
              </p>
            </div>

          </div>

          <button className="modal-close" onClick={onClose}>
            <X size={15} />
          </button>

        </div>

        <form onSubmit={onSubmit}>

          <div className="modal-body">

            <div className="form-grid">

              <div className="form-group full">
                <label>Title *</label>
                <input
                  value={form.title}
                  onChange={handleChange("title")}
                  placeholder="e.g. Monthly Performance Report"
                />
              </div>

              <div className="form-group full">
                <label>Description *</label>
                <textarea
                  value={form.description}
                  onChange={handleChange("description")}
                  placeholder="Describe what this task involves..."
                />
              </div>

              <div className="form-group">
                <label>Category</label>
                <input
                  value={form.category}
                  onChange={handleChange("category")}
                  placeholder="e.g. Reporting"
                />
              </div>

              <div className="form-group">
                <label>Department</label>
                <select
                  value={form.department}
                  onChange={handleChange("department")}
                  disabled={departmentsLoading && !departmentOptions.length}
                >
                  {!departmentOptions.length && (
                    <option value="">
                      {departmentsLoading ? "Loading departments..." : "No departments with users"}
                    </option>
                  )}
                  {departmentOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Type</label>
                <select value={form.type} onChange={handleChange("type")}>
                  <option>Template</option>
                  <option>Idea</option>
                </select>
              </div>

              <div className="form-group">
                <label>Priority</label>
                <select value={form.priority} onChange={handleChange("priority")}>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </div>

              <div className="form-group full">
                <div className="toggle-row">
                  <label>Estimated Time</label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.useEstimate}
                    aria-label="Estimated Time"
                    className={`switch ${form.useEstimate ? "on" : ""}`}
                    onClick={toggle("useEstimate")}
                  >
                    <span />
                  </button>
                </div>
                {form.useEstimate && (
                  <input
                    value={form.estimatedTime}
                    onChange={handleChange("estimatedTime")}
                    placeholder="e.g. 2-3 hours"
                  />
                )}
              </div>

              <div className="form-group full">
                <div className="toggle-row">
                  <label>Tags</label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.useTags}
                    aria-label="Tags"
                    className={`switch ${form.useTags ? "on" : ""}`}
                    onClick={toggle("useTags")}
                  >
                    <span />
                  </button>
                </div>
                {form.useTags && (
                  <>
                    <input
                      value={form.tags}
                      onChange={handleChange("tags")}
                      placeholder="report, monthly, management"
                    />
                    <span className="form-help">
                      Separate tags with commas.
                    </span>
                  </>
                )}
              </div>

              <div className="form-group full">
                <label>Attachments</label>
                <FilePicker form={form} setForm={setForm} />
              </div>

            </div>

          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="cancel-btn"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary-btn"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : editing
                ? "Save Changes"
                : "Create Item"}
            </button>
          </div>

        </form>

      </div>
    </div>,
    document.body
  );
};

/* =========================================================
   ASSIGN MODAL — creates a real task for the selected user
   ========================================================= */

const AssignModal = ({
  mode = "assign",
  item,
  form,
  setForm,
  users,
  departments,
  loading,
  saving,
  error,
  onClose,
  onSubmit,
}) => {
  const handleChange = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // Department restriction: only people in the chosen department (backend checks too)
  const departmentOptions = [...new Set([item.department, ...departments].filter(Boolean))];
  const isReassign = mode === "reassign";
  const currentName = item.lastAssignedTo || "";
  const eligibleUsers = users.filter(
    (u) =>
      (!form.department ||
        !u.department ||
        u.department.toLowerCase() === form.department.toLowerCase()) &&
      // reassign → someone other than the current assignee
      !(isReassign && u.name === currentName)
  );

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <div className="modal-header-left">
            <div className="modal-header-icon">
              <Send size={17} />
            </div>
            <div>
              <h3 className="modal-title">{isReassign ? "Reassign" : "Assign"} “{item.title}”</h3>
              <p className="modal-subtitle">
                {isReassign
                  ? <>Currently assigned to <strong>{currentName}</strong>. The task moves to the person you pick — both of you get an email.</>
                  : "Creates a task in the selected user’s task list. The template stays in the bank."}
              </p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} disabled={saving}>
            <X size={15} />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="modal-body">
            <div className="form-grid">

              <div className="form-group">
                <label>Department</label>
                <select
                  value={form.department}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, department: e.target.value, userId: "" }))
                  }
                >
                  <option value="">Any department</option>
                  {departmentOptions.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>{isReassign ? "Reassign to *" : "Assign to *"}</label>
                <select value={form.userId} onChange={handleChange("userId")} disabled={loading}>
                  <option value="">
                    {loading
                      ? "Loading users..."
                      : eligibleUsers.length
                      ? "Select a user"
                      : "No users in this department"}
                  </option>
                  {eligibleUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}{u.department ? ` — ${u.department}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {!isReassign && (<>
              <div className="form-group">
                <label>Due date</label>
                <input type="date" value={form.dueDate} onChange={handleChange("dueDate")} />
              </div>

              <div className="form-group">
                <label>Priority</label>
                <select value={form.priority} onChange={handleChange("priority")}>
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </div>
              </>)}

            </div>

            {error && (
              <p className="form-help" style={{ color: "#b34444", marginTop: 10 }}>
                {error}
              </p>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="cancel-btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="primary-btn" disabled={saving || loading}>
              {saving ? (isReassign ? "Reassigning..." : "Assigning...") : isReassign ? "Reassign Task" : "Assign Task"}
            </button>
          </div>
        </form>

      </div>
    </div>,
    document.body
  );
};

export default TaskBank;
