import { execFileSync } from "node:child_process";

import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { z } from "zod";

/**
 * Account deletion through the real product UI and the real stack: browser
 * sign-in through the rowboat-api WorkOS broker (devstack), the Settings →
 * Account sheet, rowboat-api DELETE /v1/me, PostgreSQL, and the devstack
 * Stripe and WorkOS mocks. Run by scripts/account-deletion-e2e.sh.
 *
 * The suite onboards once through Sign up and keeps one page, like a user who
 * cancels, meets a refusal, and then deletes the account. One sign-in also
 * keeps the suite under the API's per-client sign-in rate limit.
 */

const devstackURL = process.env.STACK_DEVSTACK_URL ?? "http://127.0.0.1:8090";
const fixtureSecret = process.env.DEVSTACK_FIXTURE_SECRET ?? "";
const databaseURL = process.env.DATABASE_URL ?? "";
const subject = process.env.STACK_FIXTURE_SUBJECT ?? "user_web_account_deletion";
const run = Date.now().toString(36);

const DevstackStateSchema = z.object({
  subscriptions: z.record(z.string(), z.object({ customer: z.string(), status: z.string() })),
  cancelledSubscriptions: z.array(z.string()),
  deletedWorkOSUsers: z.array(z.string()),
});

const MeSchema = z.object({
  user: z.object({ id: z.string().regex(/^[0-9a-f-]{36}$/) }),
});

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
let userID: string;

/** Runs one SQL statement; values travel as psql variables, never inside the SQL text. */
function sql(statement: string, variables: Record<string, string>): string {
  const args = [databaseURL, "--no-psqlrc", "-At", "-v", "ON_ERROR_STOP=1"];
  for (const [name, value] of Object.entries(variables)) args.push("-v", `${name}=${value}`);
  return execFileSync("psql", args, { encoding: "utf8", input: `${statement}\n` }).trim();
}

function userCount(id: string): number {
  return Number(sql("SELECT count(*) FROM users WHERE id = :'user_id';", { user_id: id }));
}

function linkStripeCustomer(id: string, customer: string) {
  const updated = sql(
    "UPDATE subscriptions SET plan = 'pro', stripe_customer_id = :'customer' WHERE user_subscription = :'user_id' RETURNING id;",
    { customer, user_id: id },
  );
  expect(updated, "the signed-in user has a billing row").not.toBe("");
}

async function devstack(
  request: APIRequestContext,
  method: "GET" | "POST",
  path: string,
  data?: unknown,
): Promise<unknown> {
  const response = await request.fetch(`${devstackURL}${path}`, {
    method,
    data,
    headers: { "X-Devstack-Fixture-Secret": fixtureSecret },
  });
  expect(response.status(), `${method} ${path}`).toBe(200);
  return response.json();
}

async function devstackState(
  request: APIRequestContext,
): Promise<z.infer<typeof DevstackStateSchema>> {
  return DevstackStateSchema.parse(
    await devstack(request, "GET", "/fixture/account-deletion/state"),
  );
}

async function seedSubscription(
  request: APIRequestContext,
  id: string,
  customer: string,
  status: string,
) {
  await devstack(request, "POST", "/fixture/stripe/subscriptions", { id, customer, status });
}

/**
 * Reads GET /v1/me from the page itself. The session cookie is Secure, so
 * Playwright's separate request client would not send it, and a navigation
 * would take the user off the screen they are about to click.
 */
async function proxiedMe(): Promise<{ status: number; body: unknown }> {
  return page.evaluate(async () => {
    const response = await fetch("/api/rowboat/v1/me");
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body };
  });
}

/** Sidebar Settings, then the Account row on the settings overview. */
async function openAccountTheWayAUserWould() {
  await page
    .locator("[data-sidebar-footer]")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/settings/);
  await page
    .getByRole("navigation", { name: "Settings sections" })
    .getByRole("button", { name: /^Account\b/ })
    .click();
  await expect(
    page.getByText("Manage your identity, organization, plan, and current browser session."),
  ).toBeVisible();
}

async function openDeleteSheet() {
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible()) return;
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  await expect(dialog).toBeVisible();
}

/**
 * The clicks after the sheet is open: type DELETE, sign in with Google again,
 * then press the button that only appears once that sign-in is confirmed.
 */
async function confirmDeletion() {
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await expect(page.getByRole("button", { name: "Permanently delete account" })).toHaveCount(0);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\/app\/settings/);
  await expect(page.getByRole("button", { name: "Permanently delete account" })).toBeEnabled();
  await page.getByRole("button", { name: "Permanently delete account" }).click();
}

test.beforeAll(async ({ browser }, testInfo) => {
  expect(fixtureSecret, "DEVSTACK_FIXTURE_SECRET is required").not.toBe("");
  expect(databaseURL, "DATABASE_URL is required").not.toBe("");
  context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    recordVideo: { dir: testInfo.outputDir, size: { width: 1280, height: 720 } },
  });
  page = await context.newPage();
  await page.goto("/sign-up");
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
  const me = await proxiedMe();
  expect(me.status, "GET /v1/me through the web proxy").toBe(200);
  userID = MeSchema.parse(me.body).user.id;
  expect(userCount(userID), "the first sign-in creates the account").toBe(1);
  // Sign-in spends two auth-broker requests (login URL and code exchange).
  // Each deletion re-auth spends two more, and the broker allows five per
  // ten seconds. Let this sign-in age out so the two re-auths below fit.
  await page.waitForTimeout(10_000);
});

test.afterAll(async () => {
  await context?.close();
});

test("typing DELETE does not delete until a fresh sign-in", async ({ request }) => {
  await openAccountTheWayAUserWould();
  await openDeleteSheet();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await expect(page.getByRole("button", { name: "Permanently delete account" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  expect(userCount(userID)).toBe(1);
  expect((await devstackState(request)).deletedWorkOSUsers).not.toContain(subject);
  expect((await proxiedMe()).status).toBe(200);
});

test("a Stripe refusal keeps the account and tells the user why", async ({ request }) => {
  const customer = `cus_web_refused_${run}`;
  const subscription = `sub_web_refused_${run}`;
  await seedSubscription(request, subscription, customer, "active");
  await devstack(request, "POST", "/fixture/stripe/cancel-failure", {
    id: subscription,
    status: 402,
  });
  linkStripeCustomer(userID, customer);

  await openDeleteSheet();
  await confirmDeletion();

  await expect(page.getByRole("alert")).toContainText("We could not cancel your subscription");
  await expect(page).toHaveURL(/\/app\/settings/);
  expect(userCount(userID)).toBe(1);
  const state = await devstackState(request);
  expect(state.subscriptions[subscription]?.status).toBe("active");
  expect(state.deletedWorkOSUsers).not.toContain(subject);
  expect((await proxiedMe()).status, "a refused deletion keeps the session").toBe(200);
});

test("deleting cancels Stripe, deletes the account, and signs the user out", async ({
  request,
}) => {
  const customer = `cus_web_deleted_${run}`;
  const live = {
    [`sub_web_active_${run}`]: "active",
    [`sub_web_trialing_${run}`]: "trialing",
    [`sub_web_past_due_${run}`]: "past_due",
  };
  for (const [id, status] of Object.entries(live)) {
    await seedSubscription(request, id, customer, status);
  }
  await seedSubscription(request, `sub_web_ended_${run}`, customer, "canceled");
  linkStripeCustomer(userID, customer);

  await openDeleteSheet();
  await confirmDeletion();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Your account is deleted")).toBeVisible();
  await expect(dialog.getByText(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)).toBeVisible();
  await dialog.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  expect(userCount(userID)).toBe(0);
  expect(
    Number(
      sql("SELECT count(*) FROM subscriptions WHERE stripe_customer_id = :'customer';", {
        customer,
      }),
    ),
  ).toBe(0);

  const state = await devstackState(request);
  for (const id of Object.keys(live)) {
    expect(state.cancelledSubscriptions).toContain(id);
    expect(state.subscriptions[id]?.status).toBe("canceled");
  }
  expect(state.cancelledSubscriptions).not.toContain(`sub_web_ended_${run}`);
  expect(state.deletedWorkOSUsers).toContain(subject);

  expect((await proxiedMe()).status, "the session is gone after deletion").toBe(401);
});
