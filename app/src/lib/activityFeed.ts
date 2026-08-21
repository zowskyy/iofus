import { getDb } from "./db";
import { listFriends } from "./friends";
import { migrateDocument } from "./pageDocument";

export interface FeedItem {
  kind: "page_decorated" | "blog_post" | "devlog_entry" | "guestbook_signed";
  actorHandle: string;
  actorDisplayName: string;
  title?: string;
  targetHandle?: string;
  href: string;
  timestamp: string;
}

interface PageDocRow {
  user_id: string;
  handle: string;
  document_json: string;
  updated_at: string;
  is_published: number;
}

interface GuestbookRow {
  author_handle: string;
  page_owner_handle: string;
  created_at: string;
}

export function getFriendActivityFeed(viewerId: string, limit = 40): FeedItem[] {
  const friends = listFriends(viewerId);
  if (friends.length === 0) return [];

  const friendIds = friends.map((f) => f.userId);
  const placeholders = friendIds.map(() => "?").join(",");

  const db = getDb();

  // Load page_documents for all friends in one query
  const pageRows = db
    .prepare(
      `SELECT pd.user_id, u.handle, pd.document_json, pd.updated_at, pd.is_published
       FROM page_documents pd
       JOIN users u ON u.id = pd.user_id
       WHERE pd.user_id IN (${placeholders}) AND pd.is_published = 1`,
    )
    .all(...friendIds) as PageDocRow[];

  // Load guestbook entries authored by friends (approved only)
  const guestbookRows = db
    .prepare(
      `SELECT ge.author_handle, u2.handle as page_owner_handle, ge.created_at
       FROM guestbook_entries ge
       JOIN users u2 ON u2.id = ge.page_owner_id
       WHERE ge.author_id IN (${placeholders}) AND ge.status = 'approved'
       ORDER BY ge.created_at DESC
       LIMIT 200`,
    )
    .all(...friendIds) as GuestbookRow[];

  const items: FeedItem[] = [];

  for (const row of pageRows) {
    let displayName = row.handle;
    let blogPosts: { title: string; publishedAt: string; slug: string }[] = [];
    let devlogEntries: { date: string; body: string }[] = [];

    try {
      const raw = JSON.parse(row.document_json) as Record<string, unknown>;
      const doc = migrateDocument(raw);
      displayName = doc.identity.displayName || row.handle;
      blogPosts = [...doc.blog].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 3);
      devlogEntries = [...doc.devlog].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    } catch {
      // If parse fails, skip blog/devlog for this friend
    }

    // page_decorated — use updated_at
    items.push({
      kind: "page_decorated",
      actorHandle: row.handle,
      actorDisplayName: displayName,
      href: `/@${row.handle}`,
      timestamp: row.updated_at,
    });

    // blog posts
    for (const post of blogPosts) {
      items.push({
        kind: "blog_post",
        actorHandle: row.handle,
        actorDisplayName: displayName,
        title: post.title,
        href: `/@${row.handle}/blog/${post.slug}`,
        timestamp: post.publishedAt,
      });
    }

    // devlog entries
    for (const entry of devlogEntries) {
      items.push({
        kind: "devlog_entry",
        actorHandle: row.handle,
        actorDisplayName: displayName,
        title: entry.body.length > 60 ? entry.body.slice(0, 60) + "…" : entry.body,
        href: `/@${row.handle}`,
        timestamp: entry.date,
      });
    }
  }

  // Build a handle → displayName map for guestbook signing
  const handleToDisplay: Record<string, string> = {};
  for (const row of pageRows) {
    try {
      const raw = JSON.parse(row.document_json) as Record<string, unknown>;
      const doc = migrateDocument(raw);
      handleToDisplay[row.handle] = doc.identity.displayName || row.handle;
    } catch {
      handleToDisplay[row.handle] = row.handle;
    }
  }

  // Also build a set of friend handles for quick lookup
  const friendHandleSet = new Set(friends.map((f) => f.handle));

  for (const row of guestbookRows) {
    if (!row.author_handle || !friendHandleSet.has(row.author_handle)) continue;
    items.push({
      kind: "guestbook_signed",
      actorHandle: row.author_handle,
      actorDisplayName: handleToDisplay[row.author_handle] ?? row.author_handle,
      targetHandle: row.page_owner_handle,
      href: `/@${row.page_owner_handle}`,
      timestamp: row.created_at,
    });
  }

  // Sort descending, return top limit
  items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return items.slice(0, limit);
}
