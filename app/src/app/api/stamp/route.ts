import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { addStamp, listStamps, StampError } from "@/lib/stamps";
import { canViewPageFor, getPageDocument } from "@/lib/pageDocument";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";
import { getDb } from "@/lib/db";

/**
 * Stamps are attached to a page, so reading or writing them requires the same
 * access to that page as viewing it. Neither handler used to check: a page the
 * viewer cannot see (unpublished, private, or whose owner blocked them) still
 * returned its stamps and accepted new ones, and an arbitrary UUID that
 * belonged to no page at all was accepted as an owner.
 *
 * 404 rather than 403 so the endpoint does not confirm that a hidden page exists.
 */
async function assertPageVisible(pageOwnerId: string, viewerId: string | null): Promise<boolean> {
  const stored = getPageDocument(pageOwnerId);
  // canViewPageFor rejects a null document, which also covers a pageOwnerId
  // that matches no page.
  return canViewPageFor(stored, pageOwnerId, viewerId);
}

export async function GET(req: NextRequest) {
  const pageOwnerId = req.nextUrl.searchParams.get("pageOwnerId");
  if (!pageOwnerId) {
    return NextResponse.json({ error: "pageOwnerId required" }, { status: 400 });
  }
  const viewer = await getCurrentUser();
  if (!(await assertPageVisible(pageOwnerId, viewer?.id ?? null))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stamps = listStamps(pageOwnerId);
  let viewerStampedToday = false;
  if (viewer) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const row = getDb()
      .prepare(
        "SELECT id FROM page_stamps WHERE page_owner_id = ? AND stamper_id = ? AND created_at >= ?",
      )
      .get(pageOwnerId, viewer.id, since);
    viewerStampedToday = !!row;
  }
  return NextResponse.json({ stamps, viewerStampedToday });
}

export async function POST(req: NextRequest) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Sign in to leave a stamp." }, { status: 401 });
  }

  // Every other mutating endpoint is metered. Without this, one account could
  // write a row per day against unlimited distinct page ids.
  try {
    checkRateLimit(await rateLimitActorKey("stamp", viewer.id), 60);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    throw e;
  }

  let body: { pageOwnerId?: string; emoji?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { pageOwnerId, emoji } = body;
  if (!pageOwnerId || typeof pageOwnerId !== "string" || !emoji || typeof emoji !== "string") {
    return NextResponse.json({ error: "pageOwnerId and emoji required" }, { status: 400 });
  }

  if (!(await assertPageVisible(pageOwnerId, viewer.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    addStamp(pageOwnerId, viewer.id, viewer.handle, emoji);
  } catch (e) {
    if (e instanceof StampError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const stamps = listStamps(pageOwnerId);
  return NextResponse.json({ stamps });
}
