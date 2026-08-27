import { NextRequest, NextResponse } from "next/server";
import { heartbeat, getPresenceCount } from "@/lib/presence";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  let body: { pageOwnerId?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { pageOwnerId, token } = body;
  if (!pageOwnerId || typeof pageOwnerId !== "string" || !token || typeof token !== "string") {
    return NextResponse.json({ error: "pageOwnerId and token required" }, { status: 400 });
  }

  // token is entirely client-supplied — without a limit here, distinct
  // random tokens from one caller inflate the presence count arbitrarily.
  try {
    checkRateLimit(await rateLimitActorKey("presence", null), 30);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    throw e;
  }

  heartbeat(pageOwnerId, token);
  const count = getPresenceCount(pageOwnerId);
  return NextResponse.json({ count });
}
