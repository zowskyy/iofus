import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { scopeProfileCss } from "./cssScope";

// Property/generative coverage for the custom-CSS sanitizer, targeting the
// exact bug class fixed in cssScope.ts: a selector-blocklist regex whose
// `\b` boundary silently failed for real selector syntax. Rather than only
// keeping the specific regression cases found by hand, this fuzzes the
// *shape* around a protected target (leading/trailing whitespace,
// combinators, compounding) so any future regression in the same family —
// not just the exact string that was found — gets caught automatically.

const PROTECTED_SELECTORS = [".top-bar", ".studio-panel", "#studio", "body", "html", ":root", "iframe", "dialog", "script"];

const combinatorPrefixArb = fc.constantFrom("", " ", "  ", "~ ", "+ ", "> ", "* ");
// A leading combinator/whitespace is always followed by the target as its
// own token (e.g. "~ .top-bar"). A *compound* prefix concatenates directly
// onto the target with no separator (e.g. "div.top-bar") and is only a
// meaningful compound selector when the target itself starts with `.`/`#`
// (a class/id can compound directly onto a tag name); pasting a bare-word
// target like "body" directly onto another word ("span.foobody") does not
// produce a selector for the <body> element at all — it's a different,
// harmless class name that happens to contain "body" as a substring, so it
// must not be included in the "should be rejected" case.
const compoundPrefixArb = fc.constantFrom("", "div", "a", "[data-x]");

describe("scopeProfileCss selector blocklist (property-based)", () => {
  it("rejects a protected selector wrapped in any realistic combinator/whitespace shape", () => {
    fc.assert(
      fc.property(fc.constantFrom(...PROTECTED_SELECTORS), combinatorPrefixArb, (target, combinator) => {
        const selector = `${combinator}${target}`;
        const css = `${selector} { color: red; }`;
        const result = scopeProfileCss(css, ".profile-scope--x");
        expect(result.rejected.length, `expected "${selector}" to be rejected`).toBeGreaterThan(0);
        expect(result.css).toBe("");
      }),
      { numRuns: 200 },
    );
  });

  it("rejects a class/id protected selector directly compounded onto a tag name (e.g. \"div.top-bar\")", () => {
    const compoundableTargets = PROTECTED_SELECTORS.filter((s) => s.startsWith(".") || s.startsWith("#"));
    fc.assert(
      fc.property(fc.constantFrom(...compoundableTargets), compoundPrefixArb, (target, compound) => {
        const selector = `${compound}${target}`;
        const css = `${selector} { color: red; }`;
        const result = scopeProfileCss(css, ".profile-scope--x");
        expect(result.rejected.length, `expected "${selector}" to be rejected`).toBeGreaterThan(0);
        expect(result.css).toBe("");
      }),
      { numRuns: 100 },
    );
  });

  it("a protected selector nested in an otherwise-allowed @media block is still rejected", () => {
    fc.assert(
      fc.property(fc.constantFrom(...PROTECTED_SELECTORS), combinatorPrefixArb, (target, combinator) => {
        const css = `@media (prefers-reduced-motion: reduce) { ${combinator}${target} { display: none; } }`;
        const result = scopeProfileCss(css, ".profile-scope--x");
        expect(result.rejected.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it("never emits accepted CSS containing !important, javascript:, or expression(), across random casing/whitespace", () => {
    const dangerousBodies = [
      "color: red !important",
      "color:red!important",
      "color: red ! IMPORTANT",
      "background: url(JAVASCRIPT:alert(1))",
      "width: expression(alert(1))",
      "width:EXPRESSION (alert(1))",
    ];
    fc.assert(
      fc.property(fc.constantFrom(...dangerousBodies), (body) => {
        const css = `.safe-rule { ${body}; }`;
        const result = scopeProfileCss(css, ".profile-scope--x");
        // Either rejected outright, or (if somehow accepted) must not carry
        // the dangerous token through to emitted CSS.
        if (result.rejected.length === 0) {
          expect(result.css.toLowerCase()).not.toContain("javascript:");
          expect(result.css.toLowerCase()).not.toContain("expression(");
          expect(result.css).not.toMatch(/!\s*important/i);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("every accepted rule's selector is always prefixed by the scope class (never emitted bare)", () => {
    const safeSelectorArb = fc.constantFrom(".bio", ".gallery-item", "a", "p", ".mood-card:hover", "ul > li");
    fc.assert(
      fc.property(safeSelectorArb, (selector) => {
        const css = `${selector} { color: blue; }`;
        const result = scopeProfileCss(css, ".profile-scope--x");
        if (result.rejected.length === 0 && result.css) {
          expect(result.css).toContain(".profile-scope--x");
        }
      }),
      { numRuns: 50 },
    );
  });
});
