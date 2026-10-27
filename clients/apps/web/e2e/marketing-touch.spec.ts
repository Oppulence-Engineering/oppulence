import { expect, test } from "@playwright/test";

test.use({
  browserName: "webkit",
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test("mobile menu and product controls respond to taps", async ({ page }) => {
  await page.goto("/");
  // Linux WebKit in CI has no GPU. It paints the stacked EdgeFade backdrop
  // blurs in software, frames stop after a scroll, and taps never settle.
  // This test checks taps, not blur, so it turns the blur off.
  await page.addStyleTag({
    content: "*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}",
  });
  await page.getByLabel("Toggle navigation", { exact: true }).tap();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Products", exact: true })
    .tap();
  await expect(page).toHaveURL(/\/products$/);
  const explorer = page.locator("[data-platform-explorer]");
  const voice = explorer.getByRole("button", { name: "Voice", exact: true });
  await voice.scrollIntoViewIfNeeded();
  await voice.tap();
  await expect(voice).toHaveAttribute("aria-pressed", "true");
  await explorer.getByRole("link", { name: "Explore Voice" }).tap();
  await expect(page).toHaveURL(/\/voice-app$/);
  await expect(page.getByRole("heading", { name: "Say it. Keep working." })).toBeVisible();
});
