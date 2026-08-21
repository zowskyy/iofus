import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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
