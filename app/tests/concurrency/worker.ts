// Real multi-process concurrency worker. Invoked as a genuine, separate
// `node` process (never imported) against a shared on-disk SQLite file, so
// contention is real OS-level file locking — not just interleaved async
// calls inside one single-threaded event loop, which node:sqlite's fully
// synchronous API makes impossible to race in-process anyway. Prints one
// JSON line per operation to stdout; the parent test aggregates and checks
// invariants against the actual application code (imported relatively,
// exactly like the app itself), not a reimplementation.
//
// Usage: node worker.ts <dbPath> <mode> <...modeArgs>

export {}; // forces module scope — without this, top-level names collide with tests/concurrency/crash-worker.ts under tsc

function requireArg(index: number): string {
  const value = process.argv[index];
  if (value === undefined) throw new Error(`worker.ts: missing required argv[${index}]`);
  return value;
}

process.env.IOFUS_DB_PATH = requireArg(2);
process.env.IOFUS_AUTO_MODERATOR_SEED = "false";

const mode = requireArg(3);

type Result = { ok: true; value?: unknown } | { ok: false; error: string };

function record(op: string, fn: () => unknown): Result {
  try {
    const value = fn();
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e) };
  }
}

async function main() {
  const results: { op: string; result: Result }[] = [];

  if (mode === "migrate-and-signup") {
    // Every process opens the SAME (possibly brand-new) db file and runs
    // migrate() as its very first getDb() call — the exact race
    // addColumnIfMissing()'s comment in db.ts describes but that was never
    // actually exercised under real concurrent process startup.
    const { createUser } = await import("../../src/lib/auth.ts");
    const prefix = requireArg(4);
    const count = Number(requireArg(5));
    for (let i = 0; i < count; i++) {
      results.push({ op: "createUser", result: record("createUser", () => createUser(`${prefix}${i}`, "correct-horse-battery")) });
    }
  } else if (mode === "rate-limit-race") {
    const { checkRateLimit } = await import("../../src/lib/rateLimit.ts");
    const key = requireArg(4);
    const max = Number(requireArg(5));
    const attempts = Number(requireArg(6));
    for (let i = 0; i < attempts; i++) {
      results.push({ op: "checkRateLimit", result: record("checkRateLimit", () => checkRateLimit(key, max, 60_000)) });
    }
  } else if (mode === "block-vs-friend-race") {
    // One process repeatedly tries to establish/accept a friendship while
    // another repeatedly tries to block the same pair — the sharpest
    // authorization-adjacent invariant: a block and an accepted friendship
    // between the same two users must never coexist, regardless of
    // interleaving.
    const { sendFriendRequest, acceptFriendRequest, blockUser, listIncomingRequests } = await import(
      "../../src/lib/friends.ts"
    );
    const role = requireArg(4); // "friend" | "block"
    const userA = requireArg(5);
    const userB = requireArg(6);
    const attempts = Number(requireArg(7));
    for (let i = 0; i < attempts; i++) {
      if (role === "friend") {
        results.push({ op: "sendFriendRequest", result: record("sendFriendRequest", () => sendFriendRequest(userA, userB)) });
        results.push({
          op: "acceptFriendRequest",
          result: record("acceptFriendRequest", () => {
            const incoming = listIncomingRequests(userB);
            for (const r of incoming) acceptFriendRequest(userB, r.id);
          }),
        });
      } else {
        results.push({ op: "blockUser", result: record("blockUser", () => blockUser(userA, userB)) });
      }
    }
  } else if (mode === "guestbook-race") {
    // author_id carries a real FK to users(id) (schema.sql), so each
    // simulated visitor is a genuine account — created here, inside the
    // worker process, so account creation itself is part of the real
    // concurrent contention being exercised, not seeded up front.
    const { signGuestbook } = await import("../../src/lib/guestbook.ts");
    const { createUser } = await import("../../src/lib/auth.ts");
    const ownerId = requireArg(4);
    const handlePrefix = requireArg(5);
    const count = Number(requireArg(6));
    const visitor = createUser(handlePrefix, "correct-horse-battery");
    for (let i = 0; i < count; i++) {
      results.push({
        op: "signGuestbook",
        result: record("signGuestbook", () =>
          signGuestbook(ownerId, visitor.id, visitor.handle, `msg ${i} from ${visitor.handle}`, true, visitor.id),
        ),
      });
    }
  } else {
    throw new Error(`unknown mode: ${mode}`);
  }

  process.stdout.write(JSON.stringify(results) + "\n");
}

main().catch((e) => {
  process.stderr.write(String(e?.stack ?? e) + "\n");
  process.exit(1);
});
