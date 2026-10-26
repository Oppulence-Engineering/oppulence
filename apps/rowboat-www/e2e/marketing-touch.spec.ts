import { expect, test } from "@playwright/test";

test.use({
  browserName: "webkit",
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test("mobile menu and product controls respond to taps", async ({ page }) => {
  await page.goto("/");
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
