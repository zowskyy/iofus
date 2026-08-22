import { getDb } from "./db";

export type EdgeType = "guestbook" | "ring";

export interface GraphEdge {
  fromUserId: string;
  toUserId: string;
  edgeType: EdgeType;
  weight: number;
  createdAt: string;
}

const MAX_BFS_DEPTH = 3;
const MAX_NEIGHBORS_PER_STEP = 50;

/**
 * Record a directed edge in the proximity graph.
 * Called when a guestbook entry is submitted or a user joins a ring.
 * Idempotent: updates weight on conflict.
 */
export function recordEdge(fromUserId: string, toUserId: string, edgeType: EdgeType): void {
  if (fromUserId === toUserId) return;
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO graph_edges (from_user_id, to_user_id, edge_type, weight, created_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT (from_user_id, to_user_id, edge_type)
     DO UPDATE SET weight = weight + 1`,
  ).run(fromUserId, toUserId, edgeType, now);
}

/**
 * Remove edges from *fromUserId* to *toUserId* for *edgeType*.
 * Decrements weight; deletes edge only when weight reaches 0.
 * Called when a ring member leaves or a guestbook entry is deleted.
 */
export function removeEdge(fromUserId: string, toUserId: string, edgeType: EdgeType): void {
  const db = getDb();
  db.prepare("UPDATE graph_edges SET weight = weight - 1 WHERE from_user_id = ? AND to_user_id = ? AND edge_type = ?").run(
    fromUserId,
    toUserId,
    edgeType,
  );
  db.prepare("DELETE FROM graph_edges WHERE from_user_id = ? AND to_user_id = ? AND edge_type = ? AND weight <= 0").run(
    fromUserId,
    toUserId,
    edgeType,
  );
}

/**
 * BFS from *startUserId* outward, returning user IDs ordered by proximity.
 * Depth is capped at MAX_BFS_DEPTH; each BFS step fetches at most MAX_NEIGHBORS_PER_STEP neighbors.
 *
 * Returns user IDs only — callers join against page_documents for profile data.
 */
export function getProximityOrdered(startUserId: string, limit = 30): string[] {
  const db = getDb();
  const visited = new Set<string>([startUserId]);
  const ordered: string[] = [];
  let frontier = [startUserId];

  for (let depth = 0; depth < MAX_BFS_DEPTH && frontier.length > 0 && ordered.length < limit; depth++) {
    const placeholders = frontier.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `SELECT to_user_id, SUM(weight) as total_weight
         FROM graph_edges
         WHERE from_user_id IN (${placeholders})
         GROUP BY to_user_id
         ORDER BY total_weight DESC
         LIMIT ${MAX_NEIGHBORS_PER_STEP}`,
      )
      .all(...frontier) as { to_user_id: string; total_weight: number }[];

    const nextFrontier: string[] = [];
    for (const row of rows) {
      if (!visited.has(row.to_user_id)) {
        visited.add(row.to_user_id);
        ordered.push(row.to_user_id);
        nextFrontier.push(row.to_user_id);
        if (ordered.length >= limit) break;
      }
    }
    frontier = nextFrontier;
  }

  return ordered;
}

/**
 * Returns handles ordered by graph proximity to *startUserId*, falling back to
 * random discoverable pages when the graph returns fewer than *limit* results.
 * Only returns handles with published, public, non-hidden pages.
 */
export function getWanderBatch(startUserId: string | null, limit = 30): string[] {
  const db = getDb();

  const discoverableWhere = `
    pd.is_published = 1 AND pd.visibility = 'public' AND pd.hidden_from_discovery = 0
    AND u.is_blocked_platform = 0
  `;

  if (startUserId) {
    const proximityIds = getProximityOrdered(startUserId, limit);

    if (proximityIds.length > 0) {
      // Validate that the proximity IDs have discoverable pages
      const placeholders = proximityIds.map(() => "?").join(", ");
      const rows = db
        .prepare(
          `SELECT pd.user_id, u.handle FROM page_documents pd
           JOIN users u ON u.id = pd.user_id
           WHERE pd.user_id IN (${placeholders}) AND ${discoverableWhere}`,
        )
        .all(...proximityIds) as { user_id: string; handle: string }[];

      // Preserve proximity order from the graph
      const idToHandle = new Map(rows.map((r) => [r.user_id, r.handle]));
      const ordered = proximityIds.map((id) => idToHandle.get(id)).filter((h): h is string => h !== undefined);

      if (ordered.length >= limit) return ordered;

      // Partial proximity results: fill gap with random pages, excluding already selected
      if (ordered.length > 0) {
        const selectedUserIds = proximityIds.slice(0, rows.length);
        const excludePlaceholders = selectedUserIds.map(() => "?").join(", ");
        const remaining = limit - ordered.length;
        const random = db
          .prepare(
            `SELECT u.handle FROM page_documents pd
             JOIN users u ON u.id = pd.user_id
             WHERE ${discoverableWhere} AND pd.user_id NOT IN (${excludePlaceholders})
             ORDER BY RANDOM()
             LIMIT ?`,
          )
          .all(...selectedUserIds, remaining) as { handle: string }[];
        return ordered.concat(random.map((r) => r.handle));
      }
    }
  }

  // Cold start / not enough graph edges: random discoverable pages
  const rows = db
    .prepare(
      `SELECT u.handle FROM page_documents pd
       JOIN users u ON u.id = pd.user_id
       WHERE ${discoverableWhere}
       ORDER BY RANDOM()
       LIMIT ?`,
    )
    .all(limit) as { handle: string }[];
  return rows.map((r) => r.handle);
}
