/**
 * BehaviorTrace — Minimal Service Worker
 * Written by Paul Gedrimas — 12/2025
 *
 * This service worker:
 * - Handles the install lifecycle event
 * - Intercepts fetch requests
 * - Uses a simple network-first strategy with cache fallback
 *
 * Purpose:
 * - Lightweight PWA support
 * - Basic offline resilience if a cached response exists
 * - Intended as a minimal baseline (can be extended later)
 */

// -------------------------
// INSTALL EVENT
// -------------------------
// Fired when the service worker is installed
self.addEventListener("install", (e) => {
  console.log("Service worker installed");
});

// -------------------------
// FETCH EVENT
// -------------------------
// Intercepts network requests
// Attempts network first, falls back to cache if offline
self.addEventListener("fetch", (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
