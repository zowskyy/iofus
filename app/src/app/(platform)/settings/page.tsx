import Link from "next/link";
import { redirect } from "next/navigation";
import { listBlockedUsers, listIncomingRequests } from "@/lib/friends";
import { listPendingGuestbookEntries } from "@/lib/guestbook";
import { getPageDocument } from "@/lib/pageDocument";
import { getCurrentUser } from "@/lib/session";
import { getAmbientStatus } from "@/lib/ambientStatus";
import { AmbientStatusEditor } from "@/components/AmbientStatusEditor";
import {
  acceptIncomingAction,
  approveGuestbookAction,
  declineIncomingAction,
  panicModeAction,
  rejectGuestbookAction,
  unblockAction,
} from "./actions";

export default async function SettingsPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/settings");

  const incoming = listIncomingRequests(viewer.id);
  const blocked = listBlockedUsers(viewer.id);
  const pendingGuestbook = listPendingGuestbookEntries(viewer.id);
  const stored = getPageDocument(viewer.id);
  const panicActive = stored?.hiddenFromDiscovery && stored.visibility === "unlisted";
  const currentStatus = getAmbientStatus(viewer.id);

  return (
    <main className="container">
      <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Account
      </p>
      <h1>Settings</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        Friend requests, blocks, guestbook moderation, and safety controls for @{viewer.handle}.
      </p>

      <section className="settings-section">
        <h2>Ambient status</h2>
        <p className="settings-empty" style={{ marginBottom: "0.75rem" }}>
          Show visitors what you&apos;re currently up to. Disappears automatically after 24 hours.
        </p>
        <AmbientStatusEditor initialStatus={currentStatus?.text ?? null} />
      </section>

      <section className="settings-section">
        <h2>Panic mode</h2>
        <p className="settings-empty" style={{ marginBottom: "0.75rem" }}>
          Instantly hide your page from Explore and discovery, and switch visibility to unlisted. People with the direct
          link can still visit. Toggle it off any time to go back to normal.
        </p>
        {panicActive && (
          <p style={{ color: "#2563eb", margin: "0 0 0.75rem" }}>Panic mode is on — your page is hidden from discovery and unlisted.</p>
        )}
        <form action={panicModeAction}>
          <button
            type="submit"
            className="btn"
            style={
              panicActive
                ? { background: "#2563eb", borderColor: "#2563eb" }
                : { background: "var(--danger)", borderColor: "var(--danger)" }
            }
          >
            {panicActive ? "Deactivate panic mode" : "Activate panic mode"}
          </button>
        </form>
      </section>

      <section className="settings-section">
        <h2>Incoming friend requests</h2>
        {incoming.length === 0 ? (
          <p className="settings-empty">No pending requests.</p>
        ) : (
          <ul className="settings-list">
            {incoming.map((req) => (
              <li key={req.id} className="settings-list-item">
                <Link href={`/@${req.fromHandle}`}>@{req.fromHandle}</Link>
                <div className="settings-actions-row">
                  <form action={acceptIncomingAction.bind(null, req.id)}>
                    <button type="submit" className="btn">Accept</button>
                  </form>
                  <form action={declineIncomingAction.bind(null, req.id)}>
                    <button type="submit" className="btn secondary">Decline</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="settings-section">
        <h2>Blocked users</h2>
        {blocked.length === 0 ? (
          <p className="settings-empty">You haven&apos;t blocked anyone.</p>
        ) : (
          <ul className="settings-list">
            {blocked.map((b) => (
              <li key={b.userId} className="settings-list-item">
                <span>@{b.handle}</span>
                <form action={unblockAction.bind(null, b.handle)}>
                  <button type="submit" className="btn secondary">Unblock</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="settings-section">
        <h2>Guestbook moderation</h2>
        {pendingGuestbook.length === 0 ? (
          <p className="settings-empty">No guestbook entries waiting for approval.</p>
        ) : (
          <ul className="settings-list settings-guestbook-list">
            {pendingGuestbook.map((entry) => (
              <li key={entry.id} className="settings-list-item settings-guestbook-item">
                <p className="guestbook-message">{entry.message}</p>
                <p className="guestbook-meta mono">
                  {entry.authorHandle ? `@${entry.authorHandle}` : "Anonymous"}
                </p>
                <div className="settings-actions-row">
                  <form action={approveGuestbookAction.bind(null, entry.id)}>
                    <button type="submit" className="btn">Approve</button>
                  </form>
                  <form action={rejectGuestbookAction.bind(null, entry.id)}>
                    <button type="submit" className="btn secondary">Reject</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
