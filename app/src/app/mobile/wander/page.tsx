"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MobileLayout } from "@/components/MobileLayout";

interface WanderResult {
  handles: string[];
}

export default function MobileWander() {
  const [handles, setHandles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWander = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/wander", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch wander results");
      const data: WanderResult = await response.json();
      setHandles(data.handles || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWander();
  }, []);

  return (
    <MobileLayout title="Wander" backHref="/mobile">
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <button
          onClick={fetchWander}
          disabled={loading}
          style={{
            padding: "0.75rem 1rem",
            backgroundColor: loading ? "var(--border)" : "var(--accent)",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontWeight: 500,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Wandering..." : "Find someone"}
        </button>

        {error && <div style={{ color: "var(--accent)", fontSize: "0.9rem", padding: "0.5rem" }}>{error}</div>}

        {handles.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {handles.map((handle) => (
              <Link
                key={handle}
                href={`/@${handle}`}
                style={{
                  padding: "1rem",
                  backgroundColor: "var(--border)",
                  color: "var(--ink)",
                  textDecoration: "none",
                  borderRadius: "4px",
                  fontWeight: 500,
                  display: "block",
                  transition: "background-color 0.2s",
                }}
              >
                @{handle}
              </Link>
            ))}
          </div>
        )}

        {handles.length === 0 && !loading && !error && (
          <div style={{ color: "var(--ink-soft)", textAlign: "center", padding: "2rem 0" }}>
            <p>Tap "Find someone" to discover pages</p>
          </div>
        )}
      </div>
    </MobileLayout>
  );
}
