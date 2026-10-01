import { z } from "zod";

import { ListRelationships200Response } from "@/lib/api/generated/zod/relationship-intelligence/relationship-intelligence";
import { DashboardRequestError, requestJson, type RequestJsonFn } from "@/lib/api/request-json";
import { mapSettledWithConcurrency } from "@/lib/revenue/revenue-records";
import { RelationshipGraphSchema } from "@/lib/revenue/types";
import type {
  RelationshipAttentionItem,
  RelationshipGraph,
  RelationshipIdentityCandidate,
  RelationshipPerson,
  RevenueRelationship,
} from "@/lib/revenue/types";
import type {
  RelationshipGraphScope,
  RelationshipListScope,
} from "@/hooks/queries/utils/relationship-keys";

const IdentityListSchema = z.object({
  candidates: z.array(z.unknown()).optional(),
  hasMore: z.boolean().optional(),
});

const AttentionListSchema = z.object({
  items: z.array(z.unknown()).optional(),
  hasMore: z.boolean().optional(),
});

const PersonListSchema = z.object({
  persons: z.array(z.unknown()).optional(),
});

const SemanticSearchSchema = z.object({
  available: z.boolean(),
  matches: z
    .array(
      z.object({
        threadId: z.string(),
        subject: z.string(),
        counterparty: z.string(),
        classification: z.string(),
        summary: z.string(),
        score: z.number(),
      }),
    )
    .default([]),
});

export type SemanticMatch = z.infer<typeof SemanticSearchSchema>["matches"][number];

function relationshipsPath(filters: RelationshipListScope = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "" || value === 0) continue;
    params.set(key, String(value));
  }
  const query = params.size ? `?${params.toString()}` : "";
  return `/relationships${query}`;
}

function graphPath(input: RelationshipGraphScope): string {
  const params = new URLSearchParams({ scope: input.scope });
  if (input.relationshipId) params.set("relationshipId", input.relationshipId);
  if (input.depth) params.set("depth", String(input.depth));
  if (input.asOf) params.set("asOf", input.asOf);
  if (input.offset && input.offset > 0) params.set("offset", String(input.offset));
  if (input.observationOffset && input.observationOffset > 0) {
    params.set("observationOffset", String(input.observationOffset));
  }
  return `/relationships/graph?${params.toString()}`;
}

export type RelationshipDirectoryPage = {
  relationships: RevenueRelationship[];
  hasMore: boolean;
};

/** Older callers and tests still hand back a bare list. A page object is the live API. */
export function relationshipRows(
  page: RelationshipDirectoryPage | readonly RevenueRelationship[] | undefined,
): RevenueRelationship[] {
  if (!page) return [];
  return Array.isArray(page) ? [...page] : page.relationships;
}

export function relationshipPageHasMore(
  page: RelationshipDirectoryPage | readonly RevenueRelationship[] | undefined,
): boolean {
  if (!page || Array.isArray(page)) return false;
  return page.hasMore;
}

export async function loadRelationships(
  request: RequestJsonFn,
  filters: RelationshipListScope = {},
  signal?: AbortSignal,
): Promise<RelationshipDirectoryPage> {
  const body = await request({
    path: relationshipsPath(filters),
    schema: ListRelationships200Response,
    signal,
  });
  return {
    relationships: (body.relationships ?? []) as RevenueRelationship[],
    hasMore: Boolean(body.hasMore),
  };
}

async function requestGraph(
  request: RequestJsonFn,
  input: RelationshipGraphScope,
  signal?: AbortSignal,
): Promise<RelationshipGraph> {
  return request({
    path: graphPath(input),
    schema: RelationshipGraphSchema,
    signal,
  });
}

/**
 * Portfolio graphs on older APIs reject a missing relationshipId. Fan out
 * only in that case so a modern server is not asked for N relationship graphs.
 */
export async function loadRelationshipGraph(
  request: RequestJsonFn,
  input: RelationshipGraphScope,
  signal?: AbortSignal,
): Promise<RelationshipGraph> {
  try {
    return await requestGraph(request, input, signal);
  } catch (error) {
    const legacyPortfolioEndpoint =
      input.scope === "portfolio" &&
      error instanceof DashboardRequestError &&
      error.status === 400 &&
      /relationshipId/i.test(error.message);
    if (!legacyPortfolioEndpoint) throw error;

    const relationships = relationshipRows(await loadRelationships(request, {}, signal));
    const graphResults = await mapSettledWithConcurrency(relationships, 4, (relationship) =>
      requestGraph(
        request,
        { ...input, scope: "relationship", relationshipId: relationship.id },
        signal,
      ),
    );
    const failures = graphResults.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failures.length > 0) {
      throw new DashboardRequestError(
        `Could not build the full company graph: ${failures.length} of ${relationships.length} company graphs failed.`,
        502,
        "partial_relationship_graph",
      );
    }
    const graphs = graphResults.map(
      (result) => (result as PromiseFulfilledResult<RelationshipGraph>).value,
    );
    const generatedAt = graphs.reduce(
      (latest, graph) => (graph.generatedAt > latest ? graph.generatedAt : latest),
      new Date().toISOString(),
    );
    return RelationshipGraphSchema.parse({
      contractVersion: "2026-08-01",
      generatedAt,
      asOf: input.asOf || generatedAt,
      historical: Boolean(input.asOf),
      scope: "portfolio",
      depth: input.depth || 2,
      nodes: [
        ...new Map(graphs.flatMap((graph) => graph.nodes).map((node) => [node.id, node])).values(),
      ],
      edges: [
        ...new Map(graphs.flatMap((graph) => graph.edges).map((edge) => [edge.id, edge])).values(),
      ],
      permissions: graphs.length
        ? {
            canView: graphs.every((graph) => graph.permissions.canView),
            canContribute: graphs.every((graph) => graph.permissions.canContribute),
            canApprove: graphs.every((graph) => graph.permissions.canApprove),
            canExecute: graphs.every((graph) => graph.permissions.canExecute),
            canSaveViews: graphs.every((graph) => graph.permissions.canSaveViews),
          }
        : {
            canView: true,
            canContribute: false,
            canApprove: false,
            canExecute: false,
            canSaveViews: false,
          },
    });
  }
}

/** One page of the duplicate inbox. The next page uses the same size as an offset. */
export const IDENTITY_CANDIDATE_PAGE = 50;

/** One duplicate-inbox page. hasMore is the server's look past this page. */
export type IdentityCandidatePage = {
  candidates: RelationshipIdentityCandidate[];
  hasMore: boolean;
};

/** Rows from an inbox page. A bare array is a test fixture that has no flag. */
export function identityCandidateRows(
  page: IdentityCandidatePage | readonly RelationshipIdentityCandidate[] | null | undefined,
): RelationshipIdentityCandidate[] {
  if (!page) return [];
  if (Array.isArray(page)) return [...page];
  return page.candidates ?? [];
}

/** True only when the server says another duplicate exists past this page. */
export function identityCandidatePageHasMore(
  page: IdentityCandidatePage | readonly RelationshipIdentityCandidate[] | null | undefined,
): boolean {
  if (!page || Array.isArray(page)) return false;
  return Boolean(page.hasMore);
}

export async function loadIdentityCandidates(
  request: RequestJsonFn,
  status = "pending",
  relationshipId?: string,
  signal?: AbortSignal,
  offset = 0,
): Promise<IdentityCandidatePage> {
  const params = new URLSearchParams({
    status,
    limit: String(IDENTITY_CANDIDATE_PAGE),
  });
  if (relationshipId) params.set("relationshipId", relationshipId);
  if (offset > 0) params.set("offset", String(offset));
  const body = await request({
    path: `/relationship-identity-candidates?${params.toString()}`,
    schema: IdentityListSchema,
    signal,
  });
  return {
    candidates: (body.candidates ?? []) as RelationshipIdentityCandidate[],
    hasMore: Boolean(body.hasMore),
  };
}

/** The attention API caps a page at 100 and defaults to 50. The queue asks for that default, then the next offset. */
export const ATTENTION_PAGE_SIZE = 50;

export type AttentionPage = {
  items: RelationshipAttentionItem[];
  hasMore: boolean;
};

/** Rows from a queue page. A bare array is a test fixture that has no flag. */
export function attentionRows(
  page: AttentionPage | readonly RelationshipAttentionItem[] | null | undefined,
): RelationshipAttentionItem[] {
  if (!page) return [];
  if (Array.isArray(page)) return [...page];
  return page.items ?? [];
}

/** True only when the server says another company exists past this page. */
export function attentionPageHasMore(
  page: AttentionPage | readonly RelationshipAttentionItem[] | null | undefined,
): boolean {
  if (!page || Array.isArray(page)) return false;
  return Boolean(page.hasMore);
}

export async function loadRelationshipAttention(
  request: RequestJsonFn,
  status = "open",
  signal?: AbortSignal,
  offset = 0,
): Promise<AttentionPage> {
  const params = new URLSearchParams({
    status,
    limit: String(ATTENTION_PAGE_SIZE),
  });
  if (offset > 0) params.set("offset", String(offset));
  const body = await request({
    path: `/relationship-attention?${params.toString()}`,
    schema: AttentionListSchema,
    signal,
  });
  return {
    items: (body.items ?? []) as RelationshipAttentionItem[],
    hasMore: Boolean(body.hasMore),
  };
}

export async function loadSemanticSearch(
  request: RequestJsonFn,
  query: string,
  signal?: AbortSignal,
): Promise<{ available: boolean; matches: SemanticMatch[] }> {
  const params = new URLSearchParams({ q: query });
  return request({
    path: `/revenue-search?${params.toString()}`,
    schema: SemanticSearchSchema,
    signal,
  });
}

export function fetchRelationships(
  filters: RelationshipListScope = {},
  signal?: AbortSignal,
): Promise<RelationshipDirectoryPage> {
  return loadRelationships(requestJson, filters, signal);
}

export function fetchRelationshipGraph(
  input: RelationshipGraphScope,
  signal?: AbortSignal,
): Promise<RelationshipGraph> {
  return loadRelationshipGraph(requestJson, input, signal);
}

export function fetchIdentityCandidates(
  status = "pending",
  relationshipId?: string,
  signal?: AbortSignal,
  offset = 0,
): Promise<IdentityCandidatePage> {
  return loadIdentityCandidates(requestJson, status, relationshipId, signal, offset);
}

export function fetchRelationshipAttention(
  status = "open",
  signal?: AbortSignal,
  offset = 0,
): Promise<AttentionPage> {
  return loadRelationshipAttention(requestJson, status, signal, offset);
}

export function fetchSemanticSearch(
  query: string,
  signal?: AbortSignal,
): Promise<{ available: boolean; matches: SemanticMatch[] }> {
  return loadSemanticSearch(requestJson, query, signal);
}

/** The people API refuses a larger page. The next rows use this same size as an offset. */
export const PERSON_PAGE_SIZE = 500;

export async function loadPersons(
  request: RequestJsonFn,
  query = "",
  signal?: AbortSignal,
  offset = 0,
): Promise<RelationshipPerson[]> {
  const params = new URLSearchParams({ limit: String(PERSON_PAGE_SIZE) });
  if (query.trim()) params.set("q", query.trim());
  if (offset > 0) params.set("offset", String(offset));
  const body = await request({
    path: `/relationship-persons?${params.toString()}`,
    schema: PersonListSchema,
    signal,
  });
  return (body.persons ?? []) as RelationshipPerson[];
}

export function fetchPersons(
  query = "",
  signal?: AbortSignal,
  offset = 0,
): Promise<RelationshipPerson[]> {
  return loadPersons(requestJson, query, signal, offset);
}
