import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { getFriendActivityFeed, type FeedItem } from "@/lib/activityFeed";

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (isNaN(then)) return iso;
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function itemDescription(item: FeedItem): string {
  switch (item.kind) {
    case "page_decorated":
      return "redecorated their page";
    case "blog_post":
      return `posted to their blog: ${item.title ?? ""}`;
    case "devlog_entry":
      return `added a devlog entry`;
    case "guestbook_signed":
      return `signed @${item.targetHandle}'s guestbook`;
    default:
      return "did something";
  }
}

export default async function FeedPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const items = getFriendActivityFeed(viewer!.id, 40);

  return (
    <main className="container">
      <h1>Friends feed</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
        What your friends have been up to.
      </p>

      {items.length === 0 ? (
        <p style={{ color: "var(--ink-soft)" }}>
          No activity yet.{" "}
          <Link href="/explore">Add some friends</Link> to see what they&apos;re up to.
        </p>
      ) : (
        <ol className="feed-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((item, i) => (
            <li key={i} className="feed-item" style={{ display: "flex", gap: "0.75rem", padding: "0.75rem 0", borderBottom: "1px solid var(--rule)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span>
                  <Link href={`/@${item.actorHandle}`} style={{ fontWeight: 600 }}>
                    {item.actorDisplayName}
                  </Link>{" "}
                  <span style={{ color: "var(--ink-soft)" }}>@{item.actorHandle}</span>
                </span>
                <span style={{ color: "var(--ink-soft)", margin: "0 0.4rem" }}>·</span>
                <Link href={item.href} style={{ color: "var(--ink)" }}>
                  {itemDescription(item)}
                </Link>
              </div>
              <time
                dateTime={item.timestamp}
                style={{ color: "var(--ink-soft)", fontSize: "0.8rem", whiteSpace: "nowrap", flexShrink: 0 }}
              >
                {relativeTime(item.timestamp)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
