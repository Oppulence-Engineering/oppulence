import { describe, expect, it, vi } from "vitest";

import {
  IDENTITY_CANDIDATE_PAGE,
  identityCandidateHasMore,
  loadIdentityCandidates,
} from "./fetch-relationships";

describe("loadIdentityCandidates", () => {
  it("asks for the next page by offset", async () => {
    const request = vi.fn().mockResolvedValue({ candidates: [] });
    await loadIdentityCandidates(request, "pending", undefined, undefined, IDENTITY_CANDIDATE_PAGE);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/relationship-identity-candidates?status=pending&limit=50&offset=50",
      }),
    );
  });

  it("keeps the first page at the inbox size", async () => {
    const request = vi.fn().mockResolvedValue({ candidates: [] });
    await loadIdentityCandidates(request, "pending");
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/relationship-identity-candidates?status=pending&limit=50",
      }),
    );
  });
});

describe("identityCandidateHasMore", () => {
  it("treats a full page as unfinished", () => {
    expect(identityCandidateHasMore(50, 0, false)).toBe(true);
    expect(identityCandidateHasMore(50, 50, false)).toBe(true);
  });

  it("stops when the last page is short or the list was exhausted", () => {
    expect(identityCandidateHasMore(7, 0, false)).toBe(false);
    expect(identityCandidateHasMore(50, 1, false)).toBe(false);
    expect(identityCandidateHasMore(50, 0, true)).toBe(false);
  });
});
