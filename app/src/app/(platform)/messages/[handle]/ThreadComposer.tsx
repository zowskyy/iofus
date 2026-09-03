"use client";

import { useActionState, useState } from "react";
import { sendMessageAction, type SendMessageState } from "../actions";
import { withNetworkErrorHandling } from "@/lib/actionResilience";

const initialState: SendMessageState = {};

/** Message-composition form for a direct-message thread with *recipientHandle*. */
export function ThreadComposer({ recipientHandle }: { recipientHandle: string }) {
  const boundAction = sendMessageAction.bind(null, recipientHandle);
  const [state, formAction, pending] = useActionState(withNetworkErrorHandling(boundAction), initialState);
  // Controlled so a handled network failure (or validation error) doesn't
  // wipe out the message the user just typed — see PublishThemeForm.tsx.
  // Since the reset that used to clear it on success no longer applies to a
  // controlled field, clear explicitly once a submission comes back without
  // an error (skipping the initial render, where state is still the exact
  // initialState reference and nothing was submitted).
  const [body, setBody] = useState("");
  if (state !== initialState && !state.error && body !== "") {
    setBody("");
  }

  return (
    <form action={formAction} className="msg-composer">
      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}
      <textarea
        name="body"
        rows={3}
        maxLength={4000}
        placeholder={`Message ${recipientHandle}...`}
        required
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="msg-composer-actions">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
