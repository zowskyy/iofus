"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Root error boundary. Before this file existed, any uncaught error below
 * the root layout — including a plain network failure (a real one was
 * reproduced: an aborted fetch during signup) — fell through to Next.js's
 * generic, unstyled "This page couldn't load" screen with no retry path
 * and no preserved context. This at least keeps the failure inside
 * iofus's own visual language and gives a real way back, matching the
 * product's "a page can be chaotic, it can never trap a visitor" standard
 * applied to the platform chrome itself, not just profile pages.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Errors here are unexpected by definition — keep a trace in the
    // browser console for whoever's debugging, same as any other uncaught
    // exception would already produce.
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
