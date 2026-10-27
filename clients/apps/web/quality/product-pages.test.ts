// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { getPlatformPage, platformPages, productLinks } from "@/app/(marketing)/marketing-data";
import { SimPlatformPage } from "@/app/(marketing)/sim-landing/subpages/sim-platform-page";

describe("Oppulence product surfaces", () => {
  it("publishes one page per way of running Oppulence, linked from the product nav", () => {
    expect(platformPages.map((page) => page.slug)).toEqual(["web", "desktop", "voice-app"]);

    for (const page of platformPages) {
      expect(productLinks).toContainEqual(expect.objectContaining({ href: `/${page.slug}` }));
    }
  });

  it("offers an installer on the two surfaces that ship one", () => {
    // Web runs in the browser, so a download link there would be a dead end.
    expect(getPlatformPage("web")?.download).toBe(false);
    expect(getPlatformPage("desktop")?.download).toBe(true);
    expect(getPlatformPage("voice-app")?.download).toBe(true);
  });

  it("gives every product page the copy the layout depends on", () => {
    for (const page of platformPages) {
      expect(page.name).toMatch(/^Oppulence /);
      expect(page.title.length).toBeGreaterThan(0);
      expect(page.lede.length).toBeGreaterThan(0);
      expect(page.summary.length).toBeGreaterThan(0);
      expect(page.sections.length).toBeGreaterThanOrEqual(3);
      expect(page.specs.length).toBeGreaterThanOrEqual(3);

      for (const section of page.sections) {
        expect(section.bullets.length).toBeGreaterThan(0);
        expect(section.screenshot).toMatch(/^\/marketing\//);
        expect(section.alt.length).toBeGreaterThan(0);
      }
    }
  });

  it("renders the complete product story, availability, and the right next step", () => {
    for (const page of platformPages) {
      const document = new DOMParser().parseFromString(
        renderToStaticMarkup(createElement(SimPlatformPage, { page })),
        "text/html",
      );
      expect(document.querySelectorAll("h1")).toHaveLength(1);
      expect(document.querySelector("h1")?.textContent).toBe(page.title);
      expect(
        document
          .querySelector('[aria-label="Products"] [aria-current="page"]')
          ?.getAttribute("href"),
      ).toBe(`/${page.slug}`);
      expect(document.querySelector("section a")?.getAttribute("href")).toBe(page.cta.href);
      const text = document.body.textContent;
      for (const section of page.sections) {
        expect(text).toContain(section.title);
        for (const bullet of section.bullets) expect(text).toContain(bullet);
      }
      for (const spec of page.specs) expect(text).toContain(spec.detail);
      for (const step of page.setup) expect(text).toContain(step.body);
      for (const faq of page.faqs) expect(text).toContain(faq.question);
      expect(text).toContain(page.availability.current);
      expect(text).toContain(page.availability.planned);
      for (const product of platformPages) {
        expect(document.querySelector(`nav a[href="/${product.slug}"]`)).not.toBeNull();
      }
    }
  });
});

describe("product navigation", () => {
  it("keeps every product reachable from the footer product column", () => {
    // The footer renders productLinks.slice(0, 6), so the three surfaces have
    // to stay inside that window or they silently drop out of the footer.
    const footerLinks = productLinks.slice(0, 6).map((link) => link.href);

    for (const page of platformPages) {
      expect(footerLinks).toContain(`/${page.slug}`);
    }
  });
});
