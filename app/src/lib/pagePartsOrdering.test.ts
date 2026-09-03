import { describe, expect, it } from "vitest";
import { movePagePart, togglePagePart } from "./pagePartsOrdering";

describe("movePagePart", () => {
  it("swaps with the next item when moving down", () => {
    expect(movePagePart(["a", "b", "c"] as never, 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("swaps with the previous item when moving up", () => {
    expect(movePagePart(["a", "b", "c"] as never, 2, -1)).toEqual(["a", "c", "b"]);
  });

  it("is a no-op when moving the first item up", () => {
    const parts = ["a", "b", "c"] as never;
    expect(movePagePart(parts, 0, -1)).toBe(parts);
  });

  it("is a no-op when moving the last item down", () => {
    const parts = ["a", "b", "c"] as never;
    expect(movePagePart(parts, 2, 1)).toBe(parts);
  });

  it("is a no-op for an out-of-range index", () => {
    const parts = ["a", "b", "c"] as never;
    expect(movePagePart(parts, 99, -1)).toBe(parts);
    expect(movePagePart(parts, -1, 1)).toBe(parts);
  });
});

describe("togglePagePart", () => {
  it("adds a part that isn't present, at the end", () => {
    expect(togglePagePart(["identity"] as never, "links" as never)).toEqual(["identity", "links"]);
  });

  it("removes a part that is present, preserving remaining order", () => {
    expect(togglePagePart(["identity", "links", "now"] as never, "links" as never)).toEqual(["identity", "now"]);
  });
});
