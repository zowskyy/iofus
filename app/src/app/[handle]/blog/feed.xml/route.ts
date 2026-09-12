import { notFound } from "next/navigation";
import { findUserByHandle } from "@/lib/auth";
import { canViewPageFor, getPageDocument } from "@/lib/pageDocument";
import { parseHandleParam } from "@/lib/handleParam";
import { getCurrentUser } from "@/lib/session";
import { canonicalOrigin } from "@/lib/canonicalOrigin";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toRfc822(dateStr: string): string {
  try {
    return new Date(dateStr).toUTCString();
  } catch {
    return dateStr;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle: rawParam } = await params;
  const handle = parseHandleParam(rawParam);
  if (!handle) notFound();

  const user = findUserByHandle(handle);
  if (!user) notFound();

  const stored = getPageDocument(user.id);
  if (!stored || !stored.isPublished || stored.visibility !== "public") notFound();

  // The HTML route at /@handle/blog/[slug] returns 404 to a reader the owner
  // has blocked. Without the same check here, that reader could read every
  // post body through the feed instead.
  const viewer = await getCurrentUser();
  if (!canViewPageFor(stored, user.id, viewer?.id ?? null)) notFound();

  const doc = stored.document;
  if (!doc.pageParts.includes("blog")) notFound();

  // From configuration, never the Host header: a client controls that and
  // could point every link in the feed at an origin it owns.
  const base = canonicalOrigin();
  const displayName = escapeXml(doc.identity.displayName);
  // The profile page is where blog posts are rendered; there is no separate
  // /@handle/blog route, so linking there sent every reader to a 404.
  const channelLink = `${base}/@${handle}`;

  const posts = [...doc.blog].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  const lastBuildDate =
    posts.length > 0 ? toRfc822(posts[0]!.publishedAt) : toRfc822(new Date().toISOString());

  const items = posts
    .map((post) => {
      const link = `${base}/@${handle}/blog/${escapeXml(post.slug)}`;
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${link}</link>
      <description>${escapeXml(post.body)}</description>
      <pubDate>${toRfc822(post.publishedAt)}</pubDate>
      <guid>${link}</guid>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${displayName}&apos;s blog — iofus</title>
    <link>${channelLink}</link>
    <description>Blog posts by ${displayName} on iofus</description>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
