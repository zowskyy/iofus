import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));

let dbInstance: DatabaseSync | undefined;

/** Returns true when *column* already exists in *table*, used to guard incremental ALTER TABLE migrations. */
function columnExists(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

/** Returns true when a SQLite index named *name* exists, used to guard CREATE INDEX migrations. */
function indexExists(db: DatabaseSync, name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?").get(name) as
    | { name: string }
    | undefined;
  return !!row;
}

/**
 * Adds *column* to *table* if it isn't already present. The existence check
 * and the ALTER are not atomic, so two processes can both see the column
 * missing and both issue the ALTER on first boot; the second one's
 * "duplicate column name" error is swallowed rather than aborting startup.
 */
function addColumnIfMissing(db: DatabaseSync, table: string, definition: string): void {
  const column = definition.trim().split(/\s+/)[0]!;
  if (columnExists(db, table, column)) return;
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  } catch (err) {
    if (err instanceof Error && /duplicate column name/i.test(err.message)) return;
    throw err;
  }
}

/** Applies the base schema and any incremental column/index migrations to *db*. Safe to call on an already-migrated database. */
function migrate(db: DatabaseSync): void {
  const schemaPath = join(__dirname, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  // Incremental migrations for existing databases.
  addColumnIfMissing(db, "users", "is_moderator INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "page_documents", "draft_document_json TEXT");
  addColumnIfMissing(db, "page_documents", "guestbook_disabled INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "reports", "moderator_id TEXT REFERENCES users(id) ON DELETE SET NULL");
  addColumnIfMissing(db, "reports", "moderator_note TEXT");
  addColumnIfMissing(db, "reports", "reviewed_at TEXT");
  addColumnIfMissing(db, "theme_reports", "moderator_id TEXT REFERENCES users(id) ON DELETE SET NULL");
  addColumnIfMissing(db, "theme_reports", "moderator_note TEXT");
  addColumnIfMissing(db, "theme_reports", "reviewed_at TEXT");
  if (!indexExists(db, "idx_appeals_one_open_per_user")) {
    try {
      db.exec(
        "CREATE UNIQUE INDEX idx_appeals_one_open_per_user ON appeals(user_id) WHERE status = 'open'",
      );
    } catch (err) {
      if (!(err instanceof Error && /already exists/i.test(err.message))) throw err;
    }
  }
  addColumnIfMissing(db, "users", "reachable_for_asks INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(db, "web_rings", "creator_user_id TEXT REFERENCES users(id) ON DELETE SET NULL");
  addColumnIfMissing(db, "web_rings", "is_open INTEGER NOT NULL DEFAULT 1");
  db.exec(`
    CREATE TABLE IF NOT EXISTS web_ring_join_requests (
      ring_id TEXT NOT NULL REFERENCES web_rings(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
      created_at TEXT NOT NULL,
      PRIMARY KEY (ring_id, user_id)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN (
        'guestbook_signed', 'friend_request', 'friend_accepted',
        'ask_answered', 'ring_join_request', 'ring_join_accepted'
      )),
      actor_handle TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      read_at TEXT,
      created_at TEXT NOT NULL
    )
  `);
  if (!indexExists(db, "idx_notifications_user")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at)");
  }

  // page_visits (per-page visitor-session tracking) and the in-memory
  // presence store were removed: PLAN.md's "Decisions" section states
  // "Visitor privacy — decided: none. Creators do not get page views,
  // referrers, or any visitor analytics... this is not revisited quietly
  // later," and /policy promises visitors "No visitor analytics or
  // tracking pixels on your page." A visible page-view counter and a live
  // viewer-presence indicator both broke that promise. Drop the table (and
  // its index) outright for already-migrated databases rather than leaving
  // dead visitor data sitting around unused.
  db.exec("DROP TABLE IF EXISTS page_visits");

  db.exec(`
    CREATE TABLE IF NOT EXISTS page_stamps (
      id TEXT PRIMARY KEY,
      page_owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stamper_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      stamper_handle TEXT,
      stamp_emoji TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
  if (!indexExists(db, "idx_stamps_owner")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_stamps_owner ON page_stamps(page_owner_id, created_at)");
  }

  // Proximity graph: shared infra for Wander and Vibe Graph.
  // Edges are written when guestbook entries are submitted or ring members join.
  // Page visits are intentionally excluded (passive surveillance).
  db.exec(`
    CREATE TABLE IF NOT EXISTS graph_edges (
      from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      edge_type TEXT NOT NULL CHECK (edge_type IN ('guestbook', 'ring')),
      weight INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      PRIMARY KEY (from_user_id, to_user_id, edge_type)
    )
  `);
  if (!indexExists(db, "idx_graph_edges_to")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_graph_edges_to ON graph_edges(to_user_id)");
  }

  // Ambient status: ephemeral user-set status strings ("currently listening/making/feeling").
  // Plain text only. Max 100 chars enforced at lib layer. 24h TTL.
  db.exec(`
    CREATE TABLE IF NOT EXISTS ambient_statuses (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `);

  // Each seed*() below does its own "SELECT COUNT(*) ... if > 0 return"
  // check before inserting fixed-slug/fixed-name rows. A real multi-process
  // test caught the race that check-then-act invites: two processes can
  // both see an empty table and both insert the same seed rows — for
  // web_rings/collections (whose slug column is UNIQUE) that surfaced as an
  // uncaught "UNIQUE constraint failed" crashing migrate() outright, and
  // shared_themes has no unique column for SQLite to de-duplicate against
  // at all, so it would have silently ended up with duplicate seed themes.
  // Wrapping all three in one transaction makes the whole "check candidates,
  // seed defaults" phase atomic: a second process's BEGIN IMMEDIATE waits
  // (via the busy_timeout set above) for the first to commit, then its own
  // count check correctly sees the rows already exist and skips seeding.
  db.exec("BEGIN IMMEDIATE");
  try {
    seedWebRings(db);
    seedCollections(db);
    seedSharedThemes(db);
    fixLegacyThemeContrast(db);
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already resolved */
    }
    throw err;
  }
}

/** Seed the default web rings if none exist yet. Idempotent. */
function seedWebRings(db: DatabaseSync): void {
  const count = db.prepare("SELECT COUNT(*) as c FROM web_rings").get() as { c: number };
  if (count.c > 0) return;
  const now = new Date().toISOString();
  const rings = [
    { slug: "soft-web-webring", name: "Soft Web Webring", description: "Gentle pages, warm colors, quiet corners." },
    { slug: "pixel-tavern-ring", name: "Pixel Tavern Ring", description: "Retro vibes, monospace energy, late-night pages." },
    { slug: "creative-coders", name: "Creative Coders", description: "People making things and writing about the process." },
  ];
  const stmt = db.prepare(
    "INSERT INTO web_rings (id, slug, name, description, creator_user_id, is_open, created_at) VALUES (?, ?, ?, ?, NULL, 1, ?)",
  );
  for (const ring of rings) {
    stmt.run(randomUUID(), ring.slug, ring.name, ring.description, now);
  }
}

/** Seed the default collections if none exist yet. Idempotent. */
function seedCollections(db: DatabaseSync): void {
  const count = db.prepare("SELECT COUNT(*) as c FROM collections").get() as { c: number };
  if (count.c > 0) return;
  const now = new Date().toISOString();
  const collections = [
    { slug: "freshly-painted", title: "Freshly Painted", description: "Pages recently redecorated and worth a look." },
    { slug: "quiet-corners", title: "Quiet Corners", description: "Small, personal spaces with a calm mood." },
  ];
  const stmt = db.prepare(
    "INSERT INTO collections (id, slug, title, description, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  for (const c of collections) {
    stmt.run(randomUUID(), c.slug, c.title, c.description, now);
  }
}

/** Seed the default shared themes if none exist yet. Idempotent. */
function seedSharedThemes(db: DatabaseSync): void {
  const count = db.prepare("SELECT COUNT(*) as c FROM shared_themes").get() as { c: number };
  if (count.c > 0) return;
  const now = new Date().toISOString();
  // Y2K Chrome, Pixel RPG Tavern, and Soft Angelcore originally reused the
  // pre-fix pageDocumentTheme.ts accents (#0284c7, #c7314b, #e0526b), which
  // failed 4.5:1 WCAG AA contrast against their paired background — see the
  // matching comment in pageDocumentTheme.ts.
  const seeds = [
    { name: "Y2K Chrome", description: "Glossy panels, cool blues, reflective accents.", tags: ["y2k", "glossy"], template: "chrome-angel", accent: "#026ea7", background: "#dbeafe", fontStyle: "sans" },
    { name: "Scene Neon", description: "Hot pink and electric purple nightlife energy.", tags: ["scene", "neon"], template: "chrome-angel", accent: "#ff4db8", background: "#160a23", fontStyle: "sans" },
    { name: "Pixel RPG Tavern", description: "Retro dungeon menu vibes.", tags: ["pixel", "rpg"], template: "pixel-tavern", accent: "#d75e73", background: "#241b2e", fontStyle: "mono" },
    { name: "Soft Angelcore", description: "Dreamy pastels and gentle serif type.", tags: ["soft", "angelcore"], template: "soft-web", accent: "#cf2543", background: "#f6ecec", fontStyle: "serif" },
    { name: "CRT Terminal", description: "Green phosphor on near-black.", tags: ["crt", "terminal"], template: "dark-zine", accent: "#7fbe95", background: "#0e0e0e", fontStyle: "mono" },
    { name: "Indie Devlog", description: "Clean, readable, maker-focused.", tags: ["devlog", "minimal"], template: "clean-portfolio", accent: "#2563eb", background: "#ffffff", fontStyle: "sans" },
    { name: "Zine Punk", description: "High contrast cut-and-paste energy.", tags: ["zine", "punk"], template: "dark-zine", accent: "#f1eaee", background: "#0e0e0e", fontStyle: "serif" },
    { name: "Minimal Reader", description: "Maximum readability, minimum noise.", tags: ["minimal", "reader"], template: "start-simple", accent: "#241b2e", background: "#f1ede9", fontStyle: "sans" },
  ];
  const stmt = db.prepare(
    `INSERT INTO shared_themes (id, creator_user_id, name, description, tags_json, version, theme_json, created_at, updated_at)
     VALUES (?, NULL, ?, ?, ?, 1, ?, ?, ?)`,
  );
  for (const seed of seeds) {
    const themeData = {
      template: seed.template,
      accent: seed.accent,
      background: seed.background,
      density: "comfortable",
      fontStyle: seed.fontStyle,
      reduceMotion: false,
      customCss: "",
      customCssEnabled: false,
      attribution: undefined,
    };
    stmt.run(randomUUID(), seed.name, seed.description, JSON.stringify(seed.tags), JSON.stringify(themeData), now, now);
  }
}

/**
 * One-time repair for databases seeded before the contrast fix above: an
 * already-seeded shared_themes table (count > 0) short-circuits
 * seedSharedThemes entirely, so it would otherwise keep the old
 * failing-contrast accents (#0284c7, #c7314b, #e0526b) forever. Rewrites
 * only the exact legacy seed rows (matched by name AND their original
 * accent, so a creator's own edited copy of a same-named theme is never
 * touched) to the corrected accent. Safe to run on every boot — idempotent
 * once the accents are already corrected.
 */
function fixLegacyThemeContrast(db: DatabaseSync): void {
  const legacyFixes: { name: string; oldAccent: string; newAccent: string }[] = [
    { name: "Y2K Chrome", oldAccent: "#0284c7", newAccent: "#026ea7" },
    { name: "Pixel RPG Tavern", oldAccent: "#c7314b", newAccent: "#d75e73" },
    { name: "Soft Angelcore", oldAccent: "#e0526b", newAccent: "#cf2543" },
  ];
  const rows = db
    .prepare("SELECT id, name, theme_json FROM shared_themes WHERE name IN (?, ?, ?)")
    .all(...legacyFixes.map((f) => f.name)) as { id: string; name: string; theme_json: string }[];
  const update = db.prepare("UPDATE shared_themes SET theme_json = ? WHERE id = ?");
  for (const row of rows) {
    const fix = legacyFixes.find((f) => f.name === row.name);
    if (!fix) continue;
    const theme = JSON.parse(row.theme_json) as { accent?: string };
    if (theme.accent !== fix.oldAccent) continue;
    theme.accent = fix.newAccent;
    update.run(JSON.stringify(theme), row.id);
  }
}

/** True when *error* is SQLite's "database is locked" (SQLITE_BUSY) — the specific, narrow condition first-boot migration retries, never any other failure. */
function isSqliteBusy(error: unknown): boolean {
  return error instanceof Error && /database is locked/i.test(error.message);
}

const MIGRATION_RETRY_ATTEMPTS = 3;

/** Opens a fresh connection and runs migrate() on it. Throws (never leaves a wedged connection behind) on failure. */
function openAndMigrate(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA journal_mode = WAL;");
    // Without this, SQLite raises SQLITE_BUSY ("database is locked")
    // immediately whenever a second connection's write overlaps the first —
    // confirmed with a real multi-process test (tests/concurrency), not
    // assumed from documentation. A busy_timeout makes SQLite itself block
    // and retry internally for up to this many ms before giving up — a
    // bounded, deterministic wait, not an application-level retry loop —
    // so ordinary transient contention (two requests touching the same row
    // a few milliseconds apart) resolves on its own instead of failing a
    // real user's request. Callers (e.g. rateLimit.ts's BEGIN IMMEDIATE)
    // still see a real thrown error if contention outlasts this window.
    db.exec("PRAGMA busy_timeout = 5000;");
    migrate(db);
    return db;
  } catch (err) {
    try {
      db.close();
    } catch {
      /* already unusable */
    }
    throw err;
  }
}

/** Returns the singleton database connection, opening and migrating it on first call. */
export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  const path = process.env.IOFUS_DB_PATH ?? join(__dirname, "..", "..", "iofus.db");
  // Built up in a local first, and only assigned to the module-level
  // singleton once setup fully succeeds. A real multi-process test caught
  // the bug in assigning `dbInstance` before migrate() runs: if migration
  // hit contention and threw, the *next* getDb() call in this same process
  // saw the already-non-null (but never-migrated) singleton and returned
  // it straight away via the guard above — permanently wedging every later
  // query in that process with "no such table" errors instead of
  // retrying. Discarding a failed attempt means the next call starts clean.
  //
  // Several processes racing to migrate a brand-new database file at once
  // (multi-process cold start) is a real, reproduced scenario where the
  // sheer number of DDL statements in migrate() can occasionally still
  // exceed a single busy_timeout window even with it set — migrate() is
  // fully idempotent (every statement is CREATE TABLE IF NOT EXISTS or a
  // checked ALTER), so a small, bounded number of whole-setup retries is
  // safe and correct here specifically, unlike a steady-state query.
  let lastError: unknown;
  for (let attempt = 1; attempt <= MIGRATION_RETRY_ATTEMPTS; attempt++) {
    try {
      dbInstance = openAndMigrate(path);
      return dbInstance;
    } catch (err) {
      lastError = err;
      if (!isSqliteBusy(err) || attempt === MIGRATION_RETRY_ATTEMPTS) throw err;
    }
  }
  // Unreachable (the loop always returns or throws), but keeps TypeScript's
  // control-flow analysis happy without an unsound non-null assertion.
  throw lastError;
}

/** Closes and clears the singleton so the next `getDb()` call opens a fresh connection. Only for use in tests. */
export function resetDbForTests(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = undefined;
  }
}
