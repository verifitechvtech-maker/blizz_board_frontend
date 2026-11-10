// Where the backend lives — set in frontend/.env (or your hosting's environment settings):
//   VITE_API_URL=https://api.yourdomain.com        (with or without "/api" at the end)
//   VITE_SOCKET_URL=https://api.yourdomain.com     (optional, defaults to the same server)
// Without them the app talks to a backend on this computer (local development).
const raw = String(import.meta.env.VITE_API_URL || "http://localhost:5000")
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");

/** Backend origin, e.g. https://api.yourdomain.com */
export const SERVER_URL = raw;

/** REST API base, e.g. https://api.yourdomain.com/api */
export const API_URL = `${raw}/api`;

/** Socket.IO server */
export const SOCKET_URL = String(import.meta.env.VITE_SOCKET_URL || raw).trim().replace(/\/+$/, "");
