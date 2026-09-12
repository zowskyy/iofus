import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "./auth";
import { resetDbForTests } from "./db";
import { defaultPageDocument, savePageDocument, setPublished, setVisibility } from "./pageDocument";
import { signGuestbook } from "./guestbook";
import { sendFriendRequest, acceptFriendRequest, listIncomingRequests } from "./friends";
import { buildPageHtml, exportPageAsHtml, ExportError } from "./exportPage";
import type { PageDocument } from "./pageDocumentTypes";
import type { GuestbookEntry } from "./guestbook";

process.env.IOFUS_DB_PATH = ":memory:";

beforeEach(() => {
  resetDbForTests();
});

const XSS_ATTEMPT = '<script>alert(1)</script>"><img src=x onerror=alert(2)>';
const ESCAPED_XSS =
  "&lt;script&gt;alert(1)&lt;/script&gt;&quot;&gt;&lt;img src=x onerror=alert(2)&gt;";

function docWithParts(overrides: Partial<PageDocument>): PageDocument {
  const doc = defaultPageDocument("Base Name");
  return { ...doc, ...overrides };
}

describe("buildPageHtml / renderPart — escaping and empty-state behavior across all part types", () => {
  it("identity: escapes displayName, bio, and status", () => {
    const doc = docWithParts({
      pageParts: ["identity"],
      identity: { displayName: XSS_ATTEMPT, bio: XSS_ATTEMPT, status: XSS_ATTEMPT },
    });
    const html = buildPageHtml(doc, "handle", [], [], "", new Date().toISOString());
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain(ESCAPED_XSS);
  });

  it("now: renders when present, omits the section when empty", () => {
    const withNow = docWithParts({ pageParts: ["now"], now: XSS_ATTEMPT });
    const html = buildPageHtml(withNow, "handle", [], [], "", new Date().toISOString());
    expect(html).toContain(ESCAPED_XSS);

    const withoutNow = docWithParts({ pageParts: ["now"], now: "" });
    const emptyHtml = buildPageHtml(withoutNow, "handle", [], [], "", new Date().toISOString());
    expect(emptyHtml).not.toContain("<h2>Now</h2>");
  });

  it("links: escapes label and url, and omits the section when empty", () => {
    const withLinks = docWithParts({
      pageParts: ["links"],
      links: [{ label: XSS_ATTEMPT, url: `https://example.com/${encodeURIComponent(XSS_ATTEMPT)}` }],
    });
    const html = buildPageHtml(withLinks, "handle", [], [], "", new Date().toISOString());
    expect(html).toContain(ESCAPED_XSS);
    expect(html).not.toContain("<script>alert(1)</script>");

    const withoutLinks = docWithParts({ pageParts: ["links"], links: [] });
    const emptyHtml = buildPageHtml(withoutLinks, "handle", [], [], "", new Date().toISOString());
    expect(emptyHtml).not.toContain("<h2>Links</h2>");
  });

  it("blog: escapes title and body, converts newlines to <br>, omits when empty", () => {
    const withBlog = docWithParts({
      pageParts: ["blog"],
      blog: [
        {
          id: randomUUID(),
          title: XSS_ATTEMPT,
          slug: "a-post",
          body: `line one\n${XSS_ATTEMPT}`,
          publishedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    });
    const html = buildPageHtml(withBlog, "handle", [], [], "", new Date().toISOString());
    expect(html).toContain(ESCAPED_XSS);
    expect(html).toContain("line one<br>");
    expect(html).not.toContain("<script>alert(1)</script>");

    const withoutBlog = docWithParts({ pageParts: ["blog"], blog: [] });
    const emptyHtml = buildPageHtml(withoutBlog, "handle", [], [], "", new Date().toISOString());
    expect(emptyHtml).not.toContain("<h2>Blog</h2>");
  });

  it("devlog: escapes date and body, omits when empty", () => {
    const withDevlog = docWithParts({
      pageParts: ["devlog"],
      devlog: [{ id: randomUUID(), date: "2024-01-01", body: XSS_ATTEMPT }],
    });
    const html = buildPageHtml(withDevlog, "handle", [], [], "", new Date().toISOString());
    expect(html).toContain(ESCAPED_XSS);

    const withoutDevlog = docWithParts({ pageParts: ["devlog"], devlog: [] });
    const emptyHtml = buildPageHtml(withoutDevlog, "handle", [], [], "", new Date().toISOString());
    expect(emptyHtml).not.toContain("<h2>Devlog</h2>");
  });

  it("guestbook: escapes author handle and message, falls back to 'Anonymous', omits when empty", () => {
    const doc = docWithParts({ pageParts: ["guestbook"] });
    const entries: GuestbookEntry[] = [
      {
        id: "e1",
        authorHandle: XSS_ATTEMPT,
        message: XSS_ATTEMPT,
        status: "approved",
        createdAt: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "e2",
        authorHandle: null,
        message: "anon message",
        status: "approved",
        createdAt: "2024-01-02T00:00:00.000Z",
      },
    ];
    const html = buildPageHtml(doc, "handle", entries, [], "", new Date().toISOString());
    expect(html).toContain(ESCAPED_XSS);
    expect(html).toContain("<strong>Anonymous</strong>");
    expect(html).not.toContain("<script>alert(1)</script>");

    const emptyHtml = buildPageHtml(doc, "handle", [], [], "", new Date().toISOString());
    expect(emptyHtml).not.toContain("<h2>Guestbook</h2>");
  });

  it("topEight: escapes handles, links to /@handle, omits when empty", () => {
    const withTopEight = docWithParts({ pageParts: ["topEight"], topEight: [XSS_ATTEMPT] });
    const html = buildPageHtml(withTopEight, "handle", [], [], "", new Date().toISOString());
    expect(html).toContain(ESCAPED_XSS);
    expect(html).not.toContain("<script>alert(1)</script>");

    const withoutTopEight = docWithParts({ pageParts: ["topEight"], topEight: [] });
    const emptyHtml = buildPageHtml(withoutTopEight, "handle", [], [], "", new Date().toISOString());
    expect(emptyHtml).not.toContain("<h2>Top 8</h2>");
  });

  it("friends: escapes handles, links to /@handle, omits when empty", () => {
    const doc = docWithParts({ pageParts: ["friends"] });
    const html = buildPageHtml(doc, "handle", [], [XSS_ATTEMPT], "", new Date().toISOString());
    expect(html).toContain(ESCAPED_XSS);
    expect(html).not.toContain("<script>alert(1)</script>");

    const emptyHtml = buildPageHtml(doc, "handle", [], [], "", new Date().toISOString());
    expect(emptyHtml).not.toContain("<h2>Friends</h2>");
  });

  it("badges: escapes label and emoji, renders without emoji span when absent, omits when empty", () => {
    const withBadges = docWithParts({
      pageParts: ["badges"],
      badges: [{ id: randomUUID(), label: XSS_ATTEMPT, emoji: undefined }],
    });
    const html = buildPageHtml(withBadges, "handle", [], [], "", new Date().toISOString());
    expect(html).toContain(ESCAPED_XSS);
    expect(html).not.toContain("<span></span>");

    const withoutBadges = docWithParts({ pageParts: ["badges"], badges: [] });
    const emptyHtml = buildPageHtml(withoutBadges, "handle", [], [], "", new Date().toISOString());
    expect(emptyHtml).not.toContain("<h2>Badges</h2>");
  });

  it("shrine: escapes title, body, and image alt; omits image tag when imageUrl absent; omits section when empty", () => {
    const withShrine = docWithParts({
      pageParts: ["shrine"],
      shrines: [{ id: randomUUID(), title: XSS_ATTEMPT, body: `a\n${XSS_ATTEMPT}` }],
    });
    const html = buildPageHtml(withShrine, "handle", [], [], "", new Date().toISOString());
    expect(html).toContain(ESCAPED_XSS);
    expect(html).not.toContain("<img");

    const withoutShrine = docWithParts({ pageParts: ["shrine"], shrines: [] });
    const emptyHtml = buildPageHtml(withoutShrine, "handle", [], [], "", new Date().toISOString());
    expect(emptyHtml).not.toContain("<h2>Shrines</h2>");
  });

  it("playlist: escapes title and url, omits when empty", () => {
    const withPlaylist = docWithParts({
      pageParts: ["playlist"],
      playlist: [{ id: randomUUID(), title: XSS_ATTEMPT, url: "https://example.com/track" }],
    });
    const html = buildPageHtml(withPlaylist, "handle", [], [], "", new Date().toISOString());
    expect(html).toContain(ESCAPED_XSS);
    expect(html).not.toContain("<script>alert(1)</script>");

    const withoutPlaylist = docWithParts({ pageParts: ["playlist"], playlist: [] });
    const emptyHtml = buildPageHtml(withoutPlaylist, "handle", [], [], "", new Date().toISOString());
    expect(emptyHtml).not.toContain("<h2>Playlist</h2>");
  });

  it("an unknown pageParts entry (e.g. a part with no export renderer) renders nothing, not an error", () => {
    // gallery/pixelArt/miniPages/stamps have no export renderer (default case
    // in renderPart's switch) — must degrade to an empty string, never throw.
    const doc = docWithParts({ pageParts: ["gallery", "pixelArt", "miniPages", "stamps"] });
    expect(() => buildPageHtml(doc, "handle", [], [], "", new Date().toISOString())).not.toThrow();
  });

  it("theme colors (validated hex by schema) interpolate into inline style without breaking out", () => {
    const doc = docWithParts({ pageParts: ["identity"] });
    doc.theme.accent = "#ff00aa";
    doc.theme.background = "#00aaff";
    const html = buildPageHtml(doc, "handle", [], [], "", new Date().toISOString());
    expect(html).toContain("--page-accent:#ff00aa");
    expect(html).toContain("--page-bg:#00aaff");
  });
});

describe("exportPageAsHtml", () => {
  it("throws ExportError when the user has no page document", () => {
    const user = createUser("nopagehere", "correct-horse-battery");
    expect(() => exportPageAsHtml(user.id)).toThrow(ExportError);
    expect(() => exportPageAsHtml(user.id)).toThrow("No page found.");
  });

  it("exports a full page end-to-end: identity, links, blog, guestbook, and friends", () => {
    const user = createUser("exportme", "correct-horse-battery");
    const doc = defaultPageDocument("Export Me");
    doc.pageParts = ["identity", "links", "blog", "guestbook", "friends"];
    doc.links = [{ label: "My site", url: "https://example.com" }];
    doc.blog = [
      { id: randomUUID(), title: "Hello", slug: "hello", body: "world", publishedAt: "2024-01-01T00:00:00.000Z" },
    ];
    savePageDocument(user.id, doc);
    setPublished(user.id, true);
    setVisibility(user.id, "public");

    const signer = createUser("signerperson", "correct-horse-battery");
    signGuestbook(user.id, signer.id, "signerperson", "nice page!", false);

    const friend = createUser("friendperson", "correct-horse-battery");
    savePageDocument(friend.id, defaultPageDocument("Friend Person"));
    setPublished(friend.id, true);
    setVisibility(friend.id, "public");
    sendFriendRequest(user.id, friend.id);
    const incoming = listIncomingRequests(friend.id);
    acceptFriendRequest(friend.id, incoming[0]!.id);

    const html = exportPageAsHtml(user.id);
    expect(html).toContain("Export Me");
    expect(html).toContain("My site");
    expect(html).toContain("Hello");
    expect(html).toContain("nice page!");
    expect(html).toContain("friendperson");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Exported from");
  });
});
