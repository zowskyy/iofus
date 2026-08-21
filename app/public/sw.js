const CACHE = "iofus-v1";

// Static assets that are safe to cache indefinitely
const PRECACHE = [
  "/fonts/VandalBlowGraffiti.ttf",
  "/fonts/BebasNeue-Regular.ttf",
  "/logo.png",
  "/manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Only handle same-origin GET requests
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Fonts and static assets: cache-first (they never change between deploys)
  if (url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Images: cache-first with network fallback
  if (url.pathname.match(/\.(png|jpg|jpeg|webp|svg|gif|ico)$/)) {
    e.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Navigation and API: network-first, stale fallback only for navigation
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request).catch(() => caches.match(request).then((c) => c || Response.error()))
    );
  }
});
