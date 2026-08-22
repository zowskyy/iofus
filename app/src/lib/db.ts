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

/** Applies the base schema and any incremental column/index migrations to *db*. Safe to call on an already-migrated database. */
function migrate(db: DatabaseSync): void {
  const schemaPath = join(__dirname, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  // Incremental migrations for existing databases.
  if (!columnExists(db, "users", "is_moderator")) {
    db.exec("ALTER TABLE users ADD COLUMN is_moderator INTEGER NOT NULL DEFAULT 0");
  }
  if (!columnExists(db, "page_documents", "draft_document_json")) {
    db.exec("ALTER TABLE page_documents ADD COLUMN draft_document_json TEXT");
  }
  if (!columnExists(db, "page_documents", "guestbook_disabled")) {
    db.exec("ALTER TABLE page_documents ADD COLUMN guestbook_disabled INTEGER NOT NULL DEFAULT 0");
  }
  if (!columnExists(db, "reports", "moderator_id")) {
    db.exec("ALTER TABLE reports ADD COLUMN moderator_id TEXT REFERENCES users(id) ON DELETE SET NULL");
    db.exec("ALTER TABLE reports ADD COLUMN moderator_note TEXT");
    db.exec("ALTER TABLE reports ADD COLUMN reviewed_at TEXT");
  }
  if (!columnExists(db, "theme_reports", "moderator_id")) {
    db.exec("ALTER TABLE theme_reports ADD COLUMN moderator_id TEXT REFERENCES users(id) ON DELETE SET NULL");
    db.exec("ALTER TABLE theme_reports ADD COLUMN moderator_note TEXT");
    db.exec("ALTER TABLE theme_reports ADD COLUMN reviewed_at TEXT");
  }
  if (!indexExists(db, "idx_appeals_one_open_per_user")) {
    db.exec(
      "CREATE UNIQUE INDEX idx_appeals_one_open_per_user ON appeals(user_id) WHERE status = 'open'",
    );
  }
  if (!columnExists(db, "users", "reachable_for_asks")) {
    db.exec("ALTER TABLE users ADD COLUMN reachable_for_asks INTEGER NOT NULL DEFAULT 0");
  }
  if (!columnExists(db, "web_rings", "creator_user_id")) {
    db.exec("ALTER TABLE web_rings ADD COLUMN creator_user_id TEXT REFERENCES users(id) ON DELETE SET NULL");
  }
  if (!columnExists(db, "web_rings", "is_open")) {
    db.exec("ALTER TABLE web_rings ADD COLUMN is_open INTEGER NOT NULL DEFAULT 1");
  }
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS page_visits (
      id TEXT PRIMARY KEY,
      page_owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      visitor_session TEXT,
      visited_at TEXT NOT NULL
    )
  `);
  if (!indexExists(db, "idx_visits_owner")) {
    db.exec("CREATE INDEX IF NOT EXISTS idx_visits_owner ON page_visits(page_owner_id, visited_at)");
  }

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

  seedWebRings(db);
  seedCollections(db);
  seedSharedThemes(db);
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
  const seeds = [
    { name: "Y2K Chrome", description: "Glossy panels, cool blues, reflective accents.", tags: ["y2k", "glossy"], template: "chrome-angel", accent: "#0284c7", background: "#dbeafe", fontStyle: "sans" },
    { name: "Scene Neon", description: "Hot pink and electric purple nightlife energy.", tags: ["scene", "neon"], template: "chrome-angel", accent: "#ff4db8", background: "#160a23", fontStyle: "sans" },
    { name: "Pixel RPG Tavern", description: "Retro dungeon menu vibes.", tags: ["pixel", "rpg"], template: "pixel-tavern", accent: "#c7314b", background: "#241b2e", fontStyle: "mono" },
    { name: "Soft Angelcore", description: "Dreamy pastels and gentle serif type.", tags: ["soft", "angelcore"], template: "soft-web", accent: "#e0526b", background: "#f6ecec", fontStyle: "serif" },
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

/** Returns the singleton database connection, opening and migrating it on first call. */
export function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  const path = process.env.IOFUS_DB_PATH ?? join(__dirname, "..", "..", "iofus.db");
  dbInstance = new DatabaseSync(path);
  dbInstance.exec("PRAGMA foreign_keys = ON;");
  dbInstance.exec("PRAGMA journal_mode = WAL;");
  migrate(dbInstance);
  return dbInstance;
}

/** Closes and clears the singleton so the next `getDb()` call opens a fresh connection. Only for use in tests. */
export function resetDbForTests(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = undefined;
  }
}
