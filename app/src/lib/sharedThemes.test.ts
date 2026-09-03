import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listSharedThemes, publishTheme } from "./sharedThemes";
import { createUser } from "./auth";
import { defaultPageDocument, savePageDocument } from "./pageDocument";
import { getDb, resetDbForTests } from "./db";

process.env.IOFUS_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

describe("sharedThemes", () => {
  it("seeds starter themes when gallery is empty", () => {
    const themes = listSharedThemes();
    expect(themes.length).toBeGreaterThanOrEqual(8);
    expect(themes.some((t) => t.name === "Y2K Chrome")).toBe(true);
  });

  it("publishes a user theme with attribution", () => {
    const user = createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("Void Arcade"));
    const id = publishTheme(user.id, user.handle, "My Look", "A cozy corner", ["soft"], defaultPageDocument("Void").theme);
    const themes = listSharedThemes();
    expect(themes.some((t) => t.id === id && t.creatorHandle === "voidarcade")).toBe(true);
  });

  // ensureSeedSharedThemes() (a second, unreachable-in-production copy of
  // this seeding logic, only ever called by its own test) was removed —
  // db.ts's migrate() is the one real seed path. This exercises *that*
  // path's idempotency directly against a real on-disk file (":memory:",
  // used by every other test in this file, doesn't persist across a
  // close/reopen, so it can't actually prove idempotency — a fresh empty
  // memory db re-seeding once looks identical to correct de-duplication).
  it("the real seed path (db.ts migrate()) is idempotent across repeated opens of the same file", () => {
    const dir = mkdtempSync(join(tmpdir(), "iofus-seed-idem-"));
    const dbPath = join(dir, "test.db");
    const originalPath = process.env.IOFUS_DB_PATH;
    try {
      process.env.IOFUS_DB_PATH = dbPath;
      resetDbForTests();
      getDb(); // first open: seeds the starter themes
      const first = listSharedThemes().length;
      expect(first).toBeGreaterThanOrEqual(8);

      resetDbForTests(); // close, discard the in-memory singleton — the file on disk is untouched
      getDb(); // second open of the *same file*: migrate() must see the rows already exist and skip reseeding
      expect(listSharedThemes().length).toBe(first);
    } finally {
      resetDbForTests();
      process.env.IOFUS_DB_PATH = originalPath;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
