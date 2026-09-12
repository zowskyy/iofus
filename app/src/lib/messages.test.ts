import { beforeEach, describe, expect, it } from "vitest";
import {
  ConversationAccessError,
  MessageError,
  countUnreadMessages,
  listConversations,
  listMessages,
  markConversationRead,
  sendMessage,
} from "./messages";
import { createUser } from "./auth";
import { blockUser } from "./friends";
import { RateLimitError } from "./rateLimit";
import { resetDbForTests } from "./db";

process.env.IOFUS_DB_PATH = ":memory:";

beforeEach(async () => {
  resetDbForTests();
});

/** Creates two default users for use in tests. */
async function twoUsers() {
  const a = await createUser("neonorchard", "correct-horse-battery");
  const b = await createUser("voidarcade", "correct-horse-battery");
  return { a, b };
}

describe("sendMessage", () => {
  it("rejects messaging yourself", async () => {
    const { a } = await twoUsers();
    expect(() => sendMessage(a.id, a.id, "hi me")).toThrow(MessageError);
  });

  it("rejects an empty message", async () => {
    const { a, b } = await twoUsers();
    expect(() => sendMessage(a.id, b.id, "   ")).toThrow(MessageError);
  });

  it("rejects a message over the length limit", async () => {
    const { a, b } = await twoUsers();
    expect(() => sendMessage(a.id, b.id, "x".repeat(4001))).toThrow(MessageError);
  });

  it("rejects messaging someone who blocked you", async () => {
    const { a, b } = await twoUsers();
    blockUser(b.id, a.id);
    expect(() => sendMessage(a.id, b.id, "hey")).toThrow(MessageError);
  });

  it("rejects messaging someone you blocked", async () => {
    const { a, b } = await twoUsers();
    blockUser(a.id, b.id);
    expect(() => sendMessage(a.id, b.id, "hey")).toThrow(MessageError);
  });

  it("creates a conversation on first contact", async () => {
    const { a, b } = await twoUsers();
    const msg = sendMessage(a.id, b.id, "hey there");
    expect(msg.body).toBe("hey there");
    expect(msg.senderId).toBe(a.id);
    expect(msg.readAt).toBeNull();
  });

  it("reuses the same conversation for both directions", async () => {
    const { a, b } = await twoUsers();
    const first = sendMessage(a.id, b.id, "hey");
    const second = sendMessage(b.id, a.id, "hey back");
    expect(second.conversationId).toBe(first.conversationId);
  });

  it("enforces a daily limit on NEW conversations only", async () => {
    const { a } = await twoUsers();
    for (let i = 0; i < 10; i++) {
      const other = await createUser(`friend${i}`, "correct-horse-battery");
      sendMessage(a.id, other.id, "hi");
    }
    const oneMore = await createUser("onemore", "correct-horse-battery");
    expect(() => sendMessage(a.id, oneMore.id, "hi")).toThrow(RateLimitError);
  });

  it("does not rate-limit further messages within an existing conversation", async () => {
    const { a, b } = await twoUsers();
    // Establish the a<->b conversation first, before exhausting a's daily
    // new-conversation limit on other people.
    sendMessage(a.id, b.id, "first message to b");
    for (let i = 0; i < 9; i++) {
      const other = await createUser(`friend${i}`, "correct-horse-battery");
      sendMessage(a.id, other.id, "hi");
    }
    // a's new-conversation limit (10/day) is now exhausted, but sending
    // another message within the already-established b thread must
    // still work — it's not a new conversation.
    expect(() => sendMessage(a.id, b.id, "second message to b")).not.toThrow();
  });
});

describe("listConversations", () => {
  it("is empty with no messages", async () => {
    const { a } = await twoUsers();
    expect(listConversations(a.id)).toEqual([]);
  });

  it("shows the conversation to both participants with the right other-party handle", async () => {
    const { a, b } = await twoUsers();
    sendMessage(a.id, b.id, "hey");
    const aView = listConversations(a.id);
    const bView = listConversations(b.id);
    expect(aView[0]!.otherHandle).toBe("voidarcade");
    expect(bView[0]!.otherHandle).toBe("neonorchard");
  });

  it("shows the last message preview", async () => {
    const { a, b } = await twoUsers();
    sendMessage(a.id, b.id, "first");
    sendMessage(b.id, a.id, "second");
    expect(listConversations(a.id)[0]!.lastMessagePreview).toBe("second");
  });

  it("counts unread messages sent by the other person only", async () => {
    const { a, b } = await twoUsers();
    sendMessage(a.id, b.id, "hey");
    sendMessage(a.id, b.id, "you there?");
    const bView = listConversations(b.id);
    expect(bView[0]!.unreadCount).toBe(2);
    const aView = listConversations(a.id);
    expect(aView[0]!.unreadCount).toBe(0); // a sent these, not unread for a
  });

  it("excludes a conversation once either side blocks the other", async () => {
    const { a, b } = await twoUsers();
    sendMessage(a.id, b.id, "hey");
    blockUser(b.id, a.id);
    expect(listConversations(a.id)).toEqual([]);
    expect(listConversations(b.id)).toEqual([]);
  });

  it("orders conversations by most recent activity", async () => {
    const { a } = await twoUsers();
    const c1 = await createUser("c1", "correct-horse-battery");
    const c2 = await createUser("c2", "correct-horse-battery");
    sendMessage(a.id, c1.id, "to c1");
    sendMessage(a.id, c2.id, "to c2");
    sendMessage(a.id, c1.id, "to c1 again");
    const list = listConversations(a.id);
    // c1 has the most recent message; c2 had only the earlier one
    const handles = list.map((c) => c.otherHandle);
    expect(handles.indexOf("c1")).toBeLessThan(handles.indexOf("c2"));
    expect(list.find((c) => c.otherHandle === "c1")?.lastMessagePreview).toBe("to c1 again");
  });
});

describe("countUnreadMessages", () => {
  it("sums unread across multiple conversations", async () => {
    const { a, b } = await twoUsers();
    const c = await createUser("thirdparty", "correct-horse-battery");
    sendMessage(b.id, a.id, "from b");
    sendMessage(c.id, a.id, "from c");
    expect(countUnreadMessages(a.id)).toBe(2);
  });

  it("does not count the viewer's own sent messages", async () => {
    const { a, b } = await twoUsers();
    sendMessage(a.id, b.id, "hi");
    expect(countUnreadMessages(a.id)).toBe(0);
  });

  it("drops to zero after marking read", async () => {
    const { a, b } = await twoUsers();
    sendMessage(b.id, a.id, "hi a");
    const [conv] = listConversations(a.id);
    markConversationRead(conv!.id, a.id);
    expect(countUnreadMessages(a.id)).toBe(0);
  });
});

describe("listMessages", () => {
  it("returns messages in chronological order", async () => {
    const { a, b } = await twoUsers();
    sendMessage(a.id, b.id, "one");
    sendMessage(b.id, a.id, "two");
    sendMessage(a.id, b.id, "three");
    const [conv] = listConversations(a.id);
    const msgs = listMessages(conv!.id, a.id);
    expect(msgs.map((m) => m.body)).toEqual(["one", "two", "three"]);
  });

  it("rejects a non-participant from reading the thread", async () => {
    const { a, b } = await twoUsers();
    const outsider = await createUser("outsider", "correct-horse-battery");
    sendMessage(a.id, b.id, "private");
    const [conv] = listConversations(a.id);
    expect(() => listMessages(conv!.id, outsider.id)).toThrow(ConversationAccessError);
  });

  it("rejects a nonexistent conversation id", async () => {
    const { a } = await twoUsers();
    expect(() => listMessages("does-not-exist", a.id)).toThrow(ConversationAccessError);
  });
});

describe("markConversationRead", () => {
  it("only marks messages from the other person, not the viewer's own", async () => {
    const { a, b } = await twoUsers();
    sendMessage(a.id, b.id, "from a");
    sendMessage(b.id, a.id, "from b");
    const [conv] = listConversations(a.id);
    markConversationRead(conv!.id, a.id);

    const msgs = listMessages(conv!.id, a.id);
    const fromA = msgs.find((m) => m.senderId === a.id)!;
    const fromB = msgs.find((m) => m.senderId === b.id)!;
    expect(fromA.readAt).toBeNull(); // a's own message, never "read" by a
    expect(fromB.readAt).not.toBeNull();
  });

  it("rejects a non-participant marking a conversation read", async () => {
    const { a, b } = await twoUsers();
    const outsider = await createUser("outsider2", "correct-horse-battery");
    sendMessage(a.id, b.id, "hi");
    const [conv] = listConversations(a.id);
    expect(() => markConversationRead(conv!.id, outsider.id)).toThrow(ConversationAccessError);
  });
});
