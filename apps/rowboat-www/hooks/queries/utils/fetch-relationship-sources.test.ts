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
  it("keeps a real connector when an observation source shares the list", async () => {
    const google = {
      ...userSource,
      connectionId: "6af76170-66ad-40e9-9318-dd95cdea19ab",
      source: "google",
      requiredScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    };
    const sources = await loadRelationshipSourceStatuses(
      requestReturning({ sources: [userSource, google] }),
    );
    expect(sources.map((source) => source.source)).toEqual(["google"]);
  });

  it("treats a list of only observation sources as no connectors", async () => {
    const sources = await loadRelationshipSourceStatuses(requestReturning({ sources: [userSource] }));
    expect(sources).toEqual([]);
  });

  // Ingest stores a Gmail note as source "google" with no consent. That row
  // used to be the only sidebar source, so a saved note read as "1 source is behind".
  it("drops a Google row that is only evidence from an observation", async () => {
    const noted = { ...userSource, connectionId: "6af76170-66ad-40e9-9318-dd95cdea19ab", source: "google" };
    const sources = await loadRelationshipSourceStatuses(requestReturning({ sources: [noted] }));
    expect(sources).toEqual([]);
  });

  it("keeps a stale Gmail account that already tried to sync", async () => {
    const stale = {
      ...userSource,
      connectionId: "1f14b6f5-0c3b-4cf8-84ef-56feb54616b7",
      source: "google",
      status: "stale",
      completeness: "stale",
      errorCode: "provider_outage",
      retryCount: 1,
      lastFailedSyncAt: "2026-10-04T06:53:27.979761Z",
      lastError: "Provider is temporarily unavailable.",
    };
    const sources = await loadRelationshipSourceStatuses(
      requestReturning({ sources: [userSource, stale] }),
    );
    expect(sources.map((source) => source.source)).toEqual(["google"]);
    expect(sources[0]?.status).toBe("stale");
  });

  it("keeps Google once consent or a history sync exists", async () => {
    const consented = {
      ...userSource,
      connectionId: "6af76170-66ad-40e9-9318-dd95cdea19ab",
      source: "google",
      status: "connected",
    };
    const syncing = {
      ...userSource,
      connectionId: "7af76170-66ad-40e9-9318-dd95cdea19ab",
      source: "slack",
      status: "backfilling",
      backfillPhase: "running",
    };
    const sources = await loadRelationshipSourceStatuses(
      requestReturning({ sources: [consented, syncing] }),
    );
    expect(sources.map((source) => source.source)).toEqual(["google", "slack"]);
  });
});
