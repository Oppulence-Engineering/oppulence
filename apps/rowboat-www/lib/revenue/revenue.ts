// Revenue BFF client (RFC 030). Fetchers stay server-importable so RSC
// prefetch can share the same keys and Zod contracts as the browser hooks.

import { commitmentRows, fetchCommitments } from "@/hooks/queries/utils/fetch-commitments";
import { fetchDigest, fetchImpact } from "@/hooks/queries/utils/fetch-impact";
import {
  auditRows,
  fetchOpenPromisesReport,
  fetchReportScan,
  fetchReportScans,
} from "@/hooks/queries/utils/fetch-report";
import { actionRows, fetchRevenueActions } from "@/hooks/queries/utils/fetch-revenue-actions";
import {
  fetchRelationshipSources,
  fetchRelationshipSourceStatuses,
} from "@/hooks/queries/utils/fetch-relationship-sources";
import {
  fetchIdentityCandidates,
  fetchPersons,
  personRows,
  fetchRelationshipAttention,
  fetchRelationshipGraph,
  fetchRelationships,
  fetchSemanticSearch,
} from "@/hooks/queries/utils/fetch-relationships";
import {
  fetchCommunicationPolicy,
  fetchCommunicationPrivacyRules,
} from "@/hooks/queries/utils/fetch-communication";
import { fetchWorkspace } from "@/hooks/queries/utils/fetch-workspace";
import { fetchAcknowledgeMissionControl } from "@/hooks/queries/utils/mutate-acknowledge-mission-control";
import {
  fetchAppendCommitmentTransition,
  type AppendCommitmentTransitionInput,
} from "@/hooks/queries/utils/mutate-append-commitment-transition";
import { fetchApproveMutualActionPlan } from "@/hooks/queries/utils/mutate-approve-mutual-action-plan";
import { fetchApproveRelationshipRecommendation } from "@/hooks/queries/utils/mutate-approve-relationship-recommendation";
import { fetchApproveRevenueAction } from "@/hooks/queries/utils/mutate-approve-revenue-action";
import { fetchCorrectConversationEvidence } from "@/hooks/queries/utils/mutate-correct-conversation-evidence";
import { fetchCorrectRelationship } from "@/hooks/queries/utils/mutate-correct-relationship";
import {
  fetchCreateMutualActionPlan,
  type CreateMutualActionPlanInput,
} from "@/hooks/queries/utils/mutate-create-mutual-action-plan";
import {
  fetchCreateRelationship,
  type CreateRelationshipInput as CreateRelationshipMutationInput,
} from "@/hooks/queries/utils/mutate-create-relationship";
import {
  fetchCreateRevenueAction,
  type CreateRevenueActionInput,
} from "@/hooks/queries/utils/mutate-create-revenue-action";
import { fetchDecideConversationChange } from "@/hooks/queries/utils/mutate-decide-conversation-change";
import { fetchDecideRelationshipAttention } from "@/hooks/queries/utils/mutate-decide-relationship-attention";
import {
  fetchDecideRelationshipIdentityCandidate,
  type DecideRelationshipIdentityCandidateInput,
} from "@/hooks/queries/utils/mutate-decide-relationship-identity-candidate";
import { fetchDisconnectRelationshipSource } from "@/hooks/queries/utils/mutate-disconnect-relationship-source";
import { fetchDismissRevenueAction } from "@/hooks/queries/utils/mutate-dismiss-revenue-action";
import {
  fetchEditRevenueAction,
  type EditRevenueActionInput,
} from "@/hooks/queries/utils/mutate-edit-revenue-action";
import { fetchEvaluateRevenueAction } from "@/hooks/queries/utils/mutate-evaluate-revenue-action";
import { fetchExecuteRevenueAction } from "@/hooks/queries/utils/mutate-execute-revenue-action";
import {
  fetchIngestRelationshipObservations,
  type IngestRelationshipObservationsInput,
} from "@/hooks/queries/utils/mutate-ingest-relationship-observations";
import {
  fetchLinkRevenueWorkspace,
  type LinkRevenueWorkspaceInput,
} from "@/hooks/queries/utils/mutate-link-revenue-workspace";
import {
  fetchRecordRevenueActionOutcome,
  type RecordRevenueActionOutcomeInput,
} from "@/hooks/queries/utils/mutate-record-revenue-action-outcome";
import { fetchRejectRelationshipRecommendation } from "@/hooks/queries/utils/mutate-reject-relationship-recommendation";
import { fetchRejectRevenueAction } from "@/hooks/queries/utils/mutate-reject-revenue-action";
import { fetchReportRelationshipSourceAuthorization } from "@/hooks/queries/utils/mutate-report-relationship-source-authorization";
import { fetchRequestConversationDeletion } from "@/hooks/queries/utils/mutate-request-conversation-deletion";
import { fetchResolveRelationshipContradiction } from "@/hooks/queries/utils/mutate-resolve-relationship-contradiction";
import { fetchResyncRelationshipSource } from "@/hooks/queries/utils/mutate-resync-relationship-source";
import { fetchRetractRelationshipAssertion } from "@/hooks/queries/utils/mutate-retract-relationship-assertion";
import { fetchRunCommitmentRecovery } from "@/hooks/queries/utils/mutate-run-commitment-recovery";
import { fetchShareMutualActionPlan } from "@/hooks/queries/utils/mutate-share-mutual-action-plan";
import { fetchSnoozeRevenueAction } from "@/hooks/queries/utils/mutate-snooze-revenue-action";
import { fetchStartRevenueLeakScan } from "@/hooks/queries/utils/mutate-start-revenue-leak-scan";
import type { RelationshipListScope } from "@/hooks/queries/utils/relationship-keys";
import { RELATIONSHIP_SOURCE_STATUS_QUERY_KEY } from "@/hooks/queries/utils/relationship-source-keys";
import { DashboardRequestError } from "@/lib/api/request-json";
import {
  dashboardRequest,
  redirectBrowserIfUnauthorized,
  toDashboardAPIPath,
} from "@/lib/auth/dashboard-fetch";
import { ExportCommitment200Response } from "@/lib/api/generated/zod/relationship-intelligence/relationship-intelligence";
import type {
  ActionAudit,
  RelationshipDetail,
  RevenueAction,
  RevenueLeakScan,
  RevenueRelationship,
  RelationshipObservation,
  RelationshipSourceStatus,
  BetaDiagnostics,
  RelationshipGraph,
  RelationshipIntelligence,
  RelationshipStateSnapshot,
  PersonDeletionReceipt,
  CompanyResearchOutcome,
  PersonResearchOutcome,
  RelationshipPerson,
  RelationshipPersonAttribute,
  ResearchConsentState,
  ResearchEstimate,
  ResearchStatus,
  CommunicationPolicy,
  CommunicationPrivacyRule,
  CommunicationTimelineItem,
  CommitmentRegisterFilter,
  CommitmentRecord,
  RegisterEntry,
} from "@/lib/revenue/types";

// Initial evidence reads use a bounded six-month window. Later scans advance
// from the latest freshness cursor and therefore remain incremental.
export const REVENUE_EVIDENCE_LOOKBACK_DAYS = 180;
export const REVENUE_EVIDENCE_LOOKBACK_LABEL = "6 months";

export class RevenueAPIError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "RevenueAPIError";
    this.status = status;
    this.code = code;
  }
}

function asRevenueError(error: unknown): never {
  if (error instanceof DashboardRequestError) {
    throw new RevenueAPIError(error.message, error.status, error.code);
  }
  throw error;
}

async function viaRequest<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    asRevenueError(error);
  }
}

/**
 * Validates a response against its contract.
 *
 * A mismatch means this client and the API disagree about the shape, which is
 * a deployment fact, not something the reader did. A zod issue list is a
 * developer artifact — printed verbatim it put
 * `[{"expected":"array","code":"invalid_type",…}]` in front of the user — so
 * the issues go to the console and the caller gets a sentence it can render.
 */
function parsed<T>(schema: { parse: (value: unknown) => T }, value: unknown, subject: string): T {
  try {
    return schema.parse(value);
  } catch (error) {
    console.error(`Unexpected ${subject} response`, error);
    throw new RevenueAPIError(
      `The ${subject} response did not match what this app expects. The app and the API are probably running different versions.`,
      0,
      "schema_mismatch",
    );
  }
}

/**
 * A failed load should keep its short fallback unless the failure is one we
 * already explain, such as a rate limit or an API that is down.
 */
export function explainedRevenueError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message) return fallback;
  const friendly = friendlyRevenueError(message);
  return friendly === message ? fallback : friendly;
}

const BARE_STATUS_PREFIX = [
  "Request failed",
  "Console request failed",
  "Workflow request failed",
  "Composio request failed",
  "Export failed",
  "Report export failed",
].join("|");
const BARE_REQUEST_STATUS = new RegExp(`^(?:${BARE_STATUS_PREFIX}) \\(\\d+\\)\\.?$`);

/**
 * A save should keep a specific API sentence. A status code with no sentence
 * is replaced by the action's own fallback. Rate limits and a down API still
 * use the sentences we already explain.
 */
export function shownRequestError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message) return fallback;
  const friendly = friendlyRevenueError(message);
  if (friendly !== message) return friendly;
  if (BARE_REQUEST_STATUS.test(message)) return fallback;
  return message;
}

export function friendlyRevenueError(message: string) {
  if (/gmail.*(?:returned 429|user-rate limit exceeded)/i.test(message)) {
    return "Google is temporarily limiting Gmail reads for this account. Please try the audit again in about 15 minutes.";
  }
  if (/\brate limit\b|too many requests|\(429\)/i.test(message)) {
    return "Too many requests were sent from this workspace. Wait a moment, then try again.";
  }
  if (/session refresh is temporarily unavailable|session_unavailable/i.test(message)) {
    return "Your session could not be refreshed. Sign out and sign in again.";
  }
  if (/rowboat-api is unreachable|upstream_unavailable/i.test(message)) {
    return "The Oppulence API is not reachable. In local dev, start rowboat-api on port 18080, then reload.";
  }
  if (/\(503\)/.test(message) && /\bfailed\b|unreachable|unavailable/i.test(message)) {
    return "The Oppulence API returned an error (503). Confirm rowboat-api is running on port 18080, then reload.";
  }
  return message;
}

/**
 * A failed audit stores the provider error. The audits list, the empty
 * commitments view, and the report's scanning step all show that string.
 */
export function auditFailureCopy(message: string): string {
  const friendly = friendlyRevenueError(message);
  if (friendly !== message) return friendly;
  if (/invalid authentication|invalid_grant|unauthorized|returned 40[13]/i.test(message)) {
    return "Google stopped accepting the authorization. Reconnect, then run the audit again.";
  }
  if (/scan abandoned|scan aborted/i.test(message)) {
    return "The audit stopped before it finished. Run it again.";
  }
  if (/google api|gmail|backend error|returned 5\d\d|deadline exceeded/i.test(message)) {
    return "Google could not finish reading your mail. Try the audit again in a few minutes.";
  }
  return friendly;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await dashboardRequest(toDashboardAPIPath(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  redirectBrowserIfUnauthorized(res.status);
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    let code: string | undefined;
    try {
      const body = await res.json();
      detail = body.detail || body.title || detail;
      code = body.code;
    } catch {
      // non-JSON error body; keep the status-based message
    }
    throw new RevenueAPIError(detail, res.status, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function safeResearchCitationURL(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// --- workspace ---------------------------------------------------------------

export const getWorkspace = (signal?: AbortSignal) => viaRequest(() => fetchWorkspace(signal));

export const getImpact = (signal?: AbortSignal) => viaRequest(() => fetchImpact(signal));

export const getDigest = (signal?: AbortSignal) => viaRequest(() => fetchDigest(signal));

export interface SemanticMatch {
  threadId: string;
  subject: string;
  counterparty: string;
  classification: string;
  summary: string;
  score: number;
}

// semanticSearch runs a natural-language search over the mail signals (RFC 031
// Layer 2). `available` is false when semantic memory isn't configured.
export async function semanticSearch(
  query: string,
  signal?: AbortSignal,
): Promise<{ available: boolean; matches: SemanticMatch[] }> {
  return viaRequest(() => fetchSemanticSearch(query, signal));
}

// --- billing (upgrade to act) ------------------------------------------------

// startCheckout opens a Stripe Checkout session for the given plan and returns
// the URL to redirect to. Acting on actions (approve/execute) is gated behind
// a paid plan; reading, scanning, and drafting stay free.
export async function startCheckout(plan: "starter" | "pro"): Promise<string> {
  const body = await call<{ url: string }>("/billing/checkout-session", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
  return body.url;
}

export type LinkWorkspaceInput = LinkRevenueWorkspaceInput;

export const linkWorkspace = (input: LinkWorkspaceInput) =>
  viaRequest(() => fetchLinkRevenueWorkspace(input));

// --- scan --------------------------------------------------------------------

export const startScan = (lookbackDays?: number) =>
  viaRequest(() => fetchStartRevenueLeakScan(lookbackDays ? { lookbackDays } : {}));

export const getScan = fetchReportScan;

export async function listScans(
  signal?: AbortSignal,
  offset = 0,
): Promise<RevenueLeakScan[]> {
  return auditRows(await fetchReportScans(signal, offset));
}

export function latestCompletedScan(
  scans: Array<Pick<RevenueLeakScan, "id" | "status" | "threadsSeen">>,
) {
  return (
    scans.find((scan) => scan.status === "completed" && (scan.threadsSeen ?? 0) > 0) ??
    scans.find((scan) => scan.status === "completed")
  );
}

export type RelationshipSourceHealth = "not_connected" | "needs_reconnect" | "ready";

type SourceHealthRecord = {
  source: string;
  status: string;
  missingScopes?: string[];
};

const STOPPED_SOURCE_STATUSES = new Set(["reconnect_required", "disconnected", "not_connected"]);

/**
 * Resolves source readiness account-by-account. A stale failed account must
 * not block an audit after another account has reconnected successfully.
 */
export function relationshipSourceHealth(
  sources: SourceHealthRecord[],
  sourceName = "google",
): RelationshipSourceHealth {
  const matching = sources.filter((source) => source.source === sourceName);
  if (matching.length === 0) return "not_connected";

  const hasUsableAccount = matching.some(
    (source) =>
      !STOPPED_SOURCE_STATUSES.has(source.status) && (source.missingScopes?.length ?? 0) === 0,
  );
  if (hasUsableAccount) return "ready";

  return matching.every(
    (source) =>
      STOPPED_SOURCE_STATUSES.has(source.status) || (source.missingScopes?.length ?? 0) > 0,
  )
    ? "needs_reconnect"
    : "not_connected";
}

export function googleSourceHealth(
  sources: Array<{
    source: string;
    accounts: Array<{ status: string; missingScopes: string[] }>;
  }>,
) {
  return relationshipSourceHealth(
    sources.flatMap((source) =>
      source.accounts.map((account) => ({ source: source.source, ...account })),
    ),
  );
}

export const googleNeedsReconnect = (sources: RelationshipSourceStatus[]) =>
  relationshipSourceHealth(sources) === "needs_reconnect";

export type GoogleAuditLaunch = "run" | "reconnect" | "connect";

/**
 * An audit reads Gmail. A dead grant has to be repaired, and a workspace with
 * no Google account cannot start a scan that the API will reject. Only a
 * usable account is allowed to run.
 */
export function googleAuditLaunch(sources: RelationshipSourceStatus[]): GoogleAuditLaunch {
  const health = relationshipSourceHealth(sources);
  if (health === "needs_reconnect") return "reconnect";
  if (health === "not_connected") return "connect";
  return "run";
}

/**
 * The report lists more than one audit in a picker. The stored status is a
 * slug. The audits page already names the same states in sentences.
 */
/**
 * The register and the audits list share this count. threadsSeen is everything
 * swept, including newsletters the audit never judged. Once coverage is
 * recorded, the number is the conversations that were actually read.
 */
export function examinedConversationCount(
  scan?: {
    threadsSeen?: number;
    threadsDeepRead?: number;
    threadsSnippetOnly?: number;
    threadsSkipped?: number;
  } | null,
): number {
  if (!scan) return 0;
  const swept = scan.threadsSeen ?? 0;
  const skipped = scan.threadsSkipped ?? 0;
  const snippetOnly = scan.threadsSnippetOnly ?? 0;
  const deepRead = scan.threadsDeepRead ?? 0;
  return deepRead + snippetOnly > 0 || skipped > 0 ? deepRead + snippetOnly : swept;
}

export function auditHistoryLabel(status: string): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "running":
    case "pending":
      return "In progress";
    case "failed":
      return "Failed";
    default: {
      const words = status.replaceAll("_", " ").trim();
      if (!words) return "Unknown";
      return words.replace(/\b\w/g, (letter) => letter.toUpperCase());
    }
  }
}

/** The audit button says what the click will do. A missing mailbox is not a scan. */
export function auditLaunchLabel(input: {
  needsReconnect: boolean;
  needsConnect: boolean;
  scanning: boolean;
  scanningLabel: string;
  runLabel: string;
}): string {
  if (input.needsReconnect) return "Reconnect Google";
  if (input.needsConnect) return "Connect Gmail & Calendar";
  if (input.scanning) return input.scanningLabel;
  return input.runLabel;
}

/** Sources still delivering evidence; stopped grants do not count. */
export const connectedSourceCount = (sources: RelationshipSourceStatus[]) =>
  sources.filter(
    (source) =>
      !STOPPED_SOURCE_STATUSES.has(source.status) && (source.missingScopes?.length ?? 0) === 0,
  ).length;

// --- queue reads -------------------------------------------------------------

export async function listActions(
  queueStatus = "open",
  limit = 25,
  signal?: AbortSignal,
): Promise<RevenueAction[]> {
  return viaRequest(async () => actionRows(await fetchRevenueActions(queueStatus, limit, signal)));
}

export const getAction = (actionId: string) => call<RevenueAction>(`/revenue-actions/${actionId}`);

export const getAudit = (actionId: string) =>
  call<ActionAudit>(`/revenue-actions/${actionId}/audit`);

// getSourceBody fetches the original email body behind an action (RFC 031
// Layer 3), served from a sealed short-TTL cache or fetched on demand.
export const getSourceBody = (actionId: string) =>
  call<{ body: string }>(`/revenue-actions/${actionId}/source-body`).then((r) => r.body);

export type CreateActionInput = CreateRevenueActionInput;

export const createAction = (input: CreateActionInput) =>
  viaRequest(() => fetchCreateRevenueAction(input));

// --- relationships -----------------------------------------------------------

export interface RelationshipFilters {
  q?: string;
  lifecycle?: string;
  health?: string;
  engagement?: string;
}

/** A stored web address. http(s) is kept. A bare host gets https. Other schemes are dropped. */
export function webAddressHref(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  return `https://${trimmed}`;
}

/** The list and the sheet share one LinkedIn action. A saved page or a company reference is "View profile". Anything else searches. */
export function companyLinkedInAction(
  displayName: string,
  resourceRefs: readonly string[] | null | undefined,
  linkedinURL?: string | null,
): { href: string; label: "View profile" | "Find profile" } {
  const refs = resourceRefs ?? [];
  const href = companyLinkedInURL(displayName, [...refs], linkedinURL ?? undefined);
  const saved =
    Boolean(webAddressHref(linkedinURL)) || refs.some((ref) => ref.startsWith("linkedin:company:"));
  return { href, label: saved ? "View profile" : "Find profile" };
}

export const companyLinkedInURL = (
  displayName: string,
  resourceRefs: string[],
  linkedinURL?: string,
) => {
  // A saved page is the profile, even when it is not the www company prefix.
  // Ignoring it sent "View profile" to a name search.
  const saved = webAddressHref(linkedinURL);
  if (saved) return saved;
  const prefix = "linkedin:company:";
  const linkedInRef = resourceRefs.find((ref) => ref.startsWith(prefix));
  return linkedInRef
    ? `https://www.linkedin.com/company/${encodeURIComponent(linkedInRef.slice(prefix.length))}`
    : `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(displayName)}`;
};

// An absent count is not a count of zero.
//
// This rendered `count ?? 0` as "0 interactions", so an account last touched
// eighteen hours ago was labelled as having no interactions at all — the
// number had simply never been computed. Stating a total nobody counted is the
// product's worst failure mode: confidently wrong beats "we do not know".
export const interactionCountLabel = (count: number | null | undefined) => {
  if (count === null || count === undefined) return "—";
  // It counts indexed email threads, so it says so. Called "interactions" it
  // read as every touch of the account, which made "0 interactions" sit next
  // to "last interaction 18 hours ago" and look like a contradiction — the
  // account had been touched, just not over indexed mail.
  return `${count} email thread${count === 1 ? "" : "s"}`;
};

export async function listRelationships(
  filters: RelationshipFilters = {},
  signal?: AbortSignal,
): Promise<RevenueRelationship[]> {
  const page = await viaRequest(() => fetchRelationships(filters as RelationshipListScope, signal));
  return page.relationships;
}

export interface RelationshipGraphRequest {
  scope: "portfolio" | "relationship";
  relationshipId?: string;
  depth?: 1 | 2 | 3;
  asOf?: string;
  offset?: number;
  observationOffset?: number;
}

export async function getRelationshipGraph(
  input: RelationshipGraphRequest,
  signal?: AbortSignal,
): Promise<RelationshipGraph> {
  return viaRequest(() => fetchRelationshipGraph(input, signal));
}

export const getRelationship = (id: string) => call<RelationshipDetail>(`/relationships/${id}`);

export async function listPersons(q = "", signal?: AbortSignal): Promise<RelationshipPerson[]> {
  return personRows(await viaRequest(() => fetchPersons(q, signal)));
}

export const getPersonAttributes = (personId: string) =>
  call<{ attributes: RelationshipPersonAttribute[] }>(
    `/relationship-persons/${encodeURIComponent(personId)}/attributes`,
  ).then((body) => body.attributes ?? []);

export const getResearchStatus = () => call<ResearchStatus>("/research/status");

// These writes have no OpenAPI operationId with a 200/201/202 schema, so
// `gen mutation --operation` cannot express them. Do not invent a local Zod
// stub; document the route on the Go spec, then generate.
export const setResearchConsent = (consented: boolean) =>
  call<ResearchConsentState>("/research/consent", {
    method: "PUT",
    body: JSON.stringify({ consented }),
  });

export const getResearchEstimate = () => call<ResearchEstimate>("/research/people/estimate");

export const getCompanyResearchEstimate = () =>
  call<ResearchEstimate>("/research/companies/estimate");

const researchSignal = () => AbortSignal.timeout(10 * 60_000);

export const enrichPendingPersons = async (batchSize: number) => {
  const { personIds } = await call<{ personIds: string[] }>("/research/people/pending");
  const outcomes: PersonResearchOutcome[] = [];
  const size = Math.max(1, Math.floor(batchSize));
  for (let offset = 0; offset < personIds.length; offset += size) {
    const result = await call<{ outcomes: PersonResearchOutcome[] }>("/research/people", {
      method: "POST",
      body: JSON.stringify({ personIds: personIds.slice(offset, offset + size) }),
      signal: researchSignal(),
    });
    outcomes.push(...(result.outcomes ?? []));
  }
  return { requested: personIds.length, outcomes };
};

export const enrichPendingCompanies = async (batchSize: number) => {
  const { relationshipIds } = await call<{ relationshipIds: string[] }>(
    "/research/companies/pending",
  );
  const outcomes: CompanyResearchOutcome[] = [];
  const size = Math.max(1, Math.floor(batchSize));
  for (let offset = 0; offset < relationshipIds.length; offset += size) {
    const result = await call<{ outcomes: CompanyResearchOutcome[] }>("/research/companies", {
      method: "POST",
      body: JSON.stringify({ relationshipIds: relationshipIds.slice(offset, offset + size) }),
      signal: researchSignal(),
    });
    outcomes.push(...(result.outcomes ?? []));
  }
  return { requested: relationshipIds.length, outcomes };
};

export const deletePerson = (personId: string) =>
  call<PersonDeletionReceipt>(`/relationship-persons/${encodeURIComponent(personId)}`, {
    method: "DELETE",
    body: JSON.stringify({ reason: "user_action" }),
  });

export const acknowledgeMissionControl = (id: string, stateVersion: number, stateHash: string) =>
  viaRequest(() => fetchAcknowledgeMissionControl(id, { stateVersion, stateHash }));

export type TimelinePageCursor = {
  before?: string;
  beforeId?: string;
};

export type RelationshipTimelinePage = {
  observations: RelationshipObservation[];
  hasMore: boolean;
  nextBefore?: string;
  nextBeforeId?: string;
};

export type CommunicationTimelinePage = {
  items: CommunicationTimelineItem[];
  hasMore: boolean;
  nextBefore?: string;
  nextBeforeId?: string;
};

const emptyCommunicationPage = (): CommunicationTimelinePage => ({ items: [], hasMore: false });

function timelineQuery(limit: number, cursor?: string | TimelinePageCursor): string {
  const page: TimelinePageCursor = typeof cursor === "string" ? { before: cursor } : { ...cursor };
  const params = new URLSearchParams({ limit: String(limit) });
  if (page.before) params.set("before", page.before);
  if (page.beforeId) params.set("beforeId", page.beforeId);
  return params.toString();
}

export const getRelationshipTimelinePage = (
  id: string,
  limit = 50,
  before?: string | TimelinePageCursor,
  signal?: AbortSignal,
) =>
  call<RelationshipTimelinePage>(`/relationships/${id}/timeline?${timelineQuery(limit, before)}`, {
    signal,
  }).then((body) => ({
    observations: body.observations ?? [],
    hasMore: Boolean(body.hasMore),
    nextBefore: body.nextBefore,
    nextBeforeId: body.nextBeforeId,
  }));

export const getRelationshipTimeline = (id: string, limit = 50, signal?: AbortSignal) =>
  getRelationshipTimelinePage(id, limit, undefined, signal).then((page) => page.observations);

export const getRelationshipCommunicationTimeline = (
  id: string,
  limit = 50,
  before?: string | TimelinePageCursor,
  signal?: AbortSignal,
) =>
  call<CommunicationTimelinePage>(
    `/relationships/${id}/communication-timeline?${timelineQuery(limit, before)}`,
    { signal },
  )
    .then((body) => ({
      items: body.items ?? [],
      hasMore: Boolean(body.hasMore),
      nextBefore: body.nextBefore,
      nextBeforeId: body.nextBeforeId,
    }))
    .catch((error) => {
      // Workspaces without communication intelligence, or an older API,
      // answer 404/409. The company sheet can still render without that pane.
      if (error instanceof RevenueAPIError && (error.status === 404 || error.status === 409)) {
        return emptyCommunicationPage();
      }
      throw error;
    });

export const getCommunicationPolicy = (sourceAccountId: string, signal?: AbortSignal) =>
  viaRequest(() => fetchCommunicationPolicy(sourceAccountId, signal));

export const putCommunicationPolicy = (
  sourceAccountId: string,
  policy: Omit<CommunicationPolicy, "id" | "sourceAccountId" | "version">,
) =>
  call<CommunicationPolicy>(
    `/revenue-workspaces/current/communication-policy/${encodeURIComponent(sourceAccountId)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        metadataVisibility: policy.metadataVisibility,
        shareSubject: policy.shareSubject,
        shareBody: policy.shareBody,
        shareAttachments: policy.shareAttachments,
        signatureEnrichment: policy.signatureEnrichment,
        modelContactExtraction: policy.modelContactExtraction,
        retentionDays: policy.retentionDays,
      }),
    },
  );

export const listCommunicationPrivacyRules = (signal?: AbortSignal) =>
  viaRequest(() => fetchCommunicationPrivacyRules(signal));

export const createCommunicationPrivacyRule = (input: { kind: string; value: string }) =>
  call<CommunicationPrivacyRule>("/revenue-workspaces/current/communication-privacy-rules", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const deleteCommunicationPrivacyRule = (ruleId: string) =>
  call<void>(
    `/revenue-workspaces/current/communication-privacy-rules/${encodeURIComponent(ruleId)}`,
    {
      method: "DELETE",
    },
  );

export const getCommunicationInteractionBody = (interactionId: string) =>
  call<{ body: string }>(
    `/revenue-workspaces/current/communications/${encodeURIComponent(interactionId)}/body`,
  );

export const RELATIONSHIP_CHANGE_PAGE = 2;

export type RelationshipChangePage = {
  snapshots: RelationshipStateSnapshot[];
  hasMore: boolean;
};

export const INTELLIGENCE_OBSERVATION_PAGE = 200;

export const getRelationshipConversationReview = (id: string, offset = 0) =>
  call<{
    reviewItems?: RelationshipIntelligence["reviewItems"];
    governanceReceipts?: RelationshipIntelligence["governanceReceipts"];
    hasMore?: boolean;
  }>(`/relationships/${id}/conversation-review?offset=${offset}`).then((body) => ({
    reviewItems: body.reviewItems ?? [],
    governanceReceipts: body.governanceReceipts ?? [],
    hasMore: Boolean(body.hasMore),
  }));

export const getRelationshipChanges = (id: string, offset = 0) =>
  call<{ snapshots?: RelationshipStateSnapshot[]; hasMore?: boolean }>(
    `/relationships/${id}/changes?limit=${RELATIONSHIP_CHANGE_PAGE}${
      offset > 0 ? `&offset=${offset}` : ""
    }`,
  ).then((body) => ({
    snapshots: body.snapshots ?? [],
    hasMore: Boolean(body.hasMore),
  }));

export const getRelationshipEvidence = (relationshipId: string, evidenceId: string) =>
  call<{ observation: RelationshipObservation; payload: unknown }>(
    `/relationships/${relationshipId}/evidence/${evidenceId}`,
  );

export const ingestRelationshipObservations = (
  observations: IngestRelationshipObservationsInput["observations"],
) => viaRequest(() => fetchIngestRelationshipObservations({ observations }));

export interface RelationshipCorrectionInput {
  dimension:
    | "lifecycle"
    | "engagement"
    | "sentiment"
    | "health"
    | "summary"
    | "next_action"
    | "risk"
    | "milestone";
  value: string;
  reason: string;
  supersedesAssertionId?: string;
  validTo?: string;
}

export const correctRelationship = (id: string, input: RelationshipCorrectionInput) =>
  viaRequest(() => fetchCorrectRelationship(id, input));

export const retractRelationshipAssertion = (
  relationshipId: string,
  assertionId: string,
  reason: string,
) => viaRequest(() => fetchRetractRelationshipAssertion(relationshipId, assertionId, { reason }));

export const correctConversationReview = (
  id: string,
  input: {
    reviewItemId: string;
    correctedValue: string;
    reason: string;
  },
) => viaRequest(() => fetchCorrectConversationEvidence(id, input));

export const decideConversationReview = (
  id: string,
  input: {
    reviewItemId: string;
    kind: "approve" | "correct" | "reject" | "defer";
    correctedValue?: string;
    reason?: string;
    deferUntil?: string;
  },
) => viaRequest(() => fetchDecideConversationChange(id, input));

export const resolveRelationshipContradiction = (
  id: string,
  caseId: string,
  input: { selectedAssertionId: string; reason?: string },
) => viaRequest(() => fetchResolveRelationshipContradiction(id, caseId, input));

export const runCommitmentRecovery = (id: string) =>
  viaRequest(() => fetchRunCommitmentRecovery(id, {}));

export const appendCommitmentTransition = (
  relationshipId: string,
  commitmentId: string,
  input: AppendCommitmentTransitionInput,
) => viaRequest(() => fetchAppendCommitmentTransition(relationshipId, commitmentId, input));

export const createMutualActionPlan = (
  relationshipId: string,
  commitmentIds: CreateMutualActionPlanInput["commitmentIds"],
) => viaRequest(() => fetchCreateMutualActionPlan(relationshipId, { commitmentIds }));

export const approveMutualActionPlan = (relationshipId: string, planId: string) =>
  viaRequest(() => fetchApproveMutualActionPlan(relationshipId, planId, {}));

export const shareMutualActionPlan = (relationshipId: string, planId: string) =>
  viaRequest(() => fetchShareMutualActionPlan(relationshipId, planId, {}));

export const requestConversationDeletion = (relationshipId: string, requestId: string) =>
  viaRequest(() => fetchRequestConversationDeletion(relationshipId, { requestId }));

/**
 * One cache entry for source health. The sidebar and the revenue panel both
 * read it, so a finished audit refreshes both with one invalidation.
 */
export { RELATIONSHIP_SOURCE_STATUS_QUERY_KEY };

export const listRelationshipSourceStatuses = fetchRelationshipSourceStatuses;

export const listRelationshipSources = (signal?: AbortSignal) =>
  viaRequest(() => fetchRelationshipSources(signal));

export const getRelationshipBetaDiagnostics = () =>
  call<BetaDiagnostics>("/relationship-beta/diagnostics");

export const reportRelationshipSourceAuthorization = (
  source: string,
  input: {
    sourceAccountId?: string;
    state: "started" | "completed" | "canceled" | "failed";
    grantedScopes?: string[];
    errorCode?: string;
  },
) => viaRequest(() => fetchReportRelationshipSourceAuthorization(source, input));

export const resyncRelationshipSource = (source: string, sourceAccountId: string) =>
  viaRequest(() => fetchResyncRelationshipSource(source, { sourceAccountId }));

export const disconnectRelationshipSource = (source: string, sourceAccountId: string) =>
  viaRequest(() => fetchDisconnectRelationshipSource(source, sourceAccountId));

export const listIdentityCandidates = (
  status = "pending",
  relationshipId?: string,
  signal?: AbortSignal,
) => viaRequest(() => fetchIdentityCandidates(status, relationshipId, signal));

export const decideIdentityCandidate = (
  candidateId: string,
  input: DecideRelationshipIdentityCandidateInput,
) => viaRequest(() => fetchDecideRelationshipIdentityCandidate(candidateId, input));

export const listRelationshipAttention = (status = "open", signal?: AbortSignal) =>
  viaRequest(() => fetchRelationshipAttention(status, signal));

export const decideRelationshipAttention = (
  attentionId: string,
  input: {
    decision: "acknowledge" | "snooze" | "dismiss";
    reason: string;
    expectedVersion: number;
    snoozedUntil?: string;
  },
) => viaRequest(() => fetchDecideRelationshipAttention(attentionId, input));

export const approveRecommendation = (actionId: string, acceptRisk = false) =>
  viaRequest(() => fetchApproveRelationshipRecommendation(actionId, { acceptRisk }));

export const rejectRecommendation = (actionId: string, reason: string) =>
  viaRequest(() => fetchRejectRelationshipRecommendation(actionId, { reason }));

export type CreateRelationshipInput = CreateRelationshipMutationInput;

export const createRelationship = (input: CreateRelationshipInput) =>
  viaRequest(() => fetchCreateRelationship(input));

// --- lifecycle ---------------------------------------------------------------

export type EditActionInput = EditRevenueActionInput;

export const editAction = (actionId: string, input: EditActionInput) =>
  viaRequest(() => fetchEditRevenueAction(actionId, input));

export const evaluateAction = (actionId: string) =>
  viaRequest(() => fetchEvaluateRevenueAction(actionId));

export const approveAction = (actionId: string, acceptRisk = false) =>
  viaRequest(() => fetchApproveRevenueAction(actionId, { acceptRisk }));

export const rejectAction = (actionId: string, reason: string) =>
  viaRequest(() => fetchRejectRevenueAction(actionId, { reason }));

export const executeAction = (actionId: string) =>
  viaRequest(() => fetchExecuteRevenueAction(actionId));

export const snoozeAction = (actionId: string, until: string) =>
  viaRequest(() => fetchSnoozeRevenueAction(actionId, { until }));

export const dismissAction = (actionId: string, reason: string) =>
  viaRequest(() => fetchDismissRevenueAction(actionId, { reason }));

export type RecordOutcomeInput = RecordRevenueActionOutcomeInput;
export type { DecideRelationshipIdentityCandidateInput };

export const recordOutcome = (actionId: string, input: RecordOutcomeInput) =>
  viaRequest(() => fetchRecordRevenueActionOutcome(actionId, input));

// --- display helpers ---------------------------------------------------------

const ATTENTION_REASON_LABELS: Record<string, string> = {
  quiet_account: "Quiet company",
  contact_departed: "Contact left",
  external_trigger: "Outside event",
  overdue_commitment: "Overdue promise",
  unresolved_risk: "Unresolved risk",
  missing_next_step: "No next step",
  source_degradation: "Source needs reconnecting",
  action_outcome_review: "Action needs review",
  recommendation: "Suggested follow-up",
};

const STORED_OVERDUE_PROMISE =
  /^A confirmed commitment is overdue by (\d+) day(s?)\.$/;

/** Older attention rows said commitment. The company sheet says promise. */
export function attentionExplanationCopy(explanation: string | null | undefined): string {
  const raw = explanation?.trim() ?? "";
  const match = STORED_OVERDUE_PROMISE.exec(raw);
  if (!match?.[1]) return raw;
  const days = Number(match[1]);
  const suffix = days === 1 ? "" : "s";
  return `A confirmed promise is overdue by ${days} day${suffix}.`;
}

/** Impact lists attention reason codes. The queue already has a sentence. */
export function attentionReasonLabel(reason: string): string {
  const known = ATTENTION_REASON_LABELS[reason] ?? DETECTOR_LABELS[reason];
  if (known) return known;
  return reason
    .replaceAll(/[._]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const DETECTOR_LABELS: Record<string, string> = {
  requested_follow_up_due: "Follow-up due",
  unanswered_proposal: "Unanswered proposal",
  waiting_on_me: "Waiting on you",
  dormant_warm_opportunity: "Dormant opportunity",
  neglected_referral: "Neglected referral",
  former_customer_reconnect: "Former customer",
  conversation_action_pack: "Conversation action pack",
  commitment_due: "Promise due",
  manual: "Added by you",
};

export const ACTION_TYPE_LABELS: Record<string, string> = {
  warm_follow_up: "Warm follow-up",
  proposal_nudge: "Proposal nudge",
  referral_reconnect: "Referral reconnect",
  customer_risk: "Customer risk",
  meeting_follow_up: "Meeting follow-up",
  meeting_recap: "Meeting recap",
  crm_update: "CRM update",
  follow_up_task: "Follow-up task",
  calendar_hold: "Calendar hold",
  commitment_rescue: "Promise follow-up",
};

export const RELATIONSHIP_KIND_LABELS: Record<string, string> = {
  person: "Person",
  company: "Company",
  customer: "Customer",
  opportunity: "Opportunity",
  referral: "Referral",
  partner: "Partner",
};

export const OUTCOME_LABELS: Record<string, string> = {
  sent: "Sent",
  delivered: "Delivered",
  bounced: "Bounced",
  replied: "Replied",
  meeting_booked: "Meeting booked",
  won: "Won",
  lost: "Lost",
  dismissed: "Dismissed",
  bad_recommendation: "Bad recommendation",
  deal_advanced: "Deal moved forward",
  onboarding_progressed: "Onboarding moved forward",
  renewed: "Renewed",
  escalated: "Escalated",
  churned: "Churned",
  corrected: "Corrected",
};

// Outcomes an operator can log by hand from the audit view.
export const MANUAL_OUTCOMES: { value: RecordOutcomeInput["kind"]; label: string }[] = [
  { value: "replied", label: "They replied" },
  { value: "meeting_booked", label: "Meeting booked" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "bad_recommendation", label: "Bad recommendation" },
];

export const QUEUE_FILTERS: { value: string; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "snoozed", label: "Snoozed" },
  { value: "handled", label: "Handled" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

export const PRIORITY_COMPONENT_LABELS: Record<string, string> = {
  relationship_value: "Company value",
  commitment_urgency: "Promise urgency",
  recency_signal: "Recency",
  opportunity_signal: "Opportunity",
  evidence_quality: "Evidence quality",
  uncertainty_penalty: "Uncertainty",
  contact_risk_penalty: "Contact risk",
  outcome_learning: "Earlier outcomes",
  commitment_due_state: "Due date",
  source_completeness: "Source coverage",
  preferred_channel: "Preferred channel",
};

const COMPLETENESS_EXPLANATIONS: Record<string, string> = {
  "No source connection has completed its first useful sync.":
    "Connect a source before these details can fill in.",
  "One or more material values have no accessible supporting evidence.":
    "Some details have no source you can open.",
  "Required source evidence is current.": "The details you can open are up to date.",
  "Identity review is required before acting on this relationship.":
    "Confirm who this company is before you act.",
  "A required source is rebuilding; partial state is visible.":
    "A source is still updating, so only some details are shown.",
  "A required source is stale or disconnected.": "A source needs reconnecting.",
  "Backfill is incomplete; only partial state is shown.":
    "Older history is still loading, so only some details are shown.",
  "A required source scope is missing.": "A source is missing permission for something we need.",
  "Accepted evidence is waiting for the durable relationship projector.":
    "Accepted details are still being saved.",
  "Relationship projection requires operator repair before this state is safe to act on.":
    "This company needs a repair before you act on it.",
};

/** Completeness text is stored for the model. The sheet says what the person can do. */
export function completenessExplanationCopy(explanation: string): string {
  const raw = explanation.trim();
  return COMPLETENESS_EXPLANATIONS[raw] ?? raw;
}

const CONFIRMED_FOLLOW_UP_REASON =
  /^You confirmed this follow-up from source evidence meeting\/.+\.$/;

/** A confirmed meeting stored the observation id in the reason. The queue names the meeting. */
export function actionReasonCopy(reason: string | null | undefined): string {
  const raw = reason?.trim() ?? "";
  if (!raw) return "";
  if (CONFIRMED_FOLLOW_UP_REASON.test(raw)) return "You confirmed this follow-up from the meeting.";
  return raw;
}

/**
 * A shared-plan link redacts the owner to an internal token. A person or an
 * email still has a name.
 */
export function sharedPlanOwnerLabel(owner?: string | null): string {
  const who = (owner ?? "").trim();
  if (!who || who === "plan-participant") return "";
  if (/^[0-9a-f-]{36}$/i.test(who)) return "";
  if (/^[a-z0-9_:-]+$/.test(who)) return "";
  return who;
}

/** The link names the version. The stored hash stays off the page. */
export function sharedPlanVersionLabel(version: number): string {
  const number = Number.isFinite(version) && version > 0 ? Math.floor(version) : 1;
  return `Version ${number}`;
}

/**
 * The page removes the token from the address as soon as it is read. A second
 * pass, including the development double render, still has the token.
 */
export function planResponseToken(hash: string, remembered: string): string {
  const next = hash.replace(/^#/, "").trim();
  return next || remembered.trim();
}

/** A ranking part is a stored slug. The review sheet names the factor. */
export function priorityComponentLabel(key: string): string {
  const known = PRIORITY_COMPONENT_LABELS[key];
  if (known) return known;
  const words = key.replaceAll(/[._]+/g, " ").trim();
  if (!words) return "Factor";
  return words.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** A dismissal reason is often a stored slug. The dismissed queue names it. */
export function dismissReasonLabel(reason: string | null | undefined): string {
  const raw = (reason ?? "").trim();
  if (!raw) return "";
  const known: Record<string, string> = {
    not_relevant: "Not relevant",
    already_handled: "Already handled",
    resolved_by_new_evidence: "Newer evidence arrived",
    changed_my_mind: "Changed my mind",
  };
  const named = known[raw];
  if (named) return named;
  if (/^[a-z0-9_]+$/.test(raw)) {
    return raw
      .split("_")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
  return raw;
}

/** A snoozed action stores a wake time. The queue says when it returns. */
export function snoozeWakeCopy(until: string | null | undefined): string {
  const when = relativeTime(until);
  if (!when) return "";
  if (when.endsWith("ago")) return `Snooze ended ${when}.`;
  return `Comes back ${when}.`;
}

/**
 * A save more than a minute after the first write is an edit. Autosave can
 * write twice in the same moment, and that is still the note being created.
 */
export function workspaceNoteActivityLabel(note: {
  createdAt?: string;
  occurredAt: string;
}): string {
  const activity = relativeTime(note.occurredAt);
  const created = Date.parse(note.createdAt?.trim() || note.occurredAt);
  const edited = Date.parse(note.occurredAt);
  if (Number.isFinite(created) && Number.isFinite(edited) && edited - created > 60_000) {
    return `Edited ${activity}`;
  }
  return activity;
}

export function relativeTime(iso?: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const abs = Math.abs(diff);
  const day = 86_400_000;
  const past = diff >= 0;
  const fmt = (n: number, unit: string) =>
    `${n} ${unit}${n === 1 ? "" : "s"} ${past ? "ago" : "from now"}`;
  if (abs < 3600_000) return fmt(Math.max(1, Math.round(abs / 60_000)), "min");
  if (abs < day) return fmt(Math.round(abs / 3600_000), "hour");
  if (abs < 30 * day) return fmt(Math.round(abs / day), "day");
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// --- the commitment register -------------------------------------------------
//
// One route, five views. Before this existed the register was assembled in the
// browser from relationship-graph nodes, which could not page, could not filter
// server-side, and could not answer "by owner" or "what changed" at all.

export async function listCommitments(
  filter: CommitmentRegisterFilter = {},
  signal?: AbortSignal,
): Promise<RegisterEntry[]> {
  return commitmentRows(await viaRequest(() => fetchCommitments(filter, signal)));
}

export async function getCommitmentRecord(
  commitmentId: string,
  signal?: AbortSignal,
): Promise<CommitmentRecord> {
  const record = parsed(
    ExportCommitment200Response,
    await call<unknown>(`/commitments/${encodeURIComponent(commitmentId)}/export`, { signal }),
    "commitment record",
  );
  return { ...record, dueAt: record.dueAt ?? undefined } as CommitmentRecord;
}

/** The Markdown document a user forwards. Returned as text, not JSON. */
export async function getCommitmentRecordMarkdown(commitmentId: string): Promise<string> {
  const res = await dashboardRequest(
    toDashboardAPIPath(`/commitments/${encodeURIComponent(commitmentId)}/export?format=md`),
  );
  redirectBrowserIfUnauthorized(res.status);
  if (!res.ok) {
    throw new RevenueAPIError(`Export failed (${res.status})`, res.status);
  }
  return res.text();
}

export const getOpenPromisesReport = fetchOpenPromisesReport;

export async function getOpenPromisesReportMarkdown(scanId: string): Promise<string> {
  const res = await dashboardRequest(
    toDashboardAPIPath(`/revenue-leak-scans/${encodeURIComponent(scanId)}/report?format=md`),
  );
  redirectBrowserIfUnauthorized(res.status);
  if (!res.ok) throw new RevenueAPIError(`Report export failed (${res.status})`, res.status);
  return res.text();
}
