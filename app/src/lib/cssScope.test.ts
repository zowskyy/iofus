import { describe, expect, it } from "vitest";
import { scopeProfileCss, profileScopeClass } from "./cssScope";

describe("scopeProfileCss", () => {
  it("scopes a simple rule to the profile container", () => {
    const result = scopeProfileCss(".bio { color: red; }", ".profile-scope--void");
    expect(result.rejected).toHaveLength(0);
    expect(result.css).toContain(".profile-scope--void .bio");
  });

  it("rejects @import", () => {
    const result = scopeProfileCss('@import url("evil.css");', ".profile-scope--x");
    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.css).toBe("");
  });

  it("rejects javascript: URLs", () => {
    const result = scopeProfileCss('a { background: url(javascript:alert(1)); }', ".profile-scope--x");
    expect(result.rejected.length).toBeGreaterThan(0);
  });

  it("rejects body selector", () => {
    const result = scopeProfileCss("body { display: none; }", ".profile-scope--x");
    expect(result.rejected.some((r) => r.includes("body"))).toBe(true);
  });

  it("rejects HTML tags in CSS", () => {
    const result = scopeProfileCss("</style><script>alert(1)</script>", ".profile-scope--x");
    expect(result.rejected.some((r) => r.includes("HTML"))).toBe(true);
    expect(result.css).toBe("");
  });

  it("rejects absolute overlays with z-index", () => {
    const result = scopeProfileCss(".trap { position: absolute; z-index: 9999; }", ".profile-scope--x");
    expect(result.rejected.length).toBeGreaterThan(0);
  });

  it("allows @media prefers-reduced-motion", () => {
    const result = scopeProfileCss(
      "@media (prefers-reduced-motion: reduce) { .panel { animation: none; } }",
      ".profile-scope--x",
    );
    expect(result.rejected).toHaveLength(0);
    expect(result.css).toContain("@media");
  });

  // Regression coverage for a real bypass: the selector blocklist used to be
  // a single regex with `\b` immediately before `.top-bar`/`.studio-`/`#studio`.
  // `\b` only fires between a word char and a non-word char, but `.`/`#` are
  // themselves non-word characters, so the assertion silently failed for every
  // selector shape that actually occurs in practice (a bare leading class, one
  // preceded by whitespace, or one preceded by a combinator) — only a compound
  // selector like `div.top-bar` (dot directly preceded by a word char) was ever
  // caught. `.top-bar` is documented (docs/accessibility.md, docs/security-model.md)
  // as unhidable by user CSS; these cases must all be rejected, not just the
  // compound form.
  it("rejects every real-world form of a selector targeting the safety bar", () => {
    const cases = [
      ".top-bar { display: none; }",
      ".top-bar button { visibility: hidden; }",
      "div.top-bar { display: none; }",
      ".profile-scope--x .top-bar { display: none; }",
      "a ~ .top-bar { opacity: 0; }",
      ".studio-panel { display: none; }",
      "#studio { display: none; }",
    ];
    for (const css of cases) {
      const result = scopeProfileCss(css, ".profile-scope--x");
      expect(result.rejected.length, `expected "${css}" to be rejected`).toBeGreaterThan(0);
      expect(result.css).toBe("");
    }
  });

  // Property testing (cssScope.property.test.ts) found `:root` making the
  // exact same `\b`-boundary mistake `.top-bar` originally did — `:root`
  // starts with `:`, a non-word char, so `\b:root\b` never matched a bare
  // or combinator-prefixed `:root` selector either.
  it("rejects every real-world form of a :root selector", () => {
    const selectors = [":root", "a ~ :root", ".profile-scope--x :root"];
    for (const selector of selectors) {
      const result = scopeProfileCss(`${selector} { --x: 1; }`, ".profile-scope--x");
      expect(result.rejected.length, `expected "${selector}" to be rejected`).toBeGreaterThan(0);
      expect(result.css).toBe("");
    }
  });

  it("rejects a safety-bar selector nested inside an allowed @media block", () => {
    const result = scopeProfileCss(
      "@media (prefers-reduced-motion: reduce) { .top-bar { display: none; } }",
      ".profile-scope--x",
    );
    expect(result.rejected.length).toBeGreaterThan(0);
  });
});

describe("profileScopeClass", () => {
  it("sanitizes handle into a safe class name", () => {
    expect(profileScopeClass("Void_Arcade")).toBe("profile-scope--void_arcade");
  });
});
