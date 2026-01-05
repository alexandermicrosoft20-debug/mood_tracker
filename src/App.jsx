/**
 * BehaviorTrace — Application Routing
 * Written by Paul Gedrimas — 12/2025
 *
 * This file:
 * - Defines all client-side routes using React Router
 * - Separates normal user and admin authentication flows
 * - Protects routes with role-specific guards
 * - Redirects unknown routes back to the login page
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Public and protected pages
import Auth from "./pages/Auth";
import Trace from "./pages/Trace";
import AdminAuth from "./pages/AdminAuth";
import Dashboard from "./pages/DashBoard";

// Route guards
import ProtectedRoute from "./components/ProtectedRoute";
import AdminProtectedRoute from "./components/AdminProtectedRoute";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ----------------- */}
        {/* Normal user routes */}
        {/* ----------------- */}

        {/* User login / signup */}
        <Route path="/" element={<Auth />} />

        {/* Main tracing interface (authenticated users only) */}
        <Route
          path="/trace"
          element={
            <ProtectedRoute>
              <Trace />
            </ProtectedRoute>
          }
        />

        {/* ----------------- */}
        {/* Admin routes */}
        {/* ----------------- */}

        {/* Admin login */}
        <Route path="/admin" element={<AdminAuth />} />

        {/* Admin dashboard (admin-authenticated only) */}
        <Route
          path="/dashboard"
          element={
            <AdminProtectedRoute>
              <Dashboard />
            </AdminProtectedRoute>
          }
        />

        {/* Catch-all: redirect unknown routes to login */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}
