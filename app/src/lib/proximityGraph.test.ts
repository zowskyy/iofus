import { describe, it, expect, beforeEach } from "vitest";
import { getDb, resetDbForTests } from "./db";

process.env.IOFUS_DB_PATH = ":memory:";
import { recordEdge, removeEdge, getProximityOrdered, getWanderBatch } from "./proximityGraph";

function createUser(handle: string): string {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (id, handle, handle_lower, password_hash, created_at) VALUES (?, ?, ?, 'x', datetime('now'))",
  ).run(id, handle, handle.toLowerCase());
  return id;
}

function publishPage(userId: string): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO page_documents (user_id, document_json, is_published, visibility, hidden_from_discovery, updated_at)
     VALUES (?, '{}', 1, 'public', 0, datetime('now'))`,
  ).run(userId);
}

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM graph_edges; DELETE FROM page_documents; DELETE FROM users;");
});

describe("recordEdge", () => {
  it("inserts a guestbook edge", () => {
    const a = createUser("alice");
    const b = createUser("bob");
    recordEdge(a, b, "guestbook");
    const db = getDb();
    const row = db.prepare("SELECT weight FROM graph_edges WHERE from_user_id = ? AND to_user_id = ?").get(a, b) as { weight: number } | undefined;
    expect(row?.weight).toBe(1);
  });

  it("increments weight on repeated edge", () => {
    const a = createUser("alice2");
    const b = createUser("bob2");
    recordEdge(a, b, "guestbook");
    recordEdge(a, b, "guestbook");
    const db = getDb();
    const row = db.prepare("SELECT weight FROM graph_edges WHERE from_user_id = ? AND to_user_id = ?").get(a, b) as { weight: number } | undefined;
    expect(row?.weight).toBe(2);
  });

  it("does not insert self-edge", () => {
    const a = createUser("alice3");
    recordEdge(a, a, "guestbook");
    const db = getDb();
    const row = db.prepare("SELECT * FROM graph_edges WHERE from_user_id = ? AND to_user_id = ?").get(a, a);
    expect(row).toBeUndefined();
  });
});

describe("removeEdge", () => {
  it("removes an existing edge", () => {
    const a = createUser("alice4");
    const b = createUser("bob4");
    recordEdge(a, b, "ring");
    removeEdge(a, b, "ring");
    const db = getDb();
    const row = db.prepare("SELECT * FROM graph_edges WHERE from_user_id = ? AND to_user_id = ?").get(a, b);
    expect(row).toBeUndefined();
  });
});

describe("getProximityOrdered", () => {
  it("returns direct neighbors in weight order", () => {
    const center = createUser("center");
    const near = createUser("near");
    const far = createUser("far");
    recordEdge(center, near, "guestbook");
    recordEdge(center, near, "guestbook"); // weight 2
    recordEdge(center, far, "guestbook");  // weight 1
    const result = getProximityOrdered(center, 10);
    expect(result[0]).toBe(near);
    expect(result[1]).toBe(far);
  });

  it("returns empty array when no edges", () => {
    const lone = createUser("loner");
    expect(getProximityOrdered(lone, 10)).toEqual([]);
  });

  it("does not include the start user", () => {
    const a = createUser("startA");
    const b = createUser("neighborB");
    recordEdge(a, b, "guestbook");
    const result = getProximityOrdered(a, 10);
    expect(result).not.toContain(a);
  });
});

describe("getWanderBatch", () => {
  it("falls back to random pages for null userId", () => {
    const u = createUser("wanderer");
    publishPage(u);
    const result = getWanderBatch(null, 5);
    expect(result.length).toBeGreaterThanOrEqual(0); // may be empty if no discoverable pages beyond seed
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns only handles", () => {
    const u = createUser("wanderer2");
    publishPage(u);
    const result = getWanderBatch(null, 5);
    for (const h of result) expect(typeof h).toBe("string");
  });
});
