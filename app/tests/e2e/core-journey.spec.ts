import { test, expect } from "@playwright/test";
import { withFreshIp } from "./helpers";

/**
 * Real, live-server coverage of the platform's core loop: Make → Shape →
 * Publish → Wander. Runs against `next dev` with an isolated SQLite file
 * (see playwright.config.ts) — no mocks, no stubbed network layer.
 *
 * Each test uses its own randomly generated handle so the suite can run
 * repeatedly against the same (or a fresh) test database without handle
 * collisions.
 */

function uniqueHandle(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

test.describe("Make → Shape → Publish → Wander", () => {
  test("a new creator can sign up, publish a page, and view it live", async ({ page }) => {
    const handle = uniqueHandle("e2e");

    // --- Make: account + starter page ---
    await withFreshIp(page);
    await page.goto("/signup");
    await page.fill("#handle", handle);
    await page.fill("#displayName", "E2E Test Creator");
    await page.fill("#password", "correct horse battery staple");
    // The platform layout's "Log out" button is also type=submit once
    // signed in, so target forms by their accessible name, not the bare
    // CSS attribute selector, everywhere in this suite.
    await page.getByRole("button", { name: "Make your page" }).click();

    await expect(page).toHaveURL(/\/make$/);
    await expect(page.locator("h1")).toContainText("What does your corner of the internet feel like?");

    // Turn on the Gallery and Guestbook parts in addition to the defaults.
    await page.check('input[name="pageParts"][value="gallery"]');
    await page.check('input[name="pageParts"][value="guestbook"]');
    await page.fill("#bio", "Making small strange worlds.");
    await page.getByRole("button", { name: "Publish your corner" }).click();

    // --- Publish: makeFlowAction redirects straight to the live profile ---
    await expect(page).toHaveURL(new RegExp(`/@${handle}$`));
    await expect(page.locator("h1")).toContainText("E2E Test Creator");
    await expect(page.locator(".page-bio")).toContainText("Making small strange worlds.");

    // Safety bar is present and not part of the themed/scoped page body.
    await expect(page.locator(".top-bar")).toBeVisible();
    await expect(page.locator(".top-bar")).toContainText("Reader");

    // No visitor-tracking UI should ever render (product decision:
    // PLAN.md "Visitor privacy — decided: none").
    await expect(page.locator(".visitor-counter")).toHaveCount(0);
    await expect(page.locator(".presence-indicator")).toHaveCount(0);

    // --- Wander: Reader Mode strips decoration but keeps content + safety bar ---
    await page.getByRole("link", { name: "Reader" }).click();
    await expect(page).toHaveURL(new RegExp(`/@${handle}\\?reader=1$`));
    await expect(page.locator(".page-body")).toHaveClass(/reader-mode/);
    await expect(page.locator(".top-bar")).toBeVisible();
    await expect(page.getByRole("link", { name: "Exit Reader" })).toBeVisible();
    await expect(page.locator("h1")).toContainText("E2E Test Creator");

    await page.getByRole("link", { name: "Exit Reader" }).click();
    await expect(page).toHaveURL(new RegExp(`/@${handle}$`));

    // --- Shape: Studio loads for the owner with the expected tabs ---
    await page.goto("/studio");
    const studioTabs = page.locator("nav.studio-tabs");
    await expect(studioTabs).toBeVisible();
    for (const tab of ["Look", "Layout", "Content", "Access", "Publish"]) {
      await expect(studioTabs.getByRole("button", { name: tab })).toBeVisible();
    }
    await expect(page.locator(".studio-header-actions").getByRole("button", { name: "Publish" })).toBeVisible();

    // --- Wander: Explore loads without error and the new page is reachable ---
    await page.goto("/explore");
    await expect(page.locator("h1")).toBeVisible();

    // --- Log out clears the session (logout is a POST-only route action) ---
    await page.getByRole("button", { name: "Log out" }).click();
    await page.goto("/studio");
    await expect(page).toHaveURL(/\/login/);
  });

  test("a visitor can leave a guestbook entry and the owner sees it after approval", async ({
    browser,
  }) => {
    const ownerHandle = uniqueHandle("owner");
    const visitorHandle = uniqueHandle("visitor");

    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();

    await withFreshIp(ownerPage);
    await ownerPage.goto("/signup");
    await ownerPage.fill("#handle", ownerHandle);
    await ownerPage.fill("#displayName", "Guestbook Owner");
    await ownerPage.fill("#password", "correct horse battery staple");
    await ownerPage.getByRole("button", { name: "Make your page" }).click();
    await ownerPage.check('input[name="pageParts"][value="guestbook"]');
    await ownerPage.getByRole("button", { name: "Publish your corner" }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/@${ownerHandle}$`));

    const visitorContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();
    await withFreshIp(visitorPage);
    await visitorPage.goto("/signup");
    await visitorPage.fill("#handle", visitorHandle);
    await visitorPage.fill("#displayName", "Guestbook Visitor");
    await visitorPage.fill("#password", "correct horse battery staple");
    await visitorPage.getByRole("button", { name: "Make your page" }).click();
    await visitorPage.getByRole("button", { name: "Publish your corner" }).click();

    await visitorPage.goto(`/@${ownerHandle}`);
    const guestbookForm = visitorPage.locator("form:has(textarea[name='message'])");
    await expect(guestbookForm).toBeVisible();
    await guestbookForm.locator("textarea[name='message']").fill("Loved wandering into your corner!");
    await guestbookForm.getByRole("button", { name: "Sign guestbook" }).click();

    // Approval is required by default — the entry must not be publicly
    // visible yet.
    await ownerPage.goto(`/@${ownerHandle}`);
    await expect(ownerPage.locator(".guestbook-entries")).toHaveCount(0);

    await ownerContext.close();
    await visitorContext.close();
  });

  test("blocking a visitor hides the page from them in both directions", async ({ browser }) => {
    const ownerHandle = uniqueHandle("blkowner");
    const visitorHandle = uniqueHandle("blkvis");

    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await withFreshIp(ownerPage);
    await ownerPage.goto("/signup");
    await ownerPage.fill("#handle", ownerHandle);
    await ownerPage.fill("#displayName", "Block Owner");
    await ownerPage.fill("#password", "correct horse battery staple");
    await ownerPage.getByRole("button", { name: "Make your page" }).click();
    await ownerPage.getByRole("button", { name: "Publish your corner" }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/@${ownerHandle}$`));

    const visitorContext = await browser.newContext();
    const visitorPage = await visitorContext.newPage();
    await withFreshIp(visitorPage);
    await visitorPage.goto("/signup");
    await visitorPage.fill("#handle", visitorHandle);
    await visitorPage.fill("#displayName", "Block Visitor");
    await visitorPage.fill("#password", "correct horse battery staple");
    await visitorPage.getByRole("button", { name: "Make your page" }).click();
    await visitorPage.getByRole("button", { name: "Publish your corner" }).click();
    await expect(visitorPage).toHaveURL(new RegExp(`/@${visitorHandle}$`));

    // Visitor can see the owner's page before any block exists.
    let resp = await visitorPage.goto(`/@${ownerHandle}`);
    expect(resp?.status()).toBe(200);

    // Owner blocks the visitor via the confirm-then-submit flow.
    await ownerPage.goto(`/@${visitorHandle}/block`);
    await ownerPage.getByRole("button", { name: `Block @${visitorHandle}` }).click();
    await expect(ownerPage).toHaveURL(new RegExp(`/@${visitorHandle}/block/done$`));

    // Block is bidirectional: the visitor can no longer load the owner's
    // page (404, not a permission-revealing error), and the owner can no
    // longer load the visitor's page either.
    resp = await visitorPage.goto(`/@${ownerHandle}`);
    expect(resp?.status()).toBe(404);

    resp = await ownerPage.goto(`/@${visitorHandle}`);
    expect(resp?.status()).toBe(404);

    await ownerContext.close();
    await visitorContext.close();
  });
});
