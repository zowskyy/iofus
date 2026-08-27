import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { countUnreadMessages } from "@/lib/messages";
import { countIncomingRequests } from "@/lib/friends";
import { countPendingGuestbookEntries } from "@/lib/guestbook";
import { countUnread } from "@/lib/notifications";
import { checkRateLimit, RateLimitError, rateLimitActorKey } from "@/lib/rateLimit";

/** Lightweight poll endpoint for unread activity counts. Returns 401 when not signed in. */
export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    checkRateLimit(await rateLimitActorKey("activity", viewer.id), 60);
  } catch (e) {
    if (e instanceof RateLimitError) return NextResponse.json({ error: e.message }, { status: 429 });
    throw e;
  }

  const unreadMessages = countUnreadMessages(viewer.id);
  const pendingGuestbook =
    countIncomingRequests(viewer.id) + countPendingGuestbookEntries(viewer.id);
  const unreadNotifications = countUnread(viewer.id);

  return NextResponse.json({ unreadMessages, pendingGuestbook, unreadNotifications });
}
