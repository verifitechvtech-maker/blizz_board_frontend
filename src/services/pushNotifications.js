import API from "../api/config";

/* =========================================================
   Browser push notifications (public/sw.js + /api/push)
   enablePush()   → asks permission (needs a click), subscribes, saves on the server
   syncPush()     → on load: re-subscribes silently when already allowed
   disablePush()  → this browser stops receiving pushes
   unsubscribePushOnLogout() → sync-safe, call before clearing the token
========================================================= */

const ENDPOINT_KEY = "pushEndpoint";

export const pushSupported = () =>
  typeof window !== "undefined" &&
  window.isSecureContext &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

// true while this browser has a live push subscription (used to avoid duplicate pop-ups)
export const isPushActive = () => {
  try {
    return Boolean(localStorage.getItem(ENDPOINT_KEY)) && Notification.permission === "granted";
  } catch {
    return false;
  }
};

const urlBase64ToUint8Array = (base64) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const register = () => navigator.serviceWorker.register("/sw.js");

const subscribe = async () => {
  const { data } = await API.get("/api/push/public-key");
  if (!data?.publicKey) return false; // push not configured on the server

  const reg = await register();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    });
  }
  await API.post("/api/push/subscribe", { subscription: sub.toJSON() });
  try {
    localStorage.setItem(ENDPOINT_KEY, sub.endpoint);
  } catch {
    /* only used to skip duplicate pop-ups */
  }
  return true;
};

export const enablePush = async () => {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;
  try {
    return (await subscribe()) ? "granted" : "unavailable";
  } catch (err) {
    console.error("Push subscribe failed:", err);
    return "error";
  }
};

export const syncPush = async (user) => {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  if (user?.preferences?.desktopNotifications === false) return false; // turned off in Settings
  try {
    return await subscribe();
  } catch (err) {
    console.error("Push sync failed:", err);
    return false;
  }
};

export const disablePush = async () => {
  let endpoint = "";
  try {
    endpoint = localStorage.getItem(ENDPOINT_KEY) || "";
    localStorage.removeItem(ENDPOINT_KEY);
  } catch {
    /* ignore */
  }
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    endpoint = endpoint || sub?.endpoint || "";
    if (endpoint) await API.post("/api/push/unsubscribe", { endpoint });
    await sub?.unsubscribe();
  } catch (err) {
    console.error("Push unsubscribe failed:", err);
  }
};

// Logout handlers clear the token right away and leave the page,
// so this sends the request with keepalive before that happens.
export const unsubscribePushOnLogout = () => {
  let endpoint = "";
  let token = "";
  try {
    endpoint = localStorage.getItem(ENDPOINT_KEY) || "";
    token = localStorage.getItem("token") || "";
    localStorage.removeItem(ENDPOINT_KEY);
  } catch {
    return;
  }
  if (!endpoint || !token) return;
  fetch(`${API.defaults.baseURL}/api/push/unsubscribe`, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});
  navigator.serviceWorker
    ?.getRegistration("/sw.js")
    .then((reg) => reg?.pushManager.getSubscription())
    .then((sub) => sub?.unsubscribe())
    .catch(() => {});
};
