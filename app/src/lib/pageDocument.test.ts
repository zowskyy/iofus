import { beforeEach, describe, expect, it } from "vitest";
import {
  activatePanicMode,
  deactivatePanicMode,
  canViewPage,
  canViewPageFor,
  defaultPageDocument,
  getPageDocument,
  importPageData,
  exportPageData,
  listVersions,
  migrateDocument,
  parsePageDocument,
  PageDocumentValidationError,
  publishDraft,
  restoreVersion,
  saveDraftDocument,
  savePageDocument,
  setPublished,
  setVisibility,
  VersionNotFoundError,
  CURRENT_SCHEMA_VERSION,
} from "./pageDocument";
import { createUser } from "./auth";
import { blockUser } from "./friends";
import { resetDbForTests } from "./db";

process.env.IOFUS_DB_PATH = ":memory:";

beforeEach(async () => {
  resetDbForTests();
});

describe("parsePageDocument", () => {
  it("accepts a well-formed v2 document", async () => {
    const doc = defaultPageDocument("Void Arcade");
    expect(doc.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(() => parsePageDocument(doc)).not.toThrow();
  });

  it("rejects a document with the wrong schema version", async () => {
    const doc = { ...defaultPageDocument("Void"), version: 99 };
    expect(() => parsePageDocument(doc)).toThrow(PageDocumentValidationError);
  });

  it("rejects a non-hex-color theme value (CSS-injection-shaped input)", async () => {
    const doc = defaultPageDocument("Void");
    (doc.theme as unknown as Record<string, string>).accent = "red; } body { display:none";
    expect(() => parsePageDocument(doc)).toThrow(PageDocumentValidationError);
  });

  it("accepts a valid backgroundImageUrl", async () => {
    const doc = defaultPageDocument("Void");
    doc.theme.backgroundImageUrl = "https://example.com/tile.gif";
    doc.theme.backgroundTile = true;
    expect(() => parsePageDocument(doc)).not.toThrow();
  });

  it("rejects a javascript: backgroundImageUrl", async () => {
    const doc = defaultPageDocument("Void");
    (doc.theme as unknown as Record<string, string>).backgroundImageUrl = "javascript:alert(1)";
    expect(() => parsePageDocument(doc)).toThrow(PageDocumentValidationError);
  });

  it("defaults marqueeStatus and backgroundTile to false when omitted", async () => {
    const doc = defaultPageDocument("Void");
    const { backgroundTile, marqueeStatus, ...rest } = doc.theme;
    void backgroundTile;
    void marqueeStatus;
    const parsed = parsePageDocument({ ...doc, theme: rest });
    expect(parsed.theme.backgroundTile).toBe(false);
    expect(parsed.theme.marqueeStatus).toBe(false);
  });

  it("accepts a gallery image with empty alt text (decorative, not required)", async () => {
    const doc = defaultPageDocument("Void");
    doc.gallery.push({ id: crypto.randomUUID(), url: "https://example.com/pic.jpg", alt: "" });
    expect(() => parsePageDocument(doc)).not.toThrow();
  });

  it("defaults a missing gallery alt field to an empty string", async () => {
    const doc = defaultPageDocument("Void");
    const withGallery = {
      ...doc,
      gallery: [{ id: crypto.randomUUID(), url: "https://example.com/pic.jpg" }],
    };
    const parsed = parsePageDocument(withGallery);
    expect(parsed.gallery[0]!.alt).toBe("");
  });

  it("rejects a javascript: URL in a link", async () => {
    const doc = defaultPageDocument("Void");
    doc.links.push({ label: "click me", url: "javascript:alert(1)" });
    expect(() => parsePageDocument(doc)).toThrow(PageDocumentValidationError);
  });

  it("rejects a data: URL in a link", async () => {
    const doc = defaultPageDocument("Void");
    doc.links.push({ label: "click me", url: "data:text/html,<script>alert(1)</script>" });
    expect(() => parsePageDocument(doc)).toThrow(PageDocumentValidationError);
  });

  it("rejects a bio over the length limit", async () => {
    const doc = defaultPageDocument("Void");
    doc.identity.bio = "x".repeat(281);
    expect(() => parsePageDocument(doc)).toThrow(PageDocumentValidationError);
  });

  it("rejects an unknown page part id", async () => {
    const doc = defaultPageDocument("Void");
    (doc.pageParts as string[]).push("javascript-executor");
    expect(() => parsePageDocument(doc)).toThrow(PageDocumentValidationError);
  });

  it("rejects completely malformed input (not an object)", async () => {
    expect(() => parsePageDocument("not a document")).toThrow(PageDocumentValidationError);
    expect(() => parsePageDocument(null)).toThrow(PageDocumentValidationError);
    expect(() => parsePageDocument(undefined)).toThrow(PageDocumentValidationError);
  });

  it("error message lists the actual issues, not a generic message", async () => {
    try {
      parsePageDocument({});
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(PageDocumentValidationError);
      const err = e as PageDocumentValidationError;
      expect(err.issues.length).toBeGreaterThan(0);
    }
  });
});

describe("migrateDocument", () => {
  it("upgrades v1 documents to v3 without losing identity and links", async () => {
    const v1 = {
      version: 1,
      identity: { displayName: "Legacy Page", bio: "still here" },
      theme: { template: "soft-web", accent: "#e0526b", background: "#f6ecec", density: "cozy" },
      pageParts: ["identity", "links"],
      links: [{ label: "Home", url: "https://example.com" }],
      now: "building things",
    };
    const migrated = migrateDocument(v1);
    expect(migrated.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.identity.displayName).toBe("Legacy Page");
    expect(migrated.links).toEqual([{ label: "Home", url: "https://example.com" }]);
    expect(migrated.now).toBe("building things");
    expect(migrated.theme.fontStyle).toBe("sans");
    expect(migrated.theme.customCss).toBe("");
    expect(migrated.guestbook.enabled).toBe(true);
    expect(migrated.shrines).toEqual([]);
    expect(migrated.playlist).toEqual([]);
  });

  it("upgrades v2 documents to v3 with Phase 5 fields", async () => {
    const v2 = {
      version: 2,
      identity: { displayName: "V2 Page", bio: "" },
      theme: {
        template: "start-simple",
        accent: "#e0526b",
        background: "#f1ede9",
        density: "comfortable",
        fontStyle: "sans",
        reduceMotion: false,
      },
      pageParts: ["identity"],
      links: [],
      now: "",
      gallery: [],
      blog: [],
      devlog: [],
      badges: [],
      topEight: [],
      tags: [],
      guestbook: { enabled: true, requireApproval: true },
      access: { altTextReminder: true, contrastWarningsEnabled: true },
    };
    const migrated = migrateDocument(v2);
    expect(migrated.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.miniPages).toEqual([]);
    expect(migrated.theme.customCssEnabled).toBe(false);
    expect(migrated.theme.backgroundImageUrl).toBeUndefined();
    expect(migrated.theme.backgroundTile).toBe(false);
    expect(migrated.theme.marqueeStatus).toBe(false);
  });

  it("upgrades v3 documents to v4 by defaulting the new Y2K theme fields", async () => {
    const v3 = {
      ...defaultPageDocument("V3 Page"),
      version: 3,
    };
    // A real v3 document never had these keys at all.
    delete (v3.theme as Record<string, unknown>).backgroundImageUrl;
    delete (v3.theme as Record<string, unknown>).backgroundTile;
    delete (v3.theme as Record<string, unknown>).marqueeStatus;

    const migrated = migrateDocument(v3);
    expect(migrated.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.theme.backgroundImageUrl).toBeUndefined();
    expect(migrated.theme.backgroundTile).toBe(false);
    expect(migrated.theme.marqueeStatus).toBe(false);
    expect(migrated.identity.displayName).toBe("V3 Page");
  });
});

describe("savePageDocument / getPageDocument", () => {
  it("saves and retrieves a document for a real user", async () => {
    const user = await createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("Void Arcade"));
    const stored = getPageDocument(user.id);
    expect(stored?.document.identity.displayName).toBe("Void Arcade");
    expect(stored?.isPublished).toBe(false);
    expect(stored?.visibility).toBe("private");
  });

  it("returns null for a user with no page document yet", async () => {
    const user = await createUser("voidarcade", "correct-horse-battery");
    expect(getPageDocument(user.id)).toBeNull();
  });

  it("refuses to save an invalid document even for a real user", async () => {
    const user = await createUser("voidarcade", "correct-horse-battery");
    expect(() => savePageDocument(user.id, { garbage: true })).toThrow(PageDocumentValidationError);
    expect(getPageDocument(user.id)).toBeNull();
  });

  it("overwriting a document snapshots the previous version", async () => {
    const user = await createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("First Name"));
    savePageDocument(user.id, defaultPageDocument("Second Name"));

    const versions = listVersions(user.id);
    expect(versions.length).toBe(1);

    const stored = getPageDocument(user.id);
    expect(stored?.document.identity.displayName).toBe("Second Name");
  });
});

describe("restoreVersion", () => {
  it("restores an earlier version as current, and that restore is itself snapshotted", async () => {
    const user = await createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("First Name"));
    savePageDocument(user.id, defaultPageDocument("Second Name"));

    const versions = listVersions(user.id);
    const firstVersionId = versions[versions.length - 1]!.id;

    restoreVersion(user.id, firstVersionId);
    expect(getPageDocument(user.id)?.document.identity.displayName).toBe("First Name");

    // Restoring is itself a save, so it's reversible too.
    expect(listVersions(user.id).length).toBe(2);
  });

  it("throws for a version id that doesn't exist", async () => {
    const user = await createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("Void"));
    expect(() => restoreVersion(user.id, "not-a-real-version-id")).toThrow(VersionNotFoundError);
  });

  it("throws if the version belongs to a different user (no cross-account restore)", async () => {
    const userA = await createUser("voidarcade", "correct-horse-battery");
    const userB = await createUser("otheruser", "correct-horse-battery");
    savePageDocument(userA.id, defaultPageDocument("A v1"));
    savePageDocument(userA.id, defaultPageDocument("A v2"));
    const versionId = listVersions(userA.id)[0]!.id;

    expect(() => restoreVersion(userB.id, versionId)).toThrow(VersionNotFoundError);
  });
});

describe("setPublished / setVisibility", () => {
  it("publishes a page that already has a document", async () => {
    const user = await createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("Void"));
    setPublished(user.id, true);
    expect(getPageDocument(user.id)?.isPublished).toBe(true);
  });

  it("refuses to publish before any document exists", async () => {
    const user = await createUser("voidarcade", "correct-horse-battery");
    expect(() => setPublished(user.id, true)).toThrow();
  });

  it("changes visibility", async () => {
    const user = await createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("Void"));
    setVisibility(user.id, "public");
    expect(getPageDocument(user.id)?.visibility).toBe("public");
  });
});

describe("draft invariant: publishing by any path clears a stale draft", () => {
  it("restoreVersion discards the outstanding draft", async () => {
    const user = await createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("First Name"));
    savePageDocument(user.id, defaultPageDocument("Second Name"));
    const firstVersionId = listVersions(user.id)[listVersions(user.id).length - 1]!.id;

    saveDraftDocument(user.id, defaultPageDocument("Unrelated in-progress draft"));
    expect(getPageDocument(user.id)?.draftDocument).not.toBeNull();

    restoreVersion(user.id, firstVersionId);

    // The stale draft must not resurface on the next Studio load or preview.
    expect(getPageDocument(user.id)?.draftDocument).toBeNull();
  });

  it("publishDraft clears the draft it just promoted", async () => {
    const user = await createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("Published"));
    saveDraftDocument(user.id, defaultPageDocument("Draft"));

    publishDraft(user.id);

    const stored = getPageDocument(user.id);
    expect(stored?.document.identity.displayName).toBe("Draft");
    expect(stored?.draftDocument).toBeNull();
  });

  it("importPageData discards a stale draft that predates the import", async () => {
    const user = await createUser("voidarcade", "correct-horse-battery");
    savePageDocument(user.id, defaultPageDocument("Before import"));
    saveDraftDocument(user.id, defaultPageDocument("Stale draft"));

    const exported = exportPageData(user.id);
    importPageData(user.id, exported);

    expect(getPageDocument(user.id)?.draftDocument).toBeNull();
  });
});

describe("canViewPage", () => {
  it("private published pages are owner-only", async () => {
    const owner = await createUser("voidarcade", "correct-horse-battery");
    const viewer = await createUser("neonorchard", "correct-horse-battery");
    savePageDocument(owner.id, defaultPageDocument("Void"));
    setPublished(owner.id, true);
    setVisibility(owner.id, "private");
    const stored = getPageDocument(owner.id)!;

    expect(canViewPage(stored, owner.id, owner.id)).toBe(true);
    expect(canViewPage(stored, owner.id, viewer.id)).toBe(false);
    expect(canViewPage(stored, owner.id, null)).toBe(false);
  });

  it("unlisted published pages are visible to anyone", async () => {
    const owner = await createUser("voidarcade", "correct-horse-battery");
    savePageDocument(owner.id, defaultPageDocument("Void"));
    setPublished(owner.id, true);
    setVisibility(owner.id, "unlisted");
    const stored = getPageDocument(owner.id)!;

    expect(canViewPage(stored, owner.id, null)).toBe(true);
  });

  it("unpublished pages are owner-only", async () => {
    const owner = await createUser("voidarcade", "correct-horse-battery");
    savePageDocument(owner.id, defaultPageDocument("Void"));
    const stored = getPageDocument(owner.id)!;

    expect(canViewPage(stored, owner.id, owner.id)).toBe(true);
    expect(canViewPage(stored, owner.id, null)).toBe(false);
  });
});

describe("activatePanicMode", () => {
  it("keeps the page reachable by direct link, per its own documented promise", async () => {
    const owner = await createUser("panicuser", "correct-horse-battery");
    savePageDocument(owner.id, defaultPageDocument("Panic Test"));
    setPublished(owner.id, true);
    setVisibility(owner.id, "public");

    activatePanicMode(owner.id);
    const stored = getPageDocument(owner.id)!;

    // Regression: activatePanicMode previously set is_published=0 and
    // visibility='private', both of which independently block a non-owner
    // even with the direct link — contradicting the settings page's own
    // "People with the direct link can still visit" copy.
    expect(canViewPage(stored, owner.id, null)).toBe(true);
  });

  it("hides the page from discovery and disables the guestbook", async () => {
    const owner = await createUser("panicuser2", "correct-horse-battery");
    savePageDocument(owner.id, defaultPageDocument("Panic Test 2"));
    setPublished(owner.id, true);
    setVisibility(owner.id, "public");

    activatePanicMode(owner.id);
    const stored = getPageDocument(owner.id)!;

    expect(stored.visibility).toBe("unlisted");
    expect(stored.hiddenFromDiscovery).toBe(true);
    expect(stored.guestbookDisabled).toBe(true);
    expect(stored.isPublished).toBe(true);
  });

  it("sets visibility to the exact state the settings page checks for its confirmation UI", async () => {
    // Regression for the specific bug reported: settings/page.tsx's
    // confirmation text only renders when hiddenFromDiscovery && visibility
    // === "unlisted" — activatePanicMode previously set visibility to
    // 'private', so that condition never matched and the confirmation UI
    // never appeared even though the underlying update succeeded.
    const owner = await createUser("panicuser3", "correct-horse-battery");
    savePageDocument(owner.id, defaultPageDocument("Panic Test 3"));
    setPublished(owner.id, true);
    setVisibility(owner.id, "public");

    activatePanicMode(owner.id);
    const stored = getPageDocument(owner.id)!;

    const panicActive = stored.hiddenFromDiscovery && stored.visibility === "unlisted";
    expect(panicActive).toBe(true);
  });
});

describe("deactivatePanicMode", () => {
  it("restores the page to public, discoverable, and guestbook-enabled", async () => {
    const owner = await createUser("panicuser4", "correct-horse-battery");
    savePageDocument(owner.id, defaultPageDocument("Panic Test 4"));
    setPublished(owner.id, true);
    setVisibility(owner.id, "public");
    activatePanicMode(owner.id);

    deactivatePanicMode(owner.id);
    const stored = getPageDocument(owner.id)!;

    expect(stored.visibility).toBe("public");
    expect(stored.hiddenFromDiscovery).toBe(false);
    expect(stored.guestbookDisabled).toBe(false);
    expect(stored.isPublished).toBe(true);

    // The settings page's panicActive check must now read false — the
    // toggle button flips back to "Activate panic mode".
    const panicActive = stored.hiddenFromDiscovery && stored.visibility === "unlisted";
    expect(panicActive).toBe(false);
  });
});

describe("canViewPageFor", () => {
  async function publicPageOwnedBy(handle: string) {
    const owner = await createUser(handle, "correct-horse-battery");
    savePageDocument(owner.id, defaultPageDocument("Void"));
    setPublished(owner.id, true);
    setVisibility(owner.id, "public");
    return owner;
  }

  it("hides a public page from a reader the owner blocked", async () => {
    // The bug this covers: the blog and devlog RSS routes checked only
    // isPublished/visibility, so a blocked reader could still read every post
    // body through the feed even though the HTML route 404s for them.
    const owner = await publicPageOwnedBy("voidarcade");
    const reader = await createUser("neonorchard", "correct-horse-battery");
    blockUser(owner.id, reader.id);
    const stored = getPageDocument(owner.id)!;

    expect(canViewPage(stored, owner.id, reader.id)).toBe(true); // visibility alone says yes
    expect(canViewPageFor(stored, owner.id, reader.id)).toBe(false); // with blocks, no
  });

  it("hides the page in both directions of a block", async () => {
    const owner = await publicPageOwnedBy("voidarcade");
    const reader = await createUser("neonorchard", "correct-horse-battery");
    blockUser(reader.id, owner.id); // reader blocked the owner, not vice versa
    const stored = getPageDocument(owner.id)!;

    expect(canViewPageFor(stored, owner.id, reader.id)).toBe(false);
  });

  it("still shows a public page to an unblocked reader and to signed-out visitors", async () => {
    const owner = await publicPageOwnedBy("voidarcade");
    const reader = await createUser("neonorchard", "correct-horse-battery");
    const stored = getPageDocument(owner.id)!;

    expect(canViewPageFor(stored, owner.id, reader.id)).toBe(true);
    expect(canViewPageFor(stored, owner.id, null)).toBe(true);
  });

  it("always shows owners their own page", async () => {
    const owner = await publicPageOwnedBy("voidarcade");
    const stored = getPageDocument(owner.id)!;
    expect(canViewPageFor(stored, owner.id, owner.id)).toBe(true);
  });

  it("still enforces visibility and publication", async () => {
    const owner = await createUser("voidarcade", "correct-horse-battery");
    const reader = await createUser("neonorchard", "correct-horse-battery");
    savePageDocument(owner.id, defaultPageDocument("Void"));
    setPublished(owner.id, true);
    setVisibility(owner.id, "private");
    const stored = getPageDocument(owner.id)!;

    expect(canViewPageFor(stored, owner.id, reader.id)).toBe(false);
  });

  it("rejects a page id that matches no document", async () => {
    // The stamp endpoints accepted any UUID as a page owner, inserting rows
    // for pages that never existed.
    const reader = await createUser("neonorchard", "correct-horse-battery");
    expect(canViewPageFor(null, "no-such-owner", reader.id)).toBe(false);
  });
});
