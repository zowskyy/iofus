import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getUserOwnedRings, listUserWebRings, listWebRings } from "@/lib/webRings";

export default async function RingsPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/rings");

  const all = listWebRings();
  const mine = listUserWebRings(viewer.id);
  const owned = getUserOwnedRings(viewer.id);
  const memberIds = new Set(mine.map((r) => r.id));

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Web Rings
      </p>
      <h1>Rings</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        Web rings connect pages around a shared theme. Join an existing ring or start your own.
      </p>
      <p>
        <Link href="/rings/new" className="btn">Create a ring</Link>
      </p>

      {mine.length > 0 && (
        <section className="settings-section">
          <h2>Your rings</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {mine.map((ring) => (
              <li key={ring.id} style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <Link href={`/explore/ring/${ring.slug}`}>{ring.name}</Link>
                {owned.some((o) => o.id === ring.id) && (
                  <Link href={`/rings/${ring.slug}/manage`} className="btn secondary" style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem" }}>
                    Manage
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="settings-section">
        <h2>All rings</h2>
        {all.length === 0 ? (
          <p className="settings-empty">No rings yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {all.map((ring) => (
              <li key={ring.id}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap" }}>
                  <Link href={`/explore/ring/${ring.slug}`} style={{ fontWeight: 500 }}>{ring.name}</Link>
                  <span className="mono" style={{ fontSize: "0.75rem", color: "var(--ink-soft)" }}>
                    {ring.isOpen ? "open" : "invite-only"}
                  </span>
                  {memberIds.has(ring.id) ? (
                    <Link href={`/rings/${ring.slug}/join`} className="btn secondary" style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem" }}>
                      Leave
                    </Link>
                  ) : (
                    <Link href={`/rings/${ring.slug}/join`} className="btn" style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem" }}>
                      {ring.isOpen ? "Join" : "Request to join"}
                    </Link>
                  )}
                </div>
                {ring.description && <p style={{ margin: "0.25rem 0 0", color: "var(--ink-soft)", fontSize: "0.875rem" }}>{ring.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
