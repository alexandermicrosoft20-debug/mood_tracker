/**
 * BehaviorTrace — Admin Dashboard (Forms, Labels, Device Assignment)
 * Written by Paul Gedrimas — 12/2025
 *
 * This component:
 * - Requires an authenticated session (admin flow enforced elsewhere via routing/guards)
 * - Lets admins create "forms" that contain multiple labeling buttons
 * - Supports three label types:
 *   - event: instantaneous log entry (saved to user_logs)
 *   - decay: event with decay metadata (saved to labels.decay_seconds)
 *   - ema: state label that triggers periodic confirmation prompts (saved to labels.ema_interval_seconds + labels.ema_prompt)
 * - Allows admins to assign EmotiBit device IDs to users who do not yet have a device
 * - Allows admins to delete forms (and associated user_logs)
 */

import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const navigate = useNavigate();

  // -------------------------
  // STATE (session + data)
  // -------------------------
  const [userId, setUserId] = useState(null);

  // Existing forms (pulled from DB)
  const [forms, setForms] = useState([]);

  // Form creation fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Label creation fields (labels are staged locally until "Create Form")
  const [newLabelName, setNewLabelName] = useState("");
  const [labelType, setLabelType] = useState("event");
  const [decaySeconds, setDecaySeconds] = useState("");
  const [emaInterval, setEmaInterval] = useState("");
  const [emaPrompt, setEmaPrompt] = useState("");

  // Staged labels to be inserted with the new form
  const [labels, setLabels] = useState([]);

  // Form deletion confirmation state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmText, setConfirmText] = useState("");

  // -------------------------
  // STATE (device assignment)
  // -------------------------
  const [usersWithoutDevices, setUsersWithoutDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);

  // -------------------------
  // INIT (auth check + initial fetch)
  // -------------------------
  useEffect(() => {
    const init = async () => {
      // Require a valid session; otherwise redirect to login
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        navigate("/");
        return;
      }

      setUserId(session.user.id);

      // Load existing forms and users awaiting device assignment
      await fetchForms();
      await fetchUsersWithoutDevices();
    };

    init();
    // Note: navigate not included intentionally to avoid reruns
  }, []);

  // -------------------------
  // DATA FETCHING
  // -------------------------
  async function fetchForms() {
    // Fetch all forms (most recent first)
    const { data } = await supabase
      .from("forms")
      .select("*")
      .order("created_at", { ascending: false });

    setForms(data || []);
  }

  async function fetchUsersWithoutDevices() {
    // This assumes a table/view "users_without_devices" exists containing id + email
    // Used to show admins who still need an EmotiBit device assigned
    const { data, error } = await supabase
      .from("users_without_devices")
      .select("id, email");

    if (error) {
      console.error("Error fetching users:", error);
      return;
    }

    setUsersWithoutDevices(data || []);
  }

  // -------------------------
  // LABEL STAGING (local list before DB insert)
  // -------------------------
  function addLabel() {
    // Require a non-empty label name
    if (!newLabelName.trim()) return;

    // Validate decay label configuration
    if (labelType === "decay" && !decaySeconds) {
      alert("Decay labels require decay time");
      return;
    }

    // Validate EMA label configuration
    if (labelType === "ema") {
      if (!emaInterval) {
        alert("EMA labels require prompt interval");
        return;
      }
      if (!emaPrompt.trim()) {
        alert("EMA labels require a prompt (what the user will be asked).");
        return;
      }
    }

    // Append new staged label object
    setLabels([
      ...labels,
      {
        label_name: newLabelName.trim(),
        label_type: labelType,
        decay_seconds: labelType === "decay" ? Number(decaySeconds) : null,
        ema_interval_seconds: labelType === "ema" ? Number(emaInterval) : null,
        ema_prompt: labelType === "ema" ? emaPrompt.trim() : null,
      },
    ]);

    // Reset label inputs back to defaults
    setNewLabelName("");
    setLabelType("event");
    setDecaySeconds("");
    setEmaInterval("");
    setEmaPrompt("");
  }

  // -------------------------
  // FORM CREATION (forms + labels)
  // -------------------------
  async function createForm() {
    // Require at least a title and at least one label
    if (!title || labels.length === 0) {
      alert("Form title and labels required");
      return;
    }

    // Insert form first to get form.id
    const { data: form, error } = await supabase
      .from("forms")
      .insert({ title, description, created_by: userId })
      .select()
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    // Insert associated labels referencing the new form.id
    await supabase.from("labels").insert(
      labels.map((l) => ({
        form_id: form.id,
        label_name: l.label_name,
        label_type: l.label_type,
        decay_seconds: l.decay_seconds,
        ema_interval_seconds: l.ema_interval_seconds,
        ema_prompt: l.ema_prompt,
      }))
    );

    // Reset UI and refresh form list
    setTitle("");
    setDescription("");
    setLabels([]);
    fetchForms();
  }

  // -------------------------
  // FORM DELETION (guarded by title confirmation)
  // -------------------------
  async function confirmDeleteForm() {
    if (!deleteTarget) return;

    // Require typing the exact form title to confirm deletion
    if (confirmText !== deleteTarget.title) {
      alert("Form title does not match");
      return;
    }

    // Delete user logs for that form (optional: avoids orphaned logs)
    await supabase.from("user_logs").delete().eq("form_id", deleteTarget.id);

    // Delete the form (labels may cascade if FK is configured with ON DELETE CASCADE)
    await supabase.from("forms").delete().eq("id", deleteTarget.id);

    // Reset deletion UI state and refresh forms
    setDeleteTarget(null);
    setConfirmText("");
    fetchForms();
  }

  // -------------------------
  // DEVICE ASSIGNMENT
  // -------------------------
  async function assignDevice() {
    // Require user selection and device id input
    if (!selectedUserId || !deviceId.trim()) {
      alert("Select a user and enter a device ID");
      return;
    }

    // Insert mapping into emotibit_devices
    const { error } = await supabase.from("emotibit_devices").insert({
      user_id: selectedUserId,
      device_id: deviceId.trim(),
    });

    if (error) {
      alert("Error assigning device: " + error.message);
      return;
    }

    // Remove from users_without_devices if that table is meant to track pending assignments
    await supabase.from("users_without_devices").delete().eq("id", selectedUserId);

    // Reset UI and refresh users list
    setDeviceId("");
    setSelectedUserId(null);
    fetchUsersWithoutDevices();
  }

  // -------------------------
  // AUTH
  // -------------------------
  async function logout() {
    await supabase.auth.signOut();
    navigate("/");
  }

  // -------------------------
  // RENDER
  // -------------------------
  return (
    <div className="container mt-5">
      <div className="d-flex justify-content-between mb-4">
        <h1>Admin Dashboard</h1>
        <button className="btn btn-outline-danger" onClick={logout}>
          Logout
        </button>
      </div>

      <hr />

      {/* ------------------------- */}
      {/* DEVICE ASSIGNMENT */}
      {/* ------------------------- */}
      <h3>Assign Devices</h3>

      <select
        className="form-control mb-2"
        value={selectedUserId || ""}
        onChange={(e) => setSelectedUserId(e.target.value)}
      >
        <option value="">Select User</option>
        {usersWithoutDevices.map((u) => (
          <option key={u.id} value={u.id}>
            {u.email || u.id}
          </option>
        ))}
      </select>

      <input
        className="form-control mb-2"
        placeholder="Device ID"
        value={deviceId}
        onChange={(e) => setDeviceId(e.target.value)}
      />

      <button className="btn btn-primary" onClick={assignDevice}>
        Assign Device
      </button>

      <hr />

      {/* ------------------------- */}
      {/* FORM CREATION */}
      {/* ------------------------- */}
      <h3>Create Form</h3>

      <input
        className="form-control mb-2"
        placeholder="Form title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <textarea
        className="form-control mb-3"
        placeholder="Form description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      {/* ------------------------- */}
      {/* LABEL CREATION */}
      {/* ------------------------- */}
      <h5>Add Label</h5>

      <input
        className="form-control mb-2"
        placeholder="Label name"
        value={newLabelName}
        onChange={(e) => setNewLabelName(e.target.value)}
      />

      <select
        className="form-control mb-2"
        value={labelType}
        onChange={(e) => setLabelType(e.target.value)}
      >
        {/* UI naming: event labels are "Instant" */}
        <option value="event">Instant</option>
        <option value="decay">Decay</option>
        <option value="ema">State (EMA)</option>
      </select>

      {/* Decay configuration */}
      {labelType === "decay" && (
        <input
          type="number"
          className="form-control mb-2"
          placeholder="Decay seconds"
          value={decaySeconds}
          onChange={(e) => setDecaySeconds(e.target.value)}
        />
      )}

      {/* EMA configuration */}
      {labelType === "ema" && (
        <>
          <input
            type="number"
            className="form-control mb-2"
            placeholder="Prompt interval (seconds)"
            value={emaInterval}
            onChange={(e) => setEmaInterval(e.target.value)}
          />
          <input
            className="form-control mb-2"
            placeholder='State prompt (e.g. "Are you still running?")'
            value={emaPrompt}
            onChange={(e) => setEmaPrompt(e.target.value)}
          />
        </>
      )}

      <button className="btn btn-secondary mb-3" onClick={addLabel}>
        Add Label
      </button>

      {/* Preview staged labels before creating the form */}
      <ul>
        {labels.map((l, i) => (
          <li key={i}>
            {l.label_name} — {l.label_type}
            {l.label_type === "ema"
              ? ` (every ${l.ema_interval_seconds}s: "${l.ema_prompt}")`
              : ""}
          </li>
        ))}
      </ul>

      <button className="btn btn-primary" onClick={createForm}>
        Create Form
      </button>

      <hr />

      {/* ------------------------- */}
      {/* EXISTING FORMS + DELETE */}
      {/* ------------------------- */}
      <h3>Existing Forms</h3>

      <ul className="list-group">
        {forms.map((f) => (
          <li
            key={f.id}
            className="list-group-item d-flex justify-content-between"
          >
            {f.title}
            <button
              className="btn btn-sm btn-outline-danger"
              onClick={() => {
                setDeleteTarget(f);
                setConfirmText("");
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>

      {/* Delete confirmation panel */}
      {deleteTarget && (
        <div className="mt-4 border p-3">
          <p>
            Type <strong>{deleteTarget.title}</strong> to confirm deletion
          </p>
          <input
            className="form-control mb-2"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
          <button className="btn btn-danger" onClick={confirmDeleteForm}>
            Delete
          </button>
          <button
            className="btn btn-secondary ms-2"
            onClick={() => setDeleteTarget(null)}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
