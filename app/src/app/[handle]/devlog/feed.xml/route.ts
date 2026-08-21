import { notFound } from "next/navigation";
import { findUserByHandle } from "@/lib/auth";
import { getPageDocument } from "@/lib/pageDocument";
import { parseHandleParam } from "@/lib/handleParam";

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
  request: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle: rawParam } = await params;
  const handle = parseHandleParam(rawParam);
  if (!handle) notFound();

  const user = findUserByHandle(handle);
  if (!user) notFound();

  const stored = getPageDocument(user.id);
  if (!stored || !stored.isPublished || stored.visibility !== "public") notFound();

  const doc = stored.document;
  if (!doc.pageParts.includes("devlog")) notFound();

  const host = request.headers.get("host") ?? "iofus.com";
  const base = `https://${host}`;
  const displayName = escapeXml(doc.identity.displayName);
  const channelLink = `${base}/@${handle}/devlog`;

  const entries = [...doc.devlog].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const lastBuildDate =
    entries.length > 0 ? toRfc822(entries[0].date) : toRfc822(new Date().toISOString());

  const items = entries
    .map((entry, i) => {
      const guid = `${base}/@${handle}/devlog#${escapeXml(entry.id)}`;
      const title = escapeXml(entry.body.split("\n")[0].slice(0, 80));
      return `    <item>
      <title>${title || `Devlog entry ${i + 1}`}</title>
      <link>${channelLink}</link>
      <description>${escapeXml(entry.body)}</description>
      <pubDate>${toRfc822(entry.date)}</pubDate>
      <guid>${guid}</guid>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${displayName}&apos;s devlog — iofus</title>
    <link>${channelLink}</link>
    <description>Devlog entries by ${displayName} on iofus</description>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
