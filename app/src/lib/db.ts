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

  // Feature: visitor counter
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

  // Feature: visitor stamp wall
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
