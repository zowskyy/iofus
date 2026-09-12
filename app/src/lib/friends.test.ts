import { beforeEach, describe, expect, it } from "vitest";
import {
  acceptFriendRequest,
  blockUser,
  FriendLinkNotFoundError,
  FriendRequestError,
  listFriends,
  listIncomingRequests,
  removeFriendLink,
  sendFriendRequest,
  unblockUser,
} from "./friends";
import { createUser } from "./auth";
import { resetDbForTests } from "./db";

process.env.IOFUS_DB_PATH = ":memory:";

beforeEach(async () => {
  resetDbForTests();
});

async function twoUsers() {
  const a = await createUser("voidarcade", "correct-horse-battery");
  const b = await createUser("neonorchard", "correct-horse-battery");
  return { a, b };
}

describe("sendFriendRequest", () => {
  it("creates a pending request the addressee can see", async () => {
    const { a, b } = await twoUsers();
    sendFriendRequest(a.id, b.id);
    const incoming = listIncomingRequests(b.id);
    expect(incoming.length).toBe(1);
    expect(incoming[0]!.fromHandle).toBe("voidarcade");
  });

  it("does not appear in either user's friends list until accepted", async () => {
    const { a, b } = await twoUsers();
    sendFriendRequest(a.id, b.id);
    expect(listFriends(a.id)).toEqual([]);
    expect(listFriends(b.id)).toEqual([]);
  });

  it("rejects sending a request to yourself", async () => {
    const { a } = await twoUsers();
    expect(() => sendFriendRequest(a.id, a.id)).toThrow(FriendRequestError);
  });

  it("rejects a duplicate request from the same sender", async () => {
    const { a, b } = await twoUsers();
    sendFriendRequest(a.id, b.id);
    expect(() => sendFriendRequest(a.id, b.id)).toThrow(FriendRequestError);
  });

  it("rejects sending once already friends", async () => {
    const { a, b } = await twoUsers();
    sendFriendRequest(a.id, b.id);
    const [req] = listIncomingRequests(b.id);
    acceptFriendRequest(b.id, req!.id);
    expect(() => sendFriendRequest(a.id, b.id)).toThrow(FriendRequestError);
    expect(() => sendFriendRequest(b.id, a.id)).toThrow(FriendRequestError);
  });

  it("a mutual double-request (B requests A while A's request to B is pending) auto-accepts instead of creating a duplicate row", async () => {
    const { a, b } = await twoUsers();
    sendFriendRequest(a.id, b.id);
    sendFriendRequest(b.id, a.id);
    expect(listFriends(a.id).map((f) => f.handle)).toEqual(["neonorchard"]);
    expect(listFriends(b.id).map((f) => f.handle)).toEqual(["voidarcade"]);
  });

  it("a blocked user cannot send a friend request", async () => {
    const { a, b } = await twoUsers();
    blockUser(b.id, a.id);
    expect(() => sendFriendRequest(a.id, b.id)).toThrow(FriendRequestError);
  });

  it("the blocker also cannot send a request to the blocked user", async () => {
    const { a, b } = await twoUsers();
    blockUser(a.id, b.id);
    expect(() => sendFriendRequest(a.id, b.id)).toThrow(FriendRequestError);
  });
});

describe("acceptFriendRequest", () => {
  it("makes both users appear in each other's friends list", async () => {
    const { a, b } = await twoUsers();
    sendFriendRequest(a.id, b.id);
    const [req] = listIncomingRequests(b.id);
    acceptFriendRequest(b.id, req!.id);

    expect(listFriends(a.id).map((f) => f.handle)).toEqual(["neonorchard"]);
    expect(listFriends(b.id).map((f) => f.handle)).toEqual(["voidarcade"]);
  });

  it("only the addressee can accept, not the requester", async () => {
    const { a, b } = await twoUsers();
    sendFriendRequest(a.id, b.id);
    const [req] = listIncomingRequests(b.id);
    expect(() => acceptFriendRequest(a.id, req!.id)).toThrow(FriendRequestError);
  });

  it("accepting twice is a harmless no-op", async () => {
    const { a, b } = await twoUsers();
    sendFriendRequest(a.id, b.id);
    const [req] = listIncomingRequests(b.id);
    acceptFriendRequest(b.id, req!.id);
    expect(() => acceptFriendRequest(b.id, req!.id)).not.toThrow();
  });

  it("throws for a request id that doesn't exist", async () => {
    const { b } = await twoUsers();
    expect(() => acceptFriendRequest(b.id, "not-a-real-id")).toThrow(FriendLinkNotFoundError);
  });
});

describe("removeFriendLink (decline / unfriend)", () => {
  it("declining a pending request removes it, and a new request can be sent later", async () => {
    const { a, b } = await twoUsers();
    sendFriendRequest(a.id, b.id);
    const [req] = listIncomingRequests(b.id);
    removeFriendLink(b.id, req!.id);
    expect(listIncomingRequests(b.id)).toEqual([]);
    expect(() => sendFriendRequest(a.id, b.id)).not.toThrow();
  });

  it("unfriending an accepted link removes it from both sides", async () => {
    const { a, b } = await twoUsers();
    sendFriendRequest(a.id, b.id);
    const [req] = listIncomingRequests(b.id);
    acceptFriendRequest(b.id, req!.id);
    removeFriendLink(a.id, req!.id);
    expect(listFriends(a.id)).toEqual([]);
    expect(listFriends(b.id)).toEqual([]);
  });

  it("a third party cannot remove a link they're not part of", async () => {
    const { a, b } = await twoUsers();
    const c = await createUser("thirdparty", "correct-horse-battery");
    sendFriendRequest(a.id, b.id);
    const [req] = listIncomingRequests(b.id);
    expect(() => removeFriendLink(c.id, req!.id)).toThrow(FriendRequestError);
  });

  it("removing a nonexistent link is a harmless no-op", async () => {
    const { a } = await twoUsers();
    expect(() => removeFriendLink(a.id, "not-a-real-id")).not.toThrow();
  });
});

describe("blockUser", () => {
  it("tears down an existing accepted friendship", async () => {
    const { a, b } = await twoUsers();
    sendFriendRequest(a.id, b.id);
    const [req] = listIncomingRequests(b.id);
    acceptFriendRequest(b.id, req!.id);

    blockUser(b.id, a.id);
    expect(listFriends(a.id)).toEqual([]);
    expect(listFriends(b.id)).toEqual([]);
  });

  it("tears down a pending request in either direction", async () => {
    const { a, b } = await twoUsers();
    sendFriendRequest(a.id, b.id);
    blockUser(a.id, b.id);
    expect(listIncomingRequests(b.id)).toEqual([]);
  });

  it("rejects blocking yourself", async () => {
    const { a } = await twoUsers();
    expect(() => blockUser(a.id, a.id)).toThrow(FriendRequestError);
  });

  it("blocking twice does not error", async () => {
    const { a, b } = await twoUsers();
    blockUser(a.id, b.id);
    expect(() => blockUser(a.id, b.id)).not.toThrow();
  });

  it("unblocking allows a new friend request afterward", async () => {
    const { a, b } = await twoUsers();
    blockUser(a.id, b.id);
    unblockUser(a.id, b.id);
    expect(() => sendFriendRequest(b.id, a.id)).not.toThrow();
  });
});
