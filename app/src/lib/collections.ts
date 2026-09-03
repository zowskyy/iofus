import { getDb } from "./db";

export interface Collection {
  id: string;
  slug: string;
  title: string;
  description: string;
}

export interface CollectionPage {
  handle: string;
  displayName: string;
  position: number;
}

export function listCollections(): Collection[] {
  const db = getDb();
  return db
    .prepare("SELECT id, slug, title, description FROM collections ORDER BY title ASC")
    .all() as unknown as Collection[];
}

export function getCollectionBySlug(slug: string): Collection | null {
  const db = getDb();
  const row = db
    .prepare("SELECT id, slug, title, description FROM collections WHERE slug = ?")
    .get(slug) as Collection | undefined;
  return row ?? null;
}

export function listCollectionPages(collectionId: string): CollectionPage[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT u.handle, pd.document_json, cp.position
       FROM collection_pages cp
       JOIN users u ON u.id = cp.user_id
       JOIN page_documents pd ON pd.user_id = cp.user_id
       WHERE cp.collection_id = ?
         AND pd.is_published = 1 AND pd.visibility = 'public'
       ORDER BY cp.position ASC`,
    )
    .all(collectionId) as { handle: string; document_json: string; position: number }[];

  return rows.map((r) => {
    let displayName = r.handle;
    try {
      const doc = JSON.parse(r.document_json) as { identity?: { displayName?: string } };
      if (doc.identity?.displayName) displayName = doc.identity.displayName;
    } catch { /* fall back */ }
    return { handle: r.handle, displayName, position: r.position };
  });
}
