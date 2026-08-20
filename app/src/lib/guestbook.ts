import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hasBlockRelationship } from "./friends";

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

/** Count of pending guestbook entries, for nav badge use. */
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

/** Add a guestbook entry. Sets status to "pending" when *requireApproval* is true, otherwise "approved". Throws on blank/overlength message or blocked relationship. */
export function signGuestbook(
  pageOwnerId: string,
  authorId: string | null,
  authorHandle: string | null,
  message: string,
  requireApproval: boolean,
): void {
  const trimmed = message.trim();
  if (!trimmed) throw new GuestbookError("Write something before signing.");
  if (trimmed.length > 500) throw new GuestbookError("Guestbook messages can be at most 500 characters.");

  if (authorId && hasBlockRelationship(authorId, pageOwnerId)) {
    throw new GuestbookError("You can't sign this guestbook.");
  }

  const db = getDb();
  db.prepare(
    `INSERT INTO guestbook_entries (id, page_owner_id, author_id, author_handle, message, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    pageOwnerId,
    authorId,
    authorHandle,
    trimmed,
    requireApproval ? "pending" : "approved",
    new Date().toISOString(),
  );
}

/** Approve or reject a pending guestbook entry. Only *pageOwnerId* may call this. Throws when the entry doesn't exist. */
export function moderateGuestbookEntry(pageOwnerId: string, entryId: string, approve: boolean): void {
  const db = getDb();
  const row = db
    .prepare("SELECT id FROM guestbook_entries WHERE id = ? AND page_owner_id = ?")
    .get(entryId, pageOwnerId);
  if (!row) throw new GuestbookError("No such guestbook entry.");
  db.prepare("UPDATE guestbook_entries SET status = ?, reviewed_at = ? WHERE id = ?").run(
    approve ? "approved" : "rejected",
    new Date().toISOString(),
    entryId,
  );
}

/** Permanently delete a guestbook entry. Only *pageOwnerId* may delete entries on their page. */
export function deleteGuestbookEntry(pageOwnerId: string, entryId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM guestbook_entries WHERE id = ? AND page_owner_id = ?").run(entryId, pageOwnerId);
}
