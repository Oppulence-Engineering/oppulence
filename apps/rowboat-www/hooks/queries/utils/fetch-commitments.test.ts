import { describe, expect, it, vi } from "vitest";

import type { RegisterEntry } from "@/lib/revenue/types";

import {
  type CommitmentPage,
  commitmentPageHasMore,
  commitmentRows,
  loadCommitments,
} from "./fetch-commitments";

describe("loadCommitments", () => {
  it("keeps the server flag on a full register page", async () => {
    const request = vi.fn().mockResolvedValue({ commitments: [], hasMore: false });
    await expect(loadCommitments(request, { limit: 200 })).resolves.toEqual({
      commitments: [],
      hasMore: false,
    });
  });
});

describe("commitmentPageHasMore", () => {
  it("trusts the server flag on a full page", () => {
    const commitments = Array.from({ length: 200 }, (_, index) => ({
      id: `promise-${index}`,
    })) as RegisterEntry[];
    const full = { commitments, hasMore: false } as CommitmentPage;
    expect(commitmentPageHasMore(full)).toBe(false);
    expect(commitmentPageHasMore({ ...full, hasMore: true })).toBe(true);
    expect(commitmentRows(full)).toHaveLength(200);
  });

  it("treats a bare list as having no further page", () => {
    const row = { id: "promise-1" } as RegisterEntry;
    expect(commitmentPageHasMore([])).toBe(false);
    expect(commitmentPageHasMore(undefined)).toBe(false);
    expect(commitmentRows([row])).toEqual([row]);
  });
});
