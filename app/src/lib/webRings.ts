import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import { recordEdge, removeEdge } from "./proximityGraph";

export interface WebRing {
  id: string;
  slug: string;
  name: string;
  description: string;
  creatorUserId: string | null;
  isOpen: boolean;
}

export interface WebRingJoinRequest {
  ringId: string;
  userId: string;
  handle: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
}

export interface WebRingMember {
  handle: string;
  displayName: string;
  position: number;
  userId?: string;
}

type RingRow = { id: string; slug: string; name: string; description: string; creator_user_id: string | null; is_open: number };

function rowToRing(r: RingRow): WebRing {
  return { id: r.id, slug: r.slug, name: r.name, description: r.description, creatorUserId: r.creator_user_id, isOpen: r.is_open !== 0 };
}

/** Returns all web rings ordered alphabetically by name. */
export function listWebRings(): WebRing[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, slug, name, description, creator_user_id, is_open FROM web_rings ORDER BY name ASC")
    .all() as RingRow[];
  return rows.map(rowToRing);
}

/** Looks up a web ring by its URL slug. Returns null when no ring matches. */
export function getWebRingBySlug(slug: string): WebRing | null {
  const db = getDb();
  const row = db
    .prepare("SELECT id, slug, name, description, creator_user_id, is_open FROM web_rings WHERE slug = ?")
    .get(slug) as RingRow | undefined;
  return row ? rowToRing(row) : null;
}

/** Returns public, discovery-visible members of *ringId* ordered by position then join date. */
export function listRingMembers(ringId: string): WebRingMember[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.handle, u.id AS userId, pd.document_json, wrm.position
       FROM web_ring_members wrm
       JOIN users u ON u.id = wrm.user_id
       JOIN page_documents pd ON pd.user_id = wrm.user_id
       WHERE wrm.ring_id = ?
         AND pd.is_published = 1 AND pd.visibility = 'public' AND pd.hidden_from_discovery = 0
       ORDER BY wrm.position ASC, wrm.joined_at ASC`,
    )
    .all(ringId) as { handle: string; userId: string; document_json: string; position: number }[];

  return rows.map((r) => {
    let displayName = r.handle;
    try {
      const doc = JSON.parse(r.document_json) as { identity?: { displayName?: string } };
      if (doc.identity?.displayName) displayName = doc.identity.displayName;
    } catch { /* fall back */ }
    return { handle: r.handle, displayName, position: r.position, userId: r.userId };
  });
}

/** Returns the previous and next ring members relative to *currentUserId* for ring navigation links. */
export function getRingNavigation(ringId: string, currentUserId: string): { prev: WebRingMember | null; next: WebRingMember | null } {
  const members = listRingMembers(ringId);
  const idx = members.findIndex((m) => m.userId === currentUserId);
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? members[idx - 1]! : null,
    next: idx < members.length - 1 ? members[idx + 1]! : null,
  };
}

/** Rings a user belongs to — for profile badges and navigation. */
export function listUserWebRings(userId: string): WebRing[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT wr.id, wr.slug, wr.name, wr.description, wr.creator_user_id, wr.is_open
       FROM web_rings wr
       JOIN web_ring_members wrm ON wrm.ring_id = wr.id
       WHERE wrm.user_id = ?
       ORDER BY wr.name ASC`,
    )
    .all(userId) as RingRow[];
  return rows.map(rowToRing);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export class WebRingError extends Error {}

export function createWebRing(
  userId: string,
  opts: { name: string; description: string; isOpen: boolean },
): WebRing {
  const name = opts.name.trim();
  if (!name) throw new WebRingError("Ring name is required.");
  if (name.length > 80) throw new WebRingError("Ring name is too long.");
  const db = getDb();
  const base = slugify(name) || "ring";
  let slug = base;
  let attempt = 0;
  while (db.prepare("SELECT 1 FROM web_rings WHERE slug = ?").get(slug)) {
    attempt++;
    slug = `${base}-${attempt}`;
  }
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO web_rings (id, slug, name, description, creator_user_id, is_open, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, slug, name, opts.description.trim(), userId, opts.isOpen ? 1 : 0, now);
  return { id, slug, name, description: opts.description.trim(), creatorUserId: userId, isOpen: opts.isOpen };
}

export function getUserOwnedRings(userId: string): WebRing[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, slug, name, description, creator_user_id, is_open FROM web_rings WHERE creator_user_id = ? ORDER BY name ASC",
    )
    .all(userId) as RingRow[];
  return rows.map(rowToRing);
}

export function deleteWebRing(ringId: string, userId: string): void {
  const db = getDb();
  const ring = db.prepare("SELECT creator_user_id FROM web_rings WHERE id = ?").get(ringId) as { creator_user_id: string | null } | undefined;
  if (!ring) throw new WebRingError("Ring not found.");
  if (ring.creator_user_id !== userId) throw new WebRingError("Only the ring owner can delete it.");
  db.prepare("DELETE FROM web_rings WHERE id = ?").run(ringId);
}

export function updateWebRing(
  ringId: string,
  userId: string,
  opts: { name?: string; description?: string },
): void {
  const db = getDb();
  const ring = db.prepare("SELECT creator_user_id FROM web_rings WHERE id = ?").get(ringId) as { creator_user_id: string | null } | undefined;
  if (!ring) throw new WebRingError("Ring not found.");
  if (ring.creator_user_id !== userId) throw new WebRingError("Only the ring owner can update it.");
  if (opts.name !== undefined) {
    const name = opts.name.trim();
    if (!name) throw new WebRingError("Ring name is required.");
    db.prepare("UPDATE web_rings SET name = ? WHERE id = ?").run(name, ringId);
  }
  if (opts.description !== undefined) {
    db.prepare("UPDATE web_rings SET description = ? WHERE id = ?").run(opts.description.trim(), ringId);
  }
}

export function joinWebRing(ringId: string, userId: string): "joined" | "requested" {
  const db = getDb();
  const ring = db.prepare("SELECT is_open FROM web_rings WHERE id = ?").get(ringId) as { is_open: number } | undefined;
  if (!ring) throw new WebRingError("Ring not found.");

  const alreadyMember = db.prepare("SELECT 1 FROM web_ring_members WHERE ring_id = ? AND user_id = ?").get(ringId, userId);
  if (alreadyMember) return "joined";

  if (ring.is_open) {
    const maxPos = db.prepare("SELECT COALESCE(MAX(position), 0) as m FROM web_ring_members WHERE ring_id = ?").get(ringId) as { m: number };
    db.prepare(
      "INSERT INTO web_ring_members (ring_id, user_id, position, joined_at) VALUES (?, ?, ?, ?)",
    ).run(ringId, userId, maxPos.m + 1, new Date().toISOString());
    _recordRingEdges(db, ringId, userId);
    return "joined";
  } else {
    db.prepare(
      "INSERT OR IGNORE INTO web_ring_join_requests (ring_id, user_id, status, created_at) VALUES (?, ?, 'pending', ?)",
    ).run(ringId, userId, new Date().toISOString());
    return "requested";
  }
}

/** Record bidirectional proximity graph edges between *newUserId* and all existing ring members. */
function _recordRingEdges(db: ReturnType<typeof getDb>, ringId: string, newUserId: string): void {
  const members = db
    .prepare("SELECT user_id FROM web_ring_members WHERE ring_id = ? AND user_id != ?")
    .all(ringId, newUserId) as { user_id: string }[];
  for (const m of members) {
    recordEdge(newUserId, m.user_id, "ring");
    recordEdge(m.user_id, newUserId, "ring");
  }
}

export function leaveWebRing(ringId: string, userId: string): void {
  const db = getDb();
  // Remove graph edges to/from ring members before leaving
  const members = db
    .prepare("SELECT user_id FROM web_ring_members WHERE ring_id = ? AND user_id != ?")
    .all(ringId, userId) as { user_id: string }[];
  for (const m of members) {
    removeEdge(userId, m.user_id, "ring");
    removeEdge(m.user_id, userId, "ring");
  }
  db.prepare("DELETE FROM web_ring_members WHERE ring_id = ? AND user_id = ?").run(ringId, userId);
  db.prepare("DELETE FROM web_ring_join_requests WHERE ring_id = ? AND user_id = ?").run(ringId, userId);
}

export function listJoinRequests(ringId: string, userId: string): WebRingJoinRequest[] {
  const db = getDb();
  const ring = db.prepare("SELECT creator_user_id FROM web_rings WHERE id = ?").get(ringId) as { creator_user_id: string | null } | undefined;
  if (!ring || ring.creator_user_id !== userId) throw new WebRingError("Not authorized.");
  const rows = db
    .prepare(
      `SELECT r.ring_id, r.user_id, u.handle, r.status, r.created_at
       FROM web_ring_join_requests r JOIN users u ON u.id = r.user_id
       WHERE r.ring_id = ? AND r.status = 'pending'
       ORDER BY r.created_at ASC`,
    )
    .all(ringId) as { ring_id: string; user_id: string; handle: string; status: string; created_at: string }[];
  return rows.map((r) => ({
    ringId: r.ring_id,
    userId: r.user_id,
    handle: r.handle,
    status: r.status as "pending",
    createdAt: r.created_at,
  }));
}

export function reviewJoinRequest(
  ringId: string,
  requestUserId: string,
  ownerId: string,
  accept: boolean,
): void {
  const db = getDb();
  const ring = db.prepare("SELECT creator_user_id FROM web_rings WHERE id = ?").get(ringId) as { creator_user_id: string | null } | undefined;
  if (!ring || ring.creator_user_id !== ownerId) throw new WebRingError("Not authorized.");
  const req = db
    .prepare("SELECT status FROM web_ring_join_requests WHERE ring_id = ? AND user_id = ?")
    .get(ringId, requestUserId) as { status: string } | undefined;
  if (!req || req.status !== "pending") return;

  db.prepare("UPDATE web_ring_join_requests SET status = ? WHERE ring_id = ? AND user_id = ?").run(
    accept ? "accepted" : "rejected",
    ringId,
    requestUserId,
  );

  if (accept) {
    const maxPos = db.prepare("SELECT COALESCE(MAX(position), 0) as m FROM web_ring_members WHERE ring_id = ?").get(ringId) as { m: number };
    db.prepare(
      "INSERT OR IGNORE INTO web_ring_members (ring_id, user_id, position, joined_at) VALUES (?, ?, ?, ?)",
    ).run(ringId, requestUserId, maxPos.m + 1, new Date().toISOString());
    _recordRingEdges(db, ringId, requestUserId);
  }
}

export function countRingMembers(ringId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as n FROM web_ring_members WHERE ring_id = ?")
    .get(ringId) as { n: number };
  return row.n;
}

export function isRingMember(ringId: string, userId: string): boolean {
  return !!getDb().prepare("SELECT 1 FROM web_ring_members WHERE ring_id = ? AND user_id = ?").get(ringId, userId);
}

export function hasPendingJoinRequest(ringId: string, userId: string): boolean {
  return !!getDb()
    .prepare("SELECT 1 FROM web_ring_join_requests WHERE ring_id = ? AND user_id = ? AND status = 'pending'")
    .get(ringId, userId);
}

/** Seeds the database with the three default web rings if none exist yet. Idempotent. */
export function ensureSeedRings(): void {
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) as c FROM web_rings").get() as { c: number };
  if (count.c > 0) return;

  const rings = [
    { slug: "soft-web-webring", name: "Soft Web Webring", description: "Gentle pages, warm colors, quiet corners." },
    { slug: "pixel-tavern-ring", name: "Pixel Tavern Ring", description: "Retro vibes, monospace energy, late-night pages." },
    { slug: "creative-coders", name: "Creative Coders", description: "People making things and writing about the process." },
  ];
  const now = new Date().toISOString();
  for (const ring of rings) {
    db.prepare("INSERT INTO web_rings (id, slug, name, description, creator_user_id, is_open, created_at) VALUES (?, ?, ?, ?, NULL, 1, ?)").run(
      randomUUID(), ring.slug, ring.name, ring.description, now,
    );
  }
}
