"use client";

import { useEffect, useState } from "react";

interface Props {
  pageOwnerId: string;
  /** Initial status fetched server-side (avoids flash on first render). */
  initialStatus: string | null;
}

const POLL_INTERVAL_MS = 30_000;

/** Shows the page owner's ambient status ("currently listening to / making / feeling"). Polls every 30s with exponential back-off on failure. */
export function AmbientStatusDisplay({ pageOwnerId, initialStatus }: Props) {
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [backoff, setBackoff] = useState(POLL_INTERVAL_MS);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = () => {
      fetch(`/api/status?userId=${encodeURIComponent(pageOwnerId)}`)
        .then((r) => {
          if (r.ok) {
            setBackoff(POLL_INTERVAL_MS); // reset on success
            return r.json() as Promise<{ status: string | null }>;
          }
          // Back-off on 503/429 (cold start or rate limit)
          setBackoff((b) => Math.min(b * 2, 120_000));
          return null;
        })
        .then((data) => {
          if (data) setStatus(data.status);
        })
        .catch(() => {
          setBackoff((b) => Math.min(b * 2, 120_000));
        })
        .finally(() => {
          timeoutId = setTimeout(poll, backoff);
        });
    };

    timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
    return () => clearTimeout(timeoutId);
  }, [pageOwnerId, backoff]);

  if (!status) return null;

  return (
    <p className="ambient-status mono" aria-label="Currently">
      <span className="ambient-status-dot" aria-hidden="true">◦</span>
      {status}
    </p>
  );
}
