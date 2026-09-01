"use client";

import { useActionState } from "react";
import { sendMessageAction, type SendMessageState } from "../actions";
import { withNetworkErrorHandling } from "@/lib/actionResilience";

const initialState: SendMessageState = {};

/** Message-composition form for a direct-message thread with *recipientHandle*. */
export function ThreadComposer({ recipientHandle }: { recipientHandle: string }) {
  const boundAction = sendMessageAction.bind(null, recipientHandle);
  const [state, formAction, pending] = useActionState(withNetworkErrorHandling(boundAction), initialState);

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
      />
      <div className="msg-composer-actions">
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
