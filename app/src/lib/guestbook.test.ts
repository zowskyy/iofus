import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "./db";
import {
  signGuestbook,
  moderateGuestbookEntry,
  deleteGuestbookEntry,
  listApprovedGuestbookEntries,
  listPendingGuestbookEntries,
  countPendingGuestbookEntries,
  GuestbookError,
} from "./guestbook";

function createUser(handle: string): string {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (id, handle, handle_lower, password_hash, created_at) VALUES (?, ?, ?, 'x', datetime('now'))",
  ).run(id, handle, handle.toLowerCase());
  return id;
}

function createBlock(blockerId: string, blockedId: string): void {
  getDb()
    .prepare("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, datetime('now'))")
    .run(blockerId, blockedId);
}

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM guestbook_entries; DELETE FROM blocks; DELETE FROM users;");
});

describe("signGuestbook", () => {
  it("inserts a pending entry when requireApproval is true", () => {
    const owner = createUser("owner");
    const author = createUser("author");
    signGuestbook(owner, author, "author", "Hello!", true);
    const entries = listPendingGuestbookEntries(owner);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("pending");
    expect(entries[0].message).toBe("Hello!");
  });

  it("inserts an approved entry when requireApproval is false", () => {
    const owner = createUser("owner2");
    signGuestbook(owner, null, "anon", "Hi", false);
    const entries = listApprovedGuestbookEntries(owner);
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe("approved");
  });

  it("rejects a blank message", () => {
    const owner = createUser("owner3");
    expect(() => signGuestbook(owner, null, null, "   ", false)).toThrow(GuestbookError);
  });

  it("rejects a message over 500 chars", () => {
    const owner = createUser("owner4");
    expect(() => signGuestbook(owner, null, null, "x".repeat(501), false)).toThrow(GuestbookError);
  });

  it("rejects signing when the author has a block relationship with the owner", () => {
    const owner = createUser("owner5");
    const author = createUser("blocked");
    createBlock(owner, author);
    expect(() => signGuestbook(owner, author, "blocked", "Hi", false)).toThrow(GuestbookError);
  });

  it("rejects signing when the author blocked the owner", () => {
    const owner = createUser("owner6");
    const author = createUser("blocker");
    createBlock(author, owner);
    expect(() => signGuestbook(owner, author, "blocker", "Hi", false)).toThrow(GuestbookError);
  });
});

describe("moderateGuestbookEntry", () => {
  it("approves a pending entry", () => {
    const owner = createUser("mod-owner");
    signGuestbook(owner, null, "a", "hi", true);
    const [entry] = listPendingGuestbookEntries(owner);
    moderateGuestbookEntry(owner, entry.id, true);
    expect(listApprovedGuestbookEntries(owner)).toHaveLength(1);
    expect(listPendingGuestbookEntries(owner)).toHaveLength(0);
  });

  it("rejects a pending entry", () => {
    const owner = createUser("mod-owner2");
    signGuestbook(owner, null, "a", "hi", true);
    const [entry] = listPendingGuestbookEntries(owner);
    moderateGuestbookEntry(owner, entry.id, false);
    expect(listApprovedGuestbookEntries(owner)).toHaveLength(0);
    expect(listPendingGuestbookEntries(owner)).toHaveLength(0);
  });

  it("throws when entry does not belong to pageOwner", () => {
    const owner = createUser("mod-owner3");
    const other = createUser("other-mod");
    signGuestbook(owner, null, "a", "hi", true);
    const [entry] = listPendingGuestbookEntries(owner);
    expect(() => moderateGuestbookEntry(other, entry.id, true)).toThrow(GuestbookError);
  });

  it("throws when entry has already been moderated", () => {
    const owner = createUser("mod-owner4");
    signGuestbook(owner, null, "a", "hi", true);
    const [entry] = listPendingGuestbookEntries(owner);
    moderateGuestbookEntry(owner, entry.id, true);
    expect(() => moderateGuestbookEntry(owner, entry.id, false)).toThrow(GuestbookError);
  });
});

describe("deleteGuestbookEntry", () => {
  it("deletes an entry owned by the page owner", () => {
    const owner = createUser("del-owner");
    signGuestbook(owner, null, "a", "bye", false);
    const [entry] = listApprovedGuestbookEntries(owner);
    deleteGuestbookEntry(owner, entry.id);
    expect(listApprovedGuestbookEntries(owner)).toHaveLength(0);
  });

  it("is a no-op for an entry that belongs to another owner", () => {
    const owner = createUser("del-owner2");
    const other = createUser("del-other");
    signGuestbook(owner, null, "a", "hi", false);
    const [entry] = listApprovedGuestbookEntries(owner);
    deleteGuestbookEntry(other, entry.id);
    expect(listApprovedGuestbookEntries(owner)).toHaveLength(1);
  });
});

describe("countPendingGuestbookEntries", () => {
  it("returns the correct pending count", () => {
    const owner = createUser("count-owner");
    signGuestbook(owner, null, "a", "one", true);
    signGuestbook(owner, null, "b", "two", true);
    signGuestbook(owner, null, "c", "three", false);
    expect(countPendingGuestbookEntries(owner)).toBe(2);
  });
});
