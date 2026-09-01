import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { PageDocumentSchema, CURRENT_SCHEMA_VERSION, PAGE_PART_IDS } from "./pageDocumentTypes";
import { parsePageDocument, migrateDocument, PageDocumentValidationError, defaultPageDocument } from "./pageDocument";

// Property/generative coverage for the untrusted-input boundary a stored or
// imported page document crosses: PageDocumentSchema.safeParse via
// parsePageDocument()/migrateDocument(). The invariant under test throughout
// is the one docs/profile-schema.md states: "Never write unvalidated JSON to
// page_documents" — i.e. malformed input must fail closed, and never throw
// anything other than the typed PageDocumentValidationError.

const hexColorArb = fc
  .tuple(fc.integer({ min: 0, max: 0xffffff }))
  .map(([n]) => `#${n.toString(16).padStart(6, "0")}`);

const httpUrlArb = fc
  .tuple(
    fc.constantFrom("http", "https"),
    fc.stringMatching(/^[a-z][a-z0-9-]{1,10}$/),
    fc.constantFrom("com", "net", "org", "example"),
  )
  .map(([scheme, host, tld]) => `${scheme}://${host}.${tld}`);

const shortText = (max: number) => fc.string({ minLength: 0, maxLength: max });
const nonEmptyText = (max: number) => fc.string({ minLength: 1, maxLength: max }).filter((s) => s.trim().length > 0);

const linkArb = fc.record({ label: nonEmptyText(80), url: httpUrlArb });

const galleryItemArb = fc.record({
  id: fc.uuid(),
  url: httpUrlArb,
  alt: shortText(200),
  caption: fc.option(shortText(280), { nil: undefined }),
});

const slugArb = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,20}$/);

const isoDateArb = fc
  .date({ min: new Date("2000-01-01T00:00:00Z"), max: new Date("2100-01-01T00:00:00Z"), noInvalidDate: true })
  .map((d) => d.toISOString());

const blogPostArb = fc.record({
  id: fc.uuid(),
  title: nonEmptyText(120),
  slug: slugArb,
  body: nonEmptyText(500),
  publishedAt: isoDateArb,
});

const pixelArtPieceArb = fc
  .record({
    id: fc.uuid(),
    width: fc.integer({ min: 4, max: 8 }),
    height: fc.integer({ min: 4, max: 8 }),
  })
  .chain((base) =>
    fc.array(fc.oneof(hexColorArb, fc.constant("transparent" as const)), {
      minLength: base.width * base.height,
      maxLength: base.width * base.height,
    }).map((pixels) => ({ ...base, pixels })),
  );

/** Arbitrary generating structurally valid v4 PageDocuments across a representative slice of every field — not exhaustive, but wide enough to catch schema/round-trip regressions across the whole shape. */
const validDocumentArb: fc.Arbitrary<unknown> = fc.record({
  version: fc.constant(CURRENT_SCHEMA_VERSION),
  identity: fc.record({
    displayName: nonEmptyText(60),
    bio: shortText(280),
    status: fc.option(shortText(80), { nil: undefined }),
  }),
  theme: fc.record({
    template: fc.constantFrom("soft-web", "pixel-tavern", "chrome-angel", "dark-zine", "clean-portfolio", "start-simple"),
    accent: hexColorArb,
    background: hexColorArb,
    density: fc.constantFrom("cozy", "comfortable", "spacious"),
    fontStyle: fc.constantFrom("serif", "sans", "mono"),
    reduceMotion: fc.boolean(),
    customCss: fc.constant(""),
    customCssEnabled: fc.boolean(),
    backgroundImageUrl: fc.option(httpUrlArb, { nil: undefined }),
    backgroundTile: fc.boolean(),
    marqueeStatus: fc.boolean(),
    attribution: fc.constant(undefined),
  }),
  pageParts: fc.uniqueArray(fc.constantFrom(...PAGE_PART_IDS), { maxLength: PAGE_PART_IDS.length }),
  links: fc.array(linkArb, { maxLength: 6 }),
  now: shortText(280),
  gallery: fc.array(galleryItemArb, { maxLength: 4 }),
  blog: fc.array(blogPostArb, { maxLength: 4 }),
  devlog: fc.array(
    fc.record({ id: fc.uuid(), date: isoDateArb, body: nonEmptyText(200) }),
    { maxLength: 4 },
  ),
  badges: fc.array(
    fc.record({ id: fc.uuid(), label: nonEmptyText(40), emoji: fc.option(fc.constant("✦"), { nil: undefined }) }),
    { maxLength: 4 },
  ),
  topEight: fc.array(nonEmptyText(32), { maxLength: 8 }),
  tags: fc.uniqueArray(fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,10}$/), { maxLength: 5 }),
  shrines: fc.array(
    fc.record({
      id: fc.uuid(),
      title: nonEmptyText(80),
      body: nonEmptyText(500),
      imageUrl: fc.option(httpUrlArb, { nil: undefined }),
      imageAlt: fc.option(shortText(200), { nil: undefined }),
    }),
    { maxLength: 3 },
  ),
  playlist: fc.array(fc.record({ id: fc.uuid(), title: nonEmptyText(120), url: httpUrlArb }), { maxLength: 5 }),
  pixelArt: fc.array(pixelArtPieceArb, { maxLength: 2 }),
  miniPages: fc.array(
    fc.record({
      id: fc.uuid(),
      slug: slugArb,
      title: nonEmptyText(120),
      intro: shortText(500),
      body: shortText(2000),
    }),
    { maxLength: 3 },
  ),
  guestbook: fc.record({ enabled: fc.boolean(), requireApproval: fc.boolean() }),
  stamps: fc.record({ stampsEnabled: fc.boolean() }),
  access: fc.record({ altTextReminder: fc.boolean(), contrastWarningsEnabled: fc.boolean() }),
});

describe("PageDocument schema (property-based)", () => {
  it("accepts every generated structurally-valid document and round-trips it through JSON unchanged", () => {
    fc.assert(
      fc.property(validDocumentArb, (candidate) => {
        const parsed = parsePageDocument(candidate);
        const roundTripped = parsePageDocument(JSON.parse(JSON.stringify(parsed)));
        expect(roundTripped).toEqual(parsed);
        // Ordering is preserved verbatim, never resorted/deduped by the parser.
        expect(roundTripped.pageParts).toEqual(parsed.pageParts);
      }),
      { numRuns: 200 },
    );
  });

  it("never accepts a document with duplicate pageParts entries", () => {
    fc.assert(
      fc.property(
        validDocumentArb,
        fc.constantFrom(...PAGE_PART_IDS),
        (candidate, dupePart) => {
          const doc = candidate as { pageParts: string[] };
          const withDupe = { ...doc, pageParts: [...doc.pageParts, dupePart, dupePart] };
          expect(() => parsePageDocument(withDupe)).toThrow(PageDocumentValidationError);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("rejects every generated document with a corrupted field, always failing closed with the typed error", () => {
    const corruptions: ((doc: Record<string, unknown>) => Record<string, unknown>)[] = [
      (doc) => ({ ...doc, version: 999 }),
      (doc) => ({ ...doc, version: "4" }),
      (doc) => ({ ...doc, theme: { ...(doc.theme as object), accent: "not-a-color" } }),
      (doc) => ({ ...doc, theme: { ...(doc.theme as object), accent: "javascript:alert(1)" } }),
      (doc) => ({
        ...doc,
        links: [...(doc.links as unknown[]), { label: "x", url: "javascript:alert(1)" }],
      }),
      (doc) => ({
        ...doc,
        theme: { ...(doc.theme as object), backgroundImageUrl: "javascript:alert(1)" },
      }),
      (doc) => ({ ...doc, identity: { ...(doc.identity as object), displayName: "" } }),
      (doc) => ({ ...doc, pageParts: ["not-a-real-module-id"] }),
      (doc) => ({
        ...doc,
        links: Array.from({ length: 500 }, () => ({ label: "spam", url: "https://example.com" })),
      }),
      (doc) => {
        const { identity: _identity, ...rest } = doc;
        return rest;
      },
    ];

    fc.assert(
      fc.property(validDocumentArb, fc.constantFrom(...corruptions), (candidate, corrupt) => {
        const corrupted = corrupt(candidate as Record<string, unknown>);
        expect(() => parsePageDocument(corrupted)).toThrow(PageDocumentValidationError);
      }),
      { numRuns: 200 },
    );
  });

  it("never throws anything but PageDocumentValidationError for arbitrary garbage input (fail-closed boundary)", () => {
    fc.assert(
      fc.property(fc.anything(), (garbage) => {
        try {
          parsePageDocument(garbage);
        } catch (e) {
          expect(e).toBeInstanceOf(PageDocumentValidationError);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("migrateDocument never throws anything but PageDocumentValidationError for arbitrary garbage with any 'version' field", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string(), fc.anything(), { maxKeys: 8 }),
        fc.oneof(fc.integer(), fc.string(), fc.constant(undefined)),
        (garbage, version) => {
          const input = { ...garbage, version } as Record<string, unknown>;
          try {
            migrateDocument(input);
          } catch (e) {
            expect(e).toBeInstanceOf(PageDocumentValidationError);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it("defaultPageDocument output is always itself schema-valid", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 60 }).filter((s) => s.trim().length > 0), (name) => {
        const doc = defaultPageDocument(name);
        expect(() => PageDocumentSchema.parse(doc)).not.toThrow();
      }),
      { numRuns: 50 },
    );
  });
});
