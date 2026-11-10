import { API_URL as ENV_API_URL } from "../config/env";
const API_BASE = ENV_API_URL; // set VITE_API_URL in .env

// ⚠️ Adjust to match however YOUR login stores the token
const getAuthToken = () =>
  localStorage.getItem("token") ||
  localStorage.getItem("authToken") ||
  localStorage.getItem("accessToken") ||
  sessionStorage.getItem("token") ||
  "";

const authHeaders = () => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const buildParams = (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  return params.toString();
};

export const getReportSummary = async (filters = {}) => {
  const res = await fetch(
    `${API_BASE}/reports/summary?${buildParams(filters)}`,
    { headers: authHeaders() }
  );

  const json = await res.json().catch(() => ({}));

  if (!res.ok || json.success === false) {
    if (res.status === 401) {
      throw new Error("Session expired. Please log in again.");
    }
    throw new Error(json.message || "Failed to load report");
  }

  return json.data;
};

export const exportReportCSV = async (filters = {}) => {
  const res = await fetch(
    `${API_BASE}/reports/export?${buildParams(filters)}`,
    { headers: authHeaders() }
  );

  const text = await res.text();

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Session expired. Please log in again.");
    }
    let message = `Export failed (${res.status})`;
    try {
      const json = JSON.parse(text);
      if (json.message) message = json.message;
    } catch {
      // response wasn't JSON — keep default message
    }
    throw new Error(message);
  }

  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `task-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
// Every department of the organization (also those without tasks yet) — for the filter dropdown
export const getDepartmentNames = async () => {
  const res = await fetch(`${API_BASE}/departments`, { headers: authHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) return [];
  const list = Array.isArray(json.data) ? json.data : Array.isArray(json.departments) ? json.departments : Array.isArray(json) ? json : [];
  return list.map((d) => String(d?.name || d?.departmentName || "").trim()).filter(Boolean);
};
