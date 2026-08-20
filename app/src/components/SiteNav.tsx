import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { isModerator } from "@/lib/moderation";

// Five screens, per the plan: Explore, Make, Ask Us, Studio, Settings —
// nothing more. No feed link, no notifications, no marketplace. Ask Us
// (Phase 6 — see PLAN.md) is the one screen that reaches beyond your
// existing friend graph; it's still not a feed — no algorithm, no
// browsing strangers' asks without opting in yourself.
export async function SiteNav() {
  const viewer = await getCurrentUser();
  const moderator = viewer ? isModerator(viewer.id) : false;

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
            <Link href={`/@${viewer.handle}`}>My Page</Link>
            <Link href="/studio">Studio</Link>
            <Link href="/settings">Settings</Link>
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
