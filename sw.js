const CACHE = "kisansetu-v1";
const SHELL = [
  "/",
  "/index.html",
  "/Home.css",
  "/auth.css",
  "/ks-utils.js",
  "/Assets/Images/favicon.svg",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
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

  // Never intercept Supabase, Firebase, or Razorpay API calls
  if (
    request.url.includes("supabase.co") ||
    request.url.includes("firebase") ||
    request.url.includes("razorpay") ||
    request.method !== "GET"
  ) {
    return;
  }

  // Network-first for HTML pages so users always get fresh content
  if (request.destination === "document") {
    e.respondWith(
      fetch(request)
        .then((res) => { const c = res.clone(); caches.open(CACHE).then((cache) => cache.put(request, c)); return res; })
        .catch(() => caches.match(request).then((r) => r || caches.match("/index.html")))
    );
    return;
  }

  // Cache-first for static assets (CSS, JS, fonts, images)
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok) { const c = res.clone(); caches.open(CACHE).then((cache) => cache.put(request, c)); }
        return res;
      });
    })
  );
});
