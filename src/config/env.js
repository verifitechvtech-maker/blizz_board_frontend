// Where the backend lives.
//   Deployed (Vercel build):   https://blizz-board-backend.onrender.com
//   Local development (npm run dev): http://localhost:5000
// VITE_API_URL (with or without "/api") in frontend/.env or Vercel → Settings → Environment
// Variables overrides both. VITE_SOCKET_URL is optional (defaults to the same server).
export const PRODUCTION_API_URL = "https://blizz-board-backend.onrender.com";
const LOCAL_API_URL = "http://localhost:5000";

const raw = String(import.meta.env.VITE_API_URL || (import.meta.env.PROD ? PRODUCTION_API_URL : LOCAL_API_URL))
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api$/, "");

/** Backend origin, e.g. https://blizz-board-backend.onrender.com */
export const SERVER_URL = raw;

/** REST API base, e.g. https://blizz-board-backend.onrender.com/api */
export const API_URL = `${raw}/api`;

/** Socket.IO server */
export const SOCKET_URL = String(import.meta.env.VITE_SOCKET_URL || raw).trim().replace(/\/+$/, "");
