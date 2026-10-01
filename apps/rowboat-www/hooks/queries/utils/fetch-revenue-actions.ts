import { ListRevenueActions200Response } from "@/lib/api/generated/zod/revenue/revenue";
import { withQueryString } from "@/lib/api/query-string";
import { requestJson, type RequestJsonFn } from "@/lib/api/request-json";
import type { RevenueAction } from "@/lib/revenue/types";

export type RevenueActionSurface = "task" | "recovery";

function revenueActionsPath(
  queueStatus: string,
  limit: number,
  surface?: RevenueActionSurface,
): string {
  return withQueryString("/revenue-actions", { queueStatus, limit, surface });
}

export async function loadRevenueActions(
  request: RequestJsonFn,
  queueStatus = "open",
  limit = 25,
  signal?: AbortSignal,
  surface?: RevenueActionSurface,
): Promise<RevenueAction[]> {
  const body = await request({
    path: revenueActionsPath(queueStatus, limit, surface),
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
): Promise<RevenueAction[]> {
  return loadRevenueActions(requestJson, queueStatus, limit, signal, surface);
}
