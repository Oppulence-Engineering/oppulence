import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/product",
  "/products",
  "/web",
  "/desktop",
  "/voice-app",
  "/download",
  "/pricing",
  "/security",
  "/contact",
  "/answers",
  "/compare",
  "/blog",
  "/features/governed-actions",
  "/guides/desktop-vs-web",
  "/integrations/gmail",
  "/terms",
  "/privacy",
  "/responsible-disclosure",
];

for (const colorScheme of ["light", "dark"] as const) {
  for (const width of [320, 390, 1440]) {
    test.describe(`${colorScheme} at ${width}px`, () => {
      test.use({
        colorScheme,
        viewport: { width, height: 900 },
        contextOptions: { reducedMotion: "reduce" },
      });

      for (const route of routes) {
        test(`@a11y ${route} has accessible landmarks, contrast, and layout`, async ({ page }) => {
          await page.goto(route);
          await expect(page.locator("h1")).toHaveCount(1);
          await expect(page.getByRole("main")).toHaveCount(1);
          await expect(page.locator("#main-content")).toHaveCount(1);
          await expect(page.locator("body")).toHaveCSS("zoom", "1");
          await page.evaluate(() => document.fonts.ready);
          const overflow = await page
            .locator(".sim-landing-scroll-port")
            .evaluate((element) => element.scrollWidth - element.clientWidth);
          expect(overflow).toBeLessThanOrEqual(1);
          const results = await new AxeBuilder({ page }).analyze();
          expect(
            results.violations.map(({ id, nodes }) => ({
              id,
              targets: nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
            })),
          ).toEqual([]);
        });
      }
    });
  }
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} navigation`, () => {
    test.use({ colorScheme });

    for (const width of [320, 768, 1024, 1180]) {
      test(`navigation remains usable at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto("/");
        await page.keyboard.press("Tab");
        await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("main")).toBeFocused();

        const toggle = page.getByLabel("Toggle navigation", { exact: true });
        await toggle.focus();
        await page.keyboard.press("Enter");
        const nav = page.getByRole("navigation", { name: "Mobile navigation" });
        await expect(nav).toBeVisible();
        const menuBounds = await nav.boundingBox();
        expect(menuBounds!.x).toBeCloseTo(0, 0);
        expect(menuBounds!.width).toBeCloseTo(width, 0);
        expect(menuBounds!.y + menuBounds!.height).toBeCloseTo(800, 0);
        const pageBackground = await page
          .locator(".sim-landing-scroll-port")
          .evaluate((element) => getComputedStyle(element).backgroundColor);
        await expect(nav).toHaveCSS("background-color", pageBackground);
        const links = await nav.getByRole("link").evaluateAll((elements) =>
          elements.map((element) => {
            const { top, bottom, height } = element.getBoundingClientRect();
            return { top, bottom, height };
          }),
        );
        for (const [index, link] of links.entries()) {
          expect(link.height).toBeGreaterThanOrEqual(44);
          if (index > 0) expect(link.top).toBeGreaterThanOrEqual(links[index - 1].bottom);
        }
        await page.keyboard.press("Tab");
        await expect(nav.getByRole("link", { name: "Products", exact: true })).toBeFocused();
        const menuA11y = await new AxeBuilder({ page })
          .include("[data-marketing-mobile-menu]")
          .analyze();
        expect(menuA11y.violations).toEqual([]);
        await page.keyboard.press("Escape");
        await expect(nav).not.toBeVisible();
        await expect(toggle).toBeFocused();

        await toggle.click();
        await nav.getByRole("link", { name: "Oppulence Web", exact: true }).click();
        await expect(page).toHaveURL(/\/web$/);
        await expect(nav).not.toBeVisible();
        await expect(page.locator(".sim-landing-scroll-port")).not.toHaveCSS(
          "overflow-y",
          "hidden",
        );
        const overflow = await page
          .locator(".sim-landing-scroll-port")
          .evaluate((element) => element.scrollWidth - element.clientWidth);
        expect(overflow).toBeLessThanOrEqual(1);
      });
    }
  });
}

test("product previews switch with the keyboard and expose the selected state", async ({
  page,
}) => {
  await page.goto("/products");
  const explorer = page.locator("[data-platform-explorer]");
  for (const product of ["Desktop", "Voice", "Web"]) {
    const button = explorer.getByRole("button", { name: product, exact: true });
    await button.focus();
    await page.keyboard.press("Space");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(explorer.getByRole("region", { name: `${product} preview` })).toBeVisible();
    await expect(explorer.getByRole("link", { name: `Explore ${product}` })).toHaveAttribute(
      "href",
      product === "Voice" ? "/voice-app" : `/${product.toLowerCase()}`,
    );
  }
});

for (const product of [
  { name: "Web", route: "/web", cta: "Start on the web", destination: "/sign-up" },
  { name: "Desktop", route: "/desktop", cta: "Download Desktop", destination: "/download#desktop" },
  { name: "Voice", route: "/voice-app", cta: "Download Voice", destination: "/download#voice" },
]) {
  test(`${product.name} has a complete product journey from the hub`, async ({ page }) => {
    await page.goto("/products");
    await page
      .getByRole("region", { name: "Choose your Oppulence product" })
      .getByRole("link", { name: `Explore ${product.name}`, exact: true })
      .click();
    await expect(page).toHaveURL(product.route);
    await expect(page.locator("#cta")).toHaveCount(0);
    await expect(
      page.getByRole("navigation", { name: "Products", exact: true }).getByRole("link", {
        name: product.name,
        exact: true,
      }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "What you can use today" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: `Get started with Oppulence ${product.name}.` }),
    ).toBeVisible();
    const faq = page.getByRole("region", { name: `Questions about Oppulence ${product.name}` });
    await expect(faq.getByRole("button")).toHaveCount(5);
    await faq.getByRole("button").nth(1).focus();
    await page.keyboard.press("Enter");
    await expect(faq.getByRole("button").nth(1)).toHaveAttribute("aria-expanded", "true");
    const cta = page
      .getByRole("main")
      .getByRole("link", { name: product.cta, exact: true })
      .first();
    await expect(cta).toHaveAttribute("href", product.destination);
    if (product.name !== "Web") {
      await cta.click();
      await expect(page).toHaveURL(product.destination);
      await expect(page.locator(product.name === "Voice" ? "#voice" : "#desktop")).toBeVisible();
    }
  });
}
