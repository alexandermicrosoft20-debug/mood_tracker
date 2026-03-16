/**
 * BehaviorTrace — Service Worker
 * Written by Paul Gedrimas — 12/2025
 *
 * This service worker:
 * - Handles installation lifecycle events
 * - Provides a simple network-first fetch strategy with cache fallback
 * - Receives and displays push notifications
 * - Handles notification click events to open relevant app URLs
 *
 * Note:
 * - This is a minimal service worker intended for PWA support
 * - Caching strategy can be extended for offline-first behavior if needed
 */

// -------------------------
// INSTALL EVENT
// -------------------------
// Fired when the service worker is first installed
self.addEventListener("install", (e) => {
  console.log("Service worker installed");
});

// -------------------------
// FETCH EVENT
// -------------------------
// Intercepts network requests
// Uses a simple network-first strategy with cache fallback
self.addEventListener("fetch", (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

// -------------------------
// PUSH NOTIFICATIONS
// -------------------------
// Handles incoming push events from the server
self.addEventListener("push", (event) => {
  const data = event.data.json();

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      data: {
        url: data.url, // URL to open when notification is clicked
      },
    })
  );
});

// -------------------------
// NOTIFICATION CLICK
// -------------------------
// Opens the relevant page when the user clicks a notification
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
