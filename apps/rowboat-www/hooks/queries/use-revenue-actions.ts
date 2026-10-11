"use client";

import "client-only";

import { useQuery } from "@tanstack/react-query";

import {
  fetchRevenueActions,
  type RevenueActionSurface,
  type TaskDueOrder,
} from "@/hooks/queries/utils/fetch-revenue-actions";
import {
  REVENUE_ACTION_LIST_STALE_TIME,
  revenueActionKeys,
} from "@/hooks/queries/utils/revenue-action-keys";

export function useRevenueActions(
  filter: string,
  limit = 50,
  surface?: RevenueActionSurface,
  due?: TaskDueOrder,
) {
  return useQuery({
    queryKey: revenueActionKeys.list(filter, limit, surface ?? "all", due ?? ""),
    queryFn: ({ signal }) => fetchRevenueActions(filter, limit, signal, surface, 0, due),
    staleTime: REVENUE_ACTION_LIST_STALE_TIME,
  });
}
