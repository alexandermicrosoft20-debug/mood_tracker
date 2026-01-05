/**
 * BehaviorTrace — React Application Entry Point
 * Written by Paul Gedrimas — 12/2025
 *
 * This file:
 * - Bootstraps the React application
 * - Attaches React to the root DOM element
 * - Enables React Strict Mode for development checks
 * - Imports Bootstrap for global styling
 */

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Import Bootstrap CSS for responsive layout and components
import "bootstrap/dist/css/bootstrap.min.css";

// Create the React root and render the application
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* StrictMode helps catch potential issues during development */}
    <App />
  </React.StrictMode>
);
