import { SERVER_URL as ENV_SERVER_URL } from "../config/env";
/* Activity tracking — tells the backend which page was opened and when the user logs out.
   Never throws; tracking must never break the app. */
const API_BASE = ENV_SERVER_URL;

const send = (path, body) => {
  const token = localStorage.getItem("token");
  if (!token) return;
  try {
    fetch(`${API_BASE}/api/activity/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body || {}),
      keepalive: true, // still sent while the page navigates away (logout)
    }).catch(() => {});
  } catch {
    /* ignore */
  }
};

export const trackPageView = (page, label) => send("view", { page, label });

// call BEFORE the token is removed
export const trackLogout = () => send("logout");
