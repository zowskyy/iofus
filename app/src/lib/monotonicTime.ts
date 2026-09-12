/**
 * Returns a strictly increasing ISO timestamp string.
 *
 * ISO timestamps have millisecond precision, so two rows created within the
 * same millisecond would otherwise tie on a created_at column and make
 * `ORDER BY created_at` non-deterministic for those rows. Callers that need
 * a stable insertion order (message threads, notification feeds) use this
 * instead of `new Date().toISOString()` directly.
 *
 * Each call site that needs its own independent monotonic clock should call
 * `createMonotonicClock()` rather than sharing state across unrelated
 * sequences (e.g. messages and notifications ticking the same counter would
 * be needless coupling with no benefit).
 */
export function createMonotonicClock(): () => string {
  let lastTimestampMs = 0;
  return function monotonicNow(): string {
    let ms = Date.now();
    if (ms <= lastTimestampMs) ms = lastTimestampMs + 1;
    lastTimestampMs = ms;
    return new Date(ms).toISOString();
  };
}
