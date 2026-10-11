"use client";

import "client-only";

import { useQuery } from "@tanstack/react-query";

import {
  consoleResourcePageHasMore,
  consoleResourceRows,
  fetchConsolePreferences,
  fetchConsoleResources,
} from "@/hooks/queries/utils/fetch-console";
import {
  CONSOLE_PREFERENCES_STALE_TIME,
  CONSOLE_RESOURCE_STALE_TIME,
  consoleKeys,
} from "@/hooks/queries/utils/console-keys";
import type { ConsoleResource, ConsoleResourceKind } from "@/lib/console/console-contract";

export function useConsolePreferences() {
  return useQuery({
    queryKey: consoleKeys.preferences(),
    queryFn: ({ signal }) => fetchConsolePreferences(signal),
    staleTime: CONSOLE_PREFERENCES_STALE_TIME,
  });
}

export function useConsoleResources<T>(
  kind: ConsoleResourceKind,
  select: (resources: ConsoleResource[]) => T[],
) {
  return useQuery({
    queryKey: consoleKeys.resourceKind(kind),
    queryFn: ({ signal }) => fetchConsoleResources(kind, signal),
    staleTime: CONSOLE_RESOURCE_STALE_TIME,
    select: (page) => ({
      items: select(consoleResourceRows(page)),
      hasMore: consoleResourcePageHasMore(page),
    }),
  });
}
