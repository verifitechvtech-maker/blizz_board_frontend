/* =========================================================
   Installable app (PWA)
   • registers public/sw.js (offline app shell + push notifications)
   • remembers the browser's "install" offer so the header can show an Install button
========================================================= */

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn(Boolean(deferredPrompt)));

export const isInstalled = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

export const registerPWA = () => {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("Service worker not registered:", err.message));
  });
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // show our own Install button instead of the browser's mini bar
    deferredPrompt = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
};

export const canInstall = () => Boolean(deferredPrompt);

export const onInstallChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Opens the browser's install dialog. Resolves true when the user installed the app. */
export const promptInstall = async () => {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  notify();
  prompt.prompt();
  const choice = await prompt.userChoice.catch(() => null);
  return choice?.outcome === "accepted";
};
