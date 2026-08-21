import { randomUUID } from "node:crypto";
import { getDb } from "./db";

export const ALLOWED_STAMPS: string[] = [
  "⭐", "🔥", "💜", "🌙", "🌸", "🎸", "🦋", "🌊", "✨", "🎨", "🍄", "👾",
];

export interface StampEntry {
  id: string;
  stamperHandle: string | null;
  stampEmoji: string;
  createdAt: string;
}

export class StampError extends Error {}

/** Add a stamp from *stamperId* (or anonymous) to *pageOwnerId*'s page.
 * Rate limit: one stamp per visitor_session per page per day (for logged-in
 * users, uniqueness is by stamper_id; for anonymous it's not enforced here —
 * callers should require authentication). */
export function addStamp(
  pageOwnerId: string,
  stamperId: string | null,
  stamperHandle: string | null,
  emoji: string,
): void {
  if (!ALLOWED_STAMPS.includes(emoji)) {
    throw new StampError("That stamp is not allowed.");
  }
  if (!stamperId) {
    throw new StampError("You must be signed in to leave a stamp.");
  }

  const db = getDb();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = db
    .prepare(
      "SELECT id FROM page_stamps WHERE page_owner_id = ? AND stamper_id = ? AND created_at >= ?",
    )
    .get(pageOwnerId, stamperId, since);
  if (recent) throw new StampError("You already stamped this page today.");

  db.prepare(
    `INSERT INTO page_stamps (id, page_owner_id, stamper_id, stamper_handle, stamp_emoji, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), pageOwnerId, stamperId, stamperHandle, emoji, new Date().toISOString());
}

/** Recent stamps on *pageOwnerId*'s page, newest first, up to *limit*. */
export function listStamps(pageOwnerId: string, limit = 24): StampEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT id, stamper_handle, stamp_emoji, created_at
       FROM page_stamps WHERE page_owner_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(pageOwnerId, limit) as {
      id: string;
      stamper_handle: string | null;
      stamp_emoji: string;
      created_at: string;
    }[];
  return rows.map((r) => ({
    id: r.id,
    stamperHandle: r.stamper_handle,
    stampEmoji: r.stamp_emoji,
    createdAt: r.created_at,
  }));
}

/** Delete all stamps on *pageOwnerId*'s page (owner wipe). */
export function clearStamps(pageOwnerId: string): void {
  getDb().prepare("DELETE FROM page_stamps WHERE page_owner_id = ?").run(pageOwnerId);
}

/** Total stamp count for *pageOwnerId*'s page. */
export function countStamps(pageOwnerId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as n FROM page_stamps WHERE page_owner_id = ?")
    .get(pageOwnerId) as { n: number };
  return row.n;
}
