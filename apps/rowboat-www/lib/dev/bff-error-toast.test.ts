import { describe, expect, it } from "vitest";

import { bffErrorHint } from "@/lib/dev/bff-error-toast";

describe("bffErrorHint", () => {
  it("does not blame a down API when a provider is unconfigured", () => {
    const hint = bffErrorHint(503, "provider_unconfigured");
    expect(hint).toBe(
      "That provider is not configured on the server. rowboat-api is running.",
    );
    expect(hint).not.toContain("Check rowboat-api is running");
  });

  it("keeps the health hint only when a 502 or 503 has no error code", () => {
    const health = "Check rowboat-api is running (npm run dev:stack prints health).";
    expect(bffErrorHint(503)).toBe(health);
    expect(bffErrorHint(502)).toBe(health);
    expect(bffErrorHint(503, "overloaded")).toBe(
      "See Dev toolkit → API tab for request-id and latency.",
    );
  });

  it("points session failures at a refresh", () => {
    expect(bffErrorHint(401)).toBe("Try Dev toolkit → Session → Refresh, or sign in again.");
    expect(bffErrorHint(403, "session_unavailable")).toBe(
      "Try Dev toolkit → Session → Refresh, or sign in again.",
    );
  });
});
