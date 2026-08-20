import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { isModerator } from "@/lib/moderation";
import { listIncomingRequests } from "@/lib/friends";
import { listPendingGuestbookEntries } from "@/lib/guestbook";
import { countUnreadMessages } from "@/lib/messages";

// Six screens, per the plan: Explore, Make, Ask Us, Messages, Studio,
// Settings — nothing more beyond that. No feed link, no marketplace.
// Ask Us (Phase 6 — see PLAN.md) reaches beyond your existing friend
// graph via a public, opt-in pool — never a DM. Messages (Phase 7) is
// the deliberate exception: real private 1:1 threads between two
// handles, reversing the platform's original "no DMs" stance on
// purpose. It still isn't a feed or an algorithm — no browsing
// strangers' threads, no message requests from someone who blocked you
// or whom you blocked.
//
// The one exception to "no notifications" otherwise: small pending-count
// badges on Settings (friend requests + guestbook signatures) and
// Messages (unread). Without them, this activity is completely invisible
// until you happen to click in — confirmed as a real dead end during
// live testing, not a hypothetical. These are count badges on existing
// links, not a notification center.
export async function SiteNav() {
  const viewer = await getCurrentUser();
  const moderator = viewer ? isModerator(viewer.id) : false;
  const pendingCount = viewer
    ? listIncomingRequests(viewer.id).length + listPendingGuestbookEntries(viewer.id).length
    : 0;
  const unreadMessages = viewer ? countUnreadMessages(viewer.id) : 0;

  return (
    <div className="top-bar">
      <Link href="/" className="mono" style={{ color: "var(--ink)", textDecoration: "none", fontWeight: 700 }}>
        ✦ IOFUS
      </Link>
      <nav className="controls">
        <Link href="/explore">Explore</Link>
        <Link href="/make">Make</Link>
        <Link href="/policy">Policy</Link>
        {viewer ? (
          <>
            <Link href="/asks">Ask Us</Link>
            <Link href="/messages" className="nav-settings-link">
              Messages
              {unreadMessages > 0 && (
                <span className="nav-badge" aria-label={`${unreadMessages} unread`}>
                  {unreadMessages}
                </span>
              )}
            </Link>
            <Link href={`/@${viewer.handle}`}>My Page</Link>
            <Link href="/studio">Studio</Link>
            <Link href="/settings" className="nav-settings-link">
              Settings
              {pendingCount > 0 && (
                <span className="nav-badge" aria-label={`${pendingCount} pending`}>
                  {pendingCount}
                </span>
              )}
            </Link>
            {moderator && <Link href="/moderation">Moderation</Link>}
            <form action="/logout" method="post" style={{ display: "inline" }}>
              <button type="submit">Log out</button>
            </form>
          </>
        ) : (
          <Link href="/login">Log in</Link>
        )}
      </nav>
    </div>
  );
}
