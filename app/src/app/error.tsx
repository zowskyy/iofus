"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        iofus
      </p>
      <h1>Something went wrong</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        That was likely a dropped connection, not something you did. Nothing you had typed elsewhere on iofus was
        lost — this only affects the page you were just on.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
        <button type="button" className="btn" onClick={() => reset()}>
          Try again
        </button>
        <Link href="/" className="btn secondary">
          Back to iofus
        </Link>
      </div>
    </main>
  );
}
