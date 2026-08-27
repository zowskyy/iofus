import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { recordVisit, countVisits } from "@/lib/pageVisits";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";

const VISITOR_COOKIE = "iofus_visitor";

export async function POST(req: NextRequest) {
  let body: { pageOwnerId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { pageOwnerId } = body;
  if (!pageOwnerId || typeof pageOwnerId !== "string") {
    return NextResponse.json({ error: "pageOwnerId required" }, { status: 400 });
  }

  // The visitor cookie is how legitimate visits are deduplicated, but a
  // client can simply not send one to get a fresh, uncounted visit every
  // request — this caps the damage from that instead of trusting the
  // cookie as the only guard.
  try {
    checkRateLimit(await rateLimitActorKey("visit", null), 30);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    throw e;
  }

  const jar = await cookies();
  let visitorToken = jar.get(VISITOR_COOKIE)?.value;
  let isNew = false;
  if (!visitorToken) {
    visitorToken = randomUUID();
    isNew = true;
  }

  recordVisit(pageOwnerId, visitorToken);
  const count = countVisits(pageOwnerId);

  const res = NextResponse.json({ count });
  if (isNew) {
    res.cookies.set(VISITOR_COOKIE, visitorToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
    });
  }
  return res;
}
