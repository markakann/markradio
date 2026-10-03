// 深夜電台 — service worker
// Bump this when the shell changes so old caches get cleared.
const CACHE = "markradio-v1";

// Only the shell. Song data comes from Firestore and audio from Drive, both of
// which stay online-only.
const SHELL = [
  "./",
  "./manifest.webmanifest",
  "./pwa/icon-192.png",
  "./pwa/icon-512.png",
  "./pwa/apple-touch-icon.png",
  "./pwa/favicon-64.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Tolerate a missing file rather than failing the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Firestore, Drive, Google Fonts: never intercept, they need the live network.
  if (url.origin !== self.location.origin) return;

  // Network first for the page itself, so a new deploy shows up immediately
  // instead of being pinned to whatever was cached.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./").then((hit) => hit || caches.match(req)))
    );
    return;
  }

  // Everything else same-origin (icons, audio files): cache first.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
    )
  );
});
