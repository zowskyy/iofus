import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hasBlockRelationship } from "./friends";
import { checkRateLimit, DAY_MS } from "./rateLimit";

// Direct messages (Phase 7). A deliberate reversal of the original "no
// DMs, ever" stance — kept as safe as the rest of the platform rather
// than exempted from it:
//   - a block relationship in either direction always wins, checked at
//     every send, never assumed safe just because a thread exists
//   - starting a conversation with someone new is rate-limited per day,
//     same mechanism Ask Us uses (checkRateLimit + DAY_MS) — sending
//     more messages *within* an existing thread is not separately
//     capped, since that's a real back-and-forth, not stranger contact
//   - no read receipts are exposed to the other person: read_at is
//     recorded only so the *viewer's own* unread count (surfaced in
//     SiteNav) can be accurate, never shown to the sender

export class MessageError extends Error {}

const MAX_BODY_LENGTH = 4000;
const MAX_NEW_CONVERSATIONS_PER_DAY = 10;

export interface Conversation {
  id: string;
  otherUserId: string;
  otherHandle: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function findConversationRow(db: ReturnType<typeof getDb>, userAId: string, userBId: string) {
  return db
    .prepare("SELECT id, last_message_at FROM conversations WHERE user_a_id = ? AND user_b_id = ?")
    .get(userAId, userBId) as { id: string; last_message_at: string } | undefined;
}

/**
 * Send a message from *senderId* to *recipientId*, creating the
 * conversation on first contact. Throws MessageError on self-messaging,
 * a blocked relationship (either direction), or an empty/oversized body.
 * Throws RateLimitError (from rateLimit.ts) if this is a new
 * conversation and the sender has started too many today.
 */
export function sendMessage(senderId: string, recipientId: string, body: string): Message {
  if (senderId === recipientId) {
    throw new MessageError("You can't message yourself.");
  }
  const trimmed = body.trim();
  if (!trimmed) throw new MessageError("Your message can't be empty.");
  if (trimmed.length > MAX_BODY_LENGTH) {
    throw new MessageError(`Your message is too long (max ${MAX_BODY_LENGTH} characters).`);
  }
  if (hasBlockRelationship(senderId, recipientId)) {
    throw new MessageError("You can't message this person.");
  }

  const db = getDb();
  const [userAId, userBId] = orderedPair(senderId, recipientId);
  const existing = findConversationRow(db, userAId, userBId);

  if (!existing) {
    checkRateLimit(`dm:new-conversation:${senderId}`, MAX_NEW_CONVERSATIONS_PER_DAY, DAY_MS);
  }

  const now = new Date().toISOString();
  const messageId = randomUUID();

  db.exec("BEGIN IMMEDIATE");
  try {
    let conversationId: string;
    if (existing) {
      conversationId = existing.id;
      db.prepare("UPDATE conversations SET last_message_at = ? WHERE id = ?").run(now, conversationId);
    } else {
      conversationId = randomUUID();
      db.prepare(
        "INSERT INTO conversations (id, user_a_id, user_b_id, created_at, last_message_at) VALUES (?, ?, ?, ?, ?)",
      ).run(conversationId, userAId, userBId, now, now);
    }
    db.prepare(
      "INSERT INTO messages (id, conversation_id, sender_id, body, created_at, read_at) VALUES (?, ?, ?, ?, ?, NULL)",
    ).run(messageId, conversationId, senderId, trimmed, now);
    db.exec("COMMIT");

    return { id: messageId, conversationId, senderId, body: trimmed, createdAt: now, readAt: null };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Conversations *userId* is part of, newest activity first, with an unread count each. */
export function listConversations(userId: string): Conversation[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.id, c.user_a_id, c.user_b_id, c.last_message_at,
              u.handle as other_handle,
              (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_body,
              (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND read_at IS NULL) as unread_count
       FROM conversations c
       JOIN users u ON u.id = (CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END)
       WHERE c.user_a_id = ? OR c.user_b_id = ?
       ORDER BY c.last_message_at DESC`,
    )
    .all(userId, userId, userId, userId) as {
    id: string;
    user_a_id: string;
    user_b_id: string;
    last_message_at: string;
    other_handle: string;
    last_body: string | null;
    unread_count: number;
  }[];

  return rows
    .filter((r) => !hasBlockRelationship(userId, r.user_a_id === userId ? r.user_b_id : r.user_a_id))
    .map((r) => ({
      id: r.id,
      otherUserId: r.user_a_id === userId ? r.user_b_id : r.user_a_id,
      otherHandle: r.other_handle,
      lastMessageAt: r.last_message_at,
      lastMessagePreview: r.last_body ?? "",
      unreadCount: r.unread_count,
    }));
}

/** Total unread messages across every conversation *userId* is part of — for the nav badge. */
export function countUnreadMessages(userId: string): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as n FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE (c.user_a_id = ? OR c.user_b_id = ?) AND m.sender_id != ? AND m.read_at IS NULL`,
    )
    .get(userId, userId, userId) as { n: number };
  return row.n;
}

export class ConversationAccessError extends Error {}

function requireParticipant(db: ReturnType<typeof getDb>, conversationId: string, viewerId: string) {
  const row = db
    .prepare("SELECT user_a_id, user_b_id FROM conversations WHERE id = ?")
    .get(conversationId) as { user_a_id: string; user_b_id: string } | undefined;
  if (!row) throw new ConversationAccessError("Conversation not found.");
  if (row.user_a_id !== viewerId && row.user_b_id !== viewerId) {
    throw new ConversationAccessError("You are not part of this conversation.");
  }
  return row;
}

/** Messages in a conversation, oldest first. Throws if *viewerId* isn't a participant. */
export function listMessages(conversationId: string, viewerId: string): Message[] {
  const db = getDb();
  requireParticipant(db, conversationId, viewerId);

  const rows = db
    .prepare(
      "SELECT id, conversation_id, sender_id, body, created_at, read_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
    )
    .all(conversationId) as {
    id: string;
    conversation_id: string;
    sender_id: string;
    body: string;
    created_at: string;
    read_at: string | null;
  }[];

  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    body: r.body,
    createdAt: r.created_at,
    readAt: r.read_at,
  }));
}

/** Marks every unread message *not sent by viewerId* as read. Throws if viewerId isn't a participant. */
export function markConversationRead(conversationId: string, viewerId: string): void {
  const db = getDb();
  requireParticipant(db, conversationId, viewerId);
  db.prepare(
    "UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL",
  ).run(new Date().toISOString(), conversationId, viewerId);
}
