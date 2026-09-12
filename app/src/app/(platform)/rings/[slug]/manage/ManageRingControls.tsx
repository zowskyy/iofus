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
              <RingRequestRow key={req.userId} slug={ring.slug} req={req} />
            ))}
          </ul>
        </section>
      )}

      {members.length > 0 && (
        <section className="settings-section">
          <h2>Members ({members.length})</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {members.map((m) => (
              <RingMemberRow key={m.handle} slug={ring.slug} member={m} />
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

function RingRequestRow({ slug, req }: { slug: string; req: WebRingJoinRequest }) {
  const acceptBound = reviewRequestAction.bind(null, slug, req.userId, true);
  const [acceptState, acceptAction, acceptPending] = useActionState<ManageRingState, FormData>(
    withNetworkErrorHandling(acceptBound),
    {},
  );
  const rejectBound = reviewRequestAction.bind(null, slug, req.userId, false);
  const [rejectState, rejectAction, rejectPending] = useActionState<ManageRingState, FormData>(
    withNetworkErrorHandling(rejectBound),
    {},
  );
  // Only one of accept/reject can ever be in flight or have errored for a
  // given row — the request disappears from the list (revalidatePath) the
  // moment either one succeeds — so surfacing whichever fired is unambiguous.
  const error = acceptState.error ?? rejectState.error;
  const pending = acceptPending || rejectPending;

  return (
    <li style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
      <span className="mono">@{req.handle}</span>
      {error && <span role="alert" style={{ color: "var(--danger)", fontSize: "0.75rem" }}>{error}</span>}
      <form action={acceptAction}>
        <button type="submit" className="btn" disabled={pending} style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem" }}>
          {acceptPending ? "Accepting…" : "Accept"}
        </button>
      </form>
      <form action={rejectAction}>
        <button type="submit" className="btn secondary" disabled={pending} style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem" }}>
          {rejectPending ? "Rejecting…" : "Reject"}
        </button>
      </form>
    </li>
  );
}

function RingMemberRow({ slug, member }: { slug: string; member: WebRingMember }) {
  const removeBound = removeMemberAction.bind(null, slug, member.handle);
  const [removeState, removeAction, removePending] = useActionState<ManageRingState, FormData>(
    withNetworkErrorHandling(removeBound),
    {},
  );

  return (
    <li style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
      <span>{member.displayName}</span>
      <span className="mono" style={{ color: "var(--ink-soft)", fontSize: "0.75rem" }}>@{member.handle}</span>
      {removeState.error && <span role="alert" style={{ color: "var(--danger)", fontSize: "0.75rem" }}>{removeState.error}</span>}
      <form action={removeAction}>
        <button type="submit" className="btn secondary" disabled={removePending} style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem" }}>
          {removePending ? "Removing…" : "Remove"}
        </button>
      </form>
    </li>
  );
}
