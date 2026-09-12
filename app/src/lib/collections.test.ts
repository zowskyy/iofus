import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./auth";
import { getDb, resetDbForTests } from "./db";
import { getCollectionBySlug, listCollectionPages, listCollections } from "./collections";
import { defaultPageDocument, savePageDocument, setHiddenFromDiscovery, setPublished, setVisibility } from "./pageDocument";
import { ensureModeratorSeed, setPlatformBlock } from "./moderation";

process.env.IOFUS_DB_PATH = ":memory:";
process.env.IOFUS_AUTO_MODERATOR_SEED = "true";

beforeEach(async () => {
  resetDbForTests();
});

async function publishPublicPage(handle: string, displayName: string) {
  const user = await createUser(handle, "correct-horse-battery");
  savePageDocument(user.id, defaultPageDocument(displayName));
  setPublished(user.id, true);
  setVisibility(user.id, "public");
  return user;
}

describe("collections", () => {
  it("a fresh database is seeded with the two default collections on first open", async () => {
    const list = listCollections();
    expect(list.map((c) => c.slug).sort()).toEqual(["freshly-painted", "quiet-corners"]);
  });

  it("getCollectionBySlug returns null for an unknown slug", async () => {
    expect(getCollectionBySlug("does-not-exist")).toBeNull();
  });

  it("getCollectionBySlug returns a seeded collection by slug", async () => {
    const found = getCollectionBySlug("freshly-painted");
    expect(found).not.toBeNull();
    expect(found!.title).toBe("Freshly Painted");
  });

  it("listCollectionPages returns an empty array for a collection with no pages", async () => {
    const collection = getCollectionBySlug("freshly-painted")!;
    expect(listCollectionPages(collection.id)).toEqual([]);
  });

  it("listCollectionPages only returns published, public pages", async () => {
    const collection = getCollectionBySlug("freshly-painted")!;
    const db = getDb();

    const published = await publishPublicPage("published-user", "Published User");

    const draftUser = await createUser("draft-user", "correct-horse-battery");
    savePageDocument(draftUser.id, defaultPageDocument("Draft User"));

    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO collection_pages (collection_id, user_id, position, added_at) VALUES (?, ?, 0, ?)",
    ).run(collection.id, published.id, now);
    db.prepare(
      "INSERT INTO collection_pages (collection_id, user_id, position, added_at) VALUES (?, ?, 1, ?)",
    ).run(collection.id, draftUser.id, now);

    const pages = listCollectionPages(collection.id);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.handle).toBe("published-user");
  });

  it("listCollectionPages orders by position ascending", async () => {
    const collection = getCollectionBySlug("freshly-painted")!;
    const db = getDb();

    const userA = await publishPublicPage("user-a", "User A");
    const userB = await publishPublicPage("user-b", "User B");

    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO collection_pages (collection_id, user_id, position, added_at) VALUES (?, ?, 1, ?)",
    ).run(collection.id, userA.id, now);
    db.prepare(
      "INSERT INTO collection_pages (collection_id, user_id, position, added_at) VALUES (?, ?, 0, ?)",
    ).run(collection.id, userB.id, now);

    const pages = listCollectionPages(collection.id);
    expect(pages.map((p) => p.handle)).toEqual(["user-b", "user-a"]);
  });

  it("listCollectionPages falls back to the handle when document_json is malformed", async () => {
    const collection = getCollectionBySlug("freshly-painted")!;
    const db = getDb();

    const user = await publishPublicPage("weird-doc-user", "Weird Doc User");
    db.prepare("UPDATE page_documents SET document_json = ? WHERE user_id = ?").run("{not valid json", user.id);

    db.prepare(
      "INSERT INTO collection_pages (collection_id, user_id, position, added_at) VALUES (?, ?, 0, ?)",
    ).run(collection.id, user.id, new Date().toISOString());

    const pages = listCollectionPages(collection.id);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.displayName).toBe("weird-doc-user");
  });

  it("excludes a page the owner has hidden from discovery", async () => {
    const collection = getCollectionBySlug("freshly-painted")!;
    const user = await publishPublicPage("voidarcade", "Void Arcade");
    setHiddenFromDiscovery(user.id, true);
    getDb()
      .prepare("INSERT INTO collection_pages (collection_id, user_id, position, added_at) VALUES (?, ?, 0, ?)")
      .run(collection.id, user.id, new Date().toISOString());

    expect(listCollectionPages(collection.id).map((p) => p.handle)).not.toContain("voidarcade");
  });

  it("excludes a page whose owner has been platform-blocked by a moderator", async () => {
    const collection = getCollectionBySlug("freshly-painted")!;
    const mod = await createUser("moduser", "correct-horse-battery");
    const user = await publishPublicPage("voidarcade", "Void Arcade");
    getDb()
      .prepare("INSERT INTO collection_pages (collection_id, user_id, position, added_at) VALUES (?, ?, 0, ?)")
      .run(collection.id, user.id, new Date().toISOString());
    ensureModeratorSeed();
    setPlatformBlock(user.id, true, mod.id);

    expect(listCollectionPages(collection.id).map((p) => p.handle)).not.toContain("voidarcade");
  });
});
