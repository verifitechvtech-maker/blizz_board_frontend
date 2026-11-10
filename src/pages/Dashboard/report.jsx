import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  ChevronDown,
  ClipboardCheck,
  Download,
  Filter,
  Layers3,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  CircleDot,
  Activity,
  FileText,
} from "lucide-react";

import { getReportSummary, exportReportCSV, getDepartmentNames } from "../../services/reportApi"; // ⚠️ adjust path

const localDayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Enter / Space acts like a click on a clickable row or bar
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
import IndividualReports from "./IndividualReports";

// ============ STATIC CONFIG ============

const EMPTY_TOTALS = {
  total: 0,
  completed: 0,
  early: 0,
  onTime: 0,
  late: 0,
  review: 0,
  progress: 0,
  pending: 0,
  overdue: 0,
};

const PRIORITY_META = {
  Critical: { icon: AlertTriangle, className: "priority-critical" },
  High: { icon: Activity, className: "priority-high" },
  Medium: { icon: CircleDot, className: "priority-medium" },
  Low: { icon: CircleDot, className: "priority-low" },
};

const PRIORITY_FALLBACK = { icon: CircleDot, className: "priority-low" };

const DONUT_COLORS = {
  Critical: "#dc5555",
  High: "#e24b4b",
  Medium: "#0ea5a0",
  Low: "#6fd3ca",
};

const STATUS_LEGEND = [
  { label: "Early Completion", className: "legend-early" },
  { label: "On-time Completion", className: "legend-on-time" },
  { label: "Late Completion", className: "legend-late" },
  { label: "Review", className: "legend-review" },
  { label: "In Progress", className: "legend-progress" },
  { label: "Pending", className: "legend-pending" },
  { label: "Overdue", className: "legend-overdue" },
];

const REPORT_HEADERS = [
  "Department",
  "Total Tasks",
  "Completed",
  "Early Completion",
  "On-time Completion",
  "Late Completion",
  "Review",
  "In Progress",
  "Pending",
  "Overdue",
];

const Report = () => {
  // ---------- FILTERS ----------
  const [reportType, setReportType] = useState("Task Summary");
  // "overview" = existing organization report | "individual" = per-person report
  const [view, setView] = useState("overview");
  const [dateRange, setDateRange] = useState("All time");
  // ?department=Sales (opened from the Dashboard) preselects the department
  const [department, setDepartment] = useState(
    () => new URLSearchParams(window.location.search).get("department") || "All Departments"
  );
  const [orgDepartmentNames, setOrgDepartmentNames] = useState([]);
  const [appliedRange, setAppliedRange] = useState({ start: null, end: null });
  const navigate = useNavigate();
  const [referenceId, setReferenceId] = useState("All Reference IDs");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // ---------- DATA FROM API ----------
  const [departments, setDepartments] = useState([]);
  const [allDepartmentNames, setAllDepartmentNames] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [totals, setTotals] = useState(EMPTY_TOTALS);
  const [meta, setMeta] = useState({
    completionRate: 0,
    activeTasks: 0,
    pendingTasks: 0,
    overdueTasks: 0,
  });

  // ---------- UI STATE ----------
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Debounce search (400ms) so we don't hit the API per keystroke
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const filters = useMemo(
    () => ({
      reportType,
      dateRange,
      department,
      referenceId,
      search: debouncedSearch,
    }),
    [reportType, dateRange, department, referenceId, debouncedSearch]
  );

  // ---------- FETCH ----------
  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getReportSummary(filters);

      const deptList = data.departments || [];
      setDepartments(deptList);
      setAppliedRange(data.range || { start: null, end: null });
      setPriorities(data.priorities || []);
      setTotals({ ...EMPTY_TOTALS, ...(data.totals || {}) });
      setMeta({
        completionRate: data.completionRate ?? 0,
        activeTasks: data.activeTasks ?? 0,
        pendingTasks: data.pendingTasks ?? 0,
        overdueTasks: data.overdueTasks ?? 0,
      });

      // Keep the dropdown full: only refresh name list when unfiltered
      if (department === "All Departments" && !debouncedSearch.trim()) {
        setAllDepartmentNames(deptList.map((d) => d.name));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, department, debouncedSearch]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // The organization's departments (Users → Departments), so ones without tasks are listed too
  useEffect(() => {
    getDepartmentNames().then(setOrgDepartmentNames).catch(() => {});
  }, []);

  const departmentChoices = useMemo(
    () =>
      [...new Set([...orgDepartmentNames, ...allDepartmentNames, department !== "All Departments" ? department : ""])]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [orgDepartmentNames, allDepartmentNames, department]
  );

  // Click a department → its tasks on the Tasks page, for the same period as this report
  const openDepartmentTasks = (name, filters = {}) => {
    const params = new URLSearchParams();
    if (name) params.set("department", name);
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    if (appliedRange.start) params.set("since", localDayKey(new Date(appliedRange.start)));
    navigate(`/dashboard/tasks?${params.toString()}`);
  };

  // ---------- DERIVED ----------
  const completionRate = meta.completionRate;
  const activeTasks = meta.activeTasks;
  const pendingTasks = meta.pendingTasks;
  const overdueTasks = meta.overdueTasks;

  const chartMax = useMemo(() => {
    const max = departments.reduce((m, d) => Math.max(m, d.total || 0), 0);
    return Math.max(10, Math.ceil(max / 10) * 10);
  }, [departments]);

  const yTicks = [1, 0.8, 0.6, 0.4, 0.2, 0].map((f) =>
    Math.round(chartMax * f)
  );

  const donutBackground = useMemo(() => {
    let angle = 0;
    const stops = (priorities || []).map((p) => {
      const color = DONUT_COLORS[p.name] || "#cbd5d5";
      const start = angle;
      angle += ((p.value || 0) / 100) * 360;
      return `${color} ${start}deg ${angle}deg`;
    });
    return angle > 0
      ? `conic-gradient(${stops.join(", ")})`
      : "conic-gradient(#e5efef 0deg 360deg)";
  }, [priorities]);

  // ---------- ACTIONS ----------
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadReport();
    setRefreshing(false);
  };

  // Escape values containing commas/quotes so the CSV stays valid
  const escapeCsvValue = (value) => {
    const str = String(value ?? "");
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  // ⭐ FALLBACK — builds the CSV from data already on screen
  // (departments state is already scope-filtered & respects all filters)
  const exportLocalCSV = () => {
    const rows = departments.map((item) =>
      [
        item.name,
        item.total,
        item.completed,
        item.early,
        item.onTime,
        item.late,
        item.review,
        item.progress,
        item.pending,
        item.overdue,
      ]
        .map(escapeCsvValue)
        .join(",")
    );

    const csv = [REPORT_HEADERS.join(","), ...rows].join("\n");

    // \ufeff (BOM) makes Excel open the file with correct encoding
    const blob = new Blob(["\ufeff" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `task-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ⭐ Export: try the backend first; if unreachable, use the local fallback
  const handleExport = async () => {
    if (exporting || departments.length === 0) return;

    setExporting(true);

    try {
      await exportReportCSV(filters); // preferred: server-side export
    } catch (err) {
      console.warn("Backend export failed, using local export:", err.message);
      exportLocalCSV(); // always works — data is already loaded
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="report-page">
      <style>{`
        * {
          box-sizing: border-box;
        }

        .report-page {
          min-height: 100vh;
          width: 100%;
          padding: 20px;
          background:
            radial-gradient(circle at 0% 0%, rgba(20, 184, 166, 0.13), transparent 28%),
            radial-gradient(circle at 100% 12%, rgba(14, 165, 233, 0.11), transparent 30%),
            linear-gradient(180deg, #f4fbfc 0%, #eef8f8 48%, #f8fcfc 100%);
          color: #082f3a;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .report-shell {
          width: 100%;
          max-width: 1650px;
          margin: 0 auto;
        }

        /* ================= HEADER ================= */

        .report-view-tabs {
          display: inline-flex;
          gap: 4px;
          padding: 4px;
          margin: 0 0 16px;
          border-radius: 14px;
          background: rgba(255,255,255,.9);
          border: 1px solid #d6e8ec;
        }

        .report-view-tabs button {
          border: none;
          background: transparent;
          border-radius: 10px;
          padding: 9px 16px;
          font-size: 13px;
          font-weight: 700;
          color: #4f6f7a;
          cursor: pointer;
          transition: .2s ease;
        }

        .report-view-tabs button.active {
          background: linear-gradient(135deg, #123b5d, #16a6b8);
          color: #fff;
          box-shadow: 0 8px 18px rgba(18,59,93,.18);
        }

        .report-hero {
          position: relative;
          overflow: hidden;
          min-height: 170px;
          padding: 28px;
          margin-bottom: 18px;
          border-radius: 26px;
          color: white;
          background: linear-gradient(135deg, #04343d 0%, #075c66 38%, #078c84 70%, #10a99a 100%);
          box-shadow: 0 20px 45px rgba(4, 73, 82, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.14);
        }

        .report-hero::before {
          content: "";
          position: absolute;
          width: 330px;
          height: 330px;
          border-radius: 50%;
          right: -120px;
          top: -210px;
          background: rgba(255, 255, 255, 0.075);
        }

        .report-hero::after {
          content: "";
          position: absolute;
          width: 240px;
          height: 240px;
          border-radius: 50%;
          left: 43%;
          bottom: -200px;
          background: rgba(255, 255, 255, 0.055);
        }

        .hero-content {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 25px;
        }

        .hero-left {
          display: flex;
          align-items: center;
          gap: 17px;
        }

        .hero-icon {
          width: 62px;
          height: 62px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 19px;
          background: rgba(255, 255, 255, 0.13);
          border: 1px solid rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(12px);
        }

        .hero-title {
          margin: 0;
          font-size: 29px;
          line-height: 1.1;
          font-weight: 850;
          letter-spacing: -0.8px;
        }

        .hero-subtitle {
          margin: 8px 0 0;
          color: rgba(255, 255, 255, 0.76);
          font-size: 13px;
        }

        .hero-actions {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .hero-button {
          height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 0 15px;
          border: 1px solid rgba(255,255,255,.22);
          border-radius: 12px;
          color: white;
          background: rgba(255,255,255,.1);
          backdrop-filter: blur(10px);
          cursor: pointer;
          font-size: 12px;
          font-weight: 750;
          transition: .2s ease;
        }

        .hero-button:hover {
          background: rgba(255,255,255,.17);
          transform: translateY(-1px);
        }

        .hero-button.primary {
          color: #08487c;
          background: white;
          border-color: white;
        }

        .hero-button:disabled {
          opacity: .6;
          cursor: not-allowed;
          transform: none;
        }

        /* ================= FILTER ================= */

        .configuration-card {
          position: relative;
          overflow: hidden;
          margin-bottom: 18px;
          border: 1px solid #d5e7e9;
          border-radius: 21px;
          background: rgba(255,255,255,.94);
          box-shadow: 0 9px 30px rgba(5, 71, 81, .055);
        }

        .configuration-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 19px 20px 16px;
          border-bottom: 1px solid #e4eef0;
        }

        .configuration-title {
          display: flex;
          align-items: center;
          gap: 9px;
          margin: 0;
          font-size: 17px;
          font-weight: 800;
          color: #092f3a;
        }

        .configuration-title svg {
          color: #0a2d6f;
        }

        .configuration-subtitle {
          margin: 4px 0 0;
          color: #12266b;
          font-size: 11px;
        }

        .configuration-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 10px;
          border-radius: 999px;
          color: #073b84;
          background: #e9f9f6;
          font-size: 10px;
          font-weight: 800;
        }

        .configuration-badge.loading {
          color: #b45309;
          background: #fef3c7;
        }

        .filter-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr 1fr 1.15fr;
          gap: 12px;
          padding: 17px 20px 20px;
        }

        .filter-field label {
          display: block;
          margin: 0 0 7px 2px;
          color: #54717a;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .7px;
        }

        .select-wrap {
          position: relative;
        }

        .filter-select {
          width: 100%;
          height: 43px;
          padding: 0 37px 0 13px;
          appearance: none;
          outline: none;
          border: 1px solid #d9e7ea;
          border-radius: 11px;
          background: #f8fbfc;
          color: #183d47;
          font-size: 12px;
          font-weight: 650;
          cursor: pointer;
          transition: .2s ease;
        }

        .filter-select:hover {
          border-color: #103879;
          background: #ffffff;
        }

        .filter-select:focus {
          border-color: #0c1ea3;
          box-shadow: 0 0 0 4px rgba(12,163,151,.09);
          background: white;
        }

        .select-chevron {
          position: absolute;
          right: 12px;
          top: 50%;
          pointer-events: none;
          transform: translateY(-50%);
          color: #77929a;
        }

        .search-field {
          position: relative;
        }

        .search-field svg {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #78949c;
        }

        .search-input {
          width: 100%;
          height: 43px;
          padding: 0 13px 0 38px;
          border: 1px solid #d9e7ea;
          outline: none;
          border-radius: 11px;
          background: #f8fbfc;
          color: #173c46;
          font-size: 12px;
        }

        .search-input:focus {
          border-color: #0ca397;
          box-shadow: 0 0 0 4px rgba(12,163,151,.09);
          background: white;
        }

        /* ================= KPI ================= */

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 13px;
          margin-bottom: 18px;
        }

        .kpi-card {
          position: relative;
          overflow: hidden;
          min-height: 116px;
          padding: 17px;
          border: 1px solid #d7e7e9;
          border-radius: 18px;
          background: rgba(255,255,255,.96);
          box-shadow: 0 8px 24px rgba(7, 69, 78, .055);
        }

        .kpi-card::after {
          content: "";
          position: absolute;
          width: 110px;
          height: 110px;
          right: -55px;
          bottom: -60px;
          border-radius: 50%;
          background: rgba(8, 163, 148, .07);
        }

        .kpi-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .kpi-label {
          color: #708c95;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .8px;
        }

        .kpi-icon {
          width: 37px;
          height: 37px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 11px;
          color: #078e83;
          background: #e8f8f5;
        }

        .kpi-value {
          margin-top: 8px;
          color: #082f3a;
          font-size: 26px;
          line-height: 1;
          font-weight: 850;
        }

        .kpi-foot {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 9px;
          color: #739099;
          font-size: 10px;
        }

        .kpi-foot strong {
          color: #078c81;
        }

        /* ================= REPORT GRID ================= */

        .report-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.55fr) minmax(320px, .85fr);
          gap: 18px;
          margin-bottom: 18px;
        }

        .chart-card {
          min-width: 0;
          border: 1px solid #d6e6e9;
          border-radius: 21px;
          background: rgba(255,255,255,.96);
          box-shadow: 0 9px 30px rgba(5, 71, 81, .055);
          overflow: hidden;
        }

        .chart-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 15px;
          padding: 20px 20px 12px;
        }

        .chart-heading {
          display: flex;
          align-items: flex-start;
          gap: 10px;
        }

        .chart-heading-icon {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 11px;
          color: #078e83;
          background: #e8f8f5;
        }

        .chart-title {
          margin: 0;
          font-size: 16px;
          font-weight: 800;
          color: #0a303a;
        }

        .chart-description {
          margin: 4px 0 0;
          color: #78929b;
          font-size: 11px;
        }

        .chart-total {
          text-align: right;
        }

        .chart-total-number {
          color: #087f76;
          font-size: 22px;
          line-height: 1;
          font-weight: 850;
        }

        .chart-total-label {
          margin-top: 4px;
          color: #839ba2;
          font-size: 9px;
          text-transform: uppercase;
          font-weight: 800;
        }

        /* ================= BAR CHART ================= */

        .bar-chart {
          height: 330px;
          display: flex;
          gap: 15px;
          padding: 15px 20px 8px;
        }

        .y-axis {
          width: 30px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 8px 0 33px;
        }

        .y-axis span {
          color: #91a8ae;
          font-size: 9px;
          text-align: right;
        }

        .bars-area {
          position: relative;
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: flex-end;
          justify-content: space-around;
          gap: 10px;
          padding: 10px 0 32px;
          border-bottom: 1px solid #dce9eb;
          background:
            repeating-linear-gradient(
              to top,
              transparent 0,
              transparent 58px,
              #edf4f5 59px,
              #edf4f5 60px
            );
        }

        .report-link {
          cursor: pointer;
        }

        tr.report-link:hover td {
          background: #eef7fa;
        }

        .department-column.report-link:hover .bar-stack {
          filter: brightness(1.08);
          transform: translateY(-2px);
        }

        .report-link:focus-visible {
          outline: 2px solid #0ea5a0;
          outline-offset: 2px;
        }

        .department-column {
          height: 100%;
          min-width: 60px;
          max-width: 130px;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          align-items: center;
        }

        .bar-stack {
          width: min(66px, 75%);
          height: 245px;
          display: flex;
          flex-direction: column-reverse;
          border-radius: 9px 9px 3px 3px;
          overflow: hidden;
          background: #edf5f6;
          box-shadow: inset 0 0 0 1px rgba(5,91,98,.04);
        }

        .bar {
          width: 100%;
          min-height: 2px;
          transition: .25s ease;
        }

        .bar:hover {
          filter: brightness(.95);
        }

        .bar-early { background: #11b981; }
        .bar-on-time { background: #0ea5c9; }
        .bar-late { background: #e24b4b; }
        .bar-review { background: #f97316; }
        .bar-progress { background: #4f8df7; }
        .bar-pending { background: #f4b51c; }
        .bar-overdue { background: #ef6262; }

        .department-label {
          position: absolute;
          bottom: 7px;
          width: 100px;
          color: #607d87;
          font-size: 9px;
          font-weight: 750;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 9px 15px;
          padding: 11px 20px 18px;
          border-top: 1px solid #edf3f4;
        }

        .legend-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #667f88;
          font-size: 9px;
          font-weight: 700;
        }

        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .legend-early .legend-dot { background: #11b981; }
        .legend-on-time .legend-dot { background: #0ea5c9; }
        .legend-late .legend-dot { background: #e24b4b; }
        .legend-review .legend-dot { background: #f97316; }
        .legend-progress .legend-dot { background: #4f8df7; }
        .legend-pending .legend-dot { background: #f4b51c; }
        .legend-overdue .legend-dot { background: #ef6262; }

        /* ================= PRIORITY ================= */

        .priority-body {
          padding: 13px 20px 20px;
        }

        .donut-area {
          min-height: 260px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .donut {
          width: 190px;
          height: 190px;
          position: relative;
          border-radius: 50%;
          box-shadow: 0 12px 35px rgba(7, 128, 119, .13), inset 0 0 0 1px rgba(255,255,255,.35);
        }

        .donut::after {
          content: "";
          position: absolute;
          inset: 34px;
          border-radius: 50%;
          background: white;
          box-shadow: 0 0 0 1px #edf3f4;
        }

        .donut-center {
          position: absolute;
          z-index: 2;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .donut-center strong {
          color: #0a333d;
          font-size: 28px;
          line-height: 1;
          font-weight: 850;
        }

        .donut-center span {
          margin-top: 5px;
          color: #7c969e;
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: .8px;
        }

        .priority-list {
          display: grid;
          gap: 9px;
        }

        .priority-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 11px;
          border: 1px solid #e1ecee;
          border-radius: 12px;
          background: #fbfdfd;
        }

        .priority-left {
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .priority-icon {
          width: 31px;
          height: 31px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
        }

        .priority-critical .priority-icon { color: #b91c1c; background: #fee2e2; }
        .priority-high .priority-icon { color: #d94b4b; background: #fff0f0; }
        .priority-medium .priority-icon { color: #087f76; background: #e7f8f5; }
        .priority-low .priority-icon { color: #4d9b94; background: #edf8f7; }

        .priority-name {
          color: #294c56;
          font-size: 11px;
          font-weight: 750;
        }

        .priority-value {
          color: #0a3741;
          font-size: 13px;
          font-weight: 850;
        }

        /* ================= TABLE ================= */

        .table-card {
          border: 1px solid #d5e6e9;
          border-radius: 21px;
          overflow: hidden;
          background: rgba(255,255,255,.96);
          box-shadow: 0 9px 30px rgba(5, 71, 81, .055);
        }

        .table-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 19px 20px;
          border-bottom: 1px solid #e4edef;
        }

        .table-title-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .table-title-icon {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 11px;
          color: #078e83;
          background: #e8f8f5;
        }

        .table-title {
          margin: 0;
          color: #092f3a;
          font-size: 17px;
          font-weight: 800;
        }

        .table-subtitle {
          margin: 4px 0 0;
          color: #78939c;
          font-size: 10px;
        }

        .table-wrap {
          width: 100%;
          overflow-x: auto;
        }

        .summary-table {
          width: 100%;
          min-width: 1050px;
          border-collapse: collapse;
        }

        .summary-table th {
          padding: 13px 14px;
          color: #6e8992;
          background: #f6fafb;
          border-bottom: 1px solid #e1ecee;
          font-size: 9px;
          font-weight: 850;
          text-align: center;
          text-transform: uppercase;
          letter-spacing: .4px;
          white-space: nowrap;
        }

        .summary-table th:first-child {
          text-align: left;
          padding-left: 20px;
        }

        .summary-table td {
          padding: 14px;
          color: #45636d;
          border-bottom: 1px solid #edf3f4;
          font-size: 10px;
          font-weight: 650;
          text-align: center;
          white-space: nowrap;
        }

        .summary-table td:first-child {
          text-align: left;
          padding-left: 20px;
        }

        .summary-table tbody tr:hover {
          background: #f8fcfc;
        }

        .department-cell {
          display: flex;
          align-items: center;
          gap: 9px;
          color: #173e48;
          font-weight: 800;
        }

        .department-avatar {
          width: 29px;
          height: 29px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9px;
          color: #083a7f;
          background: #e7f8f5;
        }

        .number-cell { color: #234853 !important; font-weight: 800 !important; }
        .success-cell { color: #07246c !important; }
        .danger-cell { color: #dc5555 !important; }
        .warning-cell { color: #c89012 !important; }
        .progress-cell { color: #4885e7 !important; }

        .table-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          padding: 13px 20px;
          background: #fbfdfd;
          color: #7b969e;
          font-size: 10px;
        }

        .footer-total {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .footer-total strong {
          color: #04266e;
        }

        /* ================= EMPTY ================= */

        .empty-state {
          padding: 65px 20px;
          text-align: center;
          color: #78939b;
        }

        .empty-icon {
          width: 54px;
          height: 54px;
          margin: 0 auto 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
          color: #142c57;
          background: #e9f8f6;
        }

        .empty-state strong {
          display: block;
          color: #244a54;
          font-size: 14px;
        }

        .empty-state span {
          display: block;
          margin-top: 5px;
          font-size: 11px;
        }

        .empty-state button {
          margin-top: 14px;
          padding: 9px 18px;
          border: none;
          border-radius: 10px;
          color: white;
          background: #122e92;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }

        /* ================= RESPONSIVE ================= */

        @media (max-width: 1250px) {
          .filter-grid { grid-template-columns: repeat(3, 1fr); }
          .search-field { grid-column: span 3; }
          .report-grid { grid-template-columns: 1fr; }
        }

        @media (max-width: 900px) {
          .kpi-grid { grid-template-columns: repeat(2, 1fr); }
          .filter-grid { grid-template-columns: repeat(2, 1fr); }
          .search-field { grid-column: span 2; }
          .hero-content { align-items: flex-start; flex-direction: column; }
          .hero-actions { width: 100%; }
        }

        @media (max-width: 620px) {
          .report-page { padding: 10px; }
          .report-hero { padding: 21px; border-radius: 20px; }
          .hero-title { font-size: 23px; }
          .hero-actions { flex-direction: column; }
          .hero-button { width: 100%; }
          .filter-grid { grid-template-columns: 1fr; }
          .search-field { grid-column: span 1; }
          .kpi-grid { grid-template-columns: 1fr; }
          .chart-header, .table-header { align-items: flex-start; flex-direction: column; }
          .chart-total { text-align: left; }
          .bar-chart { height: 290px; padding-left: 10px; padding-right: 10px; }
          .bar-stack { width: 42px; }
          .department-label { width: 75px; font-size: 8px; }
          .legend { gap: 8px 12px; }
          .configuration-top { align-items: flex-start; flex-direction: column; }
        }

        /* ===== shared theme (matches Dashboard / Users / Tasks) ===== */
        .report-page .kpi-icon { color: var(--ts-blue); background: #e8f4fa; }
        .report-page .report-hero {
          background: var(--ts-hero);
          border: var(--ts-hero-border);
          box-shadow: var(--ts-hero-shadow);
          color: var(--ts-on-hero);
        }

      `}</style>

      <div className="report-shell">

        {/* ================= HERO ================= */}
        <section className="report-hero">
          <div className="hero-content">

            <div className="hero-left">
              <div className="hero-icon">
                <BarChart3 size={30} />
              </div>

              <div>
                <h1 className="hero-title">Reports & Analytics</h1>

                <p className="hero-subtitle">
                  Analyze task performance, completion trends and
                  department activity from one ocean-inspired workspace.
                </p>
              </div>
            </div>

            <div className="hero-actions">

              <button
                type="button"
                className="hero-button"
                onClick={handleRefresh}
                disabled={refreshing || loading}
              >
                <RefreshCw
                  size={15}
                  className={refreshing ? "spin-icon" : ""}
                />
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>

              <button
                type="button"
                className="hero-button primary"
                onClick={handleExport}
                disabled={loading || exporting || departments.length === 0}
              >
                <Download size={15} />
                {exporting ? "Exporting..." : "Export Report"}
              </button>

            </div>

          </div>
        </section>

        <div className="report-view-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === "overview"}
            className={view === "overview" ? "active" : ""}
            onClick={() => setView("overview")}
          >
            Organization report
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "individual"}
            className={view === "individual" ? "active" : ""}
            onClick={() => setView("individual")}
          >
            Individual reports
          </button>
        </div>

        {view === "individual" && <IndividualReports />}

        {view === "overview" && (<>
        {/* ================= REPORT CONFIGURATION ================= */}
        <section className="configuration-card">

          <div className="configuration-top">

            <div>
              <h2 className="configuration-title">
                <Filter size={18} />
                Report Configuration
              </h2>

              <p className="configuration-subtitle">
                Adjust the filters below to change the report view.
              </p>
            </div>

            <div
              className={`configuration-badge ${loading ? "loading" : ""}`}
            >
              <Sparkles size={13} />
              {loading ? "Loading..." : error ? "Error" : "Live Report"}
            </div>

          </div>

          <div className="filter-grid">

            <div className="filter-field">
              <label>Report Type</label>

              <div className="select-wrap">
                <select
                  className="filter-select"
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                >
                  <option>Task Summary</option>
                  <option>Completion Report</option>
                  <option>Department Report</option>
                  <option>Performance Report</option>
                </select>

                <ChevronDown size={15} className="select-chevron" />
              </div>
            </div>

            <div className="filter-field">
              <label>Date Range</label>

              <div className="select-wrap">
                <select
                  className="filter-select"
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                >
                  <option>All time</option>
                  <option>Today</option>
                  <option>This week</option>
                  <option>This month</option>
                  <option>This quarter</option>
                  <option>This year</option>
                </select>

                <ChevronDown size={15} className="select-chevron" />
              </div>
            </div>

            <div className="filter-field">
              <label>Department</label>

              <div className="select-wrap">
                <select
                  className="filter-select"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                >
                  <option>All Departments</option>

                  {departmentChoices.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>

                <ChevronDown size={15} className="select-chevron" />
              </div>
            </div>

            <div className="filter-field">
              <label>Reference ID</label>

              <div className="select-wrap">
                <select
                  className="filter-select"
                  value={referenceId}
                  onChange={(e) => setReferenceId(e.target.value)}
                >
                  <option>All Reference IDs</option>
                  <option>REF-001</option>
                  <option>REF-002</option>
                  <option>REF-003</option>
                  <option>REF-004</option>
                </select>

                <ChevronDown size={15} className="select-chevron" />
              </div>
            </div>

            <div className="filter-field">
              <label>Search Department</label>

              <div className="search-field">
                <Search size={15} />

                <input
                  className="search-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search department..."
                />
              </div>
            </div>

          </div>
        </section>

        {/* ================= KPI CARDS ================= */}
        <section className="kpi-grid">

          <div className="kpi-card">
            <div className="kpi-top">
              <span className="kpi-label">Total Tasks</span>

              <div className="kpi-icon">
                <ClipboardCheck size={18} />
              </div>
            </div>

            <div className="kpi-value">{totals.total}</div>

            <div className="kpi-foot">
              <TrendingUp size={12} />
              Across selected departments
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-top">
              <span className="kpi-label">Completion Rate</span>

              <div className="kpi-icon">
                <CheckCircle2 size={18} />
              </div>
            </div>

            <div className="kpi-value">{completionRate}%</div>

            <div className="kpi-foot">
              <CheckCircle2 size={12} />
              <strong>{totals.completed}</strong>
              tasks completed
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-top">
              <span className="kpi-label">Active Tasks</span>

              <div className="kpi-icon">
                <Activity size={18} />
              </div>
            </div>

            <div className="kpi-value">{activeTasks}</div>

            <div className="kpi-foot">
              <Clock3 size={12} />
              Review + In Progress
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-top">
              <span className="kpi-label">Overdue</span>

              <div className="kpi-icon">
                <AlertTriangle size={18} />
              </div>
            </div>

            <div className="kpi-value">{overdueTasks}</div>

            <div className="kpi-foot">
              <AlertTriangle size={12} />
              <strong>{pendingTasks}</strong>
              pending tasks
            </div>
          </div>

        </section>

        {/* ================= CHARTS ================= */}
        <section className="report-grid">

          {/* ============ DEPARTMENT CHART ============ */}
          <div className="chart-card">

            <div className="chart-header">

              <div className="chart-heading">

                <div className="chart-heading-icon">
                  <BarChart3 size={18} />
                </div>

                <div>
                  <h2 className="chart-title">Tasks by Department</h2>

                  <p className="chart-description">
                    Task distribution across departments with status breakdown
                  </p>
                </div>

              </div>

              <div className="chart-total">
                <div className="chart-total-number">{totals.total}</div>

                <div className="chart-total-label">Total Tasks</div>
              </div>

            </div>

            {departments.length === 0 ? (
              <div className="empty-state">

                <div className="empty-icon">
                  <Search size={24} />
                </div>

                <strong>
                  {error
                    ? "Could not load report"
                    : loading
                    ? "Loading report..."
                    : "No departments found"}
                </strong>

                <span>
                  {error
                    ? error
                    : "Try changing your search or department filter."}
                </span>

                {error && (
                  <button type="button" onClick={handleRefresh}>
                    Retry
                  </button>
                )}

              </div>
            ) : (
              <>
                <div className="bar-chart">

                  <div className="y-axis">
                    {yTicks.map((tick) => (
                      <span key={tick}>{tick}</span>
                    ))}
                  </div>

                  <div className="bars-area">

                    {departments.map((item) => (
                      <div
                        className={`department-column ${item.name ? "report-link" : ""}`}
                        key={item.name || "none"}
                        {...(item.name ? clickable(() => openDepartmentTasks(item.name), `Open ${item.name} tasks`) : {})}
                      >

                        <div
                          className="bar-stack"
                          title={`${item.name}: ${item.total} tasks`}
                        >

                          <div
                            className="bar bar-early"
                            style={{
                              height: `${(item.early / chartMax) * 100}%`,
                            }}
                          />

                          <div
                            className="bar bar-on-time"
                            style={{
                              height: `${(item.onTime / chartMax) * 100}%`,
                            }}
                          />

                          <div
                            className="bar bar-late"
                            style={{
                              height: `${(item.late / chartMax) * 100}%`,
                            }}
                          />

                          <div
                            className="bar bar-review"
                            style={{
                              height: `${(item.review / chartMax) * 100}%`,
                            }}
                          />

                          <div
                            className="bar bar-progress"
                            style={{
                              height: `${(item.progress / chartMax) * 100}%`,
                            }}
                          />

                          <div
                            className="bar bar-pending"
                            style={{
                              height: `${(item.pending / chartMax) * 100}%`,
                            }}
                          />

                          <div
                            className="bar bar-overdue"
                            style={{
                              height: `${(item.overdue / chartMax) * 100}%`,
                            }}
                          />

                        </div>

                        <div className="department-label">
                          {item.name || "No department"}
                        </div>

                      </div>
                    ))}

                  </div>

                </div>

                <div className="legend">

                  {STATUS_LEGEND.map((item) => (
                    <div
                      className={`legend-item ${item.className}`}
                      key={item.className}
                    >
                      <span className="legend-dot" />
                      {item.label}
                    </div>
                  ))}

                </div>
              </>
            )}

          </div>

          {/* ============ PRIORITY ============ */}
          <div className="chart-card">

            <div className="chart-header">

              <div className="chart-heading">

                <div className="chart-heading-icon">
                  <Layers3 size={18} />
                </div>

                <div>
                  <h2 className="chart-title">Priority Distribution</h2>

                  <p className="chart-description">
                    Task breakdown by priority level
                  </p>
                </div>

              </div>

            </div>

            <div className="priority-body">

              <div className="donut-area">

                <div
                  className="donut"
                  style={{ background: donutBackground }}
                >

                  <div className="donut-center">
                    <strong>{totals.total}</strong>

                    <span>Tasks</span>
                  </div>

                </div>

              </div>

              <div className="priority-list">

                {priorities.map((item) => {
                  const { icon: Icon, className } =
                    PRIORITY_META[item.name] || PRIORITY_FALLBACK;

                  return (
                    <div
                      className={`priority-row ${className}`}
                      key={item.name}
                    >

                      <div className="priority-left">

                        <div className="priority-icon">
                          <Icon size={15} />
                        </div>

                        <span className="priority-name">
                          {item.name} Priority
                        </span>

                      </div>

                      <span className="priority-value">
                        {item.value}%
                      </span>

                    </div>
                  );
                })}

              </div>

            </div>

          </div>

        </section>

        {/* ================= DEPARTMENT SUMMARY ================= */}
        <section className="table-card">

          <div className="table-header">

            <div className="table-title-wrap">

              <div className="table-title-icon">
                <FileText size={18} />
              </div>

              <div>
                <h2 className="table-title">Department Summary</h2>

                <p className="table-subtitle">
                  Detailed task performance by department
                </p>
              </div>

            </div>

            <div className="configuration-badge">
              <Users size={13} />
              {departments.length} Departments
            </div>

          </div>

          <div className="table-wrap">

            <table className="summary-table">

              <thead>
                <tr>
                  <th>Department</th>
                  <th>Total Tasks</th>
                  <th>Completed</th>
                  <th>Early Completion</th>
                  <th>On-time Completion</th>
                  <th>Late Completion</th>
                  <th>Review</th>
                  <th>In Progress</th>
                  <th>Pending</th>
                  <th>Overdue</th>
                </tr>
              </thead>

              <tbody>

                {departments.map((item) => (
                  <tr
                    key={item.name || "none"}
                    className={item.name ? "report-link" : ""}
                    {...(item.name ? clickable(() => openDepartmentTasks(item.name), `Open ${item.name} tasks`) : {})}
                  >

                    <td>
                      <div className="department-cell">

                        <div className="department-avatar">
                          <Users size={14} />
                        </div>

                        {item.name || "No department"}

                      </div>
                    </td>

                    <td className="number-cell">{item.total}</td>
                    <td className="success-cell">{item.completed}</td>
                    <td className="success-cell">{item.early}</td>
                    <td className="progress-cell">{item.onTime}</td>
                    <td className="danger-cell">{item.late}</td>
                    <td className="warning-cell">{item.review}</td>
                    <td className="progress-cell">{item.progress}</td>
                    <td className="warning-cell">{item.pending}</td>
                    <td className="danger-cell">{item.overdue}</td>

                  </tr>
                ))}

              </tbody>

            </table>

          </div>

          <div className="table-footer">

            <div className="footer-total">
              <TrendingUp size={12} />

              Showing
              <strong>{departments.length}</strong>
              departments
            </div>

            <div>
              Report: <strong>{reportType}</strong>
              {" • "}
              Period: <strong>{dateRange}</strong>
            </div>

          </div>

        </section>
        </>)}

      </div>

      <style>{`
        @keyframes reportSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .spin-icon {
          animation: reportSpin .8s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default Report;