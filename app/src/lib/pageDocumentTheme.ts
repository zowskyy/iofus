import type { PageDocument, TemplateId } from "./pageDocumentTypes";

// soft-web, pixel-tavern, and start-simple originally used #e0526b/#c7314b,
// which fell to a 3.1–3.2:1 contrast ratio against their paired background —
// below the 4.5:1 WCAG AA minimum this same file's getContrastWarnings()
// enforces for a creator's own color choices. An automated accessibility
// scan (axe-core, tests/e2e/accessibility.spec.ts) caught the platform's own
// starter presets failing the bar it holds users to. Each accent below is
// the same hue nudged in HSL lightness to the nearest value that clears
// 4.5:1 against its paired background — not a redesign.
export const TEMPLATE_PRESETS: Record<
  TemplateId,
  { accent: string; background: string; fontStyle: PageDocument["theme"]["fontStyle"] }
> = {
  "soft-web": { accent: "#cf2543", background: "#f6ecec", fontStyle: "serif" },
  "pixel-tavern": { accent: "#d75e73", background: "#241b2e", fontStyle: "mono" },
  "chrome-angel": { accent: "#ff4db8", background: "#160a23", fontStyle: "sans" },
  "dark-zine": { accent: "#f1eaee", background: "#0e0e0e", fontStyle: "serif" },
  "clean-portfolio": { accent: "#2563eb", background: "#ffffff", fontStyle: "sans" },
  "start-simple": { accent: "#cf2543", background: "#f1ede9", fontStyle: "sans" },
};

/** Calculate the WCAG contrast ratio between two hex colors. Higher ratio = better contrast. */
export function contrastRatio(foreground: string, background: string): number {
  const lum = (hex: string) => {
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const l1 = lum(foreground);
  const l2 = lum(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Check a document for accessibility warnings: poor contrast ratio or missing alt text. */
export function getContrastWarnings(document: PageDocument): string[] {
  if (!document.access.contrastWarningsEnabled) return [];
  const warnings: string[] = [];
  const ratio = contrastRatio(document.theme.accent, document.theme.background);
  if (ratio < 4.5) {
    warnings.push(
      `Accent and background contrast is ${ratio.toFixed(1)}:1 — aim for at least 4.5:1 for readable links and headings.`,
    );
  }
  for (const item of document.gallery) {
    if (!item.alt.trim()) warnings.push(`Gallery image "${item.url}" is missing alt text.`);
  }
  return warnings;
}
