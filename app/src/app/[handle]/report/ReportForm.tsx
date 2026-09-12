"use client";

import { useActionState, useState } from "react";
import { reportAction, type ReportState } from "./actions";
import { withNetworkErrorHandling } from "@/lib/actionResilience";

const initialState: ReportState = {};

const REASONS: { value: string; label: string }[] = [
  { value: "harassment", label: "Harassment or targeted abuse" },
  { value: "impersonation", label: "Impersonating someone else" },
  { value: "unsafe-content", label: "Unsafe or dangerous content" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Something else" },
];

export function ReportForm({ handle }: { handle: string }) {
  const boundAction = reportAction.bind(null, handle);
  const [state, formAction, pending] = useActionState(withNetworkErrorHandling(boundAction), initialState);
  // Controlled so a handled network failure doesn't reset the selected
  // reason back to "nothing chosen" — see PublishThemeForm.tsx.
  const [reason, setReason] = useState("");

  return (
    <form action={formAction}>
      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}
      <fieldset style={{ border: "none", padding: 0, margin: "0 0 1.25rem" }}>
        <legend style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Reason</legend>
        {REASONS.map((r) => (
          <label key={r.value} style={{ display: "flex", gap: "0.5rem", padding: "0.35rem 0", alignItems: "center" }}>
            <input
              type="radio"
              name="reason"
              value={r.value}
              required
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
            />
            {r.label}
          </label>
        ))}
      </fieldset>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Sending…" : "Send report"}
      </button>
    </form>
  );
}
