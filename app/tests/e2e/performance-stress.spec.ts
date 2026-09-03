import { test, expect } from "@playwright/test";
import { PAGE_PART_IDS } from "../../src/lib/pageDocumentTypes";
import { withFreshIp } from "./helpers";

/**
 * Performance baseline (navigation timing on key routes) and a large-page
 * stress test built at the PageDocumentSchema's actual array maximums —
 * the real worst case a legitimate creator's document can reach, since
 * every list field is bounded at the schema level (gallery ≤12, blog ≤50,
 * devlog ≤100, badges ≤20, playlist ≤20, miniPages ≤10, shrines ≤5,
 * links ≤30, topEight ≤8, tags ≤10). This is not an adversarial payload —
 * it's what "maximally decorated" legitimately looks like.
 */

function uuid(seed: string): string {
  // Deterministic fake-UUID-shaped id (schema only requires z.string().uuid()
  // syntactically) so the fixture never depends on crypto.randomUUID().
  const h = Array.from(seed).reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) >>> 0, 7);
  const hex = h.toString(16).padStart(8, "0");
  return `${hex}-0000-4000-8000-${hex}00000000`.slice(0, 36);
}

function buildMaxDocument() {
  const gallery = Array.from({ length: 12 }, (_, i) => ({
    id: uuid(`gallery${i}`),
    url: "https://example.com/image.png",
    alt: `Gallery image ${i} — a longer alt description to simulate real usage text length.`,
    caption: `Caption for image ${i}`,
  }));
  const blog = Array.from({ length: 50 }, (_, i) => ({
    id: uuid(`blog${i}`),
    title: `Post number ${i}: a moderately long blog title for stress purposes`,
    slug: `post-number-${i}`,
    body: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(20),
    publishedAt: new Date(2024, 0, 1 + i).toISOString(),
  }));
  const devlog = Array.from({ length: 100 }, (_, i) => ({
    id: uuid(`devlog${i}`),
    date: new Date(2024, 0, 1 + i).toISOString(),
    body: `Devlog entry ${i}: made some progress today on the thing I'm building.`,
  }));
  const badges = Array.from({ length: 20 }, (_, i) => ({
    id: uuid(`badge${i}`),
    label: `badge-${i}`,
    emoji: "✦",
  }));
  const playlist = Array.from({ length: 20 }, (_, i) => ({
    id: uuid(`track${i}`),
    title: `Track ${i}`,
    url: "https://example.com/track",
  }));
  const miniPages = Array.from({ length: 10 }, (_, i) => ({
    id: uuid(`mini${i}`),
    slug: `mini-page-${i}`,
    title: `Mini-page ${i}`,
    intro: "A small linked sub-page.",
    body: "Body content. ".repeat(50),
  }));
  const shrines = Array.from({ length: 5 }, (_, i) => ({
    id: uuid(`shrine${i}`),
    title: `Shrine ${i}`,
    body: "Devoted entirely to something I love. ".repeat(20),
    imageUrl: "https://example.com/shrine.png",
    imageAlt: `Shrine ${i} image`,
  }));
  const pixelArt = [0, 1].map((i) => ({
    id: uuid(`pixel${i}`),
    title: `Piece ${i}`,
    width: 24,
    height: 24,
    pixels: Array.from({ length: 24 * 24 }, (_, p) => (p % 2 === 0 ? "#e0526b" : "transparent")),
  }));
  const links = Array.from({ length: 30 }, (_, i) => ({ label: `Link ${i}`, url: "https://example.com" }));

  return {
    version: 4,
    identity: { displayName: "Maximally Decorated", bio: "Every module, every field, at the schema cap." },
    theme: {
      template: "chrome-angel",
      accent: "#ff4db8",
      background: "#160a23",
      density: "spacious",
      fontStyle: "sans",
      reduceMotion: false,
      customCss: "",
      customCssEnabled: false,
      backgroundTile: false,
      marqueeStatus: false,
    },
    pageParts: [...PAGE_PART_IDS],
    links,
    now: "Stress-testing my own corner of the internet.",
    gallery,
    blog,
    devlog,
    badges,
    topEight: ["friend1", "friend2", "friend3", "friend4", "friend5", "friend6", "friend7", "friend8"],
    tags: ["stress", "maximal", "decorated", "chrome", "neon", "test", "fixture", "large", "heavy", "dense"],
    shrines,
    playlist,
    pixelArt,
    miniPages,
    guestbook: { enabled: true, requireApproval: true },
    stamps: { stampsEnabled: true },
    access: { altTextReminder: true, contrastWarningsEnabled: true },
  };
}

test.describe("Performance baseline", () => {
  for (const route of ["/", "/explore", "/signup"]) {
    test(`navigation timing for ${route}`, async ({ page }) => {
      await withFreshIp(page);
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      const timing = await page.evaluate(() => {
        const nav = (performance.getEntriesByType("navigation") as PerformanceNavigationTiming[])[0]!;
        return {
          domContentLoaded: nav.domContentLoadedEventEnd,
          loadEvent: nav.loadEventEnd,
          transferSize: nav.transferSize,
        };
      });
      // Generous, environment-tolerant ceiling (local dev server, cold
      // start) — the goal is catching an order-of-magnitude regression,
      // not asserting a tight production SLA from a dev box.
      expect(timing.domContentLoaded, `${route} domContentLoaded=${timing.domContentLoaded}ms`).toBeLessThan(5000);
      console.log(`[perf] ${route}: DOMContentLoaded=${timing.domContentLoaded.toFixed(0)}ms transferSize=${timing.transferSize}B`);
    });
  }
});

test.describe("Large-page stress test (schema-maximum document)", () => {
  test.setTimeout(60_000);

  test("a maximally decorated page renders, scrolls, and Reader Mode still works", async ({ page }) => {
    await withFreshIp(page);
    const handle = "stressmax" + Date.now().toString(36);
    await page.goto("/signup");
    await page.fill("#handle", handle);
    await page.fill("#displayName", "Stress Test");
    await page.fill("#password", "correct horse battery staple");
    await page.getByRole("button", { name: "Make your page" }).click();
    await expect(page).toHaveURL(/\/make$/);
    await page.getByRole("button", { name: "Publish your corner" }).click();
    await expect(page).toHaveURL(new RegExp(`/@${handle}$`));

    await page.goto("/studio");
    await page.locator("nav.studio-tabs").getByRole("button", { name: "Publish" }).click();
    const fixture = {
      document: buildMaxDocument(),
      isPublished: true,
      visibility: "public",
      hiddenFromDiscovery: false,
    };
    await page.setInputFiles("input.studio-file-input", {
      name: "max-fixture.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
    await expect(page.getByText("Import applied and published.")).toBeVisible({ timeout: 15_000 });

    // Public page: must actually finish rendering, not hang.
    const start = Date.now();
    const response = await page.goto(`/@${handle}`, { timeout: 20_000 });
    const renderMs = Date.now() - start;
    expect(response?.status()).toBe(200);
    expect(renderMs, `full render of a schema-maximum page took ${renderMs}ms`).toBeLessThan(15_000);

    // All modules actually rendered (no silent truncation, no crash-to-blank).
    await expect(page.locator(".page-blog .blog-item")).toHaveCount(50);
    await expect(page.locator(".page-devlog .devlog-item")).toHaveCount(100);
    await expect(page.locator(".gallery-grid .gallery-item")).toHaveCount(12);
    await expect(page.locator(".pixel-art-canvas")).toHaveCount(2);

    // Page remains scrollable/interactive, not frozen.
    await page.mouse.wheel(0, 5000);
    await expect(page.locator(".page-footer")).toBeAttached();

    // Reader Mode strips decoration but still handles the same volume of content.
    const readerStart = Date.now();
    await page.goto(`/@${handle}?reader=1`, { timeout: 20_000 });
    const readerMs = Date.now() - readerStart;
    expect(readerMs, `Reader Mode render of a schema-maximum page took ${readerMs}ms`).toBeLessThan(15_000);
    await expect(page.locator(".top-bar")).toBeVisible();
    await expect(page.locator(".page-blog .blog-item")).toHaveCount(50);
  });

  test("Studio remains interactive after loading a schema-maximum document", async ({ page }) => {
    await withFreshIp(page);
    const handle = "stressstudio" + Date.now().toString(36);
    await page.goto("/signup");
    await page.fill("#handle", handle);
    await page.fill("#displayName", "Stress Studio");
    await page.fill("#password", "correct horse battery staple");
    await page.getByRole("button", { name: "Make your page" }).click();
    await expect(page).toHaveURL(/\/make$/);
    await page.getByRole("button", { name: "Publish your corner" }).click();
    await expect(page).toHaveURL(new RegExp(`/@${handle}$`));

    await page.goto("/studio");
    await page.locator("nav.studio-tabs").getByRole("button", { name: "Publish" }).click();
    const fixture = {
      document: buildMaxDocument(),
      isPublished: true,
      visibility: "public",
      hiddenFromDiscovery: false,
    };
    await page.setInputFiles("input.studio-file-input", {
      name: "max-fixture.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
    await expect(page.getByText("Import applied and published.")).toBeVisible({ timeout: 15_000 });

    // Tab switching must stay responsive — no runaway rerender freezing the UI.
    for (const tab of ["Layout", "Content", "Access", "Look"]) {
      const tabStart = Date.now();
      await page.locator("nav.studio-tabs").getByRole("button", { name: tab }).click();
      await expect(page.locator(".studio-tab-panel")).toBeVisible();
      const tabMs = Date.now() - tabStart;
      expect(tabMs, `switching to Studio tab "${tab}" took ${tabMs}ms after loading a max-size document`).toBeLessThan(5000);
    }
  });
});
