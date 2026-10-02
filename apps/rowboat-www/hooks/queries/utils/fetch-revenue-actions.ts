import { ListRevenueActions200Response } from "@/lib/api/generated/zod/revenue/revenue";
import { withQueryString } from "@/lib/api/query-string";
import { requestJson, type RequestJsonFn } from "@/lib/api/request-json";
import type { RevenueAction } from "@/lib/revenue/types";

export type RevenueActionSurface = "task" | "recovery";

/** Task pages follow due date. Empty keeps the priority order used by recovery. */
export type TaskDueOrder = "asc" | "desc";

/** The queue refuses a larger page. The next rows use this same size as an offset. */
export const ACTION_QUEUE_PAGE = 100;

export type ActionPage = {
  actions: RevenueAction[];
  hasMore: boolean;
};

/** Rows from a queue page. A bare array is a test fixture that has no flag. */
export function actionRows(
  page: ActionPage | readonly RevenueAction[] | null | undefined,
): RevenueAction[] {
  if (!page) return [];
  if (Array.isArray(page)) return [...page];
  return page.actions ?? [];
}

/** True only when the server says another action exists past this page. */
export function actionPageHasMore(
  page: ActionPage | readonly RevenueAction[] | null | undefined,
): boolean {
  if (!page || Array.isArray(page)) return false;
  return Boolean(page.hasMore);
}

/** Keeps the server flag while the visible rows change. */
export function replaceActionPage(
  page: ActionPage | readonly RevenueAction[] | null | undefined,
  actions: RevenueAction[],
): ActionPage {
  return { actions, hasMore: actionPageHasMore(page) };
}

/**
 * Puts a just-created action on the loaded page. The cache is a page object,
 * so spreading it as a list throws and the new row never appears.
 */
export function prependCreatedAction(
  page: ActionPage | readonly RevenueAction[] | null | undefined,
  action: RevenueAction,
): ActionPage {
  const rows = actionRows(page);
  if (rows.some((row) => row.id === action.id)) return replaceActionPage(page, rows);
  return replaceActionPage(page, [action, ...rows]);
}

function revenueActionsPath(
  queueStatus: string,
  limit: number,
  surface?: RevenueActionSurface,
  offset = 0,
  due?: TaskDueOrder,
): string {
  return withQueryString("/revenue-actions", {
    queueStatus,
    limit,
    surface,
    ...(offset > 0 ? { offset } : {}),
    ...(due ? { due } : {}),
  });
}

export async function loadRevenueActions(
  request: RequestJsonFn,
  queueStatus = "open",
  limit = 25,
  signal?: AbortSignal,
  surface?: RevenueActionSurface,
  offset = 0,
  due?: TaskDueOrder,
): Promise<ActionPage> {
  const body = await request({
    path: revenueActionsPath(queueStatus, limit, surface, offset, due),
    schema: ListRevenueActions200Response,
    signal,
  });
  return {
    actions: body.actions ?? [],
    hasMore: Boolean(body.hasMore),
  };
}

export function fetchRevenueActions(
  queueStatus = "open",
  limit = 25,
  signal?: AbortSignal,
  surface?: RevenueActionSurface,
  offset = 0,
  due?: TaskDueOrder,
): Promise<ActionPage> {
  return loadRevenueActions(requestJson, queueStatus, limit, signal, surface, offset, due);
}
