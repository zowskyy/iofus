import { getDb } from "./db";

export const AMBIENT_STATUS_MAX_LEN = 100;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class AmbientStatusError extends Error {}

export interface AmbientStatus {
  userId: string;
  text: string;
  expiresAt: string;
}

/** Set (or clear) the ambient status for *userId*. Empty string clears it. Plain text only — callers must render via React or textContent, never dangerouslySetInnerHTML. */
export function setAmbientStatus(userId: string, text: string): void {
  const trimmed = text.trim();
  if (trimmed.length > AMBIENT_STATUS_MAX_LEN) {
    throw new AmbientStatusError(`Status must be ${AMBIENT_STATUS_MAX_LEN} characters or fewer.`);
  }
  const db = getDb();
  if (!trimmed) {
    db.prepare("DELETE FROM ambient_statuses WHERE user_id = ?").run(userId);
    return;
  }
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  db.prepare(
    `INSERT INTO ambient_statuses (user_id, text, expires_at)
     VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET text = excluded.text, expires_at = excluded.expires_at`,
  ).run(userId, trimmed, expiresAt);
}

/** Get the current non-expired ambient status for *userId*, or null if none. Prunes expired row as a side effect. */
export function getAmbientStatus(userId: string): AmbientStatus | null {
  const db = getDb();
  const now = new Date().toISOString();
  // Prune expired entry for this user while reading
  db.prepare("DELETE FROM ambient_statuses WHERE user_id = ? AND expires_at < ?").run(userId, now);
  const row = db
    .prepare("SELECT user_id, text, expires_at FROM ambient_statuses WHERE user_id = ?")
    .get(userId) as { user_id: string; text: string; expires_at: string } | undefined;
  if (!row) return null;
  return { userId: row.user_id, text: row.text, expiresAt: row.expires_at };
}

/** Bulk-fetch non-expired ambient statuses for a list of user IDs. Used by Vibe Graph. */
export function getAmbientStatuses(userIds: string[]): Map<string, string> {
  if (!userIds.length) return new Map();
  const db = getDb();
  const now = new Date().toISOString();
  const placeholders = userIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT user_id, text FROM ambient_statuses
       WHERE user_id IN (${placeholders}) AND expires_at >= ?`,
    )
    .all(...userIds, now) as { user_id: string; text: string }[];
  return new Map(rows.map((r) => [r.user_id, r.text]));
}
