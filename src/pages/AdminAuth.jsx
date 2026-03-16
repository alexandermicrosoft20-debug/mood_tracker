/**
 * BehaviorTrace - Admin Authentication Page
 * Written by Paul Gedrimas - 12/2025
 */

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import authLogo from "../../assets/images/logo.png";
import "./AuthTheme.css";

export default function AdminAuth() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const checkExistingSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setCheckingSession(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!profileError && profile?.role === "admin") {
        navigate("/dashboard", { replace: true });
        return;
      }

      await supabase.auth.signOut();
      setCheckingSession(false);
    };

    checkExistingSession();
  }, [navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError) {
      setError(profileError.message);
      await supabase.auth.signOut();
      return;
    }

    if (profile?.role !== "admin") {
      setError("This account does not have admin access.");
      await supabase.auth.signOut();
      return;
    }

    navigate("/dashboard", { replace: true });
  }

  if (checkingSession) return null;

  return (
    <div className="auth-shell">
      <div className="auth-backdrop auth-backdrop-one" />
      <div className="auth-backdrop auth-backdrop-two" />

      <section className="auth-card">
        <img className="auth-logo" src={authLogo} alt="BehaviorTrace logo" />
        <p className="auth-kicker">Administrator Access</p>
        <h1 className="auth-title">Admin login</h1>
        <p className="auth-subtitle">
          Sign in to manage forms, tune state labels, and assign devices.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <label className="auth-label">Admin email</label>
            <input
              className="auth-input"
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="auth-label">Password</label>
            <input
              className="auth-input"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <label className="auth-check" htmlFor="toggle-admin-password">
            <input
              id="toggle-admin-password"
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
            />
            Show password
          </label>

          <button className="auth-submit" type="submit">
            Log in
          </button>
        </form>

        {error && <div className="auth-error">{error}</div>}

        <div className="auth-footer">
          <Link to="/" className="auth-link">
            Back to user login
          </Link>
        </div>
      </section>
    </div>
  );
}
