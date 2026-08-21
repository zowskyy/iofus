import { randomUUID } from "node:crypto";
import { getDb } from "./db";

/** Record a visit from *visitorToken* to *pageOwnerId*'s page.
 * Deduplicates within a 24-hour window — if the same token visited in the
 * last 24 hours the insert is skipped and the function returns silently. */
export function recordVisit(pageOwnerId: string, visitorToken: string): void {
  const db = getDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = db
    .prepare(
      "SELECT id FROM page_visits WHERE page_owner_id = ? AND visitor_session = ? AND visited_at >= ?",
    )
    .get(pageOwnerId, visitorToken, since);
  if (recent) return;
  db.prepare(
    "INSERT INTO page_visits (id, page_owner_id, visitor_session, visited_at) VALUES (?, ?, ?, ?)",
  ).run(randomUUID(), pageOwnerId, visitorToken, new Date().toISOString());
}

/** Total number of unique visitor sessions recorded for *pageOwnerId*'s page. */
export function countVisits(pageOwnerId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(DISTINCT visitor_session) as n FROM page_visits WHERE page_owner_id = ?")
    .get(pageOwnerId) as { n: number };
  return row.n;
}
