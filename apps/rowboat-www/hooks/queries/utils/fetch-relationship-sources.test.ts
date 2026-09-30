import { describe, expect, it } from "vitest";

import type { RequestJsonFn } from "@/lib/api/request-json";
import { loadRelationshipSourceStatuses } from "@/hooks/queries/utils/fetch-relationship-sources";

const userSource = {
  connectionId: "5af76170-66ad-40e9-9318-dd95cdea19ab",
  source: "user",
  sourceAccountId: "default",
  consentingActorId: "b149cc01-c526-4e4b-883b-3e3ff333c823",
  status: "live",
  backfillPhase: "idle",
  backfillCompleted: 0,
  backfillTotal: 0,
  completeness: "partial",
  expectedCadenceSeconds: 900,
  lagSeconds: 1418,
  requiredScopes: [],
  grantedScopes: [],
  missingScopes: [],
  retryCount: 0,
  authorizedAt: "2026-09-30T03:17:08.722809Z",
  lastSyncAt: "2026-09-30T03:17:08.722809Z",
  lastSuccessAt: "2026-09-30T03:17:08.722809Z",
  lastObservationAt: "2026-09-30T03:17:08.711Z",
  lastProviderEventAt: "2026-09-30T03:17:08.711Z",
};

function requestReturning(body: unknown): RequestJsonFn {
  return (async () => body) as RequestJsonFn;
}

describe("loadRelationshipSourceStatuses", () => {
  it("keeps connector rows when an observation source shares the list", async () => {
    const google = { ...userSource, connectionId: "6af76170-66ad-40e9-9318-dd95cdea19ab", source: "google" };
    const sources = await loadRelationshipSourceStatuses(
      requestReturning({ sources: [userSource, google] }),
    );
    expect(sources.map((source) => source.source)).toEqual(["google"]);
  });

  it("treats a list of only observation sources as no connectors", async () => {
    const sources = await loadRelationshipSourceStatuses(requestReturning({ sources: [userSource] }));
    expect(sources).toEqual([]);
  });
});
