"use client";

import { useActionState, useState } from "react";
import { signGuestbookAction, type GuestbookActionState } from "./actions";
import { withNetworkErrorHandling } from "@/lib/actionResilience";

const initialState: GuestbookActionState = {};

function draftKey(handle: string) {
  return `iofus-guestbook-draft-${handle}`;
}

/** Reads the saved draft for *handle* from localStorage, or "" when unavailable. */
function readSavedDraft(handle: string): string {
  try {
    return localStorage.getItem(draftKey(handle)) ?? "";
  } catch {
    // localStorage unavailable (private browsing, etc.)
    return "";
  }
}

/** Guestbook form with localStorage draft auto-save/restore. Saves on every change; clears on submit. */
export function GuestbookSignForm({ handle }: { handle: string }) {
  const boundAction = signGuestbookAction.bind(null, handle);
  const [state, formAction, pending] = useActionState(withNetworkErrorHandling(boundAction), initialState);
  const [draft, setDraft] = useState(() => readSavedDraft(handle));
  const [draftSaved, setDraftSaved] = useState(() => readSavedDraft(handle) !== "");

  // Restore draft when the handle changes, and clear it after a successful
  // sign. React's endorsed pattern of adjusting state during render when a
  // prop/value changes — this avoids cascading renders from setting state
  // inside an effect.
  const [prevHandle, setPrevHandle] = useState(handle);
  const [prevSuccess, setPrevSuccess] = useState<string | undefined>(undefined);
  if (prevHandle !== handle) {
    setPrevHandle(handle);
    const restored = readSavedDraft(handle);
    setDraft(restored);
    setDraftSaved(restored !== "");
  } else if (state.success && prevSuccess !== state.success) {
    setPrevSuccess(state.success);
    setDraft("");
    setDraftSaved(false);
    try {
      localStorage.removeItem(draftKey(handle));
    } catch {
      // localStorage unavailable
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setDraft(val);
    try {
      if (val) {
        localStorage.setItem(draftKey(handle), val);
        setDraftSaved(true);
      } else {
        localStorage.removeItem(draftKey(handle));
        setDraftSaved(false);
      }
    } catch {
      // localStorage unavailable
      setDraftSaved(false);
    }
  }

  return (
    <section className="guestbook-sign container-narrow" aria-label="Sign guestbook">
      <h2 className="part-label">Sign the guestbook</h2>
      {state.error && (
        <div className="error-banner" role="alert">{state.error}</div>
      )}
      {state.success && (
        <div className="success-banner" role="status">{state.success}</div>
      )}
      <form action={formAction}>
        <div className="field">
          <label htmlFor="guestbook-message">Your message</label>
          <textarea
            id="guestbook-message"
            name="message"
            rows={3}
            maxLength={500}
            required
            placeholder="Say something nice…"
            value={draft}
            onChange={handleChange}
          />
          <span className="hint">Up to 500 characters.{draftSaved && " Draft saved."}</span>
        </div>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Signing…" : "Sign guestbook"}
        </button>
      </form>
    </section>
  );
}
