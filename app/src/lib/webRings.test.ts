import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "./db";

process.env.IOFUS_DB_PATH = ":memory:";
import {
  createWebRing,
  joinWebRing,
  leaveWebRing,
  getRingNavigation,
  reviewJoinRequest,
  deleteWebRing,
  listRingMembers,
  isRingMember,
  hasPendingJoinRequest,
  WebRingError,
} from "./webRings";

function createUser(handle: string): string {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (id, handle, handle_lower, password_hash, created_at) VALUES (?, ?, ?, 'x', datetime('now'))",
  ).run(id, handle, handle.toLowerCase());
  // Give each user a published public page so listRingMembers can see them
  db.prepare(
    `INSERT INTO page_documents (user_id, document_json, is_published, visibility, hidden_from_discovery, updated_at)
     VALUES (?, '{}', 1, 'public', 0, datetime('now'))`,
  ).run(id);
  return id;
}

beforeEach(() => {
  const db = getDb();
  db.exec(
    "DELETE FROM graph_edges; DELETE FROM web_ring_join_requests; DELETE FROM web_ring_members; DELETE FROM web_rings; DELETE FROM page_documents; DELETE FROM users;",
  );
});

describe("createWebRing", () => {
  it("creates a ring with valid name", () => {
    const owner = createUser("owner");
    const ring = createWebRing(owner, { name: "Test Ring", description: "", isOpen: true });
    expect(ring.name).toBe("Test Ring");
    expect(ring.slug).toBe("test-ring");
    expect(ring.isOpen).toBe(true);
  });

  it("throws on empty name", () => {
    const owner = createUser("owner2");
    expect(() => createWebRing(owner, { name: "  ", description: "", isOpen: true })).toThrow(WebRingError);
  });

  it("generates unique slug on collision", () => {
    const owner = createUser("owner3");
    const r1 = createWebRing(owner, { name: "My Ring", description: "", isOpen: true });
    const r2 = createWebRing(owner, { name: "My Ring", description: "", isOpen: true });
    expect(r1.slug).not.toBe(r2.slug);
  });
});

describe("joinWebRing (open ring)", () => {
  it("joins an open ring immediately", () => {
    const owner = createUser("rowner");
    const user = createUser("joiner");
    const ring = createWebRing(owner, { name: "Open Ring", description: "", isOpen: true });
    const result = joinWebRing(ring.id, user);
    expect(result).toBe("joined");
    expect(isRingMember(ring.id, user)).toBe(true);
  });

  it("is idempotent for existing member", () => {
    const owner = createUser("rowner2");
    const user = createUser("joiner2");
    const ring = createWebRing(owner, { name: "Open Ring 2", description: "", isOpen: true });
    joinWebRing(ring.id, user);
    const result = joinWebRing(ring.id, user);
    expect(result).toBe("joined");
  });

  it("records graph edges on join", () => {
    const owner = createUser("rowner3");
    const a = createUser("memberA");
    const b = createUser("memberB");
    const ring = createWebRing(owner, { name: "Edge Ring", description: "", isOpen: true });
    joinWebRing(ring.id, a);
    joinWebRing(ring.id, b);
    const db = getDb();
    const edge = db.prepare("SELECT * FROM graph_edges WHERE from_user_id = ? AND to_user_id = ? AND edge_type = 'ring'").get(a, b);
    expect(edge).toBeDefined();
  });
});

describe("joinWebRing (closed ring)", () => {
  it("creates a join request for closed ring", () => {
    const owner = createUser("closedowner");
    const user = createUser("requester");
    const ring = createWebRing(owner, { name: "Closed Ring", description: "", isOpen: false });
    const result = joinWebRing(ring.id, user);
    expect(result).toBe("requested");
    expect(hasPendingJoinRequest(ring.id, user)).toBe(true);
  });
});

describe("reviewJoinRequest", () => {
  it("accepts a join request and adds member", () => {
    const owner = createUser("owner4");
    const user = createUser("req1");
    const ring = createWebRing(owner, { name: "Closed 2", description: "", isOpen: false });
    joinWebRing(ring.id, user);
    reviewJoinRequest(ring.id, user, owner, true);
    expect(isRingMember(ring.id, user)).toBe(true);
  });

  it("rejects a join request", () => {
    const owner = createUser("owner5");
    const user = createUser("req2");
    const ring = createWebRing(owner, { name: "Closed 3", description: "", isOpen: false });
    joinWebRing(ring.id, user);
    reviewJoinRequest(ring.id, user, owner, false);
    expect(isRingMember(ring.id, user)).toBe(false);
  });

  it("throws when not the owner", () => {
    const owner = createUser("owner6");
    const other = createUser("notowner");
    const user = createUser("req3");
    const ring = createWebRing(owner, { name: "Closed 4", description: "", isOpen: false });
    joinWebRing(ring.id, user);
    expect(() => reviewJoinRequest(ring.id, user, other, true)).toThrow(WebRingError);
  });
});

describe("getRingNavigation", () => {
  it("returns prev and next for middle member", () => {
    const owner = createUser("navowner");
    const a = createUser("navA");
    const b = createUser("navB");
    const c = createUser("navC");
    const ring = createWebRing(owner, { name: "Nav Ring", description: "", isOpen: true });
    joinWebRing(ring.id, a);
    joinWebRing(ring.id, b);
    joinWebRing(ring.id, c);
    const nav = getRingNavigation(ring.id, b);
    expect(nav.prev?.handle).toBe("navA");
    expect(nav.next?.handle).toBe("navC");
  });

  it("returns null prev for first member", () => {
    const owner = createUser("navowner2");
    const a = createUser("navFirst");
    const b = createUser("navSecond");
    const ring = createWebRing(owner, { name: "Nav Ring 2", description: "", isOpen: true });
    joinWebRing(ring.id, a);
    joinWebRing(ring.id, b);
    const nav = getRingNavigation(ring.id, a);
    expect(nav.prev).toBeNull();
    expect(nav.next).not.toBeNull();
  });

  it("returns null next for last member", () => {
    const owner = createUser("navowner3");
    const a = createUser("navLast1");
    const b = createUser("navLast2");
    const ring = createWebRing(owner, { name: "Nav Ring 3", description: "", isOpen: true });
    joinWebRing(ring.id, a);
    joinWebRing(ring.id, b);
    const nav = getRingNavigation(ring.id, b);
    expect(nav.next).toBeNull();
  });

  it("returns null,null for non-member", () => {
    const owner = createUser("navowner4");
    const ring = createWebRing(owner, { name: "Nav Ring 4", description: "", isOpen: true });
    const nonmember = createUser("nonmember");
    const nav = getRingNavigation(ring.id, nonmember);
    expect(nav.prev).toBeNull();
    expect(nav.next).toBeNull();
  });
});

describe("deleteWebRing", () => {
  it("deletes a ring owned by the user", () => {
    const owner = createUser("delowner");
    const ring = createWebRing(owner, { name: "To Delete", description: "", isOpen: true });
    deleteWebRing(ring.id, owner);
    const db = getDb();
    expect(db.prepare("SELECT * FROM web_rings WHERE id = ?").get(ring.id)).toBeUndefined();
  });

  it("throws when not the owner", () => {
    const owner = createUser("delowner2");
    const other = createUser("notowner2");
    const ring = createWebRing(owner, { name: "Protected", description: "", isOpen: true });
    expect(() => deleteWebRing(ring.id, other)).toThrow(WebRingError);
  });
});

describe("leaveWebRing", () => {
  it("removes member and graph edges", () => {
    const owner = createUser("leaveowner");
    const a = createUser("leaveA");
    const b = createUser("leaveB");
    const ring = createWebRing(owner, { name: "Leave Ring", description: "", isOpen: true });
    joinWebRing(ring.id, a);
    joinWebRing(ring.id, b);
    leaveWebRing(ring.id, a);
    expect(isRingMember(ring.id, a)).toBe(false);
    const db = getDb();
    const edge = db.prepare("SELECT * FROM graph_edges WHERE from_user_id = ? AND edge_type = 'ring'").get(a);
    expect(edge).toBeUndefined();
  });

  it("preserves edge when user leaves one of multiple shared rings (weight-tracking regression test)", () => {
    // CRITICAL Bug #3 regression test: Ring edge provenance loss
    // When two users are in multiple rings together, leaving one ring should not delete the edge
    // because the weight system tracks aggregate relationships across rings.
    const alice = createUser("alice-multi");
    const bob = createUser("bob-multi");

    // Create two rings
    const ring1 = createWebRing(alice, { name: "Ring 1", description: "", isOpen: true });
    const ring2 = createWebRing(alice, { name: "Ring 2", description: "", isOpen: true });

    // Alice joins both rings (empty, so no edges yet)
    joinWebRing(ring1.id, alice);
    joinWebRing(ring2.id, alice);

    // Bob joins Ring1: creates edge to Alice (weight 1)
    joinWebRing(ring1.id, bob);
    const db = getDb();
    let edge = db.prepare("SELECT weight FROM graph_edges WHERE from_user_id = ? AND to_user_id = ? AND edge_type = 'ring'").get(bob, alice) as { weight: number } | undefined;
    expect(edge?.weight).toBe(1);

    // Bob joins Ring2: increments weight to 2 (ON CONFLICT)
    joinWebRing(ring2.id, bob);
    edge = db.prepare("SELECT weight FROM graph_edges WHERE from_user_id = ? AND to_user_id = ? AND edge_type = 'ring'").get(bob, alice) as { weight: number } | undefined;
    expect(edge?.weight).toBe(2);

    // Bob leaves Ring1: weight decrements to 1, edge should still exist
    leaveWebRing(ring1.id, bob);
    edge = db.prepare("SELECT weight FROM graph_edges WHERE from_user_id = ? AND to_user_id = ? AND edge_type = 'ring'").get(bob, alice) as { weight: number } | undefined;
    expect(edge).toBeDefined();
    expect(edge?.weight).toBe(1);

    // Bob is still a member of Ring2
    expect(isRingMember(ring2.id, bob)).toBe(true);
  });
});
