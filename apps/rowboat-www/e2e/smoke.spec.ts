import { expect, test } from "@playwright/test";

test.describe("smoke @smoke", () => {
  test.use({ storageState: "e2e/.auth/session.json" });

  test("open promises report renders a completed scan", async ({ page }) => {
    await page.request.post("http://127.0.0.1:4318/v1/google-oauth/claim", {
      data: { session: "native-google-ticket" },
    });
    await page.goto("/app/report?scan=00000000-0000-4000-8000-000000000001");
    await expect(page.locator("main > header")).toHaveText("Open promises");
    await expect(page.getByText("We promised")).toBeVisible();
    await expect(page.getByText("Send the revised proposal", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download the report" })).toBeVisible();
  });
});
