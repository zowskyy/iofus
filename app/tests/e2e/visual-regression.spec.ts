import { test, expect, type Page } from "@playwright/test";
import { withFreshIp } from "./helpers";

/**
 * Visual regression baselines for iofus's frozen visual language. These are
 * not "make it prettier" screenshots — they exist so a future change that
 * accidentally alters spacing, color, or layout gets caught mechanically
 * instead of by chance during manual review.
 *
 * Determinism: every fixture uses a fixed, hardcoded handle/content (never
 * Date.now() or Math.random() in the captured state) so re-running against
 * a fresh database reproduces byte-identical markup. Animations are
 * disabled globally via the `animations: "disabled"` screenshot option so
 * CSS transitions/keyframes (marquee, hover, etc.) can't introduce
 * nondeterministic frames.
 */

const BASE_SCREENSHOT_OPTS = { animations: "disabled" as const, caretColor: "transparent" };

// Next.js dev mode's own build-status indicator (a `<nextjs-portal>` custom
// element) mounts and unmounts based on background compilation activity —
// timing-dependent, unrelated to the page under test, and absent entirely
// in production. Reproduced directly: an otherwise byte-identical rerun
// failed only because this indicator happened to be showing a transient
// "1 issue" badge. Masking it (a no-op when absent) is the fix, the same
// principle as EXPLORE_MASK below — real environment noise gets masked,
// never papered over with a looser diff threshold.
function screenshotOpts(page: Page, extra: Record<string, unknown> = {}) {
  const extraMask = (extra.mask as ReturnType<Page["locator"]>[] | undefined) ?? [];
  return { ...BASE_SCREENSHOT_OPTS, ...extra, mask: [page.locator("nextjs-portal"), ...extraMask] };
}

async function signUpAndPublish(
  page: Page,
  handle: string,
  displayName: string,
  extraParts: string[] = [],
) {
  await withFreshIp(page);
  await page.goto("/signup");
  await page.fill("#handle", handle);
  await page.fill("#displayName", displayName);
  await page.fill("#password", "correct horse battery staple");
  await page.getByRole("button", { name: "Make your page" }).click();
  await expect(page).toHaveURL(/\/make$/);
  for (const part of extraParts) {
    await page.check(`input[name="pageParts"][value="${part}"]`);
  }
  await page.fill("#bio", "A small strange corner of the internet.");
  await page.getByRole("button", { name: "Publish your corner" }).click();
  await expect(page).toHaveURL(new RegExp(`/@${handle}$`));
}

test.describe("Visual regression", () => {
  // Explore's "N pages redecorated in the last 24h" counter and its
  // "Recently redecorated" listing both reflect genuine platform-wide state
  // — every page any test in this suite (or a prior run against a reused
  // DB) has published — not per-test fixture data. A first attempt using
  // only a viewport (not fullPage) screenshot still flaked under a
  // combined suite run: the count and the first few listed handles differ
  // by exactly how many other specs ran first. That's real cross-test
  // data-dependence, not a CSS regression, so the fix is to mask the two
  // data-driven regions (matching how Percy/Chromatic-style visual testing
  // handles inherently dynamic content) rather than loosen the diff
  // threshold — everything else on the page (header, search, nav, section
  // chrome, empty-state copy) still gets pixel-compared.
  // .explore-template-grid ("Browse by feeling") is exactly as
  // data-driven as .explore-grid (real per-template page counts and
  // handles) but was missing from this mask — confirmed as the actual
  // source of a real CI flake on explore-mobile-375.png (4506px / 0.02
  // ratio diff, above the 0.01 threshold), reproduced from a live CI run
  // rather than assumed.
  const EXPLORE_MASK = (page: Page) => [
    page.locator(".explore-ambient"),
    page.locator(".explore-grid").first(),
    page.locator(".explore-template-grid"),
  ];

  test("Explore — normal state (viewport)", async ({ page }) => {
    await page.goto("/explore");
    await expect(page).toHaveScreenshot("explore-desktop.png", screenshotOpts(page, { mask: EXPLORE_MASK(page) }));
  });

  test("Explore — mobile viewport (375px, viewport only)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/explore");
    await expect(page).toHaveScreenshot("explore-mobile-375.png", screenshotOpts(page, { mask: EXPLORE_MASK(page) }));
  });

  test("Make — initial state", async ({ page }) => {
    await withFreshIp(page);
    await page.goto("/signup");
    await page.fill("#handle", "vrmakestate1");
    await page.fill("#displayName", "Visual Regression");
    await page.fill("#password", "correct horse battery staple");
    await page.getByRole("button", { name: "Make your page" }).click();
    await expect(page).toHaveURL(/\/make$/);
    await expect(page).toHaveScreenshot("make-initial.png", screenshotOpts(page, { fullPage: true }));
  });

  test("My Page — minimally decorated (defaults only)", async ({ page }) => {
    await signUpAndPublish(page, "vrminimalpage", "Minimal Page");
    await expect(page).toHaveScreenshot("mypage-minimal.png", screenshotOpts(page, { fullPage: true }));
  });

  test("My Page — normally decorated (gallery, guestbook, badges on)", async ({ page }) => {
    await signUpAndPublish(page, "vrnormalpage", "Normal Page", ["gallery", "guestbook", "badges", "topEight"]);
    await expect(page).toHaveScreenshot("mypage-normal.png", screenshotOpts(page, { fullPage: true }));
  });

  test("My Page — Reader Mode", async ({ page }) => {
    await signUpAndPublish(page, "vrreaderpage", "Reader Mode Page", ["gallery", "guestbook", "badges"]);
    await page.goto("/@vrreaderpage?reader=1");
    await expect(page).toHaveScreenshot("mypage-reader-mode.png", screenshotOpts(page, { fullPage: true }));
  });

  test("My Page — mobile viewport (375px)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signUpAndPublish(page, "vrmobilepage", "Mobile Page", ["gallery", "guestbook"]);
    await expect(page).toHaveScreenshot("mypage-mobile-375.png", screenshotOpts(page, { fullPage: true }));
  });

  test("My Page — narrowest supported viewport (320px)", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await signUpAndPublish(page, "vr320page", "Narrow Viewport Page", ["gallery", "guestbook", "topEight"]);
    // No horizontal scroll container at the narrowest realistic phone width.
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasHorizontalOverflow, "page has horizontal overflow at 320px").toBe(false);
    await expect(page).toHaveScreenshot("mypage-320.png", screenshotOpts(page, { fullPage: true }));
  });

  test("My Page — long content and a broken image degrade gracefully", async ({ page }) => {
    await withFreshIp(page);
    const handle = "vrlongbroken1";
    await page.goto("/signup");
    await page.fill("#handle", handle);
    await page.fill("#displayName", "A Very Long Display Name That Keeps Going And Going Past Wha");
    await page.fill("#password", "correct horse battery staple");
    await page.getByRole("button", { name: "Make your page" }).click();
    await expect(page).toHaveURL(/\/make$/);
    await page.check('input[name="pageParts"][value="gallery"]');
    await page.fill(
      "#bio",
      "A single unbroken run of bio text with no spaces to check word-wrap behavior: " +
        "supercalifragilisticexpialidocioussupercalifragilisticexpialidocioussupercalifragilistic",
    );
    await page.getByRole("button", { name: "Publish your corner" }).click();
    await expect(page).toHaveURL(new RegExp(`/@${handle}$`));

    await page.goto("/studio");
    await page.locator("nav.studio-tabs").getByRole("button", { name: "Publish" }).click();
    const fixture = {
      document: {
        version: 4,
        identity: {
          displayName: "A Very Long Display Name That Keeps Going And Going Past Wha",
          bio:
            "A single unbroken run of bio text with no spaces to check word-wrap behavior: " +
            "supercalifragilisticexpialidocioussupercalifragilisticexpialidocioussupercalifragilistic",
        },
        theme: {
          template: "start-simple",
          accent: "#cf2543",
          background: "#f1ede9",
          density: "comfortable",
          fontStyle: "sans",
          reduceMotion: false,
          customCss: "",
          customCssEnabled: false,
          backgroundTile: false,
          marqueeStatus: false,
        },
        pageParts: ["identity", "gallery"],
        links: [],
        now: "",
        gallery: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            url: "https://example.com/this-image-does-not-exist.png",
            alt: "A broken image, deliberately",
            caption: "This link 404s on purpose.",
          },
        ],
        blog: [],
        devlog: [],
        badges: [],
        topEight: [],
        tags: [],
        shrines: [],
        playlist: [],
        pixelArt: [],
        miniPages: [],
        guestbook: { enabled: true, requireApproval: true },
        stamps: { stampsEnabled: true },
        access: { altTextReminder: true, contrastWarningsEnabled: true },
      },
      isPublished: true,
      visibility: "public",
      hiddenFromDiscovery: false,
    };
    await page.setInputFiles("input.studio-file-input", {
      name: "long-broken-fixture.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
    await expect(page.getByText("Import applied and published.")).toBeVisible({ timeout: 10_000 });

    await page.goto(`/@${handle}`);
    await expect(page.locator(".gallery-image")).toBeVisible();
    await expect(page).toHaveScreenshot("mypage-long-content-broken-image.png", screenshotOpts(page, { fullPage: true }));
  });

  test("Studio — Look tab", async ({ page }) => {
    await signUpAndPublish(page, "vrstudiolook", "Studio Look");
    await page.goto("/studio");
    await expect(page.locator("nav.studio-tabs")).toBeVisible();
    await expect(page).toHaveScreenshot("studio-look-tab.png", screenshotOpts(page, { fullPage: true }));
  });

  test("Studio — Content tab", async ({ page }) => {
    await signUpAndPublish(page, "vrstudiocontent", "Studio Content");
    await page.goto("/studio");
    await page.locator("nav.studio-tabs").getByRole("button", { name: "Content" }).click();
    await expect(page).toHaveScreenshot("studio-content-tab.png", screenshotOpts(page, { fullPage: true }));
  });

  test("Studio — Access tab", async ({ page }) => {
    await signUpAndPublish(page, "vrstudioaccess", "Studio Access");
    await page.goto("/studio");
    await page.locator("nav.studio-tabs").getByRole("button", { name: "Access" }).click();
    await expect(page).toHaveScreenshot("studio-access-tab.png", screenshotOpts(page, { fullPage: true }));
  });

  test("Studio — Publish tab", async ({ page }) => {
    await signUpAndPublish(page, "vrstudiopublish", "Studio Publish");
    await page.goto("/studio");
    await page.locator("nav.studio-tabs").getByRole("button", { name: "Publish" }).click();
    await expect(page).toHaveScreenshot("studio-publish-tab.png", screenshotOpts(page, { fullPage: true }));
  });

  test("Signup — validation error state", async ({ page }) => {
    await page.goto("/signup");
    await page.fill("#handle", "a"); // too short — HANDLE_PATTERN requires 2-30 chars
    await page.fill("#password", "short"); // under 8 chars
    // Native HTML validation via minLength/pattern blocks submission before
    // the server action runs — capture that state, which is what a real
    // keyboard/mouse user actually sees first.
    await page.getByRole("button", { name: "Make your page" }).click();
    await expect(page).toHaveScreenshot("signup-validation-state.png", screenshotOpts(page, { fullPage: true }));
  });
});
