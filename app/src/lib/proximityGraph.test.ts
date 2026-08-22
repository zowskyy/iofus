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
    expect(result.length).toBeGreaterThan(0); // should include at least the created user's page
    expect(Array.isArray(result)).toBe(true);
    expect(result).toContain("wanderer"); // verify the created page is in results
  });

  it("returns only handles", () => {
    const u = createUser("wanderer2");
    publishPage(u);
    const result = getWanderBatch(null, 5);
    expect(result.length).toBeGreaterThan(0); // must have results before checking type
    for (const h of result) expect(typeof h).toBe("string");
  });

  it("fills partial proximity results with random pages", () => {
    // Create a center user with proximity to 2 others
    const center = createUser("center-wander");
    const proximity1 = createUser("proximity1");
    const proximity2 = createUser("proximity2");
    const random1 = createUser("random1");
    const random2 = createUser("random2");

    // Publish all pages
    publishPage(center);
    publishPage(proximity1);
    publishPage(proximity2);
    publishPage(random1);
    publishPage(random2);

    // Create edges from center to proximity users
    recordEdge(center, proximity1, "guestbook");
    recordEdge(center, proximity2, "guestbook");

    // Request 4 results (more than the 2 proximity edges)
    const result = getWanderBatch(center, 4);

    // Should contain both proximity results plus 2 random results
    expect(result.length).toBe(4);
    expect(result).toContain("proximity1");
    expect(result).toContain("proximity2");
    // Verify the proximity results come before random results (both have weight 1, so order may vary)
    const proximityIndices = [result.indexOf("proximity1"), result.indexOf("proximity2")];
    expect(Math.max(...proximityIndices)).toBeLessThan(2);
  });

  it("returns partial proximity when some pages are not discoverable", () => {
    // Create center with proximity to users, but one is not discoverable
    const center = createUser("center-partial");
    const visible = createUser("visible-user");
    const hidden = createUser("hidden-user");
    const random1 = createUser("random-partial1");

    // Publish visible and random pages, but not hidden
    publishPage(center);
    publishPage(visible);
    publishPage(random1);
    // Don't publish hidden page - it won't be discoverable

    // Create edges from center to both users
    recordEdge(center, visible, "ring");
    recordEdge(center, hidden, "ring");

    // Request 3 results
    const result = getWanderBatch(center, 3);

    // Should contain the visible proximity result plus random fills
    expect(result.length).toBe(3);
    expect(result).toContain("visible-user");
    // Hidden user should NOT be in results since page is not published
    expect(result).not.toContain("hidden-user");
  });

  it("does not return duplicate handles when first proximity user is undiscoverable", () => {
    // Regression test for bug where selectedUserIds was sliced positionally
    // instead of using actual result keys, causing duplicates when early
    // proximity contacts had no published page.
    const center = createUser("center-dup");
    const proximity1 = createUser("proximity1-dup");
    const proximity2 = createUser("proximity2-dup");
    const random1 = createUser("random-dup");
    const random2 = createUser("random-dup2");
    const random3 = createUser("random-dup3");
    const random4 = createUser("random-dup4");

    // Publish all except proximity1 (the first proximity contact)
    publishPage(proximity2);
    publishPage(random1);
    publishPage(random2);
    publishPage(random3);
    publishPage(random4);

    // Create edges: center → proximity1 (weight 10), center → proximity2 (weight 5)
    recordEdge(center, proximity1, "guestbook");
    recordEdge(center, proximity1, "guestbook");
    recordEdge(center, proximity1, "guestbook");
    recordEdge(center, proximity1, "guestbook");
    recordEdge(center, proximity1, "guestbook");
    recordEdge(center, proximity1, "guestbook");
    recordEdge(center, proximity1, "guestbook");
    recordEdge(center, proximity1, "guestbook");
    recordEdge(center, proximity1, "guestbook");
    recordEdge(center, proximity1, "guestbook"); // weight 10
    recordEdge(center, proximity2, "guestbook");
    recordEdge(center, proximity2, "guestbook");
    recordEdge(center, proximity2, "guestbook");
    recordEdge(center, proximity2, "guestbook");
    recordEdge(center, proximity2, "guestbook"); // weight 5

    // Request 5 results: proximity2 + 3 random
    const result = getWanderBatch(center, 5);

    // Should contain exactly 5 results (proximity2 + 3 random)
    expect(result.length).toBe(5);
    expect(result).toContain("proximity2-dup");

    // Key assertion: proximity2 appears exactly once, not duplicated
    const proximity2Count = result.filter((h) => h === "proximity2-dup").length;
    expect(proximity2Count).toBe(1);

    // All handles should be strings
    for (const h of result) {
      expect(typeof h).toBe("string");
    }

    // No handle should appear twice (verifies duplicate bug is fixed)
    const uniqueCount = new Set(result).size;
    expect(uniqueCount).toBe(result.length);
  });
});
