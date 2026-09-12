import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUser } from "./auth";
import { getDb, resetDbForTests } from "./db";
import { ALLOWED_STAMPS } from "./stampsShared";
import { addStamp, clearStamps, countStamps, listStamps, StampError } from "./stamps";

process.env.IOFUS_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
  vi.useRealTimers();
});

describe("stamps", () => {
  it("adds a stamp from a signed-in user", () => {
    const owner = createUser("pageowner", "correct-horse-battery");
    const stamper = createUser("stamper", "correct-horse-battery");

    addStamp(owner.id, stamper.id, stamper.handle, ALLOWED_STAMPS[0]!);

    const stamps = listStamps(owner.id);
    expect(stamps).toHaveLength(1);
    expect(stamps[0]!.stamperHandle).toBe("stamper");
    expect(stamps[0]!.stampEmoji).toBe(ALLOWED_STAMPS[0]);
    expect(countStamps(owner.id)).toBe(1);
  });

  it("rejects an emoji that isn't in the allowed list", () => {
    const owner = createUser("pageowner", "correct-horse-battery");
    const stamper = createUser("stamper", "correct-horse-battery");

    expect(() => addStamp(owner.id, stamper.id, stamper.handle, "🚫")).toThrow(StampError);
    expect(countStamps(owner.id)).toBe(0);
  });

  it("rejects a stamp with no stamperId (must be signed in)", () => {
    const owner = createUser("pageowner", "correct-horse-battery");
    expect(() => addStamp(owner.id, null, null, ALLOWED_STAMPS[0]!)).toThrow(StampError);
    expect(countStamps(owner.id)).toBe(0);
  });

  it("rejects a second stamp from the same user on the same page within 24h", () => {
    const owner = createUser("pageowner", "correct-horse-battery");
    const stamper = createUser("stamper", "correct-horse-battery");

    addStamp(owner.id, stamper.id, stamper.handle, ALLOWED_STAMPS[0]!);
    expect(() => addStamp(owner.id, stamper.id, stamper.handle, ALLOWED_STAMPS[1]!)).toThrow(StampError);
    expect(countStamps(owner.id)).toBe(1);
  });

  it("allows a stamp again once the prior one is more than 24h old", () => {
    const owner = createUser("pageowner", "correct-horse-battery");
    const stamper = createUser("stamper", "correct-horse-battery");
    addStamp(owner.id, stamper.id, stamper.handle, ALLOWED_STAMPS[0]!);

    // Backdate the existing stamp past the 24h window instead of mocking
    // Date.now (addStamp computes `since` from the real clock internally).
    const db = getDb();
    const oldTimestamp = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    db.prepare("UPDATE page_stamps SET created_at = ? WHERE page_owner_id = ? AND stamper_id = ?").run(
      oldTimestamp,
      owner.id,
      stamper.id,
    );

    expect(() => addStamp(owner.id, stamper.id, stamper.handle, ALLOWED_STAMPS[1]!)).not.toThrow();
    expect(countStamps(owner.id)).toBe(2);
  });

  it("allows different users to stamp the same page independently", () => {
    const owner = createUser("pageowner", "correct-horse-battery");
    const stamperA = createUser("stampera", "correct-horse-battery");
    const stamperB = createUser("stamperb", "correct-horse-battery");

    addStamp(owner.id, stamperA.id, stamperA.handle, ALLOWED_STAMPS[0]!);
    addStamp(owner.id, stamperB.id, stamperB.handle, ALLOWED_STAMPS[1]!);

    expect(countStamps(owner.id)).toBe(2);
  });

  it("listStamps returns newest first and respects the limit", () => {
    const owner = createUser("pageowner", "correct-horse-battery");
    const db = getDb();
    // Insert directly with distinct timestamps to avoid the 24h same-user cap.
    for (let i = 0; i < 3; i++) {
      db.prepare(
        `INSERT INTO page_stamps (id, page_owner_id, stamper_id, stamper_handle, stamp_emoji, created_at)
         VALUES (?, ?, NULL, ?, ?, ?)`,
      ).run(`stamp-${i}`, owner.id, `anon-${i}`, ALLOWED_STAMPS[i]!, new Date(2024, 0, i + 1).toISOString());
    }

    const limited = listStamps(owner.id, 2);
    expect(limited).toHaveLength(2);
    expect(limited[0]!.id).toBe("stamp-2");
  });

  it("listStamps and countStamps return empty/zero for a page with no stamps", () => {
    const owner = createUser("pageowner", "correct-horse-battery");
    expect(listStamps(owner.id)).toEqual([]);
    expect(countStamps(owner.id)).toBe(0);
  });

  it("clearStamps deletes all stamps for that page only", () => {
    const owner = createUser("pageowner", "correct-horse-battery");
    const other = createUser("otherowner", "correct-horse-battery");
    const stamper = createUser("stamper", "correct-horse-battery");

    addStamp(owner.id, stamper.id, stamper.handle, ALLOWED_STAMPS[0]!);
    addStamp(other.id, stamper.id, stamper.handle, ALLOWED_STAMPS[0]!);

    clearStamps(owner.id);

    expect(countStamps(owner.id)).toBe(0);
    expect(countStamps(other.id)).toBe(1);
  });
});
