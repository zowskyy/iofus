"use client";

import { useEffect, useState } from "react";

interface Props {
  pageOwnerId: string;
}

/** Retro LED-style visitor counter. POSTs to /api/visit on mount and displays the returned count. */
export function VisitorCounter({ pageOwnerId }: Props) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageOwnerId }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        setCount(data.count as number);
      })
      .catch(() => {/* ignore network errors */});
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
