"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Global keyboard shortcuts:
 *   E  → /explore
 *   R  → /explore/random
 *   G  → /@{handle} guestbook section (when on a profile page)
 *   J  → next explore card (handled locally by ExploreGrid)
 *   K  → prev explore card (handled locally by ExploreGrid)
 *   W  → /wander
 *   ?  → toggle shortcut help overlay (future)
 */
export function KeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't fire inside inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target as HTMLElement).isContentEditable
      ) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "e":
        case "E":
          e.preventDefault();
          router.push("/explore");
          break;
        case "r":
        case "R":
          e.preventDefault();
          router.push("/explore/random");
          break;
        case "w":
        case "W":
          e.preventDefault();
          router.push("/wander");
          break;
        case "m":
        case "M":
          e.preventDefault();
          router.push("/messages");
          break;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return null;
}
