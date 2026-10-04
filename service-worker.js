"use strict";
const CACHE_PREFIX = "mrs-garagara-pon-";
const CACHE_NAME = `${CACHE_PREFIX}v11`;
const APP_FILES = ["./", "./index.html", "./style.css?v=10", "./script.js?v=10", "./machine-3d.js?v=10", "./assets/vendor/three.module.min.js", "./assets/vendor/three.core.min.js", "./manifest.webmanifest", "./assets/icons/icon.svg", "./assets/icons/icon-192.png", "./assets/icons/icon-512.png", "./assets/icons/apple-touch-icon.png"].map((path) => new URL(path, self.registration.scope).href);
const OFFLINE_PAGE = new URL("./index.html", self.registration.scope).href;
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  const isNavigation = request.mode === "navigate";
  // Do not cache arbitrary paths, advertisements, or external resources.
  if (!APP_FILES.includes(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        try { await cache.put(request, response.clone()); } catch { /* Keep the app usable if storage is full. */ }
      }
      return response;
    } catch {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (isNavigation) { const page = await cache.match(OFFLINE_PAGE); if (page) return page; }
      return Response.error();
    }
  })());
});
