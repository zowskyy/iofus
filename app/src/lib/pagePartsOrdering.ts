import type { PagePartId } from "./pageDocumentTypes";

/**
 * Pure page-parts ordering operations, extracted from Studio's LayoutTab so
 * they're testable independently of React — previously this logic only
 * existed inline in the component's closures, which meant any test of it
 * would have had to reimplement the logic rather than exercise the real
 * code. LayoutTab.tsx now calls these directly.
 */

/** Moves the part at *index* one step in *direction* (-1 up, +1 down). Returns the same array reference (no-op) if the move would go out of bounds. */
export function movePagePart(parts: PagePartId[], index: number, direction: -1 | 1): PagePartId[] {
  const target = index + direction;
  if (index < 0 || index >= parts.length || target < 0 || target >= parts.length) return parts;
  const next = [...parts];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item!);
  return next;
}

/** Adds *part* if absent, removes it if present. Order of the remaining parts is otherwise preserved; a newly-added part goes at the end. */
export function togglePagePart(parts: PagePartId[], part: PagePartId): PagePartId[] {
  return parts.includes(part) ? parts.filter((p) => p !== part) : [...parts, part];
}
