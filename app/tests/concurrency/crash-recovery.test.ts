import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createUser } from "../../src/lib/auth";
import { resetDbForTests, getDb } from "../../src/lib/db";

// Real crash-mid-write recovery test: a genuine child process is SIGKILLed
// (hard OS-level termination, not a clean exit — no application or Node
// cleanup ever runs) while it holds an open, uncommitted BEGIN IMMEDIATE
// transaction against a real on-disk database file. This is the one gate
// the previous passes explicitly left untested — WAL crash-safety was
// assumed from SQLite's documentation, never verified against this app's
// actual configured PRAGMAs by actually killing a process mid-write.

const WORKER = path.join(__dirname, "crash-worker.ts");
const TSX = path.join(__dirname, "..", "..", "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "iofus-crash-"));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

/**
 * Kills the full process tree rooted at *pid*. With `shell: true` (needed
 * on Windows to resolve tsx.cmd), `child.kill()` only signals the shell —
 * the shell's own child (the actual tsx/worker process) survives and can
 * keep running, including reaching its COMMIT, after the parent here has
 * already moved on. On POSIX we avoid the shell and launch detached instead,
 * so killing the negative pid (the process group) reaches every descendant;
 * on Windows, taskkill /T recurses the real process tree regardless of how
 * many shell layers are in between.
 */
function killProcessTree(child: import("node:child_process").ChildProcess): void {
  if (process.platform === "win32") {
    if (child.pid !== undefined) spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
  } else {
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    } else {
      child.kill("SIGKILL");
    }
  }
}

/** Spawns the crash-worker, waits for it to confirm an open uncommitted transaction, then kills the full process tree. Resolves once the process has actually exited — rejects if it exits before ever reaching that handshake. */
function killMidTransaction(dbPath: string, handlePrefix: string, rowCount: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(TSX, [WORKER, dbPath, handlePrefix, String(rowCount)], {
      shell: process.platform === "win32",
      detached: process.platform !== "win32",
    });
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        killProcessTree(child);
        reject(new Error("crash-worker never reported TRANSACTION_OPEN within 10s"));
      }
    }, 10_000);

    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      if (chunk.toString().includes("TRANSACTION_OPEN")) {
        settled = true;
        clearTimeout(timeout);
        // A hard kill — on POSIX this is a real, uncatchable SIGKILL; on
        // Windows, node's child_process maps any kill() signal to
        // TerminateProcess, which is equally abrupt (no handler, no
        // cleanup) — both give the same guarantee this test needs: the
        // process cannot commit, flush, or close anything on its way out.
        killProcessTree(child);
      }
    });

    child.on("exit", (code, signal) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(new Error(`crash-worker exited (code=${code}, signal=${signal}) before reporting TRANSACTION_OPEN`));
        return;
      }
      resolve();
    });
    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}

describe("crash recovery (real SIGKILL mid-transaction)", () => {
  it(
    "an uncommitted transaction killed mid-write leaves the database readable, valid, and with none of the partial insert — and a normal restart works",
    async () => {
      const dbPath = path.join(tmpDir, "crash-test.db");

      // Seed one committed, known-good user *before* the crash so we can
      // confirm it survives untouched — the crash must only ever discard
      // the uncommitted transaction, never anything already committed.
      process.env.IOFUS_DB_PATH = dbPath;
      resetDbForTests();
      const survivor = createUser("survivor-account", "correct-horse-battery");
      resetDbForTests(); // release this process's handle before the child opens the same file

      await killMidTransaction(dbPath, "crashvictim", 5);

      // 1. The file must still be a valid, readable SQLite database —
      // WAL crash recovery replaying/discarding the killed process's
      // uncommitted frames, not a corrupted file.
      const db = new DatabaseSync(dbPath, { open: true });
      try {
        const integrity = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
        expect(integrity.integrity_check).toBe("ok");

        // 2. None of the killed transaction's rows made it in — a real,
        // uncommitted transaction was truly discarded, not partially applied.
        const victimRows = db
          .prepare("SELECT COUNT(*) as n FROM users WHERE handle_lower LIKE 'crashvictim%'")
          .get() as { n: number };
        expect(victimRows.n, "rows from the killed, uncommitted transaction leaked into the database").toBe(0);

        // 3. The row committed *before* the crash is untouched.
        const survivorRow = db.prepare("SELECT id FROM users WHERE handle_lower = ?").get("survivor-account") as
          | { id: string }
          | undefined;
        expect(survivorRow?.id).toBe(survivor.id);

        // 4. Schema itself is intact — every table from schema.sql/migrate()
        // is still queryable, not just the users table.
        const tables = db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as { name: string }[];
        const tableNames = new Set(tables.map((t) => t.name));
        for (const expected of ["users", "sessions", "page_documents", "friend_links", "blocks", "guestbook_entries"]) {
          expect(tableNames.has(expected), `table "${expected}" missing after crash recovery`).toBe(true);
        }
      } finally {
        db.close();
      }

      // 5. "Application starts normally" — a completely fresh getDb() call
      // (a real app restart) against the crashed-on file must succeed and
      // support a normal write, not just a read.
      resetDbForTests();
      getDb();
      const afterRestart = createUser("post-crash-signup", "correct-horse-battery");
      expect(afterRestart.handle).toBe("post-crash-signup");
      resetDbForTests();
    },
    30_000,
  );
});
