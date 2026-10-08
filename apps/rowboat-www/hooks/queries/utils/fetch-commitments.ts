import { ListCommitments200Response } from "@/lib/api/generated/zod/relationship-intelligence/relationship-intelligence";
import { withQueryString } from "@/lib/api/query-string";
import { requestJson, type RequestJsonFn } from "@/lib/api/request-json";
import type { CommitmentRegisterFilter, RegisterEntry } from "@/lib/revenue/types";

function commitmentsPath(filter: CommitmentRegisterFilter = {}): string {
  return withQueryString("/commitments", {
    direction: filter.direction,
    state: filter.state?.join(","),
    owner: filter.owner,
    relationshipId: filter.relationshipId,
    dueBefore: filter.dueBefore,
    changedSince: filter.changedSince,
    includeCandidates: filter.includeCandidates || undefined,
    limit: filter.limit,
    offset: filter.offset,
  });
}

export type CommitmentPage = {
  commitments: RegisterEntry[];
  hasMore: boolean;
};

/** Rows from a register page. A bare array is a test fixture that has no flag. */
export function commitmentRows(
  page: CommitmentPage | readonly RegisterEntry[] | null | undefined,
): RegisterEntry[] {
  if (!page) return [];
  if (Array.isArray(page)) return [...page];
  return "commitments" in page ? (page.commitments ?? []) : [];
}

/** True only when the server says another promise exists past this page. */
export function commitmentPageHasMore(
  page: CommitmentPage | readonly RegisterEntry[] | null | undefined,
): boolean {
  if (!page || Array.isArray(page)) return false;
  return "hasMore" in page && Boolean(page.hasMore);
}

export async function loadCommitments(
  request: RequestJsonFn,
  filter: CommitmentRegisterFilter = {},
  signal?: AbortSignal,
): Promise<CommitmentPage> {
  const res = await request({
    path: commitmentsPath(filter),
    schema: ListCommitments200Response,
    signal,
  });
  return {
    commitments: res.commitments,
    hasMore: Boolean(res.hasMore),
  };
}

export function fetchCommitments(
  filter: CommitmentRegisterFilter = {},
  signal?: AbortSignal,
): Promise<CommitmentPage> {
  return loadCommitments(requestJson, filter, signal);
}
