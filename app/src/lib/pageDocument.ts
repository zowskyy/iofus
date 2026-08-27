import { z } from "zod";
import { getDb } from "./db";
import { randomUUID } from "node:crypto";
import {
  CURRENT_SCHEMA_VERSION,
  PageDocumentSchema,
  defaultPageDocumentFieldsV3,
  type PageDocument,
  type StoredPage,
} from "./pageDocumentTypes";

export {
  CURRENT_SCHEMA_VERSION,
  PageDocumentSchema,
  PAGE_PART_IDS,
  type PageDocument,
  type PagePartId,
  type StoredPage,
  type TemplateId,
  type Shrine,
  type PlaylistTrack,
  type PixelArtPiece,
  type MiniPage,
} from "./pageDocumentTypes";

/** Returns a minimal valid v4 PageDocument pre-populated with *displayName* and platform defaults. */
export function defaultPageDocument(displayName: string): PageDocument {
  return {
    version: CURRENT_SCHEMA_VERSION,
    identity: { displayName, bio: "" },
    theme: {
      template: "start-simple",
      accent: "#111111",
      background: "#ffffff",
      density: "comfortable",
      fontStyle: "sans",
      reduceMotion: false,
      customCss: "",
      customCssEnabled: false,
      backgroundImageUrl: undefined,
      backgroundTile: false,
      marqueeStatus: false,
      attribution: undefined,
    },
    pageParts: ["identity", "links", "now"],
    links: [],
    now: "",
    ...defaultPageDocumentFieldsV3(),
  };
}

/** Migrates a raw stored object from any supported schema version up to the current v4 shape. */
export function migrateDocument(input: Record<string, unknown>): PageDocument {
  if (input.version === CURRENT_SCHEMA_VERSION) return parsePageDocument(input);

  if (input.version === 3) {
    // v3 -> v4 only adds optional/defaulted theme fields
    // (backgroundImageUrl, backgroundTile, marqueeStatus) — Zod fills
    // them in automatically via .optional()/.default(), so nothing
    // needs to be rewritten here beyond bumping the version number.
    return parsePageDocument({ ...input, version: CURRENT_SCHEMA_VERSION });
  }

  if (input.version === 2) {
    const theme = input.theme as Record<string, unknown> | undefined;
    return parsePageDocument({
      ...input,
      version: CURRENT_SCHEMA_VERSION,
      theme: {
        ...theme,
        customCss: "",
        customCssEnabled: false,
        attribution: undefined,
      },
      shrines: [],
      playlist: [],
      pixelArt: [],
      miniPages: [],
    });
  }

  if (input.version === 1) {
    const theme = input.theme as Record<string, unknown> | undefined;
    return parsePageDocument({
      ...input,
      version: CURRENT_SCHEMA_VERSION,
      theme: {
        template: theme?.template ?? "start-simple",
        accent: theme?.accent ?? "#e0526b",
        background: theme?.background ?? "#f1ede9",
        density: theme?.density ?? "comfortable",
        fontStyle: "sans",
        reduceMotion: false,
        customCss: "",
        customCssEnabled: false,
        attribution: undefined,
      },
      ...defaultPageDocumentFieldsV3(),
    });
  }

  return parsePageDocument(input);
}

export class PageDocumentValidationError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(`Page document is invalid: ${issues.join("; ")}`);
    this.issues = issues;
  }
}

/** Parse and validate *input* as a PageDocument, migrating schema versions as needed. Throws on malformed input. */
export function parsePageDocument(input: unknown): PageDocument {
  const result = PageDocumentSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new PageDocumentValidationError(issues);
  }
  return result.data;
}

/** Converts a raw SQLite row into a StoredPage, running schema migration when the stored version is outdated. */
function rowToStored(row: {
  document_json: string;
  draft_document_json: string | null;
  is_published: number;
  visibility: string;
  hidden_from_discovery: number;
  guestbook_disabled: number;
  updated_at: string;
}): StoredPage {
  const raw = JSON.parse(row.document_json) as Record<string, unknown>;
  const document =
    raw.version === CURRENT_SCHEMA_VERSION ? parsePageDocument(raw) : migrateDocument(raw);
  let draftDocument: PageDocument | null = null;
  if (row.draft_document_json) {
    const draftRaw = JSON.parse(row.draft_document_json) as Record<string, unknown>;
    draftDocument =
      draftRaw.version === CURRENT_SCHEMA_VERSION ? parsePageDocument(draftRaw) : migrateDocument(draftRaw);
  }
  return {
    document,
    draftDocument,
    isPublished: !!row.is_published,
    visibility: row.visibility as StoredPage["visibility"],
    hiddenFromDiscovery: !!row.hidden_from_discovery,
    guestbookDisabled: !!row.guestbook_disabled,
    updatedAt: row.updated_at,
  };
}

/** Loads the full StoredPage record for *userId*, or null when no page exists yet. */
export function getPageDocument(userId: string): StoredPage | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT document_json, draft_document_json, is_published, visibility, hidden_from_discovery,
              guestbook_disabled, updated_at
       FROM page_documents WHERE user_id = ?`,
    )
    .get(userId) as Parameters<typeof rowToStored>[0] | undefined;
  if (!row) return null;
  return rowToStored(row);
}

const MAX_VERSIONS_KEPT = 50;

/**
 * Validate, migrate, and persist a new published document for *userId*.
 * Snaps a version history entry, and clears any outstanding draft.
 *
 * This is the single place every "this is now the published document" path
 * converges (Studio's explicit publish, restoreVersion, publishDraft,
 * import) — a stale draft left over from before the new document was
 * published must never resurface, so clearing it here (rather than at each
 * call site) is the one invariant that keeps all of them correct.
 */
export function savePageDocument(userId: string, input: unknown): PageDocument {
  const document = parsePageDocument(input);
  const db = getDb();
  const now = new Date().toISOString();

  const existing = db
    .prepare("SELECT document_json FROM page_documents WHERE user_id = ?")
    .get(userId) as { document_json: string } | undefined;

  if (existing) {
    db.prepare(
      "INSERT INTO page_document_versions (id, user_id, document_json, created_at) VALUES (?, ?, ?, ?)",
    ).run(randomUUID(), userId, existing.document_json, now);

    db.prepare(
      "UPDATE page_documents SET document_json = ?, draft_document_json = NULL, updated_at = ? WHERE user_id = ?",
    ).run(JSON.stringify(document), now, userId);
  } else {
    db.prepare(
      `INSERT INTO page_documents (user_id, document_json, is_published, visibility, updated_at)
       VALUES (?, ?, 0, 'private', ?)`,
    ).run(userId, JSON.stringify(document), now);
  }

  syncPageTags(userId, document.tags);

  db.prepare(
    `DELETE FROM page_document_versions
     WHERE user_id = ? AND id NOT IN (
       SELECT id FROM page_document_versions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
     )`,
  ).run(userId, userId, MAX_VERSIONS_KEPT);

  return document;
}

/** Persist an in-progress draft for *userId* without touching the published document or version history. */
export function saveDraftDocument(userId: string, input: unknown): PageDocument {
  const document = parsePageDocument(input);
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT user_id FROM page_documents WHERE user_id = ?").get(userId);
  if (!existing) throw new Error("Cannot save a draft before a page document exists.");
  db.prepare("UPDATE page_documents SET draft_document_json = ?, updated_at = ? WHERE user_id = ?").run(
    JSON.stringify(document),
    now,
    userId,
  );
  return document;
}

/** Promote the saved draft to the published document, snapping a version history entry. Throws when no draft exists. */
export function publishDraft(userId: string): PageDocument {
  const db = getDb();
  const row = db
    .prepare("SELECT draft_document_json, document_json FROM page_documents WHERE user_id = ?")
    .get(userId) as { draft_document_json: string | null; document_json: string } | undefined;
  if (!row?.draft_document_json) throw new Error("No draft to publish.");
  return savePageDocument(userId, JSON.parse(row.draft_document_json));
}

/** Delete the saved draft for *userId* without affecting the published document. */
export function discardDraft(userId: string): void {
  const db = getDb();
  db.prepare("UPDATE page_documents SET draft_document_json = NULL WHERE user_id = ?").run(userId);
}

/** Whether a viewer may access a page (profile, blog, mini-pages, guestbook). */
export function canViewPage(
  stored: StoredPage | null,
  ownerId: string,
  viewerId: string | null,
): boolean {
  if (!stored) return false;
  const isOwner = viewerId === ownerId;
  if (!stored.isPublished && !isOwner) return false;
  if (stored.visibility === "private" && !isOwner) return false;
  return true;
}

/** Returns the draft when the owner is in preview, otherwise the published document. */
export function getEffectiveDocument(stored: StoredPage, isOwner: boolean, safePreview: boolean): PageDocument {
  if (isOwner && safePreview && stored.draftDocument) return stored.draftDocument;
  return stored.document;
}

/** Returns the mini-page definition matching *slug* from *document*, or null when not found. */
export function getMiniPage(document: PageDocument, slug: string) {
  return document.miniPages.find((p) => p.slug === slug) ?? null;
}

/** Replaces all page_tags rows for *userId* with the normalized *tags* list. */
function syncPageTags(userId: string, tags: string[]): void {
  const db = getDb();
  db.prepare("DELETE FROM page_tags WHERE user_id = ?").run(userId);
  const insert = db.prepare("INSERT INTO page_tags (user_id, tag) VALUES (?, ?)");
  for (const tag of tags) {
    insert.run(userId, tag.toLowerCase());
  }
}

/** Lists saved version history entries for *userId*, newest first. */
export function listVersions(userId: string): { id: string; createdAt: string }[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, created_at FROM page_document_versions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC",
    )
    .all(userId) as { id: string; created_at: string }[];
  return rows.map((r) => ({ id: r.id, createdAt: r.created_at }));
}

export class VersionNotFoundError extends Error {}

/** Restore a version history snapshot to the published document, snapping a new history entry. Throws when the version doesn't exist or belong to the user. */
export function restoreVersion(userId: string, versionId: string): PageDocument {
  const db = getDb();
  const versionRow = db
    .prepare("SELECT document_json FROM page_document_versions WHERE id = ? AND user_id = ?")
    .get(versionId, userId) as { document_json: string } | undefined;
  if (!versionRow) throw new VersionNotFoundError(`No such version: ${versionId}`);
  return savePageDocument(userId, migrateDocument(JSON.parse(versionRow.document_json)));
}

/** Toggle whether *userId*'s page is publicly visible. Unpublished pages return 404 for non-owners. */
export function setPublished(userId: string, published: boolean): void {
  const db = getDb();
  const existing = db.prepare("SELECT user_id FROM page_documents WHERE user_id = ?").get(userId);
  if (!existing) throw new Error("Cannot publish before a page document exists — save one first.");
  db.prepare("UPDATE page_documents SET is_published = ?, updated_at = ? WHERE user_id = ?").run(
    published ? 1 : 0,
    new Date().toISOString(),
    userId,
  );
}

/** Set *userId*'s page visibility to "public", "friends", or "private". */
export function setVisibility(userId: string, visibility: StoredPage["visibility"]): void {
  const db = getDb();
  db.prepare("UPDATE page_documents SET visibility = ?, updated_at = ? WHERE user_id = ?").run(
    visibility,
    new Date().toISOString(),
    userId,
  );
}

/** Hide or show *userId*'s page from the Explore/discovery feed. */
export function setHiddenFromDiscovery(userId: string, hidden: boolean): void {
  const db = getDb();
  db.prepare("UPDATE page_documents SET hidden_from_discovery = ?, updated_at = ? WHERE user_id = ?").run(
    hidden ? 1 : 0,
    new Date().toISOString(),
    userId,
  );
}

/** Enable or disable the guestbook module on *userId*'s page. */
export function setGuestbookDisabled(userId: string, disabled: boolean): void {
  const db = getDb();
  db.prepare("UPDATE page_documents SET guestbook_disabled = ?, updated_at = ? WHERE user_id = ?").run(
    disabled ? 1 : 0,
    new Date().toISOString(),
    userId,
  );
}

/** Immediately unpublish the page, set visibility to private, hide from discovery, and disable the guestbook in one atomic step. */
export function activatePanicMode(userId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE page_documents SET is_published = 0, visibility = 'private', hidden_from_discovery = 1, guestbook_disabled = 1, updated_at = ? WHERE user_id = ?",
  ).run(new Date().toISOString(), userId);
}

/** Serialize the full page record for *userId* to a portable JSON string for export/backup. */
export function exportPageData(userId: string): string {
  const stored = getPageDocument(userId);
  if (!stored) throw new Error("No page to export.");
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      document: stored.document,
      isPublished: stored.isPublished,
      visibility: stored.visibility,
      hiddenFromDiscovery: stored.hiddenFromDiscovery,
    },
    null,
    2,
  );
}

/** Parse a JSON export string and replace *userId*'s page data, snapping a version history entry. */
export function importPageData(userId: string, json: string): PageDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new PageDocumentValidationError(["import file is not valid JSON"]);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new PageDocumentValidationError(["import file must be a JSON object"]);
  }
  const obj = parsed as { document?: unknown };
  if (!obj.document || typeof obj.document !== "object" || Array.isArray(obj.document)) {
    throw new PageDocumentValidationError(["import file must contain a document object field"]);
  }
  return savePageDocument(userId, migrateDocument(obj.document as Record<string, unknown>));
}
