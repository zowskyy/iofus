import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { findUserByHandle } from "@/lib/auth";
import { canViewPage, getEffectiveDocument, getPageDocument, listVersions } from "@/lib/pageDocument";
import { getDb } from "@/lib/db";
import {
  getFriendRelationship,
  hasBlockRelationship,
  listPublicFriends,
} from "@/lib/friends";
import { listApprovedGuestbookEntries } from "@/lib/guestbook";
import { getCurrentUser } from "@/lib/session";
import { listUserWebRings } from "@/lib/webRings";
import { getAmbientStatus } from "@/lib/ambientStatus";
import { PageRenderer, type TopEightLink } from "@/components/PageRenderer";
import { parseHandleParam } from "@/lib/handleParam";
import { FriendActions } from "./friends/FriendActions";
import { GuestbookSignForm } from "./guestbook/GuestbookSignForm";
import { listByTag } from "@/lib/discovery";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle: rawParam } = await params;
  const handle = parseHandleParam(rawParam);
  if (!handle) return {};

  const user = findUserByHandle(handle);
  if (!user) return {};

  const stored = getPageDocument(user.id);
  if (!stored || !stored.isPublished || stored.visibility !== "public") return {};

  const doc = stored.document;
  const types: Record<string, string> = {};

  if (doc.pageParts.includes("blog")) {
    types["application/rss+xml; blog"] = `/@${handle}/blog/feed.xml`;
  }
  if (doc.pageParts.includes("devlog")) {
    types["application/rss+xml; devlog"] = `/@${handle}/devlog/feed.xml`;
  }

  return { alternates: { types } };
}

interface Props {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ reader?: string; preview?: string }>;
}

/** Resolves raw handle strings into TopEightLink objects, skipping handles with no published page. */
/**
 * Resolve Top Eight handles to display links, applying the same
 * visibility rules as listPublicFriends: a private/unlisted or
 * discovery-hidden page must not leak its identity to a visitor who
 * couldn't otherwise see it.
 */
function resolveTopEight(handles: string[], ownerId: string, viewerId: string | null): TopEightLink[] {
  if (!handles.length) return [];
  const placeholders = handles.map(() => "?").join(", ");
  const rows = getDb()
    .prepare(
      `SELECT u.id, u.handle, pd.document_json, pd.is_published, pd.visibility, pd.hidden_from_discovery
       FROM users u
       JOIN page_documents pd ON pd.user_id = u.id
       WHERE u.handle IN (${placeholders})
         AND pd.is_published = 1`,
    )
    .all(...handles) as { id: string; handle: string; document_json: string; is_published: number; visibility: string; hidden_from_discovery: number }[];

  // Preserve the original order from the handles array
  const byHandle = new Map(rows.map((r) => [r.handle, r]));
  const links: TopEightLink[] = [];
  for (const raw of handles) {
    const r = byHandle.get(raw);
    if (!r) continue;
    const canSee =
      viewerId === r.id ||
      viewerId === ownerId ||
      (r.visibility !== "private" && r.visibility !== "unlisted" && !r.hidden_from_discovery);
    if (!canSee) continue;
    let displayName = raw;
    try {
      const doc = JSON.parse(r.document_json) as { identity?: { displayName?: string } };
      if (doc.identity?.displayName) displayName = doc.identity.displayName;
    } catch { /* fall back */ }
    links.push({ handle: r.handle, label: displayName });
  }
  return links;
}

/** Server page for a user's public profile at `/@handle`, enforcing visibility and block rules before rendering. */
export default async function ProfilePage({ params, searchParams }: Props) {
  const { handle: rawParam } = await params;
  const { reader, preview } = await searchParams;

  const handle = parseHandleParam(rawParam);
  if (!handle) notFound();

  const user = findUserByHandle(handle);
  if (!user) notFound();

  const stored = getPageDocument(user.id);
  const viewer = await getCurrentUser();
  const isOwner = viewer?.id === user.id;

  const blocked = viewer && !isOwner && hasBlockRelationship(viewer.id, user.id);

  if (blocked || !canViewPage(stored, user.id, viewer?.id ?? null)) notFound();

  const readerMode = reader === "1";
  const safePreview = preview === "1";
  const document = getEffectiveDocument(stored!, isOwner, safePreview);

  const viewerId = viewer?.id ?? null;
  const friends = listPublicFriends(user.id, viewerId);
  const guestbookEntries = listApprovedGuestbookEntries(user.id);
  const topEightLinks = resolveTopEight(document.topEight, user.id, viewerId);
  const ambientStatus = getAmbientStatus(user.id);
  const rings = listUserWebRings(user.id);

  const relationship = viewer && !isOwner ? getFriendRelationship(viewer.id, user.id) : null;
  const versions = stored!.visibility === "public" ? listVersions(user.id) : [];

  const showGuestbookForm =
    document.guestbook.enabled && !stored!.guestbookDisabled && !isOwner;

  // Similar pages: pick the first tag and find up to 4 pages with it, excluding this user
  const firstTag = document.tags?.[0] ?? null;
  const similarPages = firstTag
    ? listByTag(firstTag, 8).filter((p) => p.handle !== handle).slice(0, 4)
    : [];

  return (
    <>
      <div className="top-bar">
        <span>
          <Link href="/">iofus</Link> / @{user.handle}
          {isOwner && !stored!.isPublished && (
            <span className="mono" style={{ color: "var(--accent)" }}> · draft, not published</span>
          )}
          {isOwner && safePreview && stored!.draftDocument && (
            <span className="mono" style={{ color: "var(--accent)" }}> · previewing draft</span>
          )}
        </span>
        <div className="controls">
          {isOwner && (
            <>
              <Link href="/explore">Explore</Link>
              <Link href="/studio">Studio</Link>
              <Link href="/settings">Settings</Link>
            </>
          )}
          {isOwner && stored!.draftDocument && (
            <Link href={safePreview ? `/@${user.handle}` : `/@${user.handle}?preview=1`}>
              {safePreview ? "Live page" : "Preview draft"}
            </Link>
          )}
          <Link href={readerMode ? `/@${user.handle}` : `/@${user.handle}?reader=1`}>
            {readerMode ? "Exit Reader" : "Reader"}
          </Link>
          {!isOwner && viewer && <Link href={`/messages/@${user.handle}`}>Message</Link>}
          {!isOwner && <Link href={`/@${user.handle}/report`}>Report</Link>}
          {!isOwner && <Link href={`/@${user.handle}/block`}>Block</Link>}
        </div>
      </div>

      {rings.length > 0 && (
        <div className="ring-badges-bar">
          {rings.map((ring) => (
            <span key={ring.id} className="ring-badge mono" title={ring.description}>
              ✦ {ring.name}
            </span>
          ))}
        </div>
      )}

      {relationship && (
        <div className="profile-actions-bar">
          <FriendActions handle={user.handle} relationship={relationship} />
        </div>
      )}

      <PageRenderer
        document={document}
        friends={friends}
        handle={user.handle}
        pageOwnerId={user.id}
        viewerId={viewerId}
        readerMode={readerMode}
        guestbookEntries={guestbookEntries}
        topEightLinks={topEightLinks}
        initialAmbientStatus={ambientStatus?.text ?? null}
      />

      {showGuestbookForm && <GuestbookSignForm handle={user.handle} />}

      {friends.length > 0 && (
        <section className="their-friends container-narrow" aria-label="Their friends">
          <h2 className="part-label">Their friends</h2>
          <p className="their-friends-hint">
            Wander the graph — people @{user.handle} is connected to.{" "}
            <Link href={`/explore/friends/${user.handle}`}>Walk their full graph</Link>
          </p>
          <ul className="page-friends their-friends-list">
            {friends.map((f) => (
              <li key={f.userId}>
                <Link href={`/@${f.handle}`}>@{f.handle}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* After-page actions: sign guestbook + similar pages */}
      {!isOwner && (
        <section className="after-page-panel container-narrow" aria-label="Keep exploring">
          {showGuestbookForm && (
            <div style={{ marginBottom: "0.75rem" }}>
              <h3>Leave your mark</h3>
              <div className="after-page-actions">
                <Link href="#guestbook-form" className="btn">
                  Sign the guestbook
                </Link>
                {viewer && (
                  <Link href={`/messages/@${handle}`} className="btn secondary">
                    Send a message
                  </Link>
                )}
              </div>
            </div>
          )}
          {similarPages.length > 0 && (
            <div>
              <h3>More like this</h3>
              <p className="mono" style={{ fontSize: "0.78rem", color: "var(--ink-soft)", margin: "0 0 0.5rem" }}>
                Tagged #{firstTag}
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {similarPages.map((p) => (
                  <li key={p.handle}>
                    <Link href={`/@${p.handle}`} className="btn secondary" style={{ fontSize: "0.85rem" }}>
                      @{p.handle}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ marginTop: "0.75rem" }}>
            <Link href="/wander" className="btn secondary">
              Keep wandering →
            </Link>
          </div>
        </section>
      )}
      {versions.length > 0 && (
        <div className="page-footer-meta mono" style={{ padding: "0.5rem 1rem", color: "var(--ink-soft)", fontSize: "0.8rem" }}>
          <Link href={`/@${handle}/history`}>History ({versions.length} decoration{versions.length !== 1 ? "s" : ""})</Link>
        </div>
      )}
    </>
  );
}
