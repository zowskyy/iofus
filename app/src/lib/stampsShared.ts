/** Client-safe stamps constants — no server imports. */

export const ALLOWED_STAMPS: string[] = [
  "⭐", "🔥", "💜", "🌙", "🌸", "🎸", "🦋", "🌊", "✨", "🎨", "🍄", "👾",
];

export interface StampEntry {
  id: string;
  stamperHandle: string | null;
  stampEmoji: string;
  createdAt: string;
}
