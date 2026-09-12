import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./auth";
import { resetDbForTests } from "./db";
import {
  ensureModeratorSeed,
  findUserForModeration,
  isModerator,
  listModeratorLogs,
  listOpenReports,
  ReportNotOpenError,
  reviewReport,
  setPlatformBlock,
} from "./moderation";
import { fileReport } from "./reports";

process.env.IOFUS_DB_PATH = ":memory:";
process.env.IOFUS_AUTO_MODERATOR_SEED = "true";

beforeEach(async () => {
  resetDbForTests();
});

describe("ensureModeratorSeed", () => {
  it("promotes the first user when no moderators exist", async () => {
    const a = await createUser("voidarcade", "correct-horse-battery");
    await createUser("neonorchard", "correct-horse-battery");
    expect(isModerator(a.id)).toBe(false);
    ensureModeratorSeed();
    expect(isModerator(a.id)).toBe(true);
  });

  it("does nothing when a moderator already exists", async () => {
    const a = await createUser("voidarcade", "correct-horse-battery");
    ensureModeratorSeed();
    const b = await createUser("neonorchard", "correct-horse-battery");
    ensureModeratorSeed();
    expect(isModerator(a.id)).toBe(true);
    expect(isModerator(b.id)).toBe(false);
  });

  it("promotes IOFUS_MODERATOR_HANDLE when set", async () => {
    delete process.env.IOFUS_AUTO_MODERATOR_SEED;
    await createUser("voidarcade", "correct-horse-battery");
    const target = await createUser("modtarget", "correct-horse-battery");
    process.env.IOFUS_MODERATOR_HANDLE = "modtarget";
    ensureModeratorSeed();
    expect(isModerator(target.id)).toBe(true);
    delete process.env.IOFUS_MODERATOR_HANDLE;
    process.env.IOFUS_AUTO_MODERATOR_SEED = "true";
  });

  it("skips auto-seed when neither env is set", async () => {
    delete process.env.IOFUS_AUTO_MODERATOR_SEED;
    delete process.env.IOFUS_MODERATOR_HANDLE;
    const a = await createUser("voidarcade", "correct-horse-battery");
    ensureModeratorSeed();
    expect(isModerator(a.id)).toBe(false);
    process.env.IOFUS_AUTO_MODERATOR_SEED = "true";
  });
});

describe("report queue", () => {
  it("lists open reports with reporter handles", async () => {
    const reporter = await createUser("voidarcade", "correct-horse-battery");
    await createUser("neonorchard", "correct-horse-battery");
    ensureModeratorSeed();
    fileReport(reporter.id, "neonorchard", "spam");

    const open = listOpenReports();
    expect(open).toHaveLength(1);
    expect(open[0]!.reportedHandle).toBe("neonorchard");
    expect(open[0]!.reporterHandle).toBe("voidarcade");
    expect(open[0]!.status).toBe("open");
  });

  it("reviewing a report removes it from the open queue and logs the action", async () => {
    const mod = await createUser("moduser", "correct-horse-battery");
    const reporter = await createUser("voidarcade", "correct-horse-battery");
    await createUser("neonorchard", "correct-horse-battery");
    ensureModeratorSeed();
    fileReport(reporter.id, "neonorchard", "harassment");

    const [report] = listOpenReports();
    reviewReport(report!.id, mod.id, "reviewed", "looked into it");

    expect(listOpenReports()).toHaveLength(0);
    const logs = listModeratorLogs();
    expect(logs.some((l) => l.action === "report_reviewed" && l.targetHandle === "neonorchard")).toBe(true);
  });

  it("a second review of the same report is rejected, not silently overwritten", async () => {
    const modA = await createUser("moda", "correct-horse-battery");
    const modB = await createUser("modb", "correct-horse-battery");
    const reporter = await createUser("voidarcade", "correct-horse-battery");
    await createUser("neonorchard", "correct-horse-battery");
    ensureModeratorSeed();
    fileReport(reporter.id, "neonorchard", "harassment");

    const [report] = listOpenReports();
    reviewReport(report!.id, modA.id, "dismissed", "not actionable");

    expect(() => reviewReport(report!.id, modB.id, "reviewed", "actually escalating")).toThrow(
      ReportNotOpenError,
    );

    // The first moderator's outcome must stand — not overwritten by the
    // second, contradictory call.
    const logs = listModeratorLogs();
    const reportLogs = logs.filter((l) => l.targetHandle === "neonorchard");
    expect(reportLogs).toHaveLength(1);
    expect(reportLogs[0]!.action).toBe("report_dismissed");
  });
});

describe("platform block", () => {
  it("blocks and unblocks a user by handle", async () => {
    const mod = await createUser("moduser", "correct-horse-battery");
    const target = await createUser("neonorchard", "correct-horse-battery");
    ensureModeratorSeed();

    setPlatformBlock(target.id, true, mod.id);
    expect(findUserForModeration("neonorchard")!.isBlockedPlatform).toBe(true);

    setPlatformBlock(target.id, false, mod.id);
    expect(findUserForModeration("neonorchard")!.isBlockedPlatform).toBe(false);
  });
});
