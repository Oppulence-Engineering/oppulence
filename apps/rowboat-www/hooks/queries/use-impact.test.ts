import { describe, expect, it } from "vitest";

import { digestAfterRefresh } from "@/hooks/queries/use-impact";

describe("digestAfterRefresh", () => {
  it("keeps the digest already on screen when the next fetch fails", () => {
    expect(
      digestAfterRefresh({
        failed: true,
        next: null,
        previous: { top: [{ reason: "Send the packet" }] },
      }),
    ).toEqual({
      digest: { top: [{ reason: "Send the packet" }] },
      digestFailed: true,
    });
  });

  it("does not invent a digest when the first fetch fails", () => {
    expect(digestAfterRefresh({ failed: true, next: null, previous: null })).toEqual({
      digest: null,
      digestFailed: true,
    });
  });

  it("replaces the digest when the next fetch succeeds", () => {
    expect(
      digestAfterRefresh({
        failed: false,
        next: { top: [] },
        previous: { top: [{ reason: "Send the packet" }] },
      }),
    ).toEqual({ digest: { top: [] }, digestFailed: false });
  });
});
