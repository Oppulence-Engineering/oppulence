import { beforeEach, describe, expect, it, vi } from "vitest";

const dashboard = vi.hoisted(() => ({
  dashboardRequest: vi.fn(),
  toDashboardAPIPath: (path: string) => `/api/rowboat/v1${path}`,
  redirectBrowserIfUnauthorized: () => undefined,
  loginURL: () => "/api/auth/workos/login",
}));

vi.mock("@/lib/auth/dashboard-fetch", () => dashboard);

import { schemaMismatchCopy } from "@/lib/api/request-json";
import {
  ConsoleAPIError,
  consoleFailureCopy,
  consoleUnavailableCopy,
  createConsoleResource,
  getConsolePreferences,
  listConsoleResources,
  patchConsolePreferences,
  patchConsoleResource,
} from "@/lib/console/console";

const preferences = {
  defaultAgentSlug: "account-reviewer",
  displayName: "Ada",
  notificationLevel: "off",
  shareUsageData: true,
  showModelReasoning: false,
  theme: "system",
};

describe("validated console adapter", () => {
  beforeEach(() => dashboard.dashboardRequest.mockReset());

  it("returns only preferences consumed by rowboat-www", async () => {
    dashboard.dashboardRequest.mockResolvedValue(new Response(JSON.stringify(preferences)));

    await expect(getConsolePreferences()).resolves.toEqual({
      defaultAgentSlug: "account-reviewer",
      displayName: "Ada",
      shareUsageData: true,
    });
  });

  it("sends only supported preference fields", async () => {
    dashboard.dashboardRequest.mockResolvedValue(new Response(JSON.stringify(preferences)));

    await patchConsolePreferences({ displayName: "Grace", shareUsageData: false });

    const init = dashboard.dashboardRequest.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe(JSON.stringify({ displayName: "Grace", shareUsageData: false }));
  });

  it("rejects malformed resource responses", async () => {
    dashboard.dashboardRequest.mockResolvedValue(
      new Response(JSON.stringify({ limit: 100, offset: 0, resources: [{ id: "invalid" }] })),
    );

    await expect(listConsoleResources("note_template")).rejects.toThrow();
  });

  it("says the page could not read a console response that does not match", async () => {
    dashboard.dashboardRequest.mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
    );

    await expect(patchConsolePreferences({ displayName: "Ada" })).rejects.toEqual(
      expect.objectContaining<Partial<ConsoleAPIError>>({
        code: "schema_mismatch",
        message: schemaMismatchCopy(),
      }),
    );
  });

  it("treats a missing console route as an empty resource list", async () => {
    dashboard.dashboardRequest.mockResolvedValue(
      new Response(JSON.stringify({ code: "not_found", detail: "not found" }), { status: 404 }),
    );

    await expect(listConsoleResources("note_favorite")).resolves.toEqual({
      resources: [],
      hasMore: false,
    });
  });

  it("exposes stable API errors", async () => {
    dashboard.dashboardRequest.mockResolvedValue(
      new Response(JSON.stringify({ code: "console_unavailable", detail: "Try later" }), {
        status: 503,
      }),
    );

    await expect(getConsolePreferences()).rejects.toEqual(
      expect.objectContaining<Partial<ConsoleAPIError>>({
        code: "console_unavailable",
        message: "Try later",
        status: 503,
      }),
    );
  });

  it("says saving is not available when the console route is missing", async () => {
    dashboard.dashboardRequest.mockResolvedValue(
      new Response(JSON.stringify({ code: "not_found", detail: "not found" }), { status: 404 }),
    );

    await expect(
      createConsoleResource({ kind: "note_favorite", payload: { noteId: "note-1" } }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<ConsoleAPIError>>({
        code: "console_unavailable",
        message: consoleUnavailableCopy(),
        status: 404,
      }),
    );
    expect(consoleUnavailableCopy()).toBe("Saving is not available in this workspace yet.");
    expect(consoleUnavailableCopy()).not.toContain("rowboat-api");
  });

  it("names a console resource failure without the stored phrase", async () => {
    dashboard.dashboardRequest.mockResolvedValue(
      new Response(
        JSON.stringify({ code: "console_resource_not_found", detail: "console resource not found" }),
        { status: 404 },
      ),
    );

    await expect(patchConsoleResource("resource-1", { name: "Follow up" })).rejects.toEqual(
      expect.objectContaining<Partial<ConsoleAPIError>>({
        message: "This could not be found.",
      }),
    );
    expect(consoleFailureCopy("console resource already exists")).toBe("This is already saved.");
    expect(consoleFailureCopy("request body exceeds 262144 bytes")).toBe("This is too large to save.");
    expect(consoleFailureCopy("Try later")).toBeNull();
  });
});
