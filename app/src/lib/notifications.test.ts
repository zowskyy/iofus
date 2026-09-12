import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./auth";
import { resetDbForTests, getDb } from "./db";
import {
  countUnread,
  createNotification,
  listNotifications,
  markAllRead,
  markRead,
} from "./notifications";

process.env.IOFUS_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

describe("notifications", () => {
  it("creates and lists a notification with the given payload", () => {
    const user = createUser("recipient", "correct-horse-battery");
    createNotification(user.id, "friend_request", "someactor", { note: "hi" });

    const list = listNotifications(user.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.kind).toBe("friend_request");
    expect(list[0]!.actorHandle).toBe("someactor");
    expect(list[0]!.payload).toEqual({ note: "hi" });
    expect(list[0]!.readAt).toBeNull();
  });

  it("defaults payload to an empty object when omitted", () => {
    const user = createUser("recipient", "correct-horse-battery");
    createNotification(user.id, "guestbook_signed", "someactor");

    const list = listNotifications(user.id);
    expect(list[0]!.payload).toEqual({});
  });

  it("supports a null actorHandle", () => {
    const user = createUser("recipient", "correct-horse-battery");
    createNotification(user.id, "ring_join_accepted", null, { ringName: "test" });

    const list = listNotifications(user.id);
    expect(list[0]!.actorHandle).toBeNull();
  });

  it("falls back to an empty payload object when payload_json is malformed", () => {
    // rowToNotification's JSON.parse catch{} path — simulate a corrupt row
    // directly since createNotification always writes valid JSON.
    const user = createUser("recipient", "correct-horse-battery");
    const db = getDb();
    db.prepare(
      `INSERT INTO notifications (id, user_id, kind, actor_handle, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("bad-id", user.id, "friend_request", "actor", "{not valid json", new Date().toISOString());

    const list = listNotifications(user.id);
    expect(list[0]!.payload).toEqual({});
  });

  it("lists notifications newest first and respects the limit", () => {
    const user = createUser("recipient", "correct-horse-battery");
    createNotification(user.id, "friend_request", "a1");
    createNotification(user.id, "friend_accepted", "a2");
    createNotification(user.id, "ask_answered", "a3");

    const limited = listNotifications(user.id, 2);
    expect(limited).toHaveLength(2);
    // newest first: last-inserted (a3) should appear before earlier ones
    expect(limited[0]!.actorHandle).toBe("a3");
  });

  it("returns zero notifications for a user with none", () => {
    const user = createUser("lonely", "correct-horse-battery");
    expect(listNotifications(user.id)).toEqual([]);
    expect(countUnread(user.id)).toBe(0);
  });

  it("countUnread counts only unread notifications for that user", () => {
    const user = createUser("recipient", "correct-horse-battery");
    const other = createUser("other", "correct-horse-battery");
    createNotification(user.id, "friend_request", "a1");
    createNotification(user.id, "friend_accepted", "a2");
    createNotification(other.id, "ask_answered", "a3");

    expect(countUnread(user.id)).toBe(2);
    expect(countUnread(other.id)).toBe(1);
  });

  it("markAllRead marks every unread notification for that user as read, and only that user's", () => {
    const user = createUser("recipient", "correct-horse-battery");
    const other = createUser("other", "correct-horse-battery");
    createNotification(user.id, "friend_request", "a1");
    createNotification(user.id, "friend_accepted", "a2");
    createNotification(other.id, "ask_answered", "a3");

    markAllRead(user.id);

    expect(countUnread(user.id)).toBe(0);
    expect(countUnread(other.id)).toBe(1);
    for (const n of listNotifications(user.id)) {
      expect(n.readAt).not.toBeNull();
    }
  });

  it("markRead marks a single notification read", () => {
    const user = createUser("recipient", "correct-horse-battery");
    createNotification(user.id, "friend_request", "a1");
    createNotification(user.id, "friend_accepted", "a2");
    const [first, second] = listNotifications(user.id);

    markRead(second!.id, user.id);

    expect(countUnread(user.id)).toBe(1);
    const updated = listNotifications(user.id).find((n) => n.id === second!.id);
    expect(updated!.readAt).not.toBeNull();
    const stillUnread = listNotifications(user.id).find((n) => n.id === first!.id);
    expect(stillUnread!.readAt).toBeNull();
  });

  it("markRead silently no-ops when the notification belongs to a different user", () => {
    const owner = createUser("owner", "correct-horse-battery");
    const attacker = createUser("attacker", "correct-horse-battery");
    createNotification(owner.id, "friend_request", "a1");
    const [notif] = listNotifications(owner.id);

    // Not the owner — must not be able to mark someone else's notification read.
    markRead(notif!.id, attacker.id);

    expect(countUnread(owner.id)).toBe(1);
    const stillUnread = listNotifications(owner.id).find((n) => n.id === notif!.id);
    expect(stillUnread!.readAt).toBeNull();
  });

  it("markRead silently no-ops for a nonexistent notification id", () => {
    const user = createUser("recipient", "correct-horse-battery");
    expect(() => markRead("does-not-exist", user.id)).not.toThrow();
  });
});
