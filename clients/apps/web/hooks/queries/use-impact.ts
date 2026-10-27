"use client";

import "client-only";

import { useQuery } from "@tanstack/react-query";

import { fetchDigest, fetchImpact } from "@/hooks/queries/utils/fetch-impact";
import { IMPACT_BUNDLE_STALE_TIME, impactKeys } from "@/hooks/queries/utils/impact-keys";
import type { RevenueDigest } from "@/lib/revenue/types";

/**
 * A failed digest refresh used to resolve as "no digest", which hid a summary
 * already on screen. Keep that summary and say the refresh failed.
 */
export function digestAfterRefresh<T>(input: {
  failed: boolean;
  next: T | null;
  previous: T | null | undefined;
}): { digest: T | null; digestFailed: boolean } {
  if (!input.failed) return { digest: input.next, digestFailed: false };
  return { digest: input.previous ?? null, digestFailed: true };
}

export function useImpactBundle() {
  return useQuery({
    queryKey: impactKeys.bundle(),
    queryFn: async ({ signal, client, queryKey }) => {
      const previous = client.getQueryData<{ digest: RevenueDigest | null }>(queryKey);
      const data = await fetchImpact(signal);
      try {
        const digest = await fetchDigest(signal);
        return {
          data,
          ...digestAfterRefresh({ failed: false, next: digest, previous: previous?.digest }),
        };
      } catch {
        return {
          data,
          ...digestAfterRefresh({ failed: true, next: null, previous: previous?.digest }),
        };
      }
    },
    staleTime: IMPACT_BUNDLE_STALE_TIME,
  });
}

export function useImpact() {
  return useQuery({
    queryKey: impactKeys.all,
    queryFn: ({ signal }) => fetchImpact(signal),
    staleTime: IMPACT_BUNDLE_STALE_TIME,
  });
}
