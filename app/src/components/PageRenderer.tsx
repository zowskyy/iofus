import { Fragment } from "react";
import "../app/page.css";
import type { PageDocument } from "@/lib/pageDocumentTypes";
import type { FriendSummary } from "@/lib/friends";
import type { GuestbookEntry } from "@/lib/guestbook";
import { readableTextFor } from "@/lib/color";
import { profileScopeClass, validateProfileCustomCss } from "@/lib/cssScope";
import { renderPagePart, type TopEightLink } from "@/lib/moduleRegistry";

export type { TopEightLink };

interface Props {
  document: PageDocument;
  friends: FriendSummary[];
  handle: string;
  readerMode: boolean;
  guestbookEntries: GuestbookEntry[];
  topEightLinks: TopEightLink[];
}

/** Renders all enabled page modules for a user's profile page, applying the stored theme as inline CSS variables. */
export function PageRenderer({
  document,
  friends,
  handle,
  readerMode,
  guestbookEntries,
  topEightLinks,
}: Props) {
  const { ink, inkSoft } = readableTextFor(document.theme.background);
  const scopeClass = profileScopeClass(handle);

  const themeStyle: React.CSSProperties = readerMode
    ? {}
    : ({
        "--page-accent": document.theme.accent,
        "--page-bg": document.theme.background,
        "--page-ink": ink,
        "--page-ink-soft": inkSoft,
        ...(() => {
          const raw = document.theme.backgroundImageUrl;
          if (!raw) return {};
          let href: string;
          try {
            // Normalize through URL to strip any funny business, then
            // encode backslashes so CSS hex-escape sequences in the href
            // (e.g. \000022 → ") can't break out of the quoted url().
            href = new URL(raw).href.replace(/\\/g, "%5C");
          } catch {
            return {};
          }
          return {
            "--page-bg-image": `url("${href}")`,
            "--page-bg-repeat": document.theme.backgroundTile ? "repeat" : "no-repeat",
            "--page-bg-size": document.theme.backgroundTile ? "auto" : "cover",
          };
        })(),
      } as React.CSSProperties);

  const bodyClasses = [
    "page-body",
    scopeClass,
    readerMode ? "reader-mode" : null,
    readerMode ? null : `density-${document.theme.density}`,
    readerMode ? null : `font-${document.theme.fontStyle}`,
    !readerMode && document.theme.reduceMotion ? "reduce-motion" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const scopedCss =
    !readerMode && document.theme.customCssEnabled && document.theme.customCss
      ? (() => {
          const validated = validateProfileCustomCss(document.theme.customCss, handle);
          return validated.ok ? validated.css : "";
        })()
      : "";

  const ctx = { document, handle, readerMode, friends, guestbookEntries, topEightLinks };

  return (
    <div className={bodyClasses} style={themeStyle} data-template={readerMode ? undefined : document.theme.template}>
      {document.theme.attribution?.credit && !readerMode && (
        <p className="theme-attribution mono">{document.theme.attribution.credit}</p>
      )}
      {scopedCss && <style>{scopedCss}</style>}
      {document.pageParts.map((partId) => (
        <Fragment key={partId}>{renderPagePart(partId, ctx)}</Fragment>
      ))}
      <p className="page-footer mono">@{handle} on iofus</p>
    </div>
  );
}
