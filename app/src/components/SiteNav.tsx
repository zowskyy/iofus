import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { isModerator } from "@/lib/moderation";
import { countIncomingRequests } from "@/lib/friends";
import { countPendingGuestbookEntries } from "@/lib/guestbook";
import { countUnreadMessages } from "@/lib/messages";
import { countUnread } from "@/lib/notifications";
import { NavDrawer } from "./NavDrawer";

/** Server component that renders the site navigation bar with pending-activity badges for the signed-in user. */
export async function SiteNav() {
  const viewer = await getCurrentUser();
  const moderator = viewer ? isModerator(viewer.id) : false;
  const pendingCount = viewer
    ? countIncomingRequests(viewer.id) + countPendingGuestbookEntries(viewer.id)
    : 0;
  const unreadMessages = viewer ? countUnreadMessages(viewer.id) : 0;
  const unreadNotifications = viewer ? countUnread(viewer.id) : 0;

  const rightLinks = (
    <>
      <Link href="/policy">Policy</Link>
      {viewer ? (
        <>
          <Link href="/asks">Ask Us</Link>
          <Link href="/rings">Rings</Link>
          <Link href="/notifications" className="nav-settings-link">
            Notifications
            {unreadNotifications > 0 && (
              <span className="nav-badge" aria-label={`${unreadNotifications} unread`}>
                {unreadNotifications}
              </span>
            )}
          </Link>
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
    </>
  );

  return (
    <div className="top-bar">
      <nav className="controls controls-left">
        <Link href="/explore">Explore</Link>
        <Link href="/make">Make</Link>
        {viewer && <Link href="/feed">Feed</Link>}
      </nav>
      <Link href="/" className="top-bar-logo" aria-label="iofus home">
        <img src="/logo.png" alt="iofus" className="site-logo" width={96} height={48} />
      </Link>
      {/* Desktop right nav */}
      <nav className="controls controls-right nav-desktop-right">
        {rightLinks}
      </nav>
      {/* Mobile hamburger — hidden on desktop */}
      <div className="nav-mobile-right">
        <NavDrawer pendingCount={pendingCount} unreadMessages={unreadMessages} unreadNotifications={unreadNotifications}>
          {rightLinks}
        </NavDrawer>
      </div>
    </div>
  );
}
