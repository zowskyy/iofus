"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { signGuestbookAction, type GuestbookActionState } from "./actions";

const initialState: GuestbookActionState = {};

function draftKey(handle: string) {
  return `iofus-guestbook-draft-${handle}`;
}

/** Guestbook form with localStorage draft auto-save/restore. Saves on every change; clears on submit. */
export function GuestbookSignForm({ handle }: { handle: string }) {
  const boundAction = signGuestbookAction.bind(null, handle);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [draftSaved, setDraftSaved] = useState(false);

  // Restore draft from localStorage on mount or handle change
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey(handle));
      if (saved) {
        setDraft(saved);
        setDraftSaved(true);
        if (textareaRef.current) textareaRef.current.value = saved;
      } else {
        setDraft("");
        setDraftSaved(false);
        if (textareaRef.current) textareaRef.current.value = "";
      }
    } catch {
      // localStorage unavailable (private browsing, etc.)
      setDraft("");
      setDraftSaved(false);
      if (textareaRef.current) textareaRef.current.value = "";
    }
  }, [handle]);

  // Clear draft on successful submit
  useEffect(() => {
    if (state.success) {
      setDraft("");
      setDraftSaved(false);
      try {
        localStorage.removeItem(draftKey(handle));
      } catch {
        // localStorage unavailable
      }
      if (textareaRef.current) textareaRef.current.value = "";
    }
  }, [state.success, handle]);

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
            ref={textareaRef}
            id="guestbook-message"
            name="message"
            rows={3}
            maxLength={500}
            required
            placeholder="Say something nice…"
            defaultValue={draft}
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
