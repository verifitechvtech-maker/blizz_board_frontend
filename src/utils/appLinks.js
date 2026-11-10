// Links between the workspace pages (Tasks, Users, Task Bank, Task Calendar, MoM).
// Every page reads the same query parameters, so a link opens the target already filtered.
//
//   Tasks         ?status= &department= &due= (overdue|soon|today|unassigned|recurring) &since=YYYY-MM-DD
//                 &search= &assignee=<userId>&assigneeName= &template=<taskBankId>&templateName=
//                 &task=<taskId> &date=YYYY-MM-DD (due on that day)
//   Users         ?search= &department=
//   Task Bank     ?search= &item=<taskBankId>
//   Task Calendar ?date=YYYY-MM-DD &department=
//   MoM           ?search= &date=YYYY-MM-DD
import { can } from "../services/permissions";

const withQuery = (path, params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") query.set(key, String(value).trim());
  });
  const text = query.toString();
  return text ? `${path}?${text}` : path;
};

export const appLinks = {
  tasks: (params) => withQuery("/dashboard/tasks", params),
  users: (params) => withQuery("/dashboard/users", params),
  taskBank: (params) => withQuery("/dashboard/task-bank", params),
  calendar: (params) => withQuery("/dashboard/task-calendar", params),
  mom: (params) => withQuery("/dashboard/mom", params),
};

// Only offer a link when the person may open that page (same rule as the navigation bar)
export const canOpen = {
  tasks: () => can("tasks"),
  users: () => can("users"),
  taskBank: () => can("taskbank"),
  calendar: () => can("calendar"),
  mom: () => can("communication"),
};

/** Query parameters of the current page */
export const pageParams = () => new URLSearchParams(window.location.search);

/** "2026-11-15" (or a Date / ISO string) → "2026-11-15" in local time, or "" */
export const dayKey = (value) => {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Props that make any element a keyboard-usable link (Enter / Space) */
export const linkProps = (onOpen, label) => ({
  role: "link",
  tabIndex: 0,
  title: label,
  "aria-label": label,
  onClick: (e) => {
    e.stopPropagation();
    onOpen();
  },
  onKeyDown: (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      onOpen();
    }
  },
});

/** Shared look for clickable pills / names (injected once per page with <style>) */
export const APP_LINK_CSS = `
.app-link { cursor: pointer; text-decoration: none; transition: color .15s ease, background .15s ease, box-shadow .15s ease; }
.app-link:hover { color: #0b7f95 !important; box-shadow: inset 0 -1px 0 currentColor; }
.app-link:focus-visible { outline: 2px solid #2490a8; outline-offset: 2px; border-radius: 6px; }
.app-link-card { cursor: pointer; }
.app-link-card:focus-visible { outline: 2px solid #2490a8; outline-offset: 3px; }
.app-filter-chips { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 14px; }
.app-filter-chips > span { font-size: 12px; color: #6E8799; }
.app-filter-chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px;
  border: 1px solid #D5E7EE; background: #EAF5FA; color: #123B5D; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; }
.app-filter-chip:hover { background: #dcEFF6; }
.app-jump { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border-radius: 999px; border: 1px solid #b9dbe5;
  background: #fff; color: #176b8c; font-size: 11px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; }
.app-jump:hover { background: #eef7fa; }
`;
