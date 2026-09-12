import { headers } from "next/headers";
import { getDb } from "./db";
import { parseProxyHops } from "./productionConfig";

const DEFAULT_WINDOW_MS = 60_000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolves the client IP from an `X-Forwarded-For` value, given how many
 * trusted proxies append to it (`IOFUS_TRUSTED_PROXY_HOPS`).
 *
 * Proxies only ever *append* to X-Forwarded-For — Render explicitly does not
 * reset a client-supplied header — so the list is `<client-controlled...>,
 * <client>, <proxy1>, ... <proxyN>`. Counting from the *left* reads a value
 * the attacker chose. Counting from the far *right* reads our own edge, which
 * is identical for every visitor and collapses the whole internet into one
 * shared bucket. The real client sits exactly `hops` entries in from the right,
 * and that position is unaffected by however many entries an attacker prepends.
 *
 * Returns null when the header is absent or has fewer entries than the
 * configured hop count, which means the request did not arrive through the
 * expected proxy chain and no entry in it can be trusted.
 */
export function resolveClientIp(forwardedFor: string | null | undefined, hops: number): string | null {
  if (!forwardedFor) return null;
  const parts = forwardedFor
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const index = parts.length - 1 - hops;
  if (index < 0) return null;
  return parts[index] ?? null;
}

/**
 * Builds a stable rate-limit key scoped to *prefix*, using *userId* when the
 * caller is authenticated and the resolved client IP otherwise.
 *
 * Anonymous callers whose IP cannot be resolved share one `unresolved` bucket.
 * That is deliberately conservative: such requests did not come through the
 * expected proxy chain, so throttling them together is safer than keying off a
 * value the client supplied.
 */
export async function rateLimitActorKey(prefix: string, userId: string | null): Promise<string> {
  if (userId) return `${prefix}:${userId}`;
  const h = await headers();
  // Outside production the boot gate does not run and there is normally no
  // proxy in front of the app, so zero hops is the correct local default.
  const hops = parseProxyHops(process.env.IOFUS_TRUSTED_PROXY_HOPS) ?? 0;
  const ip = resolveClientIp(h.get("x-forwarded-for"), hops);
  return `${prefix}:${ip ?? "unresolved"}`;
}

export class RateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`Too many requests. Try again in ${retryAfterSeconds} seconds.`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Checks and increments the rate-limit counter for `key` as a single atomic
 * unit: the read, the limit check, and the increment all happen inside one
 * write transaction, so concurrent callers can never both observe a count
 * under the limit and both be allowed through.
 */
export function checkRateLimit(key: string, maxCount: number, windowMs: number = DEFAULT_WINDOW_MS): void {
  // E2E suites run many actions (signups especially) back-to-back from the
  // same loopback IP within a single rate-limit window — a real trip of
  // this exact limit, confirmed by a CI run where the visual regression
  // suite's sequential signups hit signup's maxCount=5/60s and every test
  // after the 5th stayed stuck on /signup with a rate-limit error. This
  // flag only exists in playwright.config.ts's webServer env — never set
  // in production — so the limit stays fully enforced everywhere real
  // traffic reaches it.
  if (process.env.IOFUS_DISABLE_RATE_LIMIT === "true" && process.env.NODE_ENV !== "production") return;
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  let limitError: RateLimitError | undefined;
  try {
    const now = Date.now();
    const row = db.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").get(key) as
      | { count: number; window_start: string }
      | undefined;

    if (!row) {
      db.prepare("INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)").run(key, new Date(now).toISOString());
    } else {
      const windowStart = new Date(row.window_start).getTime();
      if (now - windowStart >= windowMs) {
        db.prepare("UPDATE rate_limits SET count = 1, window_start = ? WHERE key = ?").run(new Date(now).toISOString(), key);
      } else if (row.count >= maxCount) {
        db.exec("ROLLBACK");
        throw new RateLimitError(Math.ceil((windowMs - (now - windowStart)) / 1000));
      } else {
        db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").run(key);
      }
    }
    // Expired windows are otherwise never removed. The longest window in
    // use is DAY_MS, so anything older than a week is unambiguously stale
    // regardless of which window size created it — piggyback the sweep on
    // this already-open write transaction rather than adding a background
    // job.
    db.prepare("DELETE FROM rate_limits WHERE window_start < ?").run(
      new Date(now - 7 * DAY_MS).toISOString(),
    );
    db.exec("COMMIT");
  } catch (err) {
    // ROLLBACK is a no-op if the tx already committed or was explicitly rolled back above
    try { db.exec("ROLLBACK"); } catch { /* already resolved */ }
    throw err;
  }
}

/**
 * Same semantics as checkRateLimit but assumes the caller already holds an
 * open write transaction. Does not open BEGIN/COMMIT — use this only from
 * inside an existing `BEGIN IMMEDIATE` block to avoid nested-transaction errors.
 */
export function checkRateLimitInTx(key: string, maxCount: number, windowMs: number = DEFAULT_WINDOW_MS): void {
  if (process.env.IOFUS_DISABLE_RATE_LIMIT === "true" && process.env.NODE_ENV !== "production") return;
  const db = getDb();
  const now = Date.now();
  const row = db.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").get(key) as
    | { count: number; window_start: string }
    | undefined;

  if (!row) {
    db.prepare("INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)").run(key, new Date(now).toISOString());
  } else {
    const windowStart = new Date(row.window_start).getTime();
    if (now - windowStart >= windowMs) {
      db.prepare("UPDATE rate_limits SET count = 1, window_start = ? WHERE key = ?").run(new Date(now).toISOString(), key);
    } else if (row.count >= maxCount) {
      throw new RateLimitError(Math.ceil((windowMs - (now - windowStart)) / 1000));
    } else {
      db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").run(key);
    }
  }
}
