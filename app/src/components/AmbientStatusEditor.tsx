"use client";

import { useState, useRef } from "react";

const MAX_LEN = 100;

/** Inline editor for the page owner's own ambient status. Saves via /api/status POST. */
export function AmbientStatusEditor({ initialStatus }: { initialStatus: string | null }) {
  const [status, setStatus] = useState(initialStatus ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function save(text: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? "Failed to save.");
      } else {
        setSaved(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ambient-status-editor">
      <label htmlFor="ambient-status-input" className="field-label">
        Currently…
        <span className="hint"> (shows on your page for 24 h)</span>
      </label>
      <div className="ambient-status-editor-row">
        <input
          id="ambient-status-input"
          type="text"
          value={status}
          maxLength={MAX_LEN}
          placeholder="listening to / making / feeling…"
          onChange={(e) => setStatus(e.target.value)}
        />
        <button
          className="btn"
          disabled={saving}
          onClick={() => save(status)}
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Set"}
        </button>
        {status && (
          <button
            className="btn secondary"
            disabled={saving}
            onClick={() => { setStatus(""); save(""); }}
          >
            Clear
          </button>
        )}
      </div>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <p className="hint">{status.length}/{MAX_LEN}</p>
    </div>
  );
}
