import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listNotifications, markAllRead, Notification } from "@/lib/notifications";
import { MarkAllReadButton } from "./MarkAllReadButton";

function kindLabel(n: Notification): string {
  switch (n.kind) {
    case "guestbook_signed":
      return n.actorHandle
        ? `@${n.actorHandle} signed your guestbook`
        : "Someone signed your guestbook";
    case "friend_request":
      return n.actorHandle
        ? `@${n.actorHandle} sent you a friend request`
        : "You received a friend request";
    case "friend_accepted":
      return n.actorHandle
        ? `@${n.actorHandle} accepted your friend request`
        : "Your friend request was accepted";
    case "ask_answered":
      return n.actorHandle
        ? `@${n.actorHandle} answered your ask`
        : "Your ask was answered";
    case "ring_join_request": {
      const name = (n.payload.ringName as string | undefined) ?? "a ring";
      return n.actorHandle
        ? `@${n.actorHandle} wants to join ${name}`
        : `Someone wants to join ${name}`;
    }
    case "ring_join_accepted": {
      const name = (n.payload.ringName as string | undefined) ?? "a ring";
      return `Your request to join ${name} was accepted`;
    }
  }
}

function kindHref(n: Notification): string {
  switch (n.kind) {
    case "guestbook_signed":
      return n.actorHandle ? `/@${n.actorHandle}` : "/";
    case "friend_request":
    case "friend_accepted":
      return n.actorHandle ? `/@${n.actorHandle}` : "/";
    case "ask_answered":
      return "/asks/mine";
    case "ring_join_request": {
      const slug = n.payload.ringSlug as string | undefined;
      return slug ? `/rings/${slug}/manage` : "/rings";
    }
    case "ring_join_accepted": {
      const slug = n.payload.ringSlug as string | undefined;
      return slug ? `/explore/ring/${slug}` : "/rings";
    }
  }
}

export default async function NotificationsPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/notifications");

  const notifications = listNotifications(viewer.id, 100);
  const unread = notifications.filter((n) => !n.readAt);
  const read = notifications.filter((n) => n.readAt);

  return (
    <main className="container">
      <div style={{ display: "flex", alignItems: "baseline", gap: "1rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <p className="mono" style={{ color: "var(--accent)", fontSize: "0.75rem", letterSpacing: "0.1em", textTransform: "uppercase", margin: 0 }}>
          Notifications
        </p>
        {unread.length > 0 && <MarkAllReadButton />}
      </div>
      <h1>Notifications</h1>

      {notifications.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>No notifications yet.</p>
      ) : (
        <>
          {unread.length > 0 && (
            <section className="settings-section">
              <h2>Unread ({unread.length})</h2>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {unread.map((n) => (
                  <li key={n.id} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                    <span style={{ color: "var(--accent)", fontSize: "0.6rem", marginTop: "0.4rem" }}>●</span>
                    <div>
                      <a href={kindHref(n)} style={{ color: "var(--ink)" }}>{kindLabel(n)}</a>
                      <p className="mono" style={{ fontSize: "0.7rem", color: "var(--ink-soft)", margin: "0.1rem 0 0" }}>
                        {new Date(n.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {read.length > 0 && (
            <section className="settings-section">
              <h2 style={{ color: "var(--ink-soft)" }}>Earlier</h2>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {read.map((n) => (
                  <li key={n.id} style={{ opacity: 0.65 }}>
                    <a href={kindHref(n)} style={{ color: "var(--ink)" }}>{kindLabel(n)}</a>
                    <p className="mono" style={{ fontSize: "0.7rem", color: "var(--ink-soft)", margin: "0.1rem 0 0" }}>
                      {new Date(n.createdAt).toLocaleDateString()}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
