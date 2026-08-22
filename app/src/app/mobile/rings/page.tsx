"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MobileLayout } from "@/components/MobileLayout";

interface Ring {
  id: string;
  name: string;
  description: string;
  memberCount: number;
}

export default function MobileRings() {
  const [rings, setRings] = useState<Ring[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRings() {
      try {
        setLoading(true);
        const response = await fetch("/api/rings", { credentials: "include" });
        if (!response.ok) throw new Error("Failed to fetch rings");
        const data = await response.json();
        setRings(Array.isArray(data) ? data : data.rings || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch rings");
      } finally {
        setLoading(false);
      }
    }

    fetchRings();
  }, []);

  return (
    <MobileLayout title="Web Rings" backHref="/mobile">
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {loading && <div style={{ color: "var(--ink-soft)", textAlign: "center", padding: "2rem 0" }}>Loading rings...</div>}

        {error && <div style={{ color: "var(--accent)", fontSize: "0.9rem", padding: "0.5rem" }}>Error: {error}</div>}

        {rings.length === 0 && !loading && (
          <div style={{ color: "var(--ink-soft)", textAlign: "center", padding: "2rem 0" }}>
            <p>No rings found</p>
          </div>
        )}

        {rings.map((ring) => (
          <Link
            key={ring.id}
            href={`/rings/${ring.id}`}
            style={{
              padding: "1rem",
              backgroundColor: "var(--border)",
              borderRadius: "4px",
              textDecoration: "none",
              color: "var(--ink)",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              transition: "background-color 0.2s",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>✦ {ring.name}</h3>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--ink-soft)" }}>{ring.description}</p>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--ink-soft)" }}>Members: {ring.memberCount}</p>
          </Link>
        ))}

        <Link
          href="/rings/new"
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: "var(--accent)",
            color: "white",
            textDecoration: "none",
            borderRadius: "4px",
            textAlign: "center",
            fontWeight: 500,
            marginTop: "0.5rem",
          }}
        >
          Create a ring
        </Link>
      </div>
    </MobileLayout>
  );
}
