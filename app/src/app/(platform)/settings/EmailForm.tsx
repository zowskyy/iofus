"use client";

import { useActionState } from "react";
import { updateEmailAction, type EmailState } from "./actions";

const initialState: EmailState = {};

export function EmailForm({ userId, currentEmail }: { userId: string; currentEmail: string | null }) {
  const action = updateEmailAction.bind(null, userId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <>
      {state.error && <div className="error-banner" role="alert">{state.error}</div>}
      {state.success && <div className="success-banner" role="status">{state.success}</div>}
      <form action={formAction} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ margin: 0, flex: "1 1 16rem" }}>
          <label htmlFor="email" className="sr-only">Recovery email</label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={currentEmail ?? ""}
            placeholder="you@example.com"
            autoComplete="email"
            style={{ width: "100%" }}
          />
        </div>
        <button type="submit" className="btn secondary" disabled={pending} style={{ marginBottom: "0" }}>
          {pending ? "Saving…" : currentEmail ? "Update" : "Save"}
        </button>
      </form>
    </>
  );
}
