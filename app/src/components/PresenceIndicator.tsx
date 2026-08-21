"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  pageOwnerId: string;
}

const HEARTBEAT_INTERVAL = 15_000; // 15 seconds

/** Ambient presence indicator. Sends a heartbeat every 15 s and shows count only when > 1. */
export function PresenceIndicator({ pageOwnerId }: Props) {
  const [count, setCount] = useState<number>(0);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    // Generate or restore a session-scoped token
    let token: string;
    try {
      const stored = sessionStorage.getItem("iofus_presence_token");
      if (stored) {
        token = stored;
      } else {
        token = crypto.randomUUID();
        sessionStorage.setItem("iofus_presence_token", token);
      }
    } catch {
      token = crypto.randomUUID();
    }
    tokenRef.current = token;

    const beat = () => {
      fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageOwnerId, token }),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data && typeof data.count === "number") setCount(data.count);
        })
        .catch(() => {/* ignore */});
    };

    beat();
    const id = setInterval(beat, HEARTBEAT_INTERVAL);
    return () => clearInterval(id);
  }, [pageOwnerId]);

  if (count <= 1) return null;

  return (
    <p className="explore-ambient presence-indicator" aria-live="polite">
      {count} here now
    </p>
  );
}
