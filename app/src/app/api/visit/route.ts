import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { recordVisit, countVisits } from "@/lib/pageVisits";

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

  const jar = await cookies();
  let visitorToken = jar.get(VISITOR_COOKIE)?.value;
  let isNew = false;
  if (!visitorToken) {
    visitorToken = randomUUID();
    isNew = true;
  }

  recordVisit(pageOwnerId, visitorToken);
  const count = countVisits(pageOwnerId);

  const res = NextResponse.json({ count, visitorToken: isNew ? visitorToken : undefined });
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
