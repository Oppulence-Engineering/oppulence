"use client";

import "client-only";

import { useQuery } from "@tanstack/react-query";

import { fetchCommitments } from "@/hooks/queries/utils/fetch-commitments";
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
import { fetchRelationshipGraph, fetchRelationships } from "@/hooks/queries/utils/fetch-relationships";
import { DashboardRequestError } from "@/lib/api/request-json";
import { friendlyRevenueError, RevenueAPIError } from "@/lib/revenue/revenue";
import { companyName } from "@/lib/revenue/revenue-records";

function registerErrorMessage(reason: unknown): string {
  const status =
    reason instanceof RevenueAPIError || reason instanceof DashboardRequestError
      ? reason.status
      : 0;
  const code =
    reason instanceof RevenueAPIError || reason instanceof DashboardRequestError
      ? reason.code
      : undefined;
  if (status === 404) {
    return "The commitment register is unavailable on this server. This usually means the app is newer than the API it is talking to.";
  }
  if (status === 403) {
    return "You do not have access to the commitment register in this workspace.";
  }
  if (status === 503) {
    if (code === "session_unavailable") {
      return friendlyRevenueError("session refresh is temporarily unavailable");
    }
    return friendlyRevenueError("Request failed (503)");
  }
  if (reason instanceof Error && reason.message.trim()) {
    return friendlyRevenueError(reason.message);
  }
  return "The commitment register could not be loaded.";
}

export function useCommitmentRegister(
  scope: CommitmentRegisterScope,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: commitmentKeys.register(scope),
    queryFn: async ({ signal }) => {
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
      const relationshipRows =
        relationships.status === "fulfilled" ? relationships.value : [];
      const titles = new Map(
        relationshipRows
          .filter((row) => row.kind !== "person")
          .map((row) => [row.id, companyName(row)]),
      );
      const accounts = registerAccountChoices(
        relationshipRows,
        graph.status === "fulfilled" ? graph.value.nodes : [],
      );
      const rawEntries = entries.status === "fulfilled" ? entries.value : [];
      return {
        entries: rawEntries.map((entry) => {
          const title = entry.relationshipId ? titles.get(entry.relationshipId) : undefined;
          return title ? { ...entry, relationshipName: title } : entry;
        }),
        registerError:
          entries.status === "rejected" ? registerErrorMessage(entries.reason) : undefined,
        sources: sources.status === "fulfilled" ? sources.value : [],
        accounts,
        relationshipCount: accounts.length,
      };
    },
    enabled: options?.enabled ?? true,
    staleTime: COMMITMENT_REGISTER_STALE_TIME,
  });
}
