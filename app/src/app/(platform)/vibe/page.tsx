import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { getProximityOrdered } from "@/lib/proximityGraph";
import { getAmbientStatuses } from "@/lib/ambientStatus";
import { VibeGraph } from "./VibeGraph";

/** Authenticated page showing the current user's proximity-based Vibe Graph. Displays center node + neighbors in radial layout with ambient statuses. */
export default async function VibeGraphPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/vibe");

  const db = getDb();

  // Get the viewer's own page info
  const ownerRow = db
    .prepare(
      `SELECT pd.document_json FROM page_documents pd WHERE pd.user_id = ?`,
    )
    .get(user.id) as { document_json: string } | undefined;

  let ownerDisplayName = user.handle;
  try {
    if (ownerRow) {
      const doc = JSON.parse(ownerRow.document_json) as { identity?: { displayName?: string } };
      ownerDisplayName = doc.identity?.displayName || user.handle;
    }
  } catch (error) {
    console.warn(`Failed to parse document_json for user ${user.handle}:`, error);
  }

  // Get proximity-ordered neighbor IDs (up to 20)
  const neighborIds = getProximityOrdered(user.id, 20);

  interface NodeRow { user_id: string; handle: string; document_json: string }
  const neighbors: { id: string; handle: string; displayName: string }[] = [];

  if (neighborIds.length > 0) {
    const placeholders = neighborIds.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `SELECT pd.user_id, u.handle, pd.document_json
         FROM page_documents pd
         JOIN users u ON u.id = pd.user_id
         WHERE pd.user_id IN (${placeholders})
           AND pd.is_published = 1 AND pd.visibility = 'public' AND pd.hidden_from_discovery = 0
           AND u.is_blocked_platform = 0`,
      )
      .all(...neighborIds) as NodeRow[];

    // Preserve proximity order
    const rowMap = new Map(rows.map((r) => [r.user_id, r]));
    for (const id of neighborIds) {
      const r = rowMap.get(id);
      if (!r) continue;
      let displayName = r.handle;
      try {
        const doc = JSON.parse(r.document_json) as { identity?: { displayName?: string } };
        displayName = doc.identity?.displayName || r.handle;
      } catch (error) {
        console.warn(`Failed to parse document_json for user ${r.handle}:`, error);
      }
      neighbors.push({ id, handle: r.handle, displayName });
    }
  }

  // Ambient statuses for all visible nodes
  const allIds = [user.id, ...neighbors.map((n) => n.id)];
  const statuses = getAmbientStatuses(allIds);

  const coldStart = neighbors.length === 0;

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Vibe Graph
      </p>
      <h1>Your web</h1>
      {coldStart ? (
        <div className="vibe-cold-start">
          <p style={{ color: "var(--ink-soft)", maxWidth: 480 }}>
            Your page is the seed of a new web. Sign someone&apos;s guestbook or join a ring to start connecting.
          </p>
          <a href="/explore" className="btn" style={{ marginTop: "1rem" }}>Browse Explore →</a>
        </div>
      ) : (
        <p className="mono" style={{ color: "var(--ink-soft)", fontSize: "0.8rem", marginBottom: "1.5rem" }}>
          You at the center. People you&apos;ve connected with nearby.
        </p>
      )}
      <VibeGraph
        center={{ id: user.id, handle: user.handle, displayName: ownerDisplayName }}
        neighbors={neighbors}
        statuses={Object.fromEntries(statuses)}
      />
    </main>
  );
}
