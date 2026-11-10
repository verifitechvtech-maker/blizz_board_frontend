import React, { useEffect, useMemo, useState, useCallback } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import AchievementsCard from "./AchievementsCard";
import {
  Search, ChevronDown, ArrowUpRight, CheckCircle2,
  Clock3, AlertTriangle, Activity, Target, ListTodo, RotateCcw, Zap,
  MoreHorizontal, TrendingUp, Filter, Loader2, LogIn, Repeat,
  CalendarClock, UserX, User, Waves, Sparkles, Gauge, CircleDot
} from "lucide-react";
import { API_URL as ENV_API_URL } from "../../config/env";

/* =========================================================
   Blizzboard OCEAN MOTION DASHBOARD
   API / calculation logic preserved
========================================================= */

const API_URL =
  ENV_API_URL;

const getAuthToken = () =>
  localStorage.getItem("token") ||
  localStorage.getItem("authToken") ||
  localStorage.getItem("accessToken") ||
  localStorage.getItem("jwt") ||
  localStorage.getItem("userToken") ||
  "";

const getCurrentUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

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

const extractApiData = (response) => {
  const body = response?.data;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.users)) return body.users;
  if (Array.isArray(body?.departments)) return body.departments;
  if (Array.isArray(body?.tasks)) return body.tasks;
  return [];
};

const normalizeTask = (t) => ({
  id: t?._id || t?.id,
  name: t?.name || t?.title || "Untitled Task",
  department:
    typeof t?.department === "object"
      ? t?.department?.name || t?.department?.departmentName || ""
      : t?.department || "",
  assignedUser:
    typeof t?.assignedUser === "object"
      ? t?.assignedUser?.name || t?.assignedUser?.fullName || ""
      : t?.assignedUser || "",
  assignedUserId:
    typeof t?.assignedUser === "object"
      ? t?.assignedUser?._id || t?.assignedUser?.id || ""
      : "",
  status: t?.status || "To Do",
  priority: t?.priority || "Medium",
  recurring: Boolean(t?.recurring),
  dueDate: t?.dueDate ? String(t.dueDate).slice(0, 10) : "",
  createdAt: t?.createdAt || "",
  updatedAt: t?.updatedAt || t?.createdAt || "",
});

const normalizeDepartment = (item) => {
  if (typeof item === "string") return { id: item, name: item };
  return {
    id: item?._id || item?.id || item?.name,
    name:
      item?.name ||
      item?.departmentName ||
      item?.title ||
      item?.department ||
      "",
  };
};

const normalizeUser = (item) => ({
  id: item?._id || item?.id,
  name: item?.name || item?.fullName || item?.email || "User",
  email: item?.email || "",
  department:
    typeof item?.department === "object"
      ? item.department?.name || ""
      : item?.department || "",
});

const dayKey = (date) => new Date(date).toISOString().slice(0, 10);

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const daysAgo = (n) => {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
};

const localDayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Clickable cards / rows: Enter or Space acts like a click
const clickable = (onOpen, label) => ({
  role: "link",
  tabIndex: 0,
  "aria-label": label,
  onClick: onOpen,
  onKeyDown: (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  },
});

const isOverdue = (t) => {
  if (!t.dueDate || t.status === "Completed") return false;
  return new Date(`${t.dueDate}T23:59:59`) < new Date();
};

const isDueSoon = (t) => {
  if (!t.dueDate || t.status === "Completed") return false;
  const due = new Date(`${t.dueDate}T23:59:59`);
  const diff = due - new Date();
  return diff >= 0 && diff <= 3 * 24 * 60 * 60 * 1000;
};

/* Task Activity badges (notification type → label + tone class) */
const ACTIVITY_TYPES = {
  task_assigned: { label: "Assigned", tone: "assigned" },
  task_reassigned: { label: "Reassigned", tone: "reassigned" },
  task_status: { label: "Status", tone: "status" },
  task_viewed: { label: "Viewed", tone: "status" },
  task_reminder: { label: "Reminder", tone: "reminder" },
  task_overdue: { label: "Deadline", tone: "deadline" },
  support_ticket: { label: "Ticket", tone: "ticket" },
  support_reply: { label: "Ticket", tone: "ticket" },
};

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const DashboardPage = () => {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("This Month");
  const [department, setDepartment] = useState("All Departments");
  const [scoreScope, setScoreScope] = useState("mine");

  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeGlow, setActiveGlow] = useState(null);

  const currentUser = getCurrentUser();

  const userDisplayName =
    currentUser?.name ||
    currentUser?.fullName ||
    currentUser?.username ||
    currentUser?.email?.split("@")[0] ||
    "Guest";

  const currentUserId =
    currentUser?._id || currentUser?.id || currentUser?.userId || "";

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    if (!getAuthToken()) {
      setError("You are not logged in. Please sign in again.");
      setLoading(false);
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
      return;
    }

    try {
      const [tasksRes, usersRes, departmentsRes] = await Promise.all([
        api.get("/tasks"),
        api.get("/users/assignable"),
        api.get("/departments"),
      ]);

      setTasks(extractApiData(tasksRes).map(normalizeTask));
      setUsers(extractApiData(usersRes).map(normalizeUser));
      setDepartments(
        extractApiData(departmentsRes)
          .map(normalizeDepartment)
          .filter((d) => d.name)
      );
    } catch (err) {
      console.error("Dashboard load failed:", err);

      const status = err?.response?.status;

      if (status === 401) {
        setError("Session expired. Redirecting to login...");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setTimeout(() => {
          window.location.href = "/login";
        }, 1500);
      } else if (err?.code === "ERR_NETWORK") {
        setError("Cannot reach the server. Is the backend running on port 5000?");
      } else {
        setError(
          err?.response?.data?.message || "Unable to load dashboard data."
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  /* ===== Task activity (status changes by users, reminders, alerts) ===== */
  const [activity, setActivity] = useState([]);
  const [activityUnread, setActivityUnread] = useState(0);

  const loadActivity = useCallback(async () => {
    try {
      const res = await api.get("/notifications", { params: { limit: 15 } });
      setActivity(res.data?.data || []);
      setActivityUnread(res.data?.unread || 0);
    } catch {
      /* panel is optional — dashboard still works */
    }
  }, []);

  useEffect(() => {
    loadActivity();
    const timer = setInterval(loadActivity, 60 * 1000);
    // real time: refresh as soon as a notification arrives
    const onRealtime = () => {
      loadActivity();
      loadDashboard();
    };
    window.addEventListener("realtime:notification", onRealtime);
    return () => {
      clearInterval(timer);
      window.removeEventListener("realtime:notification", onRealtime);
    };
  }, [loadActivity, loadDashboard]);

  const markAllActivityRead = async () => {
    try {
      await api.patch("/notifications/read-all");
      setActivity((items) => items.map((n) => ({ ...n, read: true })));
      setActivityUnread(0);
    } catch {
      /* ignore */
    }
  };

  const isMyTask = useCallback(
    (t) => {
      if (currentUserId) {
        if (
          t.assignedUserId &&
          String(t.assignedUserId) === String(currentUserId)
        ) {
          return true;
        }

        if (
          t.assignedUser &&
          String(t.assignedUser) === String(currentUserId)
        ) {
          return true;
        }
      }

      const assigned = String(t.assignedUser || "").trim().toLowerCase();
      if (!assigned) return false;

      const candidates = [
        currentUser?.name,
        currentUser?.fullName,
        currentUser?.username,
        userDisplayName,
        currentUser?.email,
      ]
        .filter(Boolean)
        .map((v) => String(v).trim().toLowerCase());

      return candidates.includes(assigned);
    },
    [currentUserId, currentUser, userDisplayName]
  );

  const myTasks = useMemo(() => tasks.filter(isMyTask), [tasks, isMyTask]);

  const periodDays = {
    Today: 0,
    "This Week": 7,
    "This Month": 30,
    "Last 30 Days": 30,
  };

  const visibleTasks = useMemo(() => {
    let list = tasks;

    if (department !== "All Departments") {
      list = list.filter(
        (t) =>
          String(t.department).trim().toLowerCase() ===
          String(department).trim().toLowerCase()
      );
    }

    const days = periodDays[period];

    if (days !== undefined) {
      const cutoff = daysAgo(days);

      list = list.filter((t) => {
        if (!t.createdAt) return days === 30;
        return new Date(t.createdAt) >= cutoff;
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();

      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.assignedUser?.toLowerCase().includes(q) ||
          t.department?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [tasks, department, period, search]);

  const data = useMemo(() => {
    const today = startOfToday();

    return {
      total: visibleTasks.length,
      pending: visibleTasks.filter((t) => t.status === "To Do").length,
      inProgress: visibleTasks.filter((t) => t.status === "In Progress").length,
      review: visibleTasks.filter((t) => t.status === "Review").length,
      completed: visibleTasks.filter((t) => t.status === "Completed").length,
      overdue: visibleTasks.filter(isOverdue).length,
      dueSoon: visibleTasks.filter(isDueSoon).length,
      unassigned: visibleTasks.filter((t) => !t.assignedUser).length,
      recurring: visibleTasks.filter((t) => t.recurring).length,
      dueToday: visibleTasks.filter(
        (t) => t.dueDate && dayKey(t.dueDate) === dayKey(today)
      ).length,
    };
  }, [visibleTasks]);

  const myStats = useMemo(
    () => ({
      total: myTasks.length,
      completed: myTasks.filter((t) => t.status === "Completed").length,
      inProgress: myTasks.filter((t) => t.status === "In Progress").length,
      overdue: myTasks.filter(isOverdue).length,
    }),
    [myTasks]
  );

  const computeScore = useCallback((list, days) => {
    const cutoff = daysAgo(days);

    const touched = list.filter(
      (t) => t.updatedAt && new Date(t.updatedAt) >= cutoff
    );

    if (!touched.length) return 0;

    const done = touched.filter((t) => t.status === "Completed").length;

    return Math.round((done / touched.length) * 100);
  }, []);

  const myScore = useMemo(
    () => ({
      daily: computeScore(myTasks, 1),
      weekly: computeScore(myTasks, 7),
      monthly: computeScore(myTasks, 30),
      quarterly: computeScore(myTasks, 90),
    }),
    [myTasks, computeScore]
  );

  const teamScore = useMemo(
    () => ({
      daily: computeScore(tasks, 1),
      weekly: computeScore(tasks, 7),
      monthly: computeScore(tasks, 30),
      quarterly: computeScore(tasks, 90),
    }),
    [tasks, computeScore]
  );

  const activeScore = scoreScope === "mine" ? myScore : teamScore;

  const weekly = useMemo(() => {
    const source = scoreScope === "mine" ? myTasks : tasks;
    const days = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);

      const key = dayKey(d);
      const label = d.toLocaleDateString("en-US", {
        weekday: "short",
      });

      const value = source.filter((t) => {
        if (t.status !== "Completed") return false;

        const src = t.updatedAt || t.createdAt;

        return src && dayKey(src) === key;
      }).length;

      days.push({
        day: label,
        value,
        key,
      });
    }

    return days;
  }, [tasks, myTasks, scoreScope]);

  const donutTotal =
    data.pending + data.inProgress + data.review + data.completed;

  const donutPercentages = useMemo(() => {
    if (!donutTotal) {
      return {
        pending: 25,
        progress: 50,
        review: 75,
        completed: 100,
      };
    }

    const pending = (data.pending / donutTotal) * 100;
    const progress =
      pending + (data.inProgress / donutTotal) * 100;
    const review =
      progress + (data.review / donutTotal) * 100;

    return {
      pending,
      progress,
      review,
      completed: 100,
    };
  }, [
    donutTotal,
    data.pending,
    data.inProgress,
    data.review,
  ]);

  const maxWeekly = Math.max(
    ...weekly.map((item) => item.value),
    1
  );

  // Open the Tasks page showing exactly the tasks behind a number:
  // same department, period and search as the Dashboard, plus the card's own filter
  const navigate = useNavigate();
  const openTasks = (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    if (department !== "All Departments") params.set("department", department);
    const days = periodDays[period];
    if (days !== undefined) params.set("since", localDayKey(daysAgo(days)));
    if (search.trim()) params.set("search", search.trim());
    const query = params.toString();
    navigate(`/dashboard/tasks${query ? `?${query}` : ""}`);
  };

  // Department report (Reports page) for the department picked here
  const canViewReports = (() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      return u?.role === "SuperAdmin" || Boolean(u?.permissions?.reports?.includes("view"));
    } catch {
      return false;
    }
  })();
  const openReport = () =>
    navigate(
      `/dashboard/reports${department !== "All Departments" ? `?department=${encodeURIComponent(department)}` : ""}`
    );

  const completionRate = data.total
    ? Math.round((data.completed / data.total) * 100)
    : 0;

  const kpis = [
    {
      label: "TOTAL TASKS",
      filters: {},
      value: data.total,
      footer: `${completionRate}% completion · ${myStats.total} assigned to you`,
      icon: ListTodo,
      className: "kpi-total",
    },
    {
      label: "IN PROGRESS",
      filters: { status: "In Progress" },
      value: data.inProgress,
      footer: "Active work",
      icon: TrendingUp,
      className: "kpi-progress",
    },
    {
      label: "COMPLETED",
      filters: { status: "Completed" },
      value: data.completed,
      footer: "Finished tasks",
      icon: CheckCircle2,
      className: "kpi-completed",
    },
    {
      label: "REVIEW",
      filters: { status: "Review" },
      value: data.review,
      footer: "Awaiting review",
      icon: Clock3,
      className: "kpi-review",
    },
    {
      label: "OVERDUE",
      filters: { due: "overdue" },
      value: data.overdue,
      footer: `${data.dueToday} due today`,
      icon: AlertTriangle,
      className: "kpi-overdue",
    },
  ];

  const healthItems = [
    {
      value: data.overdue,
      label: "Overdue tasks",
      filters: { due: "overdue" },
      icon: AlertTriangle,
      alert: true,
    },
    {
      value: data.dueSoon,
      label: "Due in 3 days",
      filters: { due: "soon" },
      icon: CalendarClock,
    },
    {
      value: data.unassigned,
      label: "Unassigned tasks",
      filters: { due: "unassigned" },
      icon: UserX,
    },
    {
      value: data.recurring,
      label: "Recurring tasks",
      filters: { due: "recurring" },
      icon: Repeat,
    },
  ];

  return (
    <div className="ocean-dashboard">
      <style>{`
        * {
          box-sizing: border-box;
        }

        .ocean-dashboard {
          --ocean-950: #06253d;
          --ocean-900: #0b3454;
          --ocean-800: #124c70;
          --ocean-700: #176b8c;
          --ocean-600: #168fa8;
          --ocean-500: #25afbf;
          --ocean-400: #62c8d3;
          --ocean-300: #9bdee4;
          --ocean-200: #cfecef;
          --ocean-100: #e8f7f8;
          --ink: #17364f;
          --muted: #7891a2;

          min-height: calc(100vh - 145px);
          position: relative;
          isolation: isolate;
          overflow: hidden;
          padding: 24px 20px 70px;
          color: var(--ink);
          font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont,
            "Segoe UI", sans-serif;

          background:
            radial-gradient(circle at 8% 5%, rgba(51,177,193,.18), transparent 25%),
            radial-gradient(circle at 92% 10%, rgba(30,123,157,.13), transparent 27%),
            radial-gradient(circle at 52% 92%, rgba(74,188,201,.12), transparent 30%),
            linear-gradient(135deg, #eaf8fa 0%, #f6fcfd 45%, #e9f7f9 100%);

          animation: dashboardEntrance .75s ease both;
        }

        .ocean-dashboard::before {
          content: "";
          position: absolute;
          width: 420px;
          height: 420px;
          right: -160px;
          top: 100px;
          z-index: -1;
          border-radius: 50%;
          background:
            radial-gradient(circle,
              rgba(28,151,174,.16) 0%,
              rgba(28,151,174,.07) 38%,
              transparent 70%);
          filter: blur(10px);
          animation: oceanOrb 12s ease-in-out infinite;
        }

        .ocean-dashboard::after {
          content: "";
          position: absolute;
          width: 330px;
          height: 330px;
          left: -160px;
          bottom: 50px;
          z-index: -1;
          border-radius: 50%;
          background:
            radial-gradient(circle,
              rgba(82,193,202,.15),
              transparent 70%);
          filter: blur(12px);
          animation: oceanOrb 15s ease-in-out infinite reverse;
        }

        .ocean-container {
          width: 100%;
          max-width: 1760px;
          margin: 0 auto;
          position: relative;
          z-index: 2;
        }

        /* ===== floating particles ===== */

        .ocean-container::before,
        .ocean-container::after {
          content: "";
          position: fixed;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(33,154,177,.28);
          box-shadow:
            0 0 0 5px rgba(33,154,177,.035),
            0 0 25px rgba(33,154,177,.18);
          pointer-events: none;
          z-index: -1;
        }

        .ocean-container::before {
          left: 14%;
          bottom: 12%;
          animation: bubbleRise 11s linear infinite;
        }

        .ocean-container::after {
          right: 17%;
          bottom: 8%;
          width: 12px;
          height: 12px;
          animation: bubbleRise 14s linear infinite -5s;
        }

        /* ===== header ===== */

        .ocean-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
          animation: slideDown .7s cubic-bezier(.2,.8,.2,1) both;
        }

        .ocean-heading {
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .ocean-logo {
          width: 52px;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          border-radius: 16px;
          color: #fff;
          background:
            linear-gradient(145deg, #0b3150, #176b8c 75%);
          box-shadow:
            0 13px 30px rgba(10,67,95,.20),
            inset 0 1px rgba(255,255,255,.18);
          animation: logoFloat 4s ease-in-out infinite;
        }

        .ocean-logo::before {
          content: "";
          position: absolute;
          width: 70px;
          height: 18px;
          left: -55px;
          top: 7px;
          background: rgba(255,255,255,.22);
          transform: rotate(-28deg);
          animation: logoSweep 4.5s ease-in-out infinite;
        }

        .ocean-logo svg {
          position: relative;
          z-index: 2;
          filter: drop-shadow(0 0 7px rgba(255,255,255,.22));
        }

        .ocean-heading h1 {
          margin: 0;
          color: #17364f;
          font-size: 28px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: -.9px;
        }

        .ocean-heading p {
          margin: 6px 0 0;
          color: #7891a2;
          font-size: 11px;
        }

        /* ===== toolbar ===== */

        .ocean-toolbar {
          display: flex;
          align-items: center;
          gap: 9px;
          flex-wrap: wrap;
          margin-bottom: 17px;
          animation: slideUp .7s .06s ease both;
        }

        .ocean-search {
          flex: 1;
          min-width: 230px;
          height: 44px;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 0 13px;
          border: 1px solid #d1e6eb;
          border-radius: 12px;
          background: rgba(255,255,255,.9);
          box-shadow: 0 7px 22px rgba(18,75,99,.045);
          transition: .25s ease;
        }

        .ocean-search:focus-within {
          transform: translateY(-2px);
          border-color: #6cb6c5;
          box-shadow:
            0 10px 25px rgba(23,105,132,.08),
            0 0 0 4px rgba(38,163,183,.08);
        }

        .ocean-search svg {
          color: #7d9aaa;
          flex-shrink: 0;
        }

        .ocean-search input {
          width: 100%;
          border: 0;
          outline: 0;
          background: transparent;
          color: #294963;
          font-size: 11px;
        }

        .ocean-search input::placeholder {
          color: #9aadb8;
        }

        .ocean-select,
        .ocean-filter-btn {
          height: 44px;
          border: 1px solid #d1e6eb;
          border-radius: 11px;
          background: rgba(255,255,255,.92);
          color: #36566f;
          font-size: 10px;
          font-weight: 750;
          outline: none;
          cursor: pointer;
          transition: .25s ease;
        }

        .ocean-select {
          min-width: 155px;
          padding: 0 11px;
        }

        .ocean-select:hover,
        .ocean-select:focus,
        .ocean-filter-btn:hover {
          transform: translateY(-2px);
          border-color: #7dbaca;
          box-shadow: 0 9px 20px rgba(23,91,116,.08);
        }

        .ocean-filter-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 0 14px;
        }

        /* ===== banners ===== */

        .ocean-banner {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 12px 15px;
          margin-bottom: 16px;
          border-radius: 13px;
          font-size: 12px;
          font-weight: 650;
          animation: bannerIn .55s ease both;
        }

        .ocean-banner-error {
          border: 1px solid #e9c9c9;
          background: #fff7f7;
          color: #8d4a4a;
        }

        .ocean-banner-info {
          border: 1px solid #cfe3e8;
          background: rgba(255,255,255,.88);
          color: #36566f;
        }

        .ocean-retry {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 5px;
          border: 1px solid #cfe1e6;
          background: #fff;
          color: #30546d;
          border-radius: 8px;
          padding: 7px 11px;
          font-weight: 750;
          cursor: pointer;
          transition: .2s ease;
        }

        .ocean-retry:hover {
          transform: translateY(-2px);
        }

        .ocean-spinner {
          animation: spin 1s linear infinite;
        }

        /* ===== KPI ===== */

        .ocean-kpis {
          display: grid;
          grid-template-columns: 1.3fr 1fr 1fr 1fr 1fr;
          gap: 12px;
          margin-bottom: 17px;
        }

        .ocean-report-link {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid #b9dbe5;
          background: #fff;
          color: #176b8c;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }

        .ocean-report-link:hover {
          background: #eef7fa;
        }

        .ocean-link {
          cursor: pointer;
          transition: transform .18s ease, box-shadow .18s ease, background .18s ease;
        }

        .ocean-link:hover {
          transform: translateY(-2px);
        }

        .legend-row.ocean-link {
          border-radius: 8px;
          padding-left: 6px;
          padding-right: 6px;
        }

        .legend-row.ocean-link:hover {
          transform: none;
          background: #eef7fa;
        }

        .ocean-link:focus-visible {
          outline: 2px solid #2490a8;
          outline-offset: 3px;
        }

        .ocean-kpi {
          min-height: 125px;
          position: relative;
          overflow: hidden;
          padding: 17px;
          border: 1px solid #d2e6eb;
          border-radius: 17px;
          background:
            linear-gradient(145deg, rgba(255,255,255,.98), rgba(239,249,251,.95));
          box-shadow: 0 9px 27px rgba(23,66,89,.055);
          animation:
            kpiIn .72s cubic-bezier(.2,.8,.2,1) both,
            cardBreath 6s ease-in-out infinite;
          transition: transform .3s ease, box-shadow .3s ease, border-color .3s ease;
        }

        .ocean-kpi:nth-child(1) { animation-delay: .10s, 0s; }
        .ocean-kpi:nth-child(2) { animation-delay: .17s, -.7s; }
        .ocean-kpi:nth-child(3) { animation-delay: .24s, -1.4s; }
        .ocean-kpi:nth-child(4) { animation-delay: .31s, -2.1s; }
        .ocean-kpi:nth-child(5) { animation-delay: .38s, -2.8s; }

        .ocean-kpi:hover {
          transform: translateY(-6px) scale(1.012);
          border-color: #a9d0da;
          box-shadow: 0 18px 38px rgba(20,83,107,.11);
        }

        .ocean-kpi::before {
          content: "";
          position: absolute;
          width: 180px;
          height: 180px;
          right: -88px;
          top: -105px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(47,174,190,.17), transparent 68%);
          animation: kpiOrb 7s ease-in-out infinite;
        }

        .ocean-kpi::after {
          content: "";
          position: absolute;
          width: 92px;
          height: 92px;
          right: 22px;
          bottom: -68px;
          border: 1px solid rgba(33,110,137,.09);
          border-radius: 50%;
          box-shadow:
            0 0 0 12px rgba(33,110,137,.025),
            0 0 0 24px rgba(33,110,137,.018);
          animation: ringFloat 6s ease-in-out infinite;
        }

        .kpi-total { border-top: 3px solid #124c70; }
        .kpi-progress { border-top: 3px solid #176b8c; }
        .kpi-completed { border-top: 3px solid #168fa8; }
        .kpi-review { border-top: 3px solid #2b9ab0; }
        .kpi-overdue { border-top: 3px solid #27617d; }

        .kpi-content {
          position: relative;
          z-index: 3;
        }

        .kpi-label {
          color: #7892a2;
          font-size: 9px;
          letter-spacing: .85px;
          font-weight: 850;
        }

        .kpi-value {
          margin-top: 7px;
          color: #17364f;
          font-size: 30px;
          line-height: 1;
          font-weight: 900;
          letter-spacing: -1px;
          animation: numberPop .8s .4s both;
        }

        .kpi-footer {
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 5px;
          color: #7892a2;
          font-size: 9px;
        }

        .kpi-footer svg {
          color: #168fa8;
        }

        .kpi-icon {
          position: absolute;
          right: 15px;
          bottom: 14px;
          width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          color: #176b8c;
          background: linear-gradient(145deg, #e4f5f7, #d6edf1);
          z-index: 4;
          animation: iconFloat 4s ease-in-out infinite;
          box-shadow: inset 0 1px rgba(255,255,255,.9);
        }

        .ocean-kpi:hover .kpi-icon {
          animation: iconPulse .9s ease-in-out infinite;
        }

        /* ===== generic card ===== */

        .ocean-card {
          position: relative;
          overflow: hidden;
          background: rgba(255,255,255,.92);
          border: 1px solid #d6e8ec;
          border-radius: 17px;
          box-shadow: 0 8px 28px rgba(23,50,77,.045);
          transition: .3s ease;
          animation: sectionIn .75s .18s both;
        }

        .ocean-card::before {
          content: "";
          position: absolute;
          width: 180px;
          height: 180px;
          right: -120px;
          top: -120px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(49,175,191,.08), transparent 70%);
          pointer-events: none;
          transition: .4s ease;
        }

        .ocean-card:hover {
          border-color: #bcd9e0;
          box-shadow: 0 16px 38px rgba(20,77,101,.075);
        }

        .ocean-card:hover::before {
          transform: scale(1.35);
        }

        .ocean-card-header {
          position: relative;
          z-index: 2;
          padding: 16px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #e6f0f2;
        }

        .ocean-card-title {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .ocean-card-title-icon {
          width: 35px;
          height: 35px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          color: #176b8c;
          background: #e4f5f7;
          transition: .3s ease;
        }

        .ocean-card:hover .ocean-card-title-icon {
          transform: rotate(-5deg) scale(1.08);
          box-shadow: 0 0 0 7px rgba(30,145,165,.05);
        }

        .ocean-card-title h2 {
          margin: 0;
          color: #17364f;
          font-size: 13px;
          font-weight: 850;
        }

        .ocean-card-title p {
          margin: 3px 0 0;
          color: #8a9daa;
          font-size: 9px;
        }

        /* ===== main grid ===== */

        .ocean-main-grid {
          display: grid;
          grid-template-columns: 1.25fr .75fr;
          gap: 16px;
          margin-bottom: 16px;
        }

        /* ===== donut ===== */

        .distribution-body {
          padding: 22px;
          display: flex;
          align-items: center;
          gap: 38px;
        }

        .ocean-donut {
          width: 190px;
          height: 190px;
          flex-shrink: 0;
          border-radius: 50%;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          background: conic-gradient(
            #0e466a 0 ${donutPercentages.pending}%,
            #176b8c ${donutPercentages.pending}% ${donutPercentages.progress}%,
            #2490a8 ${donutPercentages.progress}% ${donutPercentages.review}%,
            #63aabc ${donutPercentages.review}% 100%
          );
          box-shadow:
            0 13px 34px rgba(24,91,115,.13),
            0 0 0 8px rgba(38,158,179,.035);
          animation: donutReveal 1.15s cubic-bezier(.2,.8,.2,1) both;
        }

        .ocean-donut::before {
          content: "";
          position: absolute;
          inset: -7px;
          border-radius: 50%;
          border: 1px dashed rgba(22,143,168,.28);
          animation: orbit 14s linear infinite;
        }

        .ocean-donut::after {
          content: "";
          position: absolute;
          width: 16px;
          height: 16px;
          top: 5px;
          left: 50%;
          border-radius: 50%;
          background: #fff;
          box-shadow: 0 0 0 5px rgba(255,255,255,.4);
          animation: orbitDot 5s linear infinite;
        }

        .donut-inner {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          background: #fff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          box-shadow:
            inset 0 0 0 1px #e1edef,
            0 0 0 8px rgba(255,255,255,.45);
        }

        .donut-total {
          color: #17364f;
          font-size: 30px;
          line-height: 1;
          font-weight: 900;
        }

        .donut-label {
          margin-top: 5px;
          color: #91a2ad;
          font-size: 8px;
          letter-spacing: .6px;
        }

        .donut-legend {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .legend-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px;
          border-radius: 9px;
          transition: .25s ease;
        }

        .legend-row:hover {
          transform: translateX(5px);
          background: #f1f8fa;
        }

        .legend-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          box-shadow: 0 0 0 4px rgba(33,141,161,.055);
          animation: dotPulse 2s ease-in-out infinite;
        }

        .legend-name {
          color: #647b8c;
          font-size: 10px;
        }

        .legend-number {
          color: #17364f;
          font-size: 11px;
          font-weight: 850;
        }

        /* ===== score ===== */

        .score-panel {
          color: #fff;
          border: 0;
          background:
            radial-gradient(circle at 90% 0%, rgba(65,181,199,.22), transparent 34%),
            linear-gradient(145deg, #082d4b, #0d4569 58%, #126b83);
          box-shadow: 0 17px 40px rgba(8,52,78,.18);
        }

        .score-panel::before {
          width: 260px;
          height: 260px;
          right: -110px;
          top: -140px;
          background: radial-gradient(circle, rgba(93,208,218,.13), transparent 70%);
        }

        .score-panel .ocean-card-header {
          border-bottom-color: rgba(255,255,255,.10);
        }

        .score-panel .ocean-card-title-icon {
          color: #d3f1f5;
          background: rgba(255,255,255,.09);
        }

        .score-panel .ocean-card-title h2 {
          color: #fff;
        }

        .score-panel .ocean-card-title p {
          color: #aac6d4;
        }

        .score-body {
          position: relative;
          z-index: 2;
          padding: 22px;
        }

        .score-toggle {
          display: flex;
          gap: 6px;
        }

        .score-toggle button {
          padding: 6px 11px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,.18);
          background: transparent;
          color: #a9c5d3;
          font-size: 9px;
          font-weight: 850;
          cursor: pointer;
          transition: .25s ease;
        }

        .score-toggle button:hover {
          transform: translateY(-2px);
          background: rgba(255,255,255,.09);
          color: #fff;
        }

        .score-toggle button.active {
          background: rgba(255,255,255,.17);
          color: #fff;
          border-color: rgba(255,255,255,.35);
          box-shadow: 0 0 18px rgba(105,210,220,.09);
        }

        .score-main {
          display: flex;
          align-items: center;
          gap: 22px;
          margin-bottom: 18px;
        }

        .score-ring {
          width: 145px;
          height: 145px;
          flex-shrink: 0;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          box-shadow:
            0 0 0 8px rgba(255,255,255,.035),
            0 0 35px rgba(143,198,218,.13);
          animation:
            scoreReveal 1.1s cubic-bezier(.2,.8,.2,1) both,
            scorePulse 3.5s ease-in-out 1.1s infinite;
        }

        .score-ring::after {
          content: "";
          position: absolute;
          inset: -8px;
          border-radius: 50%;
          border: 1px dashed rgba(180,232,239,.28);
          animation: orbit 11s linear infinite reverse;
        }

        .score-ring-inner {
          width: 105px;
          height: 105px;
          border-radius: 50%;
          background: #103a58;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          box-shadow: inset 0 0 20px rgba(0,0,0,.13);
        }

        .score-number {
          color: #fff;
          font-size: 30px;
          line-height: 1;
          font-weight: 900;
        }

        .score-outof {
          margin-top: 5px;
          color: #abc4d2;
          font-size: 8px;
          letter-spacing: .5px;
        }

        .score-text h3 {
          margin: 0;
          color: #fff;
          font-size: 15px;
        }

        .score-text p {
          margin: 7px 0 0;
          color: #b2c8d4;
          font-size: 10px;
          line-height: 1.6;
        }

        .score-chips {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 10px;
        }

        .score-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 9px;
          border-radius: 999px;
          background: rgba(255,255,255,.08);
          border: 1px solid rgba(255,255,255,.12);
          color: #cfe4ef;
          font-size: 9px;
          font-weight: 700;
          transition: .25s ease;
        }

        .score-chip:hover {
          transform: translateY(-2px);
          background: rgba(255,255,255,.14);
        }

        .score-chip-alert {
          background: rgba(232,110,110,.14);
          border-color: rgba(232,110,110,.3);
          color: #f3c2c2;
        }

        .score-empty {
          padding: 13px;
          border-radius: 10px;
          margin-bottom: 14px;
          background: rgba(255,255,255,.055);
          border: 1px dashed rgba(255,255,255,.22);
          color: #bcd3e0;
          font-size: 10px;
          line-height: 1.6;
          text-align: center;
          animation: emptyPulse 3s ease-in-out infinite;
        }

        .score-metrics {
          display: grid;
          grid-template-columns: repeat(4,1fr);
          gap: 7px;
        }

        .score-metric {
          padding: 10px 6px;
          text-align: center;
          border-radius: 9px;
          background: rgba(255,255,255,.055);
          border: 1px solid rgba(255,255,255,.07);
          transition: .25s ease;
        }

        .score-metric:hover {
          transform: translateY(-4px);
          background: rgba(255,255,255,.11);
        }

        .score-metric span {
          display: block;
          color: #a9c3d1;
          font-size: 8px;
        }

        .score-metric strong {
          display: block;
          margin-top: 4px;
          color: #fff;
          font-size: 12px;
        }

        /* ===== performance graph ===== */

        .performance {
          margin-bottom: 16px;
        }

        .performance-body {
          padding: 20px;
        }

        .graph {
          height: 270px;
          display: flex;
          align-items: flex-end;
          gap: 14px;
          position: relative;
          padding: 15px 15px 32px;
        }

        .graph-lines {
          position: absolute;
          inset: 15px 15px 32px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .graph-line {
          width: 100%;
          border-top: 1px dashed #dce9ed;
        }

        .graph-column {
          flex: 1;
          height: 100%;
          position: relative;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 2;
        }

        .graph-bar {
          width: 31px;
          min-height: 4px;
          border-radius: 9px 9px 3px 3px;
          background:
            linear-gradient(180deg, #35b2c0 0%, #177b99 48%, #0d4569 100%);
          box-shadow:
            0 8px 18px rgba(23,97,123,.16),
            inset 0 1px rgba(255,255,255,.35);
          transform-origin: bottom;
          animation:
            barGrow 1s cubic-bezier(.2,.8,.2,1) both,
            barShimmer 3s ease-in-out 1s infinite;
          transition: .25s ease;
          position: relative;
        }

        .graph-bar::before {
          content: "";
          position: absolute;
          top: 7px;
          left: 5px;
          right: 5px;
          height: 2px;
          border-radius: 99px;
          background: rgba(255,255,255,.35);
          animation: barHighlight 2.5s ease-in-out infinite;
        }

        .graph-column:hover .graph-bar {
          transform: translateY(-6px) scaleX(1.13);
          filter: brightness(1.08);
        }

        .graph-day {
          position: absolute;
          bottom: -24px;
          color: #8296a5;
          font-size: 9px;
          white-space: nowrap;
        }

        .graph-count {
          position: absolute;
          bottom: calc(100% + 6px);
          color: #176b8c;
          font-size: 9px;
          font-weight: 900;
          opacity: 0;
          transform: translateY(5px);
          transition: .2s ease;
        }

        .graph-column:hover .graph-count {
          opacity: 1;
          transform: translateY(0);
        }

        /* ===== bottom grid ===== */

        .ocean-bottom-grid {
          display: grid;
          grid-template-columns: .9fr 1.1fr;
          gap: 16px;
        }

        /* ===== animated workflow ===== */

        .workflow {
          position: relative;
          padding: 22px 20px 27px;
        }

        .workflow-track {
          position: absolute;
          left: 58px;
          right: 58px;
          top: 57px;
          height: 48px;
          pointer-events: none;
          overflow: visible;
          z-index: 0;
        }

        .workflow-track svg {
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        .workflow-wave-base {
          fill: none;
          stroke: #cfe7eb;
          stroke-width: 2;
        }

        .workflow-wave-flow {
          fill: none;
          stroke: #25afbf;
          stroke-width: 2.4;
          stroke-linecap: round;
          stroke-dasharray: 10 9;
          animation: waveFlow 4s linear infinite;
          filter: drop-shadow(0 0 4px rgba(37,175,191,.22));
        }

        .workflow-wave-glow {
          fill: none;
          stroke: rgba(37,175,191,.22);
          stroke-width: 8;
          stroke-linecap: round;
          stroke-dasharray: 8 11;
          animation: waveFlow 4s linear infinite reverse;
        }

        .workflow-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          position: relative;
          z-index: 2;
        }

        .workflow-step {
          min-height: 105px;
          padding: 14px 8px;
          text-align: center;
          border-radius: 13px;
          background: rgba(247,252,253,.94);
          border: 1px solid #d7e8ec;
          transition: .3s ease;
          position: relative;
          overflow: hidden;
          animation: workflowNodeIn .7s ease both;
        }

        .workflow-step:nth-child(1) { animation-delay: .05s; }
        .workflow-step:nth-child(2) { animation-delay: .14s; }
        .workflow-step:nth-child(3) { animation-delay: .23s; }
        .workflow-step:nth-child(4) { animation-delay: .32s; }

        .workflow-step::before {
          content: "";
          position: absolute;
          width: 70px;
          height: 70px;
          left: 50%;
          top: -48px;
          transform: translateX(-50%);
          border-radius: 50%;
          background: radial-gradient(circle, rgba(35,173,191,.16), transparent 70%);
          animation: nodeGlow 3s ease-in-out infinite;
        }

        .workflow-step:hover {
          transform: translateY(-7px);
          border-color: #a9d3dc;
          box-shadow: 0 13px 28px rgba(23,89,111,.10);
        }

        .workflow-node {
          width: 30px;
          height: 30px;
          margin: 0 auto 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          color: #176b8c;
          background: #e6f6f8;
          border: 1px solid #c7e5ea;
          position: relative;
          box-shadow: 0 0 0 6px rgba(35,166,183,.035);
          animation: nodePulse 2.4s ease-in-out infinite;
        }

        .workflow-node::after {
          content: "";
          position: absolute;
          inset: -6px;
          border-radius: 50%;
          border: 1px solid rgba(35,166,183,.13);
          animation: nodeRing 2.4s ease-out infinite;
        }

        .workflow-step strong {
          display: block;
          color: #17364f;
          font-size: 19px;
          font-weight: 900;
        }

        .workflow-step span {
          display: block;
          margin-top: 4px;
          color: #8296a5;
          font-size: 8px;
          letter-spacing: .45px;
          font-weight: 800;
        }

        .workflow-step-complete {
          background: linear-gradient(145deg, #edf9fa, #e2f5f6);
          border-color: #c1e0e5;
        }

        .workflow-step-complete .workflow-node {
          color: #fff;
          background: linear-gradient(145deg, #1a9cad, #116d89);
          border-color: transparent;
        }

        /* ===== health ===== */

        .health-grid {
          padding: 20px;
          display: grid;
          grid-template-columns: repeat(4,1fr);
          gap: 9px;
        }

        .health-item {
          position: relative;
          overflow: hidden;
          padding: 14px;
          border-radius: 12px;
          background: #f6fafb;
          border: 1px solid #dfecef;
          transition: .3s ease;
          animation: healthIn .7s ease both;
        }

        .health-item:nth-child(1) { animation-delay: .10s; }
        .health-item:nth-child(2) { animation-delay: .18s; }
        .health-item:nth-child(3) { animation-delay: .26s; }
        .health-item:nth-child(4) { animation-delay: .34s; }

        .health-item::after {
          content: "";
          position: absolute;
          width: 80px;
          height: 80px;
          right: -45px;
          bottom: -48px;
          border-radius: 50%;
          border: 1px solid rgba(31,143,164,.10);
          transition: .35s ease;
        }

        .health-item:hover {
          transform: translateY(-5px);
          border-color: #b9d6de;
          box-shadow: 0 12px 24px rgba(23,83,105,.07);
        }

        .health-item:hover::after {
          transform: scale(1.5);
        }

        .health-item-icon {
          width: 32px;
          height: 32px;
          margin-bottom: 11px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #e4f1f5;
          color: #176b8c;
          animation: iconFloat 4s ease-in-out infinite;
        }

        .health-item-alert .health-item-icon {
          background: #e9f5f7;
          color: #a24f5f;
        }

        .health-number {
          color: #17364f;
          font-size: 21px;
          font-weight: 900;
        }

        .health-label {
          margin-top: 3px;
          color: #8a9daa;
          font-size: 9px;
        }

        /* ===== team summary ===== */

        .team-summary {
          margin-top: 16px;
          animation-delay: .4s;
        }

        /* ===== task activity (end of dashboard) ===== */

        .task-activity {
          margin-top: 16px;
          animation-delay: .45s;
        }

        .activity-new-count {
          margin-left: 8px;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 10px;
          vertical-align: middle;
          background: #16a6b8;
          color: #fff;
        }

        .activity-mark-read {
          border: 1px solid #d5e7ee;
          background: #fff;
          color: #0b8f87;
          border-radius: 9px;
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          transition: .2s ease;
        }

        .activity-mark-read:hover {
          border-color: #9fd8de;
          background: #f2fbfc;
        }

        .activity-empty {
          margin: 0;
          padding: 14px 18px 18px;
          font-size: 12px;
          color: #8296a5;
        }

        .activity-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 320px;
          overflow-y: auto;
          padding: 14px 18px 18px;
        }

        .activity-item {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 9px 11px;
          border-radius: 12px;
          border: 1px solid #e3eef2;
          background: #fff;
          transition: .2s ease;
        }

        .activity-item.unread {
          background: #f4fbfc;
        }

        .activity-item:hover {
          border-color: #c5e3e9;
        }

        .activity-badge {
          flex-shrink: 0;
          font-size: 10px;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 999px;
        }

        .activity-badge.assigned { background: #eef7fa; color: #2f6f91; }
        .activity-badge.reassigned { background: #f1eefc; color: #6b4fc8; }
        .activity-badge.status { background: #eaf8f1; color: #17724a; }
        .activity-badge.reminder { background: #fff7e6; color: #b7791f; }
        .activity-badge.deadline { background: #fdecee; color: #a83c55; }
        .activity-badge.ticket { background: #ecfeff; color: #0e7490; }

        .activity-body {
          flex: 1;
          min-width: 0;
          font-size: 12px;
          color: #123b5d;
          line-height: 1.45;
          word-break: break-word;
        }

        .activity-from { color: #8296a5; }
        .activity-to { color: #0b8f87; }

        .activity-time {
          margin-top: 2px;
          font-size: 10px;
          color: #8296a5;
        }

        .activity-dot {
          width: 7px;
          height: 7px;
          margin-top: 5px;
          border-radius: 50%;
          flex-shrink: 0;
          background: #16a6b8;
        }

        /* ===== animations ===== */

        @keyframes dashboardEntrance {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-18px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes bannerIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes kpiIn {
          from {
            opacity: 0;
            transform: translateY(24px) scale(.94);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes sectionIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes numberPop {
          0% { opacity: 0; transform: scale(.55); }
          65% { opacity: 1; transform: scale(1.08); }
          100% { transform: scale(1); }
        }

        @keyframes logoFloat {
          0%,100% { transform: translateY(0) rotate(0); }
          50% { transform: translateY(-4px) rotate(-1deg); }
        }

        @keyframes logoSweep {
          0%, 65%, 100% { left: -70px; }
          35% { left: 65px; }
        }

        @keyframes oceanOrb {
          0%,100% { transform: translate3d(0,0,0) scale(1); }
          50% { transform: translate3d(-25px,-22px,0) scale(1.08); }
        }

        @keyframes bubbleRise {
          0% {
            opacity: 0;
            transform: translate3d(0,70px,0) scale(.7);
          }
          12% { opacity: 1; }
          100% {
            opacity: 0;
            transform: translate3d(35px,-80vh,0) scale(1.3);
          }
        }

        @keyframes kpiOrb {
          0%,100% { transform: translate(0,0); }
          50% { transform: translate(-14px,12px); }
        }

        @keyframes ringFloat {
          0%,100% { transform: scale(1) rotate(0); }
          50% { transform: scale(1.08) rotate(12deg); }
        }

        @keyframes iconFloat {
          0%,100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }

        @keyframes iconPulse {
          0%,100% { transform: scale(1); }
          50% { transform: scale(1.13) rotate(-3deg); }
        }

        @keyframes cardBreath {
          0%,100% { box-shadow: 0 9px 27px rgba(23,66,89,.055); }
          50% { box-shadow: 0 12px 30px rgba(23,106,127,.075); }
        }

        @keyframes donutReveal {
          from {
            opacity: 0;
            transform: rotate(-90deg) scale(.72);
          }
          to {
            opacity: 1;
            transform: rotate(0) scale(1);
          }
        }

        @keyframes orbit {
          to { transform: rotate(360deg); }
        }

        @keyframes orbitDot {
          to { transform: rotate(360deg) translateX(95px) rotate(-360deg); }
        }

        @keyframes dotPulse {
          0%,100% { transform: scale(1); }
          50% { transform: scale(1.35); }
        }

        @keyframes scoreReveal {
          from {
            opacity: 0;
            transform: rotate(-90deg) scale(.7);
          }
          to {
            opacity: 1;
            transform: rotate(0) scale(1);
          }
        }

        @keyframes scorePulse {
          0%,100% {
            box-shadow:
              0 0 0 8px rgba(255,255,255,.035),
              0 0 35px rgba(143,198,218,.13);
          }
          50% {
            box-shadow:
              0 0 0 13px rgba(255,255,255,.025),
              0 0 55px rgba(143,198,218,.23);
          }
        }

        @keyframes emptyPulse {
          0%,100% { border-color: rgba(255,255,255,.22); }
          50% { border-color: rgba(143,224,233,.46); }
        }

        @keyframes barGrow {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }

        @keyframes barShimmer {
          0%,100% { filter: brightness(1); }
          50% { filter: brightness(1.08); }
        }

        @keyframes barHighlight {
          0%,100% { opacity: .2; transform: translateY(0); }
          50% { opacity: .65; transform: translateY(8px); }
        }

        @keyframes waveFlow {
          to { stroke-dashoffset: -76; }
        }

        @keyframes workflowNodeIn {
          from {
            opacity: 0;
            transform: translateY(18px) scale(.92);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes nodeGlow {
          0%,100% { opacity: .35; transform: translateX(-50%) scale(.8); }
          50% { opacity: .8; transform: translateX(-50%) scale(1.2); }
        }

        @keyframes nodePulse {
          0%,100% { transform: scale(1); }
          50% { transform: scale(1.07); }
        }

        @keyframes nodeRing {
          0% {
            opacity: .55;
            transform: scale(.75);
          }
          100% {
            opacity: 0;
            transform: scale(1.35);
          }
        }

        @keyframes healthIn {
          from {
            opacity: 0;
            transform: translateY(14px) scale(.97);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* ===== responsive ===== */

        @media (max-width: 1200px) {
          .ocean-kpis {
            grid-template-columns: repeat(3, 1fr);
          }

          .ocean-main-grid,
          .ocean-bottom-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 800px) {
          .ocean-dashboard {
            padding: 18px 13px 45px;
          }

          .ocean-kpis {
            grid-template-columns: 1fr 1fr;
          }

          .distribution-body {
            flex-direction: column;
          }

          .score-main {
            flex-direction: column;
            text-align: center;
          }

          .score-chips {
            justify-content: center;
          }

          .health-grid {
            grid-template-columns: 1fr 1fr;
          }

          .workflow-track {
            display: none;
          }
        }

        @media (max-width: 600px) {
          .ocean-header {
            align-items: flex-start;
          }

          .ocean-heading h1 {
            font-size: 24px;
          }

          .ocean-toolbar {
            flex-direction: column;
          }

          .ocean-search,
          .ocean-select,
          .ocean-filter-btn {
            width: 100%;
          }

          .ocean-kpis {
            grid-template-columns: 1fr;
          }

          .score-metrics {
            grid-template-columns: 1fr 1fr;
          }

          .health-grid {
            grid-template-columns: 1fr 1fr;
          }

          .workflow-row {
            grid-template-columns: 1fr 1fr;
          }

          .graph {
            gap: 7px;
          }

          .graph-bar {
            width: 22px;
          }

          .graph-day {
            font-size: 8px;
          }
        }

        @media (max-width: 420px) {
          .ocean-dashboard {
            padding: 13px 9px 30px;
          }

          .ocean-heading {
            align-items: flex-start;
          }

          .ocean-logo {
            width: 45px;
            height: 45px;
          }

          .ocean-heading h1 {
            font-size: 22px;
          }

          .distribution-body {
            padding: 17px;
          }

          .ocean-donut {
            width: 165px;
            height: 165px;
          }

          .donut-inner {
            width: 105px;
            height: 105px;
          }

          .workflow-row {
            grid-template-columns: 1fr;
          }

          .health-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .ocean-dashboard *,
          .ocean-dashboard::before,
          .ocean-dashboard::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: .01ms !important;
          }
        }
      `}</style>

      <div className="ocean-container">

        <header className="ocean-header">
          <div className="ocean-heading">
            <div className="ocean-logo">
              <Waves size={23} />
            </div>

            <div>
              <h1>Dashboard</h1>
              <p>
                {getGreeting()}, {userDisplayName} — here's your workspace
                overview
              </p>
            </div>
          </div>
        </header>

        {error && (
          <div className="ocean-banner ocean-banner-error">
            <AlertTriangle size={15} />
            <span>{error}</span>

            {getAuthToken() ? (
              <button className="ocean-retry" onClick={loadDashboard}>
                <RotateCcw size={12} />
                Retry
              </button>
            ) : (
              <button
                className="ocean-retry"
                onClick={() => (window.location.href = "/login")}
              >
                <LogIn size={12} />
                Login
              </button>
            )}
          </div>
        )}

        {loading && !error && (
          <div className="ocean-banner ocean-banner-info">
            <Loader2 size={15} className="ocean-spinner" />
            <span>Loading dashboard data...</span>
          </div>
        )}

        <section className="ocean-toolbar">
          <div className="ocean-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks, users, departments..."
            />
          </div>

          <select
            className="ocean-select"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option>This Month</option>
            <option>This Week</option>
            <option>Today</option>
            <option>Last 30 Days</option>
          </select>

          <select
            className="ocean-select"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option>All Departments</option>
            {departments.map((d) => (
              <option key={d.id || d.name}>{d.name}</option>
            ))}
          </select>

          <button className="ocean-filter-btn">
            <Filter size={13} />
            Filters
            <ChevronDown size={12} />
          </button>
        </section>

        <section className="ocean-kpis">
          {kpis.map((item, index) => {
            const Icon = item.icon;

            return (
              <div
                className={`ocean-kpi ocean-link ${item.className}`}
                key={item.label}
                {...clickable(() => openTasks(item.filters), `Open ${item.label.toLowerCase()} in Tasks`)}
                onMouseEnter={() => setActiveGlow(index)}
                onMouseLeave={() => setActiveGlow(null)}
                style={{
                  boxShadow:
                    activeGlow === index
                      ? "0 20px 42px rgba(20,104,128,.15)"
                      : undefined,
                }}
              >
                <div className="kpi-content">
                  <div className="kpi-label">{item.label}</div>
                  <div className="kpi-value">{item.value}</div>

                  <div className="kpi-footer">
                    <Icon size={10} />
                    {item.footer}
                  </div>
                </div>

                <div className="kpi-icon">
                  <Icon size={15} />
                </div>
              </div>
            );
          })}
        </section>


        <section className="ocean-main-grid">

          <div className="ocean-card">
            <div className="ocean-card-header">
              <div className="ocean-card-title">
                <div className="ocean-card-title-icon">
                  <Activity size={15} />
                </div>

                <div>
                  <h2>Task Distribution</h2>
                  <p>Current workload across workflow stages</p>
                </div>
              </div>

              <MoreHorizontal size={17} color="#8296A5" />
            </div>

            <div className="distribution-body">
              <div
                className="ocean-donut ocean-link"
                {...clickable(() => openTasks(), "Open all tasks in Tasks")}
              >
                <div className="donut-inner">
                  <div className="donut-total">{data.total}</div>
                  <div className="donut-label">TOTAL TASKS</div>
                </div>
              </div>

              <div className="donut-legend">
                {[
                  ["To Do", data.pending, "#0e466a"],
                  ["In Progress", data.inProgress, "#176b8c"],
                  ["Review", data.review, "#2490a8"],
                  ["Completed", data.completed, "#63aabc"],
                ].map(([label, value, color]) => (
                  <div
                    className="legend-row ocean-link"
                    key={label}
                    {...clickable(() => openTasks({ status: label }), `Open ${label} tasks in Tasks`)}
                  >
                    <div className="legend-left">
                      <div
                        className="legend-dot"
                        style={{ background: color }}
                      />
                      <span className="legend-name">{label}</span>
                    </div>

                    <span className="legend-number">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="ocean-card score-panel">
            <div className="ocean-card-header">
              <div className="ocean-card-title">
                <div className="ocean-card-title-icon">
                  <Target size={15} />
                </div>

                <div>
                  <h2>
                    {scoreScope === "mine" ? "My Score" : "Team Score"}
                  </h2>

                  <p>
                    {scoreScope === "mine"
                      ? `${userDisplayName}'s productivity performance`
                      : "Whole team productivity performance"}
                  </p>
                </div>
              </div>

              <div className="score-toggle">
                <button
                  className={scoreScope === "mine" ? "active" : ""}
                  onClick={() => setScoreScope("mine")}
                >
                  <User size={9} style={{ marginRight: 4 }} />
                  MINE
                </button>

                <button
                  className={scoreScope === "team" ? "active" : ""}
                  onClick={() => setScoreScope("team")}
                >
                  TEAM
                </button>
              </div>
            </div>

            <div className="score-body">
              <div className="score-main">
                <div
                  className="score-ring"
                  style={{
                    background: `conic-gradient(
                      #9fe2ea ${activeScore.monthly}%,
                      rgba(255,255,255,.10) ${activeScore.monthly}% 100%
                    )`,
                  }}
                >
                  <div className="score-ring-inner">
                    <div className="score-number">
                      {activeScore.monthly}
                    </div>

                    <div className="score-outof">
                      SCORE / 100
                    </div>
                  </div>
                </div>

                <div className="score-text">
                  <h3>
                    {scoreScope === "mine"
                      ? "My Performance"
                      : "Team Performance"}
                  </h3>

                  {scoreScope === "mine" ? (
                    <>
                      <div className="score-chips">
                        <span className="score-chip">
                          <ListTodo size={9} />
                          {myStats.total} assigned
                        </span>

                        <span className="score-chip">
                          <CheckCircle2 size={9} />
                          {myStats.completed} completed
                        </span>

                        <span className="score-chip">
                          <TrendingUp size={9} />
                          {myStats.inProgress} active
                        </span>

                        <span className="score-chip score-chip-alert">
                          <AlertTriangle size={9} />
                          {myStats.overdue} overdue
                        </span>
                      </div>

                      <p>
                        Calculated only from tasks assigned to{" "}
                        <strong>{userDisplayName}</strong> — completed ÷
                        tasks touched × 100 for each time window.
                      </p>
                    </>
                  ) : (
                    <p>
                      Calculated across all team tasks — completed ÷
                      tasks touched × 100 for each time window.
                    </p>
                  )}
                </div>
              </div>

              {scoreScope === "mine" && myStats.total === 0 && (
                <div className="score-empty">
                  No tasks assigned to you yet. Your score will appear
                  automatically once tasks are assigned to {userDisplayName}.
                </div>
              )}

              <div className="score-metrics">
                <div className="score-metric">
                  <span>Daily</span>
                  <strong>{activeScore.daily}%</strong>
                </div>

                <div className="score-metric">
                  <span>Weekly</span>
                  <strong>{activeScore.weekly}%</strong>
                </div>

                <div className="score-metric">
                  <span>Monthly</span>
                  <strong>{activeScore.monthly}%</strong>
                </div>

                <div className="score-metric">
                  <span>Quarterly</span>
                  <strong>{activeScore.quarterly}%</strong>
                </div>
              </div>
            </div>
          </div>

        </section>

        <AchievementsCard />

        <section className="ocean-card performance">
          <div className="ocean-card-header">
            <div className="ocean-card-title">
              <div className="ocean-card-title-icon">
                <TrendingUp size={15} />
              </div>

              <div>
                <h2>Task Performance</h2>
                <p>
                  Tasks completed each day · last 7 days ·{" "}
                  {scoreScope === "mine"
                    ? userDisplayName
                    : "whole team"}
                </p>
              </div>
            </div>

            <select className="ocean-select">
              <option>Last 7 Days</option>
            </select>
          </div>

          <div className="performance-body">
            <div className="graph">
              <div className="graph-lines">
                <div className="graph-line" />
                <div className="graph-line" />
                <div className="graph-line" />
                <div className="graph-line" />
                <div className="graph-line" />
              </div>

              {weekly.map((item, index) => {
                const height =
                  item.value === 0
                    ? "4px"
                    : `${(item.value / maxWeekly) * 82}%`;

                return (
                  <div className="graph-column" key={item.key}>
                    {item.value > 0 && (
                      <span className="graph-count">
                        {item.value}
                      </span>
                    )}

                    <div
                      className="graph-bar"
                      style={{
                        height,
                        animationDelay: `${index * 90}ms`,
                      }}
                    />

                    <span className="graph-day">
                      {item.day}
                      {item.value > 0
                        ? ` · ${item.value}`
                        : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="ocean-bottom-grid">

          <div className="ocean-card workflow-card">
            <div className="ocean-card-header">
              <div className="ocean-card-title">
                <div className="ocean-card-title-icon">
                  <Waves size={15} />
                </div>

                <div>
                  <h2>Task Workflow</h2>
                  <p>Live movement through each stage</p>
                </div>
              </div>

              <Sparkles size={15} color="#25afbf" />
            </div>

            <div className="workflow">

              <div className="workflow-track">
                <svg viewBox="0 0 1000 80" preserveAspectRatio="none">
                  <path
                    className="workflow-wave-glow"
                    d="M0,38 C90,4 160,72 250,38 S410,4 500,38 S660,72 750,38 S910,4 1000,38"
                  />
                  <path
                    className="workflow-wave-base"
                    d="M0,38 C90,4 160,72 250,38 S410,4 500,38 S660,72 750,38 S910,4 1000,38"
                  />
                  <path
                    className="workflow-wave-flow"
                    d="M0,38 C90,4 160,72 250,38 S410,4 500,38 S660,72 750,38 S910,4 1000,38"
                  />
                </svg>
              </div>

              <div className="workflow-row">

                <div className="workflow-step">
                  <div className="workflow-node">
                    <CircleDot size={13} />
                  </div>
                  <strong>{data.pending}</strong>
                  <span>TO DO</span>
                </div>

                <div className="workflow-step">
                  <div className="workflow-node">
                    <Activity size={13} />
                  </div>
                  <strong>{data.inProgress}</strong>
                  <span>IN PROGRESS</span>
                </div>

                <div className="workflow-step">
                  <div className="workflow-node">
                    <Clock3 size={13} />
                  </div>
                  <strong>{data.review}</strong>
                  <span>REVIEW</span>
                </div>

                <div className="workflow-step workflow-step-complete">
                  <div className="workflow-node">
                    <CheckCircle2 size={13} />
                  </div>
                  <strong>{data.completed}</strong>
                  <span>COMPLETED</span>
                </div>

              </div>
            </div>
          </div>

          <div className="ocean-card">
            <div className="ocean-card-header">
              <div className="ocean-card-title">
                <div className="ocean-card-title-icon">
                  <Gauge size={15} />
                </div>

                <div>
                  <h2>Task Health</h2>
                  <p>Signals that need your attention</p>
                </div>
              </div>
            </div>

            <div className="health-grid">
              {healthItems.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    className={`health-item ocean-link ${
                      item.alert ? "health-item-alert" : ""
                    }`}
                    key={item.label}
                    {...clickable(() => openTasks(item.filters), `Open ${item.label.toLowerCase()} in Tasks`)}
                  >
                    <div className="health-item-icon">
                      <Icon size={14} />
                    </div>

                    <div className="health-number">
                      {item.value}
                    </div>

                    <div className="health-label">
                      {item.label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </section>

        <section className="ocean-banner ocean-banner-info team-summary">
          <CheckCircle2 size={15} />

          <span>
            {users.length} team member
            {users.length !== 1 ? "s" : ""} across{" "}
            {departments.length} department
            {departments.length !== 1 ? "s" : ""}
            {department !== "All Departments"
              ? ` · filtered by ${department}`
              : ""}
            {" "}· {myStats.total} assigned to you
            {" "}· period: {period}
          </span>

          {canViewReports && (
            <button type="button" className="ocean-report-link" onClick={openReport}>
              {department !== "All Departments" ? `${department} report` : "Department report"}
              <ArrowUpRight size={12} />
            </button>
          )}
        </section>

        <section className="ocean-card task-activity">
          <div className="ocean-card-header">
            <div className="ocean-card-title">
              <div className="ocean-card-title-icon">
                <Activity size={15} />
              </div>

              <div>
                <h2>
                  Task Activity
                  {activityUnread > 0 && (
                    <span className="activity-new-count">
                      {activityUnread} new
                    </span>
                  )}
                </h2>
                <p>Who changed task status, new assignments, reminders and deadline alerts</p>
              </div>
            </div>

            {activityUnread > 0 && (
              <button
                type="button"
                className="activity-mark-read"
                onClick={markAllActivityRead}
              >
                Mark all read
              </button>
            )}
          </div>

          {activity.length === 0 ? (
            <p className="activity-empty">
              No task activity yet. When someone changes the status of a task you assigned, it appears here.
            </p>
          ) : (
            <div className="activity-list">
              {activity.map((n) => {
                const kind = ACTIVITY_TYPES[n.type] || ACTIVITY_TYPES.task_status;

                return (
                  <div
                    key={n._id}
                    className={`activity-item${n.read ? "" : " unread"}`}
                  >
                    <span className={`activity-badge ${kind.tone}`}>
                      {kind.label}
                    </span>

                    <div className="activity-body">
                      {n.type === "task_status" ? (
                        <>
                          <strong>{n.actorName}</strong> changed <strong>{n.taskName}</strong>{" "}
                          <span className="activity-from">{n.fromStatus}</span> →{" "}
                          <strong className="activity-to">{n.toStatus}</strong>
                        </>
                      ) : (
                        n.message
                      )}

                      <div className="activity-time">
                        {new Date(n.createdAt).toLocaleString()}
                      </div>
                    </div>

                    {!n.read && <span className="activity-dot" />}
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>
    </div>
  );
};

export default DashboardPage;
