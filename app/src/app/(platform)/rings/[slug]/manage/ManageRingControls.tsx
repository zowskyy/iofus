"use client";

import { useActionState, useState } from "react";
import { WebRing, WebRingMember, WebRingJoinRequest } from "@/lib/webRings";
import { withNetworkErrorHandling } from "@/lib/actionResilience";
import {
  deleteRingAction,
  ManageRingState,
  removeMemberAction,
  reviewRequestAction,
  updateRingAction,
} from "./actions";

interface Props {
  ring: WebRing;
  members: WebRingMember[];
  requests: WebRingJoinRequest[];
}

export function ManageRingControls({ ring, members, requests }: Props) {
  const updateBound = updateRingAction.bind(null, ring.slug);
  const [updateState, updateAction, updatePending] = useActionState<ManageRingState, FormData>(
    withNetworkErrorHandling(updateBound),
    {},
  );
  const deleteBound = deleteRingAction.bind(null, ring.slug);
  const [deleteState, deleteAction, deletePending] = useActionState<ManageRingState, FormData>(
    withNetworkErrorHandling(deleteBound),
    {},
  );
  // Controlled so a handled network failure doesn't wipe out edits in
  // progress — see PublishThemeForm.tsx for the full reasoning.
  const [name, setName] = useState(ring.name);
  const [description, setDescription] = useState(ring.description);

  return (
    <>
      <section className="settings-section" style={{ maxWidth: "32rem" }}>
        <h2>Edit ring details</h2>
        {updateState.error && <p role="alert" style={{ color: "var(--danger)" }}>{updateState.error}</p>}
        {updateState.success && <p style={{ color: "var(--moss)" }}>{updateState.success}</p>}
        <form action={updateAction}>
          <label className="settings-label">
            Name
            <input
              name="name"
              type="text"
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="settings-input"
            />
          </label>
          <label className="settings-label">
            Description
            <textarea
              name="description"
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="settings-input"
            />
          </label>
          <button type="submit" className="btn" disabled={updatePending}>
            {updatePending ? "Saving…" : "Save changes"}
          </button>
        </form>
      </section>

      {requests.length > 0 && (
        <section className="settings-section">
          <h2>Join requests ({requests.length})</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {requests.map((req) => (
              <li key={req.userId} style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <span className="mono">@{req.handle}</span>
                <form action={reviewRequestAction.bind(null, ring.slug, req.userId, true)}>
                  <button type="submit" className="btn" style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem" }}>Accept</button>
                </form>
                <form action={reviewRequestAction.bind(null, ring.slug, req.userId, false)}>
                  <button type="submit" className="btn secondary" style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem" }}>Reject</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {members.length > 0 && (
        <section className="settings-section">
          <h2>Members ({members.length})</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {members.map((m) => (
              <li key={m.handle} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span>{m.displayName}</span>
                <span className="mono" style={{ color: "var(--ink-soft)", fontSize: "0.75rem" }}>@{m.handle}</span>
                <form action={removeMemberAction.bind(null, ring.slug, m.handle)}>
                  <button type="submit" className="btn secondary" style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem" }}>Remove</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="settings-section" style={{ borderTop: "1px solid var(--border)", paddingTop: "1.5rem" }}>
        <h2 style={{ color: "var(--danger)" }}>Danger zone</h2>
        {deleteState.error && <p role="alert" style={{ color: "var(--danger)" }}>{deleteState.error}</p>}
        <form action={deleteAction}
          onSubmit={(e: React.FormEvent) => { if (!confirm(`Delete "${ring.name}"? This cannot be undone.`)) e.preventDefault(); }}>
          <button type="submit" className="btn" disabled={deletePending} style={{ background: "var(--danger)", borderColor: "var(--danger)" }}>
            {deletePending ? "Deleting…" : "Delete ring"}
          </button>
        </form>
      </section>
    </>
  );
}
