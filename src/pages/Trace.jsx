/**
 * BehaviorTrace — Trace Page (User Interaction + EMA Handling)
 * Written by Paul Gedrimas — 12/2025
 *
 * This component:
 * - Authenticates the current user via Supabase
 * - Fetches available forms and their labels
 * - Allows users to log event, decay, and EMA-based states
 * - Manages EMA timers and confirmation prompts
 * - Writes user interactions to Supabase tables
 */

import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { useNavigate } from "react-router-dom";

export default function Trace() {
  const navigate = useNavigate();

  // -------------------------
  // STATE
  // -------------------------

  // Authenticated user ID
  const [userId, setUserId] = useState(null);

  // Forms with attached labels
  const [forms, setForms] = useState([]);

  // Temporary UI feedback after logging actions
  const [successMessage, setSuccessMessage] = useState("");

  // EMA prompt modal state
  const [emaPrompt, setEmaPrompt] = useState(null);

  // Ref to store EMA timeout ID (prevents duplicate timers)
  const emaTimerRef = useRef(null);

  // -------------------------
  // INITIAL LOAD
  // -------------------------
  useEffect(() => {
    const init = async () => {
      // Get active session
      const {
        data: { session },
        error: sessErr,
      } = await supabase.auth.getSession();

      // Session error or unauthenticated → redirect to login
      if (sessErr || !session) {
        if (sessErr) console.error("[Trace] session error:", sessErr);
        navigate("/");
        return;
      }

      setUserId(session.user.id);

      // -------------------------
      // FETCH FORMS
      // -------------------------
      const { data: formsData, error: formsErr } = await supabase
        .from("forms")
        .select("id,title,description,created_at")
        .order("created_at", { ascending: false });

      if (formsErr) {
        console.error("[Trace] forms fetch error:", formsErr);
        setForms([]);
        return;
      }

      const safeForms = formsData || [];
      const formIds = safeForms.map((f) => f.id);

      // -------------------------
      // FETCH LABELS (INCLUDING EMA FIELDS)
      // -------------------------
      let labelsData = [];
      if (formIds.length > 0) {
        const { data, error: labelsErr } = await supabase
          .from("labels")
          .select(
            "id,form_id,label_name,label_type,decay_seconds,ema_interval_seconds,ema_prompt,created_at"
          )
          .in("form_id", formIds);

        if (labelsErr) {
          console.error("[Trace] labels fetch error:", labelsErr);
        } else {
          labelsData = data || [];
        }
      }

      // Debug visibility into EMA prompt configuration
      console.log("[Trace] formsData:", safeForms);
      console.log("[Trace] labelsData (first 10):", labelsData.slice(0, 10));
      console.log(
        "[Trace] ema labels prompts:",
        labelsData
          .filter((l) => l.label_type === "ema")
          .map((l) => ({
            id: l.id,
            label_name: l.label_name,
            ema_prompt: l.ema_prompt,
            ema_interval_seconds: l.ema_interval_seconds,
          }))
      );

      // -------------------------
      // MERGE FORMS + LABELS
      // -------------------------
      const merged = safeForms.map((f) => ({
        ...f,
        labels: labelsData.filter((l) => l.form_id === f.id),
      }));

      setForms(merged);
    };

    init();

    // Cleanup any pending EMA timers on unmount
    return () => {
      clearTimeout(emaTimerRef.current);
    };
  }, [navigate]);

  // -------------------------
  // EMA TIMER HANDLING
  // -------------------------
  function scheduleEmaPrompt(state, label) {
    clearTimeout(emaTimerRef.current);

    const seconds = Number(label?.ema_interval_seconds || 0);
    if (!seconds || seconds <= 0) {
      console.warn("[Trace] ema_interval_seconds missing/invalid for label:", label);
      return;
    }

    emaTimerRef.current = setTimeout(() => {
      console.log("[Trace] showing EMA prompt for label:", label);
      setEmaPrompt({ state, label });
    }, seconds * 1000);
  }

  // -------------------------
  // LABEL LOGGING
  // -------------------------
  async function logLabel(formId, label) {
    if (!userId) return;

    // EVENT / DECAY LABELS
    if (label.label_type !== "ema") {
      const { error } = await supabase.from("user_logs").insert({
        user_id: userId,
        form_id: formId,
        label_id: label.id,
      });

      if (error) {
        console.error("[Trace] user_logs insert error:", error);
        alert(error.message);
        return;
      }

      setSuccessMessage(`Logged "${label.label_name}"`);
      setTimeout(() => setSuccessMessage(""), 2000);
      return;
    }

    // EMA LABELS
    const { data: existing, error: exErr } = await supabase
      .from("user_states")
      .select("*")
      .eq("user_id", userId)
      .eq("label_id", label.id)
      .eq("active", true)
      .maybeSingle();

    if (exErr) {
      console.error("[Trace] user_states read error:", exErr);
      alert(exErr.message);
      return;
    }

    // Start new EMA state if none active
    if (!existing) {
      const { data: newState, error: insErr } = await supabase
        .from("user_states")
        .insert({
          user_id: userId,
          form_id: formId,
          label_id: label.id,
        })
        .select()
        .single();

      if (insErr) {
        console.error("[Trace] user_states insert error:", insErr);
        alert(insErr.message);
        return;
      }

      setSuccessMessage(`Started "${label.label_name}"`);
      scheduleEmaPrompt(newState, label);
      setTimeout(() => setSuccessMessage(""), 2000);
    } else {
      // Already active → reschedule prompt
      scheduleEmaPrompt(existing, label);
      setSuccessMessage(`"${label.label_name}" already active`);
      setTimeout(() => setSuccessMessage(""), 2000);
    }
  }

  // -------------------------
  // EMA RESPONSE HANDLING
  // -------------------------
  async function handleEmaResponse(answer) {
    const { state, label } = emaPrompt;

    if (answer === "yes") {
      // User confirms state still active
      const { error } = await supabase
        .from("user_states")
        .update({ last_confirmed_at: new Date() })
        .eq("id", state.id);

      if (error) {
        console.error("[Trace] user_states update yes error:", error);
        alert(error.message);
        return;
      }

      scheduleEmaPrompt(state, label);
    } else {
      // User ends state
      const { error } = await supabase
        .from("user_states")
        .update({
          active: false,
          ended_at: new Date(),
        })
        .eq("id", state.id);

      if (error) {
        console.error("[Trace] user_states update no error:", error);
        alert(error.message);
        return;
      }
    }

    setEmaPrompt(null);
  }

  // -------------------------
  // AUTH / UI HELPERS
  // -------------------------
  async function logout() {
    await supabase.auth.signOut();
    navigate("/");
  }

  function buttonStyle(label) {
    if (label.label_type === "decay") return "btn-outline-warning";
    if (label.label_type === "ema") return "btn-outline-info";
    return "btn-outline-primary";
  }

  // Prefer database-defined EMA prompt; fallback to generic text
  function emaPromptText(label) {
    const p = (label?.ema_prompt ?? "").trim();
    if (p) return p;
    return `Do you still feel ${label?.label_name || "this state"}?`;
  }

  // -------------------------
  // RENDER
  // -------------------------
  return (
    <div className="container mt-5">
      <div className="d-flex justify-content-between mb-4">
        <h1>Trace</h1>
        <button className="btn btn-outline-danger" onClick={logout}>
          Logout
        </button>
      </div>

      {successMessage && (
        <div className="alert alert-success">{successMessage}</div>
      )}

      {forms.map((f) => (
        <div key={f.id} className="mb-4">
          <h3>{f.title}</h3>
          <p>{f.description}</p>

          <div className="d-flex flex-wrap gap-2">
            {f.labels.map((l) => (
              <button
                key={l.id}
                className={`btn ${buttonStyle(l)}`}
                onClick={() => logLabel(f.id, l)}
              >
                {l.label_name}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* EMA PROMPT MODAL */}
      {emaPrompt && (
        <div className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-50 d-flex align-items-center justify-content-center">
          <div
            className="bg-white p-4 rounded"
            style={{ maxWidth: 520, width: "92%" }}
          >
            <h5>{emaPromptText(emaPrompt.label)}</h5>

            <div className="mt-3 d-flex gap-2">
              <button
                className="btn btn-success"
                onClick={() => handleEmaResponse("yes")}
              >
                Yes
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleEmaResponse("no")}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
