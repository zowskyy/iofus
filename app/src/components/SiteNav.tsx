import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { isModerator } from "@/lib/moderation";
import { getNavCounts } from "@/lib/navCounts";
import { NavDrawer } from "./NavDrawer";
import { NavDropdown } from "./NavDropdown";

/** Server component that renders the site navigation bar with pending-activity badges for the signed-in user. */
export async function SiteNav() {
  const viewer = await getCurrentUser();
  const moderator = viewer ? isModerator(viewer.id) : false;
  const { pendingCount, unreadMessages, unreadNotifications } = viewer
    ? getNavCounts(viewer.id)
    : { pendingCount: 0, unreadMessages: 0, unreadNotifications: 0 };

  const notificationsLink = (
    <Link href="/notifications" className="nav-settings-link">
      Notifications
      {unreadNotifications > 0 && (
        <span className="nav-badge" aria-label={`${unreadNotifications} unread`}>
          {unreadNotifications}
        </span>
      )}
    </Link>
  );
  const messagesLink = (
    <Link href="/messages" className="nav-settings-link">
      Messages
      {unreadMessages > 0 && (
        <span className="nav-badge" aria-label={`${unreadMessages} unread`}>
          {unreadMessages}
        </span>
      )}
    </Link>
  );
  const settingsLink = (
    <Link href="/settings" className="nav-settings-link">
      Settings
      {pendingCount > 0 && (
        <span className="nav-badge" aria-label={`${pendingCount} pending`}>
          {pendingCount}
        </span>
      )}
    </Link>
  );
  const logOutButton = (
    <form action="/logout" method="post" style={{ display: "inline" }}>
      <button type="submit">Log out</button>
    </form>
  );

  // The mobile drawer collapses everything into one scrollable panel, which
  // already solves "too many items" on its own — no need to nest dropdowns
  // inside it too, so it keeps the full flat list.
  const mobileLinks = (
    <>
      <Link href="/explore">Explore</Link>
      <Link href="/wander">Wander</Link>
      {viewer && <Link href="/feed">Feed</Link>}
      {viewer && <Link href="/vibe">Vibe</Link>}
      {viewer && <Link href="/rings">Rings</Link>}
      <Link href="/policy">Policy</Link>
      {viewer ? (
        <>
          <Link href="/asks">Ask Us</Link>
          {notificationsLink}
          {messagesLink}
          <Link href={`/@${viewer.handle}`}>My Page</Link>
          <Link href="/studio">Studio</Link>
          {settingsLink}
          {moderator && <Link href="/moderation">Moderation</Link>}
          {logOutButton}
        </>
      ) : (
        <Link href="/login">Log in</Link>
      )}
    </>
  );

  return (
    <div className="top-bar">
      <nav className="controls controls-left">
        <NavDropdown label="Discover">
          <Link href="/explore">Explore</Link>
          <Link href="/wander">Wander</Link>
          {viewer && <Link href="/feed">Feed</Link>}
          {viewer && <Link href="/vibe">Vibe</Link>}
          {viewer && <Link href="/rings">Rings</Link>}
        </NavDropdown>
        <Link href="/make">Make</Link>
      </nav>
      <Link href="/" className="top-bar-logo" aria-label="iofus home">
        <img src="/logo.png" alt="iofus" className="site-logo" width={384} height={192} />
      </Link>
      {/* Desktop right nav */}
      <nav className="controls controls-right nav-desktop-right">
        {viewer ? (
          <>
            {notificationsLink}
            {messagesLink}
            <NavDropdown label="Account" badgeCount={pendingCount}>
              <Link href={`/@${viewer.handle}`}>My Page</Link>
              <Link href="/studio">Studio</Link>
              {settingsLink}
              <Link href="/asks">Ask Us</Link>
              {moderator && <Link href="/moderation">Moderation</Link>}
              <Link href="/policy">Policy</Link>
              {logOutButton}
            </NavDropdown>
          </>
        ) : (
          <>
            <Link href="/policy">Policy</Link>
            <Link href="/login">Log in</Link>
          </>
        )}
      </nav>
      {/* Mobile hamburger — hidden on desktop */}
      <div className="nav-mobile-right">
        <NavDrawer pendingCount={pendingCount} unreadMessages={unreadMessages} unreadNotifications={unreadNotifications}>
          {mobileLinks}
        </NavDrawer>
      </div>
    </div>
  );
}
