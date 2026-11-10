import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { appLinks, canOpen, linkProps, pageParams, APP_LINK_CSS } from "../../utils/appLinks";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Clock3,
  CheckCircle2,
  Circle,
  X,
  Trash2,
  Edit3,
  UserRound,
  Building2,
  List,
  LayoutGrid,
  Calendar,
  ArrowRight,
  Upload,
  FileSpreadsheet,
  RefreshCw,
} from "lucide-react";
import { API_URL as ENV_API_URL } from "../../config/env";

// ============================================================
// BACKEND CONFIG
// ============================================================

const API_BASE = ENV_API_URL;

// Calendar shows the organization's REAL tasks (same records as the Tasks page)
const API_URL = `${API_BASE}/tasks`;

// Users this account may assign to (org-scoped by the backend)
const USERS_API_URLS = [`${API_BASE}/users/assignable`];
const DEPARTMENTS_API_URL = `${API_BASE}/departments`;

// Calendar status ⇄ task status
const TO_TASK_STATUS = { Pending: "To Do", "In Progress": "In Progress", Completed: "Completed" };

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

// Read { message } from a failed fetch response
const readError = async (response, fallback) => {
  try {
    const body = await response.json();
    return body?.message || fallback;
  } catch {
    return fallback;
  }
};

// ============================================================
// AUTH — reads the JWT saved by Login.jsx
// ============================================================

const getAuthToken = () => {
  const directKeys = ["token", "authToken", "accessToken", "jwt", "auth_token"];
  for (const key of directKeys) {
    const value = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (value) {
      return value.replace(/^"|"$/g, "");
    }
  }

  const objectKeys = ["user", "auth", "currentUser", "userData", "profile"];
  for (const key of objectKeys) {
    try {
      const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
      const obj = JSON.parse(raw || "null");
      if (obj?.token) return obj.token;
      if (obj?.accessToken) return obj.accessToken;
      if (obj?.authToken) return obj.authToken;
    } catch {
      /* not JSON, skip */
    }
  }

  console.warn(
    "[TaskCalendar] No auth token found in storage. If requests return 401, " +
      "check the key Login.jsx uses and add it to getAuthToken()."
  );
  return "";
};

const buildAuthHeaders = (extra = {}) => {
  const token = getAuthToken();
  return {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
};

// ------------------------------------------------------------
// BACKEND FIELD MAPPING
// ------------------------------------------------------------

const pickField = (obj, keys, fallback = "") => {
  if (!obj || typeof obj !== "object") return fallback;

  const normalized = Object.keys(obj).map((key) => [
    key,
    key.toLowerCase().replace(/[^a-z0-9]/g, ""),
  ]);

  for (const target of keys) {
    const match = normalized.find(([, keyNorm]) => keyNorm === target);
    if (match) {
      const value = obj[match[0]];
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        return value;
      }
    }
  }
  return fallback;
};

// "2025-06-12T10:00:00.000Z" -> "2025-06-12"
const toISODate = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(parsed.getDate()).padStart(2, "0")}`;
};

const toTime = (timeValue, dateValue) => {
  if (timeValue) {
    const m = String(timeValue).match(/(\d{1,2}):(\d{2})/);
    if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  }
  const m = String(dateValue || "").match(/[T ](\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  return "09:00";
};

const normalizeStatus = (value) => {
  const v = String(value || "").toLowerCase();
  if (v.includes("progress") || v === "active" || v === "ongoing")
    return "In Progress";
  if (v.includes("complet") || v === "done" || v === "closed" || v === "finished")
    return "Completed";
  return "Pending";
};

const normalizePriority = (value) => {
  const v = String(value || "").toLowerCase();
  if (v.includes("high") || v === "urgent" || v === "critical") return "High";
  if (v.includes("low") || v === "minor") return "Low";
  return "Medium";
};

// ------------------------------------------------------------
// NEW: normalize a user record -> { id, name }
// ------------------------------------------------------------

const normalizeUser = (raw) => {
  const id = String(pickField(raw, ["id", "_id", "userid", "user_id"], ""));

  let name = String(
    pickField(
      raw,
      [
        "name",
        "fullname",
        "full_name",
        "username",
        "displayname",
        "display_name",
        "employeename",
      ],
      ""
    )
  );

  if (!name) {
    const first = String(
      pickField(raw, ["firstname", "first_name", "fname"], "")
    );
    const last = String(
      pickField(raw, ["lastname", "last_name", "lname"], "")
    );
    name = `${first} ${last}`.trim();
  }

  if (!name) {
    name = String(pickField(raw, ["email"], "")) || id;
  }

  return { id, name, department: String(raw?.department || "") };
};

// ------------------------------------------------------------
// Map one backend record -> calendar task model
// NEW: assignee kept as raw ID + optional embedded name,
// resolved to a display name later via the users list
// ------------------------------------------------------------

const normalizeTask = (raw) => {
  const assigneeField = pickField(
    raw,
    ["assignedto", "assignee", "assigneduser", "user", "employee", "owner"],
    ""
  );

  let assigneeId = "";
  let assigneeName = "";

  if (assigneeField && typeof assigneeField === "object") {
    // Populated user object: { _id: "...", name: "Priya" }
    assigneeId = String(
      pickField(assigneeField, ["id", "_id", "userid", "user_id"], "")
    );
    assigneeName = String(
      pickField(
        assigneeField,
        ["name", "fullname", "full_name", "username", "displayname"],
        ""
      )
    );
  } else if (assigneeField) {
    // Plain value: usually a user ID string like "6ac5e722..."
    assigneeId = String(assigneeField);
  }

  if (!assigneeName && typeof raw?.assignedUser === "string") {
    assigneeName = raw.assignedUser;
  }

  return {
    rawPriority: raw?.priority || "",
    rawStatus: raw?.status || "",
    assignedBy: raw?.assignedBy?._id || raw?.assignedBy || "",
    id: pickField(
      raw,
      ["id", "taskid", "_id", "task_id"],
      `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    ),
    title: String(
      pickField(
        raw,
        ["title", "tasktitle", "taskname", "task", "name", "subject"],
        "Untitled Task"
      )
    ),
    date: toISODate(
      pickField(raw, ["duedate", "date", "taskdate", "deadline", "enddate"])
    ),
    time: toTime(
      pickField(raw, ["time", "duetime", "tasktime"]),
      pickField(raw, ["duedate", "date", "taskdate"])
    ),
    department: String(
      pickField(raw, ["department", "dept", "departmentname"], "")
    ),
    assigneeId,
    assigneeName,
    assignee: assigneeName, // resolved to a real name later via usersMap
    status: normalizeStatus(pickField(raw, ["status", "taskstatus"], "Pending")),
    priority: normalizePriority(pickField(raw, ["priority"], "Medium")),
    description: String(
      pickField(raw, ["description", "details", "taskdescription", "notes"], "")
    ),
  };
};

// Accepts [ ... ], { tasks: [...] }, { data: [...] }, { results: [...] }
const extractTaskList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.tasks)) return data.tasks;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.users)) return data.users;
  return [];
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const TaskCalendar = () => {
  // ------------------------------------------------------------
  // DATE
  // ------------------------------------------------------------

  const today = new Date();

  const [currentDate, setCurrentDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const [selectedDate, setSelectedDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), today.getDate())
  );

  // ------------------------------------------------------------
  // TASK + USER DATA (from backend)
  // ------------------------------------------------------------

  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]); // NEW
  const [orgDepartments, setOrgDepartments] = useState([]);
  const [sessionUser] = useState(getSessionUser);
  const canCreate = canDo(sessionUser, "tasks", "create") && canDo(sessionUser, "calendar", "create");
  const canEdit = canDo(sessionUser, "tasks", "edit") && canDo(sessionUser, "calendar", "edit");
  const canDelete = canDo(sessionUser, "tasks", "delete") && canDo(sessionUser, "calendar", "delete");
  const canImport = canDo(sessionUser, "calendar", "import");

  // Creator, Manager or Admin may edit/delete a task (backend enforces the same)
  const canModify = (task) =>
    ["SuperAdmin", "Admin", "Manager"].includes(sessionUser?.role) ||
    (task?.assignedBy && String(task.assignedBy) === String(sessionUser?._id));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // ------------------------------------------------------------
  // FETCH TASKS (with auth token)
  // ------------------------------------------------------------

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(API_URL, {
        headers: buildAuthHeaders(),
      });

      if (response.status === 401) {
        setError("Session expired or unauthorized (401) — please log in again.");
        setTasks([]);
        return;
      }

      if (!response.ok) {
        throw new Error(`Server error ${response.status} while loading tasks.`);
      }

      const data = await response.json();
      setTasks(extractTaskList(data).map(normalizeTask));
    } catch (err) {
      setError(err.message || "Unable to connect to the task server.");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ------------------------------------------------------------
  // NEW: FETCH USERS (to translate assigned_to IDs -> names)
  // ------------------------------------------------------------

  const fetchUsers = useCallback(async () => {
    for (const url of USERS_API_URLS) {
      try {
        const response = await fetch(url, {
          headers: buildAuthHeaders(),
        });

        if (!response.ok) continue;

        const data = await response.json();
        const list = extractTaskList(data)
          .map(normalizeUser)
          .filter((u) => u.id);

        if (list.length) {
          setUsers(list);
          return;
        }
      } catch {
        /* try next candidate endpoint */
      }
    }
    console.warn("[TaskCalendar] Could not load the assignable users list.");
  }, []);

  const fetchDepartments = useCallback(async () => {
    try {
      const response = await fetch(DEPARTMENTS_API_URL, { headers: buildAuthHeaders() });
      if (!response.ok) return;
      const data = await response.json();
      setOrgDepartments(
        extractTaskList(data)
          .map((d) => d?.name)
          .filter(Boolean)
      );
    } catch {
      /* department list is optional */
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchUsers();
    fetchDepartments();
  }, [fetchTasks, fetchUsers, fetchDepartments]);

  // ------------------------------------------------------------
  // UI STATES
  // ------------------------------------------------------------

  const [viewMode, setViewMode] = useState("calendar");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All Departments");
  const [status, setStatus] = useState("All Status");
  const navigate = useNavigate();

  // Opened from Tasks / Users / MoM: ?date=2026-11-15 jumps to that day, ?department= filters
  useEffect(() => {
    const params = pageParams();
    const date = params.get("date");
    if (/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
      const [y, m, d] = date.split("-").map(Number);
      setCurrentDate(new Date(y, m - 1, 1));
      setSelectedDate(new Date(y, m - 1, d));
    }
    if (params.get("department")) setDepartment(params.get("department"));
  }, []);

  // A task (or a group of tasks) on the Tasks page
  const openInTasks = (params) => navigate(appLinks.tasks(params));
  const taskLink = (task) =>
    canOpen.tasks() ? linkProps(() => openInTasks({ task: task.id }), `Open "${task.title}" in Tasks`) : {};
  const userLink = (name) =>
    name && canOpen.users() ? linkProps(() => navigate(appLinks.users({ search: name })), `Open ${name} in Users`) : {};
  const deptLink = (name) =>
    name && canOpen.tasks() ? linkProps(() => openInTasks({ department: name }), `Open ${name} tasks`) : {};
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const importInputRef = useRef(null);
  const [importMessage, setImportMessage] = useState("");
  const [importMessageType, setImportMessageType] = useState("success");

  const [form, setForm] = useState({
    title: "",
    date: "",
    time: "",
    department: "Management",
    assignee: "", // holds the USER ID (from the dropdown)
    priority: "Medium",
    status: "Pending",
    description: "",
  });

  // ------------------------------------------------------------
  // LOCK PAGE SCROLL WHEN MODAL OPEN
  // ------------------------------------------------------------

  useEffect(() => {
    document.body.style.overflow = showModal ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [showModal]);

  // ------------------------------------------------------------
  // MONTH DATA
  // ------------------------------------------------------------

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthName = MONTHS[month];

  const yearsList = [];
  for (let y = today.getFullYear() - 5; y <= today.getFullYear() + 5; y++) {
    yearsList.push(y);
  }

  const calendarDays = [];

  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  // ------------------------------------------------------------
  // MONTH / YEAR PICKER HANDLERS
  // ------------------------------------------------------------

  const handleMonthSelect = (e) => {
    setCurrentDate(new Date(year, parseInt(e.target.value, 10), 1));
  };

  const handleYearSelect = (e) => {
    setCurrentDate(new Date(parseInt(e.target.value, 10), month, 1));
  };

  // ------------------------------------------------------------
  // HELPERS
  // ------------------------------------------------------------

  const makeDateKey = (day) => {
    if (!day) return "";
    const m = String(month + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${year}-${m}-${d}`;
  };

  const formatSelectedDate = (date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const statusClass = (value) => {
    if (value === "Completed") return "status-completed";
    if (value === "In Progress") return "status-progress";
    return "status-pending";
  };

  // ------------------------------------------------------------
  // NEW: usersMap  { "6ac5e722...": "Priya" }
  // ------------------------------------------------------------

  const usersMap = useMemo(() => {
    const map = {};
    users.forEach((u) => {
      map[u.id] = u.name;
    });
    return map;
  }, [users]);

  // ------------------------------------------------------------
  // NEW: resolve assignee IDs to display names
  // ------------------------------------------------------------

  const tasksWithNames = useMemo(() => {
    return tasks.map((task) => {
      let assignee = task.assignee; // embedded name from backend, if any

      if (!assignee && task.assigneeId) {
        assignee = usersMap[task.assigneeId] || task.assigneeId;
      }

      return {
        ...task,
        assignee: assignee || "Unassigned",
      };
    });
  }, [tasks, usersMap]);

  // ------------------------------------------------------------
  // DEPARTMENT OPTIONS (defaults + any department from backend)
  // ------------------------------------------------------------

  const departmentOptions = useMemo(() => {
    const fromTasks = tasksWithNames
      .map((task) => task.department)
      .filter((dept) => dept && dept !== "Unassigned");

    return Array.from(new Set([...orgDepartments, ...fromTasks])).filter(Boolean);
  }, [tasksWithNames, orgDepartments]);

  // ------------------------------------------------------------
  // FILTER TASKS
  // ------------------------------------------------------------

  const filteredTasks = useMemo(() => {
    return tasksWithNames.filter((task) => {
      const searchMatch =
        task.title.toLowerCase().includes(search.toLowerCase()) ||
        task.assignee.toLowerCase().includes(search.toLowerCase()) ||
        task.department.toLowerCase().includes(search.toLowerCase());

      const departmentMatch =
        department === "All Departments" || task.department === department;

      const statusMatch = status === "All Status" || task.status === status;

      return searchMatch && departmentMatch && statusMatch;
    });
  }, [tasksWithNames, search, department, status]);

  // ------------------------------------------------------------
  // GET TASKS FOR DATE
  // ------------------------------------------------------------

  const getTasksForDate = (day) => {
    if (!day) return [];
    const dateKey = makeDateKey(day);
    return filteredTasks.filter((task) => task.date === dateKey);
  };

  // ------------------------------------------------------------
  // TODAY CHECK
  // ------------------------------------------------------------

  const isToday = (day) => {
    if (!day) return false;
    return (
      today.getFullYear() === year &&
      today.getMonth() === month &&
      today.getDate() === day
    );
  };

  // ------------------------------------------------------------
  // SELECT DATE
  // ------------------------------------------------------------

  const handleDateClick = (day) => {
    if (!day) return;
    setSelectedDate(new Date(year, month, day));
  };

  // ------------------------------------------------------------
  // MONTH NAVIGATION
  // ------------------------------------------------------------

  const previousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now);
  };

  // ------------------------------------------------------------
  // MODAL OPEN / CLOSE
  // ------------------------------------------------------------

  const openCreateModal = (date = null) => {
    if (!canCreate) {
      setImportMessage("You do not have permission to create tasks.");
      setImportMessageType("error");
      return;
    }

    const targetDate =
      date || selectedDate || new Date(year, month, today.getDate());

    const formattedDate = `${targetDate.getFullYear()}-${String(
      targetDate.getMonth() + 1
    ).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;

    setEditingTask(null);

    setForm({
      title: "",
      date: formattedDate,
      time: "09:00",
      department: "",
      assignee: "",
      priority: "Medium",
      status: "Pending",
      description: "",
    });

    setShowModal(true);
  };

  const openEditModal = (task) => {
    setAssigneeNote("");
    setEditingTask(task);

    setForm({
      title: task.title,
      date: task.date,
      time: task.time,
      department: task.department,
      // user ID only — task.assignee is a display name ("Unassigned" for imported tasks)
      assignee: task.assigneeId || "",
      priority: task.priority,
      status: task.status,
      description: task.description,
    });

    setShowModal(true);
  };

  const closeModal = () => {
    setAssigneeNote("");
    setShowModal(false);
    setEditingTask(null);
  };

  // ------------------------------------------------------------
  // FORM CHANGE
  // ------------------------------------------------------------

  // Assignee list: the task's department first, then everyone else
  const [assigneeNote, setAssigneeNote] = useState("");
  const sameDept = (u) =>
    !form.department || !u.department || u.department.toLowerCase() === form.department.toLowerCase();
  const assigneeGroups = {
    inDept: users.filter(sameDept),
    other: users.filter((u) => !sameDept(u)),
  };

  // Picking someone from another department moves the task to their department
  // (the server only assigns people inside the task's department)
  const handleAssigneeChange = (e) => {
    const id = e.target.value;
    const user = users.find((u) => u.id === id);
    if (user && !sameDept(user)) {
      setForm((prev) => ({ ...prev, assignee: id, department: user.department }));
      setAssigneeNote(`Department changed to “${user.department}” to match ${user.name}.`);
    } else {
      setForm((prev) => ({ ...prev, assignee: id }));
      setAssigneeNote("");
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // ------------------------------------------------------------
  // IMPORT TASKS FROM CSV → backend (POST /api/tasks/import)
  // 1. ?preview=true validates every row (nothing saved)
  // 2. user confirms → rows are saved as real tasks
  // ------------------------------------------------------------

  const [importPreview, setImportPreview] = useState(null); // { file, summary, rows }
  const [importing, setImporting] = useState(false);

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const sendImport = async (file, preview) => {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(
      `${API_URL}/import${preview ? "?preview=true" : ""}`,
      { method: "POST", headers: buildAuthHeaders(), body }
    );
    let data = {};
    try {
      data = await response.json();
    } catch {
      /* non-JSON error */
    }
    if (response.status === 401) {
      throw new Error("Session expired — please log in again.");
    }
    return { ok: response.ok, data };
  };

  const handleImportTasks = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const isCSV =
      file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv");

    if (!isCSV) {
      setImportMessage("Please select a CSV file.");
      setImportMessageType("error");
      return;
    }

    if (file.size === 0) {
      setImportMessage("The selected CSV file is empty.");
      setImportMessageType("error");
      return;
    }

    setImporting(true);
    try {
      const { ok, data } = await sendImport(file, true);
      if (!ok) {
        throw new Error(data.message || "The CSV file could not be validated.");
      }
      setImportPreview({ file, summary: data.summary, rows: data.rows || [] });
    } catch (error) {
      setImportMessage(error.message || "Unable to import the CSV file.");
      setImportMessageType("error");
    } finally {
      setImporting(false);
    }
  };

  const confirmImport = async () => {
    if (!importPreview || importing) return;
    setImporting(true);
    try {
      const { ok, data } = await sendImport(importPreview.file, false);
      if (!ok) {
        throw new Error(data.message || "Import failed.");
      }

      setImportPreview(null);
      // Calendar always shows what is actually stored
      await fetchTasks();

      if (data.first_date) {
        const first = new Date(`${data.first_date}T00:00:00`);
        setCurrentDate(new Date(first.getFullYear(), first.getMonth(), 1));
        setSelectedDate(first);
      }

      setImportMessage(data.message || `${data.imported} task(s) imported.`);
      setImportMessageType(data.skipped ? "warning" : "success");
    } catch (error) {
      setImportMessage(error.message || "Import failed.");
      setImportMessageType("error");
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    if (!importMessage) return undefined;

    const timer = setTimeout(() => {
      setImportMessage("");
    }, 5000);

    return () => clearTimeout(timer);
  }, [importMessage]);

  // ------------------------------------------------------------
  // SAVE TASK (POST / PUT — sends the user ID for assigned_to)
  // ------------------------------------------------------------

  const saveTask = async (e) => {
    e.preventDefault();

    if (!form.title.trim() || !form.date) {
      return;
    }

    // Calendar form → Task API fields
    const payload = {
      name: form.title.trim(),
      dueDate: form.date,
      dueTime: form.time,
      department: form.department,
      assignedUser: form.assignee, // user ID ("" = unassigned)
      description: form.description,
    };

    // The calendar only knows High/Medium/Low — don't overwrite e.g. "Critical"
    if (!editingTask || form.priority !== editingTask.priority) {
      payload.priority = form.priority;
    }

    const statusChanged = editingTask && form.status !== editingTask.status;
    if (!editingTask) payload.status = TO_TASK_STATUS[form.status] || "To Do";

    setSaving(true);

    try {
      const response = await fetch(
        editingTask ? `${API_URL}/${editingTask.id}` : API_URL,
        {
          method: editingTask ? "PATCH" : "POST",
          headers: buildAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        }
      );

      if (response.status === 401) {
        throw new Error("Not authorized — please log in again.");
      }

      if (!response.ok) {
        throw new Error(
          await readError(response, `Server error ${response.status} while saving the task.`)
        );
      }

      // Status has its own endpoint (keeps history + completion points)
      if (statusChanged) {
        const statusResponse = await fetch(`${API_URL}/${editingTask.id}/status`, {
          method: "PATCH",
          headers: buildAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ status: TO_TASK_STATUS[form.status] || "To Do" }),
        });
        if (!statusResponse.ok) {
          throw new Error(
            await readError(statusResponse, "Task saved, but the status could not be updated.")
          );
        }
      }

      closeModal();
      await fetchTasks();

      const saved = new Date(`${form.date}T00:00:00`);
      setCurrentDate(new Date(saved.getFullYear(), saved.getMonth(), 1));
      setSelectedDate(saved);

      setImportMessage(
        editingTask
          ? "Task updated successfully."
          : "Task created successfully."
      );
      setImportMessageType("success");
    } catch (err) {
      setImportMessage(err.message || "Unable to save the task.");
      setImportMessageType("error");
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------
  // DELETE TASK (DELETE — with auth token)
  // ------------------------------------------------------------

  const deleteTask = async (task) => {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;

    try {
      const response = await fetch(`${API_URL}/${task.id}`, {
        method: "DELETE",
        headers: buildAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Failed to delete the task."));
      }
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      setImportMessage("Task deleted.");
      setImportMessageType("success");
    } catch (err) {
      // Keep the task visible — it still exists on the server
      setImportMessage(err.message || "Failed to delete the task.");
      setImportMessageType("error");
    }
  };

  // ------------------------------------------------------------
  // STATUS ICON
  // ------------------------------------------------------------

  const StatusIcon = ({ value }) => {
    if (value === "Completed") {
      return <CheckCircle2 size={13} />;
    }

    if (value === "In Progress") {
      return <Clock3 size={13} />;
    }

    return <Circle size={13} />;
  };

  // ------------------------------------------------------------
  // STATS
  // ------------------------------------------------------------

  const totalTasks = tasksWithNames.length;

  const completedTasks = tasksWithNames.filter(
    (task) => task.status === "Completed"
  ).length;

  const pendingTasks = tasksWithNames.filter(
    (task) => task.status === "Pending"
  ).length;

  const inProgressTasks = tasksWithNames.filter(
    (task) => task.status === "In Progress"
  ).length;

  // ------------------------------------------------------------
  // SELECTED DAY TASKS
  // ------------------------------------------------------------

  const selectedDateKey = `${selectedDate.getFullYear()}-${String(
    selectedDate.getMonth() + 1
  ).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;

  const selectedDayTasks = filteredTasks.filter(
    (task) => task.date === selectedDateKey
  );

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <>
      {importMessage && (
        <div className={`import-toast ${importMessageType}`} role="status">
          {importMessage}
        </div>
      )}

      <style>{APP_LINK_CSS + `
        * { box-sizing: border-box; }

        html, body {
          max-width: 100%;
          overflow-x: hidden;
        }

        .task-calendar-page {
          width: 100%;
          max-width: 100%;
          overflow-x: hidden;
          min-height: 100vh;
          padding: 24px;
          background:
            radial-gradient(circle at 0% 0%, rgba(62,197,219,.18), transparent 30%),
            radial-gradient(circle at 100% 10%, rgba(91,140,255,.13), transparent 28%),
            linear-gradient(135deg, #edfafd 0%, #f5faff 48%, #f5f7ff 100%);
          color: #17324d;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .calendar-shell {
          width: 100%;
          max-width: 1500px;
          margin: 0 auto;
        }

        .page-header {
          background: rgba(255,255,255,.82);
          border: 1px solid rgba(129,180,206,.3);
          border-radius: 24px;
          padding: 24px 28px;
          box-shadow: 0 15px 45px rgba(35,92,125,.08);
          backdrop-filter: blur(14px);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 18px;
        }

        .title-area {
          display: flex;
          align-items: center;
          gap: 15px;
          min-width: 0;
          flex-wrap: wrap;
        }

        .title-icon {
          flex-shrink: 0;
          width: 54px; height: 54px; border-radius: 17px;
          display: flex; align-items: center; justify-content: center;
          color: white;
          background: linear-gradient(135deg, #0d75b8, #16a8a1);
          box-shadow: 0 10px 25px rgba(13,117,184,.25);
        }

        .title-area h1 {
          margin: 0;
          font-size: 26px;
          color: #17324d;
          letter-spacing: -.5px;
          word-break: break-word;
        }

        .title-area p { margin: 5px 0 0; color: #6c879f; font-size: 13px; }

        .header-actions {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        button { font-family: inherit; }

        .primary-btn {
          border: none;
          background: linear-gradient(135deg, #155b92, #087f91);
          color: white;
          height: 42px;
          padding: 0 18px;
          border-radius: 12px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          box-shadow: 0 8px 20px rgba(14,91,132,.2);
          white-space: nowrap;
        }

        .primary-btn:disabled { opacity: .7; cursor: not-allowed; }

        .secondary-btn {
          height: 42px;
          padding: 0 16px;
          border-radius: 12px;
          border: 1px solid #cfe0ea;
          background: white;
          color: #315c78;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          white-space: nowrap;
        }

        .secondary-btn:disabled { opacity: .6; cursor: not-allowed; }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin-bottom: 18px;
        }

        .stat-card {
          position: relative;
          overflow: hidden;
          min-height: 115px;
          min-width: 0;
          padding: 19px;
          border-radius: 18px;
          background: rgba(255,255,255,.9);
          border: 1px solid #d4e3ec;
          box-shadow: 0 10px 30px rgba(37,87,115,.06);
        }

        .stat-card::after {
          content: "";
          position: absolute;
          width: 90px; height: 90px;
          right: -28px; bottom: -40px;
          border-radius: 50%;
          border: 1px solid rgba(25,131,170,.1);
        }

        .stat-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          font-weight: 800;
          color: #7791a6;
        }

        .stat-value { font-size: 28px; font-weight: 800; margin-top: 8px; color: #183b58; }
        .stat-description { margin-top: 3px; font-size: 11px; color: #8ba0b1; }

        .stat-icon {
          position: absolute;
          top: 17px; right: 17px;
          width: 34px; height: 34px;
          border-radius: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .stat-blue .stat-icon { background: #e8f5ff; color: #1482bf; }
        .stat-green .stat-icon { background: #e8faf5; color: #0b9c78; }
        .stat-orange .stat-icon { background: #fff5e6; color: #d78a15; }

        .toolbar {
          background: rgba(255,255,255,.92);
          border: 1px solid #d3e2ec;
          border-radius: 18px;
          padding: 15px;
          margin-bottom: 18px;
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          box-shadow: 0 8px 25px rgba(38,90,119,.05);
        }

        .search-box { flex: 1; position: relative; min-width: 220px; }

        .search-box svg {
          position: absolute;
          left: 13px; top: 50%;
          transform: translateY(-50%);
          color: #7f9aae;
          pointer-events: none;
        }

        .search-box input,
        .filter-select {
          width: 100%;
          max-width: 100%;
          height: 42px;
          border: 1px solid #d6e4ec;
          border-radius: 11px;
          background: #f8fbfd;
          color: #294c67;
          outline: none;
          padding: 0 13px;
          font-size: 13px;
        }

        .search-box input { padding-left: 39px; }

        .search-box input:focus,
        .filter-select:focus {
          border-color: #48a9c5;
          box-shadow: 0 0 0 3px rgba(72,169,197,.1);
        }

        .filter-select { width: 180px; }

        .view-toggle {
          display: flex;
          border: 1px solid #d5e3eb;
          background: #f5f9fb;
          padding: 3px;
          border-radius: 11px;
        }

        .view-toggle button {
          border: none;
          background: transparent;
          color: #718da1;
          width: 38px; height: 34px;
          border-radius: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .view-toggle button.active {
          background: white;
          color: #126b9b;
          box-shadow: 0 2px 8px rgba(27,82,109,.1);
        }

        .calendar-card {
          background: rgba(255,255,255,.94);
          border: 1px solid #d1e1ea;
          border-radius: 22px;
          overflow: hidden;
          max-width: 100%;
          box-shadow: 0 12px 35px rgba(38,86,112,.07);
        }

        .calendar-top {
          padding: 17px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          border-bottom: 1px solid #d8e5ec;
          background: linear-gradient(90deg, rgba(228,249,250,.9), rgba(239,247,255,.95));
        }

        .month-title {
          display: flex;
          align-items: center;
          gap: 13px;
          min-width: 0;
        }

        .month-icon {
          flex-shrink: 0;
          width: 40px; height: 40px;
          border-radius: 12px;
          background: #dff7f4;
          color: #079681;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .month-title h2 { margin: 0; font-size: 19px; color: #173b58; word-break: break-word; }
        .month-title span { display: block; font-size: 11px; margin-top: 3px; color: #7b94a6; }

        .calendar-navigation {
          display: flex;
          gap: 7px;
          align-items: center;
          flex-wrap: wrap;
        }

        .calendar-navigation button {
          border: 1px solid #d4e2e9;
          background: white;
          color: #315d77;
          height: 37px;
          min-width: 38px;
          padding: 0 12px;
          border-radius: 10px;
          cursor: pointer;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .calendar-navigation button:hover {
          border-color: #70b7c8;
          color: #087d91;
        }

        .month-select {
          height: 37px;
          border: 1px solid #d4e2e9;
          border-radius: 10px;
          background: white;
          color: #173b58;
          font-weight: 700;
          font-size: 13px;
          padding: 0 10px;
          outline: none;
          cursor: pointer;
          font-family: inherit;
          max-width: 100%;
        }

        .month-select:focus {
          border-color: #48a9c5;
          box-shadow: 0 0 0 3px rgba(72,169,197,.12);
        }

        .month-select.year-select { width: 92px; }

        .weekday-row {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          border-bottom: 1px solid #dce7ed;
          background: #f7fbfd;
        }

        .weekday {
          padding: 12px 4px;
          text-align: center;
          color: #668399;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .5px;
          overflow: hidden;
        }

        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 1px;
          background: #dbe7ed;
        }

        .calendar-cell {
          min-height: 145px;
          min-width: 0;
          background: white;
          padding: 9px;
          position: relative;
          cursor: pointer;
          transition: background .15s ease;
          overflow: hidden;
        }

        .calendar-cell:hover { background: #f5fbfd; }

        .calendar-cell.today {
          background: linear-gradient(145deg, #ecfbfa, #f5fbff);
          box-shadow: inset 0 0 0 2px #18a898;
        }

        .calendar-cell.selected {
          box-shadow: inset 0 0 0 2px #277eaf;
        }

        .day-number-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 7px;
          gap: 4px;
        }

        .day-number { font-size: 13px; font-weight: 800; color: #42637b; }
        .today .day-number { color: #087d79; }

        .add-day {
          flex-shrink: 0;
          width: 24px; height: 24px;
          border: 1px solid #bce7df;
          background: #ecfaf7;
          color: #079b89;
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .task-mini {
          padding: 7px 8px;
          border-radius: 8px;
          margin-bottom: 5px;
          background: #f1f8fc;
          border-left: 3px solid #2989b7;
          cursor: pointer;
          overflow: hidden;
          min-width: 0;
        }

        .task-mini:hover { background: #e8f4fa; }

        .task-mini-title {
          font-size: 11px;
          font-weight: 700;
          color: #244b66;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .task-mini-meta {
          display: flex;
          gap: 5px;
          align-items: center;
          color: #7d97a8;
          font-size: 9px;
          margin-top: 4px;
          white-space: nowrap;
          overflow: hidden;
        }

        .priority-high { border-left-color: #ed6b67; }
        .priority-medium { border-left-color: #e7a634; }
        .priority-low { border-left-color: #21a981; }

        .more-tasks {
          font-size: 10px;
          color: #17789b;
          font-weight: 700;
          padding: 3px 5px;
        }

        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding: 70px 20px;
          color: #5d7f96;
          font-size: 13px;
          font-weight: 700;
        }

        .spinner {
          width: 34px; height: 34px;
          border-radius: 50%;
          border: 3px solid #d7e9f1;
          border-top-color: #0d84a8;
          animation: spin .8s linear infinite;
        }

        .spin-icon { animation: spin 1s linear infinite; }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .error-banner {
          margin: 20px;
          padding: 16px 18px;
          border: 1px solid #efc5c5;
          background: #fdf3f3;
          color: #a94444;
          border-radius: 14px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          font-size: 13px;
          font-weight: 700;
        }

        .error-banner button {
          border: 1px solid #e3b8b8;
          background: white;
          color: #a94444;
          padding: 9px 14px;
          border-radius: 10px;
          font-weight: 800;
          cursor: pointer;
        }

        .below-section {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(0, .65fr);
          gap: 18px;
          margin-top: 18px;
        }

        .panel {
          background: rgba(255,255,255,.94);
          border: 1px solid #d2e2ea;
          border-radius: 20px;
          box-shadow: 0 10px 30px rgba(39,87,114,.06);
          overflow: hidden;
          min-width: 0;
        }

        .panel-header {
          padding: 17px 20px;
          border-bottom: 1px solid #dbe7ed;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
        }

        .panel-header h3 { margin: 0; color: #183b58; font-size: 17px; }
        .panel-header span { color: #7891a3; font-size: 11px; }

        .task-list { padding: 8px 14px 14px; }

        .task-row {
          padding: 13px 8px;
          display: flex;
          justify-content: space-between;
          gap: 15px;
          align-items: center;
          flex-wrap: wrap;
          border-bottom: 1px solid #edf2f5;
        }

        .task-row:last-child { border-bottom: none; }

        .task-main { min-width: 0; flex: 1; }
        .task-row-title { font-size: 13px; font-weight: 750; color: #24465e; word-break: break-word; }

        .task-row-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 5px;
          color: #8298a7;
          font-size: 10px;
        }

        .task-row-meta > span {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .task-row-actions { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }

        .icon-button {
          flex-shrink: 0;
          width: 34px; height: 34px;
          border: 1px solid #d8e5eb;
          background: white;
          color: #648198;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .icon-button:hover { color: #147ba0; border-color: #8bc8d6; }
        .icon-button.danger:hover { color: #c24141; border-color: #e0a2a2; }

        .empty-state {
          min-height: 150px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          color: #8297a8;
          text-align: center;
          padding: 20px;
        }

        .empty-icon {
          width: 48px; height: 48px;
          border-radius: 14px;
          background: #edf7fb;
          color: #4c94b1;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 10px;
        }

        .empty-state strong { color: #45657c; font-size: 14px; }
        .empty-state span { margin-top: 4px; font-size: 11px; }

        .selected-date-box { padding: 20px; }

        .selected-date {
          display: flex;
          align-items: center;
          gap: 11px;
          margin-bottom: 17px;
          flex-wrap: wrap;
        }

        .selected-date-icon {
          flex-shrink: 0;
          width: 40px; height: 40px;
          border-radius: 12px;
          background: #e8f8f7;
          color: #079b89;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .selected-date strong { display: block; color: #234a63; font-size: 14px; word-break: break-word; }
        .selected-date span { display: block; color: #8aa0af; font-size: 10px; margin-top: 3px; }

        .quick-actions { display: grid; gap: 8px; }

        .quick-action {
          border: 1px solid #dce8ee;
          background: #f8fbfd;
          padding: 12px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          cursor: pointer;
          color: #315a72;
          font-size: 12px;
          font-weight: 700;
          min-width: 0;
        }

        .quick-action span { min-width: 0; word-break: break-word; }
        .quick-action:hover { background: #eef9fa; border-color: #9ed5da; }

        .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 7px;
          border-radius: 20px;
          font-size: 9px;
          font-weight: 800;
          white-space: nowrap;
        }

        .status-pending { background: #fff5df; color: #b7770a; }
        .status-progress { background: #e8f4ff; color: #2477aa; }
        .status-completed { background: #e7faf3; color: #0c916e; }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(16,48,68,.38);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 16px;
        }

        .modal {
          width: min(680px, calc(100vw - 32px));
          max-height: 90vh;
          overflow-y: auto;
          background: white;
          border-radius: 22px;
          box-shadow: 0 30px 80px rgba(13,49,71,.25);
        }

        .modal-header {
          padding: 20px 22px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid #e3ebef;
          background: linear-gradient(120deg, #effbfc, #f5f9ff);
        }

        .modal-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
        .modal-title h3 { margin: 0; color: #193c57; font-size: 18px; word-break: break-word; }

        .close-btn {
          flex-shrink: 0;
          border: none;
          background: #edf4f7;
          color: #557387;
          width: 34px; height: 34px;
          border-radius: 9px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modal-body { padding: 22px; }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 15px;
        }

        .form-group { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
        .form-group.full { grid-column: 1 / -1; }
        .form-group label { font-size: 11px; font-weight: 800; color: #526f82; }

        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          border: 1px solid #d4e2e9;
          border-radius: 10px;
          background: #f9fbfc;
          color: #284d66;
          padding: 11px 12px;
          outline: none;
          font-family: inherit;
          font-size: 13px;
        }

        .form-group textarea { min-height: 100px; resize: vertical; }

        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
          border-color: #51aabd;
          box-shadow: 0 0 0 3px rgba(81,170,189,.1);
        }

        .modal-footer {
          padding: 15px 22px;
          border-top: 1px solid #e3ebef;
          display: flex;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 9px;
        }

        .list-view {
          padding: 20px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .list-view-table {
          width: 100%;
          min-width: 640px;
          border-collapse: collapse;
        }

        .list-view-table th {
          background: #f5fafc;
          color: #6c8799;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .7px;
          text-align: left;
          padding: 13px;
          border-bottom: 1px solid #dce7ed;
          white-space: nowrap;
        }

        .list-view-table td {
          padding: 14px 13px;
          border-bottom: 1px solid #edf2f5;
          color: #36566b;
          font-size: 12px;
          word-break: break-word;
        }

        .list-title { font-weight: 750; color: #204761; }
        .list-desc { font-size: 11px; color: #8ba0b1; margin-top: 3px; }

        .import-toast {
          position: fixed;
          top: 24px;
          right: 24px;
          z-index: 10000;
          min-width: 280px;
          max-width: min(430px, calc(100vw - 32px));
          padding: 13px 16px;
          border-radius: 13px;
          border: 1px solid #cfe3ea;
          background: rgba(255,255,255,.98);
          color: #31576d;
          box-shadow: 0 18px 45px rgba(22,74,99,.18);
          backdrop-filter: blur(12px);
          font-size: 12px;
          font-weight: 700;
          animation: importToastIn .25s ease-out;
        }

        .import-toast.success { border-color: #bde5d6; color: #087d68; }
        .import-toast.warning { border-color: #ead9ae; color: #9a6a0a; }
        .import-toast.error { border-color: #efc5c5; color: #b34444; }

        @keyframes importToastIn {
          from { opacity: 0; transform: translateY(-8px) translateX(8px); }
          to { opacity: 1; transform: translateY(0) translateX(0); }
        }

        @media (max-width: 1100px) {
          .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .below-section { grid-template-columns: 1fr; }
          .search-box { min-width: 100%; }
        }

        @media (max-width: 800px) {
          .task-calendar-page { padding: 12px; }
          .page-header { flex-direction: column; align-items: flex-start; padding: 20px; }
          .header-actions { width: 100%; }
          .header-actions button { flex: 1; justify-content: center; }
          .calendar-cell { min-height: 105px; padding: 7px; }
          .task-mini-meta { display: none; }
          .calendar-navigation button.today-button { display: none; }
          .filter-select { width: 100%; }
          .calendar-navigation { width: 100%; }
          .month-select { flex: 1; min-width: 0; }
          .month-select.year-select { flex: 0 0 92px; }
          .weekday { padding: 10px 2px; font-size: 9px; }
        }

        @media (max-width: 600px) {
          .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
          .form-grid { grid-template-columns: 1fr; }
          .form-group.full { grid-column: auto; }
          .calendar-cell { min-height: 82px; padding: 5px; }
          .weekday { font-size: 8px; padding: 8px 2px; letter-spacing: 0; }
          .day-number { font-size: 11px; }
          .add-day { width: 20px; height: 20px; }
          .task-mini { padding: 4px 5px; }
          .task-mini-title { font-size: 9px; }
          .more-tasks { font-size: 8px; }
          .calendar-top { padding: 13px; }
          .month-title h2 { font-size: 16px; }
          .month-select { max-width: 130px; font-size: 12px; }
          .title-area h1 { font-size: 21px; }
          .title-icon { width: 46px; height: 46px; }
          .selected-date-box { padding: 14px; }
          .stat-value { font-size: 22px; }
          .stat-card { padding: 14px; min-height: 95px; }
          .list-view { padding: 12px; }
          .modal-body { padding: 16px; }
          .modal-header { padding: 16px; }
          .modal-footer { padding: 12px 16px; }
        }

        @media (max-width: 420px) {
          .stats-grid { grid-template-columns: 1fr; }
          .calendar-cell { min-height: 64px; padding: 4px; }
          .day-number-row { margin-bottom: 4px; }
          .header-actions button { padding: 0 10px; font-size: 12px; height: 38px; }
          .secondary-btn, .primary-btn { font-size: 12px; }
          .panel-header { padding: 14px; }
          .quick-action { font-size: 11px; padding: 10px; }
          .month-select { max-width: 110px; }
        }

        /* ===== shared theme (matches Dashboard / Users / Tasks) ===== */
        .task-calendar-page h2 { font-weight: 800; color: var(--ts-text); }
        .task-calendar-page .page-header {
          background: var(--ts-hero);
          border: var(--ts-hero-border);
          box-shadow: var(--ts-hero-shadow);
          color: var(--ts-on-hero);
          backdrop-filter: none;
          padding: 28px 30px;
        }
        .task-calendar-page .page-header .title-area h1 { color: var(--ts-on-hero); font-weight: 800; }
        .task-calendar-page .page-header .title-area p { color: var(--ts-on-hero-muted); }
        .task-calendar-page .page-header .title-icon { background: var(--ts-glass); border: 1px solid var(--ts-glass-border); box-shadow: none; }
        .task-calendar-page .page-header .secondary-btn { background: var(--ts-glass); color: #fff; border-color: var(--ts-glass-border); font-size: 13px; }
        .task-calendar-page .page-header .secondary-btn:hover { background: rgba(255,255,255,.22); }
        .task-calendar-page .page-header .primary-btn { background: var(--ts-primary); box-shadow: var(--ts-primary-shadow); font-size: 13px; }
        .task-calendar-page .panel-header h2,
        .task-calendar-page .panel-header h3 { font-weight: 800; color: var(--ts-text); }

      `}</style>

      <div className="task-calendar-page">
        <div className="calendar-shell">

          {/* HEADER */}
          <section className="page-header">
            <div className="title-area">
              <div className="title-icon">
                <CalendarDays size={25} />
              </div>
              <div>
                <h1>Task Calendar</h1>
                <p>Plan, schedule and manage your tasks by due date</p>
              </div>
            </div>

            <div className="header-actions">
              <input
                ref={importInputRef}
                id="task-calendar-import-input"
                type="file"
                accept=".csv,text/csv"
                onChange={handleImportTasks}
                style={{ display: "none" }}
              />

              {canImport && (
                <button
                  className="secondary-btn"
                  onClick={handleImportClick}
                  disabled={importing}
                  title="CSV columns: Title, Start Date, Start Time, End Date, End Time, Department, Assignee, Status, Priority, Description — dates in any format, Task ID created automatically"
                >
                  <Upload size={16} />
                  {importing && !importPreview ? "Checking CSV..." : "Import Tasks"}
                </button>
              )}

              <button
                className="secondary-btn"
                onClick={() => {
                  fetchTasks();
                  fetchUsers();
                  fetchDepartments();
                }}
                disabled={loading}
              >
                <RefreshCw
                  size={16}
                  className={loading ? "spin-icon" : ""}
                />
                Refresh
              </button>

              <button className="secondary-btn" onClick={goToday}>
                <Calendar size={16} />
                Today
              </button>

              {canCreate && (
                <button className="primary-btn" onClick={() => openCreateModal()}>
                  <Plus size={17} />
                  New Task
                </button>
              )}
            </div>
          </section>

          {/* STATS */}
          <section className="stats-grid">
            <div
              className={`stat-card stat-blue${canOpen.tasks() ? " app-link-card" : ""}`}
              {...(canOpen.tasks() ? linkProps(() => openInTasks({}), "Open total tasks in Tasks") : {})}
            >
              <div className="stat-label">Total Tasks</div>
              <div className="stat-value">{totalTasks}</div>
              <div className="stat-description">Scheduled tasks</div>
              <div className="stat-icon">
                <CalendarDays size={18} />
              </div>
            </div>

            <div
              className={`stat-card stat-orange${canOpen.tasks() ? " app-link-card" : ""}`}
              {...(canOpen.tasks() ? linkProps(() => openInTasks({ status: "To Do" }), "Open pending in Tasks") : {})}
            >
              <div className="stat-label">Pending</div>
              <div className="stat-value">{pendingTasks}</div>
              <div className="stat-description">Tasks waiting to start</div>
              <div className="stat-icon">
                <Circle size={18} />
              </div>
            </div>

            <div
              className={`stat-card stat-blue${canOpen.tasks() ? " app-link-card" : ""}`}
              {...(canOpen.tasks() ? linkProps(() => openInTasks({ status: "In Progress" }), "Open in progress in Tasks") : {})}
            >
              <div className="stat-label">In Progress</div>
              <div className="stat-value">{inProgressTasks}</div>
              <div className="stat-description">Active work</div>
              <div className="stat-icon">
                <Clock3 size={18} />
              </div>
            </div>

            <div
              className={`stat-card stat-green${canOpen.tasks() ? " app-link-card" : ""}`}
              {...(canOpen.tasks() ? linkProps(() => openInTasks({ status: "Completed" }), "Open completed in Tasks") : {})}
            >
              <div className="stat-label">Completed</div>
              <div className="stat-value">{completedTasks}</div>
              <div className="stat-description">Finished tasks</div>
              <div className="stat-icon">
                <CheckCircle2 size={18} />
              </div>
            </div>
          </section>

          {/* TOOLBAR */}
          <section className="toolbar">
            <div className="search-box">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search tasks, users, departments..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select
              className="filter-select"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option>All Departments</option>
              {departmentOptions.map((dept) => (
                <option key={dept}>{dept}</option>
              ))}
            </select>

            <select
              className="filter-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option>All Status</option>
              <option>Pending</option>
              <option>In Progress</option>
              <option>Completed</option>
            </select>

            <div className="view-toggle">
              <button
                className={viewMode === "calendar" ? "active" : ""}
                onClick={() => setViewMode("calendar")}
                title="Calendar view"
              >
                <LayoutGrid size={17} />
              </button>

              <button
                className={viewMode === "list" ? "active" : ""}
                onClick={() => setViewMode("list")}
                title="List view"
              >
                <List size={17} />
              </button>
            </div>
          </section>

          {/* CALENDAR VIEW */}
          {viewMode === "calendar" && (
            <section className="calendar-card">
              <div className="calendar-top">
                <div className="month-title">
                  <div className="month-icon">
                    <CalendarDays size={20} />
                  </div>
                  <div>
                    <h2>
                      {monthName} {year}
                    </h2>
                    <span>Schedule and manage your tasks</span>
                  </div>
                </div>

                <div className="calendar-navigation">
                  <select
                    className="month-select"
                    value={month}
                    onChange={handleMonthSelect}
                    title="Select month"
                  >
                    {MONTHS.map((m, idx) => (
                      <option key={m} value={idx}>
                        {m}
                      </option>
                    ))}
                  </select>

                  <select
                    className="month-select year-select"
                    value={year}
                    onChange={handleYearSelect}
                    title="Select year"
                  >
                    {yearsList.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>

                  <button onClick={previousMonth} title="Previous month">
                    <ChevronLeft size={17} />
                  </button>

                  <button className="today-button" onClick={goToday}>
                    Today
                  </button>

                  <button onClick={nextMonth} title="Next month">
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="loading-state">
                  <span className="spinner" />
                  Loading tasks from server...
                </div>
              ) : error ? (
                <div className="error-banner">
                  <span>⚠️ {error}</span>
                  <button onClick={fetchTasks}>Try Again</button>
                </div>
              ) : (
                <>
                  <div className="weekday-row">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                      (day) => (
                        <div className="weekday" key={day}>
                          {day}
                        </div>
                      )
                    )}
                  </div>

                  <div className="calendar-grid">
                    {calendarDays.map((day, index) => {
                      const dateTasks = getTasksForDate(day);

                      const cellDate = day
                        ? new Date(year, month, day)
                        : null;

                      const selected =
                        cellDate &&
                        cellDate.toDateString() ===
                          selectedDate.toDateString();

                      return (
                        <div
                          key={index}
                          className={`calendar-cell ${
                            isToday(day) ? "today" : ""
                          } ${selected ? "selected" : ""}`}
                          onClick={() => handleDateClick(day)}
                        >
                          {day && (
                            <div className="day-number-row">
                              <span className="day-number">{day}</span>
                              <span
                                className="add-day"
                                title="Add task on this day"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openCreateModal(cellDate);
                                }}
                              >
                                <Plus size={13} />
                              </span>
                            </div>
                          )}

                          {dateTasks.slice(0, 3).map((task) => (
                            <div
                              key={task.id}
                              className={`task-mini priority-${task.priority.toLowerCase()}`}
                              title={`${task.title} • ${task.department} • ${task.assignee} • ${task.status}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (canEdit && canModify(task)) openEditModal(task);
                              }}
                            >
                              <div className="task-mini-title">
                                {task.title}
                              </div>
                              <div className="task-mini-meta">
                                <StatusIcon value={task.status} />
                                <span>{task.time}</span>
                                <span>·</span>
                                <span>{task.assignee}</span>
                              </div>
                            </div>
                          ))}

                          {dateTasks.length > 3 && (
                            <div className="more-tasks">
                              +{dateTasks.length - 3} more
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          )}

          {/* LIST VIEW */}
          {viewMode === "list" && !loading && !error && (
            <section className="panel">
              <div className="panel-header">
                <h3>All Tasks</h3>
                <span>{filteredTasks.length} task(s) found</span>
              </div>

              {filteredTasks.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <FileSpreadsheet size={22} />
                  </div>
                  <strong>No tasks found</strong>
                  <span>
                    Try changing the filters, refresh, or create a new task.
                  </span>
                </div>
              ) : (
                <div className="list-view">
                  <table className="list-view-table">
                    <thead>
                      <tr>
                        <th>Task</th>
                        <th>Due Date</th>
                        <th>Department</th>
                        <th>Assigned To</th>
                        <th>Status</th>
                        <th>Priority</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.map((task) => (
                        <tr key={task.id}>
                          <td>
                            <div className={`list-title${canOpen.tasks() ? " app-link" : ""}`} {...taskLink(task)}>{task.title}</div>
                            {task.description && (
                              <div className="list-desc">
                                {task.description}
                              </div>
                            )}
                          </td>
                          <td>
                            {task.date}
                            {task.time ? ` · ${task.time}` : ""}
                          </td>
                          <td><span className={canOpen.tasks() && task.department ? "app-link" : undefined} {...deptLink(task.department)}>{task.department}</span></td>
                          <td><span className={canOpen.users() && task.assignee ? "app-link" : undefined} {...userLink(task.assignee)}>{task.assignee}</span></td>
                          <td>
                            <span
                              className={`status-pill ${statusClass(
                                task.status
                              )}`}
                            >
                              <StatusIcon value={task.status} />
                              {task.status}
                            </span>
                          </td>
                          <td>{task.priority}</td>
                          <td>
                            <div className="task-row-actions">
                              {canEdit && canModify(task) && (
                              <button
                                className="icon-button"
                                title="Edit task"
                                onClick={() => openEditModal(task)}
                              >
                                <Edit3 size={14} />
                              </button>
                              )}
                              {canDelete && canModify(task) && (
                              <button
                                className="icon-button danger"
                                title="Delete task"
                                onClick={() => deleteTask(task)}
                              >
                                <Trash2 size={14} />
                              </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* BOTTOM PANELS */}
          {!loading && !error && (
            <div className="below-section">
              <section className="panel">
                <div className="panel-header">
                  <h3>Tasks on {formatSelectedDate(selectedDate)}</h3>
                  <span>{selectedDayTasks.length} task(s) scheduled</span>
                </div>

                <div className="task-list">
                  {selectedDayTasks.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">
                        <CalendarDays size={22} />
                      </div>
                      <strong>No tasks on this day</strong>
                      <span>
                        Click + on any date or "New Task" to schedule one.
                      </span>
                    </div>
                  ) : (
                    selectedDayTasks.map((task) => (
                      <div className="task-row" key={task.id}>
                        <div className="task-main">
                          <div className={`task-row-title${canOpen.tasks() ? " app-link" : ""}`} {...taskLink(task)}>{task.title}</div>
                          <div className="task-row-meta">
                            <span>
                              <StatusIcon value={task.status} />
                              {task.status}
                            </span>
                            <span>
                              <Clock3 size={11} />
                              {task.time}
                            </span>
                            <span>
                              <Building2 size={11} />
                              <span className={canOpen.tasks() && task.department ? "app-link" : undefined} {...deptLink(task.department)}>{task.department}</span>
                            </span>
                            <span>
                              <UserRound size={11} />
                              <span className={canOpen.users() && task.assignee ? "app-link" : undefined} {...userLink(task.assignee)}>{task.assignee}</span>
                            </span>
                          </div>
                        </div>

                        <div className="task-row-actions">
                          {canEdit && canModify(task) && (
                          <button
                            className="icon-button"
                            title="Edit task"
                            onClick={() => openEditModal(task)}
                          >
                            <Edit3 size={14} />
                          </button>
                          )}
                          {canDelete && canModify(task) && (
                          <button
                            className="icon-button danger"
                            title="Delete task"
                            onClick={() => deleteTask(task)}
                          >
                            <Trash2 size={14} />
                          </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="panel">
                <div className="panel-header">
                  <h3>Selected Date</h3>
                  <span>Quick actions</span>
                </div>

                <div className="selected-date-box">
                  <div className="selected-date">
                    <div className="selected-date-icon">
                      <CalendarDays size={18} />
                    </div>
                    <div>
                      <strong>{formatSelectedDate(selectedDate)}</strong>
                      <span>
                        {selectedDayTasks.length} task(s) scheduled
                      </span>
                    </div>
                  </div>

                  <div className="quick-actions">
                    <button
                      className="quick-action"
                      onClick={() => openCreateModal()}
                    >
                      <span>Add Task on This Date</span>
                      <Plus size={15} />
                    </button>

                    <button
                      className="quick-action"
                      onClick={() => setViewMode("list")}
                    >
                      <span>View All Tasks in List</span>
                      <ArrowRight size={15} />
                    </button>

                    <button className="quick-action" onClick={goToday}>
                      <span>Jump to Today</span>
                      <Calendar size={15} />
                    </button>

                    {canOpen.tasks() && (
                      <button
                        className="quick-action"
                        onClick={() => openInTasks({ date: selectedDateKey })}
                      >
                        <span>Open This Day in Tasks</span>
                        <ArrowRight size={15} />
                      </button>
                    )}

                    {canOpen.mom() && (
                      <button
                        className="quick-action"
                        onClick={() => navigate(appLinks.mom({ date: selectedDateKey }))}
                      >
                        <span>Meetings on This Day</span>
                        <ArrowRight size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>

      {/* MODAL (create / edit) */}
      {showModal &&
        createPortal(
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">
                  <div
                    className="title-icon"
                    style={{ width: 40, height: 40, borderRadius: 12 }}
                  >
                    <CalendarDays size={18} />
                  </div>
                  <h3>{editingTask ? "Edit Task" : "Create New Task"}</h3>
                </div>
                <button className="close-btn" onClick={closeModal}>
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={saveTask}>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="form-group full">
                      <label>Task Title *</label>
                      <input
                        name="title"
                        value={form.title}
                        onChange={handleFormChange}
                        placeholder="Enter task title"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Due Date *</label>
                      <input
                        type="date"
                        name="date"
                        value={form.date}
                        onChange={handleFormChange}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Time</label>
                      <input
                        type="time"
                        name="time"
                        value={form.time}
                        onChange={handleFormChange}
                      />
                    </div>

                    <div className="form-group">
                      <label>Department</label>
                      <select
                        name="department"
                        value={form.department}
                        onChange={handleFormChange}
                      >
                        <option value="">No department</option>
                        {departmentOptions.map((dept) => (
                          <option key={dept}>{dept}</option>
                        ))}
                        {/* e.g. the assignee's department, not created in User Management */}
                        {form.department && !departmentOptions.includes(form.department) && (
                          <option key={`current-${form.department}`}>{form.department}</option>
                        )}
                      </select>
                    </div>

                    {/* NEW: dropdown of user NAMES (submits the user ID) */}
                    <div className="form-group">
                      <label>Assigned To</label>
                      <select
                        name="assignee"
                        value={form.assignee}
                        onChange={handleAssigneeChange}
                      >
                        <option value="">Unassigned</option>
                        {assigneeGroups.inDept.length > 0 && (
                          <optgroup label={form.department ? `${form.department}` : "Users"}>
                            {assigneeGroups.inDept.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}{u.department && !form.department ? ` — ${u.department}` : ""}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {assigneeGroups.other.length > 0 && (
                          <optgroup label="Other departments (department will change)">
                            {assigneeGroups.other.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} — {u.department}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {form.assignee &&
                          !users.some((u) => u.id === form.assignee) && (
                            <option value={form.assignee}>
                              {editingTask?.assignee && editingTask.assignee !== "Unassigned"
                                ? editingTask.assignee
                                : "Current assignee"}
                            </option>
                          )}
                      </select>
                      {users.length === 0 && (
                        <small style={{ color: "#9a6a0a", fontSize: 11 }}>
                          No users to assign. Add users in User Management, or ask an admin for the "assign" permission.
                        </small>
                      )}
                      {assigneeNote && <small style={{ color: "#0b8f87", fontSize: 11 }}>{assigneeNote}</small>}
                    </div>

                    <div className="form-group">
                      <label>Priority</label>
                      <select
                        name="priority"
                        value={form.priority}
                        onChange={handleFormChange}
                      >
                        <option>High</option>
                        <option>Medium</option>
                        <option>Low</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Status</label>
                      <select
                        name="status"
                        value={form.status}
                        onChange={handleFormChange}
                      >
                        <option>Pending</option>
                        <option>In Progress</option>
                        <option>Completed</option>
                      </select>
                    </div>

                    <div className="form-group full">
                      <label>Description</label>
                      <textarea
                        name="description"
                        value={form.description}
                        onChange={handleFormChange}
                        placeholder="Task details..."
                      />
                    </div>
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={closeModal}
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
                      : editingTask
                      ? "Update Task"
                      : "Create Task"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
      {/* CSV IMPORT PREVIEW (validated by the backend, nothing saved yet) */}
      {importPreview &&
        createPortal(
          <div className="modal-overlay" onClick={() => !importing && setImportPreview(null)}>
            <div className="modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="modal-title">
                  <div
                    className="title-icon"
                    style={{ width: 40, height: 40, borderRadius: 12 }}
                  >
                    <Upload size={18} />
                  </div>
                  <h3>Import preview — {importPreview.file.name}</h3>
                </div>
                <button className="close-btn" onClick={() => setImportPreview(null)} disabled={importing}>
                  <X size={16} />
                </button>
              </div>

              <div className="modal-body">
                <p style={{ margin: "0 0 12px", fontSize: 13, color: "#4f6f7a" }}>
                  <strong>{importPreview.summary.valid}</strong> of {importPreview.summary.total} row(s)
                  will be imported
                  {importPreview.summary.invalid ? ` · ${importPreview.summary.invalid} invalid` : ""}
                  {importPreview.summary.duplicates ? ` · ${importPreview.summary.duplicates} duplicate` : ""}.
                  Invalid and duplicate rows are skipped.
                </p>
                <div style={{ maxHeight: 340, overflow: "auto", border: "1px solid #e1eef0", borderRadius: 12 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f3fafb", textAlign: "left" }}>
                        {["Row", "Title", "Date", "Assignee", "Department", "Result"].map((h) => (
                          <th key={h} style={{ padding: "8px 10px", position: "sticky", top: 0, background: "#f3fafb" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.rows.map((row) => (
                        <tr key={row.line} style={{ borderTop: "1px solid #eef5f6" }}>
                          <td style={{ padding: "7px 10px", color: "#7b969e" }}>{row.line}</td>
                          <td style={{ padding: "7px 10px" }}>{row.title || "—"}</td>
                          <td style={{ padding: "7px 10px" }}>{row.date || "—"}{row.time ? ` ${row.time}` : ""}</td>
                          <td style={{ padding: "7px 10px" }}>{row.assignee || "Unassigned"}</td>
                          <td style={{ padding: "7px 10px" }}>{row.department || "—"}</td>
                          <td
                            style={{
                              padding: "7px 10px",
                              fontWeight: 600,
                              color: row.state === "valid" ? "#087d68" : row.state === "duplicate" ? "#9a6a0a" : "#b34444",
                            }}
                          >
                            {row.state === "valid" ? "Ready" : row.errors.join("; ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setImportPreview(null)}
                  disabled={importing}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={confirmImport}
                  disabled={importing || importPreview.summary.valid === 0}
                >
                  {importing
                    ? "Importing..."
                    : `Import ${importPreview.summary.valid} task${importPreview.summary.valid === 1 ? "" : "s"}`}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};


export default TaskCalendar;