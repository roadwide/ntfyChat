const CACHE_NAME = "private-transfer-shell-v2";
const APP_SHELL = [
  "/ntfy-ui/",
  "/ntfy-ui/manifest.json",
  "/ntfy-ui/icons/icon.svg",
  "/ntfy-ui/icons/icon-192.png",
  "/ntfy-ui/icons/icon-512.png",
  "/ntfy-ui/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const {request} = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Never cache API calls, authentication responses, messages, or attachments.
  if (url.pathname === "/ntfy" || url.pathname.startsWith("/ntfy/") || url.pathname.startsWith("/file/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/ntfy-ui/")));
    return;
  }

  if (!url.pathname.startsWith("/ntfy-ui/")) return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
