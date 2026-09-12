import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { isModerator } from "@/lib/moderation";
import { resolveClientIp } from "@/lib/rateLimit";
import { parseProxyHops } from "@/lib/productionConfig";

/**
 * Reports the raw proxy headers this deployment actually receives, so
 * IOFUS_TRUSTED_PROXY_HOPS can be set from measurement rather than guesswork.
 *
 * Hosting platforms do not document how many entries they append to
 * X-Forwarded-For, and guessing wrong is not visibly broken: too few hops
 * keys rate limits off a client-supplied value, too many collapses every
 * visitor into one bucket. Both look fine until abused. Visit this route from
 * a known address and set the hop count so `resolved` matches it.
 *
 * Moderator-only: the header chain reveals internal infrastructure addresses.
 */
export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer || !isModerator(viewer.id)) {
    // Same shape as an unknown route, so the endpoint isn't discoverable by
    // probing for a 403.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  const configured = parseProxyHops(process.env.IOFUS_TRUSTED_PROXY_HOPS);

  const entries = (forwardedFor ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return NextResponse.json({
    rawXForwardedFor: forwardedFor,
    entries,
    entryCount: entries.length,
    configuredHops: configured,
    resolved: configured === null ? null : resolveClientIp(forwardedFor, configured),
    // Which hop count would select each entry, so the right value can be read
    // straight off this table instead of computed by hand.
    hopCandidates: entries.map((ip, i) => ({ hops: entries.length - 1 - i, wouldResolveTo: ip })),
    otherProxyHeaders: {
      "x-real-ip": h.get("x-real-ip"),
      "cf-connecting-ip": h.get("cf-connecting-ip"),
      "true-client-ip": h.get("true-client-ip"),
    },
  });
}
