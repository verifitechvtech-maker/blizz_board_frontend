/* Blizz Board service worker
   1. Installable app (PWA): keeps the app shell + built files so it opens fast and
      shows the app (with an offline notice) when there is no connection.
   2. Push notifications sent by the backend (services/pushService.js), even when
      no app tab is open. Clicking one opens / focuses the app.
   Never cached: /api calls, Socket.IO, uploads, and the dev server's source files. */

const CACHE = "blizzboard-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {}) // offline install / dev server → still install
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("blizzboard-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const putInCache = (request, response) => {
  if (response && response.ok && response.type === "basic") {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
  }
  return response;
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // API (other port / host), fonts, CDNs → network

  // Pages: always the newest from the network; offline → the saved app shell
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => putInCache("/", res))
        .catch(() => caches.match("/").then((r) => r || caches.match(request)))
    );
    return;
  }

  // Built files have a content hash in their name → safe to serve from the cache first
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => putInCache(request, res))));
    return;
  }

  // Icons, sounds, images: network first, cache as fallback
  if (/^\/(icons|images|sounds)\//.test(url.pathname) || url.pathname === "/manifest.webmanifest") {
    event.respondWith(fetch(request).then((res) => putInCache(request, res)).catch(() => caches.match(request)));
  }
  // everything else (Vite dev files, /api on this origin, uploads) → untouched
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    (async () => {
      // A visible app tab already shows the toast + sound, so skip the duplicate
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((w) => w.visibilityState === "visible" && w.focused)) return;

      await self.registration.showNotification(data.title || "Task Management", {
        body: data.body || "",
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        data: { url: data.url || "/dashboard" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ("navigate" in open) await open.navigate(url).catch(() => {});
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
