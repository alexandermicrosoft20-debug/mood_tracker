/**
 * BehaviorTrace — ProtectedRoute (User Auth Guard)
 * Written by Paul Gedrimas — 12/2025
 *
 * This component:
 * - Protects routes that require a logged-in session
 * - Checks Supabase auth session on mount
 * - While checking, renders nothing (prevents flicker)
 * - If unauthenticated, redirects the user to the main login page ("/")
 * - If authenticated, renders the wrapped route content (children)
 */

import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../supabase";

export default function ProtectedRoute({ children }) {
  // -------------------------
  // STATE
  // -------------------------
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  // -------------------------
  // SESSION CHECK
  // -------------------------
  useEffect(() => {
    // Query Supabase for the current session (if any)
    supabase.auth.getSession().then(({ data }) => {
      setAuthenticated(!!data.session);
      setLoading(false);
    });
  }, []);

  // -------------------------
  // RENDER
  // -------------------------
  // While session is being checked, render nothing
  if (loading) return null;

  // If user is not authenticated, redirect to login
  if (!authenticated) return <Navigate to="/" />;

  // Otherwise, render the protected content
  return children;
}
