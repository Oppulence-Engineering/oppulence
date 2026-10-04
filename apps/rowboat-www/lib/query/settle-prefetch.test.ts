import { hydrate, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { pendingPrefetchQueries } from "@/lib/query/settle-prefetch";

const sourceKey = ["relationship-source", "list", "statuses"] as const;
const scansKey = ["report", "scans"] as const;

function successState(data: unknown, dataUpdatedAt: number) {
  return {
    data,
    dataUpdateCount: 1,
    dataUpdatedAt,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    fetchFailureCount: 0,
    fetchFailureReason: null,
    fetchMeta: null,
    isInvalidated: false,
    status: "success" as const,
    fetchStatus: "idle" as const,
  };
}

describe("pendingPrefetchQueries", () => {
  it("hydrates cache entries that are still waiting and leaves settled ones alone", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const hanging = client.prefetchQuery({
      queryKey: [...sourceKey],
      queryFn: () => new Promise(() => undefined),
    });
    client.setQueryData([...scansKey], []);

    const sourceHash = client.getQueryCache().find({ queryKey: [...sourceKey] })?.queryHash;
    const scansHash = client.getQueryCache().find({ queryKey: [...scansKey] })?.queryHash;
    expect(sourceHash).toBeTruthy();
    expect(scansHash).toBeTruthy();

    const prefetchedSources = [{ source: "google", status: "not_connected" }];
    const incoming = {
      mutations: [],
      queries: [
        {
          queryHash: sourceHash!,
          queryKey: [...sourceKey],
          state: successState(prefetchedSources, 10),
        },
        {
          queryHash: scansHash!,
          queryKey: [...scansKey],
          state: successState([{ id: "scan" }], 20),
        },
      ],
    };

    const selected = pendingPrefetchQueries(client, incoming);
    expect(selected.map((query) => query.queryKey)).toEqual([[...sourceKey]]);

    hydrate(client, { queries: selected });
    expect(client.getQueryData([...sourceKey])).toEqual(prefetchedSources);
    expect(client.getQueryState([...sourceKey])?.status).toBe("success");
    expect(client.getQueryData([...scansKey])).toEqual([]);

    client.clear();
    await Promise.race([hanging, Promise.resolve()]);
  });
});
