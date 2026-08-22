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
    let cancelled = false;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const r = await fetch(`/api/status?userId=${encodeURIComponent(pageOwnerId)}`, {
          signal: controller.signal,
        });

        if (cancelled) return;

        if (r.ok) {
          setBackoff(POLL_INTERVAL_MS);
          const data = (await r.json()) as { status: string | null };
          if (!cancelled) setStatus(data.status);
        } else {
          setBackoff((b) => Math.min(b * 2, 120_000));
        }
      } catch (error) {
        if (cancelled) return;
        // Ignore abort errors (component unmounted or dependency changed)
        if (error instanceof Error && error.name !== "AbortError") {
          setBackoff((b) => Math.min(b * 2, 120_000));
        }
      } finally {
        if (!cancelled) {
          timeoutId = setTimeout(poll, backoff);
        }
      }
    };

    timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [pageOwnerId, backoff]);

  if (!status) return null;

  return (
    <p className="ambient-status mono" aria-label="Currently">
      <span className="ambient-status-dot" aria-hidden="true">◦</span>
      {status}
    </p>
  );
}
