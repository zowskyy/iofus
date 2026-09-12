"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "2rem", background: "#111", color: "#eee" }}>
        <main style={{ maxWidth: "32rem", margin: "4rem auto" }}>
          <p style={{ color: "#888", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>iofus</p>
          <h1 style={{ fontSize: "1.5rem", margin: "0.5rem 0" }}>Something went wrong</h1>
          <p style={{ color: "#aaa" }}>
            An unexpected error occurred. Nothing you had typed elsewhere on iofus was lost.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{ padding: "0.5rem 1rem", cursor: "pointer", border: "1px solid #555", background: "#222", color: "#eee", borderRadius: "4px" }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{ padding: "0.5rem 1rem", border: "1px solid #555", background: "transparent", color: "#eee", borderRadius: "4px", textDecoration: "none" }}
            >
              Back to iofus
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
