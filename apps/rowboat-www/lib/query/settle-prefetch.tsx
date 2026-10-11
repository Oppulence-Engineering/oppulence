"use client";

import { hydrate, useQueryClient, type DehydratedState, type QueryClient } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";

/**
 * HydrationBoundary fills brand-new cache entries during render, then waits
 * for an effect to touch anything already present. The sidebar starts the
 * source-status query before this boundary, so that entry exists and the
 * prefetched list is held back. The effect never runs on the server, and on
 * the client it runs after the first paint, which is why Open Promises SSR
 * showed "Loading your report" while the browser showed the connect step.
 *
 * A pending entry has nothing on screen yet, so applying the prefetch during
 * this render is safe and is what makes the two paints agree. Query
 * notifications are scheduled on a timeout, so the shell that already
 * rendered does not re-render in the middle of this pass.
 */
export function pendingPrefetchQueries(client: QueryClient, state: DehydratedState) {
  return (state.queries ?? []).filter((query) => {
    const existing = client.getQueryCache().get(query.queryHash);
    return existing?.state.status === "pending";
  });
}

export function SettlePrefetch({
  state,
  children,
}: {
  state: DehydratedState;
  children: ReactNode;
}) {
  const client = useQueryClient();
  useMemo(() => {
    const pending = pendingPrefetchQueries(client, state);
    if (pending.length > 0) hydrate(client, { queries: pending });
  }, [client, state]);
  return children;
}
