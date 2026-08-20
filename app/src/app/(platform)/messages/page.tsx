import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { listConversations } from "@/lib/messages";

export default async function MessagesPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login?next=/messages");

  const conversations = listConversations(viewer.id);

  return (
    <main className="container aim-page">
      <div className="aim-window">
        <div className="aim-titlebar">
          <span>Buddy List</span>
        </div>
        <div className="aim-window-body">
          <p className="aim-hint">
            Private messages between handles. Block always wins — see{" "}
            <Link href="/settings">Settings</Link> to manage blocked accounts.
          </p>
          {conversations.length === 0 ? (
            <p className="aim-empty">No conversations yet. Message someone from their page.</p>
          ) : (
            <ul className="aim-buddy-list">
              {conversations.map((c) => (
                <li key={c.id} className={c.unreadCount > 0 ? "aim-buddy unread" : "aim-buddy"}>
                  <Link href={`/messages/${c.otherHandle}`}>
                    <span className="aim-buddy-icon" aria-hidden="true">
                      {c.unreadCount > 0 ? "●" : "○"}
                    </span>
                    <span className="aim-buddy-handle">{c.otherHandle}</span>
                    {c.unreadCount > 0 && <span className="nav-badge">{c.unreadCount}</span>}
                    <span className="aim-buddy-preview">{c.lastMessagePreview}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
