"use client";

import { useActionState } from "react";
import { answerAskAction, type AskActionState } from "./actions";

const initialState: AskActionState = {};

/** Form that lets the page owner submit an answer to a specific ask. */
export function AnswerForm({ askId }: { askId: string }) {
  const boundAction = answerAskAction.bind(null, askId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  if (state.success) {
    return <p className="success-banner" role="status">{state.success}</p>;
  }

  return (
    <form action={formAction} className="ask-answer-form">
      {state.error && <div className="error-banner" role="alert">{state.error}</div>}
      <div className="field">
        <label htmlFor={`answer-${askId}`}>Your answer</label>
        <textarea id={`answer-${askId}`} name="body" rows={2} maxLength={2000} required placeholder="Share what you know…" />
        <span className="hint">Up to 2000 characters.</span>
      </div>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Posting…" : "Answer"}
      </button>
    </form>
  );
}
