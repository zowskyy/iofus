"use client";

import { useActionState } from "react";
import { sendMessageAction, type SendMessageState } from "../actions";

const initialState: SendMessageState = {};

export function ThreadComposer({ recipientHandle }: { recipientHandle: string }) {
  const boundAction = sendMessageAction.bind(null, recipientHandle);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="aim-composer">
      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}
      <div className="aim-composer-row">
        <textarea
          name="body"
          rows={2}
          maxLength={4000}
          placeholder={`Message ${recipientHandle}...`}
          required
        />
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
