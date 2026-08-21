// In-memory presence store. Resets on every server restart — that is expected
// and by design. This is a lightweight ambient signal, not persistent state.

// pageOwnerId → (token → lastSeenMs)
const presence = new Map<string, Map<string, number>>();

const EXPIRY_MS = 30_000; // 30 seconds

/** Prune tokens that haven't sent a heartbeat in the last 30 seconds. */
export function pruneExpired(): void {
  const now = Date.now();
  for (const [pageId, tokens] of presence) {
    for (const [token, lastSeen] of tokens) {
      if (now - lastSeen > EXPIRY_MS) tokens.delete(token);
    }
    if (tokens.size === 0) presence.delete(pageId);
  }
}

/** Record a heartbeat from *token* on *pageOwnerId*'s page. */
export function heartbeat(pageOwnerId: string, token: string): void {
  pruneExpired();
  if (!presence.has(pageOwnerId)) presence.set(pageOwnerId, new Map());
  presence.get(pageOwnerId)!.set(token, Date.now());
}

/** Current number of active viewers on *pageOwnerId*'s page. */
export function getPresenceCount(pageOwnerId: string): number {
  pruneExpired();
  return presence.get(pageOwnerId)?.size ?? 0;
}
