// Current session helpers — role + permissions come from the backend
// (login response / GET /api/auth/me). The backend enforces them; the UI only
// uses them to hide or disable actions the user cannot perform.
import API from "../api/config";

export const ROLE_LABELS = {
  SuperAdmin: "Super Admin",
  Admin: "Admin",
  Manager: "Manager",
  User: "Team Member",
};

export const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

export const hasPermission = (user, moduleId, action = "view") => {
  if (!user) return false;
  if (user.role === "SuperAdmin") return true;
  return Boolean(user.permissions?.[moduleId]?.includes(action));
};

export const can = (moduleId, action = "view") =>
  hasPermission(getStoredUser(), moduleId, action);

export const homePathFor = (user) =>
  user?.role === "SuperAdmin" ? "/superadmin/dashboard" : "/dashboard";

// Re-read role/permissions from the server and update localStorage.
// Fires "user-updated" so mounted components (header, nav) re-render.
export const refreshCurrentUser = async () => {
  const response = await API.get("/api/auth/me");
  const fresh = response.data?.data;
  if (!fresh) return getStoredUser();
  const merged = { ...(getStoredUser() || {}), ...fresh };
  localStorage.setItem("user", JSON.stringify(merged));
  window.dispatchEvent(new Event("user-updated"));
  return merged;
};
