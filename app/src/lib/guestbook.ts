import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hasBlockRelationship } from "./friends";
import { recordEdge } from "./proximityGraph";

export class GuestbookError extends Error {}

export interface GuestbookEntry {
  id: string;
  authorHandle: string | null;
  message: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
}

/** Approved guestbook entries for *pageOwnerId*, newest first, up to *limit*. */
export function listApprovedGuestbookEntries(pageOwnerId: string, limit = 50): GuestbookEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, author_handle, message, created_at, status
       FROM guestbook_entries
       WHERE page_owner_id = ? AND status = 'approved'
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(pageOwnerId, limit) as { id: string; author_handle: string | null; message: string; created_at: string; status: string }[];
  return rows.map((r) => ({
    id: r.id,
    authorHandle: r.author_handle,
    message: r.message,
    createdAt: r.created_at,
    status: r.status as GuestbookEntry["status"],
  }));
}

/** Count of pending (unapproved) guestbook entries for *pageOwnerId* — for nav badge use. */
export function countPendingGuestbookEntries(pageOwnerId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as n FROM guestbook_entries WHERE page_owner_id = ? AND status = 'pending'")
    .get(pageOwnerId) as { n: number };
  return row.n;
}

/** All pending (unapproved) guestbook entries for *pageOwnerId*, oldest first, for the moderation queue. */
export function listPendingGuestbookEntries(pageOwnerId: string): GuestbookEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, author_handle, message, created_at, status
       FROM guestbook_entries
       WHERE page_owner_id = ? AND status = 'pending'
       ORDER BY created_at ASC`,
    )
    .all(pageOwnerId) as { id: string; author_handle: string | null; message: string; created_at: string; status: string }[];
  return rows.map((r) => ({
    id: r.id,
    authorHandle: r.author_handle,
    message: r.message,
    createdAt: r.created_at,
    status: r.status as GuestbookEntry["status"],
  }));
}

/** Add a guestbook entry. Sets status to "pending" when *requireApproval* is true, otherwise "approved". Throws on blank/overlength message or blocked relationship.
 *
 * *blockCheckId* is the signed-in user's ID to use for the block relationship
 * check — pass it separately from *authorId* so that a blocked user cannot
 * bypass the check by signing anonymously (authorId=null, blockCheckId=userId).
 * This parameter is required (not defaulted) to force callers to explicitly consider block checking. */
export function signGuestbook(
  pageOwnerId: string,
  authorId: string | null,
  authorHandle: string | null,
  message: string,
  requireApproval: boolean,
  blockCheckId: string | null,
): void {
  const trimmed = message.trim();
  if (!trimmed) throw new GuestbookError("Write something before signing.");
  if (trimmed.length > 500) throw new GuestbookError("Guestbook messages can be at most 500 characters.");

  if (blockCheckId && hasBlockRelationship(blockCheckId, pageOwnerId)) {
    throw new GuestbookError("You can't sign this guestbook.");
  }

  const db = getDb();
  const entryId = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO guestbook_entries (id, page_owner_id, author_id, author_handle, message, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entryId,
    pageOwnerId,
    authorId,
    authorHandle,
    trimmed,
    requireApproval ? "pending" : "approved",
    now,
  );

  // Record proximity graph edge: author → page owner (guestbook interaction).
  // Wrap in try-catch to prevent partial state: entry exists but edge doesn't.
  if (authorId) {
    try {
      recordEdge(authorId, pageOwnerId, "guestbook");
    } catch (error) {
      // Log error but don't crash: entry is already inserted. Graph inconsistency is
      // preferable to losing guestbook entries. Monitoring should alert on this.
      console.error(`Failed to record guestbook graph edge for entry ${entryId}:`, error);
    }
  }
}

/** Approve or reject a pending guestbook entry. Only *pageOwnerId* may call this. Throws when the entry doesn't exist or has already been moderated. */
export function moderateGuestbookEntry(pageOwnerId: string, entryId: string, approve: boolean): void {
  const db = getDb();
  const row = db
    .prepare("SELECT id FROM guestbook_entries WHERE id = ? AND page_owner_id = ?")
    .get(entryId, pageOwnerId);
  if (!row) throw new GuestbookError("No such guestbook entry.");
  const result = db
    .prepare("UPDATE guestbook_entries SET status = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'")
    .run(approve ? "approved" : "rejected", new Date().toISOString(), entryId);
  if (result.changes === 0) throw new GuestbookError("Entry has already been moderated.");
}

/** Permanently delete a guestbook entry. Only *pageOwnerId* may delete entries on their page. */
export function deleteGuestbookEntry(pageOwnerId: string, entryId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM guestbook_entries WHERE id = ? AND page_owner_id = ?").run(entryId, pageOwnerId);
}
