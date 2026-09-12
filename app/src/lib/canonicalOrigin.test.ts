import { describe, expect, it } from "vitest";
import { canonicalHost, canonicalOrigin } from "./canonicalOrigin";

describe("canonicalOrigin", () => {
  it("adds https to a bare host", () => {
    expect(canonicalOrigin({ IOFUS_ALLOWED_ORIGIN: "iofus.example" })).toBe("https://iofus.example");
  });

  it("preserves an explicit scheme", () => {
    expect(canonicalOrigin({ IOFUS_ALLOWED_ORIGIN: "https://iofus.example" })).toBe("https://iofus.example");
    expect(canonicalOrigin({ IOFUS_ALLOWED_ORIGIN: "http://staging.internal" })).toBe("http://staging.internal");
  });

  it("never produces a double scheme", () => {
    expect(canonicalOrigin({ IOFUS_ALLOWED_ORIGIN: "https://iofus.example" })).not.toContain("https://https://");
  });

  it("does not mistake a host beginning with 'http' for a scheme", () => {
    // The previous inline check used startsWith("http"), which read this as
    // already-schemed and emitted a URL with no scheme at all.
    expect(canonicalOrigin({ IOFUS_ALLOWED_ORIGIN: "httpbin.example" })).toBe("https://httpbin.example");
  });

  it("strips trailing slashes so callers can concatenate paths safely", () => {
    expect(canonicalOrigin({ IOFUS_ALLOWED_ORIGIN: "https://iofus.example/" })).toBe("https://iofus.example");
    expect(canonicalOrigin({ IOFUS_ALLOWED_ORIGIN: "iofus.example///" })).toBe("https://iofus.example");
  });

  it("trims surrounding whitespace", () => {
    expect(canonicalOrigin({ IOFUS_ALLOWED_ORIGIN: "  iofus.example  " })).toBe("https://iofus.example");
  });

  it("falls back to localhost only when unset or blank", () => {
    expect(canonicalOrigin({})).toBe("http://localhost:3000");
    expect(canonicalOrigin({ IOFUS_ALLOWED_ORIGIN: "   " })).toBe("http://localhost:3000");
  });
});

describe("canonicalHost", () => {
  it("returns the host without a scheme", () => {
    expect(canonicalHost({ IOFUS_ALLOWED_ORIGIN: "https://iofus.example" })).toBe("iofus.example");
    expect(canonicalHost({ IOFUS_ALLOWED_ORIGIN: "iofus.example" })).toBe("iofus.example");
  });
});
