"use client";

import "client-only";

import { useQuery } from "@tanstack/react-query";

import {
  fetchSidebarRuns,
  fetchSidebarTasks,
  sidebarAgentItem,
} from "@/hooks/queries/utils/fetch-sidebar";
import { useAgentSummaries } from "@/hooks/queries/use-agents";
import { SIDEBAR_LIST_STALE_TIME, sidebarKeys } from "@/hooks/queries/utils/sidebar-keys";

export function useSidebarAgents() {
  const query = useAgentSummaries();
  return {
    ...query,
    data: query.data?.map(sidebarAgentItem),
  };
}

export function useSidebarTasks() {
  return useQuery({
    queryKey: sidebarKeys.tasks(),
    queryFn: ({ signal }) => fetchSidebarTasks(signal),
    staleTime: SIDEBAR_LIST_STALE_TIME,
  });
}

export function useSidebarRuns() {
  return useQuery({
    queryKey: sidebarKeys.runs(),
    queryFn: ({ signal }) => fetchSidebarRuns(signal),
    staleTime: SIDEBAR_LIST_STALE_TIME,
  });
}
