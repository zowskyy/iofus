import { headers } from "next/headers";
import { getDb } from "./db";

const DEFAULT_WINDOW_MS = 60_000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Builds a stable rate-limit key scoped to *prefix*.
 * Uses *userId* when the caller is authenticated; falls back to the
 * request IP for anonymous callers.
 *
 * IP resolution: prefer X-Real-IP (set by our own reverse proxy and
 * therefore not forgeable by the client), then the *rightmost* entry in
 * X-Forwarded-For (also added by our proxy), then "anonymous". The
 * leftmost X-Forwarded-For value is client-supplied and must not be
 * trusted — using it allows an attacker to supply an arbitrary string
 * and bypass IP-based rate limits entirely.
 */
export async function rateLimitActorKey(prefix: string, userId: string | null): Promise<string> {
  if (userId) return `${prefix}:${userId}`;
  const h = await headers();
  const realIp = h.get("x-real-ip")?.trim();
  const forwarded = h.get("x-forwarded-for");
  // Rightmost entry is the one appended by our own proxy — not forgeable.
  const forwardedIp = forwarded?.split(",").at(-1)?.trim();
  const ip = realIp || forwardedIp || "anonymous";
  return `${prefix}:${ip}`;
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
