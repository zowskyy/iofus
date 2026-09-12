"use client";

import { useActionState } from "react";
import { createAskAction, type AskActionState } from "./actions";
import { withNetworkErrorHandling } from "@/lib/actionResilience";

const initialState: AskActionState = {};

/** Form that lets a viewer submit a new ask to the current page owner. */
export function AskForm() {
  const [state, formAction, pending] = useActionState(withNetworkErrorHandling(createAskAction), initialState);

  return (
    <section className="settings-section" aria-label="Post an ask">
      <h2>Ask something</h2>
      <p className="settings-empty" style={{ marginBottom: "0.75rem" }}>
        Posted once, not addressed to anyone — anyone in the matching pool can answer.
      </p>
      {state.error && <div className="error-banner" role="alert">{state.error}</div>}
      {state.success && <div className="success-banner" role="status">{state.success}</div>}
      <form action={formAction}>
        <div className="field">
          <label htmlFor="ask-body">Your ask</label>
          <textarea
            id="ask-body"
            name="body"
            rows={3}
            maxLength={2000}
            required
            placeholder="What do you need help, knowledge, or perspective on?"
          />
          <span className="hint">Up to 2000 characters.</span>
        </div>
        <div className="field">
          <label htmlFor="ask-domain">Topic (optional)</label>
          <input id="ask-domain" name="domain" type="text" maxLength={100} placeholder="e.g. career, parenting, gardening" />
          <span className="hint">Helps route your ask to people who tagged the same topic.</span>
        </div>
        <label className="studio-toggle">
          <input type="checkbox" name="anonymous" />
          <span>Post anonymously — your handle won&rsquo;t be shown to anyone but you.</span>
        </label>
        <label className="studio-toggle">
          <input type="checkbox" name="sensitive" />
          <span>Sensitive topic — only show this to my friends, never the open pool.</span>
        </label>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Posting…" : "Post ask"}
        </button>
      </form>
    </section>
  );
}
