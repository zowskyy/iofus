"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { loginAction, type LoginState } from "./actions";
import { withNetworkErrorHandling } from "@/lib/actionResilience";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(withNetworkErrorHandling(loginAction), initialState);
  const searchParams = useSearchParams();
  const justReset = searchParams.get("reset") === "1";

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        iofus
      </p>
      <h1>Welcome back</h1>

      {justReset && (
        <div className="success-banner" role="status">
          Password updated. Log in with your new password.
        </div>
      )}

      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}

      <form action={formAction}>
        <div className="field">
          <label htmlFor="handle">Handle</label>
          <input id="handle" name="handle" type="text" required autoComplete="username" placeholder="voidarcade" />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>

        <button type="submit" className="btn" disabled={pending}>
          {pending ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
        <Link href="/forgot-password">Forgot your password?</Link>
      </p>
      <p style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>
        New here? <Link href="/signup">Make your page</Link>
      </p>
    </main>
  );
}
