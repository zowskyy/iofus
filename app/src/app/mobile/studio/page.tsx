"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { MobileLayout } from "@/components/MobileLayout";

interface PageDocument {
  id: string;
  isPublished: boolean;
  visibility: string;
  draftDocument?: { title?: string };
  document?: { title?: string };
}

export default function MobileStudio() {
  const [doc, setDoc] = useState<PageDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDocument() {
      try {
        setLoading(true);
        const response = await fetch("/api/document", { credentials: "include" });
        if (!response.ok) throw new Error("Failed to fetch document");
        const data = await response.json();
        setDoc(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch");
      } finally {
        setLoading(false);
      }
    }

    fetchDocument();
  }, []);

  const title = doc?.document?.title || doc?.draftDocument?.title || "Untitled";
  const isDraft = !doc?.isPublished;

  return (
    <MobileLayout title="Studio" backHref="/mobile">
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {loading && <div style={{ color: "var(--ink-soft)", textAlign: "center", padding: "2rem 0" }}>Loading...</div>}

        {error && <div style={{ color: "var(--accent)", fontSize: "0.9rem", padding: "0.5rem" }}>Error: {error}</div>}

        {!loading && doc && (
          <>
            <div style={{ backgroundColor: "var(--border)", padding: "1rem", borderRadius: "4px" }}>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.8rem", color: "var(--ink-soft)", textTransform: "uppercase" }}>Current page</p>
              <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>{title}</h2>
              {isDraft && (
                <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "var(--accent)" }}>Draft • Not published</p>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <Link
                href="/studio"
                style={{
                  padding: "0.75rem 1rem",
                  backgroundColor: "var(--accent)",
                  color: "white",
                  textDecoration: "none",
                  borderRadius: "4px",
                  textAlign: "center",
                  fontWeight: 500,
                }}
              >
                Open editor
              </Link>

              <Link
                href="/studio/page-settings"
                style={{
                  padding: "0.75rem 1rem",
                  backgroundColor: "var(--border)",
                  color: "var(--ink)",
                  textDecoration: "none",
                  borderRadius: "4px",
                  textAlign: "center",
                  fontWeight: 500,
                }}
              >
                Page settings
              </Link>

              <Link
                href="/studio/styling"
                style={{
                  padding: "0.75rem 1rem",
                  backgroundColor: "var(--border)",
                  color: "var(--ink)",
                  textDecoration: "none",
                  borderRadius: "4px",
                  textAlign: "center",
                  fontWeight: 500,
                }}
              >
                Styling
              </Link>

              <Link
                href="/studio/advanced"
                style={{
                  padding: "0.75rem 1rem",
                  backgroundColor: "var(--border)",
                  color: "var(--ink)",
                  textDecoration: "none",
                  borderRadius: "4px",
                  textAlign: "center",
                  fontWeight: 500,
                }}
              >
                Advanced
              </Link>
            </div>

            <div style={{ paddingTop: "1rem", borderTop: "1px solid var(--border)", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
              <p>
                💡 For the full editing experience, open on a larger screen. Mobile view is simplified to show options.
              </p>
            </div>
          </>
        )}
      </div>
    </MobileLayout>
  );
}
