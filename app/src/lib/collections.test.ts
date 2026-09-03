import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./auth";
import { getDb, resetDbForTests } from "./db";
import { defaultPageDocument, savePageDocument, setPublished, setVisibility } from "./pageDocument";
import { getCollectionBySlug, listCollectionPages, listCollections } from "./collections";

process.env.IOFUS_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

function publishPublicPage(handle: string, displayName: string) {
  const user = createUser(handle, "correct-horse-battery");
  savePageDocument(user.id, defaultPageDocument(displayName));
  setPublished(user.id, true);
  setVisibility(user.id, "public");
  return user;
}

describe("collections", () => {
  it("a fresh database is seeded with the two default collections on first open", () => {
    // db.ts's migration seeds this table automatically (getDb() -> openAndMigrate
    // -> seedCollections); there's no separate public seeding entry point.
    const list = listCollections();
    expect(list.map((c) => c.slug).sort()).toEqual(["freshly-painted", "quiet-corners"]);
  });

  it("getCollectionBySlug returns null for an unknown slug", () => {
    expect(getCollectionBySlug("does-not-exist")).toBeNull();
  });

  it("getCollectionBySlug returns a seeded collection by slug", () => {
    const found = getCollectionBySlug("freshly-painted");
    expect(found).not.toBeNull();
    expect(found!.title).toBe("Freshly Painted");
  });

  it("listCollectionPages returns an empty array for a collection with no pages", () => {
    const collection = getCollectionBySlug("freshly-painted")!;
    expect(listCollectionPages(collection.id)).toEqual([]);
  });

  it("listCollectionPages only returns published, public pages", () => {
    const collection = getCollectionBySlug("freshly-painted")!;
    const db = getDb();

    const published = publishPublicPage("published-user", "Published User");

    const draftUser = createUser("draft-user", "correct-horse-battery");
    savePageDocument(draftUser.id, defaultPageDocument("Draft User"));
    // never published or made public

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

  it("listCollectionPages orders by position ascending", () => {
    const collection = getCollectionBySlug("freshly-painted")!;
    const db = getDb();

    const userA = publishPublicPage("user-a", "User A");
    const userB = publishPublicPage("user-b", "User B");

    // Insert out of position order to prove the query sorts, not insertion order.
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

  it("listCollectionPages falls back to the handle when document_json is malformed", () => {
    const collection = getCollectionBySlug("freshly-painted")!;
    const db = getDb();

    const user = publishPublicPage("weird-doc-user", "Weird Doc User");
    // Corrupt the stored document to exercise the try/catch fallback.
    db.prepare("UPDATE page_documents SET document_json = ? WHERE user_id = ?").run("{not valid json", user.id);

    db.prepare(
      "INSERT INTO collection_pages (collection_id, user_id, position, added_at) VALUES (?, ?, 0, ?)",
    ).run(collection.id, user.id, new Date().toISOString());

    const pages = listCollectionPages(collection.id);
    expect(pages).toHaveLength(1);
    expect(pages[0]!.displayName).toBe("weird-doc-user");
  });
});
