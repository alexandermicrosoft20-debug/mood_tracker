//BehaviorTrace
//Paul Gedrimas 12/2025
// Import Vite's configuration helper to enable type-safe and structured config
import { defineConfig } from "vite";

// Import the official React plugin for Vite
// This adds support for JSX, Fast Refresh, and React-specific optimizations
import react from "@vitejs/plugin-react";

// Export the Vite configuration
export default defineConfig({
  // Register plugins used by Vite
  // The React plugin enables React development features
  plugins: [react()],
});
