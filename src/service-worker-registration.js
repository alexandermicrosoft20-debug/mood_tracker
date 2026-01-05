// src/service-worker-registration.js
/**
 * BehaviorTrace — Service Worker Registration
 * Written by Paul Gedrimas — 12/2025
 *
 * This module:
 * - Registers the service worker once the page has fully loaded
 * - Enables PWA features such as offline support and push notifications
 * - Safely checks for browser support before attempting registration
 */

// Ensure the browser supports service workers
if ("serviceWorker" in navigator) {
  // Wait until the page has fully loaded
  window.addEventListener("load", async () => {
    try {
      // Register the service worker at the root scope
      await navigator.serviceWorker.register("/service-worker.js");
      console.log("Service Worker registered");
    } catch (err) {
      // Log registration failures for debugging
      console.error("Service Worker registration failed", err);
    }
  });
}
