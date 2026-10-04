import { describe, expect, it, vi } from "vitest";

import type { RelationshipAttentionItem } from "@/lib/revenue/types";

import {
  ATTENTION_PAGE_SIZE,
  type AttentionPage,
  attentionPageHasMore,
  attentionRows,
  loadRelationshipAttention,
} from "./fetch-relationships";

describe("loadRelationshipAttention", () => {
  it("asks for the next page by offset and keeps the server flag", async () => {
    const request = vi.fn().mockResolvedValue({ items: [], hasMore: true });
    await expect(
      loadRelationshipAttention(request, "open", undefined, ATTENTION_PAGE_SIZE),
    ).resolves.toEqual({ items: [], hasMore: true });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/relationship-attention?status=open&limit=50&offset=50",
      }),
    );
  });

  it("keeps the first page at the queue size when the queue ends", async () => {
    const request = vi.fn().mockResolvedValue({ items: [] });
    await expect(loadRelationshipAttention(request, "open")).resolves.toEqual({
      items: [],
      hasMore: false,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/relationship-attention?status=open&limit=50",
      }),
    );
  });
});

describe("attentionPageHasMore", () => {
  it("trusts the server flag on a full page", () => {
    const items = Array.from({ length: 50 }, (_, index) => ({
      id: `attention-${index}`,
    })) as RelationshipAttentionItem[];
    const full = { items, hasMore: false } as AttentionPage;
    expect(attentionPageHasMore(full)).toBe(false);
    expect(attentionPageHasMore({ ...full, hasMore: true })).toBe(true);
    expect(attentionRows(full)).toHaveLength(50);
  });

  it("treats a bare list as having no further page", () => {
    const row = { id: "attention-1" } as RelationshipAttentionItem;
    expect(attentionPageHasMore([])).toBe(false);
    expect(attentionPageHasMore(undefined)).toBe(false);
    expect(attentionRows([row])).toEqual([row]);
  });
});
