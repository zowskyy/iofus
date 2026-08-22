"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MobileLayout } from "@/components/MobileLayout";
import { getCurrentUser } from "@/lib/session";

interface User {
  id: string;
  handle: string;
  email: string;
  createdAt: string;
}

export default function MobileHome() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      try {
        const response = await fetch("/api/user", { credentials: "include" });
        if (response.ok) {
          const data = await response.json();
          setUser(data);
        }
      } catch (error) {
        console.error("Failed to fetch user:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchUser();
  }, []);

  if (loading) {
    return (
      <MobileLayout showNav={false}>
        <div style={{ padding: "2rem", textAlign: "center" }}>Loading...</div>
      </MobileLayout>
    );
  }

  if (!user) {
    return (
      <MobileLayout showNav={false}>
        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <p style={{ fontSize: "0.9rem", color: "var(--ink-soft)", marginBottom: "1rem" }}>
              iofus is your corner of the web. No algorithm. No feed.
            </p>
            <h1 style={{ fontSize: "1.5rem", marginBottom: "2rem" }}>Welcome</h1>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Link
              href="/signup"
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
              Sign up
            </Link>
            <Link
              href="/login"
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
              Log in
            </Link>
          </div>

          <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem", fontSize: "0.9rem", lineHeight: 1.6 }}>
            <div>
              <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Claim your wall</h2>
              <p style={{ color: "var(--ink-soft)", margin: 0 }}>Your /@handle is yours. Live in minutes.</p>
            </div>

            <div>
              <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Go deep</h2>
              <p style={{ color: "var(--ink-soft)", margin: 0 }}>Colors, layouts, shrines, pixel art, custom CSS. Make it weird.</p>
            </div>

            <div>
              <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>Find people</h2>
              <p style={{ color: "var(--ink-soft)", margin: 0 }}>By tag, mood, web ring, or random. No algorithm.</p>
            </div>

            <div>
              <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>You own it</h2>
              <p style={{ color: "var(--ink-soft)", margin: 0 }}>No tracking. No analytics. No one selling your data.</p>
            </div>
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout title={`@${user.handle}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Link
            href={`/@${user.handle}`}
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
            Your page
          </Link>
          <Link
            href="/mobile/studio"
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
            Studio
          </Link>
          <Link
            href="/mobile/wander"
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
            Wander
          </Link>
        </div>

        <div style={{ paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
          <h2 style={{ fontSize: "0.95rem", marginBottom: "0.75rem" }}>More</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <li>
              <Link href="/asks" style={{ color: "var(--accent)", textDecoration: "none" }}>
                Ask the crew
              </Link>
            </li>
            <li>
              <Link href="/messages" style={{ color: "var(--accent)", textDecoration: "none" }}>
                Messages
              </Link>
            </li>
            <li>
              <Link href="/mobile/settings" style={{ color: "var(--accent)", textDecoration: "none" }}>
                Settings
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </MobileLayout>
  );
}
