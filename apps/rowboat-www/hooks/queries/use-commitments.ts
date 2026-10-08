"use client";

import "client-only";

import { useQuery } from "@tanstack/react-query";

import {
  commitmentPageHasMore,
  commitmentRows,
  fetchCommitments,
} from "@/hooks/queries/utils/fetch-commitments";
import {
  COMMITMENT_REGISTER_STALE_TIME,
  commitmentKeys,
  type CommitmentRegisterScope,
} from "@/hooks/queries/utils/commitment-keys";
import { fetchRelationshipSources } from "@/hooks/queries/utils/fetch-relationship-sources";
import {
  overdueRegisterFilter,
  registerAccountChoices,
  registerFilterFor,
  type RegisterView,
} from "@/lib/revenue/commitment-register-filter";
import {
  fetchRelationshipGraph,
  fetchRelationships,
  relationshipPageHasMore,
  relationshipRows,
} from "@/hooks/queries/utils/fetch-relationships";
import { DashboardRequestError } from "@/lib/api/request-json";
import { friendlyRevenueError, RevenueAPIError } from "@/lib/revenue/revenue";
import { companyName } from "@/lib/revenue/revenue-records";
import type { RegisterEntry } from "@/lib/revenue/types";

/**
 * A failed refresh used to resolve as a successful empty page, which replaced
 * promises already on screen. Keep a page that already arrived, including one
 * that was honestly empty. A failed first load has no known page to keep.
 */
export function keptRegisterPage<T>(
  previous:
    | { entries: readonly T[]; hasMore: boolean; entriesKnown?: boolean }
    | undefined,
  entriesFailed: boolean,
): { entries: readonly T[]; hasMore: boolean } | null {
  if (!entriesFailed || !previous) return null;
  if (previous.entries.length === 0 && previous.entriesKnown !== true) return null;
  return { entries: previous.entries, hasMore: previous.hasMore };
}

/** A known register keeps its rows or its empty state. The sentence says which request missed. */
export function registerLoadNotice(reason: unknown, hadPage: boolean): string {
  const status =
    reason instanceof RevenueAPIError || reason instanceof DashboardRequestError
      ? reason.status
      : 0;
  const code =
    reason instanceof RevenueAPIError || reason instanceof DashboardRequestError
      ? reason.code
      : undefined;
  if (status === 404) {
    return "Promises are unavailable on this server. This usually means the app is newer than the API it is talking to.";
  }
  if (status === 403) {
    return "You do not have access to promises in this workspace.";
  }
  if (status === 503) {
    if (code === "session_unavailable") {
      return friendlyRevenueError("session refresh is temporarily unavailable");
    }
    return friendlyRevenueError("Request failed (503)");
  }
  if (reason instanceof Error && reason.message.trim()) {
    const friendly = friendlyRevenueError(reason.message);
    if (friendly !== reason.message) return friendly;
  }
  return hadPage
    ? "Could not refresh promises. Try again."
    : "Promises could not be loaded.";
}

export function useCommitmentRegister(
  scope: CommitmentRegisterScope,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: commitmentKeys.register(scope),
    queryFn: async ({ signal, client, queryKey }) => {
      const filter = scope.dueBefore
        ? overdueRegisterFilter(scope.dueBefore)
        : registerFilterFor(scope.view as RegisterView, {
            relationshipId: scope.accountId,
            owner: scope.owner,
            includeCandidates: scope.includeCandidates,
          });
      const [entries, sources, graph, relationships] = await Promise.allSettled([
        filter ? fetchCommitments(filter, signal) : Promise.resolve([]),
        fetchRelationshipSources(signal),
        fetchRelationshipGraph({ scope: "portfolio", depth: 1 }, signal),
        fetchRelationships({}, signal),
      ]);
      const relationshipPage =
        relationships.status === "fulfilled" ? relationships.value : undefined;
      const loadedRelationships = relationshipRows(relationshipPage);
      const titles = new Map(
        loadedRelationships
          .filter((row) => row.kind !== "person")
          .map((row) => [row.id, companyName(row)]),
      );
      const accounts = registerAccountChoices(
        loadedRelationships,
        graph.status === "fulfilled" ? graph.value.nodes : [],
      );
      const loadedEntries = entries.status === "fulfilled" ? entries.value : [];
      const rawEntries = commitmentRows(loadedEntries);
      const previous = client.getQueryData<{
        entries: RegisterEntry[];
        hasMore: boolean;
        entriesKnown?: boolean;
      }>(queryKey);
      const kept = keptRegisterPage(previous, entries.status === "rejected");
      const hadPage =
        previous != null && (previous.entries.length > 0 || previous.entriesKnown === true);
      const freshEntries = rawEntries.map((entry) => {
        const title = entry.relationshipId ? titles.get(entry.relationshipId) : undefined;
        return title ? { ...entry, relationshipName: title } : entry;
      });
      return {
        entries: kept ? [...kept.entries] : freshEntries,
        hasMore: kept ? kept.hasMore : commitmentPageHasMore(loadedEntries),
        entriesKnown: entries.status === "fulfilled" || kept != null,
        registerError:
          entries.status === "rejected" ? registerLoadNotice(entries.reason, hadPage) : undefined,
        sources: sources.status === "fulfilled" ? sources.value : [],
        accounts,
        relationshipCount: accounts.length,
        hasMoreAccounts: relationshipPageHasMore(relationshipPage),
        relationshipPageCount: loadedRelationships.length,
      };
    },
    enabled: options?.enabled ?? true,
    staleTime: COMMITMENT_REGISTER_STALE_TIME,
  });
}
