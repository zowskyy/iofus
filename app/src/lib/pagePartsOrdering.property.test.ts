import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { movePagePart, togglePagePart } from "./pagePartsOrdering";
import { PAGE_PART_IDS, PageDocumentSchema } from "./pageDocumentTypes";
import { defaultPageDocument } from "./pageDocument";

type Op = { kind: "move"; index: number; direction: -1 | 1 } | { kind: "toggle"; part: (typeof PAGE_PART_IDS)[number] };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constant("move" as const),
    index: fc.integer({ min: -2, max: PAGE_PART_IDS.length + 1 }),
    direction: fc.constantFrom(-1 as const, 1 as const),
  }),
  fc.record({ kind: fc.constant("toggle" as const), part: fc.constantFrom(...PAGE_PART_IDS) }),
);

function apply(parts: (typeof PAGE_PART_IDS)[number][], op: Op) {
  return op.kind === "move" ? movePagePart(parts, op.index, op.direction) : togglePagePart(parts, op.part);
}

describe("page-parts ordering operations (property-based)", () => {
  it("never produces duplicate part ids, regardless of the operation sequence", () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 0, maxLength: 30 }), (ops) => {
        let parts: (typeof PAGE_PART_IDS)[number][] = ["identity"];
        for (const op of ops) parts = apply(parts, op);
        expect(new Set(parts).size).toBe(parts.length);
      }),
      { numRuns: 200 },
    );
  });

  it("never produces an id outside PAGE_PART_IDS, and the result always satisfies the real PageDocument schema", () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 0, maxLength: 30 }), (ops) => {
        let parts: (typeof PAGE_PART_IDS)[number][] = ["identity"];
        for (const op of ops) parts = apply(parts, op);
        for (const p of parts) expect(PAGE_PART_IDS).toContain(p);

        const doc = { ...defaultPageDocument("Property Test"), pageParts: parts };
        expect(() => PageDocumentSchema.parse(doc)).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });

  it("movePagePart is a permutation: same multiset of ids, same length, in-bounds moves actually relocate the item, out-of-bounds moves are a true no-op", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...PAGE_PART_IDS), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: -3, max: 10 }),
        fc.constantFrom(-1 as const, 1 as const),
        (parts, index, direction) => {
          const result = movePagePart(parts, index, direction);
          expect(result.length).toBe(parts.length);
          expect(new Set(result)).toEqual(new Set(parts));

          const target = index + direction;
          const outOfBounds = index < 0 || index >= parts.length || target < 0 || target >= parts.length;
          if (outOfBounds) {
            expect(result).toEqual(parts);
          } else {
            expect(result[target]).toBe(parts[index]);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("adding then removing the same part is a true inverse (restores the exact original array)", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...PAGE_PART_IDS), { minLength: 0, maxLength: 8 }),
        fc.constantFrom(...PAGE_PART_IDS),
        (parts, part) => {
          fc.pre(!parts.includes(part)); // start from "absent" so the first toggle adds it
          const added = togglePagePart(parts, part);
          const removed = togglePagePart(added, part);
          expect(removed).toEqual(parts);
        },
      ),
      { numRuns: 200 },
    );
  });

  // NOT a true inverse the other way around: removing a part and re-adding
  // it always appends at the end (matches the real UI — a re-enabled
  // section reappears at the bottom of the render order, not back where it
  // was), so it only restores the original array when the part was already
  // last. This regression-guards that specific, real, order-changing
  // behavior instead of assuming toggle is symmetric.
  it("removing then re-adding the same part always re-appends it at the end, not its original position", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...PAGE_PART_IDS), { minLength: 1, maxLength: 8 }),
        (parts) => {
          const part = parts[0]!;
          const removed = togglePagePart(parts, part);
          const readded = togglePagePart(removed, part);
          expect(readded).toEqual([...parts.filter((p) => p !== part), part]);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("togglePagePart never loses or duplicates any part other than the one being toggled", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.constantFrom(...PAGE_PART_IDS), { minLength: 0, maxLength: 8 }),
        fc.constantFrom(...PAGE_PART_IDS),
        (parts, part) => {
          const result = togglePagePart(parts, part);
          const others = parts.filter((p) => p !== part);
          const resultOthers = result.filter((p) => p !== part);
          expect(resultOthers).toEqual(others);
        },
      ),
      { numRuns: 200 },
    );
  });
});
