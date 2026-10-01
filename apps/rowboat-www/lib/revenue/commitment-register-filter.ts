import type { CommitmentRegisterFilter } from "@/lib/revenue/types";

/** The five views of the commitment register. Each one is a different query. */
export type RegisterView = "we_owe" | "they_owe" | "changed" | "by_account" | "by_owner";

/** The filter each view sends to the register. Kept beside the labels so the
 *  view and its query cannot drift apart. */
export function registerFilterFor(
  view: RegisterView,
  options: {
    relationshipId?: string;
    owner?: string;
    since?: string;
    includeCandidates?: boolean;
  } = {},
): CommitmentRegisterFilter | null {
  const includeCandidates = options.includeCandidates || undefined;
  switch (view) {
    case "we_owe":
      return {
        direction: "promised_by_me",
        state: ["open", "at_risk"],
        includeCandidates,
        limit: 200,
      };
    case "they_owe":
      return {
        direction: "promised_by_them",
        state: ["open", "at_risk"],
        includeCandidates,
        limit: 200,
      };
    case "changed":
      return {
        changedSince: options.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        includeCandidates,
        limit: 200,
      };
    case "by_account":
      return options.relationshipId
        ? { relationshipId: options.relationshipId, includeCandidates, limit: 200 }
        : null;
    case "by_owner":
      return options.owner?.trim()
        ? { owner: options.owner.trim(), includeCandidates, limit: 200 }
        : null;
  }
}

type RegisterAccountSource = {
  id?: string;
  kind?: string;
  displayName?: string;
};

type RegisterGraphAccountSource = {
  kind?: string;
  relationshipId?: string;
  label?: string;
  metadata?: Record<string, unknown>;
};

/**
 * By account used to read companies off the graph. A company that exists on
 * the Companies page is not a graph node until it has been projected, so the
 * register said "No companies yet" beside a company the teammate had just added.
 * The company list is the list. The graph is only a fallback when that list
 * cannot be loaded. A person saved from People is a relationship on that
 * graph, so the fallback skips metadata.kind "person" the same way the list does.
 */
export function registerAccountChoices(
  relationships: readonly RegisterAccountSource[],
  graphNodes: readonly RegisterGraphAccountSource[] = [],
): { id: string; label: string }[] {
  const listed = relationships.flatMap((item) => {
    const id = item.id?.trim() ?? "";
    const label = item.displayName?.trim() ?? "";
    if (!id || !label || item.kind === "person") return [];
    return [{ id, label }];
  });
  if (listed.length) return listed;
  return graphNodes.flatMap((node) => {
    const id = node.relationshipId?.trim() ?? "";
    const label = node.label?.trim() ?? "";
    if (node.kind !== "relationship" || node.metadata?.kind === "person" || !id || !label) {
      return [];
    }
    return [{ id, label }];
  });
}
