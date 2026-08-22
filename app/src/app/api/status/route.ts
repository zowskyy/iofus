import { NextRequest, NextResponse } from "next/server";
import { getAmbientStatus, setAmbientStatus, AmbientStatusError } from "@/lib/ambientStatus";
import { getCurrentUser } from "@/lib/session";

/** GET /api/status?userId=<id> — returns the current ambient status for a user. */
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  const status = getAmbientStatus(userId);
  return NextResponse.json({ status: status?.text ?? null, expiresAt: status?.expiresAt ?? null });
}

/** POST /api/status — set or clear the current user's ambient status. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || !("text" in body)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { text } = body as Record<string, unknown>;
  if (typeof text !== "string" && text !== undefined) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    setAmbientStatus(user.id, text ?? "");
  } catch (e) {
    if (e instanceof AmbientStatusError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
