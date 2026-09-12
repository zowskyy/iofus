import { redirect } from "next/navigation";
import { listBlockedUsers, listIncomingRequests } from "@/lib/friends";
import { listPendingGuestbookEntries } from "@/lib/guestbook";
import { getPageDocument } from "@/lib/pageDocument";
import { getCurrentUser } from "@/lib/session";
import { getAmbientStatus } from "@/lib/ambientStatus";
import { getUserEmail } from "@/lib/passwordReset";
import { AmbientStatusEditor } from "@/components/AmbientStatusEditor";
import { EmailForm } from "./EmailForm";
import { BlockedUserRow, FriendRequestRow, GuestbookEntryRow, PanicModeButton } from "./SettingsRows";

export default async function SettingsPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/settings");

  const incoming = listIncomingRequests(viewer.id);
  const blocked = listBlockedUsers(viewer.id);
  const pendingGuestbook = listPendingGuestbookEntries(viewer.id);
  const stored = getPageDocument(viewer.id);
  const panicActive = stored?.hiddenFromDiscovery && stored.visibility === "unlisted";
  const currentStatus = getAmbientStatus(viewer.id);
  const currentEmail = getUserEmail(viewer.id);

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
        <h2>Recovery email</h2>
        <p className="settings-description">
          Add an email address to enable password reset. iofus won&apos;t send you anything else.
        </p>
        <EmailForm currentEmail={currentEmail} />
      </section>

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
        <PanicModeButton panicActive={Boolean(panicActive)} />
      </section>

      <section className="settings-section">
        <h2>Incoming friend requests</h2>
        {incoming.length === 0 ? (
          <p className="settings-empty">No pending requests.</p>
        ) : (
          <ul className="settings-list">
            {incoming.map((req) => (
              <FriendRequestRow key={req.id} requestId={req.id} fromHandle={req.fromHandle} />
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
              <BlockedUserRow key={b.userId} handle={b.handle} />
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
              <GuestbookEntryRow
                key={entry.id}
                entryId={entry.id}
                message={entry.message}
                authorHandle={entry.authorHandle}
              />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
