"use client";

import { useActionState } from "react";
import {
  acceptIncomingAction,
  approveGuestbookAction,
  declineIncomingAction,
  panicModeAction,
  rejectGuestbookAction,
  SettingsActionState,
  unblockAction,
} from "./actions";

// Deliberately NOT wrapped in withNetworkErrorHandling (unlike
// ManageRingControls): that wrapper returns a plain client closure, which
// loses the Server Action reference React/Next needs to encode a native
// pre-hydration form submission — exactly the case ("JS hasn't loaded yet
// on a slow mobile connection") this mobile-first pass cares about most.
// Passing the bound action straight into useActionState keeps that working;
// the actions above already return a `{ error }` state for every expected
// failure themselves, so pending-disable and inline errors still work —
// only an actual dropped-connection network error goes unhandled here,
// same as these forms behaved before this refactor (no client JS at all).

/** Panic mode's single toggle button — pending-disabled so a slow mobile network can't queue a second, state-flipping submit behind the first. */
export function PanicModeButton({ panicActive }: { panicActive: boolean }) {
  const bound = panicModeAction.bind(null, !panicActive);
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(bound, {});

  return (
    <form action={action}>
      {state.error && (
        <p role="alert" style={{ color: "var(--danger)", marginBottom: "0.5rem" }}>
          {state.error}
        </p>
      )}
      <button
        type="submit"
        className="btn"
        disabled={pending}
        style={
          panicActive
            ? { background: "#2563eb", borderColor: "#2563eb" }
            : { background: "var(--danger)", borderColor: "var(--danger)" }
        }
      >
        {pending ? "Working…" : panicActive ? "Deactivate panic mode" : "Activate panic mode"}
      </button>
    </form>
  );
}

export function FriendRequestRow({ requestId, fromHandle }: { requestId: string; fromHandle: string }) {
  const acceptBound = acceptIncomingAction.bind(null, requestId);
  const [acceptState, acceptDispatch, acceptPending] = useActionState<SettingsActionState, FormData>(
    acceptBound,
    {},
  );
  const declineBound = declineIncomingAction.bind(null, requestId);
  const [declineState, declineDispatch, declinePending] = useActionState<SettingsActionState, FormData>(
    declineBound,
    {},
  );
  const error = acceptState.error ?? declineState.error;
  const pending = acceptPending || declinePending;

  return (
    <li className="settings-list-item">
      <a href={`/@${fromHandle}`}>@{fromHandle}</a>
      {error && <span role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</span>}
      <div className="settings-actions-row">
        <form action={acceptDispatch}>
          <button type="submit" className="btn" disabled={pending}>
            {acceptPending ? "Accepting…" : "Accept"}
          </button>
        </form>
        <form
          action={declineDispatch}
          onSubmit={(e) => {
            if (!confirm(`Decline @${fromHandle}'s friend request?`)) e.preventDefault();
          }}
        >
          <button type="submit" className="btn secondary" disabled={pending}>
            {declinePending ? "Declining…" : "Decline"}
          </button>
        </form>
      </div>
    </li>
  );
}

export function BlockedUserRow({ handle }: { handle: string }) {
  const bound = unblockAction.bind(null, handle);
  const [state, dispatch, pending] = useActionState<SettingsActionState, FormData>(bound, {});

  return (
    <li className="settings-list-item">
      <span>@{handle}</span>
      {state.error && <span role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{state.error}</span>}
      <form action={dispatch}>
        <button type="submit" className="btn secondary" disabled={pending}>
          {pending ? "Unblocking…" : "Unblock"}
        </button>
      </form>
    </li>
  );
}

export function GuestbookEntryRow({
  entryId,
  message,
  authorHandle,
}: {
  entryId: string;
  message: string;
  authorHandle: string | null;
}) {
  const approveBound = approveGuestbookAction.bind(null, entryId);
  const [approveState, approveDispatch, approvePending] = useActionState<SettingsActionState, FormData>(
    approveBound,
    {},
  );
  const rejectBound = rejectGuestbookAction.bind(null, entryId);
  const [rejectState, rejectDispatch, rejectPending] = useActionState<SettingsActionState, FormData>(
    rejectBound,
    {},
  );
  const error = approveState.error ?? rejectState.error;
  const pending = approvePending || rejectPending;

  return (
    <li className="settings-list-item settings-guestbook-item">
      <p className="guestbook-message">{message}</p>
      <p className="guestbook-meta mono">{authorHandle ? `@${authorHandle}` : "Anonymous"}</p>
      {error && <span role="alert" style={{ color: "var(--danger)", fontSize: "0.85rem" }}>{error}</span>}
      <div className="settings-actions-row">
        <form action={approveDispatch}>
          <button type="submit" className="btn" disabled={pending}>
            {approvePending ? "Approving…" : "Approve"}
          </button>
        </form>
        <form
          action={rejectDispatch}
          onSubmit={(e) => {
            if (!confirm("Reject this guestbook entry?")) e.preventDefault();
          }}
        >
          <button type="submit" className="btn secondary" disabled={pending}>
            {rejectPending ? "Rejecting…" : "Reject"}
          </button>
        </form>
      </div>
    </li>
  );
}
