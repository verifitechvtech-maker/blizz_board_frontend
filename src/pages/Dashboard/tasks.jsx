import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { appLinks, canOpen, linkProps, APP_LINK_CSS } from "../../utils/appLinks";
import axios from "axios";
import { getSocket } from "../../services/socket";
import CsvImportDialog from "../../components/CsvImportDialog";
import EmailTaskDialog from "../../components/EmailTaskDialog";
import { Pagination, usePagination } from "../../components/Pagination";
import BulkSelectBar, { SelectCheckbox, useBulkSelect } from "../../components/BulkSelectBar";
import {
  MonthlyTaskFields,
  MonthlySummaryChip,
  MonthlyProgressModal,
  defaultMonthlyConfig,
  validateMonthlyConfig,
} from "./MonthlyTaskProgress";
import {
  DepartmentMultiSelect,
  EmployeeWorkload,
  ReworkReferencePicker,
  reminderSummary,
  remindersSummary,
  taskDuration,
  ChecklistEditor,
  ChecklistView,
} from "./TaskFormExtras";
import {
  Plus,
  X,
  Search,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock3,
  Bell,
  AlertTriangle,
  Circle,
  UserRound,
  UserCheck,
  Building2,
  Paperclip,
  ListChecks,
  RotateCcw,
  Award,
  FileText,
  Trash2,
  Eye,
  MailOpen,
  ArrowDown,
  Mail,
  Archive,
  Minus,
  ArrowUp,
  ShieldAlert,
  LogIn,
  Rows3,
  Columns3,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  Target,
  Waves,
  Zap,
  Download,
  UploadCloud,
  Upload,
  BadgeCheck,
} from "lucide-react";
import { API_URL as ENV_API_URL } from "../../config/env";

/* =========================================================
   THEME
========================================================= */

const colors = {
  navy: "#123B5D",
  navyDark: "#082A45",
  blue: "#1677A8",
  blueLight: "#E6F4FA",
  ocean: "#16A6B8",
  oceanDark: "#08798C",
  oceanSoft: "#E7F8FA",
  border: "#D5E7EE",
  text: "#16344D",
  muted: "#6E8799",
  white: "#FFFFFF",
  background: "#F2F8FA",
};

/* =========================================================
   API SETUP
========================================================= */

const API_URL =
  ENV_API_URL;

// Same rules the backend enforces — used only to hide actions the user cannot perform
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

// Creator, Manager or Admin may edit/delete; assignees only change status
const canModifyTask = (user, task) => {
  if (!user) return false;
  if (["SuperAdmin", "Admin", "Manager"].includes(user.role)) return true;
  return Boolean(task?.assignedBy) && String(task.assignedBy) === String(user._id);
};

/* =========================================================
   ATTACHMENT RULES (mirror backend/src/controllers/taskController.js)
========================================================= */

const ATTACHMENT_EXTENSIONS = [
  "jpg", "jpeg", "png", "gif", "webp", "pdf", "doc", "docx",
  "xls", "xlsx", "ppt", "pptx", "txt", "csv", "zip",
];
const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024; // must match the backend (8 MB)
const MAX_ATTACHMENTS = 10;

const formatFileSize = (bytes) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fileExtension = (name = "") =>
  String(name).split(".").pop().toLowerCase();

// Authenticated download (the files are not public)
const downloadAttachment = async (attachment) => {
  const response = await api.get(
    `/tasks/attachments/${encodeURIComponent(attachment.filename)}`,
    { responseType: "blob" }
  );
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = attachment.name || attachment.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const getAuthToken = () =>
  localStorage.getItem("token") ||
  localStorage.getItem("authToken") ||
  localStorage.getItem("accessToken") ||
  localStorage.getItem("jwt") ||
  localStorage.getItem("userToken") ||
  "";

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();

  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/* =========================================================
   RESPONSE HELPERS
========================================================= */

const extractApiData = (response) => {
  const body = response?.data;

  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.users)) return body.users;
  if (Array.isArray(body?.departments)) return body.departments;

  return [];
};

const extractTaskList = (response) => {
  const body = response?.data;

  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.tasks)) return body.tasks;

  return [];
};

const extractCreatedTask = (response) => {
  const body = response?.data;

  return (
    body?.data ||
    body?.task ||
    body?.updatedTask ||
    body
  );
};

/* =========================================================
   NORMALIZERS
========================================================= */

const normalizeDepartment = (item) => {
  if (typeof item === "string") {
    return {
      id: item,
      name: item,
    };
  }

  return {
    id: item?._id || item?.id || item?.name,
    name:
      item?.name ||
      item?.departmentName ||
      item?.title ||
      item?.department ||
      "",
    // task reference IDs: code + number (FF → FF1, FF2…)
    refPrefix: item?.refPrefix || "",
    nextReferenceId: item?.nextReferenceId || "",
  };
};

const normalizeUser = (item) => ({
  id: item?._id || item?.id || item?.email,

  name:
    item?.name ||
    item?.fullName ||
    item?.username ||
    item?.userName ||
    item?.email ||
    "Unnamed User",

  email: item?.email || "",

  department:
    typeof item?.department === "object"
      ? item.department?.name ||
        item.department?.departmentName ||
        ""
      : item?.department || "",

  status: item?.status || "Active",
});

const normalizeStatus = (value) => {
  const raw = String(value || "")
    .trim()
    .toLowerCase();

  const aliases = {
    "to do": "To Do",
    todo: "To Do",
    "to-do": "To Do",
    "to_do": "To Do",
    pending: "To Do",
    new: "To Do",

    "in progress": "In Progress",
    inprogress: "In Progress",
    "in-progress": "In Progress",
    "in_progress": "In Progress",
    progress: "In Progress",
    active: "In Progress",
    ongoing: "In Progress",

    review: "Review",
    reviewing: "Review",
    "in review": "Review",
    "under review": "Review",

    completed: "Completed",
    complete: "Completed",
    done: "Completed",
    finished: "Completed",
  };

  return aliases[raw] || "To Do";
};

const normalizeTask = (t) => ({
  id:
    t?._id ||
    t?.id ||
    `tmp-${Date.now()}-${Math.random()}`,

  rawStatus: t?.status ?? "",

  assignedTo:
    typeof t?.assignedTo === "object"
      ? t?.assignedTo?._id || ""
      : t?.assignedTo || "",

  assignedBy:
    typeof t?.assignedBy === "object"
      ? t?.assignedBy?._id || ""
      : t?.assignedBy || "",

  reworkCount: Number(t?.reworkCount) || 0,
  reviewScore: Number(t?.reviewScore) || null,
  reviewComments: Array.isArray(t?.reviewComments) ? t.reviewComments : [],

  // every selected department (department above = the primary, first one)
  departments: Array.isArray(t?.departments) && t.departments.length
    ? t.departments
    : t?.department
      ? [typeof t.department === "object" ? t.department?.name || "" : t.department].filter(Boolean)
      : [],

  // Rework task → the original task it redoes
  reworkOf: t?.reworkOf?.referenceId || t?.reworkOf?.task ? t.reworkOf : null,

  // "monthly" → monthly target with daily progress (MonthlyTaskProgress.jsx); "rework" → redo of an earlier task
  taskType: ["monthly", "rework"].includes(t?.taskType) ? t.taskType : "standard",
  monthly: t?.taskType === "monthly" && t?.monthly ? t.monthly : null,

  dueTime: t?.dueTime || "",

  // start → end (the card shows "7 hours" / "3 days") and the chosen reminder
  startDate: t?.startDate ? String(t.startDate).slice(0, 10) : "",
  startTime: t?.startTime || "",
  reminder: t?.reminder?.option && t.reminder.option !== "none" ? t.reminder : null,
  reminders: Array.isArray(t?.reminders) ? t.reminders : [],
  checklist: Array.isArray(t?.checklist) ? t.checklist : [],

  name:
    t?.name ||
    t?.title ||
    "Untitled Task",

  referenceId:
    t?.referenceId || "",

  department:
    typeof t?.department === "object"
      ? t?.department?.name ||
        t?.department?.departmentName ||
        ""
      : t?.department || "",

  assignedUser:
    typeof t?.assignedUser === "object"
      ? t?.assignedUser?.name ||
        t?.assignedUser?.fullName ||
        ""
      : t?.assignedUser || "",

  assignedUsers: Array.isArray(t?.assignedUsers)
    ? t.assignedUsers.map((user) =>
        typeof user === "object"
          ? user?.name || user?.fullName || user?.username || ""
          : user
      ).filter(Boolean)
    : (t?.assignedUser
        ? [typeof t.assignedUser === "object"
            ? t.assignedUser?.name || t.assignedUser?.fullName || ""
            : t.assignedUser]
        : []),

  description:
    t?.description || "",

  dueDate:
    t?.dueDate
      ? String(t.dueDate).slice(0, 10)
      : "",

  priority:
    t?.priority || "Medium",

  complexity:
    t?.complexity ?? 0,

  reward:
    t?.reward ?? 10,

  recurring:
    Boolean(t?.recurring),

  recurrenceInterval:
    t?.recurrenceInterval ||
    "Every day",

  attachments:
    Array.isArray(t?.attachments)
      ? t.attachments
      : [],

  subtasks:
    Array.isArray(t?.subtasks)
      ? t.subtasks
      : [],

  status:
    normalizeStatus(t?.status),

  createdAt:
    t?.createdAt || "",

  // Same id on every person's copy of a task assigned to several people
  taskGroupId: t?.taskGroupId || null,
  // Task Bank template it was assigned from (links to the Task Bank)
  sourceTemplate: t?.sourceTemplate ? String(t.sourceTemplate?._id || t.sourceTemplate) : "",
  assignedByName: t?.assignedByName || "",
  statusHistory: Array.isArray(t?.statusHistory) ? t.statusHistory : [],
  completedAt: t?.completedAt || null,
  emailViewedAt: t?.emailViewedAt || null,
  emailUpdatedAt: t?.emailUpdatedAt || null,
  updatedAt: t?.updatedAt || "",
});

/* =========================================================
   ONE TASK FOR SEVERAL PEOPLE
   A task assigned to several people is saved as one copy per person
   (same taskGroupId), so each person has their own status. The list
   shows the copies as ONE task; opening it lists every person's part.
========================================================= */

// Overall status of a shared task from each person's status
const groupStatus = (members) => {
  const all = members.map((m) => normalizeStatus(m.status));
  if (all.every((s) => s === all[0])) return all[0];
  if (all.every((s) => s === "Completed" || s === "Review")) return "Review";
  if (all.some((s) => s !== "To Do")) return "In Progress";
  return "To Do";
};

const checklistProgress = (task) => {
  const list = Array.isArray(task.subtasks) ? task.subtasks : [];
  return { done: list.filter((s) => s?.completed).length, total: list.length };
};

const groupTasks = (list) => {
  const groups = new Map();
  const out = [];
  for (const task of list) {
    if (!task.taskGroupId) {
      out.push(task);
      continue;
    }
    let group = groups.get(String(task.taskGroupId));
    if (!group) {
      group = { members: [] };
      groups.set(String(task.taskGroupId), group);
      out.push(group); // keeps the list order (newest first)
    }
    group.members.push(task);
  }

  return out.map((item) => {
    if (!item.members) return item;
    const members = [...item.members].sort((a, b) =>
      (a.assignedUser || "").localeCompare(b.assignedUser || "")
    );
    // An assignee only sees their own copy → a normal task for them
    if (members.length === 1) return members[0];
    const first = members[0];
    const progress = Math.round(
      members.reduce((sum, m) => sum + (statusConfig[normalizeStatus(m.status)]?.progress || 0), 0) /
        members.length
    );
    return {
      ...first,
      id: `group-${first.taskGroupId}`,
      isGroup: true,
      members,
      assignedUser: members.map((m) => m.assignedUser || "Unassigned").join(", "),
      assignedUsers: members.map((m) => m.assignedUser).filter(Boolean),
      status: groupStatus(members),
      progress,
      completedCount: members.filter((m) => normalizeStatus(m.status) === "Completed").length,
    };
  });
};

const normalizeAttachmentForForm = (a) => {
  if (typeof a === "string") {
    return {
      name: a,
      size: 0,
    };
  }

  return {
    name:
      a?.name ||
      a?.filename ||
      a?.originalName ||
      a?.url ||
      "attachment",

    size: a?.size || 0,
    type: a?.mimetype || "",
    filename: a?.filename || "",
    downloadable: Boolean(a?.filename),
    existing: true,
  };
};

const normalizeSubtaskForForm = (s, index) => {
  if (typeof s === "string") {
    return {
      id: `sub-${index}-${Date.now()}`,
      title: s,
    };
  }

  return {
    id:
      s?._id ||
      s?.id ||
      `sub-${index}-${Date.now()}`,

    title:
      s?.title ||
      s?.name ||
      "",
  };
};

/* =========================================================
   TASK API
========================================================= */

const fetchTasksApi = async () => {
  const response = await api.get("/tasks");
  return extractTaskList(response);
};

const createTaskApi = async (payload) => {
  const response = await api.post("/tasks", payload);
  return extractCreatedTask(response);
};

// Backend: PATCH /api/tasks/:id (JSON or multipart/form-data)
const updateTaskApi = async (taskId, payload) => {
  const response = await api.patch(
    `/tasks/${taskId}`,
    payload
  );

  return extractCreatedTask(response);
};

/* =========================================================
   STATUS UPDATE
========================================================= */

const STATUS_VALUE_OVERRIDE = {
  // "To Do": "todo",
  // "In Progress": "in-progress",
  // Review: "review",
  // Completed: "completed",
};

// Backend route: PATCH /api/tasks/:id/status { status }
const STATUS_ROUTE_OVERRIDE = "/tasks/{id}/status";

const STATUS_VALUE_VARIANTS = (
  canonical,
  rawHint
) => {
  const values = [];

  const push = (value) => {
    if (
      value &&
      !values.includes(value)
    ) {
      values.push(value);
    }
  };

  if (
    STATUS_VALUE_OVERRIDE[canonical]
  ) {
    push(
      STATUS_VALUE_OVERRIDE[canonical]
    );
  }

  push(canonical);
  push(
    canonical.toLowerCase()
  );

  push(
    canonical
      .toLowerCase()
      .replace(/\s+/g, "-")
  );

  push(
    canonical
      .toLowerCase()
      .replace(/\s+/g, "_")
  );

  push(
    canonical
      .toLowerCase()
      .replace(/\s+/g, "")
  );

  push(rawHint);

  return values;
};

const STATUS_ROUTES = (taskId) => {
  if (STATUS_ROUTE_OVERRIDE) {
    return [
      STATUS_ROUTE_OVERRIDE.replace(
        "{id}",
        taskId
      ),
    ];
  }

  return [
    `/tasks/${taskId}`,
    `/tasks/${taskId}/status`,
  ];
};

const STATUS_METHODS = [
  "patch",
  "put",
];

let statusRecipe = null;

const responseConfirmsNewStatus = (
  result,
  canonical
) => {
  if (typeof result === "string") {
    return false;
  }

  if (
    !result ||
    typeof result !== "object"
  ) {
    return true;
  }

  const returned =
    result.status ??
    result.taskStatus ??
    result.task?.status;

  if (
    returned === undefined ||
    returned === null ||
    returned === ""
  ) {
    return true;
  }

  return (
    normalizeStatus(returned) ===
    canonical
  );
};

const attemptStatusUpdate = (
  method,
  route,
  value
) => {
  const request =
    method === "put"
      ? api.put
      : api.patch;

  console.log(
    `[Status] ${method.toUpperCase()} ${API_URL}${route} → ${value}`
  );

  return request(route, {
    status: value,
    taskStatus: value,
  }).then((response) =>
    extractCreatedTask(response)
  );
};

const updateTaskStatusApi = async (
  taskId,
  status,
  rawHint = ""
) => {
  const canonical =
    normalizeStatus(status);

  const attempts = [];

  const runCandidate = async (
    method,
    route,
    value
  ) => {
    try {
      const result =
        await attemptStatusUpdate(
          method,
          route,
          value
        );

      if (
        !responseConfirmsNewStatus(
          result,
          canonical
        )
      ) {
        const error =
          new Error(
            `Server returned a different status.`
          );

        error.softMismatch = true;

        throw error;
      }

      statusRecipe = {
        method,
        routeTemplate:
          route.replace(
            taskId,
            "{id}"
          ),
        value,
      };

      console.log(
        `[Status] ✔ Saved ${canonical}`
      );

      return result;
    } catch (err) {
      attempts.push(
        `${method.toUpperCase()} ${route} "${value}" → ${
          err?.response?.status ||
          err.message
        }`
      );

      throw err;
    }
  };

  if (statusRecipe) {
    try {
      return await runCandidate(
        statusRecipe.method,
        statusRecipe.routeTemplate.replace(
          "{id}",
          taskId
        ),
        statusRecipe.value
      );
    } catch (err) {
      if (
        err?.response?.status ===
        401
      ) {
        throw err;
      }

      statusRecipe = null;
    }
  }

  for (const value of STATUS_VALUE_VARIANTS(
    canonical,
    rawHint
  )) {
    for (const route of STATUS_ROUTES(
      taskId
    )) {
      for (const method of STATUS_METHODS) {
        try {
          return await runCandidate(
            method,
            route,
            value
          );
        } catch (err) {
          if (
            err?.response?.status ===
            401
          ) {
            throw new Error(
              "Session expired. Please log in again."
            );
          }

          const code =
            err?.response?.status;

          const retryable =
            code === 400 ||
            code === 404 ||
            code === 405 ||
            code === 422 ||
            err?.softMismatch;

          if (!retryable) {
            throw err;
          }
        }
      }
    }
  }

  console.error(
    "[Status] All attempts failed",
    attempts
  );

  throw new Error(
    `Could not save status "${canonical}".`
  );
};

const deleteTaskApi = async (
  taskId
) => {
  return api.delete(
    `/tasks/${taskId}`
  );
};

/* =========================================================
   SEMANTIC CONFIG
========================================================= */

const TASK_STATUSES = [
  "To Do",
  "In Progress",
  "Review",
  "Completed",
];

// Review flow (same rules as the backend):
//   only the person who ASSIGNED a task can mark it Completed — once it's in Review —
//   or send it back for rework; only they can reopen a Completed task.
//   No assigner (old / imported tasks) → Admin / Manager.
const reviewRoleOf = (task) => {
  const me = getSessionUser();
  const myId = String(me?._id || me?.id || "");
  const isAssigner = task?.assignedBy
    ? String(task.assignedBy) === myId
    : ["Admin", "SuperAdmin", "Manager"].includes(me?.role);
  const selfAssigned =
    Boolean(task?.assignedBy) && String(task.assignedBy) === String(task.assignedTo);
  return {
    isAssigner,
    selfAssigned,
    canReview: isAssigner && !selfAssigned && normalizeStatus(task?.status) === "Review",
  };
};

const statusOptionDisabled = (task, option) => {
  const { isAssigner, selfAssigned } = reviewRoleOf(task);
  const current = normalizeStatus(task?.status);
  if (option === current) return false;
  if (option === "Completed") return !isAssigner || (current !== "Review" && !selfAssigned);
  if (current === "Completed") return !isAssigner;
  return false;
};

const statusOptionLabel = (task, option) =>
  option === "Completed" && statusOptionDisabled(task, option)
    ? reviewRoleOf(task).isAssigner
      ? "Completed (move to Review first)"
      : "Completed (assigner approves)"
    : option;

// Approve → the assigner gives a score 1–10 (quick picks 6 / 8 / 10); it becomes the assignee's points
const SCORE_LABELS = { 1: "Poor", 2: "Poor", 3: "Weak", 4: "Weak", 5: "Okay", 6: "Good", 7: "Good", 8: "Very good", 9: "Excellent", 10: "Perfect" };

// Quick points the reviewer can drop into the comment box
const REVIEW_COMMENT_TAGS = {
  submit: ["Work completed as required", "All subtasks done", "Files attached", "Tested and verified", "Please check the details"],
  complete: ["Good quality work", "Delivered on time", "All subtasks done", "Well documented", "Keep it up"],
  rework: ["Missing requirements", "Quality needs improvement", "Subtasks not finished", "Attachments missing", "Fix errors and resubmit"],
};

const latestReviewComment = (task) => {
  const list = Array.isArray(task?.reviewComments) ? task.reviewComments : [];
  return list.length ? list[list.length - 1] : null;
};

// Review dialog: Approve (score 1–10 + comment) or Rework (comment required).
// It shows the task's key details so the reviewer can comment on each of them;
// the comment is sent to the assigned person (dashboard, email) and shown on their task card.
const ScoreDialog = ({ task, mode = "complete", busy, onCancel, onSubmit }) => {
  const isRework = mode === "rework";
  const isSubmit = mode === "submit"; // the assignee sends the task for Review
  const [score, setScore] = useState(8);
  const [comment, setComment] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const subtasks = checklistProgress(task);
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  const checklistDone = checklist.filter((c) => c?.done).length;
  const attachments = Array.isArray(task.attachments) ? task.attachments.length : 0;
  const details = [
    task.referenceId ? ["Task ID", `#${task.referenceId}`] : null,
    ["Assigned to", task.assignedUser || "—"],
    task.assignedByName ? ["Assigned by", task.assignedByName] : null,
    task.priority ? ["Priority", task.priority] : null,
    task.dueDate ? ["Due", `${task.dueDate}${task.dueTime ? ` · ${to12h(task.dueTime)}` : ""}`] : null,
    subtasks.total ? ["Subtasks", `${subtasks.done}/${subtasks.total} done`] : null,
    checklist.length ? ["Checklist", `${checklistDone}/${checklist.length} done`] : null,
    attachments ? ["Attachments", String(attachments)] : null,
    task.reworkCount ? ["Reworks so far", String(task.reworkCount)] : null,
  ].filter(Boolean);

  const trimmed = comment.trim();
  const missing = (isRework || isSubmit) && !trimmed;
  const addTag = (tag) =>
    setComment((c) => (c.includes(tag) ? c : `${c.trim() ? `${c.trim()}\n` : ""}• ${tag}`));
  const submit = () => {
    setTouched(true);
    if (missing) return;
    onSubmit(isRework || isSubmit ? undefined : score, trimmed);
  };

  return createPortal(
    <div style={styles.scoreOverlay} onClick={() => !busy && onCancel()}>
      <div
        style={{ ...styles.scoreModal, width: "min(460px, 100%)", maxHeight: "92vh", overflowY: "auto" }}
        role="dialog"
        aria-modal="true"
        aria-label={isSubmit ? "Send for review" : isRework ? "Send back for rework" : "Give a score"}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 34, lineHeight: 1 }}>{isSubmit ? "📝" : isRework ? "↺" : "⭐"}</div>
        <h3 style={{ margin: "8px 0 4px", fontSize: 18, color: colors.text }}>
          {isSubmit ? "Send for review" : isRework ? "Send back for rework" : "Review & give a score"}
        </h3>
        <p style={{ margin: 0, fontSize: 12.5, color: colors.muted }}>
          {isSubmit
            ? `“${task.name}” · ${task.assignedByName || "the person who assigned it"} will read your comment before reviewing`
            : `“${task.name}” · ${task.assignedUser || "the assignee"} ${isRework ? "will see your comment" : "earns this many points"}`}
        </p>

        {details.length > 0 && (
          <div style={styles.reviewDetails}>
            {details.map(([k, v]) => (
              <div key={k} style={styles.reviewDetailItem}>
                <span style={{ color: colors.muted }}>{k}</span>
                <strong style={{ color: colors.text }}>{v}</strong>
              </div>
            ))}
          </div>
        )}

        {!isRework && !isSubmit && (
          <>
            <div style={styles.scoreQuick}>
              {[6, 8, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScore(n)}
                  style={{ ...styles.scoreQuickBtn, ...(score === n ? styles.scoreQuickActive : {}) }}
                  aria-pressed={score === n}
                >
                  <strong style={{ fontSize: 22 }}>{n}</strong>
                  <span style={{ fontSize: 10.5 }}>{SCORE_LABELS[n]}</span>
                </button>
              ))}
            </div>

            <div style={styles.scoreAll} role="radiogroup" aria-label="Score from 1 to 10">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={score === n}
                  onClick={() => setScore(n)}
                  style={{ ...styles.scoreDot, ...(score === n ? styles.scoreDotActive : {}) }}
                >
                  {n}
                </button>
              ))}
            </div>

            <div style={{ margin: "12px 0 4px", fontSize: 13, color: colors.text }}>
              <strong style={{ fontSize: 26, color: "#0b8f87" }}>{score}</strong>/10 · {SCORE_LABELS[score]} · +{score} points
            </div>
          </>
        )}

        <div style={{ textAlign: "left", marginTop: 14 }}>
          <label htmlFor="review-comment" style={{ fontSize: 12.5, fontWeight: 700, color: colors.text }}>
            {isSubmit ? "Comment for the reviewer" : "Review comment"} {isRework || isSubmit ? <span style={{ color: "#B42318" }}>*</span> : <span style={{ color: colors.muted, fontWeight: 500 }}>(optional)</span>}
          </label>
          <div style={styles.reviewTags}>
            {REVIEW_COMMENT_TAGS[isSubmit ? "submit" : isRework ? "rework" : "complete"].map((tag) => (
              <button key={tag} type="button" onClick={() => addTag(tag)} style={styles.reviewTag}>
                + {tag}
              </button>
            ))}
          </div>
          <textarea
            id="review-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 2000))}
            rows={4}
            autoFocus={isRework || isSubmit}
            placeholder={
              isSubmit
                ? "What did you finish? Mention the important points — work done, files attached, anything the reviewer should check."
                : isRework
                ? `What should ${task.assignedUser || "the assignee"} fix or redo? Mention the subtasks, files or points that need work.`
                : `Feedback for ${task.assignedUser || "the assignee"} — what went well, anything to improve next time.`
            }
            style={{ ...styles.reviewTextarea, borderColor: touched && missing ? "#F04438" : "#dcebef" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4 }}>
            <span style={{ color: "#B42318" }}>{touched && missing ? (isSubmit ? "Please write a comment for the reviewer." : "Please write what needs rework.") : ""}</span>
            <span style={{ color: colors.muted }}>{comment.length}/2000 · shown to {isSubmit ? task.assignedByName || "the reviewer" : task.assignedUser || "the assignee"}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14 }}>
          <button type="button" onClick={onCancel} disabled={busy} style={{ ...styles.reviewButton, color: colors.muted, background: "#fff", borderColor: colors.border, height: 38, padding: "0 16px" }}>
            Cancel
          </button>
          {isSubmit ? (
            <button type="button" onClick={submit} disabled={busy} style={{ ...styles.reviewButton, color: "#fff", background: "#1677A8", borderColor: "#1677A8", height: 38, padding: "0 18px", opacity: busy ? 0.6 : 1 }}>
              <Eye size={15} /> {busy ? "Sending..." : "Send for review"}
            </button>
          ) : isRework ? (
            <button type="button" onClick={submit} disabled={busy} style={{ ...styles.reviewButton, ...styles.reviewRework, height: 38, padding: "0 18px", opacity: busy ? 0.6 : 1 }}>
              <RotateCcw size={15} /> {busy ? "Sending..." : "Send for rework"}
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={busy} style={{ ...styles.reviewButton, ...styles.reviewApprove, height: 38, padding: "0 18px", opacity: busy ? 0.6 : 1 }}>
              <BadgeCheck size={15} /> {busy ? "Saving..." : `Approve with ${score}/10`}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

// 💬 Comment thread on a task — the assigned person and the person who assigned it
// both see every comment (send-for-review notes, review / rework comments, replies)
// and either of them can add one at any time; the other person is notified.
const COMMENT_KIND = {
  comment: { label: "", color: "#38546a", bg: "#F7FBFC", border: "#dcebef" },
  submitted: { label: "Sent for review", color: "#1d4ed8", bg: "#EEF6FF", border: "#BFDBFE" },
  completed: { label: "Approved", color: "#166534", bg: "#F0FDF4", border: "#BBF7D0" },
  rework: { label: "Rework requested", color: "#92400e", bg: "#FFF8EB", border: "#F5C77E" },
};

const TaskComments = ({ task, onChanged }) => {
  const me = getSessionUser();
  const myId = String(me?._id || me?.id || "");
  const list = (Array.isArray(task?.reviewComments) ? task.reviewComments : []).filter((c) => c?.text);
  const [open, setOpen] = useState(list.length > 0);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const canWrite =
    String(task?.assignedTo || "") === myId ||
    reviewRoleOf(task).isAssigner ||
    ["Admin", "SuperAdmin", "Manager"].includes(me?.role);
  if (!list.length && !canWrite) return null;

  const otherPerson =
    String(task?.assignedTo || "") === myId
      ? task?.assignedByName || "the person who assigned it"
      : task?.assignedUser || "the assigned person";

  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setError("");
    try {
      await api.post(`/tasks/${task.id}/comments`, { text: value });
      setText("");
      setOpen(true);
      await onChanged?.();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Could not add the comment.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={styles.commentBox}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={styles.commentToggle} aria-expanded={open}>
        <FileText size={13} />
        Comments ({list.length})
        {!open && list.length > 0 && (
          <span style={{ fontWeight: 500, color: colors.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
            · {list[list.length - 1].byName || "Someone"}: {list[list.length - 1].text}
          </span>
        )}
        {open ? <ChevronUp size={13} style={{ marginLeft: "auto" }} /> : <ChevronDown size={13} style={{ marginLeft: "auto" }} />}
      </button>

      {open && (
        <div style={{ padding: "4px 10px 10px" }}>
          {list.length === 0 && (
            <div style={{ fontSize: 11.5, color: colors.muted, padding: "4px 0 8px" }}>No comments yet.</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {list.map((c, i) => {
              const kind = COMMENT_KIND[c.decision] || COMMENT_KIND.comment;
              const mine = String(c.by || "") === myId;
              return (
                <div
                  key={c._id || i}
                  style={{
                    ...styles.commentItem,
                    alignSelf: mine ? "flex-end" : "flex-start",
                    background: kind.bg,
                    borderColor: kind.border,
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 11 }}>
                    <strong style={{ color: colors.text }}>{mine ? "You" : c.byName || "Someone"}</strong>
                    {kind.label && (
                      <span style={{ ...styles.commentKind, color: kind.color, borderColor: kind.border }}>
                        {kind.label}
                        {c.decision === "completed" && c.score ? ` · ${c.score}/10` : ""}
                      </span>
                    )}
                    {c.at && <span style={{ color: colors.muted }}>{formatDateTime(c.at)}</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: colors.text, whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 2 }}>
                    {c.text}
                  </div>
                </div>
              );
            })}
          </div>

          {canWrite && (
            <div style={{ marginTop: 8 }}>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 2000))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
                }}
                rows={2}
                placeholder={`Write a comment for ${otherPerson}...`}
                style={styles.reviewTextarea}
                disabled={sending}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: error ? "#B42318" : colors.muted }}>
                  {error || `Seen by ${task?.assignedUser || "the assignee"} and ${task?.assignedByName || "the assigner"}`}
                </span>
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || !text.trim()}
                  style={{
                    ...styles.reviewButton,
                    marginLeft: "auto",
                    color: "#fff",
                    background: "#1677A8",
                    borderColor: "#1677A8",
                    opacity: sending || !text.trim() ? 0.5 : 1,
                  }}
                >
                  {sending ? "Sending..." : "Comment"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Under a task card: review buttons for the assigner, "waiting for review" for the assignee,
// and the last rework reason while the task is being reworked
const ReviewInfo = ({ task, onReview, busy }) => {
  const role = reviewRoleOf(task);
  const status = normalizeStatus(task.status);
  const last = task.statusHistory?.[task.statusHistory.length - 1];
  const reworkNote = last?.note && /^Rework requested/.test(last.note) && status !== "Completed" && status !== "Review" ? last.note : "";

  if (role.canReview && onReview) {
    return (
      <div style={{ padding: "0 16px 14px" }}>
        <div style={{ ...styles.reviewNote, background: "#EEF6FF", color: "#1d4ed8", marginTop: 0 }}>
          <Eye size={13} /> {task.assignedUser || "The assignee"} finished this task — review it and approve or send it back.
        </div>
        <ReviewActions task={task} onReview={onReview} busy={busy} />
      </div>
    );
  }
  if (status === "Review" && !role.isAssigner) {
    return (
      <div style={{ padding: "0 16px 14px" }}>
        <div style={{ ...styles.reviewNote, background: "#F5F3FF", color: "#6d28d9", marginTop: 0 }}>
          <Clock3 size={13} /> Waiting for {task.assignedByName || "the person who assigned it"} to review and mark it completed.
        </div>
      </div>
    );
  }
  if (status === "Completed" && task.reviewScore) {
    return (
      <div style={{ padding: "0 16px 14px" }}>
        <div style={{ ...styles.reviewNote, background: "#EAF8F1", color: "#17724A", marginTop: 0 }}>
          <BadgeCheck size={13} /> Scored <strong>{task.reviewScore}/10</strong>
          {task.assignedByName ? ` by ${task.assignedByName}` : ""} · +{task.reviewScore} points
        </div>
      </div>
    );
  }
  if (reworkNote) {
    const comment = latestReviewComment(task);
    const hasComment = comment?.decision === "rework" && comment.text;
    return (
      <div style={{ padding: "0 16px 14px" }}>
        <div style={{ ...styles.reviewNote, background: "#FFF8EB", color: "#b45309", marginTop: 0 }}>
          <RotateCcw size={13} /> {hasComment ? `Rework requested by ${comment.byName || task.assignedByName || "the reviewer"}` : reworkNote}
          {task.reworkCount > 1 ? ` (rework #${task.reworkCount})` : ""}
        </div>
      </div>
    );
  }
  return null;
};

// "Approve & complete" / "Rework" buttons for the assigner of a task in Review
const ReviewActions = ({ task, onReview, busy, compact = false }) => (
  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: compact ? 0 : 10 }}>
    <button
      type="button"
      onClick={() => onReview(task, "complete")}
      disabled={busy}
      style={{ ...styles.reviewButton, ...styles.reviewApprove, opacity: busy ? 0.6 : 1 }}
      title={`Approve, give a score 1–10 and mark completed — ${task.assignedUser || "the assignee"} earns that many points`}
    >
      <BadgeCheck size={13} /> {compact ? "Approve" : "Approve & complete"}
    </button>
    <button
      type="button"
      onClick={() => onReview(task, "rework")}
      disabled={busy}
      style={{ ...styles.reviewButton, ...styles.reviewRework, opacity: busy ? 0.6 : 1 }}
      title="Send back to the assignee for rework"
    >
      <RotateCcw size={13} /> Rework
    </button>
  </div>
);

const priorityConfig = {
  Low: {
    icon: ArrowDown,
    color: "#2F6F91",
    background: "#EEF7FA",
  },

  Medium: {
    icon: Minus,
    color: "#B7791F",
    background: "#FFF7E6",
  },

  High: {
    icon: ArrowUp,
    color: "#C65D38",
    background: "#FFF0EA",
  },

  Critical: {
    icon: ShieldAlert,
    color: "#A83C55",
    background: "#FDECEF",
  },
};

// Quick filters opened from the Dashboard (?due=overdue …) — same rules as the Dashboard cards
const endOfDueDay = (t) => new Date(`${t.dueDate}T23:59:59`);
const QUICK_FILTERS = {
  overdue: {
    label: "Overdue",
    test: (t) => Boolean(t.dueDate) && normalizeStatus(t.status) !== "Completed" && endOfDueDay(t) < new Date(),
  },
  soon: {
    label: "Due in 3 days",
    test: (t) => {
      if (!t.dueDate || normalizeStatus(t.status) === "Completed") return false;
      const diff = endOfDueDay(t) - new Date();
      return diff >= 0 && diff <= 3 * 24 * 60 * 60 * 1000;
    },
  },
  today: {
    label: "Due today",
    test: (t) => {
      if (!t.dueDate) return false;
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      return t.dueDate === today;
    },
  },
  unassigned: { label: "Unassigned", test: (t) => !t.assignedUser },
  recurring: { label: "Recurring", test: (t) => Boolean(t.recurring) },
};

// "17:30" → "5:30 PM" for display (tasks store 24-hour HH:MM)
const to12h = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ""));
  if (!m) return hhmm || "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
};

const statusConfig = {
  "To Do": {
    color: "#54758F",
    background: "#EEF5F8",
    soft: "#F5FAFC",
    icon: Circle,
    progress: 0,
    description: "Ready to start",
  },

  "In Progress": {
    color: "#247DA6",
    background: "#EAF5FA",
    soft: "#F3FAFD",
    icon: Clock3,
    progress: 48,
    description: "Currently active",
  },

  Review: {
    color: "#A66B24",
    background: "#FFF6E7",
    soft: "#FFFBF3",
    icon: Eye,
    progress: 76,
    description: "Awaiting review",
  },

  Completed: {
    color: "#188A75",
    background: "#E9F8F4",
    soft: "#F2FCF9",
    icon: CheckCircle2,
    progress: 100,
    description: "Successfully completed",
  },
};

/* =========================================================
   GLOBAL CSS
========================================================= */

const globalCss = `
@keyframes ts-spin {
  to { transform: rotate(360deg); }
}

@keyframes ts-float {
  0%,100% {
    transform: translate3d(0,0,0) rotate(0deg);
  }

  50% {
    transform: translate3d(0,-18px,0) rotate(5deg);
  }
}

@keyframes ts-rise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes ts-pop {
  0% {
    opacity: 0;
    transform: scale(.94);
  }

  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes ts-glow {
  0%,100% {
    opacity: .45;
  }

  50% {
    opacity: 1;
  }
}

@keyframes ts-wave {
  0% {
    transform: translateX(-10%) translateY(0);
  }

  50% {
    transform: translateX(5%) translateY(-8px);
  }

  100% {
    transform: translateX(-10%) translateY(0);
  }
}

@keyframes ts-flow-wave {
  to {
    stroke-dashoffset: -.115;
  }
}

@keyframes ts-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(22,166,184,.25);
  }

  70% {
    box-shadow: 0 0 0 12px rgba(22,166,184,0);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(22,166,184,0);
  }
}

@keyframes ts-shimmer {
  0% {
    transform: translateX(-120%);
  }

  100% {
    transform: translateX(120%);
  }
}

@keyframes ts-status {
  0% {
    transform: scaleX(.2);
    opacity: .35;
  }

  100% {
    transform: scaleX(1);
    opacity: 1;
  }
}

.task-page-unique {
  font-family:
    "Inter",
    "Segoe UI",
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    sans-serif;
}

.task-page-unique button,
.task-page-unique input,
.task-page-unique select,
.task-page-unique textarea {
  font-family: inherit;
}

.ts-floating-dot {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  background:
    radial-gradient(
      circle at 30% 25%,
      rgba(255,255,255,.95),
      rgba(255,255,255,.08)
    );
  opacity: .3;
  animation:
    ts-float 6s ease-in-out infinite;
}

.ts-hero-grid {
  position: absolute;
  inset: 0;
  opacity: .12;
  pointer-events: none;
  background-image:
    linear-gradient(
      rgba(255,255,255,.2) 1px,
      transparent 1px
    ),
    linear-gradient(
      90deg,
      rgba(255,255,255,.2) 1px,
      transparent 1px
    );
  background-size: 30px 30px;
  mask-image: linear-gradient(
    90deg,
    transparent,
    black,
    transparent
  );
}

.ts-wave-line {
  position: absolute;
  left: -10%;
  right: -10%;
  bottom: -24px;
  height: 70px;
  border-radius: 50%;
  border-top: 1px solid rgba(255,255,255,.18);
  animation: ts-wave 8s ease-in-out infinite;
}

.ts-stat-card {
  position: relative;
  overflow: hidden;
  animation:
    ts-rise .55s ease both;
  transition:
    transform .25s ease,
    box-shadow .25s ease,
    border-color .25s ease;
}

.ts-stat-card:hover {
  transform:
    translateY(-6px)
    scale(1.01);
  box-shadow:
    0 20px 42px
    rgba(18,59,93,.13);
}

.ts-stat-card::after {
  content: "";
  position: absolute;
  top: 0;
  left: -100%;
  width: 60%;
  height: 100%;
  background:
    linear-gradient(
      90deg,
      transparent,
      rgba(255,255,255,.7),
      transparent
    );
  transform: skewX(-18deg);
  transition: none;
  pointer-events: none;
}

.ts-stat-card:hover::after {
  animation:
    ts-shimmer .8s ease;
}

.ts-stat-orb {
  position: absolute;
  width: 130px;
  height: 130px;
  right: -44px;
  top: -48px;
  border-radius: 50%;
  background: var(--stat-soft);
}

.ts-stat-orb-two {
  position: absolute;
  width: 72px;
  height: 72px;
  right: 38px;
  bottom: -30px;
  border-radius: 50%;
  background: var(--stat-soft);
}

.ts-stat-watermark {
  position: absolute;
  right: 12px;
  bottom: 4px;
  opacity: .07;
  color: var(--stat-accent);
  pointer-events: none;
}

.ts-stat-progress {
  position: relative;
}

.ts-stat-progress::after {
  content: "";
  position: absolute;
  inset: 0;
  width: 45%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255,255,255,.72),
    transparent
  );
  transform: translateX(-120%);
  animation: ts-shimmer 2.8s ease-in-out infinite;
  pointer-events: none;
}

.ts-pipeline-wave {
  position: relative;
}

.ts-pipeline-wave-svg {
  width: 100%;
  height: 32px;
  overflow: visible;
}

.ts-pipeline-wave-svg path {
  fill: none;
  stroke: #8ACFDB;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: .08 .035;
  animation: ts-flow-wave 2.6s linear infinite;
  filter: drop-shadow(0 2px 4px rgba(22,166,184,.18));
}

.ts-search-card,
.ts-workspace-card {
  animation:
    ts-rise .55s ease both;
}

.ts-task-card {
  animation:
    ts-rise .48s ease both;
  transition:
    transform .22s ease,
    box-shadow .22s ease,
    border-color .22s ease;
}

.ts-task-card:hover {
  transform:
    translateY(-4px)
    translateX(2px);
  box-shadow:
    0 16px 34px
    rgba(18,59,93,.12);
}

.ts-task-card:hover .ts-task-accent {
  width: 6px !important;
}

.ts-task-accent {
  transition:
    width .25s ease;
}

.ts-pipeline {
  animation:
    ts-rise .55s ease both;
}

.ts-pipeline-step {
  transition:
    transform .2s ease,
    box-shadow .2s ease;
}

.ts-pipeline-step:hover {
  transform: translateY(-3px);
}

.ts-pipeline-dot {
  animation:
    ts-pulse 2.5s infinite;
}

.ts-modal {
  animation:
    ts-pop .25s ease both;
}

.ts-modal-content {
  animation:
    ts-rise .3s ease both;
}

.ts-action-button {
  transition:
    transform .18s ease,
    box-shadow .18s ease;
}

.ts-action-button:hover {
  transform: translateY(-2px);
}

.ts-refresh:hover {
  transform: rotate(180deg);
}

.ts-refresh {
  transition:
    transform .45s ease,
    background .2s ease;
}

@media (max-width: 900px) {
  .ts-task-right {
    width: 100% !important;
    justify-content: flex-start !important;
  }
}

@media (max-width: 650px) {
  .ts-page {
    padding: 14px !important;
  }

  .ts-hero {
    padding: 22px !important;
  }

  .ts-hero-title {
    font-size: 21px !important;
  }

  .ts-pipeline {
    overflow-x: auto;
  }

  .ts-pipeline-track {
    min-width: 650px;
  }

  .ts-task-main {
    flex-direction: column !important;
  }

  .ts-task-right {
    flex-direction: row !important;
  }

  .ts-modal-overlay {
    padding: 8px !important;
  }

  .ts-modal {
    max-height: 96vh !important;
  }
}
`;

/* =========================================================
   STYLES
========================================================= */

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at 5% 0%, rgba(22,166,184,.08), transparent 25%), #F2F8FA",
    padding: "24px 28px 60px",
    boxSizing: "border-box",
  },

  hero: {
    position: "relative",
    overflow: "hidden",
    background:
      "linear-gradient(125deg, #071F34 0%, #0B3553 42%, #123B5D 72%, #1677A8 125%)",
    borderRadius: 24,
    padding: "28px 30px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    color: colors.white,
    boxShadow:
      "0 24px 55px rgba(8,42,69,.28)",
    marginBottom: 18,
    flexWrap: "wrap",
    gap: 18,
    minHeight: 110,
  },

  heroLeft: {
    display: "flex",
    alignItems: "center",
    gap: 15,
    zIndex: 2,
  },

  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 15,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "linear-gradient(135deg, rgba(255,255,255,.2), rgba(255,255,255,.07))",
    border:
      "1px solid rgba(255,255,255,.24)",
    boxShadow:
      "0 8px 24px rgba(0,0,0,.15)",
  },

  heroTitle: {
    margin: 0,
    fontSize: 26,
    fontWeight: 850,
    letterSpacing: .2,
  },

  heroSubtitle: {
    margin: "5px 0 0",
    fontSize: 13,
    opacity: .78,
    maxWidth: 620,
  },

  heroBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    marginTop: 9,
    padding: "5px 9px",
    borderRadius: 999,
    background: "rgba(255,255,255,.09)",
    border:
      "1px solid rgba(255,255,255,.13)",
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: .6,
  },

  heroLineGlow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    background:
      "linear-gradient(90deg, transparent, #16A6B8, #8DE7F0, #16A6B8, transparent)",
    animation:
      "ts-glow 3s ease-in-out infinite",
  },

  newTaskButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background:
      "linear-gradient(135deg, #16A6B8, #08798C)",
    color: colors.white,
    border: "none",
    borderRadius: 13,
    padding: "12px 19px",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow:
      "0 10px 25px rgba(22,166,184,.34)",
    zIndex: 2,
  },

  workspaceError: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "#FFF1F0",
    border: "1px solid #FFCCC7",
    color: "#A83C55",
    borderRadius: 13,
    padding: "12px 16px",
    marginBottom: 16,
    fontSize: 13,
    fontWeight: 650,
    flexWrap: "wrap",
  },

  retryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto",
    background: colors.white,
    border: "1px solid #FFCCC7",
    color: "#A83C55",
    borderRadius: 9,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 750,
    cursor: "pointer",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 14,
    marginBottom: 16,
  },

  statCard: {
    position: "relative",
    background: colors.white,
    border:
      `1px solid ${colors.border}`,
    borderRadius: 18,
    padding: "17px 17px 15px",
    boxShadow:
      "0 8px 22px rgba(18,59,93,.055)",
  },

  statTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 9,
  },

  statLabelWrap: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 10,
    fontWeight: 850,
    letterSpacing: 1.05,
    color: colors.muted,
  },

  statLabelDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background:
      "var(--stat-accent)",
  },

  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  statValueRow: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    marginBottom: 10,
  },

  statValue: {
    fontSize: 31,
    fontWeight: 850,
    color: colors.text,
    lineHeight: 1,
  },

  statMiniBadge: {
    fontSize: 9.5,
    fontWeight: 850,
    padding: "4px 8px",
    borderRadius: 999,
    letterSpacing: .4,
  },

  quickChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 10px",
    borderRadius: 999,
    border: `1px solid ${colors.border}`,
    background: "#EAF5FA",
    color: colors.navy,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },

  statProgress: {
    width: "100%",
    height: 7,
    borderRadius: 999,
    marginBottom: 9,
    background: "#E4F3F7",
    overflow: "hidden",
    boxShadow: "inset 0 1px 2px rgba(8,42,69,.06)",
  },

  statProgressFill: {
    display: "block",
    height: "100%",
    borderRadius: 999,
    transition:
      "width .7s cubic-bezier(.2,.8,.2,1)",
    boxShadow:
      "0 2px 8px rgba(22,166,184,.20)",
  },

  statDescription: {
    margin: 0,
    fontSize: 11.5,
    color: colors.muted,
    fontWeight: 650,
  },

  pipeline: {
    background:
      "linear-gradient(135deg, #FFFFFF, #F6FCFD)",
    border:
      `1px solid ${colors.border}`,
    borderRadius: 18,
    padding: "13px 16px",
    marginBottom: 16,
    boxShadow:
      "0 7px 20px rgba(18,59,93,.045)",
    overflow: "hidden",
  },

  pipelineHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 11,
  },

  pipelineTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 850,
    color: colors.text,
  },

  pipelineHint: {
    fontSize: 10.5,
    color: colors.muted,
    fontWeight: 650,
  },

  pipelineTrack: {
    display: "flex",
    alignItems: "center",
    minWidth: 560,
  },

  pipelineStep: {
    display: "flex",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },

  pipelineStepInner: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    minWidth: 0,
  },

  pipelineDot: {
    width: 25,
    height: 25,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    border: "3px solid #FFFFFF",
  },

  pipelineLabel: {
    fontSize: 10.5,
    fontWeight: 800,
    color: colors.text,
    whiteSpace: "nowrap",
  },

  pipelineWave: {
    flex: 1,
    minWidth: 38,
    height: 32,
    margin: "0 5px",
    display: "flex",
    alignItems: "center",
    overflow: "hidden",
    pointerEvents: "none",
  },

  filterCard: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: colors.white,
    border:
      `1px solid ${colors.border}`,
    borderRadius: 16,
    padding: "11px 13px",
    marginBottom: 17,
    flexWrap: "wrap",
    boxShadow:
      "0 6px 18px rgba(18,59,93,.05)",
  },

  searchWrapper: {
    flex: "1 1 280px",
    display: "flex",
    alignItems: "center",
    gap: 9,
    background:
      "#EFF8FB",
    borderRadius: 10,
    padding: "9px 12px",
    color: colors.muted,
    border:
      "1px solid transparent",
  },

  searchInput: {
    flex: 1,
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: 13,
    color: colors.text,
  },

  filterSelectWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    color: colors.muted,
  },

  filterSelect: {
    appearance: "none",
    WebkitAppearance: "none",
    border:
      `1px solid ${colors.border}`,
    borderRadius: 10,
    background: colors.white,
    color: colors.text,
    fontSize: 12.5,
    fontWeight: 650,
    padding: "9px 31px 9px 11px",
    cursor: "pointer",
    outline: "none",
  },

  taskContainer: {
    background: colors.white,
    border:
      `1px solid ${colors.border}`,
    borderRadius: 20,
    padding: 19,
    boxShadow:
      "0 9px 26px rgba(18,59,93,.06)",
  },

  taskHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 16,
    flexWrap: "wrap",
  },

  taskTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 850,
    color: colors.text,
  },

  taskDescription: {
    margin: "4px 0 0",
    fontSize: 11.5,
    color: colors.muted,
    fontWeight: 650,
  },

  taskToolbar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  refreshButton: {
    width: 35,
    height: 35,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border:
      `1px solid ${colors.border}`,
    background: colors.white,
    color: colors.blue,
    cursor: "pointer",
  },

  viewSwitcher: {
    display: "flex",
    background: colors.blueLight,
    borderRadius: 10,
    padding: 3,
    gap: 3,
  },

  viewButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    border: "none",
    background: "transparent",
    color: colors.muted,
    fontSize: 11.5,
    fontWeight: 750,
    padding: "7px 10px",
    borderRadius: 8,
    cursor: "pointer",
  },

  viewButtonActive: {
    background: colors.white,
    color: colors.blue,
    boxShadow:
      "0 2px 8px rgba(18,59,93,.10)",
  },

  smallCreateButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: colors.navy,
    color: colors.white,
    border: "none",
    borderRadius: 10,
    padding: "9px 14px",
    fontSize: 12.5,
    fontWeight: 750,
    cursor: "pointer",
  },

  tasksLoading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "55px 0",
    color: colors.muted,
    fontWeight: 700,
  },

  emptyState: {
    textAlign: "center",
    padding: "48px 16px",
  },

  emptyIcon: {
    width: 68,
    height: 68,
    margin: "0 auto 14px",
    borderRadius: 21,
    background:
      "linear-gradient(135deg, #E6F4FA, #E7F8FA)",
    color: colors.blue,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow:
      "0 12px 25px rgba(22,166,184,.10)",
  },

  emptyTitle: {
    margin: "0 0 6px",
    fontSize: 17,
    fontWeight: 850,
    color: colors.text,
  },

  emptyText: {
    margin: "0 0 18px",
    fontSize: 13,
    color: colors.muted,
  },

  emptyButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background:
      "linear-gradient(135deg, #16A6B8, #08798C)",
    color: colors.white,
    border: "none",
    borderRadius: 11,
    padding: "11px 18px",
    fontSize: 13,
    fontWeight: 750,
    cursor: "pointer",
  },

  taskList: {
    display: "flex",
    flexDirection: "column",
    gap: 11,
  },

  columnBoard: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(245px, 1fr))",
    gap: 13,
  },

  boardColumn: {
    background:
      "linear-gradient(180deg, #F7FBFC, #F1F8FA)",
    border:
      `1px solid ${colors.border}`,
    borderRadius: 15,
    padding: 11,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    minHeight: 230,
  },

  boardColumnHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "3px 3px 7px",
  },

  boardColumnTitle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    color: colors.text,
  },

  boardStatusDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
  },

  boardCount: {
    fontSize: 10.5,
    fontWeight: 850,
    background: colors.white,
    border:
      `1px solid ${colors.border}`,
    borderRadius: 999,
    padding: "3px 8px",
    color: colors.muted,
  },

  boardColumnBody: {
    display: "flex",
    flexDirection: "column",
    gap: 9,
  },

  boardEmpty: {
    textAlign: "center",
    fontSize: 11.5,
    color: colors.muted,
    fontWeight: 700,
    padding: "20px 0",
    border:
      `1px dashed ${colors.border}`,
    borderRadius: 10,
  },

  taskCard: {
    position: "relative",
    background: colors.white,
    border:
      `1px solid ${colors.border}`,
    borderRadius: 15,
    boxShadow:
      "0 4px 14px rgba(18,59,93,.045)",
    overflow: "hidden",
  },

  taskCardMain: {
    position: "relative",
    display: "flex",
    gap: 13,
    padding: 14,
    alignItems: "flex-start",
  },

  taskCardMainBoard: {
    flexDirection: "column",
  },

  taskAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    transition:
      "width .25s ease",
  },

  taskCheckbox: {
    width: 35,
    height: 35,
    flexShrink: 0,
    borderRadius: 11,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  taskInfo: {
    flex: 1,
    minWidth: 0,
  },

  taskTopLine: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
    flexWrap: "wrap",
  },

  taskCardTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 850,
    color: colors.text,
    overflowWrap: "anywhere",
  },

  referenceBadge: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: ".03em",
    padding: "3px 9px",
    borderRadius: 999,
    color: colors.blue,
    background: colors.blueLight,
  },

  taskCardDesc: {
    margin: "0 0 9px",
    fontSize: 11.5,
    color: colors.muted,
    lineHeight: 1.45,
    maxWidth: 720,
  },

  boardMiniStatus: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 9.5,
    fontWeight: 850,
    padding: "3px 8px",
    borderRadius: 999,
    border: "1px solid",
    marginBottom: 8,
  },

  taskMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px 13px",
  },

  taskMetaItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 10.5,
    fontWeight: 700,
    color: colors.muted,
  },

  taskRight: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },

  taskRightBoard: {
    justifyContent: "space-between",
    width: "100%",
  },

  statusSelectWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },

  statusSelect: {
    appearance: "none",
    WebkitAppearance: "none",
    border:
      `1px solid ${colors.border}`,
    borderRadius: 9,
    background: colors.white,
    color: colors.text,
    fontSize: 11,
    fontWeight: 750,
    padding: "7px 27px 7px 9px",
    cursor: "pointer",
    outline: "none",
  },

  statusSelectIcon: {
    position: "absolute",
    right: 7,
    pointerEvents: "none",
    color: colors.muted,
  },

  priorityBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 10.5,
    fontWeight: 850,
    padding: "5px 9px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  },

  progressWrap: {
    marginTop: 10,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },

  progressTrack: {
    flex: 1,
    height: 4,
    background: "#EAF1F4",
    borderRadius: 99,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 99,
    transition:
      "width .6s cubic-bezier(.2,.8,.2,1)",
  },

  progressText: {
    fontSize: 9.5,
    fontWeight: 800,
    color: colors.muted,
    minWidth: 29,
    textAlign: "right",
  },

  groupToggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    border: `1px solid ${colors.border}`,
    borderRadius: 999,
    padding: "3px 9px",
    background: colors.white,
    color: colors.ocean,
    fontSize: 10.5,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },

  groupStatusBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    border: "1px solid",
    borderRadius: 9,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  groupPanel: {
    borderTop: `1px dashed ${colors.border}`,
    padding: "10px 14px 12px 62px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },

  groupMainTask: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 10,
    padding: "8px 10px",
    borderRadius: 10,
    background: "#EEF6FF",
    color: "#38546a",
    fontSize: 12,
  },
  groupMemberBlock: { borderBottom: `1px solid ${colors.border}`, paddingBottom: 6 },
  subtaskBox: { padding: "0 4px 4px 44px" },
  subtaskToggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 8px",
    border: `1px solid ${colors.border}`,
    borderRadius: 999,
    background: colors.white,
    color: "#0b6f6a",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  },
  subtaskEmpty: { fontSize: 11.5, color: colors.muted, padding: "4px 2px" },
  subtaskRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "6px 8px",
    marginTop: 4,
    borderRadius: 8,
    background: "#F7FBFC",
  },
  subtaskItemTitle: { fontSize: 12.5, fontWeight: 600, color: colors.text, overflowWrap: "anywhere" },
  subtaskMeta: { display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginTop: 2, fontSize: 10.5, color: colors.muted },
  subtaskMove: {
    height: 26,
    maxWidth: 130,
    padding: "0 6px",
    border: `1px solid ${colors.border}`,
    borderRadius: 7,
    background: colors.white,
    fontSize: 11,
    color: colors.text,
    cursor: "pointer",
  },
  subtaskRemove: {
    width: 26,
    height: 26,
    display: "grid",
    placeItems: "center",
    border: "1px solid #fecaca",
    borderRadius: 7,
    background: colors.white,
    color: "#b91c1c",
    cursor: "pointer",
    flexShrink: 0,
  },
  subtaskAdd: { display: "flex", gap: 6, marginTop: 6 },
  subtaskInput: {
    flex: 1,
    minWidth: 0,
    height: 30,
    padding: "0 10px",
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    fontSize: 12,
    outline: "none",
  },
  subtaskAddBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    height: 30,
    padding: "0 12px",
    border: 0,
    borderRadius: 8,
    background: "#0f9b91",
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  subtaskError: { marginTop: 6, fontSize: 11.5, color: "#b91c1c" },
  groupPanelHead: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 800,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: ".04em",
  },

  groupRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    padding: "8px 10px",
    borderRadius: 11,
    border: `1px solid ${colors.border}`,
    background: colors.white,
  },

  groupPerson: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    flex: "1 1 220px",
  },

  groupAvatar: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 800,
    flexShrink: 0,
  },

  groupName: {
    fontSize: 12.5,
    fontWeight: 800,
    color: colors.text,
  },

  groupDetails: {
    display: "flex",
    flexWrap: "wrap",
    gap: "4px 12px",
    marginTop: 2,
  },

  reviewButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    height: 30,
    padding: "0 11px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    border: "1px solid",
  },
  reviewApprove: { color: "#fff", background: "#16a34a", borderColor: "#16a34a" },
  reviewRework: { color: "#b45309", background: "#FFF8EB", borderColor: "#F5C77E" },
  scoreOverlay: {
    position: "fixed",
    inset: 0,
    zIndex: 10000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    background: "rgba(6,24,38,.55)",
  },
  scoreModal: {
    width: "min(400px, 100%)",
    padding: "24px 20px 20px",
    borderRadius: 18,
    background: "#fff",
    textAlign: "center",
    boxShadow: "0 30px 70px rgba(6,59,70,.3)",
  },
  scoreQuick: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 16 },
  scoreQuickBtn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    padding: "10px 6px",
    borderRadius: 12,
    border: "2px solid #dcebef",
    background: "#f7fbfc",
    color: "#123B5D",
    cursor: "pointer",
  },
  scoreQuickActive: { borderColor: "#0f9b91", background: "#E8F7F8", color: "#0b6f6a" },
  scoreAll: { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 5, marginTop: 12 },
  scoreDot: {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid #dcebef",
    background: "#fff",
    color: "#38546a",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  scoreDotActive: { background: "#0f9b91", borderColor: "#0f9b91", color: "#fff" },
  commentBox: { border: "1px solid #dcebef", borderRadius: 12, background: "#fff" },
  commentToggle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    padding: "8px 10px",
    border: "none",
    background: "transparent",
    color: "#123B5D",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    textAlign: "left",
    minWidth: 0,
  },
  commentItem: { maxWidth: "85%", padding: "7px 10px", borderRadius: 10, border: "1px solid" },
  commentKind: { padding: "1px 7px", borderRadius: 999, border: "1px solid", fontWeight: 700, fontSize: 10.5, background: "#fff" },
  reviewDetails: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 6,
    marginTop: 14,
    padding: 10,
    borderRadius: 12,
    background: "#f7fbfc",
    border: "1px solid #dcebef",
    textAlign: "left",
  },
  reviewDetailItem: { display: "flex", flexDirection: "column", gap: 1, fontSize: 11.5, minWidth: 0 },
  reviewTags: { display: "flex", flexWrap: "wrap", gap: 5, margin: "6px 0 8px" },
  reviewTag: {
    padding: "4px 9px",
    borderRadius: 999,
    border: "1px solid #dcebef",
    background: "#fff",
    color: "#38546a",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  },
  reviewTextarea: {
    width: "100%",
    boxSizing: "border-box",
    padding: "9px 11px",
    borderRadius: 10,
    border: "1px solid #dcebef",
    fontSize: 13,
    fontFamily: "inherit",
    lineHeight: 1.45,
    resize: "vertical",
    outline: "none",
    color: "#123B5D",
  },
  reviewNote: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    padding: "6px 9px",
    borderRadius: 8,
    fontSize: 11.5,
    lineHeight: 1.4,
  },
  groupRowRight: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },

  taskActions: {
    display: "flex",
    alignItems: "center",
    gap: 5,
  },

  editButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 31,
    height: 31,
    borderRadius: 9,
    cursor: "pointer",
    border:
      `1px solid ${colors.border}`,
    background: colors.blueLight,
    color: colors.blue,
  },

  deleteButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 31,
    height: 31,
    borderRadius: 9,
    cursor: "pointer",
    border: "1px solid #F3D4D4",
    background: "#FDF0EF",
    color: "#C0453E",
  },

  /* MODAL */

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background:
      "rgba(5,28,46,.64)",
    backdropFilter: "blur(7px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 9999,
  },

  modal: {
    background: colors.white,
    borderRadius: 22,
    width: "min(780px, 100%)",
    maxHeight: "92vh",
    display: "flex",
    flexDirection: "column",
    boxShadow:
      "0 35px 90px rgba(3,26,43,.42)",
    overflow: "hidden",
  },

  modalHeader: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 23px",
    borderBottom:
      `1px solid ${colors.border}`,
    background:
      "linear-gradient(135deg, #E9F7FB, #F4FCFD)",
    flexShrink: 0,
    overflow: "hidden",
  },

  modalHeaderGlow: {
    position: "absolute",
    width: 180,
    height: 180,
    right: -80,
    top: -100,
    borderRadius: "50%",
    background:
      "rgba(22,166,184,.10)",
  },

  modalTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    position: "relative",
    zIndex: 1,
  },

  modalTitleIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    background:
      "linear-gradient(135deg, #123B5D, #1677A8)",
    color: colors.white,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    boxShadow:
      "0 8px 20px rgba(18,59,93,.2)",
  },

  modalTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 850,
    color: colors.text,
  },

  modalSubtitle: {
    margin: "3px 0 0",
    fontSize: 11.5,
    color: colors.muted,
    fontWeight: 600,
  },

  closeButton: {
    border: "none",
    background: "rgba(255,255,255,.7)",
    color: colors.muted,
    cursor: "pointer",
    padding: 7,
    borderRadius: 9,
    display: "flex",
    position: "relative",
    zIndex: 2,
  },

  modalBody: {
    padding: "20px 23px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 15,
  },

  formGridThree: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 13,
  },

  formGridTwo: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 13,
  },

  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },

  label: {
    fontSize: 11.5,
    fontWeight: 800,
    color: colors.text,
  },

  requiredStar: {
    color: "#C0453E",
  },

  selectWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },

  select: {
    appearance: "none",
    WebkitAppearance: "none",
    width: "100%",
    border:
      `1px solid ${colors.border}`,
    borderRadius: 10,
    background: colors.white,
    color: colors.text,
    fontSize: 13,
    fontWeight: 600,
    padding: "11px 34px 11px 12px",
    cursor: "pointer",
    outline: "none",
    boxSizing: "border-box",
  },

  selectIcon: {
    position: "absolute",
    right: 11,
    pointerEvents: "none",
    color: colors.muted,
  },

  fieldHint: {
    margin: 0,
    fontSize: 10.5,
    color: colors.muted,
    fontWeight: 600,
  },

  textarea: {
    border:
      `1px solid ${colors.border}`,
    borderRadius: 10,
    background: colors.white,
    color: colors.text,
    fontSize: 13,
    padding: "11px 12px",
    outline: "none",
    resize: "vertical",
    fontFamily: "inherit",
  },

  inputIconWrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
  },

  inputWithIcon: {
    width: "100%",
    border:
      `1px solid ${colors.border}`,
    borderRadius: 10,
    background: colors.white,
    color: colors.text,
    fontSize: 13,
    fontWeight: 600,
    padding: "11px 36px 11px 12px",
    outline: "none",
    boxSizing: "border-box",
  },

  fieldIcon: {
    position: "absolute",
    right: 11,
    pointerEvents: "none",
    color: colors.muted,
  },

  input: {
    border:
      `1px solid ${colors.border}`,
    borderRadius: 10,
    background: colors.white,
    color: colors.text,
    fontSize: 13,
    fontWeight: 600,
    padding: "11px 12px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },

  priorityGroup: {
    display: "flex",
    gap: 7,
    flexWrap: "wrap",
  },

  priorityButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    border: "1.5px solid",
    borderRadius: 9,
    padding: "8px 11px",
    fontSize: 11.5,
    cursor: "pointer",
  },

  complexityCard: {
    background:
      "linear-gradient(135deg, #EFF9FC, #E8F7FA)",
    border:
      `1px solid ${colors.border}`,
    borderRadius: 14,
    padding: 15,
  },

  complexityTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  sectionTitle: {
    margin: 0,
    fontSize: 13,
    fontWeight: 850,
    color: colors.text,
  },

  sectionDescription: {
    margin: "2px 0 0",
    fontSize: 10.5,
    color: colors.muted,
    fontWeight: 600,
  },

  scoreValue: {
    textAlign: "right",
    fontSize: 21,
    fontWeight: 850,
    color: colors.blue,
    lineHeight: 1,
  },

  rangeRow: {
    marginBottom: 5,
  },

  range: {
    width: "100%",
    accentColor: colors.ocean,
  },

  rangeLabels: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 9.5,
    color: colors.muted,
    fontWeight: 700,
    marginBottom: 8,
  },

  optionalRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 10,
    color: colors.muted,
    fontWeight: 700,
    background: colors.white,
    borderRadius: 8,
    padding: "7px 10px",
    border:
      `1px solid ${colors.border}`,
  },

  rewardCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    background:
      "linear-gradient(120deg, #E8F9F7, #E7F5FB)",
    border:
      `1px solid ${colors.border}`,
    borderRadius: 14,
    padding: "12px 15px",
    color: colors.text,
    fontSize: 12,
    fontWeight: 650,
    flexWrap: "wrap",
  },

  rewardLeft: {
    display: "flex",
    alignItems: "center",
    gap: 9,
  },

  rewardIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    background: colors.ocean,
    color: colors.white,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  expandCard: {
    border:
      `1px solid ${colors.border}`,
    borderRadius: 14,
    overflow: "hidden",
    background: colors.white,
    // Inside the scrolling flex column an overflow:hidden card may shrink to 0px —
    // that made Attachments / Recurring / Sub-tasks invisible.
    flexShrink: 0,
  },

  expandHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "13px 15px",
    gap: 12,
  },

  expandTitle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: colors.text,
  },

  expandTitleText: {
    display: "flex",
    flexDirection: "column",
  },

  expandTitleMain: {
    fontSize: 12.5,
    fontWeight: 850,
  },

  expandTitleSub: {
    fontSize: 10.5,
    color: colors.muted,
    fontWeight: 600,
  },

  toggle: {
    width: 44,
    height: 24,
    borderRadius: 999,
    border: "none",
    position: "relative",
    cursor: "pointer",
    flexShrink: 0,
  },

  toggleCircle: {
    position: "absolute",
    top: 3,
    left: 3,
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: colors.white,
    transition:
      "transform .2s ease",
    boxShadow:
      "0 1px 4px rgba(0,0,0,.2)",
  },

  recurringBox: {
    padding: "0 15px 15px",
  },

  expandButton: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "13px 15px",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
  },

  expandRight: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    color: colors.muted,
  },

  countBadge: {
    fontSize: 10,
    fontWeight: 800,
    background: colors.blueLight,
    color: colors.blue,
    borderRadius: 999,
    padding: "4px 9px",
    whiteSpace: "nowrap",
  },

  expandedContent: {
    padding: "0 15px 15px",
    display: "flex",
    flexDirection: "column",
    gap: 11,
  },

  uploadBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    border: "1.5px dashed #8CCBD5",
    borderRadius: 15,
    padding: "23px 16px",
    cursor: "pointer",
    color: colors.muted,
    background: "linear-gradient(135deg, #F4FCFD 0%, #EAF8FA 100%)",
    fontSize: 11.5,
    textAlign: "center",
    transition: "border-color .2s ease, transform .2s ease, box-shadow .2s ease",
  },

  fileList: {
    display: "flex",
    flexDirection: "column",
    gap: 7,
  },

  fileItem: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    border:
      `1px solid ${colors.border}`,
    borderRadius: 10,
    padding: "8px 11px",
    color: colors.text,
    fontSize: 11.5,
    fontWeight: 600,
  },

  fileName: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  smallDelete: {
    border: "none",
    background: "#FDF0EF",
    color: "#C0453E",
    borderRadius: 8,
    width: 27,
    height: 27,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
  },

  subtaskInputRow: {
    display: "flex",
    gap: 8,
  },

  addSubtaskButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: colors.navy,
    color: colors.white,
    border: "none",
    borderRadius: 10,
    padding: "0 15px",
    fontSize: 12,
    fontWeight: 750,
    cursor: "pointer",
  },

  subtaskList: {
    display: "flex",
    flexDirection: "column",
    gap: 7,
  },

  subtaskItem: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    border:
      `1px solid ${colors.border}`,
    borderRadius: 10,
    padding: "8px 11px",
  },

  subtaskNumber: {
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: colors.blueLight,
    color: colors.blue,
    fontSize: 10,
    fontWeight: 800,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  subtaskTitle: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: 700,
    color: colors.text,
  },

  modalError: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    margin: "0 23px 14px",
    background: "#FFF1F0",
    border: "1px solid #FFCCC7",
    color: "#A83C55",
    borderRadius: 10,
    padding: "10px 13px",
    fontSize: 11.5,
    fontWeight: 700,
    flexShrink: 0,
  },

  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    padding: "14px 23px",
    borderTop:
      `1px solid ${colors.border}`,
    background: colors.background,
    flexShrink: 0,
  },

  cancelButton: {
    border:
      `1px solid ${colors.border}`,
    background: colors.white,
    color: colors.muted,
    borderRadius: 10,
    padding: "10px 19px",
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
  },

  createButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    background:
      "linear-gradient(120deg, #16A6B8, #1677A8)",
    color: colors.white,
    border: "none",
    borderRadius: 10,
    padding: "10px 20px",
    fontSize: 12.5,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow:
      "0 8px 18px rgba(22,119,168,.22)",
  },

  spinner: {
    animation:
      "ts-spin .9s linear infinite",
  },
};

/* =========================================================
   TASK FORM MODAL
========================================================= */

/* =========================================================
   USER PICKER — dropdown with search, "Select all" and checkboxes
========================================================= */
const UserMultiSelect = ({ users, selected, onChange, selectedDepartments = [] }) => {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const boxRef = useRef(null);
  const searchRef = useRef(null);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const visible = users.filter(
    (u) => !q || `${u.name} ${u.department || ""} ${u.email || ""}`.toLowerCase().includes(q)
  );
  const isOn = (u) => selected.includes(String(u.id));
  const allVisibleOn = visible.length > 0 && visible.every(isOn);

  const toggle = (u) =>
    onChange(isOn(u) ? selected.filter((id) => id !== String(u.id)) : [...selected, String(u.id)]);

  const toggleAll = () =>
    onChange(
      allVisibleOn
        ? selected.filter((id) => !visible.some((u) => String(u.id) === id))
        : Array.from(new Set([...selected, ...visible.map((u) => String(u.id))]))
    );

  const names = selected
    .map((id) => users.find((u) => String(u.id) === id)?.name)
    .filter(Boolean);
  const summary = !selected.length
    ? users.length
      ? "Select users"
      : "No users available"
    : selected.length === users.length && users.length > 1
    ? `All users (${users.length})`
    : names.length <= 2
    ? names.join(", ")
    : `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => users.length && setOpen((v) => !v)}
        disabled={!users.length}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          ...styles.select,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          textAlign: "left",
          cursor: users.length ? "pointer" : "not-allowed",
          color: selected.length ? colors.text : colors.muted,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {selected.length > 0 && (
            <span style={{ background: colors.blueLight, color: colors.blue, borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>
              {selected.length}
            </span>
          )}
          <ChevronDown size={15} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s", color: colors.muted }} />
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: "relative",
            zIndex: 30,
            marginTop: 6,
            background: colors.white,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            boxShadow: "0 14px 34px rgba(18,59,93,.16)",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", borderBottom: `1px solid ${colors.border}` }}>
            <Search size={14} color={colors.muted} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users"
              style={{ border: 0, outline: "none", flex: 1, fontSize: 13, background: "transparent", color: colors.text }}
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" style={{ border: 0, background: "transparent", color: colors.muted, cursor: "pointer", display: "flex" }}>
                <X size={13} />
              </button>
            )}
          </div>

          {visible.length > 0 && (
            <label style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", fontSize: 13, fontWeight: 800, cursor: "pointer", borderBottom: `1px solid ${colors.border}`, background: colors.background }}>
              <input type="checkbox" checked={allVisibleOn} onChange={toggleAll} />
              {q
                ? `Select all matching (${visible.length})`
                : selectedDepartments.length
                  ? `Select all users in selected department${selectedDepartments.length === 1 ? "" : "s"} (${visible.length})`
                  : `Select all users (${visible.length})`}
            </label>
          )}

          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {visible.length === 0 ? (
              <div style={{ padding: "12px", fontSize: 12, color: colors.muted }}>No users match “{query}”.</div>
            ) : (
              visible.map((u) => (
                <label
                  key={u.id}
                  role="option"
                  aria-selected={isOn(u)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    padding: "8px 12px",
                    fontSize: 13,
                    cursor: "pointer",
                    background: isOn(u) ? colors.blueLight : "transparent",
                  }}
                >
                  <input type="checkbox" checked={isOn(u)} onChange={() => toggle(u)} />
                  <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <span style={{ fontWeight: 700, color: colors.text }}>{u.name}</span>
                    {u.email && <span style={{ color: colors.muted, fontSize: 11 }}>{u.email}</span>}
                  </span>
                  {u.department && <span style={{ color: colors.muted, fontSize: 12 }}>— {u.department}</span>}
                </label>
              ))
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", borderTop: `1px solid ${colors.border}`, fontSize: 12, color: colors.muted }}>
            <span>{selected.length} selected</span>
            <span style={{ display: "flex", gap: 6 }}>
              {selected.length > 0 && (
                <button type="button" onClick={() => onChange([])} style={{ border: 0, background: "transparent", color: colors.muted, fontWeight: 700, cursor: "pointer" }}>
                  Clear
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} style={{ border: 0, borderRadius: 8, background: colors.blue, color: colors.white, fontWeight: 800, padding: "5px 12px", cursor: "pointer" }}>
                Done
              </button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// "Make this task recurring" is switched off in the task form for now
const SHOW_RECURRING_OPTION = false;

/* Assign by email: type the receiver's email → they're added as an assignee.
   On save they get the task by email, with buttons to view it and update the status
   (Start working / Send for review) without logging in — updates show here live. */
const AssignByEmail = ({ users = [], onAdd }) => {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState(null); // { ok, text }

  const add = () => {
    const value = email.trim().toLowerCase();
    if (!value) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setNote({ ok: false, text: "Enter a valid email address." });
      return;
    }
    const user = users.find((u) => String(u.email || "").trim().toLowerCase() === value);
    if (!user) {
      setNote({ ok: false, text: "No user in this workspace has this email. Add them in User Management first." });
      return;
    }
    onAdd(String(user.id));
    setEmail("");
    setNote({ ok: true, text: `${user.name} added — the task will be emailed to ${user.email} with update buttons.` });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 4 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setNote(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Or assign by email — receiver@company.com"
          aria-label="Assign the task by email"
          style={{ flex: 1, minWidth: 0, padding: "9px 11px", borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 13, color: colors.text }}
        />
        <button
          type="button"
          onClick={add}
          disabled={!email.trim()}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "0 12px", borderRadius: 10, border: 0, background: colors.blue, color: colors.white, fontWeight: 700, fontSize: 12, cursor: email.trim() ? "pointer" : "not-allowed", opacity: email.trim() ? 1 : 0.55 }}
        >
          <MailOpen size={13} /> Add
        </button>
      </div>
      {note && (
        <span style={{ fontSize: 11.5, fontWeight: 600, color: note.ok ? "#0F6A4A" : "#B42318" }}>{note.text}</span>
      )}
    </div>
  );
};

const TaskFormModal = ({
  onClose,
  onCreate,
  onUpdate,
  editingTask,
  departments,
  users,
}) => {
  const isEdit =
    Boolean(editingTask);

  // Standard task or Monthly Task (monthly target + daily tracking)
  const [taskType, setTaskType] = useState(
    ["monthly", "rework"].includes(editingTask?.taskType) ? editingTask.taskType : "standard"
  );
  const isRework = taskType === "rework";
  const isMonthly = taskType === "monthly";
  const [monthlyConfig, setMonthlyConfig] = useState(() =>
    editingTask?.monthly
      ? {
          startDate: editingTask.monthly.startDate || "",
          endDate: editingTask.monthly.endDate || "",
          target: String(editingTask.monthly.target ?? ""),
          trackingMethod: editingTask.monthly.trackingMethod || "number",
          unitPerCheck: editingTask.monthly.unitPerCheck || 1,
        }
      : defaultMonthlyConfig()
  );

  const [
    taskName,
    setTaskName,
  ] = useState(
    editingTask?.name || ""
  );

  const [
    referenceId,
  ] = useState(
    editingTask?.referenceId || ""
  );

  // ⭐ several departments; the first is the primary one (gives the Task ID)
  const [selectedDepartments, setSelectedDepartments] = useState(
    editingTask?.departments?.length
      ? editingTask.departments
      : editingTask?.department
        ? [editingTask.department]
        : []
  );
  const department = selectedDepartments[0] || "";

  // Rework task → the original task (searchable picker)
  const [reworkRef, setReworkRef] = useState(() =>
    editingTask?.reworkOf
      ? {
          id: editingTask.reworkOf.task,
          referenceId: editingTask.reworkOf.referenceId,
          name: editingTask.reworkOf.name,
          departments: editingTask.reworkOf.departments || [],
        }
      : null
  );

  const [
    assignedUser,
    setAssignedUser,
  ] = useState(
    // ⭐ user IDs (not names) — two people may share a name
    editingTask?.assignedTo ? String(editingTask.assignedTo) : ""
  );

  // Multi-assignee support; keep assignedUser for backward compatibility.
  const initialAssignees = editingTask?.assignedTo
    ? [String(editingTask.assignedTo)]
    : [];
  const [assignedUsers, setAssignedUsers] = useState(initialAssignees);
  const [uploadedFiles, setUploadedFiles] = useState([]);

  const [
    description,
    setDescription,
  ] = useState(
    editingTask?.description || ""
  );

  const [
    dueDate,
    setDueDate,
  ] = useState(
    editingTask?.dueDate || ""
  );

  // Deadline time (reminders: 3h + 1h before, alert at the deadline)
  const [dueTime, setDueTime] = useState(
    editingTask?.dueTime || ""
  );

  // ⭐ start of the task (new tasks start today) + the reminder the assigner picks
  const todayIso = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const [startDate, setStartDate] = useState(editingTask ? editingTask.startDate || "" : todayIso);
  const [startTime, setStartTime] = useState(editingTask?.startTime || "");
  // checklist rows: Desc · Type · Employee
  const [checklist, setChecklist] = useState(
    (editingTask?.checklist || []).map((c) => ({
      _id: c._id,
      desc: c.desc,
      type: c.type || "Check",
      employee: c.employee?.userId ? String(c.employee.userId) : "",
      employeeName: c.employee?.name || "",
    }))
  );

  // one reminder: switch it on, pick the date & time (the message uses the task name)
  const [reminderOn, setReminderOn] = useState(Boolean(editingTask?.reminders?.length));

  // named reminders (stored as a list; the form edits the first one)
  const [reminders, setReminders] = useState(
    (editingTask?.reminders || []).map((r) => ({ _id: r._id, title: r.title, customAt: r.customAt, sentAt: r.sentAt }))
  );

  const [
    priority,
    setPriority,
  ] = useState(
    editingTask?.priority || "Medium"
  );

  const [
    complexity,
  ] = useState(
    editingTask?.complexity ?? 0
  );

  const [
    reward,
    setReward,
  ] = useState(
    editingTask?.reward ?? 10
  );

  const [
    recurring,
    setRecurring,
  ] = useState(
    Boolean(editingTask?.recurring)
  );

  const [
    recurrenceInterval,
    setRecurrenceInterval,
  ] = useState(
    editingTask?.recurrenceInterval ||
      "Every day"
  );

  // Keep the file upload area open by default so users can easily
  // see and attach files while creating or editing a task.
  const [
    showAttachments,
    setShowAttachments,
  ] = useState(true);

  const [
    showSubtasks,
    setShowSubtasks,
  ] = useState(false);

  const [
    attachments,
    setAttachments,
  ] = useState(
    (editingTask?.attachments || []).map(
      normalizeAttachmentForForm
    )
  );

  const [
    subtasks,
    setSubtasks,
  ] = useState(
    (editingTask?.subtasks || []).map(
      normalizeSubtaskForForm
    )
  );

  const [
    subtaskInput,
    setSubtaskInput,
  ] = useState("");

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  useEffect(() => {
    const previous =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.body.style.overflow =
        previous;
    };
  }, []);

  const availableUsers = useMemo(() => {
    if (!selectedDepartments.length) {
      return users;
    }
    const deptKeys = selectedDepartments.map((d) => String(d).trim().toLowerCase());

    const filtered =
      users.filter((user) => {
        const userDepartment =
          typeof user.department ===
          "object"
            ? user.department?.name ||
              user.department
                ?.departmentName ||
              ""
            : user.department || "";

        return deptKeys.includes(
          String(userDepartment)
            .trim()
            .toLowerCase()
        );
      });

    // Keep the current assignee selectable even if outside the filtered list
    if (
      assignedUser &&
      !filtered.some(
        (u) =>
          String(u.id) === String(assignedUser)
      )
    ) {
      const known = users.find((u) => String(u.id) === String(assignedUser));
      return [
        known || {
          id: assignedUser,
          name: editingTask?.assignedUser || "Current assignee",
          department,
        },
        ...filtered,
      ];
    }

    return filtered;
  }, [
    department,
    selectedDepartments,
    users,
    assignedUser,
    editingTask,
  ]);

  const userNameById = (id) =>
    users.find((u) => String(u.id) === String(id))?.name ||
    (String(id) === String(editingTask?.assignedTo) ? editingTask?.assignedUser : "") ||
    "Unknown user";

  // keep only the assignees who are in one of the remaining departments
  const handleDepartmentsChange = (next) => {
    setSelectedDepartments(next);
    const keys = next.map((d) => String(d).trim().toLowerCase());
    const stillValid = (id) => {
      if (!keys.length) return true;
      const u = users.find((x) => String(x.id) === String(id));
      const dept = typeof u?.department === "object" ? u?.department?.name : u?.department;
      return !dept || keys.includes(String(dept).trim().toLowerCase());
    };
    const kept = assignedUsers.filter(stillValid);
    setAssignedUsers(kept);
    setAssignedUser(kept[0] || "");
  };

  // ⭐ Rework: picking the original task fills the form with its details
  // (title, description, departments, priority and the person who did it)
  const handleReworkPick = (original) => {
    setReworkRef(original);
    if (!original || !isRework || isEdit) return;
    if (!taskName.trim()) setTaskName(original.name || "");
    if (!description.trim() && original.description) setDescription(original.description);
    if (original.priority) setPriority(original.priority);
    if (original.departments?.length) setSelectedDepartments(original.departments);
    const known = (original.assigneeIds || []).filter((id) => users.some((u) => String(u.id) === String(id)));
    if (known.length) {
      setAssignedUsers(known);
      setAssignedUser(known[0]);
    }
  };

  // Each person's rework Task ID: original person → TECH14-1, new person → TECH14-DEV1
  const [reworkPreview, setReworkPreview] = useState([]);
  useEffect(() => {
    if (!isRework || isEdit || !reworkRef?.id || !assignedUsers.length) {
      setReworkPreview([]);
      return undefined;
    }
    let cancelled = false;
    api
      .get("/tasks/rework-id-preview", { params: { reworkOf: reworkRef.id, userIds: assignedUsers.join(",") } })
      .then((res) => !cancelled && setReworkPreview(res.data?.data?.people || []))
      .catch(() => !cancelled && setReworkPreview([]));
    return () => {
      cancelled = true;
    };
  }, [isRework, isEdit, reworkRef, assignedUsers]);

  const [dragActive, setDragActive] = useState(false);

  // Validate + add files (from the picker or drag-and-drop)
  const addFiles = (fileList) => {
    const selectedFiles = Array.from(fileList || []);
    if (!selectedFiles.length) return;

    const problems = [];
    const accepted = [];
    const existingKeys = new Set(
      attachments.map((file) => `${file.name}:${file.size}`)
    );

    selectedFiles.forEach((file) => {
      const key = `${file.name}:${file.size}`;
      if (!ATTACHMENT_EXTENSIONS.includes(fileExtension(file.name))) {
        problems.push(`${file.name} is not a supported file type`);
      } else if (file.size > MAX_ATTACHMENT_SIZE) {
        problems.push(`${file.name} is larger than 8 MB`);
      } else if (file.size === 0) {
        problems.push(`${file.name} is empty`);
      } else if (!existingKeys.has(key)) {
        existingKeys.add(key);
        accepted.push(file);
      }
    });

    const room = MAX_ATTACHMENTS - uploadedFiles.length;
    if (accepted.length > room) {
      problems.push(`You can upload at most ${MAX_ATTACHMENTS} new files at once`);
      accepted.splice(Math.max(room, 0));
    }

    setUploadedFiles((previous) => [...previous, ...accepted]);
    setAttachments((previous) => [
      ...previous,
      ...accepted.map((file) => ({
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        existing: false,
      })),
    ]);

    setError(problems.length ? `${problems.join(". ")}.` : "");
  };

  const handleFileChange = (event) => {
    addFiles(event.target.files);
    // Reset the input so the same file can be selected again after removal.
    event.target.value = "";
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    if (!submitting) addFiles(event.dataTransfer.files);
  };

  const addSubtask = () => {
    const value =
      subtaskInput.trim();

    if (!value) return;

    setSubtasks((prev) => [
      ...prev,
      {
        id: Date.now(),
        title: value,
      },
    ]);

    setSubtaskInput("");
  };

  const removeSubtask = (id) => {
    setSubtasks((prev) =>
      prev.filter(
        (item) => item.id !== id
      )
    );
  };

  const removeAttachment = (target) => {
    setAttachments((prev) => prev.filter((item) => item !== target));
    if (!target.existing) {
      setUploadedFiles((prev) =>
        prev.filter(
          (file) => !(file.name === target.name && file.size === target.size)
        )
      );
    }
  };

  const buildPayload = () => ({
    name: taskName.trim(),

    referenceId:
      referenceId.trim(),

    department,

    departments: selectedDepartments,

    ...(reworkRef ? { reworkOf: reworkRef.id } : {}),

    assignedUser: assignedUsers[0] || assignedUser || "",
    assignedUsers,

    description:
      description.trim(),

    // a Monthly Task's due date is set by the server (last day of the month)
    ...(isMonthly ? {} : { dueDate, startDate, startTime }),

    checklist: checklist
      .filter((r) => r.desc.trim() || r.employee)
      .map(({ _id, desc, type, employee }) => ({ ...(_id ? { _id } : {}), desc: desc.trim(), type, employee: employee || null })),

    reminders:
      reminderOn && reminders[0]?.customAt
        ? [
            {
              ...(reminders[0]._id ? { _id: reminders[0]._id } : {}),
              title: taskName.trim() || "Task reminder",
              customAt: reminders[0].customAt,
            },
          ]
        : [],

    dueTime,

    priority,

    taskType,
    ...(isMonthly
      ? {
          monthly: isEdit
            ? {
                target: Number(monthlyConfig.target),
                startDate: monthlyConfig.startDate,
                endDate: monthlyConfig.endDate,
              }
            : {
                startDate: monthlyConfig.startDate,
                endDate: monthlyConfig.endDate,
                target: Number(monthlyConfig.target),
                trackingMethod: monthlyConfig.trackingMethod,
                unitPerCheck: Number(monthlyConfig.unitPerCheck) || 1,
              },
        }
      : {}),

    complexity,

    reward,

    recurring: isMonthly ? false : recurring,

    recurrenceInterval:
      recurring
        ? recurrenceInterval
        : "Every day",

    // Edit: the EXISTING attachments to keep (new files travel as multipart "files")
    ...(isEdit
      ? {
          attachments: attachments
            .filter((file) => file.existing)
            .map((file) => ({ filename: file.filename, name: file.name })),
        }
      : {}),

    subtasks:
      subtasks.map(
        ({ title }) => ({
          title,
        })
      ),

    ...(isEdit
      ? {
          status:
            normalizeStatus(
              editingTask.status
            ),
        }
      : {
          status: "To Do",
        }),
  });

  const handleSubmit = async () => {
    if (submitting) return;

    if (!taskName.trim()) {
      setError(
        "Please enter task name."
      );
      return;
    }

    if (!selectedDepartments.length) {
      setError(
        "Please select at least one department."
      );
      return;
    }

    if (isRework && !reworkRef && !isEdit) {
      setError("Please select the original task for this rework (Rework Reference Task ID).");
      return;
    }

    // ⭐ Every task needs at least one assigned user
    if (!assignedUsers.length) {
      setError("Please assign the task to at least one user.");
      return;
    }

    if (isMonthly) {
      const monthlyError = validateMonthlyConfig(monthlyConfig);
      if (monthlyError) {
        setError(monthlyError);
        return;
      }
    } else if (!dueDate) {
      setError(
        "Please select the end date."
      );
      return;
    } else {
      if (!startDate && !isEdit) {
        setError("Please select the start date.");
        return;
      }
      if (startDate && `${startDate}T${startTime || "00:00"}` > `${dueDate}T${dueTime || "23:59"}`) {
        setError("The start date and time must be before the end.");
        return;
      }
    }

    for (const [i, row] of checklist.entries()) {
      if (!row.desc.trim() && row.employee) {
        setError(`Checklist row ${i + 1}: enter a description.`);
        return;
      }
    }

    if (reminderOn && !reminders[0]?.customAt) {
      setError("Pick the date and time for the reminder, or switch the reminder off.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");

      const payload = buildPayload();
      let requestPayload = payload;

      // Use multipart/form-data when new files are attached so file bytes
      // are sent to the API (the backend route must use multipart middleware).
      if (uploadedFiles.length) {
        requestPayload = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          requestPayload.append(
            key,
            value !== null && typeof value === "object"
              ? JSON.stringify(value)
              : String(value ?? "")
          );
        });
        uploadedFiles.forEach((file) => requestPayload.append("files", file));
      }

      if (isEdit) {
        const updated =
          await updateTaskApi(
            editingTask.id,
            requestPayload
          );

        const doc =
          updated &&
          (updated._id ||
            updated.id)
            ? updated
            : {
                ...editingTask,
                ...payload,
              };

        onUpdate(
          normalizeTask(doc)
        );
      } else {
        const created =
          await createTaskApi(
            requestPayload
          );

        const doc =
          created &&
          (created._id ||
            created.id)
            ? created
            : {
                ...payload,
              };

        onCreate(
          normalizeTask(doc)
        );
      }
    } catch (err) {
      const status =
        err?.response?.status;

      if (status === 401) {
        setError(
          "Session expired. Please log in again."
        );
      } else if (status === 403) {
        setError(
          "You don't have permission to save tasks (403)."
        );
      } else {
        setError(
          err?.response?.data
            ?.message ||
            `Failed to ${
              isEdit
                ? "update"
                : "create"
            } task. Please try again.`
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="ts-modal-overlay"
      style={styles.modalOverlay}
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          if (!submitting) {
            onClose();
          }
        }
      }}
    >
      <div
        className="ts-modal"
        style={styles.modal}
        onMouseDown={(e) =>
          e.stopPropagation()
        }
      >
        {/* HEADER */}

        <div
          style={
            styles.modalHeader
          }
        >
          <div
            style={
              styles.modalHeaderGlow
            }
          />

          <div
            style={
              styles.modalTitleRow
            }
          >
            <div
              style={
                styles.modalTitleIcon
              }
            >
              {isEdit ? (
                <Pencil size={19} />
              ) : (
                <Plus size={19} />
              )}
            </div>

            <div>
              <h2
                style={
                  styles.modalTitle
                }
              >
                {isEdit
                  ? "Edit Task"
                  : "Create New Task"}
              </h2>

              <p
                style={
                  styles.modalSubtitle
                }
              >
                {isEdit
                  ? "Refine your task and keep your workflow moving"
                  : "Build a clear task and assign it to your workspace"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={
              styles.closeButton
            }
            disabled={submitting}
          >
            <X size={19} />
          </button>
        </div>

        {/* BODY */}

        <div
          className="ts-modal-content"
          style={styles.modalBody}
        >
          {/* TASK TYPE */}

          <div style={styles.field}>
            <label style={styles.label}>Task Type</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} role="radiogroup" aria-label="Task type">
              {[
                { key: "standard", label: "Standard Task", hint: "One-off work with a due date" },
                { key: "monthly", label: "Monthly Task", hint: "Target from a start to an end date, tracked daily" },
                { key: "rework", label: "Rework Task", hint: "Redo of an earlier task (pick its Task ID)" },
              ].map((option) => {
                const active = taskType === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={isEdit && !active}
                    title={isEdit && !active ? "The task type can't change after it is created" : option.hint}
                    onClick={() => {
                      if (isEdit) return;
                      setTaskType(option.key);
                      if (option.key !== "rework") setReworkRef(null);
                    }}
                    style={{
                      flex: "1 1 180px",
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: `1px solid ${active ? colors.ocean : colors.border}`,
                      background: active ? colors.oceanSoft : colors.white,
                      color: active ? colors.oceanDark : colors.muted,
                      cursor: isEdit ? "default" : "pointer",
                      opacity: isEdit && !active ? 0.5 : 1,
                    }}
                  >
                    <strong style={{ display: "block", fontSize: 13, color: active ? colors.navy : colors.text }}>{option.label}</strong>
                    <span style={{ fontSize: 11 }}>{option.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={
              styles.formGridThree
            }
          >
            <div style={styles.field}>
              <label
                style={styles.label}
              >
                Task Name{" "}
                <span
                  style={
                    styles.requiredStar
                  }
                >
                  *
                </span>
              </label>

              <input
                value={taskName}
                onChange={(e) =>
                  setTaskName(
                    e.target.value
                  )
                }
                placeholder="Enter task name"
                style={styles.input}
                autoFocus
              />
            </div>

            <div style={styles.field}>
              <label
                style={styles.label}
              >
                Reference ID{" "}
                <span style={{ fontWeight: 500, color: colors.muted, fontSize: 10 }}>
                  {isEdit ? "(fixed)" : "(auto)"}
                </span>
              </label>

              {/* Set by the server from the department's code: FF1, FF2… */}
              <input
                value={
                  isEdit
                    ? referenceId || "—"
                    : isRework && reworkPreview.length
                      ? reworkPreview.map((p) => p.referenceId).join(", ")
                      : departments.find((d) => d.name === department)?.nextReferenceId ||
                      (department ? "Created automatically" : "Select a department first")
                }
                readOnly
                aria-readonly="true"
                title="Reference ID is created automatically from the department's code"
                style={{ ...styles.input, background: colors.background, color: colors.oceanDark, fontWeight: 700, cursor: "default" }}
              />
            </div>

            <div style={styles.field}>
              <label
                style={styles.label}
              >
                Departments{" "}
                <span
                  style={
                    styles.requiredStar
                  }
                >
                  *
                </span>
              </label>

              <DepartmentMultiSelect
                departments={departments}
                selected={selectedDepartments}
                onChange={handleDepartmentsChange}
                inputStyle={styles.select}
                users={users}
              />
            </div>
          </div>

          {/* REWORK REFERENCE TASK ID — only for a Rework Task (required there) */}

          {isRework && (
          <div style={styles.field}>
            <label style={styles.label}>
              Rework Reference Task ID{" "}
              <span style={styles.requiredStar}>*</span>
            </label>
            {isEdit ? (
              <div style={{ ...styles.input, display: "flex", alignItems: "center", background: colors.background, color: reworkRef ? colors.text : colors.muted }}>
                {reworkRef ? `#${reworkRef.referenceId} — ${reworkRef.name}` : "No original task"}
              </div>
            ) : (
              <ReworkReferencePicker value={reworkRef} onChange={handleReworkPick} required inputStyle={styles.input} />
            )}
          </div>
          )}

          {/* ASSIGNED USERS / REASSIGNMENT */}

          <div style={styles.field}>
            <label style={styles.label}>
              {isEdit ? "Reassign Task — Select Users" : "Assign Task — Select Users"}{" "}
              <span style={styles.requiredStar}>*</span>
            </label>
            <UserMultiSelect
              users={availableUsers}
              selected={assignedUsers}
              selectedDepartments={selectedDepartments}
              onChange={(selected) => {
                setAssignedUsers(selected);
                setAssignedUser(selected[0] || "");
              }}
            />
            <p style={styles.fieldHint}>
              Open the list to pick one or more users, or use “Select all”.
              {isEdit ? " Change the selection to reassign the task." : ""}
            </p>
            <AssignByEmail
              users={users}
              onAdd={(id) => {
                const next = assignedUsers.includes(id) ? assignedUsers : [...assignedUsers, id];
                setAssignedUsers(next);
                setAssignedUser(next[0] || "");
              }}
            />
            {assignedUsers.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {assignedUsers.map((id) => (
                  <span key={id} style={{ background: colors.blueLight, color: colors.blue, borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 700 }}>
                    {userNameById(id)}
                    <button type="button" onClick={() => {
                      const next = assignedUsers.filter((item) => item !== id);
                      setAssignedUsers(next);
                      setAssignedUser(next[0] || "");
                    }} aria-label={`Remove ${userNameById(id)}`} style={{ marginLeft: 7, border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}>×</button>
                  </span>
                ))}
              </div>
            )}

            {/* Rework: is each person the original assignee or a new one, and which ID they get */}
            {isRework && reworkPreview.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {reworkPreview.map((p) => (
                  <div
                    key={p.userId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: `1px solid ${colors.border}`,
                      background: p.sameAssignee ? "#E8F7F0" : "#FFF6E5",
                      fontSize: 12,
                    }}
                  >
                    <strong style={{ color: colors.navy }}>{p.name}</strong>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 800,
                        borderRadius: 999,
                        padding: "2px 8px",
                        color: p.sameAssignee ? "#0F8A5F" : "#B54708",
                        background: colors.white,
                      }}
                    >
                      {p.sameAssignee ? "Original assignee" : `New assignee${p.department ? ` · ${p.department}` : ""}`}
                    </span>
                    <span style={{ marginLeft: "auto", color: colors.muted }}>
                      Task ID <b style={{ color: colors.oceanDark }}>#{p.referenceId}</b>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* live workload of each selected person */}
            <EmployeeWorkload userIds={assignedUsers} nameOf={userNameById} />
          </div>

          {isMonthly && (
            <MonthlyTaskFields value={monthlyConfig} onChange={setMonthlyConfig} isEdit={isEdit} />
          )}

          {/* DESCRIPTION */}

          <div style={styles.field}>
            <label
              style={styles.label}
            >
              Description
            </label>

            <textarea
              value={description}
              onChange={(e) =>
                setDescription(
                  e.target.value
                )
              }
              placeholder="Describe what needs to be completed..."
              style={
                styles.textarea
              }
              rows={4}
            />
          </div>

          {/* START → END (standard / rework tasks): Start Date | Start Time, End Date | End Time */}

          {!isMonthly && (
            <div style={styles.formGridTwo}>
              <div style={styles.field}>
                <label style={styles.label}>
                  Start Date {!isEdit && <span style={styles.requiredStar}>*</span>}
                </label>
                <div style={styles.inputIconWrapper}>
                  <input
                    type="date"
                    value={startDate}
                    max={dueDate || undefined}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={styles.inputWithIcon}
                  />
                  <CalendarDays size={16} style={styles.fieldIcon} />
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  aria-label="Start time"
                  style={styles.input}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>
                  End Date <span style={styles.requiredStar}>*</span>
                </label>
                <div style={styles.inputIconWrapper}>
                  <input
                    type="date"
                    value={dueDate}
                    min={startDate || undefined}
                    onChange={(e) => setDueDate(e.target.value)}
                    style={styles.inputWithIcon}
                  />
                  <CalendarDays size={16} style={styles.fieldIcon} />
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>End Time</label>
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  aria-label="End time"
                  style={styles.input}
                />
              </div>
            </div>
          )}

          {/* PRIORITY */}

          <div>
            <div style={styles.field}>
              <label
                style={styles.label}
              >
                Priority
              </label>

              <div
                style={
                  styles.priorityGroup
                }
              >
                {Object.keys(
                  priorityConfig
                ).map((item) => {
                  const config =
                    priorityConfig[
                      item
                    ];

                  const Icon =
                    config.icon;

                  const active =
                    priority === item;

                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() =>
                        setPriority(
                          item
                        )
                      }
                      style={{
                        ...styles.priorityButton,
                        background:
                          active
                            ? config.background
                            : colors.white,
                        color: active
                          ? config.color
                          : colors.muted,
                        borderColor:
                          active
                            ? config.color
                            : colors.border,
                        fontWeight:
                          active
                            ? 750
                            : 500,
                      }}
                    >
                      <Icon
                        size={13}
                      />

                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* LENGTH + REMINDER */}

          {(() => {
            const length = !isMonthly ? taskDuration(startDate, startTime, dueDate, dueTime) : null;
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {length && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 8,
                      padding: "10px 12px",
                      borderRadius: 12,
                      background: colors.oceanSoft,
                      border: `1px solid ${colors.ocean}44`,
                      fontSize: 12.5,
                      color: colors.text,
                    }}
                  >
                    <Clock3 size={15} color={colors.oceanDark} />
                    <strong style={{ color: colors.navy }}>Task length: {length.label}</strong>
                    <span style={{ color: colors.muted }}>{length.range}</span>
                  </div>
                )}

                <div style={styles.field}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <label style={{ ...styles.label, margin: 0 }} htmlFor="task-reminder-switch">Reminder</label>
                    <button
                      id="task-reminder-switch"
                      type="button"
                      role="switch"
                      aria-checked={reminderOn}
                      onClick={() => {
                        const next = !reminderOn;
                        setReminderOn(next);
                        // suggest the start time (or the end) when switching on
                        if (next && !reminders[0]?.customAt) {
                          const at = startDate ? `${startDate}T${startTime || "09:00"}` : dueDate ? `${dueDate}T${dueTime || "09:00"}` : "";
                          setReminders((list) => [{ ...(list[0] || {}), customAt: at }, ...list.slice(1)]);
                        }
                      }}
                      style={{
                        position: "relative",
                        width: 42,
                        height: 24,
                        borderRadius: 999,
                        border: 0,
                        cursor: "pointer",
                        background: reminderOn ? colors.ocean : colors.border,
                        transition: "background .2s",
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: 3,
                          left: reminderOn ? 21 : 3,
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          background: colors.white,
                          boxShadow: "0 1px 3px rgba(0,0,0,.25)",
                          transition: "left .2s",
                        }}
                      />
                    </button>
                  </div>
                  {reminderOn && (
                    <>
                      <input
                        type="datetime-local"
                        value={reminders[0]?.customAt || ""}
                        onChange={(e) => setReminders((list) => [{ ...(list[0] || {}), customAt: e.target.value }, ...list.slice(1)])}
                        aria-label="Reminder date and time"
                        style={styles.input}
                      />
                      <span style={{ fontSize: 10.5, color: colors.muted }}>
                        {reminders[0]?.sentAt
                          ? "This reminder was sent. Pick a new time to send it again."
                          : "The assigned person is reminded about this task at this time (notification, and email if they allow it)."}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {/* REWARD */}

          <div
            style={
              styles.rewardCard
            }
          >
            <div
              style={
                styles.rewardLeft
              }
            >
              <div
                style={
                  styles.rewardIcon
                }
              >
                <Award size={16} />
              </div>

              <span>
                Completion reward
              </span>
            </div>

            <strong title="When approving the task, the assigner gives a score 1–10 — that becomes the assignee's points">
              Score 1–10 on approval
              <span style={{ display: "block", fontSize: 10, fontWeight: 600, opacity: 0.75 }}>
                given by the assigner · added to the score
              </span>
            </strong>
          </div>

          {/* ATTACHMENTS — below the Task Score section */}

          <div
            style={
              styles.expandCard
            }
          >
            <button
              type="button"
              onClick={() =>
                setShowAttachments(
                  !showAttachments
                )
              }
              style={
                styles.expandButton
              }
            >
              <div
                style={
                  styles.expandTitle
                }
              >
                <Paperclip size={17} />

                <div
                  style={
                    styles.expandTitleText
                  }
                >
                  <strong
                    style={
                      styles.expandTitleMain
                    }
                  >
                    Attachments
                  </strong>

                  <span
                    style={
                      styles.expandTitleSub
                    }
                  >
                    Files are uploaded when you save the task
                  </span>
                </div>
              </div>

              <div
                style={
                  styles.expandRight
                }
              >
                <span
                  style={
                    styles.countBadge
                  }
                >
                  {attachments.length} files
                </span>

                {showAttachments ? (
                  <ChevronUp size={17} />
                ) : (
                  <ChevronDown size={17} />
                )}
              </div>
            </button>

            {showAttachments && (
              <div
                style={
                  styles.expandedContent
                }
              >
                <label
                  style={{
                    ...styles.uploadBox,
                    ...(dragActive
                      ? {
                          borderColor: colors.ocean,
                          background: "#E8F7F8",
                          transform: "scale(1.01)",
                        }
                      : {}),
                    transition: "all .18s ease",
                    opacity: submitting ? 0.6 : 1,
                    cursor: submitting ? "wait" : "pointer",
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                >
                  <UploadCloud size={24} />

                  <strong>
                    {dragActive
                      ? "Drop files to attach"
                      : "Click to upload or drag & drop"}
                  </strong>

                  <span style={{ fontSize: 10, color: "#7893A3" }}>
                    PDF, Word, Excel, PowerPoint, CSV, TXT, ZIP, images · max 8 MB each · up to {MAX_ATTACHMENTS} files
                  </span>

                  <input
                    type="file"
                    multiple
                    disabled={submitting}
                    accept={ATTACHMENT_EXTENSIONS.map((ext) => `.${ext}`).join(",")}
                    onChange={handleFileChange}
                    hidden
                  />
                </label>

                {attachments.length >
                  0 && (
                  <div
                    style={
                      styles.fileList
                    }
                  >
                    {attachments.map(
                      (file, index) => (
                        <div
                          key={`${file.filename || file.name}-${index}`}
                          style={
                            styles.fileItem
                          }
                        >
                          <FileText
                            size={15}
                          />

                          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                            <span style={styles.fileName}>
                              {file.name}
                            </span>
                            <span style={{ fontSize: 10, color: colors.muted, fontWeight: 500 }}>
                              {[
                                formatFileSize(file.size),
                                fileExtension(file.name).toUpperCase(),
                                file.existing ? "Saved" : "New — uploads on save",
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </div>

                          {file.existing && file.downloadable && (
                            <button
                              type="button"
                              title="Download"
                              onClick={() =>
                                downloadAttachment(file).catch(() =>
                                  setError(`Could not download ${file.name}.`)
                                )
                              }
                              style={{
                                ...styles.smallDelete,
                                color: colors.ocean,
                              }}
                            >
                              <Download size={14} />
                            </button>
                          )}

                          <button
                            type="button"
                            title="Remove"
                            disabled={submitting}
                            onClick={() =>
                              removeAttachment(
                                file
                              )
                            }
                            style={
                              styles.smallDelete
                            }
                          >
                            <Trash2
                              size={14}
                            />
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RECURRING — commented out (hidden) for now; set SHOW_RECURRING_OPTION = true to bring it back */}

          {SHOW_RECURRING_OPTION && !isMonthly && (
          <>


          <div
            style={
              styles.expandCard
            }
          >
            <div
              style={
                styles.expandHeader
              }
            >
              <div
                style={
                  styles.expandTitle
                }
              >
                <RotateCcw
                  size={17}
                />

                <div
                  style={
                    styles.expandTitleText
                  }
                >
                  <strong
                    style={
                      styles.expandTitleMain
                    }
                  >
                    Make this task recurring
                  </strong>

                  <span
                    style={
                      styles.expandTitleSub
                    }
                  >
                    Automatically repeat this task
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setRecurring(
                    !recurring
                  )
                }
                style={{
                  ...styles.toggle,
                  background:
                    recurring
                      ? colors.ocean
                      : "#CFDEE8",
                }}
              >
                <span
                  style={{
                    ...styles.toggleCircle,
                    transform:
                      recurring
                        ? "translateX(20px)"
                        : "translateX(0)",
                  }}
                />
              </button>
            </div>

            {recurring && (
              <div
                style={
                  styles.recurringBox
                }
              >
                <select
                  value={
                    recurrenceInterval
                  }
                  onChange={(e) =>
                    setRecurrenceInterval(
                      e.target.value
                    )
                  }
                  style={styles.input}
                >
                  <option>
                    Every day
                  </option>

                  <option>
                    Every week
                  </option>

                  <option>
                    Every month
                  </option>
                </select>
              </div>
            )}
          </div>
          </>
          )}

          {/* CHECKLIST */}

          <div style={styles.field}>
            <label style={styles.label}>Add Checklist Details</label>
            <ChecklistEditor value={checklist} onChange={setChecklist} users={availableUsers} />
          </div>

          {/* SUBTASKS */}

          <div
            style={
              styles.expandCard
            }
          >
            <button
              type="button"
              onClick={() =>
                setShowSubtasks(
                  !showSubtasks
                )
              }
              style={
                styles.expandButton
              }
            >
              <div
                style={
                  styles.expandTitle
                }
              >
                <ListChecks
                  size={17}
                />

                <div
                  style={
                    styles.expandTitleText
                  }
                >
                  <strong
                    style={
                      styles.expandTitleMain
                    }
                  >
                    Sub-tasks
                  </strong>

                  <span
                    style={
                      styles.expandTitleSub
                    }
                  >
                    Break this task into smaller steps
                  </span>
                </div>
              </div>

              <div
                style={
                  styles.expandRight
                }
              >
                <span
                  style={
                    styles.countBadge
                  }
                >
                  {subtasks.length} sub-tasks
                </span>

                {showSubtasks ? (
                  <ChevronUp size={17} />
                ) : (
                  <ChevronDown
                    size={17}
                  />
                )}
              </div>
            </button>

            {showSubtasks && (
              <div
                style={
                  styles.expandedContent
                }
              >
                <div
                  style={
                    styles.subtaskInputRow
                  }
                >
                  <input
                    value={subtaskInput}
                    onChange={(e) =>
                      setSubtaskInput(
                        e.target.value
                      )
                    }
                    onKeyDown={(e) => {
                      if (
                        e.key ===
                        "Enter"
                      ) {
                        e.preventDefault();
                        addSubtask();
                      }
                    }}
                    placeholder="Enter sub-task"
                    style={{
                      ...styles.input,
                      flex: 1,
                    }}
                  />

                  <button
                    type="button"
                    onClick={
                      addSubtask
                    }
                    style={
                      styles.addSubtaskButton
                    }
                  >
                    <Plus size={15} />
                    Add
                  </button>
                </div>

                {subtasks.length >
                  0 && (
                  <div
                    style={
                      styles.subtaskList
                    }
                  >
                    {subtasks.map(
                      (
                        item,
                        index
                      ) => (
                        <div
                          key={
                            item.id
                          }
                          style={
                            styles.subtaskItem
                          }
                        >
                          <span
                            style={
                              styles.subtaskNumber
                            }
                          >
                            {index + 1}
                          </span>

                          <span
                            style={
                              styles.subtaskTitle
                            }
                          >
                            {
                              item.title
                            }
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              removeSubtask(
                                item.id
                              )
                            }
                            style={
                              styles.smallDelete
                            }
                          >
                            <Trash2
                              size={14}
                            />
                          </button>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ERROR */}

        {error && (
          <div
            style={
              styles.modalError
            }
          >
            <AlertTriangle
              size={15}
            />

            <span>{error}</span>
          </div>
        )}

        {/* FOOTER */}

        <div
          style={
            styles.modalFooter
          }
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={
              styles.cancelButton
            }
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              ...styles.createButton,
              opacity:
                submitting
                  ? 0.65
                  : 1,
              cursor:
                submitting
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {submitting ? (
              <>
                <Loader2
                  size={16}
                  style={
                    styles.spinner
                  }
                />

                {uploadedFiles.length
                  ? `Uploading ${uploadedFiles.length} file${uploadedFiles.length === 1 ? "" : "s"}...`
                  : "Saving..."}
              </>
            ) : (
              <>
                {isEdit ? (
                  <Pencil size={16} />
                ) : (
                  <Plus size={16} />
                )}

                {isEdit
                  ? "Save Changes"
                  : "Assign Task"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

/* =========================================================
   TASKS PAGE
========================================================= */

const TasksPage = () => {
  const [
    tasks,
    setTasks,
  ] = useState([]);

  const [
    tasksLoading,
    setTasksLoading,
  ] = useState(true);

  const [
    tasksError,
    setTasksError,
  ] = useState("");

  const [
    users,
    setUsers,
  ] = useState([]);

  const [
    departments,
    setDepartments,
  ] = useState([]);

  const [
    loadingWorkspaceData,
    setLoadingWorkspaceData,
  ] = useState(true);

  const [
    workspaceDataError,
    setWorkspaceDataError,
  ] = useState("");

  const [
    showModal,
    setShowModal,
  ] = useState(false);

  const [
    editingTask,
    setEditingTask,
  ] = useState(null);

  const [
    actionError,
    setActionError,
  ] = useState("");

  const [actionMessage, setActionMessage] = useState("");
  // "Approve" opens this: the assigner gives a score 1–10
  const [scoreDialogTask, setScoreDialogTask] = useState(null);
  const [reviewMode, setReviewMode] = useState("complete"); // "complete" | "rework" | "submit"
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [sessionUser] = useState(getSessionUser);
  const canCreateTasks = canDo(sessionUser, "tasks", "create");
  const canEditTasks = canDo(sessionUser, "tasks", "edit");
  const canDeleteTasks = canDo(sessionUser, "tasks", "delete");
  const canImportTasks = canDo(sessionUser, "tasks", "import") || canDo(sessionUser, "calendar", "import");
  const [showImport, setShowImport] = useState(false);
  const canAssignTasks = canDo(sessionUser, "tasks", "assign");

  // Create-task-by-email: the button shows only when the server has it switched on
  const [emailInbox, setEmailInbox] = useState("");
  const [showEmailHelp, setShowEmailHelp] = useState(false);
  useEffect(() => {
    if (!canCreateTasks) return undefined;
    let alive = true;
    axios
      .get(`${API_URL.replace(/\/$/, "")}/tasks/email-inbox`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      })
      .then((res) => {
        if (alive && res.data?.data?.enabled) setEmailInbox(res.data.data.address || "");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [canCreateTasks]);

  useEffect(() => {
    if (!actionMessage) return undefined;
    const timer = setTimeout(() => setActionMessage(""), 3000);
    return () => clearTimeout(timer);
  }, [actionMessage]);

  const [
    search,
    setSearch,
  ] = useState("");

  // Header search → open this page filtered (?search=… or the live "workspace-search" event)
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("search");
    if (fromUrl) setSearch(fromUrl);
    const onSearch = (event) => {
      if (event.detail?.path === window.location.pathname) setSearch(event.detail.query || "");
    };
    window.addEventListener("workspace-search", onSearch);
    return () => window.removeEventListener("workspace-search", onSearch);
  }, []);

  const [
    statusFilter,
    setStatusFilter,
  ] = useState(
    "All Status"
  );

  const [
    priorityFilter,
    setPriorityFilter,
  ] = useState(
    "All Priority"
  );

  const [departmentFilter, setDepartmentFilter] = useState("All Departments");
  const [quickFilter, setQuickFilter] = useState(""); // key of QUICK_FILTERS
  const [sinceFilter, setSinceFilter] = useState(""); // "YYYY-MM-DD" — Dashboard period (created on/after)
  // Opened from another page: one person's tasks, tasks from one Task Bank item, one task, or one due day
  const [linkFilter, setLinkFilter] = useState({ assignee: null, template: null, task: "", date: "" });

  // Opened from a Dashboard card / chart: ?status=Review&department=Sales&due=overdue
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status && TASK_STATUSES.includes(normalizeStatus(status))) setStatusFilter(normalizeStatus(status));
    const priority = params.get("priority");
    if (priority && priorityConfig[priority]) setPriorityFilter(priority);
    const dept = params.get("department");
    if (dept) setDepartmentFilter(dept);
    const due = params.get("due");
    if (due && QUICK_FILTERS[due]) setQuickFilter(due);
    const since = params.get("since");
    if (/^\d{4}-\d{2}-\d{2}$/.test(since || "")) setSinceFilter(since);
    const date = params.get("date");
    setLinkFilter({
      assignee: params.get("assignee") ? { id: params.get("assignee"), name: params.get("assigneeName") || "" } : null,
      template: params.get("template") ? { id: params.get("template"), name: params.get("templateName") || "" } : null,
      task: params.get("task") || "",
      date: /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : "",
    });
  }, []);

  const [
    viewMode,
    setViewMode,
  ] = useState("rows");

  const [
    updatingTaskIds,
    setUpdatingTaskIds,
  ] = useState({});

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const visibleFields = {
    department: true,
    assignedUser: true,
    assignedBy: true,
    dueDate: true,
    priority: true,
    status: true,
  };

  /* =====================================================
     LOAD WORKSPACE DATA
  ===================================================== */

  const loadWorkspaceData =
    useCallback(async () => {
      setLoadingWorkspaceData(
        true
      );

      setWorkspaceDataError("");

      const token =
        getAuthToken();

      if (!token) {
        setWorkspaceDataError(
          "You are not logged in. Please sign in again."
        );

        setLoadingWorkspaceData(
          false
        );

        setTimeout(() => {
          window.location.href =
            "/login";
        }, 1500);

        return;
      }

      try {
        const [
          usersResponse,
          departmentsResponse,
        ] = await Promise.all([
          api.get(
            "/users/assignable"
          ),
          api.get(
            "/departments"
          ),
        ]);

        setUsers(
          extractApiData(
            usersResponse
          )
            .map(normalizeUser)
            .filter(
              (u) => u.name
            )
        );

        setDepartments(
          extractApiData(
            departmentsResponse
          )
            .map(
              normalizeDepartment
            )
            .filter(
              (d) => d.name
            )
        );

        setWorkspaceDataError(
          ""
        );
      } catch (error) {
        console.error(
          "Failed to load workspace data:",
          error
        );

        const status =
          error?.response
            ?.status;

        if (status === 401) {
          setWorkspaceDataError(
            "Session expired. Redirecting to login..."
          );

          localStorage.removeItem(
            "token"
          );

          localStorage.removeItem(
            "user"
          );

          setTimeout(() => {
            window.location.href =
              "/login";
          }, 1500);
        } else if (
          status === 403
        ) {
          setWorkspaceDataError(
            "Permission denied (403): cannot load users/departments."
          );

          setUsers([]);
          setDepartments([]);
        } else if (
          error?.code ===
          "ERR_NETWORK"
        ) {
          setWorkspaceDataError(
            `Cannot reach the server at ${API_URL}. Is the backend running?`
          );

          setUsers([]);
          setDepartments([]);
        } else {
          setWorkspaceDataError(
            error?.response
              ?.data?.message ||
              "Unable to load users and departments."
          );

          setUsers([]);
          setDepartments([]);
        }
      } finally {
        setLoadingWorkspaceData(
          false
        );
      }
    }, []);

  /* =====================================================
     LOAD TASKS
     
     IMPORTANT:
     silent=true is used after status update.
     This fixes the refresh/persistence UI problem without
     showing the whole loading screen.
  ===================================================== */

  const loadTasks =
    useCallback(
      async ({
        silent = false,
      } = {}) => {
        if (!silent) {
          setTasksLoading(true);
        }

        setTasksError("");

        try {
          const raw =
            await fetchTasksApi();

          const normalized =
            raw.map(
              normalizeTask
            );

          setTasks(
            normalized
          );

          return normalized;
        } catch (err) {
          console.error(
            "Failed to load tasks:",
            err
          );

          const status =
            err?.response
              ?.status;

          if (status === 401) {
            setTasksError(
              "Session expired. Redirecting to login..."
            );

            localStorage.removeItem(
              "token"
            );

            localStorage.removeItem(
              "user"
            );

            setTimeout(() => {
              window.location.href =
                "/login";
            }, 1500);
          } else if (
            err?.code ===
            "ERR_NETWORK"
          ) {
            setTasksError(
              `Cannot reach the server at ${API_URL}. Is the backend running?`
            );
          } else {
            setTasksError(
              err?.response
                ?.data?.message ||
                "Unable to load tasks."
            );
          }

          throw err;
        } finally {
          if (!silent) {
            setTasksLoading(
              false
            );
          }
        }
      },
      []
    );

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Real time: a task was assigned / reassigned / changed → refresh the list quietly
  useEffect(() => {
    const onRealtime = (event) => {
      if (String(event.detail?.type || "").startsWith("task_")) {
        loadTasks({ silent: true }).catch(() => {});
      }
    };
    window.addEventListener("realtime:notification", onRealtime);
    // updated / opened from the assignment email → show it here without a reload
    const socket = getSocket();
    const onTaskChanged = () => loadTasks({ silent: true }).catch(() => {});
    socket?.on("task:changed", onTaskChanged);
    return () => {
      window.removeEventListener("realtime:notification", onRealtime);
      socket?.off("task:changed", onTaskChanged);
    };
  }, [loadTasks]);

  /* =====================================================
     FILTERS
  ===================================================== */

  // Copies of a task assigned to several people → one task (see groupTasks)
  const groupedTasks = useMemo(
    () => groupTasks(tasks),
    [tasks]
  );

  const [expandedGroups, setExpandedGroups] = useState({});
  const toggleGroup = (id) =>
    setExpandedGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  const filteredTasks =
    useMemo(() => {
      return groupedTasks.filter(
        (task) => {
          const q =
            search
              .trim()
              .toLowerCase();

          const matchesSearch =
            !q ||
            task.name
              .toLowerCase()
              .includes(q) ||
            task.assignedUser
              ?.toLowerCase()
              .includes(q) ||
            task.assignedByName
              ?.toLowerCase()
              .includes(q) ||
            task.department
              ?.toLowerCase()
              .includes(q);

          // A shared task matches a status if anyone's part has that status
          const statuses = task.isGroup
            ? [task.status, ...task.members.map((m) => normalizeStatus(m.status))]
            : [normalizeStatus(task.status)];

          const matchesStatus =
            statusFilter ===
              "All Status" ||
            statuses.includes(
              normalizeStatus(
                statusFilter
              )
            );

          const matchesPriority =
            priorityFilter ===
              "All Priority" ||
            task.priority ===
              priorityFilter;

          // a task with several departments counts for each of them
          const wantedDept = departmentFilter.trim().toLowerCase();
          const matchesDepartment =
            departmentFilter === "All Departments" ||
            [task.department, ...(task.departments || [])].some(
              (d) => String(d || "").trim().toLowerCase() === wantedDept
            );

          const matchesQuick = !quickFilter || QUICK_FILTERS[quickFilter].test(task);

          // same rule as the Dashboard period: created on or after that day (local time)
          const matchesSince =
            !sinceFilter || !task.createdAt || new Date(task.createdAt) >= new Date(`${sinceFilter}T00:00:00`);

          // links from Users / Task Bank / Calendar — a shared task matches through any member
          const copies = task.isGroup ? [task, ...task.members] : [task];
          const matchesLink =
            (!linkFilter.assignee || copies.some((c) => String(c.assignedTo || "") === linkFilter.assignee.id)) &&
            (!linkFilter.template || copies.some((c) => c.sourceTemplate === linkFilter.template.id)) &&
            (!linkFilter.task || copies.some((c) => String(c.id) === linkFilter.task)) &&
            (!linkFilter.date || task.dueDate === linkFilter.date);

          return (
            matchesSearch &&
            matchesStatus &&
            matchesPriority &&
            matchesDepartment &&
            matchesQuick &&
            matchesSince &&
            matchesLink
          );
        }
      );
    }, [
      groupedTasks,
      search,
      statusFilter,
      priorityFilter,
      departmentFilter,
      quickFilter,
      sinceFilter,
      linkFilter,
    ]);

  // Department choices = departments that actually have tasks (+ one opened from the Dashboard)
  const departmentOptions = useMemo(() => {
    const names = new Set();
    groupedTasks.forEach((t) =>
      [t.department, ...(t.departments || [])].forEach((d) => d && names.add(String(d).trim()))
    );
    if (departmentFilter !== "All Departments") names.add(departmentFilter);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [groupedTasks, departmentFilter]);

  // Rows view: one page at a time (a new search / filter goes back to page 1)
  const taskPage = usePagination(filteredTasks, {
    id: "tasks",
    resetKey: `${search}|${statusFilter}|${priorityFilter}|${departmentFilter}|${quickFilter}|${sinceFilter}|${JSON.stringify(linkFilter)}`,
  });

  /* =====================================================
     STATS
  ===================================================== */

  const stats = useMemo(
    () => ({
      total: groupedTasks.length,

      todo: groupedTasks.filter(
        (t) =>
          normalizeStatus(
            t.status
          ) === "To Do"
      ).length,

      progress: groupedTasks.filter(
        (t) =>
          normalizeStatus(
            t.status
          ) === "In Progress"
      ).length,

      review: groupedTasks.filter(
        (t) =>
          normalizeStatus(
            t.status
          ) === "Review"
      ).length,

      completed: groupedTasks.filter(
        (t) =>
          normalizeStatus(
            t.status
          ) === "Completed"
      ).length,
    }),
    [groupedTasks]
  );

  /* =====================================================
     CREATE
  ===================================================== */

  const handleCreateTask =
    async (newTask) => {
      setTasks((prev) => [
        newTask,
        ...prev,
      ]);

      setShowModal(false);
      setEditingTask(null);
      setActionMessage(`Task "${newTask.name}" created.`);

      // Make sure UI matches database.
      try {
        await loadTasks({
          silent: true,
        });
      } catch {
        // Existing task is already shown.
      }
    };

  /* =====================================================
     UPDATE
  ===================================================== */

  const handleUpdateTask =
    async (updatedTask) => {
      setTasks((prev) =>
        prev.map((task) =>
          String(task.id) ===
          String(
            updatedTask.id
          )
            ? updatedTask
            : task
        )
      );

      setShowModal(false);
      setEditingTask(null);
      setActionMessage(`Task "${updatedTask.name}" updated.`);

      try {
        await loadTasks({
          silent: true,
        });
      } catch {
        // Keep optimistic update.
      }
    };

  const openCreateModal =
    () => {
      setEditingTask(null);
      setShowModal(true);
      // refresh departments so the "next reference ID" preview is current
      loadWorkspaceData();
    };

  const openEditModal =
    (task) => {
      setEditingTask(task);
      setShowModal(true);
    };

  /* =====================================================
     REFRESH
  ===================================================== */

  const handleRefresh =
    async () => {
      if (refreshing) return;

      setRefreshing(true);

      try {
        await Promise.all([
          loadTasks({
            silent: true,
          }),
          loadWorkspaceData(),
        ]);
      } finally {
        setRefreshing(false);
      }
    };

  /* =====================================================
     STATUS CHANGE
     
     IMPORTANT:
     1. Optimistic UI
     2. Save to backend
     3. Re-fetch backend data silently
     
     Therefore refresh will show the saved status.
  ===================================================== */

  const handleStatusChange =
    async (
      taskId,
      newStatus,
      comment = "",
      confirmed = false
    ) => {
      const normalizedStatus =
        normalizeStatus(
          newStatus
        );

      const previousTasks =
        tasks;

      const task =
        tasks.find(
          (t) =>
            String(t.id) ===
            String(taskId)
        );

      if (!task) return;

      if (
        normalizeStatus(
          task.status
        ) ===
        normalizedStatus
      ) {
        return;
      }

      // Moving to Review → ask for a comment first (shown to the person who reviews it)
      if (normalizedStatus === "Review" && !confirmed) {
        setReviewMode("submit");
        setScoreDialogTask(task);
        return;
      }

      setActionError("");

      setUpdatingTaskIds(
        (prev) => ({
          ...prev,
          [taskId]: true,
        })
      );

      // Optimistic UI
      setTasks((prev) =>
        prev.map((t) =>
          String(t.id) ===
          String(taskId)
            ? {
                ...t,
                status:
                  normalizedStatus,
              }
            : t
        )
      );

      try {
        if (normalizedStatus === "Review") {
          await api.patch(`/tasks/${taskId}/status`, { status: "Review", note: String(comment || "").trim() });
          setScoreDialogTask(null);
        } else {
          await updateTaskStatusApi(
            taskId,
            normalizedStatus,
            task.rawStatus
          );
        }

        /*
          IMPORTANT FIX:

          After successful POST/PATCH/PUT,
          fetch again from MongoDB.

          This means:
          UI status
             ↓
          Backend/MongoDB
             ↓
          GET /tasks
             ↓
          UI

          So after browser refresh the
          real status remains visible.
        */

        await loadTasks({
          silent: true,
        });
      } catch (err) {
        setTasks(
          previousTasks
        );

        setActionError(
          err?.response?.data?.message ||
            err?.message ||
            "Failed to save task status."
        );

        console.error(
          "[Status] failed:",
          err
        );
      } finally {
        setUpdatingTaskIds(
          (prev) => {
            const next = {
              ...prev,
            };

            delete next[taskId];

            return next;
          }
        );
      }
    };

  /* =====================================================
     REVIEW — the assigner approves (Completed + score)
     or sends the task back for rework
  ===================================================== */

  const reloadQuietly = () => loadTasks({ silent: true });

  // First call opens the review dialog (score + comment box); the dialog calls back with confirmed = true
  const handleReview = async (task, decision, givenScore, comment = "", confirmed = false) => {
    if (!confirmed) {
      setReviewMode(decision === "rework" ? "rework" : "complete");
      setScoreDialogTask(task);
      return;
    }
    const note = String(comment || "").trim();

    setActionError("");
    setUpdatingTaskIds((prev) => ({ ...prev, [task.id]: true }));
    try {
      const response = await api.patch(`/tasks/${task.id}/status`, {
        status: decision === "complete" ? "Completed" : "In Progress",
        note,
        ...(decision === "complete" ? { score: givenScore } : {}),
      });
      setScoreDialogTask(null);
      setActionMessage(response.data?.message || (decision === "complete" ? "Task completed." : "Sent back for rework."));
      await loadTasks({ silent: true });
    } catch (err) {
      setActionError(err?.response?.data?.message || err.message || "Could not save the review.");
    } finally {
      setUpdatingTaskIds((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
    }
  };

  /* =====================================================
     DELETE
  ===================================================== */

  // Opens the confirmation dialog
  const handleDeleteTask =
    (taskId) => {
      const task =
        tasks.find((t) => String(t.id) === String(taskId)) ||
        groupedTasks.find((t) => String(t.id) === String(taskId));
      if (task) {
        setActionError("");
        setTaskToDelete(task);
      }
    };

  const confirmDeleteTask =
    async () => {
      if (!taskToDelete || deleting) return;

      setDeleting(true);
      setActionError("");

      try {
        // A shared task → delete every person's copy
        const ids = taskToDelete.isGroup
          ? taskToDelete.members.map((m) => m.id)
          : [taskToDelete.id];
        const results = await Promise.allSettled(ids.map((id) => deleteTaskApi(id)));
        const deleted = ids.filter((id, i) => results[i].status === "fulfilled");
        const failed = results.find((r) => r.status === "rejected");

        setTasks((prev) =>
          prev.filter(
            (task) =>
              !deleted.some((id) => String(id) === String(task.id))
          )
        );
        if (failed && !deleted.length) throw failed.reason;
        if (failed) {
          setActionError(`Deleted ${deleted.length} of ${ids.length} people's parts of "${taskToDelete.name}". The rest could not be deleted.`);
        } else {
          setActionMessage(`Task "${taskToDelete.name}" deleted${ids.length > 1 ? ` for all ${ids.length} people` : ""}.`);
        }
        setTaskToDelete(null);

        // Stats are derived from the list — re-sync with the database
        try {
          await loadTasks({ silent: true });
        } catch {
          // List already updated locally.
        }
      } catch (err) {
        setActionError(
          err?.response
            ?.data?.message ||
            `Failed to delete task (${
              err?.response?.status ||
              "network error"
            }).`
        );
        setTaskToDelete(null);
      } finally {
        setDeleting(false);
      }
    };

  // A shared task is edited per person (each part has its own status / dates)
  const editHandlerFor = (task) =>
    !task.isGroup && canEditTasks && canModifyTask(sessionUser, task)
      ? openEditModal
      : undefined;

  // Extra props for a shared task's card: open/close its people panel + per-person actions
  const groupCardProps = (task) =>
    task.isGroup
      ? {
          expanded: Boolean(expandedGroups[task.id]),
          onToggleExpand: () => toggleGroup(task.id),
          memberActions: {
            onStatusChange: handleStatusChange,
            onReview: handleReview,
            onSubtasksChanged: reloadQuietly,
            users,
            editFor: editHandlerFor,
            deleteFor: deleteHandlerFor,
            updatingTaskIds,
          },
        }
      : {};

  const deleteHandlerFor = (task) =>
    canDeleteTasks && canModifyTask(sessionUser, task)
      ? handleDeleteTask
      : undefined;

  // "Select all" → bulk delete (only tasks you're allowed to delete)
  const selectableTaskIds = useMemo(
    () =>
      canDeleteTasks
        ? filteredTasks.filter((task) => canModifyTask(sessionUser, task)).map((task) => task.id)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredTasks, canDeleteTasks, sessionUser]
  );
  const taskSelect = useBulkSelect(selectableTaskIds);

  const deleteSelectedTasks = async (selected) => {
    const picked = filteredTasks.filter((task) => selected.includes(String(task.id)));
    // a shared task → every person's copy
    const plan = picked.map((task) => ({ id: String(task.id), parts: task.isGroup ? task.members.map((m) => m.id) : [task.id] }));
    const parts = plan.flatMap((p) => p.parts);
    const results = await Promise.allSettled(parts.map((id) => deleteTaskApi(id)));
    const removed = new Set(parts.filter((id, i) => results[i].status === "fulfilled").map(String));
    setTasks((prev) => prev.filter((task) => !removed.has(String(task.id))));
    try {
      await loadTasks({ silent: true });
    } catch {
      // List already updated locally.
    }
    const deleted = plan.filter((p) => p.parts.every((id) => removed.has(String(id)))).map((p) => p.id);
    if (!deleted.length && results[0]?.status === "rejected") throw results[0].reason;
    return deleted;
  };

  /* =====================================================
     RENDER
  ===================================================== */

  return (
    <>
      <style>
        {globalCss + APP_LINK_CSS}
      </style>

      <div
        className="task-page-unique ts-page"
        style={styles.page}
      >
        {/* =================================================
            HERO
        ================================================= */}

        <div
          className="ts-shimmer ts-hero"
          style={styles.hero}
        >
          <div className="ts-hero-grid" />

          <span
            className="ts-floating-dot"
            style={{
              width: 120,
              height: 120,
              right: "6%",
              top: -58,
            }}
          />

          <span
            className="ts-floating-dot"
            style={{
              width: 52,
              height: 52,
              right: "22%",
              bottom: -25,
              animationDelay:
                "1.1s",
            }}
          />

          <span
            className="ts-floating-dot"
            style={{
              width: 30,
              height: 30,
              right: "38%",
              top: 18,
              animationDelay:
                "2.1s",
            }}
          />

          <div className="ts-wave-line" />

          <span
            style={
              styles.heroLineGlow
            }
          />

          <div
            style={
              styles.heroLeft
            }
          >
            <div
              style={
                styles.heroIcon
              }
            >
              <Waves size={24} />
            </div>

            <div>
              <h1
                className="ts-hero-title"
                style={
                  styles.heroTitle
                }
              >
                Task Workspace
              </h1>

              <p
                style={
                  styles.heroSubtitle
                }
              >
                Create, assign, track and complete your team's work from one intelligent workspace.
                {loadingWorkspaceData
                  ? " · Syncing..."
                  : ""}
              </p>

              <div
                style={
                  styles.heroBadge
                }
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius:
                      "50%",
                    background:
                      "#6CE2D1",
                  }}
                />

                LIVE WORKSPACE

                <span>
                  ·
                </span>

                <Sparkles
                  size={11}
                />

                Ocean Flow
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", position: "relative", zIndex: 2 }}>
          {canImportTasks && (
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="ts-action-button"
            style={{
              ...styles.newTaskButton,
              background: "rgba(255,255,255,.14)",
              border: "1px solid rgba(255,255,255,.35)",
              boxShadow: "none",
            }}
          >
            <Upload size={17} />
            Import
          </button>
          )}
          {canCreateTasks && emailInbox && (
          <button
            type="button"
            onClick={() => setShowEmailHelp(true)}
            className="ts-action-button"
            title={`Create tasks by emailing ${emailInbox}`}
            style={{
              ...styles.newTaskButton,
              background: "rgba(255,255,255,.14)",
              border: "1px solid rgba(255,255,255,.35)",
              boxShadow: "none",
            }}
          >
            <Mail size={17} />
            By Email
          </button>
          )}
          {canCreateTasks && (
          <button
            type="button"
            onClick={
              openCreateModal
            }
            className="ts-action-button"
            style={
              styles.newTaskButton
            }
          >
            <Plus size={18} />
            New Task
          </button>
          )}
          </div>
        </div>

        {/* =================================================
            ERRORS
        ================================================= */}

        {workspaceDataError && (
          <div
            style={
              styles.workspaceError
            }
          >
            <AlertTriangle
              size={16}
            />

            <span>
              {workspaceDataError}
            </span>

            {getAuthToken() ? (
              <button
                type="button"
                onClick={
                  loadWorkspaceData
                }
                style={
                  styles.retryButton
                }
              >
                <RotateCcw
                  size={13}
                />

                Retry
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  (window.location.href =
                    "/login")
                }
                style={
                  styles.retryButton
                }
              >
                <LogIn size={13} />

                Go to Login
              </button>
            )}
          </div>
        )}

        {tasksError && (
          <div
            style={
              styles.workspaceError
            }
          >
            <AlertTriangle
              size={16}
            />

            <span>
              {tasksError}
            </span>

            <button
              type="button"
              onClick={() =>
                loadTasks()
              }
              style={
                styles.retryButton
              }
            >
              <RotateCcw
                size={13}
              />

              Retry
            </button>
          </div>
        )}

        {actionMessage && (
          <div
            role="status"
            style={{
              ...styles.workspaceError,
              background: "#EAF8F1",
              borderColor: "#BDE5D0",
              color: "#17724A",
            }}
          >
            <CheckCircle2 size={16} />
            <span style={{ flex: 1 }}>{actionMessage}</span>
          </div>
        )}

        {scoreDialogTask && (
          <ScoreDialog
            key={`${scoreDialogTask.id}-${reviewMode}`}
            task={scoreDialogTask}
            mode={reviewMode}
            busy={Boolean(updatingTaskIds[scoreDialogTask.id])}
            onCancel={() => setScoreDialogTask(null)}
            onSubmit={(score, comment) =>
              reviewMode === "submit"
                ? handleStatusChange(scoreDialogTask.id, "Review", comment, true)
                : handleReview(scoreDialogTask, reviewMode, score, comment, true)
            }
          />
        )}

        {showEmailHelp && emailInbox && (
          <EmailTaskDialog
            address={emailInbox}
            canAssign={canAssignTasks}
            onClose={() => setShowEmailHelp(false)}
          />
        )}

        {showImport && (
          <CsvImportDialog
            endpoint="/api/tasks/import"
            title="Import tasks from CSV"
            help="Columns: Title*, Start Date, Start Time, End Date*, End Time, Department, Assignee (name or email), Assigned By (name or email — blank means you), Status, Priority, Description. Dates can be in any format (2026-11-07, 07/11/2026, 7 Nov 2026, Excel dates). Write times with AM/PM, e.g. 9:00 AM or 5:30 PM. Empty rows are ignored. The Task ID is created automatically."
            columns={[
              { key: "title", label: "Title" },
              { key: "startDate", label: "Start" },
              { key: "endDate", label: "End" },
              { key: "assignee", label: "Assignee" },
              { key: "assignedBy", label: "Assigned By" },
              { key: "department", label: "Department" },
              { key: "priority", label: "Priority" },
            ]}
            template={{
              filename: "tasks-import-template.csv",
              header: "Title,Start Date,Start Time,End Date,End Time,Department,Assignee,Assigned By,Status,Priority,Description",
              sample: [
                "Prepare monthly report,01/11/2026,9:00 AM,05/11/2026,5:00 PM,Development,john@example.com,manager@example.com,Pending,High,Collect KPIs",
                "Client follow-up call,7 Nov 2026,10:30 AM,7 Nov 2026,11:30 AM,Sales,priya@example.com,,To Do,Medium,Discuss the new proposal",
                "Team review meeting,10/11/2026,2:00 PM,10/11/2026,3:30 PM,Development,john@example.com,,In Progress,Low,Weekly sprint review",
              ],
            }}
            onClose={() => setShowImport(false)}
            onImported={(result) => {
              setShowImport(false);
              setActionMessage(result.message || "Tasks imported.");
              loadTasks({ silent: true }).catch(() => {});
            }}
          />
        )}

        {taskToDelete &&
          createPortal(
            <div
              className="ts-modal-overlay"
              style={styles.modalOverlay}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !deleting) {
                  setTaskToDelete(null);
                }
              }}
            >
              <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="ts-delete-title"
                style={{
                  ...styles.modal,
                  maxWidth: 420,
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: "#FDECEE",
                      color: "#A83C55",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={18} />
                  </div>
                  <div>
                    <h3 id="ts-delete-title" style={{ margin: 0, fontSize: 17, color: colors.navy }}>
                      Delete this task?
                    </h3>
                    <p style={{ margin: "6px 0 0", fontSize: 13, color: colors.muted, lineHeight: 1.5 }}>
                      <strong>{taskToDelete.name}</strong>
                      {taskToDelete.assignedUser ? ` (assigned to ${taskToDelete.assignedUser})` : ""} and
                      its attachments will be permanently removed
                      {taskToDelete.isGroup ? ` — for all ${taskToDelete.members.length} people` : ""}.
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setTaskToDelete(null)}
                    disabled={deleting}
                    style={styles.retryButton}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmDeleteTask}
                    disabled={deleting}
                    autoFocus
                    style={{
                      ...styles.retryButton,
                      background: "#A83C55",
                      borderColor: "#A83C55",
                      color: "#fff",
                      opacity: deleting ? 0.7 : 1,
                    }}
                  >
                    {deleting ? <Loader2 size={13} style={styles.spinner} /> : <Trash2 size={13} />}
                    {deleting ? "Deleting..." : "Delete task"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {actionError && (
          <div
            style={
              styles.workspaceError
            }
          >
            <AlertTriangle
              size={16}
            />

            <span
              style={{
                flex: 1,
              }}
            >
              {actionError}
            </span>

            <button
              type="button"
              onClick={() =>
                setActionError("")
              }
              style={
                styles.retryButton
              }
            >
              <X size={13} />

              Dismiss
            </button>
          </div>
        )}

        {/* =================================================
            STATS
        ================================================= */}

        <div
          style={
            styles.statsGrid
          }
        >
          <StatCard
            index={0}
            label="TOTAL TASKS"
            value={stats.total}
            total={stats.total}
            description="All workspace tasks"
            icon={ListChecks}
          />

          <StatCard
            index={1}
            label="TO DO"
            value={stats.todo}
            total={stats.total}
            description="Waiting to start"
            icon={Circle}
          />

          <StatCard
            index={2}
            label="IN PROGRESS"
            value={stats.progress}
            total={stats.total}
            description="Active work"
            icon={Clock3}
          />

          <StatCard
            index={3}
            label="REVIEW"
            value={stats.review}
            total={stats.total}
            description="Awaiting review"
            icon={Eye}
          />

          <StatCard
            index={4}
            label="COMPLETED"
            value={stats.completed}
            total={stats.total}
            description="Finished tasks"
            icon={CheckCircle2}
          />
        </div>

        {/* =================================================
            ANIMATED STATUS PIPELINE
        ================================================= */}

        <div
          className="ts-pipeline"
          style={
            styles.pipeline
          }
        >
          <div
            style={
              styles.pipelineHeader
            }
          >
            <div
              style={
                styles.pipelineTitle
              }
            >
              <Target
                size={15}
                color={
                  colors.ocean
                }
              />

              Workflow Flow

              <Zap
                size={13}
                color={
                  colors.ocean
                }
              />
            </div>

            <span
              style={
                styles.pipelineHint
              }
            >
              {stats.completed} completed ·{" "}
              {stats.progress} active
            </span>
          </div>

          <div
            className="ts-pipeline-track"
            style={
              styles.pipelineTrack
            }
          >
            {TASK_STATUSES.map(
              (
                statusName,
                index
              ) => {
                const config =
                  statusConfig[
                    statusName
                  ];

                const Icon =
                  config.icon;

                // same source as the stat cards, so the numbers always match
                const count =
                  groupedTasks.filter(
                    (task) =>
                      normalizeStatus(
                        task.status
                      ) ===
                      statusName
                  ).length;

                return (
                  <div
                    key={
                      statusName
                    }
                    className="ts-pipeline-step"
                    style={
                      styles.pipelineStep
                    }
                  >
                    <div
                      style={
                        styles.pipelineStepInner
                      }
                    >
                      <div
                        className="ts-pipeline-dot"
                        style={{
                          ...styles.pipelineDot,
                          background:
                            config.background,
                          color:
                            config.color,
                          borderColor:
                            colors.white,
                        }}
                      >
                        <Icon
                          size={12}
                        />
                      </div>

                      <div>
                        <div
                          style={{
                            ...styles.pipelineLabel,
                            color:
                              config.color,
                          }}
                        >
                          {statusName}
                        </div>

                        <div
                          style={{
                            fontSize: 9,
                            color:
                              colors.muted,
                            fontWeight: 700,
                          }}
                        >
                          {count}{" "}
                          task
                          {count !==
                          1
                            ? "s"
                            : ""}
                        </div>
                      </div>
                    </div>

                    {index <
                      TASK_STATUSES.length -
                        1 && (
                      <span
                        className="ts-pipeline-wave"
                        style={
                          styles.pipelineWave
                        }
                        aria-hidden="true"
                      >
                        <svg
                          viewBox="0 0 140 32"
                          preserveAspectRatio="none"
                          className="ts-pipeline-wave-svg"
                        >
                          <path
                            d="M0 16 C18 3, 32 3, 50 16 S82 29, 100 16 S122 3, 140 16"
                            pathLength="1"
                          />
                        </svg>
                      </span>
                    )}
                  </div>
                );
              }
            )}
          </div>
        </div>

        {/* =================================================
            FILTER BAR
        ================================================= */}

        <div
          className="ts-search-card"
          style={
            styles.filterCard
          }
        >
          <div
            style={
              styles.searchWrapper
            }
          >
            <Search size={17} />

            <input
              value={search}
              onChange={(e) =>
                setSearch(
                  e.target.value
                )
              }
              placeholder="Search tasks, users, departments..."
              style={
                styles.searchInput
              }
            />
          </div>

          <div
            style={
              styles.filterSelectWrapper
            }
          >
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value
                )
              }
              style={
                styles.filterSelect
              }
            >
              <option>
                All Status
              </option>

              {TASK_STATUSES.map(
                (status) => (
                  <option
                    key={status}
                  >
                    {status}
                  </option>
                )
              )}
            </select>

            <ChevronDown
              size={14}
              style={{
                position:
                  "absolute",
                right: 9,
                pointerEvents:
                  "none",
              }}
            />
          </div>

          <div
            style={
              styles.filterSelectWrapper
            }
          >
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              style={styles.filterSelect}
              aria-label="Department"
            >
              <option>All Departments</option>
              {departmentOptions.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <ChevronDown
              size={14}
              style={{ position: "absolute", right: 9, pointerEvents: "none" }}
            />
          </div>

          <div
            style={
              styles.filterSelectWrapper
            }
          >
            <select
              value={
                priorityFilter
              }
              onChange={(e) =>
                setPriorityFilter(
                  e.target.value
                )
              }
              style={
                styles.filterSelect
              }
            >
              <option>
                All Priority
              </option>

              {Object.keys(
                priorityConfig
              ).map((priority) => (
                <option
                  key={priority}
                >
                  {priority}
                </option>
              ))}
            </select>

            <ChevronDown
              size={14}
              style={{
                position:
                  "absolute",
                right: 9,
                pointerEvents:
                  "none",
              }}
            />
          </div>
        </div>

        {/* Filter opened from the Dashboard (Overdue, Due today…) — click ✕ to show all again */}
        {(quickFilter || sinceFilter || linkFilter.assignee || linkFilter.template || linkFilter.task || linkFilter.date) && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "-4px 0 14px" }}>
            <span style={{ fontSize: 12, color: colors.muted }}>Showing only:</span>
            {linkFilter.assignee && (
              <button type="button" style={styles.quickChip} title="Remove this filter"
                onClick={() => setLinkFilter((f) => ({ ...f, assignee: null }))}>
                Assigned to {linkFilter.assignee.name || "selected person"} <X size={12} />
              </button>
            )}
            {linkFilter.template && (
              <button type="button" style={styles.quickChip} title="Remove this filter"
                onClick={() => setLinkFilter((f) => ({ ...f, template: null }))}>
                From Task Bank: {linkFilter.template.name || "template"} <X size={12} />
              </button>
            )}
            {linkFilter.task && (
              <button type="button" style={styles.quickChip} title="Show all tasks"
                onClick={() => setLinkFilter((f) => ({ ...f, task: "" }))}>
                One task <X size={12} />
              </button>
            )}
            {linkFilter.date && (
              <button type="button" style={styles.quickChip} title="Remove this filter"
                onClick={() => setLinkFilter((f) => ({ ...f, date: "" }))}>
                Due {new Date(`${linkFilter.date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} <X size={12} />
              </button>
            )}
            {sinceFilter && (
              <button
                type="button"
                onClick={() => setSinceFilter("")}
                title="Remove this filter"
                style={styles.quickChip}
              >
                Created since {new Date(`${sinceFilter}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                <X size={12} />
              </button>
            )}
            {quickFilter && (
            <button
              type="button"
              onClick={() => setQuickFilter("")}
              title="Remove this filter"
              style={styles.quickChip}
            >
              {QUICK_FILTERS[quickFilter].label}
              <X size={12} />
            </button>
            )}
          </div>
        )}

        {/* =================================================
            TASK WORKSPACE
        ================================================= */}

        <div
          className="ts-workspace-card"
          style={
            styles.taskContainer
          }
        >
          <div
            style={
              styles.taskHeader
            }
          >
            <div>
              <h2
                style={
                  styles.taskTitle
                }
              >
                Workspace Tasks
              </h2>

              <p
                style={
                  styles.taskDescription
                }
              >
                {filteredTasks.length}{" "}
                task
                {filteredTasks.length !==
                1
                  ? "s"
                  : ""}{" "}
                found · Connected to your task database
              </p>
            </div>

            <div
              style={
                styles.taskToolbar
              }
            >
              <button
                type="button"
                className="ts-refresh"
                onClick={
                  handleRefresh
                }
                style={{
                  ...styles.refreshButton,
                  opacity:
                    refreshing
                      ? 0.55
                      : 1,
                  cursor:
                    refreshing
                      ? "wait"
                      : "pointer",
                }}
                title="Refresh workspace"
                disabled={
                  refreshing
                }
              >
                <RefreshCw
                  size={15}
                  style={
                    refreshing
                      ? styles.spinner
                      : undefined
                  }
                />
              </button>

              <div
                style={
                  styles.viewSwitcher
                }
              >
                <button
                  type="button"
                  onClick={() =>
                    setViewMode(
                      "rows"
                    )
                  }
                  style={{
                    ...styles.viewButton,
                    ...(viewMode ===
                    "rows"
                      ? styles.viewButtonActive
                      : {}),
                  }}
                >
                  <Rows3
                    size={15}
                  />

                  Rows
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setViewMode(
                      "columns"
                    )
                  }
                  style={{
                    ...styles.viewButton,
                    ...(viewMode ===
                    "columns"
                      ? styles.viewButtonActive
                      : {}),
                  }}
                >
                  <Columns3
                    size={15}
                  />

                  Columns
                </button>
              </div>

              {canCreateTasks && (
              <button
                type="button"
                onClick={
                  openCreateModal
                }
                style={
                  styles.smallCreateButton
                }
              >
                <Plus size={15} />

                Create Task
              </button>
              )}
            </div>
          </div>

          {tasksLoading ? (
            <div
              style={
                styles.tasksLoading
              }
            >
              <Loader2
                size={20}
                style={
                  styles.spinner
                }
              />

              <span>
                Loading workspace...
              </span>
            </div>
          ) : filteredTasks.length ===
            0 ? (
            <div
              style={
                styles.emptyState
              }
            >
              <div
                style={
                  styles.emptyIcon
                }
              >
                <Waves size={31} />
              </div>

              <h3
                style={
                  styles.emptyTitle
                }
              >
                No tasks in this view
              </h3>

              <p
                style={
                  styles.emptyText
                }
              >
                Create a new task or adjust your filters to see more work.
              </p>

              {canCreateTasks && (
              <button
                type="button"
                onClick={
                  openCreateModal
                }
                style={
                  styles.emptyButton
                }
              >
                <Plus size={17} />

                Create New Task
              </button>
              )}
             
            </div>
           
          ) : viewMode ===
            "rows" ? (
            <div
              style={
                styles.taskList
              }
            >
              {selectableTaskIds.length > 0 && (
                <BulkSelectBar {...taskSelect} label="tasks" onDelete={deleteSelectedTasks} />
              )}
              {taskPage.items.map(
                (
                  task,
                  index
                ) => (
                  <div
                    key={task.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      ...(taskSelect.isSelected(task.id) ? { outline: "2px solid #0e7490", outlineOffset: 3, borderRadius: 16 } : {}),
                    }}
                  >
                  {selectableTaskIds.length > 0 && (
                    <span style={{ width: 16, paddingTop: 20, flexShrink: 0 }}>
                      {selectableTaskIds.includes(task.id) && (
                        <SelectCheckbox
                          checked={taskSelect.isSelected(task.id)}
                          onChange={() => taskSelect.toggle(task.id)}
                          label={`Select ${task.name}`}
                        />
                      )}
                    </span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                  <TaskCard
                    {...groupCardProps(task)}
                    key={
                      task.id
                    }
                    task={task}
                    assignableUsers={users}
                    visibleFields={
                      visibleFields
                    }
                    onStatusChange={
                      handleStatusChange
                    }
                    onReview={handleReview}
                    onSubtasksChanged={reloadQuietly}
                    onFilterDepartment={setDepartmentFilter}
                    onEdit={editHandlerFor(
                      task
                    )}
                    onDelete={deleteHandlerFor(
                      task
                    )}
                    animationIndex={
                      index
                    }
                    statusUpdating={Boolean(
                      updatingTaskIds[
                        task.id
                      ]
                    )}
                  />
                  </div>
                  </div>
                )
              )}
              <Pagination {...taskPage} label="tasks" />
            </div>
          ) : (
            <div
              style={
                styles.columnBoard
              }
            >
              {TASK_STATUSES.map(
                (statusName) => {
                  const columnTasks =
                    filteredTasks.filter(
                      (task) =>
                        normalizeStatus(
                          task.status
                        ) ===
                        statusName
                    );

                  const status =
                    statusConfig[
                      statusName
                    ];

                  const StatusIcon =
                    status.icon;

                  return (
                    <div
                      key={
                        statusName
                      }
                      style={
                        styles.boardColumn
                      }
                    >
                      <div
                        style={
                          styles.boardColumnHeader
                        }
                      >
                        <div
                          style={
                            styles.boardColumnTitle
                          }
                        >
                          <span
                            style={{
                              ...styles.boardStatusDot,
                              background:
                                status.color,
                              boxShadow:
                                `0 0 0 4px ${status.background}`,
                            }}
                          />

                          <StatusIcon
                            size={14}
                          />

                          <strong>
                            {statusName}
                          </strong>
                        </div>

                        <span
                          style={
                            styles.boardCount
                          }
                        >
                          {
                            columnTasks.length
                          }
                        </span>
                      </div>

                      <div
                        style={
                          styles.boardColumnBody
                        }
                      >
                        {columnTasks.length ===
                        0 ? (
                          <div
                            style={
                              styles.boardEmpty
                            }
                          >
                            No tasks
                          </div>
                        ) : (
                          columnTasks.map(
                            (
                              task,
                              index
                            ) => (
                              <TaskCard
                                {...groupCardProps(task)}
                                key={
                                  task.id
                                }
                                task={
                                  task
                                }
                                assignableUsers={users}
                                visibleFields={
                                  visibleFields
                                }
                                onStatusChange={
                                  handleStatusChange
                                }
                                onReview={handleReview}
                                onSubtasksChanged={reloadQuietly}
                                onFilterDepartment={setDepartmentFilter}
                                onEdit={editHandlerFor(
                                  task
                                )}
                                onDelete={deleteHandlerFor(
                                  task
                                )}
                                animationIndex={
                                  index
                                }
                                boardMode
                                statusUpdating={Boolean(
                                  updatingTaskIds[
                                    task.id
                                  ]
                                )}
                              />
                            )
                          )
                        )}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </div>

        {/* =================================================
            MODAL
        ================================================= */}

        {showModal &&
          createPortal(
            <TaskFormModal
              key={
                editingTask
                  ? `edit-${editingTask.id}`
                  : "create"
              }
              onClose={() => {
                setShowModal(
                  false
                );
                setEditingTask(
                  null
                );
              }}
              onCreate={
                handleCreateTask
              }
              onUpdate={
                handleUpdateTask
              }
              editingTask={
                editingTask
              }
              departments={
                departments
              }
              users={users}
            />,
            document.body
          )}
      </div>
    </>
  );
};

/* =========================================================
   STAT CARD
========================================================= */

const StatCard = ({
  label,
  value,
  description,
  icon: Icon,
  index = 0,
  total = 0,
}) => {
  const percent =
    total > 0 && value > 0
      ? Math.min(100, Math.round((value / total) * 100))
      : 0;

  // Ocean-only palette: every statistic card stays within the Blizzboard ocean theme.
  const tone =
    index === 0
      ? {
          accent: "#16A6B8",
          soft: "#E6F8FA",
          glow:
            "rgba(22,166,184,.24)",
          mini: "Overview",
        }
      : index === 1
      ? {
          accent: "#1677A8",
          soft: "#EAF5FA",
          glow:
            "rgba(22,119,168,.22)",
          mini: "Queued",
        }
      : index === 2
      ? {
          accent: "#08798C",
          soft: "#E7F8FA",
          glow:
            "rgba(8,121,140,.22)",
          mini: "Live",
        }
      : index === 3
      ? {
          accent: "#2F83B1",
          soft: "#EAF4FB",
          glow:
            "rgba(47,131,177,.22)",
          mini: "Check",
        }
      : {
          accent: "#123B5D",
          soft: "#E8F2F7",
          glow:
            "rgba(18,59,93,.20)",
          mini: "Done",
        };

  return (
    <div
      className="ts-stat-card"
      style={{
        ...styles.statCard,
        animationDelay:
          `${index * 80}ms`,
        "--stat-accent":
          tone.accent,
        "--stat-soft":
          tone.soft,
        "--stat-glow":
          tone.glow,
      }}
    >
      <div
        className="ts-stat-orb"
        style={styles.statOrb}
      />

      <div
        className="ts-stat-orb-two"
        style={
          styles.statOrbTwo
        }
      />

      <Icon
        className="ts-stat-watermark"
        size={78}
      />

      <div
        style={
          styles.statTop
        }
      >
        <div
          style={
            styles.statLabelWrap
          }
        >
          <span
            style={
              styles.statLabelDot
            }
          />

          <span>
            {label}
          </span>
        </div>

        <div
          style={{
            ...styles.statIcon,
            background:
              tone.soft,
            color:
              tone.accent,
            boxShadow:
              `inset 0 0 0 1px ${tone.glow}`,
          }}
        >
          <Icon size={17} />
        </div>
      </div>

      <div
        style={
          styles.statValueRow
        }
      >
        <strong
          style={
            styles.statValue
          }
        >
          {value}
        </strong>

        <span
          style={{
            ...styles.statMiniBadge,
            color:
              tone.accent,
            background:
              tone.soft,
          }}
        >
          {tone.mini}
        </span>
      </div>

      <div
        className="ts-stat-progress"
        style={styles.statProgress}
      >
        <span
          style={{
            ...styles.statProgressFill,
            background:
              `linear-gradient(90deg, ${tone.accent}, ${colors.ocean})`,
            // real share of all tasks: 0 tasks → empty bar
            width: `${percent}%`,
          }}
        />
      </div>

      <p
        style={
          styles.statDescription
        }
      >
        {description}
      </p>
    </div>
  );
};

/* =========================================================
   TASK CARD
========================================================= */

const TaskCard = ({
  task,
  assignableUsers = [],
  visibleFields = {},
  onStatusChange,
  onReview,
  onSubtasksChanged,
  onEdit,
  onDelete,
  animationIndex = 0,
  boardMode = false,
  statusUpdating = false,
  // shared task (assigned to several people)
  expanded = false,
  onToggleExpand,
  memberActions,
  onFilterDepartment,
}) => {
  const navigate = useNavigate();
  const [monthlyOpen, setMonthlyOpen] = useState(false);
  const isMonthlyTask = task.taskType === "monthly" && task.monthly;
  // a shared Monthly Task keeps one tab per person — their totals are never added together
  const monthlyMembers = task.isGroup ? task.members : [task];

  const priority =
    priorityConfig[
      task.priority
    ];

  const currentStatus =
    normalizeStatus(
      task.status
    );

  const status =
    statusConfig[
      currentStatus
    ];

  const PriorityIcon =
    priority?.icon || Minus;

  const StatusIcon =
    status?.icon || Circle;

  return (
    <div
      className="ts-task-card"
      style={{
        ...styles.taskCard,
        animationDelay:
          `${animationIndex * 55}ms`,
      }}
    >
      {monthlyOpen && isMonthlyTask && (
        <MonthlyProgressModal
          members={monthlyMembers}
          initialId={monthlyMembers[0]?.id}
          onClose={() => setMonthlyOpen(false)}
          onChanged={onSubtasksChanged}
        />
      )}
      <div
        className="ts-task-accent"
        style={{
          ...styles.taskAccent,
          background:
            status?.color ||
            colors.ocean,
        }}
      />

      <div
        className="ts-task-main"
        style={{
          ...styles.taskCardMain,
          ...(boardMode
            ? styles.taskCardMainBoard
            : {}),
        }}
      >
        {/* STATUS ICON */}

        <div
          style={{
            ...styles.taskCheckbox,
            color:
              status?.color,
            background:
              status?.background,
            boxShadow:
              `inset 0 0 0 1px ${status?.color}22`,
          }}
        >
          <StatusIcon size={17} />
        </div>

        {/* TASK INFO */}

        <div
          style={
            styles.taskInfo
          }
        >
          <div
            style={
              styles.taskTopLine
            }
          >
            <h3
              style={{
                ...styles.taskCardTitle,
                ...(task.isGroup ? { cursor: "pointer" } : {}),
              }}
              onClick={task.isGroup ? onToggleExpand : undefined}
              title={task.isGroup ? "Show each person's part" : undefined}
            >
              {task.name}
            </h3>

            {task.isGroup && (
              <button
                type="button"
                onClick={onToggleExpand}
                style={styles.groupToggle}
                aria-expanded={expanded}
                title={expanded ? "Hide each person's part" : "Show each person's part"}
              >
                <UserRound size={11} />
                {task.members.length} people · {task.completedCount}/{task.members.length} done
                <ChevronDown
                  size={12}
                  style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform .2s" }}
                />
              </button>
            )}

            {task.referenceId && (
              <span
                style={
                  styles.referenceBadge
                }
              >
                #{task.referenceId}
              </span>
            )}

            {task.emailViewedAt && (
              <span
                style={{ ...styles.referenceBadge, display: "inline-flex", alignItems: "center", gap: 4, color: "#0F6A4A", background: "#E8F7F0" }}
                title={`${task.assignedUser || "The assignee"} opened this task from the email on ${new Date(task.emailViewedAt).toLocaleString()}${
                  task.emailUpdatedAt ? ` · last updated from email ${new Date(task.emailUpdatedAt).toLocaleString()}` : ""}`}
              >
                <MailOpen size={11} /> {task.emailUpdatedAt ? "Updated via email" : "Seen via email"}
              </span>
            )}

            {task.reworkOf?.referenceId && (
              <span
                style={{ ...styles.referenceBadge, color: "#B54708", background: "#FFF6E5" }}
                title={`Rework of "${task.reworkOf.name}"`}
              >
                Rework of #{task.reworkOf.referenceId}
              </span>
            )}
          </div>

          {task.description && (
            <p
              style={
                styles.taskCardDesc
              }
            >
              {task.description}
            </p>
          )}

          {boardMode && (
            <div
              style={{
                ...styles.boardMiniStatus,
                color:
                  status?.color,
                background:
                  status?.background,
                borderColor:
                  `${status?.color}55`,
              }}
            >
              <StatusIcon
                size={10}
              />

              {currentStatus}

              <span
                style={{
                  opacity:
                    0.6,
                }}
              >
                ·
              </span>

              {status?.description}
            </div>
          )}

          {isMonthlyTask && (
            <div style={{ marginTop: 6 }}>
              <MonthlySummaryChip
                monthly={task.monthly}
                label={task.isGroup ? `${task.members.length} people · daily progress` : undefined}
                onClick={() => setMonthlyOpen(true)}
              />
            </div>
          )}

          {(() => {
            const length = taskDuration(task.startDate, task.startTime, task.dueDate, task.dueTime);
            const reminder = remindersSummary(task.reminders) || reminderSummary(task.reminder);
            if (!length && !reminder) return null;
            return (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {length && (
                  <span
                    style={{ ...styles.referenceBadge, background: colors.oceanSoft, color: colors.oceanDark, display: "inline-flex", alignItems: "center", gap: 5 }}
                    title={length.range}
                  >
                    <Clock3 size={11} /> {length.label} · {length.range}
                  </span>
                )}
                {reminder && (
                  <span
                    style={{ ...styles.referenceBadge, background: "#FFF6E5", color: "#B54708", display: "inline-flex", alignItems: "center", gap: 5 }}
                  >
                    <Bell size={11} /> {reminder}
                  </span>
                )}
              </div>
            );
          })()}

          {/* META */}

          <div
            style={
              styles.taskMeta
            }
          >
            {visibleFields.department &&
              task.department && (
                <span
                  style={
                    styles.taskMetaItem
                  }
                  className={onFilterDepartment ? "app-link" : undefined}
                  {...(onFilterDepartment
                    ? linkProps(() => onFilterDepartment(task.department), `Show only ${task.department} tasks`)
                    : {})}
                >
                  <Building2
                    size={12}
                  />

                  {task.departments?.length ? task.departments.join(", ") : task.department}
                </span>
              )}

            {visibleFields.assignedUser &&
              task.assignedUser && (
                <span
                  style={
                    styles.taskMetaItem
                  }
                >
                  <UserRound
                    size={12}
                  />

                  {!task.isGroup && canOpen.users() ? (
                    <span
                      className="app-link"
                      {...linkProps(
                        () => navigate(appLinks.users({ search: task.assignedUser })),
                        `Open ${task.assignedUser} in Users`
                      )}
                    >
                      {task.assignedUser}
                    </span>
                  ) : (
                    task.assignedUser
                  )}
                </span>
              )}

            {visibleFields.assignedBy &&
              task.assignedByName && (
                <span
                  style={
                    styles.taskMetaItem
                  }
                  title={`Assigned by ${task.assignedByName}`}
                >
                  <UserCheck
                    size={12}
                  />

                  Assigned by {task.assignedByName}
                </span>
              )}

            {visibleFields.dueDate &&
              task.dueDate && (
                <span
                  style={
                    styles.taskMetaItem
                  }
                >
                  <CalendarDays
                    size={12}
                  />

                  <span
                    className={canOpen.calendar() ? "app-link" : undefined}
                    {...(canOpen.calendar()
                      ? linkProps(
                          () => navigate(appLinks.calendar({ date: task.dueDate })),
                          `Open ${task.dueDate} in the Task Calendar`
                        )
                      : {})}
                  >
                    {task.dueDate}
                    {task.dueTime ? ` · ${to12h(task.dueTime)}` : ""}
                  </span>
                </span>
              )}

            {task.sourceTemplate && canOpen.taskBank() && (
              <span
                style={styles.taskMetaItem}
                className="app-link"
                {...linkProps(
                  () => navigate(appLinks.taskBank({ item: task.sourceTemplate })),
                  "Open the Task Bank item this task came from"
                )}
              >
                <Archive size={12} />
                From Task Bank
              </span>
            )}
          </div>

          {/* ATTACHMENTS (saved on the task — download is authenticated) */}

          {Array.isArray(task.attachments) &&
            task.attachments.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 8,
                }}
              >
                {task.attachments.map((file, index) => (
                  <button
                    key={`${file.filename || file.name}-${index}`}
                    type="button"
                    disabled={!file.downloadable}
                    title={
                      file.downloadable
                        ? `Download ${file.name}${file.size ? ` (${formatFileSize(file.size)})` : ""}`
                        : "File not available on the server"
                    }
                    onClick={() =>
                      downloadAttachment(file).catch(() =>
                        window.alert(`Could not download ${file.name}.`)
                      )
                    }
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      maxWidth: 220,
                      padding: "4px 9px",
                      borderRadius: 8,
                      border: `1px solid ${colors.border}`,
                      background: colors.white,
                      color: file.downloadable ? colors.ocean : colors.muted,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: file.downloadable ? "pointer" : "not-allowed",
                    }}
                  >
                    <Paperclip size={11} />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {file.name}
                    </span>
                    {file.downloadable && <Download size={11} />}
                  </button>
                ))}
              </div>
            )}

          {/* PROGRESS */}

          <div
            style={
              styles.progressWrap
            }
          >
            <div
              style={
                styles.progressTrack
              }
            >
              <div
                style={{
                  ...styles.progressFill,
                  width:
                    `${task.isGroup ? task.progress : status?.progress || 0}%`,
                  background:
                    `linear-gradient(90deg, ${status?.color}, ${colors.ocean})`,
                }}
              />
            </div>

            <span
              style={
                styles.progressText
              }
            >
              {task.isGroup
                ? task.progress
                : status?.progress ||
                  0}
              %
            </span>
          </div>
        </div>

        {/* RIGHT */}

        <div
          className="ts-task-right"
          style={{
            ...styles.taskRight,
            ...(boardMode
              ? styles.taskRightBoard
              : {}),
          }}
        >
          {/* Shared task: each person changes their own status in the panel below */}
          {visibleFields.status && task.isGroup && (
            <span
              style={{
                ...styles.groupStatusBadge,
                color: status?.color,
                background: status?.background,
                borderColor: `${status?.color}55`,
              }}
              title="Overall status of everyone's parts"
            >
              <StatusIcon size={11} />
              {currentStatus}
            </span>
          )}

          {visibleFields.status &&
            !task.isGroup &&
            onStatusChange && (
              <div
                style={
                  styles.statusSelectWrapper
                }
              >
                <select
                  value={
                    currentStatus
                  }
                  onChange={(e) =>
                    onStatusChange(
                      task.id,
                      e.target
                        .value
                    )
                  }
                  disabled={
                    statusUpdating
                  }
                  style={{
                    ...styles.statusSelect,
                    borderColor:
                      `${status?.color}55`,
                    background:
                      status?.soft ||
                      colors.white,
                    opacity:
                      statusUpdating
                        ? 0.6
                        : 1,
                    cursor:
                      statusUpdating
                        ? "wait"
                        : "pointer",
                  }}
                  aria-label={`Change status for ${task.name}`}
                >
                  {TASK_STATUSES.map(
                    (s) => (
                      <option
                        key={s}
                        value={s}
                        disabled={statusOptionDisabled(task, s)}
                      >
                        {statusOptionLabel(task, s)}
                      </option>
                    )
                  )}
                </select>

                {statusUpdating ? (
                  <Loader2
                    size={12}
                    style={{
                      ...styles.statusSelectIcon,
                      animation:
                        "ts-spin .9s linear infinite",
                    }}
                  />
                ) : (
                  <ChevronDown
                    size={13}
                    style={
                      styles.statusSelectIcon
                    }
                  />
                )}
              </div>
            )}

          {priority && (
            <span
              style={{
                ...styles.priorityBadge,
                color:
                  priority.color,
                background:
                  priority.background,
              }}
            >
              <PriorityIcon
                size={12}
              />

              {task.priority}
            </span>
          )}

          <div
            style={
              styles.taskActions
            }
          >
            {onEdit && (
              <button
                type="button"
                onClick={() =>
                  onEdit(task)
                }
                style={
                  styles.editButton
                }
                title="Edit task"
              >
                <Pencil
                  size={14}
                />
              </button>
            )}

            {onDelete && (
              <button
                type="button"
                onClick={() =>
                  onDelete(
                    task.id
                  )
                }
                style={
                  styles.deleteButton
                }
                title="Delete task"
              >
                <Trash2
                  size={14}
                />
              </button>
            )}
          </div>
        </div>
      </div>

      {!task.isGroup && <ReviewInfo task={task} onReview={onReview} busy={statusUpdating} />}

      {!task.isGroup && (
        <div style={{ padding: "0 16px 12px" }}>
          <TaskComments task={task} onChanged={onSubtasksChanged} />
        </div>
      )}

      {!task.isGroup && task.checklist?.length > 0 && (
        <div style={{ padding: "0 16px 10px" }}>
          <ChecklistView
            taskId={task.id}
            items={task.checklist}
            onChanged={onSubtasksChanged}
            canAnswer={(item) => {
              const me = String(getSessionUser()?._id || getSessionUser()?.id || "");
              return (
                String(task.assignedTo) === me ||
                String(item.employee?.userId || "") === me ||
                canModifyTask(getSessionUser(), task)
              );
            }}
          />
        </div>
      )}

      {!task.isGroup && onSubtasksChanged && (
        <div style={{ padding: "0 16px 14px" }}>
          <SubtaskList task={task} users={assignableUsers} onChanged={onSubtasksChanged} />
        </div>
      )}

      {task.isGroup && expanded && (
        <GroupMembersPanel
          members={task.members}
          actions={memberActions}
        />
      )}
    </div>
  );
};

/* =========================================================
   Subtasks of one person's task: who assigned each one, tick,
   move to another person of the shared task, assign new ones.
   POST/PATCH/DELETE /api/tasks/:id/subtasks[/:subId]
========================================================= */
const SubtaskList = ({ task, users = [], others = [], onChanged, startOpen = false }) => {
  const me = getSessionUser();
  const myId = String(me?._id || me?.id || "");
  const canManage = canModifyTask(me, task);
  const isAssignee = String(task.assignedTo || "") === myId;
  const list = Array.isArray(task.subtasks) ? task.subtasks : [];
  const done = list.filter((s) => s?.completed).length;

  const [open, setOpen] = useState(startOpen);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  // new subtasks always go to this task's assignee
  const assigneeId = String(task.assignedTo || "");
  const [newFiles, setNewFiles] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  if (!list.length && !canManage) return null;

  const run = async (key, request) => {
    setBusy(key);
    setError("");
    try {
      await request();
      await onChanged?.();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Could not save the subtask.");
    } finally {
      setBusy("");
    }
  };

  const add = (e) => {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;
    run("add", async () => {
      if (newFiles.length || dueDate) {
        const body = new FormData();
        body.append("title", value);
        body.append("dueDate", dueDate);
        body.append("assignedTo", assigneeId);
        newFiles.forEach((file) => body.append("attachments", file));
        await api.post(`/tasks/${task.id}/subtasks`, body);
      } else {
        await api.post(`/tasks/${task.id}/subtasks`, { title: value, assignedTo: assigneeId });
      }
      setTitle("");
      setDueDate("");
      setNewFiles([]);
    });
  };

  const uploadFiles = (sub, fileList) => {
    const files = Array.from(fileList || []);
    const invalid = files.find((file) =>
      !ATTACHMENT_EXTENSIONS.includes(fileExtension(file.name)) ||
      file.size <= 0 ||
      file.size > MAX_ATTACHMENT_SIZE
    );
    if (invalid) {
      setError(`${invalid.name} is empty, too large, or an unsupported file type.`);
      return;
    }
    if (!files.length) return;
    run(`files-${sub._id}`, async () => {
      const body = new FormData();
      files.forEach((file) => body.append("attachments", file));
      await api.patch(`/tasks/${task.id}/subtasks/${sub._id}`, body);
    });
  };

  return (
    <div style={styles.subtaskBox}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={styles.subtaskToggle} aria-expanded={open}>
        <ListChecks size={13} />
        Subtasks {list.length ? `${done}/${list.length}` : ""}
        {canManage && !list.length ? " · assign one" : ""}
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {open && (
        <div style={{ marginTop: 6 }}>
          {list.length === 0 && <div style={styles.subtaskEmpty}>No subtasks yet.</div>}
          {list.map((sub, i) => {
            const key = sub._id || `${i}`;
            const canTick = Boolean(sub._id) && (canManage || isAssignee);
            return (
              <div key={key} style={styles.subtaskRow}>
                <input
                  type="checkbox"
                  checked={Boolean(sub.completed)}
                  disabled={!canTick || Boolean(busy)}
                  onChange={(e) =>
                    run(key, () => api.patch(`/tasks/${task.id}/subtasks/${sub._id}`, { completed: e.target.checked }))
                  }
                  aria-label={`Mark "${sub.title}" ${sub.completed ? "not done" : "done"}`}
                  style={{ accentColor: "#0f9b91", marginTop: 2, cursor: canTick ? "pointer" : "default" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...styles.subtaskItemTitle, textDecoration: sub.completed ? "line-through" : "none", opacity: sub.completed ? 0.65 : 1 }}>
                    {sub.title}
                  </div>
                  <div style={styles.subtaskMeta}>
                    <UserRound size={10} />
                    {sub.assignedByName ? `Assigned by ${sub.assignedByName}` : `Assigned by ${task.assignedByName || "the task creator"}`}
                    {sub.assignedToName ? ` · Assigned to ${sub.assignedToName}` : ""}
                    {sub.assignedToEmail ? ` (${sub.assignedToEmail})` : ""}
                    {sub.assignedAt ? ` · ${formatDateTime(sub.assignedAt)}` : ""}
                    {sub.completed && sub.completedAt ? ` · done ${formatDateTime(sub.completedAt)}` : ""}
                    {sub.dueDate ? ` · Due ${sub.dueDate}` : ""}
                  </div>
                  {(sub.attachments || []).length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 5 }}>
                      {sub.attachments.map((file, index) => (
                        <button
                          key={`${file.filename || file.name}-${index}`}
                          type="button"
                          disabled={!file.downloadable}
                          onClick={() => downloadAttachment(file).catch(() => setError(`Could not download ${file.name}.`))}
                          style={{ ...styles.subtaskMove, display: "inline-flex", alignItems: "center", gap: 4, cursor: file.downloadable ? "pointer" : "not-allowed" }}
                          title={file.downloadable ? `Download ${file.name}` : "File not available"}
                        >
                          <Paperclip size={10} /> {file.name}
                        </button>
                      ))}
                    </div>
                  )}
                  {(canManage || isAssignee) && sub._id && (
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 5, color: colors.blue, fontSize: 11, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>
                      <Upload size={11} /> Add file
                      <input
                        type="file"
                        multiple
                        accept={ATTACHMENT_EXTENSIONS.map((ext) => `.${ext}`).join(",")}
                        disabled={Boolean(busy)}
                        hidden
                        onChange={(event) => {
                          uploadFiles(sub, event.target.files);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
                {canManage && sub._id && (
                  <input
                    type="date"
                    value={sub.dueDate || ""}
                    disabled={Boolean(busy)}
                    onChange={(event) =>
                      run(`deadline-${sub._id}`, () => api.patch(`/tasks/${task.id}/subtasks/${sub._id}`, { dueDate: event.target.value }))
                    }
                    aria-label={`Deadline for ${sub.title}`}
                    title="Subtask deadline"
                    style={{ ...styles.subtaskMove, maxWidth: 132 }}
                  />
                )}
                {canManage && sub._id && others.length > 0 && (
                  <select
                    value=""
                    disabled={Boolean(busy)}
                    onChange={(e) =>
                      e.target.value &&
                      run(key, () => api.patch(`/tasks/${task.id}/subtasks/${sub._id}`, { moveTo: e.target.value }))
                    }
                    style={styles.subtaskMove}
                    aria-label={`Move "${sub.title}" to another person`}
                    title="Give this subtask to another person"
                  >
                    <option value="">Move to…</option>
                    {others.map((o) => (
                      <option key={o.id} value={o.id}>{o.assignedUser || "Unassigned"}</option>
                    ))}
                  </select>
                )}
                {canManage && sub._id && (
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      window.confirm(`Remove subtask "${sub.title}"?`) &&
                      run(key, () => api.delete(`/tasks/${task.id}/subtasks/${sub._id}`))
                    }
                    style={styles.subtaskRemove}
                    title="Remove subtask"
                    aria-label={`Remove "${sub.title}"`}
                  >
                    <X size={12} />
                  </button>
                )}
                {busy === key && <Loader2 size={12} style={{ animation: "ts-spin .9s linear infinite", color: colors.muted }} />}
              </div>
            );
          })}

          {canManage && (
            <form onSubmit={add} style={styles.subtaskAdd}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`Assign a subtask to ${task.assignedUser || "this person"}…`}
                maxLength={300}
                style={styles.subtaskInput}
                disabled={busy === "add"}
              />
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                aria-label="New subtask deadline"
                title="Subtask deadline"
                style={{ ...styles.subtaskMove, maxWidth: 142 }}
                disabled={busy === "add"}
              />
              <label style={{ ...styles.subtaskAddBtn, cursor: busy === "add" ? "wait" : "pointer" }}>
                <Paperclip size={12} /> Files
                <input
                  type="file"
                  multiple
                  accept={ATTACHMENT_EXTENSIONS.map((ext) => `.${ext}`).join(",")}
                  hidden
                  disabled={busy === "add"}
                  onChange={(event) => {
                    const selected = Array.from(event.target.files || []);
                    const invalid = selected.find((file) =>
                      !ATTACHMENT_EXTENSIONS.includes(fileExtension(file.name)) ||
                      file.size <= 0 ||
                      file.size > MAX_ATTACHMENT_SIZE
                    );
                    if (invalid) setError(`${invalid.name} is empty, too large, or an unsupported file type.`);
                    else setNewFiles(selected);
                    event.target.value = "";
                  }}
                />
              </label>
              <button type="submit" disabled={!title.trim() || busy === "add"} style={styles.subtaskAddBtn}>
                {busy === "add" ? <Loader2 size={12} style={{ animation: "ts-spin .9s linear infinite" }} /> : <Plus size={12} />}
                Assign
              </button>
            </form>
          )}
          {canManage && newFiles.length > 0 && (
            <div style={styles.subtaskMeta}>New files: {newFiles.map((file) => file.name).join(", ")}</div>
          )}
          {error && <div style={styles.subtaskError}>{error}</div>}
        </div>
      )}
    </div>
  );
};

/* =========================================================
   Each person's part of a shared task: status, dates, checklist
========================================================= */
const formatDateTime = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

const GroupMembersPanel = ({ members, actions = {} }) => (
  <div style={styles.groupPanel}>
    <div style={styles.groupMainTask}>
      <strong style={{ color: colors.text }}>Main task</strong>
      <span>
        <UserRound size={11} style={{ verticalAlign: "-1px" }} /> Assigned by{" "}
        <strong>{members[0]?.assignedByName || "the task creator"}</strong> to {members.length} people
        {members[0]?.createdAt ? ` · ${formatDateTime(members[0].createdAt)}` : ""}
      </span>
    </div>
    <div style={styles.groupPanelHead}>
      <ListChecks size={13} />
      Each person's part &amp; subtasks
    </div>

    {members.map((m) => {
      const mStatus = normalizeStatus(m.status);
      const conf = statusConfig[mStatus];
      const MIcon = conf?.icon || Circle;
      const checklist = checklistProgress(m);
      const last = m.statusHistory?.[m.statusHistory.length - 1];
      const updating = Boolean(actions.updatingTaskIds?.[m.id]);
      const onEdit = actions.editFor?.(m);
      const onDelete = actions.deleteFor?.(m);

      return (
        <div key={m.id} style={styles.groupMemberBlock}>
        <div className="ts-group-row" style={styles.groupRow}>
          <div style={styles.groupPerson}>
            <span style={{ ...styles.groupAvatar, background: conf?.background, color: conf?.color }}>
              {(m.assignedUser || "?").trim().charAt(0).toUpperCase()}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={styles.groupName}>{m.assignedUser || "Unassigned"}</div>
              <div style={styles.groupDetails}>
                {m.dueDate && (
                  <span style={styles.taskMetaItem}>
                    <CalendarDays size={11} />
                    {m.dueDate}
                    {m.dueTime ? ` · ${to12h(m.dueTime)}` : ""}
                  </span>
                )}
                {checklist.total > 0 && (
                  <span style={styles.taskMetaItem}>
                    <ListChecks size={11} />
                    {checklist.done}/{checklist.total} subtasks
                  </span>
                )}
                {mStatus === "Completed" && m.completedAt ? (
                  <span style={{ ...styles.taskMetaItem, color: conf?.color }}>
                    <CheckCircle2 size={11} />
                    Completed {formatDateTime(m.completedAt)}
                  </span>
                ) : last?.changedAt ? (
                  <span style={styles.taskMetaItem}>
                    <Clock3 size={11} />
                    {last.changedByName ? `${last.changedByName} → ` : ""}
                    {normalizeStatus(last.to)} · {formatDateTime(last.changedAt)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div style={styles.groupRowRight}>
            {actions.onStatusChange ? (
              <div style={styles.statusSelectWrapper}>
                <select
                  value={mStatus}
                  onChange={(e) => actions.onStatusChange(m.id, e.target.value)}
                  disabled={updating}
                  style={{
                    ...styles.statusSelect,
                    borderColor: `${conf?.color}55`,
                    background: conf?.soft || colors.white,
                    opacity: updating ? 0.6 : 1,
                    cursor: updating ? "wait" : "pointer",
                  }}
                  aria-label={`Status for ${m.assignedUser || "this person"}`}
                >
                  {TASK_STATUSES.map((st) => (
                    <option key={st} value={st} disabled={statusOptionDisabled(m, st)}>
                      {statusOptionLabel(m, st)}
                    </option>
                  ))}
                </select>
                {updating ? (
                  <Loader2 size={12} style={{ ...styles.statusSelectIcon, animation: "ts-spin .9s linear infinite" }} />
                ) : (
                  <ChevronDown size={13} style={styles.statusSelectIcon} />
                )}
              </div>
            ) : (
              <span style={{ ...styles.groupStatusBadge, color: conf?.color, background: conf?.background, borderColor: `${conf?.color}55` }}>
                <MIcon size={11} />
                {mStatus}
              </span>
            )}

            {actions.onReview && reviewRoleOf(m).canReview && (
              <ReviewActions task={m} onReview={actions.onReview} busy={updating} compact />
            )}

            {onEdit && (
              <button type="button" onClick={() => onEdit(m)} style={styles.editButton} title={`Edit ${m.assignedUser || "this person"}'s part`}>
                <Pencil size={13} />
              </button>
            )}
            {onDelete && (
              <button type="button" onClick={() => onDelete(m.id)} style={styles.deleteButton} title={`Remove ${m.assignedUser || "this person"}'s part`}>
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
        <div style={{ padding: "0 12px 8px" }}>
          <TaskComments task={m} onChanged={actions.onSubtasksChanged} />
        </div>
        <SubtaskList
          task={m}
          users={actions.users || []}
          others={members.filter((o) => o.id !== m.id)}
          onChanged={actions.onSubtasksChanged}
        />
        </div>
      );
    })}
  </div>
);

export default TasksPage;