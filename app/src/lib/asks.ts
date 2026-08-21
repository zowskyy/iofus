import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { hasBlockRelationship } from "./friends";
import { checkRateLimit, DAY_MS } from "./rateLimit";

// Ask Us: reach people outside your friend graph for help, knowledge, or
// perspective you don't already have access to — per the "Internet of
// Us" research this feature is grounded in (see PLAN.md Phase 6). Never
// a DM inbox: an ask is posted once, not addressed to anyone, and
// anyone in the matching pool can answer it. The guardrails below are
// carried over from that research, not invented fresh:
//   - diversity/reach never overrides safety: a sensitive ask is only
//     ever shown to the asker's own friends, never the open pool
//   - no profile dimension is used for matching without the member's
//     own opt-in: `reachable_for_asks` defaults to off, and `domain` is
//     a plain string the asker chooses, never inferred
//   - the per-asker daily rate limit is the mechanism that makes this
//     safe to ship, not optional polish

export class AskError extends Error {}

const MAX_ASKS_PER_DAY = 5;
const MAX_BODY_LENGTH = 2000;
const MAX_DOMAIN_LENGTH = 100;
const POOL_SIZE = 8;

export interface Ask {
  id: string;
  askerId: string | null; // null for anonymous asks when viewer is not the owner
  askerHandle: string | null; // null when anonymous — never leaked to non-owners
  body: string;
  domain: string | null;
  isAnonymous: boolean;
  isSensitive: boolean;
  status: "open" | "closed";
  createdAt: string;
  answerCount: number;
}

interface AskRow {
  id: string;
  asker_id: string;
  asker_handle: string;
  body: string;
  domain: string | null;
  is_anonymous: number;
  is_sensitive: number;
  status: "open" | "closed";
  created_at: string;
  answer_count: number;
}

/** Converts a raw SQLite ask row into a public Ask object, masking the asker identity when anonymous and the viewer is not the asker. */
function rowToAsk(row: AskRow, viewerId: string | null): Ask {
  const isOwner = viewerId !== null && viewerId === row.asker_id;
  const anonymous = row.is_anonymous === 1;
  return {
    id: row.id,
    askerId: anonymous && !isOwner ? null : row.asker_id,
    askerHandle: anonymous && !isOwner ? null : row.asker_handle,
    body: row.body,
    domain: row.domain,
    isAnonymous: anonymous,
    isSensitive: row.is_sensitive === 1,
    status: row.status,
    createdAt: row.created_at,
    answerCount: row.answer_count,
  };
}

const SELECT_ASK = `
  SELECT a.id, a.asker_id, u.handle as asker_handle, a.body, a.domain,
         a.is_anonymous, a.is_sensitive, a.status, a.created_at,
         (SELECT COUNT(*) FROM ask_answers WHERE ask_id = a.id) as answer_count
  FROM asks a JOIN users u ON u.id = a.asker_id
`;

/** Opt in or out of being reachable by strangers' asks. Off by default.
 *  When disabling, also closes the user's existing open non-sensitive asks
 *  so they stop appearing in other members' pools immediately. */
export function setReachableForAsks(userId: string, reachable: boolean): void {
  const db = getDb();
  db.prepare("UPDATE users SET reachable_for_asks = ? WHERE id = ?").run(reachable ? 1 : 0, userId);
  if (!reachable) {
    db.prepare(
      "UPDATE asks SET status = 'closed', closed_at = ? WHERE asker_id = ? AND status = 'open' AND is_sensitive = 0",
    ).run(new Date().toISOString(), userId);
  }
}

/** Returns true if *userId* has opted in to receiving strangers' asks. */
export function isReachableForAsks(userId: string): boolean {
  const row = getDb().prepare("SELECT reachable_for_asks FROM users WHERE id = ?").get(userId) as
    | { reachable_for_asks: number }
    | undefined;
  return row?.reachable_for_asks === 1;
}

export interface CreateAskInput {
  askerId: string;
  body: string;
  domain?: string | null;
  isAnonymous?: boolean;
  isSensitive?: boolean;
}

/** Validate and persist a new ask. Throws AskError on validation failure, RateLimitError when the daily cap is reached. */
export function createAsk(input: CreateAskInput): Ask {
  const body = input.body.trim();
  if (!body) throw new AskError("Your ask can't be empty.");
  if (body.length > MAX_BODY_LENGTH) {
    throw new AskError(`Your ask is too long (max ${MAX_BODY_LENGTH} characters).`);
  }
  if (!input.isSensitive && !isReachableForAsks(input.askerId)) {
    throw new AskError("Turn on reachability to post an open ask.");
  }

  checkRateLimit(`ask:create:${input.askerId}`, MAX_ASKS_PER_DAY, DAY_MS);

  const db = getDb();
  const id = randomUUID();
  const domain = input.domain?.trim() || null;
  if (domain && domain.length > MAX_DOMAIN_LENGTH) {
    throw new AskError(`Your topic is too long (max ${MAX_DOMAIN_LENGTH} characters).`);
  }
  db.prepare(
    `INSERT INTO asks (id, asker_id, body, domain, is_anonymous, is_sensitive, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
  ).run(id, input.askerId, body, domain, input.isAnonymous ? 1 : 0, input.isSensitive ? 1 : 0, new Date().toISOString());

  const row = db.prepare(`${SELECT_ASK} WHERE a.id = ?`).get(id) as unknown as AskRow;
  return rowToAsk(row, input.askerId);
}

/**
 * Returns the open asks *viewerId* is eligible to see and answer right
 * now — never a global feed. A sensitive ask is restricted to the
 * asker's own accepted friends (the paper's "restrict to a trusted pool
 * of peers" safeguard); a non-sensitive ask is open to any reachable,
 * non-blocked member, optionally filtered by domain. The viewer's own
 * asks are excluded — you can't answer yourself. Ordered newest-first
 * and capped at POOL_SIZE to keep this a small, human-scale pool, not a
 * feed to scroll.
 */
export function listAsksForViewer(viewerId: string, domain?: string): Ask[] {
  const db = getDb();
  const rows = db
    .prepare(
      `${SELECT_ASK}
       WHERE a.status = 'open'
         AND a.asker_id != ?
         AND (
           (a.is_sensitive = 0 AND EXISTS (
             SELECT 1 FROM users v WHERE v.id = ? AND v.reachable_for_asks = 1
           ))
           OR
           (a.is_sensitive = 1 AND EXISTS (
             SELECT 1 FROM friend_links fl
             WHERE fl.status = 'accepted'
               AND ((fl.requester_id = a.asker_id AND fl.addressee_id = ?)
                 OR (fl.addressee_id = a.asker_id AND fl.requester_id = ?))
           ))
         )
         AND (? IS NULL OR a.domain = ?)
       ORDER BY a.created_at DESC
       LIMIT ?`,
    )
    .all(viewerId, viewerId, viewerId, viewerId, domain ?? null, domain ?? null, POOL_SIZE) as unknown as AskRow[];

  return rows
    .filter((row) => !hasBlockRelationship(viewerId, row.asker_id))
    .map((row) => rowToAsk(row, viewerId));
}

/** All asks *askerId* has posted, for their own "My asks" view, newest first. */
export function listAsksByUser(askerId: string): Ask[] {
  const db = getDb();
  const rows = db
    .prepare(`${SELECT_ASK} WHERE a.asker_id = ? ORDER BY a.created_at DESC`)
    .all(askerId) as unknown as AskRow[];
  return rows.map((row) => rowToAsk(row, askerId));
}

/** Fetch a single ask by id, applying the same anonymity rules as listAsksForViewer. Returns null when not found. */
/** Returns the raw asker_id for *askId* without masking — for internal use (e.g. sending notifications). */
export function getAskerIdByAskId(askId: string): string | null {
  const row = getDb()
    .prepare("SELECT asker_id FROM asks WHERE id = ?")
    .get(askId) as { asker_id: string } | undefined;
  return row?.asker_id ?? null;
}

export function getAsk(askId: string, viewerId: string | null): Ask | null {
  const row = getDb().prepare(`${SELECT_ASK} WHERE a.id = ?`).get(askId) as unknown as AskRow | undefined;
  return row ? rowToAsk(row, viewerId) : null;
}

export interface Answer {
  id: string;
  askId: string;
  answererId: string;
  answererHandle: string;
  body: string;
  createdAt: string;
}

/** All answers for *askId*, oldest first. */
export function listAnswers(askId: string): Answer[] {
  const rows = getDb()
    .prepare(
      `SELECT aa.id, aa.ask_id, aa.answerer_id, u.handle as answerer_handle, aa.body, aa.created_at
       FROM ask_answers aa JOIN users u ON u.id = aa.answerer_id
       WHERE aa.ask_id = ?
       ORDER BY aa.created_at ASC`,
    )
    .all(askId) as { id: string; ask_id: string; answerer_id: string; answerer_handle: string; body: string; created_at: string }[];
  return rows.map((r) => ({
    id: r.id,
    askId: r.ask_id,
    answererId: r.answerer_id,
    answererHandle: r.answerer_handle,
    body: r.body,
    createdAt: r.created_at,
  }));
}

/** Submit *answererId*'s answer to *askId*. Re-validates eligibility at write time. Throws AskError on auth/validation failure. */
export function answerAsk(askId: string, answererId: string, body: string): Answer {
  const trimmed = body.trim();
  if (!trimmed) throw new AskError("Your answer can't be empty.");
  if (trimmed.length > MAX_BODY_LENGTH) {
    throw new AskError(`Your answer is too long (max ${MAX_BODY_LENGTH} characters).`);
  }

  const db = getDb();
  const ask = db.prepare("SELECT asker_id, status, is_sensitive FROM asks WHERE id = ?").get(askId) as
    | { asker_id: string; status: string; is_sensitive: number }
    | undefined;
  if (!ask) throw new AskError("This ask no longer exists.");
  if (ask.status !== "open") throw new AskError("This ask is closed.");
  if (ask.asker_id === answererId) throw new AskError("You can't answer your own ask.");
  if (hasBlockRelationship(ask.asker_id, answererId)) {
    throw new AskError("You can't answer this ask.");
  }

  // Re-check the same eligibility rules as listAsksForViewer on this write path.
  // A user can submit a previously rendered form after their eligibility changes.
  if (ask.is_sensitive === 0) {
    const reachable = db.prepare("SELECT reachable_for_asks FROM users WHERE id = ?").get(answererId) as
      | { reachable_for_asks: number }
      | undefined;
    if (!reachable || reachable.reachable_for_asks !== 1) {
      throw new AskError("You can't answer this ask.");
    }
  } else {
    const friendship = db
      .prepare(
        `SELECT 1 FROM friend_links WHERE status = 'accepted'
         AND ((requester_id = ? AND addressee_id = ?) OR (addressee_id = ? AND requester_id = ?))`,
      )
      .get(ask.asker_id, answererId, ask.asker_id, answererId);
    if (!friendship) {
      throw new AskError("You can't answer this ask.");
    }
  }

  const existing = db
    .prepare("SELECT 1 FROM ask_answers WHERE ask_id = ? AND answerer_id = ?")
    .get(askId, answererId);
  if (existing) throw new AskError("You've already answered this ask.");

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO ask_answers (id, ask_id, answerer_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, askId, answererId, trimmed, createdAt);

  return {
    id,
    askId,
    answererId,
    answererHandle: (db.prepare("SELECT handle FROM users WHERE id = ?").get(answererId) as { handle: string }).handle,
    body: trimmed,
    createdAt,
  };
}

/** Close *askId* so it no longer appears in the pool. Only the original asker may do this. Idempotent. */
export function closeAsk(askId: string, askerId: string): void {
  const db = getDb();
  const row = db.prepare("SELECT asker_id, status FROM asks WHERE id = ?").get(askId) as
    | { asker_id: string; status: string }
    | undefined;
  if (!row) throw new AskError("This ask no longer exists.");
  if (row.asker_id !== askerId) throw new AskError("Only the asker can close this ask.");
  if (row.status === "closed") return; // idempotent
  db.prepare("UPDATE asks SET status = 'closed', closed_at = ? WHERE id = ?").run(new Date().toISOString(), askId);
}
