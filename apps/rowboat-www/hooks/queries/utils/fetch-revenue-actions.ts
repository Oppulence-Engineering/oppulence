import { ListRevenueActions200Response } from "@/lib/api/generated/zod/revenue/revenue";
import { withQueryString } from "@/lib/api/query-string";
import { requestJson, type RequestJsonFn } from "@/lib/api/request-json";
import type { RevenueAction } from "@/lib/revenue/types";

export type RevenueActionSurface = "task" | "recovery";

/** The queue refuses a larger page. The next rows use this same size as an offset. */
export const ACTION_QUEUE_PAGE = 100;

function revenueActionsPath(
  queueStatus: string,
  limit: number,
  surface?: RevenueActionSurface,
  offset = 0,
): string {
  return withQueryString("/revenue-actions", {
    queueStatus,
    limit,
    surface,
    ...(offset > 0 ? { offset } : {}),
  });
}

export async function loadRevenueActions(
  request: RequestJsonFn,
  queueStatus = "open",
  limit = 25,
  signal?: AbortSignal,
  surface?: RevenueActionSurface,
  offset = 0,
): Promise<RevenueAction[]> {
  const body = await request({
    path: revenueActionsPath(queueStatus, limit, surface, offset),
    schema: ListRevenueActions200Response,
    signal,
  });
  return body.actions ?? [];
}

export function fetchRevenueActions(
  queueStatus = "open",
  limit = 25,
  signal?: AbortSignal,
  surface?: RevenueActionSurface,
  offset = 0,
): Promise<RevenueAction[]> {
  return loadRevenueActions(requestJson, queueStatus, limit, signal, surface, offset);
}
