/**
 * BehaviorTrace — Supabase Client Initialization
 * Written by Paul Gedrimas — 12/2025
 *
 * This module:
 * - Initializes a Supabase client for the frontend
 * - Uses public (anon) credentials exposed via Vite environment variables
 * - Is intended for client-side authentication and data access
 */

import { createClient } from "@supabase/supabase-js";

// Create and export a shared Supabase client instance
// VITE_* variables are injected at build time by Vite
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,       // Supabase project URL
  import.meta.env.VITE_SUPABASE_ANON_KEY   // Public anon key (subject to RLS)
);
