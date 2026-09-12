import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container">
      <p
        className="mono"
        style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}
      >
        iofus
      </p>
      <h1>Page not found</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        There&rsquo;s nothing here — the page may have been removed, or the URL might be wrong.
      </p>
      <div style={{ marginTop: "1rem" }}>
        <Link href="/" className="btn">
          Back to iofus
        </Link>
      </div>
    </main>
  );
}
