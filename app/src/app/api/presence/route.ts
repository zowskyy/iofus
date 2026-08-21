import { NextRequest, NextResponse } from "next/server";
import { heartbeat, getPresenceCount } from "@/lib/presence";

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

  heartbeat(pageOwnerId, token);
  const count = getPresenceCount(pageOwnerId);
  return NextResponse.json({ count });
}
