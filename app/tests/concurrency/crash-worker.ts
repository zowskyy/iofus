// Real crash-mid-write worker: opens the real app database via getDb(),
// starts a genuine BEGIN IMMEDIATE transaction, inserts rows, then blocks
// synchronously (so the transaction is provably still open and uncommitted)
// long enough for the parent test to send SIGKILL — a hard process
// termination, not a clean exit, so there's no chance for any application
// or Node-level cleanup to run. Never reaches COMMIT.
//
// Usage: node crash-worker.ts <dbPath> <handlePrefix> <rowCount>

export {}; // forces module scope — without this, top-level names collide with tests/concurrency/worker.ts under tsc

function requireArg(index: number): string {
  const value = process.argv[index];
  if (value === undefined) throw new Error(`crash-worker.ts: missing required argv[${index}]`);
  return value;
}

process.env.IOFUS_DB_PATH = requireArg(2);
process.env.IOFUS_AUTO_MODERATOR_SEED = "false";

const handlePrefix = requireArg(3);
const rowCount = Number(requireArg(4));

async function main() {
  const { getDb } = await import("../../src/lib/db.ts");
  const { randomUUID } = await import("node:crypto");
  const db = getDb();

  db.exec("BEGIN IMMEDIATE");
  for (let i = 0; i < rowCount; i++) {
    db.prepare(
      `INSERT INTO users (id, handle, handle_lower, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(randomUUID(), `${handlePrefix}${i}`, `${handlePrefix}${i}`, "deadbeef:deadbeef", new Date().toISOString());
  }

  // Signal the parent that the transaction is open and the inserts have
  // happened (still uncommitted) so it knows it's now safe to SIGKILL —
  // without this handshake the parent would be guessing at timing.
  process.stdout.write("TRANSACTION_OPEN\n");

  // Synchronous blocking sleep (Atomics.wait) — genuinely blocks this
  // single-threaded process so it cannot reach COMMIT on its own; only a
  // real signal (SIGKILL) ends this early. A plain `setTimeout` wouldn't
  // do — Node would stay responsive to normal termination signals and
  // this wouldn't prove anything about killing something mid-syscall.
  const sab = new SharedArrayBuffer(4);
  const view = new Int32Array(sab);
  Atomics.wait(view, 0, 0, 10_000);

  // Unreachable in the real test (SIGKILL arrives first) — exists so the
  // worker is also a valid, correct program if run standalone for
  // debugging.
  db.exec("COMMIT");
  process.stdout.write("COMMITTED\n");
}

main().catch((e) => {
  process.stderr.write(String(e?.stack ?? e) + "\n");
  process.exit(1);
});
