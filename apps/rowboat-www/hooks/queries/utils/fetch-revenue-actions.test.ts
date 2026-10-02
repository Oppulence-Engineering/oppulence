import { describe, expect, it, vi } from "vitest";

import type { RevenueAction } from "@/lib/revenue/types";

import {
  ACTION_QUEUE_PAGE,
  type ActionPage,
  actionPageHasMore,
  actionRows,
  loadRevenueActions,
  prependCreatedAction,
  replaceActionPage,
} from "./fetch-revenue-actions";

describe("loadRevenueActions", () => {
  it("asks for the next page by offset and keeps the server flag", async () => {
    const request = vi.fn().mockResolvedValue({ actions: [], hasMore: true });
    await expect(
      loadRevenueActions(request, "open", ACTION_QUEUE_PAGE, undefined, "task", ACTION_QUEUE_PAGE),
    ).resolves.toEqual({
      actions: [],
      hasMore: true,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/revenue-actions?queueStatus=open&limit=100&surface=task&offset=100",
      }),
    );
  });

  it("treats a missing flag as the end of the queue", async () => {
    const request = vi.fn().mockResolvedValue({ actions: [] });
    await expect(loadRevenueActions(request, "open", 10, undefined, "recovery")).resolves.toEqual({
      actions: [],
      hasMore: false,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/revenue-actions?queueStatus=open&limit=10&surface=recovery",
      }),
    );
  });
});

describe("actionPageHasMore", () => {
  it("trusts the server flag on a full page", () => {
    const actions = Array.from({ length: ACTION_QUEUE_PAGE }, (_, index) => ({
      id: `action-${index}`,
    })) as RevenueAction[];
    const full = { actions, hasMore: false } as ActionPage;
    expect(actionPageHasMore(full)).toBe(false);
    expect(actionPageHasMore({ ...full, hasMore: true })).toBe(true);
    expect(actionRows(full)).toHaveLength(ACTION_QUEUE_PAGE);
  });

  it("treats a bare list as having no further page", () => {
    const row = { id: "action-1" } as RevenueAction;
    expect(actionPageHasMore([])).toBe(false);
    expect(actionPageHasMore(undefined)).toBe(false);
    expect(actionRows([row])).toEqual([row]);
    expect(replaceActionPage([row], []).hasMore).toBe(false);
    expect(replaceActionPage({ actions: [row], hasMore: true }, []).hasMore).toBe(true);
  });
});

describe("prependCreatedAction", () => {
  it("keeps a page object and shows the new action first", () => {
    const existing = { id: "action-old", reason: "Older" } as RevenueAction;
    const created = { id: "action-new", reason: "Cedar recovery draft" } as RevenueAction;
    const page = prependCreatedAction({ actions: [existing], hasMore: true }, created);
    expect(page.actions.map((action) => action.id)).toEqual(["action-new", "action-old"]);
    expect(page.hasMore).toBe(true);
    expect(prependCreatedAction(page, created).actions).toHaveLength(2);
    expect(prependCreatedAction(undefined, created)).toEqual({
      actions: [created],
      hasMore: false,
    });
  });
});
