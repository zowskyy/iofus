"use client";

import { useEffect, useState } from "react";
import { ALLOWED_STAMPS, type StampEntry } from "@/lib/stamps";

interface Props {
  pageOwnerId: string;
  viewerId: string | null;
}

/** Visitor stamp wall — shows stamps left by visitors and lets logged-in users add one. */
export function StampsModule({ pageOwnerId, viewerId }: Props) {
  const [stamps, setStamps] = useState<StampEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [stamping, setStamping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStampedToday, setHasStampedToday] = useState(false);

  useEffect(() => {
    fetch(`/api/stamp?pageOwnerId=${encodeURIComponent(pageOwnerId)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.stamps) {
          setStamps(data.stamps as StampEntry[]);
          // Check if viewer already stamped today
          if (viewerId && data.viewerStampedToday) {
            setHasStampedToday(true);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pageOwnerId, viewerId]);

  const handleStamp = async (emoji: string) => {
    if (!viewerId || stamping || hasStampedToday) return;
    setStamping(true);
    setError(null);
    try {
      const res = await fetch("/api/stamp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageOwnerId, emoji }),
      });
      const data = await res.json() as { stamps?: StampEntry[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not leave stamp.");
        return;
      }
      if (data.stamps) setStamps(data.stamps);
      setHasStampedToday(true);
    } catch {
      setError("Network error.");
    } finally {
      setStamping(false);
    }
  };

  return (
    <section className="page-part page-stamps" aria-label="Stamp wall">
      <h2 className="part-label">Stamps</h2>
      {loading ? (
        <p className="empty-note">Loading stamps…</p>
      ) : stamps.length === 0 ? (
        <p className="empty-note">No stamps yet — be the first!</p>
      ) : (
        <ul className="stamp-wall" aria-label="Visitor stamps">
          {stamps.map((s: StampEntry) => (
            <li key={s.id} className="stamp-bubble" title={s.stamperHandle ? `@${s.stamperHandle}` : "anonymous"}>
              <span className="stamp-emoji" aria-hidden="true">{s.stampEmoji}</span>
              <span className="stamp-handle mono">{s.stamperHandle ? `@${s.stamperHandle}` : "anon"}</span>
            </li>
          ))}
        </ul>
      )}
      {viewerId && !hasStampedToday && (
        <div className="stamp-picker" aria-label="Leave a stamp">
          <p className="studio-hint">Leave your stamp:</p>
          <div className="stamp-picker-row">
            {ALLOWED_STAMPS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="stamp-btn"
                aria-label={`Stamp ${emoji}`}
                disabled={stamping}
                onClick={() => handleStamp(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
          {error && <p className="studio-hint" style={{ color: "var(--page-accent, red)" }}>{error}</p>}
        </div>
      )}
      {viewerId && hasStampedToday && (
        <p className="studio-hint stamp-done">You stamped this page today ✓</p>
      )}
    </section>
  );
}
