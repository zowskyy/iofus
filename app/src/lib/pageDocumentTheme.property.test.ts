import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { contrastRatio, getContrastWarnings, TEMPLATE_PRESETS } from "./pageDocumentTheme";
import { PageDocumentSchema } from "./pageDocumentTypes";
import { defaultPageDocument } from "./pageDocument";

const hexColorArb = fc
  .integer({ min: 0, max: 0xffffff })
  .map((n) => `#${n.toString(16).padStart(6, "0")}`);

describe("theme contrast + rendering safety (property-based)", () => {
  it("contrastRatio is symmetric, bounded [1, 21], and never throws for any two valid hex colors", () => {
    fc.assert(
      fc.property(hexColorArb, hexColorArb, (a, b) => {
        const ratio = contrastRatio(a, b);
        expect(ratio).toBeGreaterThanOrEqual(1);
        expect(ratio).toBeLessThanOrEqual(21);
        expect(ratio).toBeCloseTo(contrastRatio(b, a), 10);
      }),
      { numRuns: 300 },
    );
  });

  it("getContrastWarnings never crashes for any schema-valid theme, and flags every pair below 4.5:1", () => {
    fc.assert(
      fc.property(hexColorArb, hexColorArb, (accent, background) => {
        const doc = defaultPageDocument("Property Test");
        doc.theme.accent = accent;
        doc.theme.background = background;
        // Must still be schema-valid after direct mutation, same as the
        // real Studio save path would produce.
        expect(() => PageDocumentSchema.parse(doc)).not.toThrow();
        const warnings = getContrastWarnings(doc);
        const ratio = contrastRatio(accent, background);
        const hasContrastWarning = warnings.some((w) => w.includes("contrast"));
        expect(hasContrastWarning).toBe(ratio < 4.5);
      }),
      { numRuns: 300 },
    );
  });

  it("every built-in template preset clears the same 4.5:1 bar getContrastWarnings enforces for a user's own choice", () => {
    // Regression guard for the fix made this pass: platform-authored
    // defaults must hold themselves to the bar they hold creators to.
    for (const [name, preset] of Object.entries(TEMPLATE_PRESETS)) {
      const ratio = contrastRatio(preset.accent, preset.background);
      expect(ratio, `template "${name}" accent/background contrast is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("disabling contrastWarningsEnabled always suppresses contrast warnings regardless of color pair", () => {
    fc.assert(
      fc.property(hexColorArb, hexColorArb, (accent, background) => {
        const doc = defaultPageDocument("Property Test");
        doc.theme.accent = accent;
        doc.theme.background = background;
        doc.access.contrastWarningsEnabled = false;
        expect(getContrastWarnings(doc)).toEqual([]);
      }),
      { numRuns: 50 },
    );
  });
});
