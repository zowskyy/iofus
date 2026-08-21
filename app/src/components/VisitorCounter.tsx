"use client";

import { useEffect, useState } from "react";

interface Props {
  pageOwnerId: string;
}

/** Retro LED-style visitor counter. POSTs to /api/visit on mount and displays the returned count. */
export function VisitorCounter({ pageOwnerId }: Props) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let visitorToken: string | undefined;
    try {
      visitorToken = localStorage.getItem("iofus_visitor") ?? undefined;
    } catch {
      // localStorage may be unavailable in some contexts
    }

    fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageOwnerId }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        setCount(data.count as number);
        // Store token from server if we got a new one
        if (data.visitorToken) {
          try {
            localStorage.setItem("iofus_visitor", data.visitorToken as string);
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {/* ignore network errors */});

    void visitorToken; // suppress unused warning
  }, [pageOwnerId]);

  if (count === null) return null;

  const padded = String(count).padStart(6, "0");

  return (
    <div className="visitor-counter" aria-label={`${count} visitors`}>
      <span className="visitor-counter-label">visitors</span>
      <span className="visitor-counter-digits mono">{padded}</span>
    </div>
  );
}
