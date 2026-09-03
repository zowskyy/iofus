import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./auth";
import { getDb, resetDbForTests } from "./db";
import { sendFriendRequest, acceptFriendRequest, listIncomingRequests } from "./friends";
import { defaultPageDocument, savePageDocument, setPublished, setVisibility } from "./pageDocument";
import { signGuestbook } from "./guestbook";
import { getFriendActivityFeed } from "./activityFeed";

process.env.IOFUS_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

function befriend(a: { id: string }, b: { id: string }) {
  sendFriendRequest(a.id, b.id);
  const incoming = listIncomingRequests(b.id);
  const req = incoming.find((r) => r.fromUserId === a.id)!;
  acceptFriendRequest(b.id, req.id);
}

function publishPublicPage(handle: string, displayName: string) {
  const user = createUser(handle, "correct-horse-battery");
  savePageDocument(user.id, defaultPageDocument(displayName));
  setPublished(user.id, true);
  setVisibility(user.id, "public");
  return user;
}

describe("getFriendActivityFeed", () => {
  it("returns an empty feed for a user with no friends", () => {
    const user = createUser("lonely", "correct-horse-battery");
    expect(getFriendActivityFeed(user.id)).toEqual([]);
  });

  it("returns a page_decorated item for each published friend page", () => {
    const viewer = createUser("viewer", "correct-horse-battery");
    const friend = publishPublicPage("friendone", "Friend One");
    befriend(viewer, friend);

    const feed = getFriendActivityFeed(viewer.id);
    expect(feed).toHaveLength(1);
    expect(feed[0]!.kind).toBe("page_decorated");
    expect(feed[0]!.actorHandle).toBe("friendone");
    expect(feed[0]!.actorDisplayName).toBe("Friend One");
    expect(feed[0]!.href).toBe("/@friendone");
  });

  it("excludes friends who haven't published", () => {
    const viewer = createUser("viewer", "correct-horse-battery");
    const friend = createUser("unpublishedfriend", "correct-horse-battery");
    savePageDocument(friend.id, defaultPageDocument("Unpublished"));
    // never published
    befriend(viewer, friend);

    expect(getFriendActivityFeed(viewer.id)).toEqual([]);
  });

  it("includes blog posts and devlog entries, using the resolved display name", () => {
    const viewer = createUser("viewer", "correct-horse-battery");
    const friend = createUser("blogger", "correct-horse-battery");
    const doc = defaultPageDocument("Blogger Name");
    doc.blog = [
      { id: randomUUID(), title: "First post", slug: "first-post", body: "hello", publishedAt: "2024-01-01T00:00:00.000Z" },
      { id: randomUUID(), title: "Second post", slug: "second-post", body: "world", publishedAt: "2024-02-01T00:00:00.000Z" },
    ];
    doc.devlog = [
      { id: randomUUID(), date: "2024-03-01T00:00:00.000Z", body: "shipped a thing" },
    ];
    savePageDocument(friend.id, doc);
    setPublished(friend.id, true);
    setVisibility(friend.id, "public");
    befriend(viewer, friend);

    const feed = getFriendActivityFeed(viewer.id);
    const kinds = feed.map((f) => f.kind);
    expect(kinds).toContain("blog_post");
    expect(kinds).toContain("devlog_entry");
    expect(kinds).toContain("page_decorated");

    const blogItems = feed.filter((f) => f.kind === "blog_post");
    expect(blogItems.every((f) => f.actorDisplayName === "Blogger Name")).toBe(true);
    // Most recent blog post first among blog items (sorted before slicing to top 3).
    expect(blogItems[0]!.title).toBe("Second post");
  });

  it("caps blog posts and devlog entries at 3 each per friend", () => {
    const viewer = createUser("viewer", "correct-horse-battery");
    const friend = createUser("prolific", "correct-horse-battery");
    const doc = defaultPageDocument("Prolific Poster");
    doc.blog = Array.from({ length: 5 }, (_, i) => ({
      id: randomUUID(),
      title: `Post ${i}`,
      slug: `post-${i}`,
      body: "content",
      publishedAt: `2024-01-0${i + 1}T00:00:00.000Z`,
    }));
    savePageDocument(friend.id, doc);
    setPublished(friend.id, true);
    setVisibility(friend.id, "public");
    befriend(viewer, friend);

    const feed = getFriendActivityFeed(viewer.id);
    const blogItems = feed.filter((f) => f.kind === "blog_post");
    expect(blogItems).toHaveLength(3);
  });

  it("truncates long devlog bodies to 60 chars with an ellipsis in the title", () => {
    const viewer = createUser("viewer", "correct-horse-battery");
    const friend = createUser("longwriter", "correct-horse-battery");
    const doc = defaultPageDocument("Long Writer");
    const longBody = "x".repeat(100);
    doc.devlog = [{ id: randomUUID(), date: "2024-01-01T00:00:00.000Z", body: longBody }];
    savePageDocument(friend.id, doc);
    setPublished(friend.id, true);
    setVisibility(friend.id, "public");
    befriend(viewer, friend);

    const feed = getFriendActivityFeed(viewer.id);
    const devlogItem = feed.find((f) => f.kind === "devlog_entry")!;
    expect(devlogItem.title).toBe("x".repeat(60) + "…");
  });

  it("falls back to the handle and skips blog/devlog when document_json is malformed", () => {
    const viewer = createUser("viewer", "correct-horse-battery");
    const friend = publishPublicPage("corruptdoc", "Corrupt Doc");
    befriend(viewer, friend);

    const db = getDb();
    db.prepare("UPDATE page_documents SET document_json = ? WHERE user_id = ?").run("{not valid json", friend.id);

    const feed = getFriendActivityFeed(viewer.id);
    expect(feed).toHaveLength(1);
    expect(feed[0]!.kind).toBe("page_decorated");
    expect(feed[0]!.actorDisplayName).toBe("corruptdoc");
  });

  it("includes an approved guestbook entry authored by a friend on someone else's page, with the friend's resolved display name", () => {
    const viewer = createUser("viewer", "correct-horse-battery");
    const author = createUser("signerhandle", "correct-horse-battery");
    const doc = defaultPageDocument("Signer Display Name");
    savePageDocument(author.id, doc);
    setPublished(author.id, true);
    setVisibility(author.id, "public");
    befriend(viewer, author);

    const pageOwner = publishPublicPage("someoneelse", "Someone Else");
    signGuestbook(pageOwner.id, author.id, "signerhandle", "hi there", false);

    const feed = getFriendActivityFeed(viewer.id);
    const gbItem = feed.find((f) => f.kind === "guestbook_signed")!;
    expect(gbItem).toBeDefined();
    expect(gbItem.actorHandle).toBe("signerhandle");
    expect(gbItem.actorDisplayName).toBe("Signer Display Name");
    expect(gbItem.targetHandle).toBe("someoneelse");
  });

  it("excludes a pending (unapproved) guestbook entry", () => {
    const viewer = createUser("viewer", "correct-horse-battery");
    const author = publishPublicPage("pendingsigner", "Pending Signer");
    befriend(viewer, author);
    const pageOwner = publishPublicPage("modpage", "Mod Page");

    signGuestbook(pageOwner.id, author.id, "pendingsigner", "awaiting approval", true);

    const feed = getFriendActivityFeed(viewer.id);
    expect(feed.some((f) => f.kind === "guestbook_signed")).toBe(false);
  });

  it("excludes a guestbook entry whose author handle isn't in the viewer's friend set", () => {
    const viewer = createUser("viewer", "correct-horse-battery");
    const friend = publishPublicPage("realfriend", "Real Friend");
    befriend(viewer, friend);

    const stranger = createUser("stranger", "correct-horse-battery");
    const pageOwner = publishPublicPage("targetpage", "Target Page");
    signGuestbook(pageOwner.id, stranger.id, "stranger", "hi", false);

    const feed = getFriendActivityFeed(viewer.id);
    expect(feed.some((f) => f.kind === "guestbook_signed")).toBe(false);
  });

  it("sorts the combined feed newest first and respects the limit", () => {
    const viewer = createUser("viewer", "correct-horse-battery");
    const friend = createUser("timelinefriend", "correct-horse-battery");
    const doc = defaultPageDocument("Timeline Friend");
    doc.blog = [
      { id: randomUUID(), title: "Old post", slug: "old-post", body: "b", publishedAt: "2020-01-01T00:00:00.000Z" },
      { id: randomUUID(), title: "New post", slug: "new-post", body: "b", publishedAt: "2030-01-01T00:00:00.000Z" },
    ];
    savePageDocument(friend.id, doc);
    setPublished(friend.id, true);
    setVisibility(friend.id, "public");
    befriend(viewer, friend);

    const feed = getFriendActivityFeed(viewer.id, 2);
    expect(feed).toHaveLength(2);
    expect(feed[0]!.title).toBe("New post");
  });
});
