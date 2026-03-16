/**
 * BehaviorTrace - Admin Dashboard (Forms, Labels, Device Assignment)
 * Written by Paul Gedrimas - 12/2025
 */

import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { useNavigate } from "react-router-dom";
import "./DashBoard.css";
import dashboardLogo from "../../assets/images/logo.png";

const EMA_COLOR_OPTIONS = [
  { value: "danger", label: "Signal Red" },
  { value: "warning", label: "Amber" },
  { value: "success", label: "Green" },
  { value: "primary", label: "Blue" },
  { value: "dark", label: "Midnight" },
];

export default function Dashboard() {
  const navigate = useNavigate();

  const [userId, setUserId] = useState(null);
  const [forms, setForms] = useState([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [newLabelName, setNewLabelName] = useState("");
  const [labelType, setLabelType] = useState("event");
  const [decaySeconds, setDecaySeconds] = useState("");
  const [emaActiveText, setEmaActiveText] = useState("");
  const [emaActiveColor, setEmaActiveColor] = useState("danger");

  const [labels, setLabels] = useState([]);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmText, setConfirmText] = useState("");

  const [usersWithoutDevices, setUsersWithoutDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        navigate("/");
        return;
      }

      setUserId(session.user.id);
      await fetchForms();
      await fetchUsersWithoutDevices();
    };

    init();
  }, [navigate]);

  async function fetchForms() {
    const { data } = await supabase
      .from("forms")
      .select("*")
      .order("created_at", { ascending: false });

    setForms(data || []);
  }

  async function fetchUsersWithoutDevices() {
    const { data, error } = await supabase
      .from("users_without_devices")
      .select("id, email");

    if (error) {
      console.error("Error fetching users:", error);
      return;
    }

    setUsersWithoutDevices(data || []);
  }

  function resetLabelFields() {
    setNewLabelName("");
    setLabelType("event");
    setDecaySeconds("");
    setEmaActiveText("");
    setEmaActiveColor("danger");
  }

  function addLabel() {
    if (!newLabelName.trim()) return;

    if (labelType === "decay" && !decaySeconds) {
      alert("Decay labels require decay time");
      return;
    }

    if (labelType === "ema" && !emaActiveText.trim()) {
      alert("State labels require active button text.");
      return;
    }

    setLabels((current) => [
      ...current,
      {
        label_name: newLabelName.trim(),
        label_type: labelType,
        decay_seconds: labelType === "decay" ? Number(decaySeconds) : null,
        ema_interval_seconds: null,
        ema_prompt: null,
        ema_active_text: labelType === "ema" ? emaActiveText.trim() : null,
        ema_active_color: labelType === "ema" ? emaActiveColor : null,
      },
    ]);

    resetLabelFields();
  }

  function removeLabel(indexToRemove) {
    setLabels((current) => current.filter((_, index) => index !== indexToRemove));
  }

  async function createForm() {
    if (!title.trim() || labels.length === 0) {
      alert("Form title and at least one label are required.");
      return;
    }

    const { data: form, error } = await supabase
      .from("forms")
      .insert({
        title: title.trim(),
        description: description.trim(),
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    const { error: labelsError } = await supabase.from("labels").insert(
      labels.map((label) => ({
        form_id: form.id,
        label_name: label.label_name,
        label_type: label.label_type,
        decay_seconds: label.decay_seconds,
        ema_interval_seconds: label.ema_interval_seconds,
        ema_prompt: label.ema_prompt,
        ema_active_text: label.ema_active_text,
        ema_active_color: label.ema_active_color,
      }))
    );

    if (labelsError) {
      alert(labelsError.message);
      return;
    }

    setTitle("");
    setDescription("");
    setLabels([]);
    resetLabelFields();
    fetchForms();
  }

  async function confirmDeleteForm() {
    if (!deleteTarget) return;

    if (confirmText !== deleteTarget.title) {
      alert("Form title does not match");
      return;
    }

    await supabase.from("user_logs").delete().eq("form_id", deleteTarget.id);
    await supabase.from("forms").delete().eq("id", deleteTarget.id);

    setDeleteTarget(null);
    setConfirmText("");
    fetchForms();
  }

  async function assignDevice() {
    if (!selectedUserId || !deviceId.trim()) {
      alert("Select a user and enter a device ID");
      return;
    }

    const { error } = await supabase.from("emotibit_devices").insert({
      user_id: selectedUserId,
      device_id: deviceId.trim(),
    });

    if (error) {
      alert("Error assigning device: " + error.message);
      return;
    }

    await supabase.from("users_without_devices").delete().eq("id", selectedUserId);

    setDeviceId("");
    setSelectedUserId(null);
    fetchUsersWithoutDevices();
  }

  async function logout() {
    await supabase.auth.signOut();
    navigate("/");
  }

  function labelTypeCopy(type) {
    if (type === "event") return "Instant";
    if (type === "decay") return "Decay";
    return "State";
  }

  function labelChipClass(label) {
    if (label.label_type === "decay") return "dashboard-chip dashboard-chip-warning";
    if (label.label_type === "ema") return "dashboard-chip dashboard-chip-state";
    return "dashboard-chip dashboard-chip-primary";
  }

  function selectedColorLabel() {
    return EMA_COLOR_OPTIONS.find((option) => option.value === emaActiveColor)?.label || "Custom";
  }

  return (
    <div className="dashboard-shell">
      <div className="dashboard-backdrop dashboard-backdrop-one" />
      <div className="dashboard-backdrop dashboard-backdrop-two" />

      <div className="container py-4 py-md-5 position-relative">
        <section className="dashboard-hero">
          <div>
            <img
              className="dashboard-inline-logo"
              src={dashboardLogo}
              alt="BehaviorTrace logo"
            />
            <p className="dashboard-subtitle">
              Create forms, tune label behavior, and assign devices from one place.
            </p>
          </div>

          <div className="dashboard-hero-actions">
            <div className="dashboard-stat">
              <span className="dashboard-stat-value">{forms.length}</span>
              <span className="dashboard-stat-label">Forms</span>
            </div>
            <div className="dashboard-stat">
              <span className="dashboard-stat-value">{usersWithoutDevices.length}</span>
              <span className="dashboard-stat-label">Waiting for devices</span>
            </div>
          </div>
          <button className="btn dashboard-logout-btn" onClick={logout}>
            Logout
          </button>
        </section>

        <div className="dashboard-grid">
          <section className="dashboard-panel">
            <div className="dashboard-panel-header">
              <div>
                <p className="dashboard-panel-kicker">Device queue</p>
                <h2>Assign EmotiBit devices</h2>
              </div>
              <span className="dashboard-pill">{usersWithoutDevices.length} pending</span>
            </div>

            <div className="dashboard-stack">
              <label className="dashboard-label">Participant</label>
              <select
                className="dashboard-input"
                value={selectedUserId || ""}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="">Select participant</option>
                {usersWithoutDevices.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.email || user.id}
                  </option>
                ))}
              </select>

              <label className="dashboard-label">Device ID</label>
              <input
                className="dashboard-input"
                placeholder="Enter device ID"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
              />

              <button className="dashboard-action-btn" onClick={assignDevice}>
                Assign device
              </button>
            </div>
          </section>

          <section className="dashboard-panel dashboard-panel-form">
            <div className="dashboard-panel-header">
              <div>
                <p className="dashboard-panel-kicker">Form builder</p>
                <h2>Create a new study form</h2>
              </div>
              <span className="dashboard-pill dashboard-pill-accent">
                {labels.length} staged label{labels.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className="dashboard-stack">
              <div className="dashboard-field-grid">
                <div>
                  <label className="dashboard-label">Form title</label>
                  <input
                    className="dashboard-input"
                    placeholder="e.g. Classroom behavior"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div>
                  <label className="dashboard-label">Description</label>
                  <textarea
                    className="dashboard-input dashboard-textarea"
                    placeholder="Short description for the participant"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="dashboard-creator-card">
                <div className="dashboard-creator-header">
                  <div>
                    <p className="dashboard-panel-kicker">Label composer</p>
                    <h3>Design one label at a time</h3>
                  </div>
                  <div className="dashboard-type-toggle" role="tablist" aria-label="Label type">
                    <button
                      type="button"
                      className={labelType === "event" ? "is-active" : ""}
                      onClick={() => setLabelType("event")}
                    >
                      Instant
                    </button>
                    <button
                      type="button"
                      className={labelType === "decay" ? "is-active" : ""}
                      onClick={() => setLabelType("decay")}
                    >
                      Decay
                    </button>
                    <button
                      type="button"
                      className={labelType === "ema" ? "is-active" : ""}
                      onClick={() => setLabelType("ema")}
                    >
                      State
                    </button>
                  </div>
                </div>

                <div className="dashboard-field-grid">
                  <div>
                    <label className="dashboard-label">Label name</label>
                    <input
                      className="dashboard-input"
                      placeholder="e.g. Feeling angry"
                      value={newLabelName}
                      onChange={(e) => setNewLabelName(e.target.value)}
                    />
                  </div>

                  {labelType === "decay" && (
                    <div>
                      <label className="dashboard-label">Decay duration</label>
                      <input
                        type="number"
                        className="dashboard-input"
                        placeholder="Seconds"
                        value={decaySeconds}
                        onChange={(e) => setDecaySeconds(e.target.value)}
                      />
                    </div>
                  )}

                  {labelType === "ema" && (
                    <>
                      <div>
                        <label className="dashboard-label">Active button text</label>
                        <input
                          className="dashboard-input"
                          placeholder='e.g. "Stop - feeling angry"'
                          value={emaActiveText}
                          onChange={(e) => setEmaActiveText(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="dashboard-label">Active color</label>
                        <select
                          className="dashboard-input"
                          value={emaActiveColor}
                          onChange={(e) => setEmaActiveColor(e.target.value)}
                        >
                          {EMA_COLOR_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>

                <div className="dashboard-preview-row">
                  <div className="dashboard-preview-card">
                    <span className="dashboard-preview-label">Preview:</span>
                    <div className={labelChipClass({ label_type: labelType })}>
                      {newLabelName || "New label"}
                    </div>
                    {labelType === "ema" && (
                      <div className={`dashboard-active-preview dashboard-active-${emaActiveColor}`}>
                        {emaActiveText || "Stop state"}
                      </div>
                    )}
                    {labelType === "decay" && decaySeconds && (
                      <p className="dashboard-preview-copy">Auto-decay after {decaySeconds}s</p>
                    )}
                    {labelType === "ema" && (
                      <p className="dashboard-preview-copy">Active color: {selectedColorLabel()}</p>
                    )}
                  </div>

                  <button className="dashboard-secondary-btn" onClick={addLabel}>
                    Add label to form
                  </button>
                </div>
              </div>

              <div className="dashboard-staged-area">
                <div className="dashboard-staged-header">
                  <h3>Staged labels</h3>
                  <span>{labels.length} ready</span>
                </div>

                {labels.length === 0 ? (
                  <div className="dashboard-empty-state">
                    Your labels will appear here as you build the form.
                  </div>
                ) : (
                  <div className="dashboard-label-list">
                    {labels.map((label, index) => (
                      <div key={`${label.label_name}-${index}`} className="dashboard-label-card">
                        <div>
                          <div className={labelChipClass(label)}>
                            {label.label_name}
                          </div>
                          <p className="dashboard-label-meta">
                            {labelTypeCopy(label.label_type)}
                            {label.label_type === "decay" && label.decay_seconds
                              ? ` · ${label.decay_seconds}s`
                              : ""}
                            {label.label_type === "ema" && label.ema_active_text
                              ? ` · ${label.ema_active_text}`
                              : ""}
                          </p>
                        </div>

                        <button
                          type="button"
                          className="dashboard-remove-btn"
                          onClick={() => removeLabel(index)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button className="dashboard-action-btn dashboard-create-btn" onClick={createForm}>
                Publish form
              </button>
            </div>
          </section>
        </div>

        <section className="dashboard-panel dashboard-existing-panel">
          <div className="dashboard-panel-header">
            <div>
              <p className="dashboard-panel-kicker">Library</p>
              <h2>Existing forms</h2>
            </div>
            <span className="dashboard-pill">{forms.length} total</span>
          </div>

          {forms.length === 0 ? (
            <div className="dashboard-empty-state">No forms yet. Create your first one above.</div>
          ) : (
            <div className="dashboard-form-grid">
              {forms.map((form) => (
                <article key={form.id} className="dashboard-form-card">
                  <div>
                    <h3>{form.title}</h3>
                    <p>{form.description || "No description provided yet."}</p>
                  </div>

                  <button
                    className="dashboard-danger-btn"
                    onClick={() => {
                      setDeleteTarget(form);
                      setConfirmText("");
                    }}
                  >
                    Delete form
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        {deleteTarget && (
          <div className="dashboard-modal-backdrop">
            <div className="dashboard-modal-card">
              <p className="dashboard-panel-kicker">Delete form</p>
              <h3>Type the form title to confirm</h3>
              <p className="dashboard-modal-copy">
                This will permanently remove <strong>{deleteTarget.title}</strong> and related data.
              </p>

              <input
                className="dashboard-input"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Enter exact form title"
              />

              <div className="dashboard-modal-actions">
                <button className="dashboard-danger-btn" onClick={confirmDeleteForm}>
                  Delete permanently
                </button>
                <button
                  className="dashboard-secondary-btn"
                  onClick={() => setDeleteTarget(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
