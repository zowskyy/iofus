import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "./db";

process.env.IOFUS_DB_PATH = ":memory:";
import { setAmbientStatus, getAmbientStatus, getAmbientStatuses, AmbientStatusError, AMBIENT_STATUS_MAX_LEN } from "./ambientStatus";

function createUser(handle: string): string {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (id, handle, handle_lower, password_hash, created_at) VALUES (?, ?, ?, 'x', datetime('now'))",
  ).run(id, handle, handle.toLowerCase());
  return id;
}

beforeEach(() => {
  getDb().exec("DELETE FROM ambient_statuses; DELETE FROM users;");
});

describe("setAmbientStatus", () => {
  it("sets a status", () => {
    const u = createUser("alice");
    setAmbientStatus(u, "listening to a record");
    const s = getAmbientStatus(u);
    expect(s?.text).toBe("listening to a record");
  });

  it("clears status on empty string", () => {
    const u = createUser("alice2");
    setAmbientStatus(u, "something");
    setAmbientStatus(u, "");
    expect(getAmbientStatus(u)).toBeNull();
  });

  it("updates existing status", () => {
    const u = createUser("alice3");
    setAmbientStatus(u, "first");
    setAmbientStatus(u, "second");
    expect(getAmbientStatus(u)?.text).toBe("second");
  });

  it("throws when text exceeds max length", () => {
    const u = createUser("alice4");
    expect(() => setAmbientStatus(u, "x".repeat(AMBIENT_STATUS_MAX_LEN + 1))).toThrow(AmbientStatusError);
  });

  it("trims whitespace before storing", () => {
    const u = createUser("alice5");
    setAmbientStatus(u, "  making art  ");
    expect(getAmbientStatus(u)?.text).toBe("making art");
  });
});

describe("getAmbientStatus", () => {
  it("returns null when not set", () => {
    const u = createUser("bob");
    expect(getAmbientStatus(u)).toBeNull();
  });

  it("returns null for expired status", () => {
    const u = createUser("bob2");
    const db = getDb();
    const expired = Date.now() - 1000; // Unix milliseconds, already in the past
    db.prepare("INSERT INTO ambient_statuses (user_id, text, expires_at) VALUES (?, ?, ?)").run(u, "old status", expired);
    expect(getAmbientStatus(u)).toBeNull();
  });
});

describe("getAmbientStatuses", () => {
  it("returns statuses for multiple users", () => {
    const a = createUser("multi1");
    const b = createUser("multi2");
    setAmbientStatus(a, "reading");
    setAmbientStatus(b, "coding");
    const map = getAmbientStatuses([a, b]);
    expect(map.get(a)).toBe("reading");
    expect(map.get(b)).toBe("coding");
  });

  it("returns empty map for empty input", () => {
    expect(getAmbientStatuses([])).toEqual(new Map());
  });
});
