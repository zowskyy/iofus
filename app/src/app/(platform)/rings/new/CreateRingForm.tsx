"use client";

import { useActionState, useState } from "react";
import { createRingAction, CreateRingState } from "./actions";
import { withNetworkErrorHandling } from "@/lib/actionResilience";

export function CreateRingForm() {
  const [state, action, pending] = useActionState<CreateRingState, FormData>(withNetworkErrorHandling(createRingAction), {});
  // Controlled so a handled network failure doesn't wipe out what the user
  // typed — see PublishThemeForm.tsx for the full reasoning.
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <form action={action} className="settings-section" style={{ maxWidth: "32rem" }}>
      {state.error && (
        <p role="alert" style={{ color: "var(--danger)", marginBottom: "1rem" }}>{state.error}</p>
      )}
      <label className="settings-label">
        Ring name
        <input
          name="name"
          type="text"
          required
          maxLength={80}
          className="settings-input"
          placeholder="e.g. Soft Web Webring"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="settings-label">
        Description
        <textarea
          name="description"
          rows={3}
          maxLength={500}
          className="settings-input"
          placeholder="What brings this ring together?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <fieldset style={{ border: "none", padding: 0, margin: "0 0 1rem" }}>
        <legend style={{ fontWeight: 500, marginBottom: "0.5rem" }}>Membership</legend>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
          <input type="radio" name="is_open" value="open" defaultChecked />
          Open — anyone can join immediately
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", marginTop: "0.25rem" }}>
          <input type="radio" name="is_open" value="closed" />
          Invite-only — you approve join requests
        </label>
      </fieldset>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Creating…" : "Create ring"}
      </button>
    </form>
  );
}
