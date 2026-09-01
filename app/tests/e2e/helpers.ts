import type { Page } from "@playwright/test";

// Signup (and other anonymous mutations) are rate-limited per-actor
// (rateLimit.ts), keyed by the X-Real-IP header when no session exists yet
// — the header a real reverse proxy sets per distinct visitor. Locally
// there's no proxy, so every anonymous request across every spec file in
// this suite would otherwise share one "anonymous" bucket, and running the
// full suite together (all spec files against the same server/DB) would
// trip the same 5/minute cap a real deployment would only ever see from one
// literal IP hammering it — this was a real, reproduced order-dependent
// flake, not a hypothetical. A process-wide counter (not per-file) gives
// every signup across every spec file its own synthetic IP, simulating
// what production actually presents: distinct visitors.
let ipCounter = 1;

export async function withFreshIp(page: Page): Promise<void> {
  const n = ipCounter++;
  const ip = `10.97.${Math.floor(n / 250)}.${n % 250}`;
  await page.context().setExtraHTTPHeaders({ "x-real-ip": ip });
}
