import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("anonymous product requests are rejected before product hydration", async ({ request }) => {
  for (const path of ["/app", "/app/agents", "/app/workflows", "/app/settings"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
    expect(response.headers().location).toContain("/api/auth/workos/login");
    expect(response.headers().location).toContain(encodeURIComponent(path));
  }
});

test("production responses include the security header contract", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors");
  expect(headers["strict-transport-security"]).toBeTruthy();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBeTruthy();
  expect(headers["permissions-policy"]).toBeTruthy();
});

test("API reference is rendered by the app instead of upstream HTML", async ({ request }) => {
  const response = await request.get("/api/reference", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/html");
  const body = await response.text();
  expect(body).toContain("<title>Oppulence API Reference</title>");
  expect(body).not.toContain("<title>Solomon AI API Reference</title>");
});

test("@a11y marketing home has no automatically detectable violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
