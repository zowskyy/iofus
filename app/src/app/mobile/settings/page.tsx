"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MobileLayout } from "@/components/MobileLayout";

export default function MobileSettings() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const response = await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });
      if (response.ok) {
        router.push("/login");
      }
    } catch (error) {
      console.error("Logout failed:", error);
      setLoggingOut(false);
    }
  };

  return (
    <MobileLayout title="Settings" backHref="/mobile">
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.5rem" }}>Your account</h2>

          <Link
            href="/settings"
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: "var(--border)",
              color: "var(--ink)",
              textDecoration: "none",
              borderRadius: "4px",
              fontWeight: 500,
            }}
          >
            Full settings
          </Link>

          <Link
            href="/studio"
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: "var(--border)",
              color: "var(--ink)",
              textDecoration: "none",
              borderRadius: "4px",
              fontWeight: 500,
            }}
          >
            Go to studio
          </Link>
        </div>

        <div style={{ paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.75rem" }}>Learn</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <li>
              <a href="https://iofus.net/help" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>
                FAQ
              </a>
            </li>
            <li>
              <a href="https://iofus.net/policy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>
                Privacy & policy
              </a>
            </li>
            <li>
              <a href="https://iofus.net/status" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>
                Status
              </a>
            </li>
          </ul>
        </div>

        <div style={{ paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              backgroundColor: loggingOut ? "var(--border)" : "var(--accent)",
              color: "white",
              border: "none",
              borderRadius: "4px",
              fontWeight: 500,
              cursor: loggingOut ? "default" : "pointer",
              opacity: loggingOut ? 0.7 : 1,
            }}
          >
            {loggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>

        <div style={{ paddingTop: "1rem", fontSize: "0.8rem", color: "var(--ink-soft)", textAlign: "center" }}>
          <p>iofus • {new Date().getFullYear()}</p>
        </div>
      </div>
    </MobileLayout>
  );
}
