import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { createMonotonicClock } from "./monotonicTime";

const monotonicNow = createMonotonicClock();

export type NotificationKind =
  | "guestbook_signed"
  | "friend_request"
  | "friend_accepted"
  | "ask_answered"
  | "ring_join_request"
  | "ring_join_accepted";

export interface Notification {
  id: string;
  userId: string;
  kind: NotificationKind;
  actorHandle: string | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

function rowToNotification(r: {
  id: string;
  user_id: string;
  kind: string;
  actor_handle: string | null;
  payload_json: string;
  read_at: string | null;
  created_at: string;
}): Notification {
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(r.payload_json); } catch { /* */ }
  return {
    id: r.id,
    userId: r.user_id,
    kind: r.kind as NotificationKind,
    actorHandle: r.actor_handle,
    payload,
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

export function createNotification(
  userId: string,
  kind: NotificationKind,
  actorHandle: string | null,
  payload: Record<string, unknown> = {},
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO notifications (id, user_id, kind, actor_handle, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), userId, kind, actorHandle, JSON.stringify(payload), monotonicNow());
}

export function listNotifications(userId: string, limit = 50): Notification[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, user_id, kind, actor_handle, payload_json, read_at, created_at
       FROM notifications WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ?`,
    )
    .all(userId, limit) as Parameters<typeof rowToNotification>[0][];
  return rows.map(rowToNotification);
}

export function countUnread(userId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as n FROM notifications WHERE user_id = ? AND read_at IS NULL")
    .get(userId) as { n: number };
  return row.n;
}

export function markAllRead(userId: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL").run(now, userId);
}

export function markRead(notificationId: string, userId: string): void {
  const db = getDb();
  db.prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?").run(
    new Date().toISOString(),
    notificationId,
    userId,
  );
}
