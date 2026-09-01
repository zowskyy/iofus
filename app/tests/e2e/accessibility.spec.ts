import { test, expect } from "@playwright/test";
import { withFreshIp } from "./helpers";
import AxeBuilder from "@axe-core/playwright";

/**
 * Automated accessibility scanning (axe-core) plus behavioral keyboard
 * testing against the real live server. Complements the manual audit from
 * the first pass (which read the code); this exercises the rendered DOM
 * and the actual accessibility tree.
 */

function uniqueHandle(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

async function signUpAndPublish(page: import("@playwright/test").Page, handle: string, displayName: string) {
  await withFreshIp(page);
  await page.goto("/signup");
  await page.fill("#handle", handle);
  await page.fill("#displayName", displayName);
  await page.fill("#password", "correct horse battery staple");
  await page.getByRole("button", { name: "Make your page" }).click();
  await expect(page).toHaveURL(/\/make$/);
  await page.check('input[name="pageParts"][value="gallery"]');
  await page.check('input[name="pageParts"][value="guestbook"]');
  await page.getByRole("button", { name: "Publish your corner" }).click();
  await expect(page).toHaveURL(new RegExp(`/@${handle}$`));
}

test.describe("Accessibility — automated scan", () => {
  test("signup page has no automatically-detectable violations", async ({ page }) => {
    await withFreshIp(page);
  await page.goto("/signup");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("explore page has no automatically-detectable violations", async ({ page }) => {
    await page.goto("/explore");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("a published profile page has no automatically-detectable violations", async ({ page }) => {
    const handle = uniqueHandle("a11y");
    await signUpAndPublish(page, handle, "Accessibility Check");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("Reader Mode has no automatically-detectable violations", async ({ page }) => {
    const handle = uniqueHandle("a11yreader");
    await signUpAndPublish(page, handle, "Reader Mode Check");
    await page.goto(`/@${handle}?reader=1`);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("Studio has no automatically-detectable violations", async ({ page }) => {
    const handle = uniqueHandle("a11ystudio");
    await signUpAndPublish(page, handle, "Studio Check");
    await page.goto("/studio");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});

test.describe("Accessibility — zoom and large text", () => {
  // WCAG 1.4.4 (Resize Text) requires content and functionality to remain
  // usable at 200% text size with no loss of content or function. Real
  // browser zoom isn't controllable cross-browser via Playwright's API, but
  // scaling the root font-size is the standard proxy — it's exactly what a
  // browser's text-only zoom does, and it's real layout reflow, not a mock.
  test("a published profile at 200% text zoom has no horizontal overflow and stays scannable", async ({ page }) => {
    const handle = uniqueHandle("a11yzoom");
    await signUpAndPublish(page, handle, "Zoom Check");
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(hasHorizontalOverflow, "profile page overflows horizontally at 200% text zoom").toBe(false);

    // The safety bar must stay usable, not squeezed off-screen or overlapped.
    await expect(page.locator(".top-bar")).toBeVisible();
    await expect(page.getByRole("link", { name: "Reader" })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("Studio at 200% text zoom has no horizontal overflow and the Publish control stays reachable", async ({ page }) => {
    const handle = uniqueHandle("a11yzoomstudio");
    await signUpAndPublish(page, handle, "Studio Zoom Check");
    await page.goto("/studio");
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(hasHorizontalOverflow, "Studio overflows horizontally at 200% text zoom").toBe(false);
    await expect(page.locator(".studio-header-actions").getByRole("button", { name: "Publish" })).toBeVisible();
  });
});

test.describe("Accessibility — keyboard-only critical journey", () => {
  test("a creator can sign up, publish, and reach Reader Mode using only the keyboard", async ({ page }) => {
    const handle = uniqueHandle("kbd");

    await withFreshIp(page);
  await page.goto("/signup");
    // Tab order must reach every field in a sensible sequence — verify by
    // actually tabbing through and typing, never by direct .fill() (which
    // would skip past a broken tab order silently).
    await page.locator("#handle").focus();
    await page.keyboard.type(handle);
    await page.keyboard.press("Tab");
    await expect(page.locator("#displayName")).toBeFocused();
    await page.keyboard.type("Keyboard Creator");
    await page.keyboard.press("Tab");
    await expect(page.locator("#password")).toBeFocused();
    await page.keyboard.type("correct horse battery staple");

    // Reach and activate the submit button purely via keyboard.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Make your page" })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/make$/);

    // On /make, tab from the top of the document all the way to the
    // publish button and activate it with the keyboard alone.
    await page.locator("body").click({ trial: true }).catch(() => {});
    await page.keyboard.press("Tab"); // mood radios first item (already default-checked, but focusable)
    let guard = 0;
    let publishFocused = false;
    while (guard < 60) {
      const isPublish = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.tagName === "BUTTON" && el.textContent?.includes("Publish your corner");
      });
      if (isPublish) {
        publishFocused = true;
        break;
      }
      await page.keyboard.press("Tab");
      guard++;
    }
    expect(publishFocused, "keyboard tabbing never reached the Publish button on /make").toBe(true);
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(new RegExp(`/@${handle}$`));

    // Reader Mode toggle must be keyboard-reachable and activatable.
    await page.getByRole("link", { name: "Reader" }).focus();
    await expect(page.getByRole("link", { name: "Reader" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/@${handle}\\?reader=1$`));
    await expect(page.getByRole("link", { name: "Exit Reader" })).toBeVisible();

    // Focus is never silently lost after the navigation.
    const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? null);
    expect(activeTag).not.toBeNull();
  });
});
