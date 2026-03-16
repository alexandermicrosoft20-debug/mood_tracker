/**
 * BehaviorTrace - Trace Page (User Interaction + State Tracking)
 * Written by Paul Gedrimas - 12/2025
 */

import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { useNavigate } from "react-router-dom";
import traceLogo from "../../assets/images/logo.png";
import "./Trace.css";

const ACTIVE_COLOR_STYLES = {
  danger: { backgroundColor: "#dc3545", borderColor: "#dc3545", color: "#fff" },
  warning: { backgroundColor: "#ffc107", borderColor: "#ffc107", color: "#212529" },
  success: { backgroundColor: "#198754", borderColor: "#198754", color: "#fff" },
  primary: { backgroundColor: "#0d6efd", borderColor: "#0d6efd", color: "#fff" },
  dark: { backgroundColor: "#212529", borderColor: "#212529", color: "#fff" },
};

function toActiveStateMap(states) {
  return Object.fromEntries(states.map((state) => [state.label_id, state]));
}

function formatDuration(startedAt, endedAt) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const diffMs = Math.max(end - start, 0);
  const totalSeconds = Math.round(diffMs / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export default function Trace() {
  const navigate = useNavigate();

  const [userId, setUserId] = useState(null);
  const [forms, setForms] = useState([]);
  const [activeStates, setActiveStates] = useState({});
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
        error: sessErr,
      } = await supabase.auth.getSession();

      if (sessErr || !session) {
        if (sessErr) console.error("[Trace] session error:", sessErr);
        navigate("/");
        return;
      }

      setUserId(session.user.id);

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
      const formIds = safeForms.map((form) => form.id);

      let labelsData = [];
      if (formIds.length > 0) {
        const { data, error: labelsErr } = await supabase
          .from("labels")
          .select(
            "id,form_id,label_name,label_type,decay_seconds,ema_interval_seconds,ema_prompt,ema_active_text,ema_active_color,created_at"
          )
          .in("form_id", formIds);

        if (labelsErr) {
          console.error("[Trace] labels fetch error:", labelsErr);
        } else {
          labelsData = data || [];
        }
      }

      const { data: activeStatesData, error: activeStatesErr } = await supabase
        .from("user_states")
        .select("id,label_id,form_id,started_at")
        .eq("user_id", session.user.id)
        .eq("active", true);

      if (activeStatesErr) {
        console.error("[Trace] active states fetch error:", activeStatesErr);
      } else {
        setActiveStates(toActiveStateMap(activeStatesData || []));
      }

      const merged = safeForms.map((form) => ({
        ...form,
        labels: labelsData.filter((label) => label.form_id === form.id),
      }));

      setForms(merged);
    };

    init();
  }, [navigate]);

  function flashSuccess(message) {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(""), 2500);
  }

  async function logLabel(formId, label) {
    if (!userId) return;

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

      flashSuccess(`Logged "${label.label_name}"`);
      return;
    }

    const existing = activeStates[label.id];

    if (!existing) {
      const { data: newState, error: insErr } = await supabase
        .from("user_states")
        .insert({
          user_id: userId,
          form_id: formId,
          label_id: label.id,
        })
        .select("id,label_id,form_id,started_at")
        .single();

      if (insErr) {
        console.error("[Trace] user_states insert error:", insErr);
        alert(insErr.message);
        return;
      }

      setActiveStates((current) => ({
        ...current,
        [label.id]: newState,
      }));
      flashSuccess(`Started "${label.label_name}"`);
      return;
    }

    const endedAt = new Date().toISOString();
    const { error: endErr } = await supabase
      .from("user_states")
      .update({
        active: false,
        ended_at: endedAt,
      })
      .eq("id", existing.id);

    if (endErr) {
      console.error("[Trace] user_states update error:", endErr);
      alert(endErr.message);
      return;
    }

    setActiveStates((current) => {
      const next = { ...current };
      delete next[label.id];
      return next;
    });

    flashSuccess(
      `Stopped "${label.label_name}" after ${formatDuration(existing.started_at, endedAt)}`
    );
  }

  async function logout() {
    await supabase.auth.signOut();
    navigate("/");
  }

  function activeButtonText(label) {
    const customText = (label.ema_active_text || "").trim();
    return customText || `Stop - ${label.label_name}`;
  }

  function buttonProps(label) {
    const activeState = activeStates[label.id];

    if (label.label_type === "ema" && activeState) {
      return {
        className: "trace-label-button",
        style: ACTIVE_COLOR_STYLES[label.ema_active_color] || ACTIVE_COLOR_STYLES.danger,
        text: activeButtonText(label),
      };
    }

    if (label.label_type === "decay") {
      return {
        className: "trace-label-button trace-label-decay",
        style: undefined,
        text: label.label_name,
      };
    }

    if (label.label_type === "ema") {
      return {
        className: "trace-label-button trace-label-state",
        style: undefined,
        text: label.label_name,
      };
    }

    return {
      className: "trace-label-button trace-label-event",
      style: undefined,
      text: label.label_name,
    };
  }

  const activeStateEntries = Object.entries(activeStates);

  return (
    <div className="trace-shell">
      <div className="trace-backdrop trace-backdrop-one" />
      <div className="trace-backdrop trace-backdrop-two" />

      <div className="container py-4 py-md-5 position-relative">
        <section className="trace-hero">
          <div>
            <img className="trace-logo" src={traceLogo} alt="BehaviorTrace logo" />
            <h1 className="trace-title">Trace your current study labels</h1>
            <p className="trace-subtitle">
              Tap an instant or decay label to log it immediately. Tap a state label to start it, and
              tap again to stop and save the duration.
            </p>
          </div>

          <div className="trace-hero-actions">
            <div className="trace-stat">
              <span className="trace-stat-value">{forms.length}</span>
              <span className="trace-stat-label">Forms available</span>
            </div>
            <div className="trace-stat">
              <span className="trace-stat-value">{activeStateEntries.length}</span>
              <span className="trace-stat-label">Active states</span>
            </div>
          </div>

          <button className="trace-logout-btn" onClick={logout}>
            Logout
          </button>
        </section>

        {successMessage && <div className="trace-success">{successMessage}</div>}

        <section className="trace-active-panel">
          <p className="trace-kicker">Live status</p>
          <h2 className="trace-section-title">Active states</h2>
          <p className="trace-section-copy">
            These labels are currently running and will save a duration when you stop them.
          </p>

          {activeStateEntries.length === 0 ? (
            <div className="trace-empty mt-3">No state labels are active right now.</div>
          ) : (
            <div className="trace-chip-grid mt-3">
              {activeStateEntries.map(([labelId, state]) => {
                const activeLabel = forms
                  .flatMap((form) => form.labels)
                  .find((label) => String(label.id) === String(labelId));

                return (
                  <div key={labelId} className="trace-active-chip">
                    <div>
                      <strong>{activeLabel?.label_name || "Active state"}</strong>
                      <span>Started {new Date(state.started_at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {forms.length === 0 ? (
          <div className="trace-empty">No study forms are available right now.</div>
        ) : (
          <div className="trace-form-grid">
            {forms.map((form) => (
              <section key={form.id} className="trace-form-card">
                <p className="trace-kicker">Study form</p>
                <h3>{form.title}</h3>
                <p className="trace-form-description">
                  {form.description || "Select a label below to log your current state or event."}
                </p>

                <div className="trace-label-row">
                  {form.labels.map((label) => {
                    const button = buttonProps(label);

                    return (
                      <button
                        key={label.id}
                        className={button.className}
                        style={button.style}
                        onClick={() => logLabel(form.id, label)}
                      >
                        {button.text}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
