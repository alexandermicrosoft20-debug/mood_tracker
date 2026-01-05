/**
 * BehaviorTrace — User Authentication Page (Login / Signup)
 * Written by Paul Gedrimas — 12/2025
 *
 * This component:
 * - Provides login and signup for normal users
 * - Uses Supabase Auth (email/password)
 * - On signup:
 *   - Inserts the new user into `users_without_devices` (awaiting device assignment)
 *   - Inserts the user into `profiles` with role="user"
 * - On login success, navigates the user to the Trace page
 * - Includes a link to the separate Admin login route
 */

import { useState } from "react";
import { supabase } from "../supabase";
import { useNavigate, Link } from "react-router-dom";

export default function Auth() {
  // -------------------------
  // STATE
  // -------------------------
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Displayable error string for UI feedback
  const [error, setError] = useState("");

  // "login" or "signup" mode toggle
  const [mode, setMode] = useState("login");

  const navigate = useNavigate();

  // -------------------------
  // SUBMIT HANDLER
  // -------------------------
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    // -------------------------
    // SIGNUP FLOW
    // -------------------------
    if (mode === "signup") {
      // Create user in Supabase Auth
      const { data: signUpData, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) return setError(error.message);

      // If a user object exists, create supporting records in app tables
      if (signUpData.user) {
        const userId = signUpData.user.id;

        // Track users awaiting EmotiBit device assignment (used by admin dashboard)
        await supabase.from("users_without_devices").insert({
          id: userId,
          email: email,
        });

        // Create profile record with default role="user"
        await supabase.from("profiles").insert({
          id: userId,
          role: "user",
          email: email,
          created_at: new Date().toISOString(),
        });
      }

      // Return user to login mode after signup
      alert("Signed up, please log in");
      setMode("login");
      return;
    }

    // -------------------------
    // LOGIN FLOW
    // -------------------------
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return setError(error.message);

    // On success, route the user to the Trace page
    navigate("/trace");
  }

  // -------------------------
  // RENDER
  // -------------------------
  return (
    <div className="container mt-5" style={{ maxWidth: 400 }}>
      <h1 className="mb-3">
        {mode === "login" ? "Log in" : "Create account"}
      </h1>

      {/* Login/Signup form */}
      <form onSubmit={handleSubmit}>
        <input
          className="form-control mb-3"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          className="form-control mb-3"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button className="btn btn-primary w-100">
          {mode === "login" ? "Log in" : "Sign up"}
        </button>
      </form>

      {/* Error display */}
      {error && <p className="text-danger mt-3">{error}</p>}

      {/* Mode toggle */}
      <p className="mt-3 text-center">
        {mode === "login" ? (
          <>
            No account?{" "}
            <button
              type="button"
              className="btn btn-link p-0"
              onClick={() => setMode("signup")}
            >
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              className="btn btn-link p-0"
              onClick={() => setMode("login")}
            >
              Log in
            </button>
          </>
        )}
      </p>

      {/* Admin login link */}
      <div className="text-center mt-2">
        <Link to="/admin" className="text-decoration-none">
          Admin login
        </Link>
      </div>
    </div>
  );
}
