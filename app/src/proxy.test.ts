import { describe, expect, it } from "vitest";
import { buildCsp } from "./proxy";

const NONCE = "9f8d7c6b-5a4e-3d2c-1b0a-9f8e7d6c5b4a";

describe("buildCsp", () => {
  it("never allows inline script in production", () => {
    // The regression this guards: script-src carried 'unsafe-inline' in
    // production, which lets any injected <script> execute on a platform whose
    // entire premise is hosting other people's content.
    const csp = buildCsp(NONCE, false);
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("binds scripts to the request nonce", () => {
    const csp = buildCsp(NONCE, false);
    expect(csp).toContain(`'nonce-${NONCE}'`);
    expect(csp).toContain("'strict-dynamic'");
  });

  it("allows eval only in development", () => {
    expect(buildCsp(NONCE, true)).toContain("'unsafe-eval'");
    expect(buildCsp(NONCE, false)).not.toContain("'unsafe-eval'");
  });

  it("forbids plugin content", () => {
    expect(buildCsp(NONCE, false)).toContain("object-src 'none'");
  });

  it("keeps inline styles allowed, which per-page theming depends on", () => {
    // Deliberate: theme colors and density ship as inline custom properties
    // and ~230 components set a style attribute. Removing this would break
    // every customized page, and inline style is a far weaker vector than
    // inline script.
    const styleSrc = buildCsp(NONCE, false)
      .split("; ")
      .find((d) => d.startsWith("style-src"))!;
    expect(styleSrc).toContain("'unsafe-inline'");
  });

  it("keeps remote https images allowed, which gallery and background URLs depend on", () => {
    const imgSrc = buildCsp(NONCE, false)
      .split("; ")
      .find((d) => d.startsWith("img-src"))!;
    expect(imgSrc).toContain("https:");
  });

  it("emits each directive exactly once", () => {
    const names = buildCsp(NONCE, false)
      .split("; ")
      .map((d) => d.split(" ")[0]);
    expect(new Set(names).size).toBe(names.length);
  });
});
