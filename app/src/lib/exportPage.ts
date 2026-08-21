import fs from "node:fs";
import path from "node:path";
import { getPageDocument } from "./pageDocument";
import { listApprovedGuestbookEntries, type GuestbookEntry } from "./guestbook";
import { listPublicFriends } from "./friends";
import { getDb } from "./db";
import type { PageDocument } from "./pageDocumentTypes";

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readCss(filename: string): string {
  const cssPath = path.join(process.cwd(), "src", "app", filename);
  let css = fs.readFileSync(cssPath, "utf-8");
  // Strip @import lines — they'd fail offline or fetch external resources
  css = css.replace(/^@import[^;]+;?\s*/gm, "");
  // Strip @view-transition (browser-only, not needed for static)
  css = css.replace(/@view-transition\s*\{[^}]*\}/g, "");
  return css;
}

function getHandleForUser(userId: string): string {
  const db = getDb();
  const row = db.prepare("SELECT handle FROM users WHERE id = ?").get(userId) as
    | { handle: string }
    | undefined;
  return row?.handle ?? "unknown";
}

function renderPart(
  partId: string,
  doc: PageDocument,
  handle: string,
  guestbookEntries: GuestbookEntry[],
  friendHandles: string[],
): string {
  switch (partId) {
    case "identity": {
      const { displayName, bio, status } = doc.identity;
      return `
<section class="page-section">
  <h1>${esc(displayName)}</h1>
  ${bio ? `<p>${esc(bio)}</p>` : ""}
  ${status ? `<p class="page-status">${esc(status)}</p>` : ""}
</section>`;
    }
    case "now": {
      if (!doc.now) return "";
      return `
<section class="page-section">
  <h2>Now</h2>
  <p>${esc(doc.now)}</p>
</section>`;
    }
    case "links": {
      if (!doc.links.length) return "";
      return `
<section class="page-section">
  <h2>Links</h2>
  <ul class="page-links">
    ${doc.links.map((l) => `<li><a href="${esc(l.url)}" rel="noopener noreferrer">${esc(l.label)}</a></li>`).join("\n    ")}
  </ul>
</section>`;
    }
    case "blog": {
      if (!doc.blog.length) return "";
      return `
<section class="page-section">
  <h2>Blog</h2>
  ${doc.blog
    .map(
      (post) => `
  <article class="page-blog-post">
    <h3>${esc(post.title)}</h3>
    <time class="page-meta">${esc(post.publishedAt)}</time>
    <div class="page-blog-body">${esc(post.body).replace(/\n/g, "<br>")}</div>
  </article>`,
    )
    .join("\n")}
</section>`;
    }
    case "devlog": {
      if (!doc.devlog.length) return "";
      return `
<section class="page-section">
  <h2>Devlog</h2>
  <ul class="page-devlog">
    ${doc.devlog
      .map(
        (e) =>
          `<li><time class="page-meta">${esc(e.date)}</time> <span>${esc(e.body)}</span></li>`,
      )
      .join("\n    ")}
  </ul>
</section>`;
    }
    case "guestbook": {
      if (!guestbookEntries.length) return "";
      return `
<section class="page-section">
  <h2>Guestbook</h2>
  <ul class="page-guestbook">
    ${guestbookEntries
      .map(
        (e) =>
          `<li><strong>${esc(e.authorHandle ?? "Anonymous")}</strong>: ${esc(e.message)}</li>`,
      )
      .join("\n    ")}
  </ul>
</section>`;
    }
    case "topEight": {
      if (!doc.topEight.length) return "";
      return `
<section class="page-section">
  <h2>Top 8</h2>
  <ul class="page-top-eight">
    ${doc.topEight
      .map((h) => `<li><a href="/@${esc(h)}">@${esc(h)}</a></li>`)
      .join("\n    ")}
  </ul>
</section>`;
    }
    case "friends": {
      if (!friendHandles.length) return "";
      return `
<section class="page-section">
  <h2>Friends</h2>
  <ul class="page-friends">
    ${friendHandles.map((h) => `<li><a href="/@${esc(h)}">@${esc(h)}</a></li>`).join("\n    ")}
  </ul>
</section>`;
    }
    case "badges": {
      if (!doc.badges.length) return "";
      return `
<section class="page-section">
  <h2>Badges</h2>
  <ul class="page-badges">
    ${doc.badges
      .map(
        (b) =>
          `<li>${b.emoji ? `<span>${esc(b.emoji)}</span> ` : ""}${esc(b.label)}</li>`,
      )
      .join("\n    ")}
  </ul>
</section>`;
    }
    case "shrine": {
      if (!doc.shrines.length) return "";
      return `
<section class="page-section">
  <h2>Shrines</h2>
  ${doc.shrines
    .map(
      (s) => `
  <div class="page-shrine">
    <h3>${esc(s.title)}</h3>
    ${s.imageUrl ? `<img src="${esc(s.imageUrl)}" alt="${esc(s.imageAlt ?? "")}" style="max-width:100%">` : ""}
    <div>${esc(s.body).replace(/\n/g, "<br>")}</div>
  </div>`,
    )
    .join("\n")}
</section>`;
    }
    case "playlist": {
      if (!doc.playlist.length) return "";
      return `
<section class="page-section">
  <h2>Playlist</h2>
  <ol class="page-playlist">
    ${doc.playlist
      .map((t) => `<li><a href="${esc(t.url)}" rel="noopener noreferrer">${esc(t.title)}</a></li>`)
      .join("\n    ")}
  </ol>
</section>`;
    }
    default:
      return "";
  }
}

export function buildPageHtml(
  doc: PageDocument,
  handle: string,
  guestbookEntries: GuestbookEntry[],
  friendHandles: string[],
  cssContent: string,
  exportedAt: string,
): string {
  const { accent, background, fontStyle, density } = doc.theme;
  const fontLink =
    fontStyle === "mono"
      ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap">`
      : fontStyle === "serif"
        ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,700;1,400&display=swap">`
        : `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap">`;

  const densityPx = density === "cozy" ? "0.75rem" : density === "spacious" ? "1.5rem" : "1rem";

  const themeVars = `--page-accent:${accent};--page-bg:${background};--accent:${accent};--paper:${background};`;

  const parts = doc.pageParts
    .map((p) => renderPart(p, doc, handle, guestbookEntries, friendHandles))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.identity.displayName)} — @${esc(handle)} on iofus</title>
${fontLink}
<style>
${cssContent}

/* Export overrides */
:root { ${themeVars} }
body {
  margin: 0;
  font-family: ${fontStyle === "mono" ? '"Space Mono", monospace' : fontStyle === "serif" ? "Lora, Georgia, serif" : "Inter, system-ui, sans-serif"};
}
.page-section {
  margin-bottom: ${densityPx};
  padding-bottom: ${densityPx};
  border-bottom: 1px solid color-mix(in srgb, ${accent} 15%, transparent);
}
.page-section:last-of-type { border-bottom: none; }
.page-links { list-style: none; padding: 0; margin: 0; }
.page-links li { margin: 0.35em 0; }
.page-links a { color: ${accent}; }
.page-devlog { list-style: none; padding: 0; }
.page-devlog li { margin: 0.5em 0; }
.page-guestbook { list-style: none; padding: 0; }
.page-guestbook li { margin: 0.75em 0; padding: 0.5em; border-left: 2px solid ${accent}; }
.page-top-eight { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem; }
.page-top-eight a { color: ${accent}; }
.page-friends { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem; }
.page-friends a { color: ${accent}; }
.page-badges { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem; }
.page-playlist { padding-left: 1.25rem; }
.page-playlist a { color: ${accent}; }
.page-meta { font-size: 0.8em; opacity: 0.65; }
.page-blog-post { margin-bottom: 1.5em; }
.page-shrine { margin-bottom: 1em; }
.page-export-footer {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid color-mix(in srgb, ${accent} 20%, transparent);
  font-size: 0.75rem;
  opacity: 0.5;
  text-align: center;
}
</style>
</head>
<body>
<div class="page-body" style="${themeVars}">
${parts}
<footer class="page-export-footer">
  Exported from <a href="https://iofus.xyz" style="color:inherit">iofus</a> on ${esc(new Date(exportedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }))}
</footer>
</div>
</body>
</html>`;
}

export function exportPageAsHtml(userId: string): string {
  const stored = getPageDocument(userId);
  if (!stored) throw new Error("No page found.");

  const handle = getHandleForUser(userId);
  const doc = stored.document;
  const guestbookEntries = listApprovedGuestbookEntries(userId, 50);
  const friends = listPublicFriends(userId, null);
  const friendHandles = friends.map((f) => f.handle);

  const globalsCss = readCss("globals.css");
  const pageCss = readCss("page.css");
  const cssContent = globalsCss + "\n" + pageCss;

  const exportedAt = new Date().toISOString();
  return buildPageHtml(doc, handle, guestbookEntries, friendHandles, cssContent, exportedAt);
}
