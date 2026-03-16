/**
 * BehaviorTrace - User Authentication Page
 * Written by Paul Gedrimas - 12/2025
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabase";
import authLogo from "../../assets/images/logo.png";
import "./AuthTheme.css";

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("login");

  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (mode === "signup") {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (signUpData.user) {
        const userId = signUpData.user.id;

        await supabase.from("users_without_devices").insert({
          id: userId,
          email,
        });

        await supabase.from("profiles").insert({
          id: userId,
          role: "user",
          email,
          created_at: new Date().toISOString(),
        });
      }

      alert("Signed up, please log in");
      setMode("login");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      return;
    }

    navigate("/trace");
  }

  return (
    <div className="auth-shell">
      <div className="auth-backdrop auth-backdrop-one" />
      <div className="auth-backdrop auth-backdrop-two" />

      <section className="auth-card">
        <img className="auth-logo" src={authLogo} alt="BehaviorTrace logo" />
        <p className="auth-kicker">{mode === "login" ? "Participant Access" : "Create Account"}</p>
        <h1 className="auth-title">{mode === "login" ? "Log in" : "Create account"}</h1>
        <p className="auth-subtitle">
          {mode === "login"
            ? "Sign in to start tracing and record your current study labels."
            : "Create your participant account to join the study and start logging."}
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div>
            <label className="auth-label">Email</label>
            <input
              className="auth-input"
              type="email"
              placeholder="name@example.com"
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

          <label className="auth-check" htmlFor="toggle-user-password">
            <input
              id="toggle-user-password"
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
            />
            Show password
          </label>

          <button className="auth-submit" type="submit">
            {mode === "login" ? "Log in" : "Sign up"}
          </button>
        </form>

        {error && <div className="auth-error">{error}</div>}

        <p className="auth-switch-row">
          {mode === "login" ? "No account yet? " : "Already have an account? "}
          <button
            type="button"
            className="auth-switch"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "Sign up" : "Log in"}
          </button>
        </p>

        <div className="auth-footer">
          <Link to="/admin" className="auth-link">
            Admin login
          </Link>
        </div>
      </section>
    </div>
  );
}
