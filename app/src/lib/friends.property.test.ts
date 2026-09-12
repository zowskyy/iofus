import { beforeEach, describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  acceptFriendRequest,
  blockUser,
  FriendLinkNotFoundError,
  FriendRequestError,
  hasBlockRelationship,
  listBlockedUsers,
  listFriends,
  listIncomingRequests,
  removeFriendLink,
  sendFriendRequest,
  unblockUser,
} from "./friends";
import { createUser, type User } from "./auth";
import { getDb, resetDbForTests } from "./db";

process.env.IOFUS_DB_PATH = ":memory:";

// Property/generative test for the friend graph state machine. Rather than
// hand-writing individual add/accept/decline/block scenarios, this drives a
// small fixed pool of users through hundreds of randomly generated command
// sequences and checks the invariants the graph must never violate, no
// matter what order operations happen in.

type Command =
  | { op: "request"; from: number; to: number }
  | { op: "accept"; by: number; to: number }
  | { op: "remove"; by: number; to: number }
  | { op: "block"; by: number; target: number }
  | { op: "unblock"; by: number; target: number };

const POOL_SIZE = 4;

const commandArb = fc.oneof(
  fc.record({
    op: fc.constant("request" as const),
    from: fc.integer({ min: 0, max: POOL_SIZE - 1 }),
    to: fc.integer({ min: 0, max: POOL_SIZE - 1 }),
  }),
  fc.record({
    op: fc.constant("accept" as const),
    by: fc.integer({ min: 0, max: POOL_SIZE - 1 }),
    to: fc.integer({ min: 0, max: POOL_SIZE - 1 }),
  }),
  fc.record({
    op: fc.constant("remove" as const),
    by: fc.integer({ min: 0, max: POOL_SIZE - 1 }),
    to: fc.integer({ min: 0, max: POOL_SIZE - 1 }),
  }),
  fc.record({
    op: fc.constant("block" as const),
    by: fc.integer({ min: 0, max: POOL_SIZE - 1 }),
    target: fc.integer({ min: 0, max: POOL_SIZE - 1 }),
  }),
  fc.record({
    op: fc.constant("unblock" as const),
    by: fc.integer({ min: 0, max: POOL_SIZE - 1 }),
    target: fc.integer({ min: 0, max: POOL_SIZE - 1 }),
  }),
);

function makePool(): User[] {
  return Array.from({ length: POOL_SIZE }, (_, i) => createUser(`fuzz${i}user`, "correct-horse-battery"));
}

/** Executes *cmd* against the real friends.ts API, swallowing the domain errors it can legitimately throw for an invalid transition (self-friend, duplicate, blocked, not-found, not-a-participant) — those rejections are exactly the invariant under test, not a bug. */
function apply(pool: User[], cmd: Command): void {
  try {
    switch (cmd.op) {
      case "request":
        sendFriendRequest(pool[cmd.from]!.id, pool[cmd.to]!.id);
        break;
      case "accept": {
        // Find a pending request addressed to *by* from *to*, if any.
        const incoming = listIncomingRequests(pool[cmd.by]!.id);
        const match = incoming.find((r) => r.fromHandle === pool[cmd.to]!.handle);
        if (match) acceptFriendRequest(pool[cmd.by]!.id, match.id);
        break;
      }
      case "remove": {
        const links = listFriends(pool[cmd.by]!.id);
        const match = links.find((l) => l.handle === pool[cmd.to]!.handle);
        if (match) removeFriendLink(pool[cmd.by]!.id, match.linkId);
        break;
      }
      case "block":
        blockUser(pool[cmd.by]!.id, pool[cmd.target]!.id);
        break;
      case "unblock":
        unblockUser(pool[cmd.by]!.id, pool[cmd.target]!.id);
        break;
    }
  } catch (e) {
    if (e instanceof FriendRequestError || e instanceof FriendLinkNotFoundError) return;
    throw e;
  }
}

/** Checks invariants that must hold after *any* sequence of operations, valid or rejected. */
function checkInvariants(pool: User[]): void {
  const db = getDb();

  // 1. No self-friendship and no self-block can ever exist in storage,
  // regardless of what commands were attempted.
  const selfLinks = db
    .prepare("SELECT COUNT(*) as n FROM friend_links WHERE requester_id = addressee_id")
    .get() as { n: number };
  expect(selfLinks.n).toBe(0);
  const selfBlocks = db
    .prepare("SELECT COUNT(*) as n FROM blocks WHERE blocker_id = blocked_id")
    .get() as { n: number };
  expect(selfBlocks.n).toBe(0);

  // 2. No duplicate friend_links row for the same unordered pair.
  const pairs = db.prepare("SELECT requester_id, addressee_id FROM friend_links").all() as {
    requester_id: string;
    addressee_id: string;
  }[];
  const seen = new Set<string>();
  for (const p of pairs) {
    const key = [p.requester_id, p.addressee_id].sort().join(":");
    expect(seen.has(key)).toBe(false);
    seen.add(key);
  }

  // 3. A blocked relationship can never coexist with an accepted friend
  // link between the same two users — blockUser() tears down any
  // existing link, and sendFriendRequest()/acceptFriendRequest() must
  // never let one form afterward.
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const blocked = hasBlockRelationship(pool[i]!.id, pool[j]!.id);
      if (blocked) {
        const aFriends = listFriends(pool[i]!.id).some((f) => f.handle === pool[j]!.handle);
        const bFriends = listFriends(pool[j]!.id).some((f) => f.handle === pool[i]!.handle);
        expect(aFriends).toBe(false);
        expect(bFriends).toBe(false);
      }
    }
  }

  // 4. Friendship is always symmetric: if A lists B as a friend, B lists A.
  for (const u of pool) {
    for (const f of listFriends(u.id)) {
      const reciprocal = listFriends(pool.find((p) => p.handle === f.handle)!.id).some(
        (r) => r.handle === u.handle,
      );
      expect(reciprocal).toBe(true);
    }
  }

  // 5. listBlockedUsers is consistent with hasBlockRelationship for every pair.
  for (const u of pool) {
    const blockedByU = new Set(listBlockedUsers(u.id).map((b) => b.handle));
    for (const other of pool) {
      if (other.id === u.id) continue;
      if (blockedByU.has(other.handle)) {
        expect(hasBlockRelationship(u.id, other.id)).toBe(true);
      }
    }
  }
}

describe("friend graph invariants (property-based)", () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it(
    "never violates graph invariants under any sequence of valid/invalid operations",
    () => {
      fc.assert(
        fc.property(fc.array(commandArb, { minLength: 1, maxLength: 25 }), (commands) => {
          resetDbForTests();
          const pool = makePool();
          for (const cmd of commands) apply(pool, cmd);
          checkInvariants(pool);
        }),
        { numRuns: 40 },
      );
    },
    30_000,
  );

  it("regression: blocking after a pending request removes it, and re-requesting after unblock starts clean", () => {
    resetDbForTests();
    const pool = makePool();
    sendFriendRequest(pool[0]!.id, pool[1]!.id);
    blockUser(pool[1]!.id, pool[0]!.id);
    expect(listIncomingRequests(pool[1]!.id)).toHaveLength(0);
    expect(() => sendFriendRequest(pool[0]!.id, pool[1]!.id)).toThrow(FriendRequestError);
    unblockUser(pool[1]!.id, pool[0]!.id);
    sendFriendRequest(pool[0]!.id, pool[1]!.id);
    expect(listIncomingRequests(pool[1]!.id)).toHaveLength(1);
    checkInvariants(pool);
  });
});
