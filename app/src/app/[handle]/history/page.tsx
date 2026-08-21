import { notFound } from "next/navigation";
import Link from "next/link";
import { findUserByHandle } from "@/lib/auth";
import { getPageDocument, listVersions } from "@/lib/pageDocument";
import { parseHandleParam } from "@/lib/handleParam";

interface Props {
  params: Promise<{ handle: string }>;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? "s" : ""} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? "s" : ""} ago`;
}

function formatAbsolute(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default async function HistoryPage({ params }: Props) {
  const { handle: rawParam } = await params;
  const handle = parseHandleParam(rawParam);
  if (!handle) notFound();

  const user = findUserByHandle(handle);
  if (!user) notFound();

  const stored = getPageDocument(user.id);
  if (!stored || !stored.isPublished || stored.visibility !== "public") notFound();

  const versions = listVersions(user.id);
  const displayName = stored.document.identity.displayName;

  return (
    <>
      <div className="top-bar">
        <span className="mono">
          <Link href="/">iofus</Link> / <Link href={`/@${handle}`}>@{handle}</Link> / history
        </span>
      </div>

      <main className="container-narrow" style={{ padding: "2rem 1rem" }}>
        <h1 style={{ marginBottom: "0.25rem" }}>
          {displayName}&rsquo;s decoration history
        </h1>
        <p className="mono" style={{ color: "var(--ink-soft)", marginBottom: "2rem" }}>
          Redecorated {versions.length} time{versions.length !== 1 ? "s" : ""}
        </p>

        {versions.length === 0 ? (
          <p style={{ color: "var(--ink-soft)" }}>No decoration history yet.</p>
        ) : (
          <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {versions.map((v) => (
              <li
                key={v.id}
                style={{
                  display: "flex",
                  gap: "1rem",
                  alignItems: "baseline",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ color: "var(--ink-soft)", minWidth: "8rem" }} className="mono">
                  {relativeTime(v.createdAt)}
                </span>
                <time dateTime={v.createdAt} style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>
                  {formatAbsolute(v.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        )}

        <p style={{ marginTop: "2rem" }}>
          <Link href={`/@${handle}`}>← Back to @{handle}</Link>
        </p>
      </main>
    </>
  );
}
