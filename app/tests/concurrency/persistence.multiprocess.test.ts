import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createUser } from "../../src/lib/auth";
import { resetDbForTests } from "../../src/lib/db";

// Real multi-process persistence concurrency tests. Each case spawns
// several genuine, separate `node` processes (via tsx, so they can import
// the actual TS source directly — never a reimplementation) that all open
// the SAME on-disk SQLite file and hammer it concurrently. This exercises
// real OS-level file locking and SQLite's actual WAL/busy behavior, which
// node:sqlite's fully synchronous API makes impossible to race within a
// single process (every statement runs to completion before the event
// loop can interleave another one) — a gap the previous passes' in-process
// "concurrency" tests could not close.

const execFileAsync = promisify(execFile);
const WORKER = path.join(__dirname, "worker.ts");
const TSX = path.join(__dirname, "..", "..", "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "iofus-mp-"));
});

afterAll(async () => {
  // Verified even on failure: afterAll always runs regardless of which
  // `it` blocks failed above it.
  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

function dbPathFor(name: string): string {
  return path.join(tmpDir, `${name}.db`);
}

function runWorker(dbPath: string, args: string[]): Promise<{ op: string; result: { ok: boolean; error?: string; value?: unknown } }[]> {
  // tsx's Windows entry point is a .cmd wrapper, which node's execFile
  // can't exec directly without going through a shell.
  return execFileAsync(TSX, [WORKER, dbPath, ...args], {
    env: { ...process.env },
    maxBuffer: 64 * 1024 * 1024,
    shell: true,
  }).then(({ stdout }) => JSON.parse(stdout.trim().split("\n").pop()!));
}

describe("multi-process persistence concurrency", () => {
  it(
    "concurrent first-boot migration from separate processes never corrupts the schema or loses a signup",
    async () => {
      const dbPath = dbPathFor("migrate-race");
      // Five processes race to be the first to open (and therefore
      // migrate()) a brand-new database file, each also signing up its own
      // distinct users in the same run — exercising exactly the race
      // db.ts's addColumnIfMissing() comment describes but the prior
      // passes never actually triggered with real separate processes.
      const procCount = 5;
      const perProc = 4;
      const runs = await Promise.all(
        Array.from({ length: procCount }, (_, i) => runWorker(dbPath, ["migrate-and-signup", `proc${i}u`, String(perProc)])),
      );

      const flat = runs.flat();
      const failures = flat.filter((r) => !r.result.ok);
      expect(failures, `unexpected createUser failures during migration race: ${JSON.stringify(failures)}`).toHaveLength(0);
      expect(flat).toHaveLength(procCount * perProc);

      // Schema must be valid and complete after the race — every
      // incremental column from db.ts's migrate() must exist, and the
      // table must be queryable (a corrupted/partial migration would
      // throw here or return the wrong row count).
      const db = new DatabaseSync(dbPath, { open: true });
      try {
        const cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
        const colNames = new Set(cols.map((c) => c.name));
        for (const expected of ["is_moderator", "reachable_for_asks"]) {
          expect(colNames.has(expected), `column ${expected} missing after concurrent migration`).toBe(true);
        }
        const count = db.prepare("SELECT COUNT(*) as n FROM users").get() as { n: number };
        expect(count.n).toBe(procCount * perProc);
        // No two users share a handle_lower despite five processes racing
        // to insert concurrently.
        const dupes = db
          .prepare("SELECT handle_lower, COUNT(*) as n FROM users GROUP BY handle_lower HAVING n > 1")
          .all();
        expect(dupes).toEqual([]);
      } finally {
        db.close();
      }
    },
    60_000,
  );

  it(
    "concurrent checkRateLimit calls from separate processes never allow more than maxCount through (real cross-process atomicity)",
    async () => {
      const dbPath = dbPathFor("rate-limit-race");
      const procCount = 6;
      const attemptsEach = 5;
      const maxCount = 10; // strictly less than procCount * attemptsEach (30), so this only passes if the check+increment is truly atomic across processes
      const key = "shared-key";

      const runs = await Promise.all(
        Array.from({ length: procCount }, () => runWorker(dbPath, ["rate-limit-race", key, String(maxCount), String(attemptsEach)])),
      );
      const flat = runs.flat();
      const allowed = flat.filter((r) => r.result.ok);
      const rejected = flat.filter((r) => !r.result.ok);

      expect(flat).toHaveLength(procCount * attemptsEach);
      // The core invariant: no more than maxCount requests were ever let
      // through, no matter how many processes raced for the same key —
      // this is the real proof BEGIN IMMEDIATE serializes across
      // processes, not just within one.
      expect(allowed.length, `allowed ${allowed.length} requests through a maxCount=${maxCount} limit under real cross-process contention`).toBeLessThanOrEqual(maxCount);
      // Every rejection must be the typed RateLimitError, not a raw
      // SQLITE_BUSY / crash leaking through unhandled.
      for (const r of rejected) {
        expect(r.result.error).toMatch(/RateLimitError/);
      }

      const db = new DatabaseSync(dbPath, { open: true });
      try {
        const row = db.prepare("SELECT count FROM rate_limits WHERE key = ?").get(key) as { count: number } | undefined;
        expect(row, "rate_limits row missing after concurrent writers").toBeDefined();
        expect(row!.count).toBe(allowed.length);
      } finally {
        db.close();
      }
    },
    60_000,
  );

  it(
    "a block racing against a friend-request/accept loop never leaves both an accepted friendship and a block coexisting",
    async () => {
      const dbPath = dbPathFor("block-vs-friend-race");
      // Seed two users up front via a normal (single-process) call so the
      // worker processes only race the relationship operations themselves.
      process.env.IOFUS_DB_PATH = dbPath;
      resetDbForTests();
      const a = createUser("racerA", "correct-horse-battery");
      const b = createUser("racerB", "correct-horse-battery");
      resetDbForTests(); // release this process's handle before the child processes open the same file

      const attempts = 15;
      const [friendRun, blockRun] = await Promise.all([
        runWorker(dbPath, ["block-vs-friend-race", "friend", a.id, b.id, String(attempts)]),
        runWorker(dbPath, ["block-vs-friend-race", "block", a.id, b.id, String(attempts)]),
      ]);

      // Both processes are allowed to hit domain-rule rejections (that's
      // exactly what enforces the invariant) — what must never happen is a
      // crash, an unhandled non-domain error, or the invariant itself.
      for (const r of [...friendRun, ...blockRun]) {
        if (!r.result.ok) {
          expect(r.result.error, `unexpected non-domain error: ${r.result.error}`).toMatch(/FriendRequestError|FriendLinkNotFoundError/);
        }
      }

      const db = new DatabaseSync(dbPath, { open: true });
      try {
        const blocked = db
          .prepare("SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)")
          .get(a.id, b.id, b.id, a.id);
        const accepted = db
          .prepare(
            "SELECT 1 FROM friend_links WHERE status = 'accepted' AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))",
          )
          .get(a.id, b.id, b.id, a.id);
        // The real invariant under test: never both at once, regardless of
        // how the two processes' operations interleaved.
        expect(!!blocked && !!accepted, "a block and an accepted friendship coexisted after the race").toBe(false);

        // No duplicate friend_links row for the pair, however many raced
        // sendFriendRequest/acceptFriendRequest calls happened.
        const linkRows = db
          .prepare(
            "SELECT COUNT(*) as n FROM friend_links WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)",
          )
          .get(a.id, b.id, b.id, a.id) as { n: number };
        expect(linkRows.n).toBeLessThanOrEqual(1);
      } finally {
        db.close();
      }
    },
    60_000,
  );

  it(
    "concurrent guestbook signings from many distinct visitors all land as separate pending entries, never lost or merged",
    async () => {
      const dbPath = dbPathFor("guestbook-race");
      process.env.IOFUS_DB_PATH = dbPath;
      resetDbForTests();
      const owner = createUser("gbowner", "correct-horse-battery");
      resetDbForTests();

      const visitorCount = 8;
      const perVisitor = 3;
      const runs = await Promise.all(
        Array.from({ length: visitorCount }, (_, i) => runWorker(dbPath, ["guestbook-race", owner.id, `gbvisitor${i}`, String(perVisitor)])),
      );
      const flat = runs.flat();
      const failures = flat.filter((r) => !r.result.ok);
      expect(failures, `unexpected signGuestbook failures: ${JSON.stringify(failures)}`).toHaveLength(0);

      const db = new DatabaseSync(dbPath, { open: true });
      try {
        const count = db.prepare("SELECT COUNT(*) as n FROM guestbook_entries WHERE page_owner_id = ?").get(owner.id) as {
          n: number;
        };
        expect(count.n).toBe(visitorCount * perVisitor);
        const ids = db.prepare("SELECT id FROM guestbook_entries WHERE page_owner_id = ?").all(owner.id) as { id: string }[];
        expect(new Set(ids.map((r) => r.id)).size).toBe(ids.length);
      } finally {
        db.close();
      }
    },
    60_000,
  );
});
