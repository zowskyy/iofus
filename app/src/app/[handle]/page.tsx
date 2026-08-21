import { notFound } from "next/navigation";
import Link from "next/link";
import { findUserByHandle } from "@/lib/auth";
import { canViewPage, getEffectiveDocument, getPageDocument } from "@/lib/pageDocument";
import {
  getFriendRelationship,
  hasBlockRelationship,
  listPublicFriends,
} from "@/lib/friends";
import { listApprovedGuestbookEntries } from "@/lib/guestbook";
import { getCurrentUser } from "@/lib/session";
import { listUserWebRings } from "@/lib/webRings";
import { PageRenderer, type TopEightLink } from "@/components/PageRenderer";
import { parseHandleParam } from "@/lib/handleParam";
import { FriendActions } from "./friends/FriendActions";
import { GuestbookSignForm } from "./guestbook/GuestbookSignForm";
import { listByTag } from "@/lib/discovery";

interface Props {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ reader?: string; preview?: string }>;
}

/** Resolves raw handle strings into TopEightLink objects, skipping handles with no published page. */
function resolveTopEight(handles: string[]): TopEightLink[] {
  const links: TopEightLink[] = [];
  for (const raw of handles) {
    const user = findUserByHandle(raw);
    if (!user) continue;
    const page = getPageDocument(user.id);
    if (!page?.isPublished) continue;
    links.push({
      handle: user.handle,
      label: page.document.identity.displayName,
    });
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
  const topEightLinks = resolveTopEight(document.topEight);
  const rings = listUserWebRings(user.id);

  const relationship = viewer && !isOwner ? getFriendRelationship(viewer.id, user.id) : null;

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
          {!isOwner && viewer && <Link href={`/messages/${user.handle}`}>Message</Link>}
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
                <Link href={`/@${handle}/guestbook`} className="btn">
                  Sign the guestbook
                </Link>
                {viewer && (
                  <Link href={`/messages/${handle}`} className="btn secondary">
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
    </>
  );
}
