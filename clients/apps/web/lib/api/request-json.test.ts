import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { dashboardRequest } from "@/lib/auth/dashboard-fetch";
import {
  DashboardRequestError,
  isOptionalRequestFailure,
  requestJson,
  signedInProblemCopy,
} from "@/lib/api/request-json";

vi.mock("@/lib/auth/dashboard-fetch", () => ({
  dashboardRequest: vi.fn(),
  toDashboardAPIPath: (path: string) => `/api/rowboat/v1${path}`,
  redirectBrowserIfUnauthorized: () => undefined,
  loginURL: () => "/api/auth/workos/login",
}));

const mockRequest = vi.mocked(dashboardRequest);

beforeEach(() => mockRequest.mockReset());

describe("requestJson", () => {
  it("validates a successful BFF body against the supplied contract", async () => {
    mockRequest.mockResolvedValueOnce(
      new Response(JSON.stringify({ sources: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      requestJson({
        path: "/relationship-sources/status",
        schema: z.object({ sources: z.array(z.unknown()) }),
      }),
    ).resolves.toEqual({ sources: [] });
    expect(mockRequest.mock.calls[0]?.[0]).toBe("/api/rowboat/v1/relationship-sources/status");
  });

  it("turns a known problem detail into a sentence and keeps an unknown one", async () => {
    mockRequest.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "invalid relationshipId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      requestJson({
        path: "/relationships/graph",
        schema: z.object({}),
      }),
    ).rejects.toMatchObject({
      name: "DashboardRequestError",
      message: "This company could not be found.",
      status: 400,
    } satisfies Partial<DashboardRequestError>);

    expect(signedInProblemCopy("cloud research requires the intelligence plan")).toBe(
      "Public research is part of the Intelligence plan. This workspace does not include it.",
    );
    expect(signedInProblemCopy("action is blocked by policy")).toBe("This action is blocked.");
    expect(signedInProblemCopy("proposal is not pending")).toBe(
      "This action is no longer waiting for approval.",
    );
    expect(signedInProblemCopy("proposal already executed")).toBe("This action already ran.");
    expect(signedInProblemCopy("actions: invalid input: target and kind are required")).toBe(
      "This could not be saved. Try again.",
    );
    expect(signedInProblemCopy("The mailbox is busy.")).toBeNull();
    expect(signedInProblemCopy("internal error")).toBeNull();

    mockRequest.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "The mailbox is busy." }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(
      requestJson({
        path: "/relationships/graph",
        schema: z.object({}),
      }),
    ).rejects.toMatchObject({ message: "The mailbox is busy.", status: 409 });

    mockRequest.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "internal error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(
      requestJson({
        path: "/relationships/graph",
        schema: z.object({}),
      }),
    ).rejects.toMatchObject({ message: "Request failed (500)", status: 500 });
  });

  it("treats a missing route as optional and a down API as a failure", () => {
    expect(isOptionalRequestFailure(new DashboardRequestError("gone", 404))).toBe(true);
    expect(isOptionalRequestFailure(new DashboardRequestError("gateway", 502))).toBe(false);
    expect(isOptionalRequestFailure(new DashboardRequestError("down", 503))).toBe(false);
    expect(isOptionalRequestFailure(new DashboardRequestError("bad", 400))).toBe(false);
  });

  it("extracts the public error envelope on failure", async () => {
    mockRequest.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "unauthenticated", code: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      requestJson({
        path: "/relationship-sources/status",
        schema: z.object({ sources: z.array(z.unknown()) }),
      }),
    ).rejects.toMatchObject({
      name: "DashboardRequestError",
      status: 401,
      code: "unauthorized",
    } satisfies Partial<DashboardRequestError>);
  });
});
