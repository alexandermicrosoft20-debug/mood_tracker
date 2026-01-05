/**
 * BehaviorTrace — AdminProtectedRoute (Admin Auth Guard)
 * Written by Paul Gedrimas — 12/2025
 *
 * This component:
 * - Protects routes that require administrator privileges
 * - Verifies an active Supabase auth session
 * - Checks the user's role from the `profiles` table
 * - While loading, renders nothing to prevent UI flicker
 * - Redirects non-admin or unauthenticated users to the admin login page
 * - Renders the wrapped route content only for authorized admins
 */

import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../supabase";

export default function AdminProtectedRoute({ children }) {
  // -------------------------
  // STATE
  // -------------------------
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // -------------------------
  // SESSION + ROLE CHECK
  // -------------------------
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      // No active session → not an admin
      if (!data.session) {
        setLoading(false);
        setIsAdmin(false);
        return;
      }

      // Fetch role from profiles table
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .maybeSingle();

      // Admin only if role === "admin"
      setIsAdmin(profile?.role === "admin");
      setLoading(false);
    });
  }, []);

  // -------------------------
  // RENDER
  // -------------------------
  // While checking auth/role, render nothing
  if (loading) return null;

  // Not an admin → redirect to admin login
  if (!isAdmin) return <Navigate to="/admin" />;

  // Authorized admin → render protected content
  return children;
}
