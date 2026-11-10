// One Socket.IO connection per browser tab, shared by the header (chat badge,
// notification bell). Authenticated with the same JWT as the REST API.
import { io } from "socket.io-client";
import { SOCKET_URL as ENV_SOCKET_URL } from "../config/env";

// VITE_SOCKET_URL overrides (e.g. backend on another host); otherwise derived from VITE_API_URL
const SOCKET_URL = ENV_SOCKET_URL;

let socket = null;
let socketToken = null;

export const getSocket = () => {
  const token = localStorage.getItem("token");
  if (!token) return null;
  if (socket && socketToken === token) return socket;
  if (socket) socket.disconnect();
  socketToken = token;
  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
  });
  return socket;
};

export const closeSocket = () => {
  socket?.disconnect();
  socket = null;
  socketToken = null;
};
