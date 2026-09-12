import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./auth";
import { resetDbForTests } from "./db";
import { fileReport, InvalidReportError, listOpenReports, listReports } from "./reports";
import { reviewReport } from "./moderation";

process.env.IOFUS_DB_PATH = ":memory:";

beforeEach(async () => {
  resetDbForTests();
});

const PASSWORD = "correct-horse-battery";

describe("fileReport", () => {
  it("records a report against the named handle", async () => {
    const reporter = await createUser("reporter", PASSWORD);
    fileReport(reporter.id, "baduser", "harassment");

    const reports = listOpenReports();
    expect(reports).toHaveLength(1);
    expect(reports[0]!.reportedHandle).toBe("baduser");
    expect(reports[0]!.reason).toBe("harassment");
    expect(reports[0]!.reporterHandle).toBe("reporter");
    expect(reports[0]!.status).toBe("open");
  });

  it("accepts an anonymous report", async () => {
    fileReport(null, "baduser", "spam");
    const reports = listOpenReports();
    expect(reports).toHaveLength(1);
    expect(reports[0]!.reporterHandle).toBeNull();
  });

  it("normalizes the reported handle so case cannot split a queue", async () => {
    // Two reports about the same account must land under one handle, or a
    // moderator reviewing "BadUser" would never see the ones filed against
    // "baduser".
    fileReport(null, "BadUser", "spam");
    fileReport(null, "baduser", "harassment");
    const handles = listOpenReports().map((r) => r.reportedHandle);
    expect(handles).toEqual(["baduser", "baduser"]);
  });

  it("rejects a reason outside the allowed set", async () => {
    expect(() => fileReport(null, "baduser", "i-dont-like-them")).toThrow(InvalidReportError);
    expect(() => fileReport(null, "baduser", "")).toThrow(InvalidReportError);
    expect(listOpenReports()).toHaveLength(0);
  });

  it("accepts every documented reason", async () => {
    for (const reason of ["harassment", "impersonation", "unsafe-content", "spam", "other"]) {
      expect(() => fileReport(null, "baduser", reason)).not.toThrow();
    }
    expect(listOpenReports()).toHaveLength(5);
  });

  it("does not let a reason smuggle SQL through", async () => {
    expect(() => fileReport(null, "baduser", "spam'; DROP TABLE reports;--")).toThrow(InvalidReportError);
    fileReport(null, "baduser", "spam");
    expect(listOpenReports()).toHaveLength(1);
  });
});

describe("listReports", () => {
  it("filters by status", async () => {
    const moderator = await createUser("moderator", PASSWORD);
    fileReport(null, "first", "spam");
    fileReport(null, "second", "harassment");

    const open = listOpenReports();
    expect(open).toHaveLength(2);

    reviewReport(open[0]!.id, moderator.id, "dismissed", "not actionable");

    expect(listOpenReports()).toHaveLength(1);
    expect(listReports({ status: "dismissed" })).toHaveLength(1);
    expect(listReports()).toHaveLength(2);
  });

  it("returns the open queue oldest first, so nothing starves", async () => {
    fileReport(null, "first", "spam");
    await new Promise((r) => setTimeout(r, 5));
    fileReport(null, "second", "spam");

    const open = listOpenReports();
    expect(open.map((r) => r.reportedHandle)).toEqual(["first", "second"]);
  });

  it("honours the limit", async () => {
    for (let i = 0; i < 5; i++) fileReport(null, `user${i}`, "spam");
    expect(listReports({ limit: 2 })).toHaveLength(2);
    expect(listOpenReports(3)).toHaveLength(3);
  });

  it("is empty when nothing has been reported", async () => {
    expect(listReports()).toEqual([]);
    expect(listOpenReports()).toEqual([]);
  });

  it("keeps a report readable after its reporter is deleted", async () => {
    // reporter_id is ON DELETE SET NULL, so the row must survive as an
    // anonymous report rather than disappearing from the moderation queue.
    const reporter = await createUser("reporter", PASSWORD);
    fileReport(reporter.id, "baduser", "harassment");

    const { getDb } = await import("./db");
    getDb().prepare("DELETE FROM users WHERE id = ?").run(reporter.id);

    const reports = listOpenReports();
    expect(reports).toHaveLength(1);
    expect(reports[0]!.reporterHandle).toBeNull();
  });
});
