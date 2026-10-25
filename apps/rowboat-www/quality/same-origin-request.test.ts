import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST as logout } from "@/app/api/auth/logout/route";
import { isSameOriginBrowserRequest, isSameOriginNavigation } from "@/lib/bff/same-origin-request";

const ORIGIN = "https://oppulence.io";

describe("same-origin request guards", () => {
  it("accepts matching Origin headers", () => {
    const request = new NextRequest("https://oppulence.io/api/connectors/google/start", {
      method: "POST",
      headers: { origin: ORIGIN },
    });

    expect(isSameOriginBrowserRequest(request, ORIGIN)).toBe(true);
  });

  it("rejects foreign Origin headers", () => {
    const request = new NextRequest("https://oppulence.io/api/connectors/google/start", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });

    expect(isSameOriginBrowserRequest(request, ORIGIN)).toBe(false);
  });

  it("falls back to Referer when Origin is absent", () => {
    const request = new NextRequest("https://oppulence.io/api/connectors/google/start", {
      method: "POST",
      headers: { referer: "https://oppulence.io/app/settings?settings=connections" },
    });

    expect(isSameOriginBrowserRequest(request, ORIGIN)).toBe(true);
  });

  it("blocks logout GET without same-origin navigation proof", () => {
    const request = new NextRequest("https://oppulence.io/api/auth/logout", {
      method: "GET",
      headers: { referer: "https://evil.example/csrf" },
    });

    expect(isSameOriginNavigation(request, ORIGIN)).toBe(false);
  });

  it("allows logout POST without Origin or Referer", () => {
    const request = new NextRequest("https://oppulence.io/api/auth/logout", {
      method: "POST",
    });

    expect(isSameOriginNavigation(request, ORIGIN)).toBe(true);
  });

  it("redirects logout POST to a GET page and clears the session", () => {
    const response = logout(
      new NextRequest(`${ORIGIN}/api/auth/logout?return_to=/sign-in`, { method: "POST" }),
    );

    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/sign-in");
    expect(response.cookies.get("rowboat_www_session")?.value).toBe("");
    expect(response.cookies.get("rowboat_www_session")?.maxAge).toBe(0);
  });
});
