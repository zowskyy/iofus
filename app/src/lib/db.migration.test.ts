import { beforeEach, describe, expect, it } from "vitest";
import { clearDuplicateEmails, getDb, resetDbForTests } from "./db";

process.env.IOFUS_DB_PATH = ":memory:";

const INDEX = "idx_users_email_unique";
const CREATE_INDEX = `CREATE UNIQUE INDEX ${INDEX} ON users(LOWER(email)) WHERE email IS NOT NULL`;

beforeEach(async () => {
  resetDbForTests();
});

/**
 * Recreates the state of a database written before the unique index existed:
 * the constraint is absent and duplicate addresses are present, which
 * `setUserEmail`'s check-then-act could produce under concurrency.
 */
function legacyDatabaseWithDuplicates() {
  const db = getDb();
  db.exec(`DROP INDEX IF EXISTS ${INDEX}`);

  const insert = db.prepare(
    "INSERT INTO users (id, handle, handle_lower, password_hash, created_at, email) VALUES (?, ?, ?, ?, ?, ?)",
  );
  insert.run("older", "older", "older", "x", "2024-01-01T00:00:00.000Z", "shared@example.com");
  insert.run("newer", "newer", "newer", "x", "2024-06-01T00:00:00.000Z", "shared@example.com");
  insert.run("cased", "cased", "cased", "x", "2024-09-01T00:00:00.000Z", "SHARED@Example.com");
  insert.run("unique", "unique", "unique", "x", "2024-02-01T00:00:00.000Z", "solo@example.com");
  insert.run("noemail", "noemail", "noemail", "x", "2024-03-01T00:00:00.000Z", null);
  return db;
}

describe("clearDuplicateEmails", () => {
  it("is what makes the unique index addable to a legacy database", () => {
    const db = legacyDatabaseWithDuplicates();

    // Without it, migrate() would throw here. Since migrate() runs from
    // getDb(), that would fail every request and the deploy would never come
    // up -- a far worse outcome than losing a recovery address.
    expect(() => db.exec(CREATE_INDEX)).toThrow();

    clearDuplicateEmails(db);
    expect(() => db.exec(CREATE_INDEX)).not.toThrow();
  });

  it("keeps the earliest account's address and clears the later ones", () => {
    const db = legacyDatabaseWithDuplicates();
    clearDuplicateEmails(db);

    const emailOf = (id: string) =>
      (db.prepare("SELECT email FROM users WHERE id = ?").get(id) as { email: string | null }).email;

    expect(emailOf("older")).toBe("shared@example.com");
    expect(emailOf("newer")).toBeNull();
  });

  it("treats addresses differing only in case as duplicates", () => {
    const db = legacyDatabaseWithDuplicates();
    clearDuplicateEmails(db);

    const cased = db.prepare("SELECT email FROM users WHERE id = ?").get("cased") as {
      email: string | null;
    };
    expect(cased.email).toBeNull();
  });

  it("leaves unaffected accounts alone", () => {
    const db = legacyDatabaseWithDuplicates();
    clearDuplicateEmails(db);

    const solo = db.prepare("SELECT email FROM users WHERE id = ?").get("unique") as {
      email: string | null;
    };
    const none = db.prepare("SELECT email FROM users WHERE id = ?").get("noemail") as {
      email: string | null;
    };
    expect(solo.email).toBe("solo@example.com");
    expect(none.email).toBeNull();
  });

  it("reports how many it cleared, and is a no-op on a clean database", () => {
    const db = legacyDatabaseWithDuplicates();
    expect(clearDuplicateEmails(db)).toBe(2);
    expect(clearDuplicateEmails(db)).toBe(0);
  });

  it("does not clear every row when many accounts share one address", () => {
    const db = getDb();
    db.exec(`DROP INDEX IF EXISTS ${INDEX}`);
    const insert = db.prepare(
      "INSERT INTO users (id, handle, handle_lower, password_hash, created_at, email) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (let i = 0; i < 4; i++) {
      insert.run(`u${i}`, `u${i}`, `u${i}`, "x", `2024-01-0${i + 1}T00:00:00.000Z`, "many@example.com");
    }

    clearDuplicateEmails(db);

    const kept = db
      .prepare("SELECT COUNT(*) AS n FROM users WHERE email IS NOT NULL")
      .get() as { n: number };
    expect(kept.n).toBe(1);
    expect(() => db.exec(CREATE_INDEX)).not.toThrow();
  });

  it("breaks a created_at tie deterministically instead of clearing both", () => {
    const db = getDb();
    db.exec(`DROP INDEX IF EXISTS ${INDEX}`);
    const insert = db.prepare(
      "INSERT INTO users (id, handle, handle_lower, password_hash, created_at, email) VALUES (?, ?, ?, ?, ?, ?)",
    );
    const sameTime = "2024-01-01T00:00:00.000Z";
    insert.run("aaa", "aaa", "aaa", "x", sameTime, "tie@example.com");
    insert.run("bbb", "bbb", "bbb", "x", sameTime, "tie@example.com");

    clearDuplicateEmails(db);

    const kept = db
      .prepare("SELECT id FROM users WHERE email IS NOT NULL")
      .all() as { id: string }[];
    expect(kept.map((r) => r.id)).toEqual(["aaa"]);
  });
});
