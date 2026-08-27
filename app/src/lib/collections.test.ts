import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { listCollectionPages } from "./collections";
import { createUser } from "./auth";
import { defaultPageDocument, savePageDocument, setHiddenFromDiscovery, setPublished, setVisibility } from "./pageDocument";
import { getDb, resetDbForTests } from "./db";
import { setPlatformBlock, ensureModeratorSeed } from "./moderation";

process.env.IOFUS_DB_PATH = ":memory:";
process.env.IOFUS_AUTO_MODERATOR_SEED = "true";

beforeEach(() => {
  resetDbForTests();
});

function makeCollection(): string {
  const id = randomUUID();
  getDb()
    .prepare("INSERT INTO collections (id, slug, title, description, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, "test-collection", "Test Collection", "", new Date().toISOString());
  return id;
}

function addToCollection(collectionId: string, userId: string): void {
  getDb()
    .prepare("INSERT INTO collection_pages (collection_id, user_id, position, added_at) VALUES (?, ?, 0, ?)")
    .run(collectionId, userId, new Date().toISOString());
}

describe("listCollectionPages", () => {
  it("includes a published public page", () => {
    const collectionId = makeCollection();
    const user = createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("Void Arcade"));
    setPublished(user.id, true);
    setVisibility(user.id, "public");
    addToCollection(collectionId, user.id);

    expect(listCollectionPages(collectionId).map((p) => p.handle)).toContain("voidarcade");
  });

  it("excludes a page the owner has hidden from discovery", () => {
    const collectionId = makeCollection();
    const user = createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("Void Arcade"));
    setPublished(user.id, true);
    setVisibility(user.id, "public");
    setHiddenFromDiscovery(user.id, true);
    addToCollection(collectionId, user.id);

    expect(listCollectionPages(collectionId).map((p) => p.handle)).not.toContain("voidarcade");
  });

  it("excludes a page whose owner has been platform-blocked by a moderator", () => {
    const mod = createUser("moduser", "correct-horse-battery");
    const collectionId = makeCollection();
    const user = createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("Void Arcade"));
    setPublished(user.id, true);
    setVisibility(user.id, "public");
    addToCollection(collectionId, user.id);
    ensureModeratorSeed();
    setPlatformBlock(user.id, true, mod.id);

    expect(listCollectionPages(collectionId).map((p) => p.handle)).not.toContain("voidarcade");
  });
});
