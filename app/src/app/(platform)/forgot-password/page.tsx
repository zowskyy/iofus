"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction, type ForgotState } from "./actions";

const initialState: ForgotState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initialState);

  if (state.sent) {
    return (
      <main className="container">
        <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          iofus
        </p>
        <h1>Check your email</h1>
        <p style={{ color: "var(--ink-soft)" }}>
          If that handle or email address has a reset link on file, we just sent it. The link expires in one hour.
        </p>
        <p style={{ marginTop: "1.5rem", fontSize: "0.9rem" }}>
          <Link href="/login">Back to log in</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        iofus
      </p>
      <h1>Reset your password</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        Enter your handle or the email address on your account. If we have a match, we'll send a reset link.
      </p>

      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}

      <form action={formAction}>
        <div className="field">
          <label htmlFor="emailOrHandle">Handle or email</label>
          <input
            id="emailOrHandle"
            name="emailOrHandle"
            type="text"
            required
            autoComplete="email username"
            placeholder="voidarcade or you@example.com"
          />
        </div>

        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p style={{ marginTop: "1.5rem", fontSize: "0.9rem" }}>
        <Link href="/login">Back to log in</Link>
      </p>
    </main>
  );
}
