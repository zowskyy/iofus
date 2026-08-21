import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { addStamp, listStamps, StampError } from "@/lib/stamps";

export async function GET(req: NextRequest) {
  const pageOwnerId = req.nextUrl.searchParams.get("pageOwnerId");
  if (!pageOwnerId) {
    return NextResponse.json({ error: "pageOwnerId required" }, { status: 400 });
  }
  const viewer = await getCurrentUser();
  const stamps = listStamps(pageOwnerId);
  let viewerStampedToday = false;
  if (viewer) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { getDb } = await import("@/lib/db");
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
