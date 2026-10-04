import { describe, expect, it, vi } from "vitest";

import type { RelationshipIdentityCandidate } from "@/lib/revenue/types";

import {
  IDENTITY_CANDIDATE_PAGE,
  type IdentityCandidatePage,
  identityCandidatePageHasMore,
  identityCandidateRows,
  loadIdentityCandidates,
} from "./fetch-relationships";

describe("loadIdentityCandidates", () => {
  it("asks for the next page by offset and keeps the server flag", async () => {
    const request = vi.fn().mockResolvedValue({ candidates: [], hasMore: true });
    await expect(
      loadIdentityCandidates(request, "pending", undefined, undefined, IDENTITY_CANDIDATE_PAGE),
    ).resolves.toEqual({ candidates: [], hasMore: true });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/relationship-identity-candidates?status=pending&limit=50&offset=50",
      }),
    );
  });

  it("keeps the first page at the inbox size when the inbox ends", async () => {
    const request = vi.fn().mockResolvedValue({ candidates: [] });
    await expect(loadIdentityCandidates(request, "pending")).resolves.toEqual({
      candidates: [],
      hasMore: false,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/relationship-identity-candidates?status=pending&limit=50",
      }),
    );
  });
});

describe("identityCandidatePageHasMore", () => {
  it("trusts the server flag on a full page", () => {
    const candidates = Array.from({ length: 50 }, (_, index) => ({
      id: `candidate-${index}`,
    })) as RelationshipIdentityCandidate[];
    const full = { candidates, hasMore: false } as IdentityCandidatePage;
    expect(identityCandidatePageHasMore(full)).toBe(false);
    expect(identityCandidatePageHasMore({ ...full, hasMore: true })).toBe(true);
    expect(identityCandidateRows(full)).toHaveLength(50);
  });

  it("treats a bare list as having no further page", () => {
    const row = { id: "candidate-1" } as RelationshipIdentityCandidate;
    expect(identityCandidatePageHasMore([])).toBe(false);
    expect(identityCandidatePageHasMore(undefined)).toBe(false);
    expect(identityCandidateRows([row])).toEqual([row]);
  });
});
