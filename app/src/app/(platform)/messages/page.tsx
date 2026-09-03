import "../../messages.css";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { listConversations } from "@/lib/messages";

/** Server page listing all direct-message conversations for the signed-in user. */
export default async function MessagesPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/messages");

  const conversations = listConversations(viewer.id);

  return (
    <main className="container">
      <h1>Messages</h1>
      <p className="msg-hint">
        Private messages between handles. Block always wins — see{" "}
        <Link href="/settings">Settings</Link> to manage blocked accounts.
      </p>
      {conversations.length === 0 ? (
        <p className="msg-empty">No conversations yet. Message someone from their page.</p>
      ) : (
        <ul className="msg-list">
          {conversations.map((c) => (
            <li key={c.id} className="msg-list-item">
              {c.unreadCount > 0 && <span className="msg-unread-dot" aria-hidden="true" />}
              <Link href={`/messages/@${c.otherHandle}`}>
                {c.otherHandle}
                {c.unreadCount > 0 && <span className="nav-badge">{c.unreadCount}</span>}
              </Link>
              <span className="msg-preview">{c.lastMessagePreview}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
