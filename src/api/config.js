import axios from "axios";
import { SERVER_URL as ENV_SERVER_URL } from "../config/env";

// A free Render instance sleeps after ~15 idle minutes and needs up to ~1 minute to wake.
// Without a timeout a request to a sleeping or unreachable server never ends and the
// page keeps spinning, so every request gets a generous limit.
export const API_TIMEOUT_MS = 90 * 1000;

const API = axios.create({
  baseURL: ENV_SERVER_URL,
  timeout: API_TIMEOUT_MS,
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Sign-in screens answer 401 for a wrong password — that is a form error, not an expired session
const isAuthFormRequest = (url = "") =>
  /\/api\/auth\/(login|register|forgot-password|reset-password|verify)/.test(String(url));

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !isAuthFormRequest(error.config?.url)) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      // already on the login page → no reload (it would wipe the error message)
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Wake the backend (Render free plan) without waiting for it — called when the login page
 * opens, so the server is starting while the user types. Never throws.
 */
export const wakeServer = () =>
  axios
    .get(`${ENV_SERVER_URL}/api/health`, { timeout: API_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);

/** A short, human message for a failed request (timeout, unreachable server, CORS, API error) */
export const describeRequestError = (err, fallback = "Something went wrong. Please try again.") => {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.code === "ECONNABORTED" || /timeout/i.test(err?.message || "")) {
    return "The server is taking too long to respond. It may still be starting up — please try again in a moment.";
  }
  if (err?.code === "ERR_NETWORK" || err?.message === "Network Error") {
    return "Cannot reach the server. Check your internet connection, or try again in a minute while the server starts.";
  }
  return err?.message || fallback;
};

export default API;
