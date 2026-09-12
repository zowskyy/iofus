"use client";

import { useActionState } from "react";
import { resetPasswordAction, type ResetState } from "./actions";

const initialState: ResetState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const action = resetPasswordAction.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <>
      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}

      <form action={formAction}>
        <div className="field">
          <label htmlFor="password">New password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            aria-describedby="password-hint"
          />
          <span id="password-hint" className="hint">At least 8 characters.</span>
        </div>

        <div className="field">
          <label htmlFor="confirm">Confirm password</label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>

        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Saving…" : "Set new password"}
        </button>
      </form>
    </>
  );
}
