"use client";

import "client-only";

import * as React from "react";
import { useQueryStates } from "nuqs";
import {
  buildImportedTranscriptObservation,
  MISSION_CONTROL_QUESTIONS,
  RELATIONSHIP_DIMENSION_LABELS,
  completenessTone,
  relationshipLabel,
} from "@oppulence/relationship-contract";
import {
  ArrowClockwise,
  Buildings,
  Check,
  ClockCounterClockwise,
  DownloadSimple,
  EnvelopeSimple,
  Graph,
  ListBullets,
  MagnifyingGlass,
  Plus,
  Sparkle,
  Warning,
  X,
} from "@/lib/icons";

import {
  EmptyBlock,
  errMessage,
  ListRefreshFailure,
  ListSkeleton,
  listNeverLoaded,
  listRefreshFailureCopy,
  ModeChip,
  priorityTone,
  refetchClearingBanner,
} from "@/components/features/revenue/shared/shared";
import {
  AttentionQueueSurface,
  attentionCompanyCount,
} from "@/components/features/revenue/attention-queue-surface/attention-queue-surface";
import { useAskOppulence } from "@/components/features/dashboard/dashboard-shell/dashboard-shell";
import { revenueParsers, revenueUrlKeys } from "@/app/(product)/app/revenue/search-params";
import { subscribeCompanyCreate } from "@/lib/dashboard/company-create-request";
import {
  AccountMissionControlSurface,
  accountAttentionFromHealth,
  atRiskPromiseCount,
  commitmentPreviewRemainder,
  mapCommitmentsToAccountTimeline,
  openCommitmentCount,
  overduePromiseCount,
  promiseFollowUpEmptyCopy,
  promiseFollowUpTitle,
} from "@/components/features/revenue/account-mission-control-surface/account-mission-control-surface";
import {
  clearCompanyGraphURL,
  RelationshipGraphWorkspace,
} from "@/components/features/revenue/relationship-graph/relationship-graph";
import { REVENUE_EVIDENCE_LOOKBACK_LABEL } from "@/lib/revenue/revenue";
import { Avatar, AvatarFallback } from "@oppulence/ui/components/avatar";
import { Badge } from "@oppulence/ui/components/badge";
import { Button } from "@oppulence/ui/components/button";
import { Label } from "@oppulence/ui/components/label";
import { Spinner } from "@oppulence/ui/components/spinner";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@oppulence/ui/components/table";
import { Checkbox } from "@oppulence/ui/components/checkbox";
import { DateTimePicker } from "@oppulence/ui/components/date-time-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@oppulence/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@oppulence/ui/components/dropdown-menu";
import { Input } from "@oppulence/ui/components/input";
import { Textarea } from "@oppulence/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@oppulence/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@oppulence/ui/components/sheet";
import { ToggleGroup, ToggleGroupItem } from "@oppulence/ui/components/toggle-group";
import {
  ACTION_TYPE_LABELS,
  actionReasonCopy,
  completenessExplanationCopy,
  missionControlGapCopy,
  acknowledgeMissionControl,
  decideIdentityCandidate,
  type DecideRelationshipIdentityCandidateInput,
  type TimelinePageCursor,
  approveRecommendation,
  correctConversationReview,
  decideConversationReview,
  correctRelationship,
  createRelationship,
  deletePerson,
  attentionReasonLabel,
  getRelationship,
  getRelationshipBetaDiagnostics,
  getRelationshipChanges,
  getRelationshipConversationReview,
  INTELLIGENCE_OBSERVATION_PAGE,
  getRelationshipEvidence,
  getRelationshipCommunicationTimeline,
  getRelationshipTimelinePage,
  ingestRelationshipObservations,
  listIdentityCandidates,
  disconnectRelationshipSource,
  enrichPendingCompanies,
  enrichPendingPersons,
  getPersonAttributes,
  resyncRelationshipSource,
  getResearchEstimate,
  getCompanyResearchEstimate,
  getResearchStatus,
  rejectRecommendation,
  resolveRelationshipContradiction,
  runCommitmentRecovery,
  safeResearchCitationURL,
  appendCommitmentTransition,
  createMutualActionPlan,
  approveMutualActionPlan,
  shareMutualActionPlan,
  requestConversationDeletion,
  retractRelationshipAssertion,
  setResearchConsent,
  companyLinkedInAction,
  webAddressHref,
  interactionCountLabel,
  RevenueAPIError,
  explainedRevenueError,
  relativeTime,
} from "@/lib/revenue/revenue";
import type {
  ConversationReviewItem,
  MissionControlReadModel,
  RelationshipIdentityCandidate,
  RelationshipAttentionItem,
  RelationshipDetail,
  CommunicationTimelineItem,
  RelationshipObservation,
  RelationshipPersonAttribute,
  RelationshipSourceStatus,
  RelationshipSourceInventoryItem,
  RelationshipStateSnapshot,
  RevenueRelationship,
  ResearchEstimate,
  ResearchStatus,
} from "@/lib/revenue/types";
import { DashboardRequestError } from "@/lib/api/request-json";
import { useRevenueActions } from "@/hooks/queries/use-revenue-actions";
import { actionRows } from "@/hooks/queries/utils/fetch-revenue-actions";
import {
  useIdentityCandidates,
  useRelationshipAttention,
  useRelationships,
} from "@/hooks/queries/use-relationships";
import {
  useRelationshipSourceInventory,
  useRelationshipSourceStatuses,
} from "@/hooks/queries/use-relationship-sources";
import {
  attentionPageHasMore,
  attentionRows,
  fetchIdentityCandidates,
  fetchRelationshipAttention,
  fetchRelationships,
  identityCandidatePageHasMore,
  identityCandidateRows,
  relationshipPageHasMore,
  relationshipRows,
} from "@/hooks/queries/utils/fetch-relationships";
import { relationshipKeys } from "@/hooks/queries/utils/relationship-keys";
import { relationshipSourceKeys } from "@/hooks/queries/utils/relationship-source-keys";
import { useQueryClient } from "@tanstack/react-query";
import { comboboxFilterName } from "@/lib/a11y/combobox-filter-name";
import { planLabel } from "@/lib/product/plan-label";
import {
  attentionWithCompanyTitles,
  attentionWithoutTasks,
  companyName,
  personCompanyTitle,
  workspaceTaskIds,
} from "@/lib/revenue/revenue-records";

export { companyName };
import {
  personEvidenceLabel,
  personFactValue,
  personSeniorityLabel,
} from "@/components/features/revenue/workspace-records/workspace-records-view";
import {
  activityEvidenceLines,
  activityLinesBesideSummary,
  activityHeading,
  activityOutcomeSummary,
  activitySourceLabel,
  enumLabel as humanize,
  participantRoleLabel,
  sourceConnectionLabel,
  mailAccessReason,
  missingScopeLabels,
  relationshipDeltaValue,
  removePersonConfirmCopy,
  sourceProductCopy,
} from "@/lib/revenue/source-product-copy";
import { cn } from "@/lib/utils";

const LIFECYCLE_OPTIONS = [
  "prospect",
  "evaluation",
  "contracting",
  "onboarding",
  "active_customer",
  "renewal",
  "churned",
  "former_customer",
];
const HEALTH_OPTIONS = ["unknown", "healthy", "needs_attention", "critical"];
const ENGAGEMENT_OPTIONS = ["unknown", "increasing", "steady", "declining", "dormant"];

const HEALTH_TONE: Record<string, string> = {
  healthy: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  needs_attention: "border-amber-500/30 text-amber-600 dark:text-amber-400",
  critical: "border-red-500/30 text-red-600 dark:text-red-400",
  unknown: "text-primary/45",
};

type OptionalCompanyColumn =
  | "people"
  | "health"
  | "nextAction"
  | "headquarters"
  | "employees"
  | "funding"
  | "revenue"
  | "signals";

const OPTIONAL_COMPANY_COLUMNS: Array<{ id: OptionalCompanyColumn; label: string }> = [
  { id: "people", label: "People" },
  { id: "health", label: "Health" },
  { id: "nextAction", label: "Next action" },
  { id: "headquarters", label: "Headquarters" },
  { id: "employees", label: "Employees" },
  { id: "funding", label: "Funding" },
  { id: "revenue", label: "Revenue" },
  { id: "signals", label: "Growth signals" },
];

const COMPANY_FIELD_LABELS: Record<string, string> = {
  industry_category: "Industry",
  subindustry: "Subindustry",
  company_description: "Description",
  headquarters: "Headquarters",
  founded_year: "Founded",
  employee_range: "Employees",
  ownership: "Ownership",
  stock_ticker: "Ticker",
  funding_summary: "Funding",
  revenue_range: "Revenue",
  business_model: "Business model",
  products: "Products",
  customer_segments: "Customer segments",
  technologies: "Technologies",
  key_executives: "Key executives",
  recent_news: "Recent news",
  growth_signals: "Growth signals",
  website_url: "Website",
  social_urls: "Social profiles",
};

/**
 * The company list opens the website. A domain is stored without a scheme, and
 * a pasted address may already include one. Prefixing https:// again sends the
 * browser to a host named "https".
 */
export function companyDomainHref(domain: string | null | undefined): string | null {
  return webAddressHref(domain);
}

/** The domain column and the sheet share one label. Spaces are not a domain. */
export function companyDomainLabel(domain: string | null | undefined): string {
  return domain?.trim() || "Not filled in";
}

/**
 * Policy on a recommendation uses the words Recovery and the graph already
 * use. A passed check is cleared, and a check that has not run is not pending
 * approval.
 */
export function recommendationPolicyLabel(status: string): string {
  switch (status) {
    case "passed":
      return "Cleared";
    case "review_required":
      return "Review required";
    case "blocked":
      return "Blocked";
    case "stale":
      return "Re-check needed";
    case "pending":
      return "Not checked";
    default:
      return humanize(status);
  }
}

/** Approval on a recommendation uses the words the graph inspector already uses. */
export function recommendationApprovalLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Awaiting approval";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    default:
      return humanize(status);
  }
}

export { participantRoleLabel };

const formatResearchCost = (usd: number) =>
  usd < 0.01 ? "less than a cent" : `$${usd.toFixed(2)}`;

/**
 * Filling in profiles sends names and domains out of the workspace. The
 * browser confirm used to be the only place that said so, and Cancel lived
 * in a dialog the rest of this panel does not use.
 */
export function enrichConfirmCopy(companies: number, people: number, usd: number): string {
  const companyWord = companies === 1 ? "company" : "companies";
  const personWord = people === 1 ? "person" : "people";
  return `Fill in ${companies} ${companyWord} and ${people} ${personWord} for about ${formatResearchCost(usd)}? Only names, company domains, and known employers are sent.`;
}

function RelationshipEnrichment({
  onError,
  onNotice,
  onChanged,
}: {
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  onChanged: () => void;
}) {
  const [status, setStatus] = React.useState<ResearchStatus | null>(null);
  const [statusPhase, setStatusPhase] = React.useState<"loading" | "ready" | "failed">("loading");
  const [personEstimate, setPersonEstimate] = React.useState<ResearchEstimate | null>(null);
  const [companyEstimate, setCompanyEstimate] = React.useState<ResearchEstimate | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setStatusPhase("loading");
    try {
      const nextStatus = await getResearchStatus();
      setStatus(nextStatus);
      setStatusPhase("ready");
      if (nextStatus.allowed && nextStatus.consent.consented) {
        const [people, companies] = await Promise.all([
          getResearchEstimate(),
          getCompanyResearchEstimate(),
        ]);
        setPersonEstimate(people);
        setCompanyEstimate(companies);
      } else {
        setPersonEstimate(null);
        setCompanyEstimate(null);
      }
    } catch (error) {
      setStatus(null);
      setStatusPhase("failed");
      onError(errMessage(error, "Could not load public research."));
    }
  }, [onError]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const changeConsent = async (consented: boolean) => {
    setBusy(true);
    try {
      await setResearchConsent(consented);
      setResult(null);
      onNotice(
        consented ? "Public research is on." : "Public research is off.",
      );
      await load();
    } catch (error) {
      onError(errMessage(error, "Could not update public research."));
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!personEstimate || !companyEstimate) return;
    const people = personEstimate.people ?? 0;
    const companies = companyEstimate.companies ?? 0;
    if (people + companies === 0) return;
    setConfirming(false);
    setBusy(true);
    setResult(null);
    try {
      const companyEnrichment = await enrichPendingCompanies(companyEstimate.batchSize);
      const personEnrichment = await enrichPendingPersons(personEstimate.batchSize);
      const companyMatches = companyEnrichment.outcomes.filter((outcome) => outcome.matched).length;
      const personMatches = personEnrichment.outcomes.filter((outcome) => outcome.matched).length;
      const written = [...companyEnrichment.outcomes, ...personEnrichment.outcomes].reduce(
        (total, outcome) => total + outcome.written,
        0,
      );
      setResult(
        `${companyMatches} of ${companyEnrichment.requested} companies and ${personMatches} of ${personEnrichment.requested} people matched · ${written} details added`,
      );
      onChanged();
      await load();
    } catch (error) {
      onError(errMessage(error, "Could not fill in companies and people."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="border border-border bg-background p-4"
      data-capability="cited-profile-enrichment"
    >
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-oppulence-orange">
            Public research
          </p>
          <h3 className="mt-1 text-sm font-semibold text-primary">{researchPanelTitle()}</h3>
          <p className="mt-1 max-w-3xl text-xs text-primary/55">
            Public research can fill in a company and the people who work there, and each detail
            keeps its source link. Message content, notes, and full email addresses stay in
            Oppulence.
          </p>
        </div>
        {status?.consent.consented ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void changeConsent(false)}
          >
            Turn off
          </Button>
        ) : status?.available && status.reason === "consent_required" ? (
          <Button type="button" size="sm" disabled={busy} onClick={() => void changeConsent(true)}>
            {busy ? <Spinner className="size-4" /> : <Sparkle />}
            Allow public research
          </Button>
        ) : null}
      </div>

      {!status ? (
        <div className="mt-3">
          <p className="text-xs text-primary/45">
            {researchStatusPendingCopy(statusPhase === "failed")}
          </p>
          {statusPhase === "failed" ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => void load()}
            >
              Try again
            </Button>
          ) : null}
        </div>
      ) : status.allowed && status.consent.consented ? (
        <div className="mt-3 flex flex-col justify-between gap-3 border-t border-border pt-3 sm:flex-row sm:items-center">
          <div className="text-xs text-primary/65">
            {(personEstimate?.people ?? 0) + (companyEstimate?.companies ?? 0) === 0 ? (
              <p>
                Profiles are current. New contacts and company changes are checked daily.
              </p>
            ) : personEstimate && companyEstimate ? (
              <p>
                {companyEstimate.companies ?? 0} companies · {personEstimate.people ?? 0} people ·
                about {formatResearchCost(companyEstimate.usd + personEstimate.usd)} · company
                events checked daily
              </p>
            ) : (
              <p>Calculating the estimate…</p>
            )}
            {result ? <p className="mt-1 text-primary">{result}</p> : null}
          </div>
          {personEstimate &&
          companyEstimate &&
          (personEstimate.people ?? 0) + (companyEstimate.companies ?? 0) > 0 ? (
            confirming ? (
              <div className="flex max-w-sm flex-col items-end gap-2">
                <p className="text-right text-xs text-primary/70">
                  {enrichConfirmCopy(
                    companyEstimate.companies ?? 0,
                    personEstimate.people ?? 0,
                    companyEstimate.usd + personEstimate.usd,
                  )}
                </p>
                <div className="flex gap-2">
                  <Button disabled={busy} onClick={() => void run()} size="sm" type="button">
                    {busy ? <Spinner className="size-4" /> : null} Continue
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => setConfirming(false)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                disabled={busy}
                onClick={() => setConfirming(true)}
                size="sm"
                type="button"
              >
                {busy ? <Spinner className="size-4" /> : <Sparkle />}
                Fill in companies and people
              </Button>
            )
          ) : null}
        </div>
      ) : (
        <p className="mt-3 border-t border-border pt-3 text-xs text-primary/55">
          {enrichmentAvailabilityCopy(status)}
        </p>
      )}
    </section>
  );
}


/**
 * Public research fills in a company from names and domains. It does not
 * read a mailbox, so the heading must not name an inbox.
 */
export function researchPanelTitle(): string {
  return "Know who works at a company";
}

/**

 * A missing status is either still loading or a failed check. The panel must
 * not keep saying it is checking after the request has failed.
 */
export function researchStatusPendingCopy(failed: boolean): string {
  if (failed) return "Public research could not be checked.";
  return "Checking whether public research is available…";
}

/**
 * Research status mixes a vendor setup step with the stored plan slug. The
 * panel says whether this workspace includes public research.
 */
export function enrichmentAvailabilityCopy(status: {
  available: boolean;
  reason?: string;
  requiredPlan?: string;
}): string {
  const plan = planLabel(status.requiredPlan);
  if (!status.available) {
    return plan && status.reason === "plan_required"
      ? `Public research is part of the ${plan} plan. This workspace does not include it.`
      : "Public research is not available in this workspace.";
  }
  if (status.reason === "plan_required") {
    return plan
      ? `Available on the ${plan} plan.`
      : "This workspace plan does not include public research.";
  }
  if (status.reason === "capability_disabled") return "Cloud research is disabled for this workspace.";
  return "Public research stays off until you allow it.";
}

/**
 * The header claims "All companies" even after search or a health filter,
 * and the control was a button with no action. A filtered list should say so,
 * and that button is what clears the filters.
 */
export function companyDirectoryTitle(input: {
  query: string;
  health: string;
  lifecycle: string;
}): { label: string; filtered: boolean } {
  const filtered =
    input.query.trim().length > 0 || input.health !== "all" || input.lifecycle !== "all";
  return { label: filtered ? "Filtered" : "All companies", filtered };
}

/** One directory request. The API refuses a larger page, so the rest is another offset. */
export const COMPANY_DIRECTORY_PAGE = 200;

export function companyDirectoryCount(shown: number, hasMore: boolean): string {
  return hasMore ? `${shown}+` : String(shown);
}

/**
 * An unfiltered directory is only the first page, so a company further down
 * still belongs in the queue. A finished filter is the whole match, so a
 * company the directory hid does not stay in the queue above it. A filter
 * that still has another page can match a company that is not loaded yet.
 */
export function attentionForCompanyDirectory<T extends { relationshipId: string }>(
  items: readonly T[],
  companies: readonly { id: string }[],
  input: { filtered: boolean; hasMore: boolean },
): T[] {
  if (!input.filtered || input.hasMore) return [...items];
  const ids = new Set(companies.map((company) => company.id));
  return items.filter((item) => ids.has(item.relationshipId));
}

export function companyDirectoryRemainderLabel(): string {
  return "Show the next companies";
}

/**
 * The categories cell used to print only the first tag. A company filed under
 * two categories looked like it had one.
 */
export function companyCategoriesLabel(
  categories: readonly string[] | null | undefined,
): string {
  const names = (categories ?? []).map((item) => item.trim()).filter(Boolean);
  if (names.length === 0) return "Not filled in";
  return names.join(", ");
}

/**
 * The people row counts title, company, seniority, and location. A blank
 * string is not one of those facts, and a blank title must not hide a role
 * that was saved on the company membership.
 */
/**
 * The people directory is the name after a correction. The company membership
 * still stores the header the mail arrived with, which is a different string.
 */
export function personParticipantLabel(participant: {
  displayName?: string | null;
  email?: string | null;
  person?: { displayName?: string | null; primaryEmail?: string | null } | null;
}): string {
  const canonical = participant.person?.displayName?.trim();
  if (canonical) return canonical;
  const header = participant.displayName?.trim();
  if (header) return header;
  const email = participant.email?.trim() || participant.person?.primaryEmail?.trim();
  if (email) return email;
  return "Unknown person";
}

export function personSheetProfile(input: {
  title?: string | null;
  fallbackTitle?: string | null;
  company?: string | null;
  seniority?: string | null;
  location?: string | null;
}): string[] {
  const title = input.title?.trim() || input.fallbackTitle?.trim() || "";
  return [title, input.company, input.seniority, input.location]
    .map((field) => field?.trim() ?? "")
    .filter(Boolean);
}

/**
 * A filtered directory can be empty because nothing matched. That is not the
 * same as a workspace that has never had a company.
 */
/**
 * Position is within the list on screen. After a search or health filter
 * that list is not every company, so the sheet must not say it is.
 */
export function companySheetPositionLabel(
  position: number,
  total: number,
  filtered: boolean,
  hasMore = false,
): string {
  const count = hasMore ? `${total}+` : String(total);
  return `${position} of ${count} in ${filtered ? "this filter" : "All companies"}`;
}

export function companyListEmptyCopy(input: {
  filtered: boolean;
  hasConnectedSource: boolean;
  lookbackLabel: string;
}): string {
  if (input.filtered) return "No companies match these filters.";
  if (input.hasConnectedSource) {
    return `Gmail is connected. Run the ${input.lookbackLabel} audit from Promises to discover companies and the people behind each conversation.`;
  }
  return "Connect Gmail to discover companies from real conversations, or add one by hand.";
}

/**
 * A missed sync is still a connected mailbox. Stale, rebuilding, and degraded
 * used to look disconnected, so an empty company list told someone who had
 * already authorized Gmail to connect it again.
 */
const COMPANY_DIRECTORY_CONNECTED_SOURCE_STATES = new Set([
  "connected",
  "backfilling",
  "live",
  "stale",
  "rebuilding",
  "degraded",
]);

export function companySourceCountsAsConnected(status: string): boolean {
  return COMPANY_DIRECTORY_CONNECTED_SOURCE_STATES.has(status);
}

/**
 * The company list reads both the filtered status rows and the source cards.
 * A stale Gmail account can be dropped from the status list when it has no
 * scopes, while the card still shows it. The empty list has to follow the card.
 */
export function companyDirectoryHasConnectedSource(
  statuses: readonly { status: string }[],
  inventory: readonly { accounts: readonly { status: string }[] }[],
): boolean {
  if (statuses.some((source) => companySourceCountsAsConnected(source.status))) return true;
  return inventory.some((item) =>
    item.accounts.some((account) => companySourceCountsAsConnected(account.status)),
  );
}

/** A failed directory request is not an empty workspace. */
export function companyListFailureCopy(): string {
  return "Companies could not load. Try again.";
}

/**
 * Company health, stage, and engagement use the graph's words. A stored
 * needs_attention is "Needs attention" there. Title-casing every word made
 * the company list say "Needs Attention".
 */
export function companyRecordLabel(value: string): string {
  switch (value) {
    case "unknown":
      return "Not known";
    case "needs_attention":
      return "Needs attention";
    case "active_customer":
      return "Active customer";
    case "former_customer":
      return "Former customer";
    default:
      return humanize(value);
  }
}

/** Health and lifecycle are comboboxes. The visible word is the choice, not the name. */
export function companyHealthFilterName(value: string): string {
  return comboboxFilterName("Health", value === "all" ? "Any health" : companyRecordLabel(value));
}

/** The list filters the same lifecycle the company sheet names. */
export function companyLifecycleFilterName(value: string): string {
  return comboboxFilterName(
    "Lifecycle",
    value === "all" ? "Any lifecycle" : companyRecordLabel(value),
  );
}

export function RelationshipsView({
  onError,
  onNotice,
  onOpenConnectors,
}: {
  onError: (m: string) => void;
  onNotice: (m: string) => void;
  onOpenConnectors?: () => void;
}) {
  const queryClient = useQueryClient();
  // The address owns the open company. A palette result and a list click write
  // the same param, and closing the sheet returns to the list.
  const [revenueParams, setRevenueParams] = useQueryStates(revenueParsers, revenueUrlKeys);
  const detail = revenueParams.company;
  const openDetail = (id: string) => {
    void setRevenueParams({ company: id });
  };
  const closeDetail = () => {
    void setRevenueParams({ company: null });
  };
  const [creating, setCreating] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");
  const [health, setHealth] = React.useState("all");
  const [lifecycle, setLifecycle] = React.useState("all");
  const [surface, setSurface] = React.useState<"list" | "graph">("list");
  // Research columns stay empty until public research runs. Health, people,
  // and the next action are known for every company, so they open first.
  const [optionalColumns, setOptionalColumns] = React.useState<OptionalCompanyColumn[]>([
    "health",
    "people",
    "nextAction",
  ]);
  const filters = {
    q: debouncedQuery || undefined,
    health: health === "all" ? undefined : health,
    lifecycle: lifecycle === "all" ? undefined : lifecycle,
  };
  const relationshipsQuery = useRelationships(filters);
  const [extraCompanies, setExtraCompanies] = React.useState<RevenueRelationship[]>([]);
  const [loadingMoreCompanies, setLoadingMoreCompanies] = React.useState(false);
  const directoryScope = `${debouncedQuery}|${health}|${lifecycle}`;
  const directoryScopeRef = React.useRef(directoryScope);
  directoryScopeRef.current = directoryScope;
  React.useEffect(() => {
    setExtraCompanies([]);
    setLaterDirectoryHasMore(null);
  }, [directoryScope]);
  const sourcesQuery = useRelationshipSourceStatuses();
  const inventoryQuery = useRelationshipSourceInventory();
  const pendingQuery = useIdentityCandidates("pending");
  const deferredQuery = useIdentityCandidates("deferred");
  const [extraPending, setExtraPending] = React.useState<RelationshipIdentityCandidate[]>([]);
  const [extraDeferred, setExtraDeferred] = React.useState<RelationshipIdentityCandidate[]>([]);
  const [laterPendingHasMore, setLaterPendingHasMore] = React.useState<boolean | null>(null);
  const [laterDeferredHasMore, setLaterDeferredHasMore] = React.useState<boolean | null>(null);
  const [loadingMoreDuplicates, setLoadingMoreDuplicates] = React.useState(false);
  const attentionQuery = useRelationshipAttention("open");
  const [extraAttention, setExtraAttention] = React.useState<RelationshipAttentionItem[]>([]);
  const [laterAttentionHasMore, setLaterAttentionHasMore] = React.useState<boolean | null>(null);
  const [loadingMoreAttention, setLoadingMoreAttention] = React.useState(false);
  const openActionsQuery = useRevenueActions("open", 100, "task");
  const directoryPage = relationshipRows(relationshipsQuery.data);
  const [laterDirectoryHasMore, setLaterDirectoryHasMore] = React.useState<boolean | null>(null);
  const directoryRows = React.useMemo(() => {
    if (extraCompanies.length === 0) return directoryPage;
    const seen = new Set(directoryPage.map((row) => row.id));
    return [
      ...directoryPage,
      ...extraCompanies.filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      }),
    ];
  }, [directoryPage, extraCompanies]);
  const hasMoreCompanies =
    laterDirectoryHasMore ??
    (directoryPage.length > 0 && relationshipPageHasMore(relationshipsQuery.data));
  const rows = directoryRows;
  const sources = sourcesQuery.data ?? [];
  const sourceInventory = inventoryQuery.data ?? [];
  const pendingPage = identityCandidateRows(pendingQuery.data);
  const deferredPage = identityCandidateRows(deferredQuery.data);
  const pendingCandidates = React.useMemo(() => {
    if (extraPending.length === 0) return pendingPage;
    const seen = new Set(pendingPage.map((candidate) => candidate.id));
    return [
      ...pendingPage,
      ...extraPending.filter((candidate) => {
        if (seen.has(candidate.id)) return false;
        seen.add(candidate.id);
        return true;
      }),
    ];
  }, [extraPending, pendingPage]);
  const deferredCandidates = React.useMemo(() => {
    if (extraDeferred.length === 0) return deferredPage;
    const seen = new Set(deferredPage.map((candidate) => candidate.id));
    return [
      ...deferredPage,
      ...extraDeferred.filter((candidate) => {
        if (seen.has(candidate.id)) return false;
        seen.add(candidate.id);
        return true;
      }),
    ];
  }, [deferredPage, extraDeferred]);
  const hasMorePending =
    laterPendingHasMore ??
    (pendingPage.length > 0 && identityCandidatePageHasMore(pendingQuery.data));
  const hasMoreDeferred =
    laterDeferredHasMore ??
    (deferredPage.length > 0 && identityCandidatePageHasMore(deferredQuery.data));
  const hasMoreDuplicates = hasMorePending || hasMoreDeferred;
  const identityCandidates = [...pendingCandidates, ...deferredCandidates];
  const attentionPage = attentionRows(attentionQuery.data);
  const attention = React.useMemo(() => {
    if (extraAttention.length === 0) return attentionPage;
    const seen = new Set(attentionPage.map((item) => item.id));
    return [
      ...attentionPage,
      ...extraAttention.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      }),
    ];
  }, [attentionPage, extraAttention]);
  const hasMoreAttention =
    laterAttentionHasMore ??
    (attentionPage.length > 0 && attentionPageHasMore(attentionQuery.data));
  const loading =
    relationshipsQuery.isPending ||
    sourcesQuery.isPending ||
    inventoryQuery.isPending ||
    pendingQuery.isPending ||
    deferredQuery.isPending ||
    attentionQuery.isPending;
  const hasConnectedSource = companyDirectoryHasConnectedSource(sources, sourceInventory);
  const companies = rows.filter((relationship) => relationship.kind !== "person");
  const directoryTitle = companyDirectoryTitle({ query, health, lifecycle });
  const directoryFilterSettled =
    debouncedQuery.trim().length > 0 || health !== "all" || lifecycle !== "all";
  const clearCompanyFilters = () => {
    setQuery("");
    setDebouncedQuery("");
    setHealth("all");
    setLifecycle("all");
  };
  const personIds = new Set(
    rows.filter((relationship) => relationship.kind === "person").map((relationship) => relationship.id),
  );
  const companyAttention = attentionWithCompanyTitles(
    attentionForCompanyDirectory(
      attentionWithoutTasks(
        attention.filter((item) => !personIds.has(item.relationshipId)),
        openActionsQuery.isSuccess
          ? workspaceTaskIds(actionRows(openActionsQuery.data))
          : new Set(),
      ),
      companies,
      { filtered: directoryFilterSettled, hasMore: hasMoreCompanies },
    ),
    companies,
  );
  const attentionCompanies = attentionCompanyCount(companyAttention);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadMoreCompanies = React.useCallback(async () => {
    if (loadingMoreCompanies) return;
    const requestedScope = directoryScope;
    setLoadingMoreCompanies(true);
    try {
      const next = await fetchRelationships({
        ...filters,
        offset: directoryPage.length + extraCompanies.length,
      });
      if (directoryScopeRef.current !== requestedScope) return;
      setLaterDirectoryHasMore(relationshipPageHasMore(next));
      setExtraCompanies((current) => [...current, ...relationshipRows(next)]);
    } catch (reason) {
      onError(explainedRevenueError(reason, "Could not load the next companies."));
    } finally {
      setLoadingMoreCompanies(false);
    }
  }, [
    directoryPage.length,
    directoryScope,
    extraCompanies.length,
    filters,
    loadingMoreCompanies,
    onError,
  ]);

  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("graph") !== "1") return;
    const timer = window.setTimeout(() => setSurface("graph"), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Recovery and tasks request a company before this surface mounts.
  // The flag is read here so New company opens on the first paint of Companies.
  React.useEffect(() => subscribeCompanyCreate(() => setCreating(true)), []);

  const load = React.useCallback(async () => {
    setExtraAttention([]);
    setLaterAttentionHasMore(null);
    setExtraPending([]);
    setExtraDeferred([]);
    setLaterPendingHasMore(null);
    setLaterDeferredHasMore(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: relationshipKeys.all }),
      queryClient.invalidateQueries({ queryKey: relationshipSourceKeys.all }),
    ]);
  }, [queryClient]);
  const loadMoreAttention = React.useCallback(async () => {
    if (loadingMoreAttention || !hasMoreAttention) return;
    setLoadingMoreAttention(true);
    try {
      const next = await fetchRelationshipAttention(
        "open",
        undefined,
        attentionPage.length + extraAttention.length,
      );
      setLaterAttentionHasMore(attentionPageHasMore(next));
      setExtraAttention((current) => [...current, ...attentionRows(next)]);
    } catch (reason) {
      onError(explainedRevenueError(reason, "Could not load the next companies in the queue."));
    } finally {
      setLoadingMoreAttention(false);
    }
  }, [attentionPage.length, extraAttention.length, hasMoreAttention, loadingMoreAttention, onError]);
  const loadMoreDuplicates = React.useCallback(async () => {
    if (loadingMoreDuplicates || !hasMoreDuplicates) return;
    setLoadingMoreDuplicates(true);
    try {
      if (hasMorePending) {
        const next = await fetchIdentityCandidates(
          "pending",
          undefined,
          undefined,
          pendingPage.length + extraPending.length,
        );
        setLaterPendingHasMore(identityCandidatePageHasMore(next));
        setExtraPending((current) => [...current, ...identityCandidateRows(next)]);
      }
      if (hasMoreDeferred) {
        const next = await fetchIdentityCandidates(
          "deferred",
          undefined,
          undefined,
          deferredPage.length + extraDeferred.length,
        );
        setLaterDeferredHasMore(identityCandidatePageHasMore(next));
        setExtraDeferred((current) => [...current, ...identityCandidateRows(next)]);
      }
    } catch (reason) {
      onError(explainedRevenueError(reason, "Could not load the next duplicates."));
    } finally {
      setLoadingMoreDuplicates(false);
    }
  }, [
    deferredPage.length,
    extraDeferred.length,
    extraPending.length,
    hasMoreDeferred,
    hasMoreDuplicates,
    hasMorePending,
    loadingMoreDuplicates,
    onError,
    pendingPage.length,
  ]);

  React.useEffect(() => {
    const listed =
      relationshipsQuery.error != null && relationshipsQuery.data != null
        ? null
        : relationshipsQuery.error;
    const error =
      listed ??
      sourcesQuery.error ??
      inventoryQuery.error ??
      pendingQuery.error ??
      deferredQuery.error ??
      attentionQuery.error;
    if (!error) return;
    if (
      (error instanceof RevenueAPIError || error instanceof DashboardRequestError) &&
      error.status === 404
    ) {
      return;
    }
    onError(errMessage(error, "Could not load companies."));
  }, [
    attentionQuery.error,
    deferredQuery.error,
    inventoryQuery.error,
    onError,
    pendingQuery.error,
    relationshipsQuery.data,
    relationshipsQuery.error,
    sourcesQuery.error,
  ]);

  const exportDiagnostics = React.useCallback(async () => {
    try {
      const bundle = await getRelationshipBetaDiagnostics();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `oppulence-support-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      onNotice("Support file downloaded. Secrets are left out.");
    } catch (error) {
      onError(errMessage(error, "Could not download the support file."));
    }
  }, [onError, onNotice]);

  const companiesMissing = listNeverLoaded(relationshipsQuery.isError, relationshipsQuery.data);
  const companyCountLabel = companiesMissing
    ? "Couldn't load"
    : companyDirectoryCount(companies.length, hasMoreCompanies);

  return (
    <div className="flex min-h-full flex-col" data-slot="relationships-view">
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
        {directoryTitle.filtered ? (
          <Button
            aria-label="Clear company filters"
            className="h-8 rounded-none border border-border bg-background px-3 text-[13px] font-medium text-primary hover:bg-background-100"
            onClick={clearCompanyFilters}
            type="button"
            variant="ghost"
          >
            <Buildings /> {directoryTitle.label}{" "}
            <Badge className="font-normal text-primary/40" variant="secondary">
              {companyCountLabel}
            </Badge>
          </Button>
        ) : (
          <Badge
            className="h-8 gap-2 rounded-none border border-border bg-background px-3 text-[13px] font-medium text-primary"
            variant="outline"
          >
            <Buildings /> {directoryTitle.label}{" "}
            <Badge className="font-normal text-primary/40" variant="secondary">
              {companyCountLabel}
            </Badge>
          </Badge>
        )}
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={surface}
            onValueChange={(value) => {
              if (value !== "list" && value !== "graph") return;
              setSurface(value);
              // List is the directory. A leftover graph=1 would reopen the graph
              // on refresh even though this control is sitting on List.
              if (value === "list") clearCompanyGraphURL();
            }}
            variant="outline"
            size="sm"
            aria-label="Company view"
          >
            <ToggleGroupItem value="list" aria-label="Show company list">
              <ListBullets /> List
            </ToggleGroupItem>
            <ToggleGroupItem
              value="graph"
              aria-label="Show company graph"
              data-capability="relationship-graph graph-query graph-saved-views graph-governed-actions"
            >
              <Graph /> Graph
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            className="bg-[#3478f6] text-white hover:bg-[#2f6fe6]"
            size="sm"
            onClick={() => setCreating(true)}
          >
            <Plus /> New company
          </Button>
        </div>
      </div>

      {relationshipsQuery.isError && relationshipsQuery.data != null ? (
        <ListRefreshFailure
          message={listRefreshFailureCopy("companies")}
          onRetry={() =>
            void refetchClearingBanner(() => relationshipsQuery.refetch(), onError)
          }
        />
      ) : null}
      {companiesMissing ? (
        <EmptyBlock
          body={companyListFailureCopy()}
          image="companies"
          learnMore={[]}
          title="Companies"
        >
          <Button
            onClick={() => void refetchClearingBanner(() => relationshipsQuery.refetch(), onError)}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </EmptyBlock>
      ) : surface === "graph" ? (
        <RelationshipGraphWorkspace
          relationships={companies}
          hasMoreCompanies={hasMoreCompanies}
          loadingMoreCompanies={loadingMoreCompanies}
          onLoadMoreCompanies={() => void loadMoreCompanies()}
          onOpenRelationship={openDetail}
          onError={onError}
          onNotice={onNotice}
        />
      ) : (
        <>
          <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            <div className="relative min-w-[220px] max-w-sm flex-1">
              <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-primary/35" />
              <Input
                aria-label="Filter companies"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search companies"
                className="h-8 border-border bg-background pl-8 text-[13px]"
              />
            </div>
            <Select value={health} onValueChange={setHealth}>
              <SelectTrigger
                aria-label={companyHealthFilterName(health)}
                className="h-8 w-36"
                size="sm"
              >
                <SelectValue placeholder="Health" />
              </SelectTrigger>
              <SelectContent className="app-shell rounded-none">
                <SelectItem value="all">Any health</SelectItem>
                {HEALTH_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {companyRecordLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={lifecycle} onValueChange={setLifecycle}>
              <SelectTrigger
                aria-label={companyLifecycleFilterName(lifecycle)}
                className="h-8 w-40"
                size="sm"
              >
                <SelectValue placeholder="Lifecycle" />
              </SelectTrigger>
              <SelectContent className="app-shell rounded-none">
                <SelectItem value="all">Any lifecycle</SelectItem>
                {LIFECYCLE_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {companyRecordLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              className="h-8"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              <ArrowClockwise className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
            <details className="group relative ml-auto">
              <summary className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-none border border-border bg-background px-3 text-[12px] text-primary/65 outline-none hover:bg-background-100 hover:text-primary focus-visible:ring-1 focus-visible:ring-primary/20">
                <Sparkle /> Sources
                {sourcesNeedingRepair(sources) > 0 ? (
                  <Badge variant="secondary">{sourcesNeedingRepair(sources)}</Badge>
                ) : null}
              </summary>
              <div className="absolute right-0 top-9 z-30 grid min-w-0 max-h-[70vh] w-[640px] max-w-[calc(100vw-320px)] gap-4 overflow-x-hidden overflow-y-auto rounded-none border border-border bg-background p-4 shadow-2xl">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-primary">
                      Sources and company details
                    </p>
                    <p className="mt-0.5 text-[12px] text-primary/45">
                      Which sources are connected, and which details still need a look.
                    </p>
                  </div>
                  <SourceHealth statuses={sources} />
                </div>
                {companyAttention.length > 0 ? (
                  <p className="text-[12px] text-primary/55">
                    {hasMoreAttention ? `${attentionCompanies}+` : attentionCompanies}{" "}
                    {attentionCompanies === 1 ? "company" : "companies"} in the{" "}
                    <button
                      className="underline hover:text-primary"
                      onClick={() =>
                        document.getElementById("attention-queue")?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        })
                      }
                      type="button"
                    >
                      attention queue
                    </button>
                    .
                  </p>
                ) : null}
                <SourceConnectionCards
                  inventory={sourceInventory}
                  onOpenConnectors={onOpenConnectors}
                  onError={onError}
                  onChanged={() => void load()}
                />
                <RelationshipEnrichment
                  onError={onError}
                  onNotice={onNotice}
                  onChanged={() => void load()}
                />
                <IdentityReviewInbox
                  candidates={identityCandidates}
                  hasMore={hasMoreDuplicates}
                  loadingMore={loadingMoreDuplicates}
                  onLoadMore={() => {
                    void loadMoreDuplicates();
                  }}
                  onError={onError}
                  onChanged={() => {
                    onNotice("Review saved.");
                    void load();
                  }}
                />
                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    data-capability="support-diagnostics"
                    onClick={() => void exportDiagnostics()}
                  >
                    <DownloadSimple /> Download support file
                  </Button>
                </div>
              </div>
            </details>
          </div>

          {companyAttention.length > 0 ? (
            <div className="shrink-0 border-b border-border p-3">
              <AttentionQueueSurface
                hasMore={hasMoreAttention}
                items={companyAttention}
                loading={loading}
                loadingMore={loadingMoreAttention}
                onActionError={onError}
                onChanged={() => void load()}
                onLoadMore={() => void loadMoreAttention()}
                onOpenRelationship={openDetail}
              />
            </div>
          ) : null}

          {loading ? (
            <div className="p-4">
              <ListSkeleton />
            </div>
          ) : companies.length === 0 ? (
            <EmptyBlock
              body={companyListEmptyCopy({
                filtered: directoryTitle.filtered,
                hasConnectedSource,
                lookbackLabel: REVENUE_EVIDENCE_LOOKBACK_LABEL,
              })}
              image="companies"
              learnMore={
                directoryTitle.filtered
                  ? []
                  : [
                      { label: "One place for each company" },
                      { label: "People stay with their company" },
                    ]
              }
              title="Companies"
            >
              {directoryTitle.filtered ? (
                <Button onClick={clearCompanyFilters} size="sm" type="button" variant="outline">
                  Clear filters
                </Button>
              ) : (
                <Button
                  className="bg-[#3478f6] text-white hover:bg-[#2f6fe6]"
                  onClick={() => setCreating(true)}
                  size="sm"
                >
                  <Plus /> New company
                </Button>
              )}
            </EmptyBlock>
          ) : (
            <div className="min-w-0 flex-1 overflow-auto">
              <table
                className="w-full min-w-[960px] table-fixed border-collapse text-left font-sans tracking-[-0.15px]"
                aria-label="Companies"
              >
                <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-border">
                  <TableRow className="h-10 border-b text-[13px] font-medium text-primary/55 hover:bg-transparent">
                    <TableHead className="sticky left-0 z-20 h-10 w-[200px] border-r bg-background px-3">
                      <div className="flex items-center justify-between gap-2">
                        <Label className="font-normal">Company</Label>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              aria-label="Add column"
                              className="size-6 rounded-none p-0 text-primary/35 hover:bg-background-100 hover:text-primary"
                              title="Add column"
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                            >
                              <Plus className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="app-shell rounded-none">
                            {OPTIONAL_COMPANY_COLUMNS.map((column) => (
                              <DropdownMenuCheckboxItem
                                key={column.id}
                                checked={optionalColumns.includes(column.id)}
                                className="rounded-none"
                                onCheckedChange={(checked) =>
                                  setOptionalColumns((current) =>
                                    checked
                                      ? [...current, column.id]
                                      : current.filter((id) => id !== column.id),
                                  )
                                }
                              >
                                {column.label}
                              </DropdownMenuCheckboxItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableHead>
                    <TableHead className="h-10 w-32 border-r px-3">Last activity</TableHead>
                    <TableHead className="h-10 w-40 border-r px-3">Email threads</TableHead>
                    <TableHead className="h-10 w-[136px] border-r px-3">Categories</TableHead>
                    <TableHead className="h-10 w-44 border-r px-3">Domain</TableHead>
                    <TableHead className="h-10 w-[120px] border-r px-3">LinkedIn</TableHead>
                    {optionalColumns.includes("people") ? (
                      <TableHead className="h-10 w-20 border-r px-3 text-center">People</TableHead>
                    ) : null}
                    {optionalColumns.includes("health") ? (
                      <TableHead className="h-10 w-28 border-r px-3">Health</TableHead>
                    ) : null}
                    {optionalColumns.includes("nextAction") ? (
                      <TableHead className="h-10 w-56 border-r px-3">Next action</TableHead>
                    ) : null}
                    {optionalColumns.includes("headquarters") ? (
                      <TableHead className="h-10 w-48 border-r px-3">Headquarters</TableHead>
                    ) : null}
                    {optionalColumns.includes("employees") ? (
                      <TableHead className="h-10 w-40 border-r px-3">Employees</TableHead>
                    ) : null}
                    {optionalColumns.includes("funding") ? (
                      <TableHead className="h-10 w-64 border-r px-3">Funding</TableHead>
                    ) : null}
                    {optionalColumns.includes("revenue") ? (
                      <TableHead className="h-10 w-44 border-r px-3">Revenue</TableHead>
                    ) : null}
                    {optionalColumns.includes("signals") ? (
                      <TableHead className="h-10 w-72 border-r px-3">Growth signals</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((relationship) => (
                    <TableRow
                      key={relationship.id}
                      className="group h-9 border-border hover:bg-background-100/70"
                    >
                      <TableCell className="sticky left-0 z-[5] border-r bg-background px-3 group-hover:bg-background-100">
                        <Button
                          className="flex h-auto w-full items-center justify-start gap-2 truncate px-0 py-0 text-left text-sm font-medium text-primary hover:bg-transparent"
                          onClick={() => openDetail(relationship.id)}
                          type="button"
                          variant="ghost"
                        >
                          <Avatar className="size-6 rounded-none" size="sm">
                            <AvatarFallback className="rounded-none border border-border bg-background-100 text-[10px] font-semibold text-primary/60">
                              {companyName(relationship).slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <Label className="truncate font-normal">
                            {companyName(relationship)}
                          </Label>
                        </Button>
                      </TableCell>
                      <TableCell className="border-r px-3 text-[13px] text-primary/50">
                        {companyLastActivityLabel(relationship.lastTouchAt)}
                      </TableCell>
                      <TableCell className="border-r px-3">
                        <Badge
                          className="text-[13px] font-normal text-primary/55"
                          variant="secondary"
                        >
                          {interactionCountLabel(relationship.emailThreadCount)}
                        </Badge>
                      </TableCell>
                      <TableCell className="border-r px-3">
                        <Badge
                          className="bg-background-100 text-[11px] text-primary/60"
                          variant="outline"
                        >
                          {companyCategoriesLabel(relationship.categories)}
                        </Badge>
                      </TableCell>
                      <TableCell className="truncate border-r px-3 text-[13px]">
                        {companyDomainHref(relationship.accountDomain) ? (
                          <a
                            className="text-primary/65 underline-offset-2 hover:text-primary hover:underline"
                            href={companyDomainHref(relationship.accountDomain) ?? undefined}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {companyDomainLabel(relationship.accountDomain)}
                          </a>
                        ) : companyDomainLabel(relationship.accountDomain) === "Not filled in" ? (
                          <Badge className="font-normal text-primary/35" variant="ghost">
                            Not filled in
                          </Badge>
                        ) : (
                          <span className="text-primary/65">
                            {companyDomainLabel(relationship.accountDomain)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="border-r px-3 text-[13px]">
                        <a
                          className="text-primary/55 underline-offset-2 hover:text-primary hover:underline"
                          href={
                            companyLinkedInAction(
                              companyName(relationship),
                              relationship.resourceRefs,
                              relationship.linkedinUrl,
                            ).href
                          }
                          rel="noreferrer"
                          target="_blank"
                        >
                          {
                            companyLinkedInAction(
                              companyName(relationship),
                              relationship.resourceRefs,
                              relationship.linkedinUrl,
                            ).label
                          }
                        </a>
                      </TableCell>
                      {optionalColumns.includes("people") ? (
                        <TableCell className="border-r px-3 text-center text-[13px] text-primary/60">
                          {relationship.peopleCount ?? 0}
                        </TableCell>
                      ) : null}
                      {optionalColumns.includes("health") ? (
                        <TableCell className="border-r px-3">
                          <Badge
                            className={cn(
                              "text-[13px] font-normal",
                              HEALTH_TONE[relationship.health] ?? HEALTH_TONE.unknown,
                            )}
                            variant="outline"
                          >
                            {companyRecordLabel(relationship.health)}
                          </Badge>
                        </TableCell>
                      ) : null}
                      {optionalColumns.includes("nextAction") ? (
                        <TableCell className="truncate border-r px-3 text-[13px] text-primary/60">
                          {companyNextActionCopy(relationship)}
                        </TableCell>
                      ) : null}
                      {optionalColumns.includes("headquarters") ? (
                        <TableCell className="truncate border-r px-3 text-[13px] text-primary/60">
                          {relationship.companyEnrichmentData?.headquarters || "—"}
                        </TableCell>
                      ) : null}
                      {optionalColumns.includes("employees") ? (
                        <TableCell className="truncate border-r px-3 text-[13px] text-primary/60">
                          {relationship.companyEnrichmentData?.employee_range || "—"}
                        </TableCell>
                      ) : null}
                      {optionalColumns.includes("funding") ? (
                        <TableCell className="truncate border-r px-3 text-[13px] text-primary/60">
                          {relationship.companyEnrichmentData?.funding_summary || "—"}
                        </TableCell>
                      ) : null}
                      {optionalColumns.includes("revenue") ? (
                        <TableCell className="truncate border-r px-3 text-[13px] text-primary/60">
                          {relationship.companyEnrichmentData?.revenue_range || "—"}
                        </TableCell>
                      ) : null}
                      {optionalColumns.includes("signals") ? (
                        <TableCell className="truncate border-r px-3 text-[13px] text-primary/60">
                          {relationship.companyEnrichmentData?.growth_signals || "—"}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </table>
              {hasMoreCompanies ? (
                <Button
                  className="m-3"
                  disabled={loadingMoreCompanies}
                  onClick={() => void loadMoreCompanies()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {companyDirectoryRemainderLabel()}
                </Button>
              ) : null}
            </div>
          )}
        </>
      )}

      {detail ? (
        <RelationshipSheet
          id={detail}
          seed={companies.find((relationship) => relationship.id === detail)}
          position={Math.max(
            1,
            companies.findIndex((relationship) => relationship.id === detail) + 1,
          )}
          filtered={directoryTitle.filtered}
          hasMore={hasMoreCompanies}
          total={companies.length}
          onClose={closeDetail}
          onError={onError}
          onChanged={() => {
            onNotice("Company updated.");
            void load();
          }}
        />
      ) : null}

      {creating ? (
        <CreateRelationshipDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            onNotice("Company added.");
            void load();
          }}
          onError={onError}
        />
      ) : null}
    </div>
  );
}

function SourceHealth({ statuses }: { statuses: RelationshipSourceStatus[] }) {
  if (statuses.length === 0) {
    return (
      <Badge variant="outline" className="w-fit rounded-none font-normal text-primary/45">
        None connected
      </Badge>
    );
  }
  const needsRepair = statuses.filter(
    (source) => !["connected", "backfilling", "live"].includes(source.status),
  ).length;
  return (
    <div className="flex max-w-sm flex-wrap justify-end gap-1.5">
      {statuses.map((source) => (
        <Badge
          key={`${source.source}:${source.sourceAccountId}`}
          variant="outline"
          title={source.lastError || source.lastObservationAt || undefined}
          className={`rounded-none font-normal ${
            source.status === "live"
              ? "border-emerald-500/30"
              : ["connected", "backfilling"].includes(source.status)
                ? "border-sky-500/30"
                : "border-amber-500/30"
          }`}
        >
          {activitySourceLabel(source.source)} · {sourceConnectionLabel(source)}
        </Badge>
      ))}
      {needsRepair > 0 ? (
        <Badge className="gap-1 font-normal text-amber-600 dark:text-amber-400" variant="outline">
          <Warning /> {sourcesAttentionLabel(needsRepair)}
        </Badge>
      ) : null}
    </div>
  );
}

/**
 * The connections page can start Google and HubSpot. Slack is still a source
 * in this menu, but that page has no Slack connection, so Connect would
 * leave the person on a list that cannot finish the job.
 */
/**
 * The Sources button counts sources that need repair. Attention rows and
 * duplicate reviews are not sources, so they do not add to this number.
 */
export function sourcesNeedingRepair(statuses: readonly { status: string }[]): number {
  return statuses.filter(
    (source) => !["connected", "backfilling", "live"].includes(source.status),
  ).length;
}

export function sourcesAttentionLabel(count: number): string {
  const total = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  return total === 1 ? "1 needs attention" : `${total} need attention`;
}

export function sourceListedOnConnectionsPage(source: string): boolean {
  return source === "google" || source === "hubspot";
}

function sourceAccountIsLinked(status: string): boolean {
  switch (status) {
    case "connected":
    case "backfilling":
    case "live":
    case "stale":
    case "rebuilding":
    case "degraded":
      return true;
    default:
      return false;
  }
}

/**
 * The card list mixes a mailbox that is already connected with sources that
 * are not. "Sources to connect" and "Connect Gmail" described the whole list
 * while Gmail was only out of date.
 */
export function sourceConnectionSectionCopy(
  items: readonly { accounts: readonly { status: string }[] }[],
): { title: string; body: string } {
  const linked = items.some((item) =>
    item.accounts.some((account) => sourceAccountIsLinked(account.status)),
  );
  const unlinked = items.some(
    (item) =>
      item.accounts.length === 0 ||
      item.accounts.some((account) => !sourceAccountIsLinked(account.status)),
  );
  if (linked && unlinked) {
    return {
      title: "Sources that need a look",
      body: "Refresh a source that is already connected, or connect one that is not. Reading builds company history. Anything that writes waits for your approval.",
    };
  }
  if (linked) {
    return {
      title: "Sources that need a look",
      body: "These sources are already connected. Refresh one that is out of date. Anything that writes waits for your approval.",
    };
  }
  return {
    title: "Sources to connect",
    body: "Connect Gmail or HubSpot. Reading builds company history. Anything that writes waits for your approval.",
  };
}

const READABLE_SOURCE_STATUSES = new Set([
  "connected",
  "backfilling",
  "live",
  "stale",
  "rebuilding",
  "degraded",
]);

/**
 * A saved Google observation can mark a synthetic default account as live
 * without a grant. Resync cannot read that row. A named account, or any
 * account that was granted a scope, can.
 */
export function googleAccountCanBeRead(account: {
  status: string;
  missingScopes?: readonly string[];
  sourceAccountId?: string;
  grantedScopes?: readonly string[];
}): boolean {
  if (!READABLE_SOURCE_STATUSES.has(account.status) || (account.missingScopes?.length ?? 0) > 0) {
    return false;
  }
  const accountID = account.sourceAccountId?.trim() ?? "";
  const granted = account.grantedScopes ?? [];
  if ((accountID === "" || accountID === "default") && granted.length === 0) return false;
  return true;
}

function sourceCardAccount(item: RelationshipSourceInventoryItem) {
  const account = item.accounts[0];
  if (!account) return undefined;
  if (item.source === "google" && !googleAccountCanBeRead(account)) return undefined;
  return account;
}

function SourceConnectionCards({
  inventory,
  onOpenConnectors,
  onChanged,
  onError,
}: {
  inventory: RelationshipSourceInventoryItem[];
  onOpenConnectors?: () => void;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const needsAttention = inventory.filter(
    (item) =>
      item.accounts.length === 0 ||
      item.accounts.some(
        (account) => account.status !== "live" || account.missingScopes.length > 0,
      ),
  );
  if (needsAttention.length === 0) return null;
  const section = sourceConnectionSectionCopy(needsAttention);

  const mutate = async (key: string, operation: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await operation();
      onChanged();
    } catch (error) {
      onError(errMessage(error, "Could not update this source."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      aria-labelledby="source-connections-heading"
      className="space-y-3"
      data-capability="source-lifecycle"
    >
      <div>
        <h3 id="source-connections-heading" className="text-sm font-medium text-primary">
          {section.title}
        </h3>
        <p className="mt-0.5 text-xs text-primary/55">{section.body}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {needsAttention.map((item) => {
          const account = sourceCardAccount(item);
          const copy = sourceProductCopy(item.source, item.scopeExplanation);
          const progress =
            account && account.backfillTotal > 0
              ? Math.round((account.backfillCompleted / account.backfillTotal) * 100)
              : null;
          const lag = account ? sourceLagLabel(account.lagSeconds) : "";
          return (
            <article
              key={item.source}
              className="min-w-0 space-y-3 rounded-none border border-border p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-medium text-primary">{item.displayName}</h4>
                <Badge variant="outline" className="rounded-none">
                  {sourceConnectionLabel({
                    source: item.source,
                    status: account?.status || "not_connected",
                    backfillPhase: account?.backfillPhase,
                    completeness: account?.completeness,
                  })}
                </Badge>
              </div>
              <p className="text-xs text-primary/55">{copy.explanation}</p>
              <details className="text-[11px] text-primary/55">
                <summary aria-label={`Permissions for ${item.displayName}`} className="cursor-pointer">
                  Permissions
                </summary>
                <p className="mt-1">
                  <Label className="font-medium">Read:</Label> {copy.read}
                </p>
                <p className="mt-1">
                  <Label className="font-medium">On approval:</Label> {copy.write}
                </p>
              </details>
              {account ? (
                <div className="space-y-1 text-[11px] text-primary/50">
                  <p>
                    {completenessProductLabel(account.completeness)}
                    {progress !== null ? ` · ${progress}% of history synced` : ""}
                    {lag ? ` · ${lag}` : ""}
                  </p>
                  {account.missingScopes.length > 0 ? (
                    <p className="text-amber-600">
                      Missing: {missingScopeLabels(account.missingScopes)}
                    </p>
                  ) : null}
                  {account.lastError ? (
                    <p className="text-destructive">{account.lastError}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {!account ||
                account.status === "disconnected" ||
                account.status === "reconnect_required" ? (
                  sourceListedOnConnectionsPage(item.source) ? (
                    <Button
                      aria-label={`Connect ${item.displayName}`}
                      onClick={onOpenConnectors}
                      size="sm"
                      type="button"
                    >
                      Connect
                    </Button>
                  ) : (
                    <p className="text-xs text-primary/55">
                      {item.displayName} can&apos;t be connected from this page yet.
                    </p>
                  )
                ) : null}
                {account && item.supportsResync ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() =>
                      void mutate(`${item.source}:resync`, () =>
                        resyncRelationshipSource(item.source, account.sourceAccountId),
                      )
                    }
                  >
                    {busy === `${item.source}:resync` ? (
                      <Spinner className="size-4" />
                    ) : (
                      <ArrowClockwise />
                    )}{" "}
                    Resync
                  </Button>
                ) : null}
                {account && account.status !== "disconnected" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy !== null}
                    onClick={() =>
                      void mutate(`${item.source}:disconnect`, () =>
                        disconnectRelationshipSource(item.source, account.sourceAccountId),
                      )
                    }
                  >
                    Disconnect
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/** Supporting details behind a possible duplicate, counted for a person rather than an evidence store. */
export function identitySupportLabel(count: number): string {
  const total = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  return total === 1 ? "1 supporting detail" : `${total} supporting details`;
}

/** How sure the match is, as a percent. */
export function identityMatchLabel(confidence: number): string {
  const percent = Number.isFinite(confidence) ? Math.round(confidence * 100) : 0;
  return `${percent}% match`;
}

/**
 * Two company records that share an email or domain.
 * The shared value may be hidden, so the line still names the kind of match.
 */
/** A duplicate match stores an anchor token. The inbox says what was shared. */
export function identityAnchorKindLabel(kind: string): string {
  switch (kind.trim().toLowerCase()) {
    case "email":
      return "Email";
    case "domain":
      return "Domain";
    case "resource_ref":
      return "a linked record";
    default:
      return humanize(kind);
  }
}

export function identityMatchDetail(candidate: {
  anchorKind: string;
  anchorProvider?: string | null;
  anchorPreview?: string | null;
}): string {
  const kind = identityAnchorKindLabel(candidate.anchorKind);
  const provider = candidate.anchorProvider?.trim() ?? "";
  const from = provider ? ` from ${activitySourceLabel(provider)}` : "";
  const preview = candidate.anchorPreview?.trim() || "not shown";
  return `Matched on ${kind}${from}: ${preview}`;
}

/** Impact counts are store names. The badge says what a merge would move. */
export function identityImpactLabel(kind: string, count: number): string {
  const total = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  const noun = (one: string, many: string) => (total === 1 ? `1 ${one}` : `${total} ${many}`);
  switch (kind) {
    case "observations":
      return noun("recorded event", "recorded events");
    case "assertions":
      return noun("saved detail", "saved details");
    case "participants":
      return noun("person", "people");
    case "commitments":
      return noun("promise", "promises");
    case "actions":
      return noun("action", "actions");
    case "evidence":
      return noun("supporting record", "supporting records");
    default:
      return `${total} ${humanize(kind)}`;
  }
}

/** Review actions are stored decisions. The button says what the person is choosing. */
export function identityDecisionLabel(decision: string): string {
  switch (decision) {
    case "merge":
      return "Merge";
    case "keep_separate":
      return "Keep separate";
    case "move_evidence":
      return "Move the evidence";
    case "defer":
      return "Decide later";
    case "split":
      return "Split";
    case "undo":
      return "Undo";
    default:
      return humanize(decision);
  }
}

/** The inbox count says when the loaded page is not every duplicate. */
export function duplicateInboxLabel(count: number, hasMore: boolean): string {
  const noun = count === 1 ? "duplicate" : "duplicates";
  const shown = hasMore ? `${count}+` : String(count);
  return `${shown} possible ${noun}`;
}

function IdentityReviewInbox({
  candidates,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onChanged,
  onError,
}: {
  candidates: RelationshipIdentityCandidate[];
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [reviewError, setReviewError] = React.useState<string | null>(null);
  if (candidates.length === 0) return null;

  const decide = async (
    candidate: RelationshipIdentityCandidate,
    decision: DecideRelationshipIdentityCandidateInput["decision"],
  ) => {
    setBusy(`${candidate.id}:${decision}`);
    setReviewError(null);
    try {
      await decideIdentityCandidate(candidate.id, {
        decision,
        reason: reasons[candidate.id]?.trim() || `Reviewed in the identity inbox: ${decision}.`,
        expectedVersion: candidate.version,
        idempotencyKey: crypto.randomUUID(),
      });
      onChanged();
    } catch (error) {
      const message = errMessage(error, "Could not save this review. Refresh and try again.");
      setReviewError(message);
      onError(message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      aria-labelledby="identity-review-heading"
      className="space-y-2 rounded-none border border-amber-500/30 bg-amber-500/5 p-3"
      data-capability="identity-review"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="identity-review-heading" className="text-sm font-medium text-primary">
            Review possible duplicates
          </h3>
          <p className="mt-0.5 text-xs text-primary/55">
            {duplicateInboxLabel(candidates.length, hasMore)} cannot receive actions until reviewed.
          </p>
        </div>
        <Badge variant="outline" className="rounded-none border-amber-500/40">
          Needs your review
        </Badge>
      </div>
      {reviewError ? (
        <p className="text-sm text-destructive" role="alert">
          {reviewError}
        </p>
      ) : null}
      {candidates.map((candidate) => (
        <article key={candidate.id} className="space-y-3 border-t border-amber-500/20 pt-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-primary">
                {companyName(candidate.proposedRelationship)} may match{" "}
                {companyName(candidate.existingRelationship)}
              </p>
              <p className="mt-0.5 text-xs text-primary/55">{identityMatchDetail(candidate)}</p>
            </div>
            <Badge className="text-xs font-normal text-primary/45" variant="secondary">
              {identitySupportLabel(candidate.evidenceCount)} ·{" "}
              {identityMatchLabel(candidate.recommendationConfidence)}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] text-primary/55">
            {Object.entries(candidate.impact)
              .filter(([, count]) => Number(count) > 0)
              .map(([kind, count]) => (
                <Badge className="font-normal" key={kind} variant="outline">
                  {identityImpactLabel(kind, Number(count))}
                </Badge>
              ))}
          </div>
          <Input
            aria-label={`Reason for identity decision about ${companyName(candidate.proposedRelationship)}`}
            value={reasons[candidate.id] ?? ""}
            onChange={(event) =>
              setReasons((current) => ({ ...current, [candidate.id]: event.target.value }))
            }
            placeholder="Why you made this choice (optional)"
          />
          <div className="flex flex-wrap gap-2">
            {(candidate.status === "resolved"
              ? (["split", "undo"] as const)
              : (["merge", "keep_separate", "move_evidence", "defer"] as const)
            ).map((decision) => (
              <Button
                key={decision}
                type="button"
                size="sm"
                variant={candidate.recommendedDecision === decision ? "default" : "outline"}
                disabled={busy !== null}
                onClick={() => void decide(candidate, decision)}
              >
                {busy === `${candidate.id}:${decision}` ? <Spinner className="size-4" /> : null}
                {identityDecisionLabel(decision)}
              </Button>
            ))}
          </div>
        </article>
      ))}
      {hasMore ? (
        <Button
          disabled={loadingMore || !onLoadMore}
          onClick={onLoadMore}
          size="sm"
          type="button"
          variant="outline"
        >
          {loadingMore ? "Loading…" : "Show the next duplicates"}
        </Button>
      ) : null}
    </section>
  );
}

/**
 * "Some details are still missing" means a source exists for the rest.
 * None supported is a different fact.
 */
export function completenessHeading(status: string, supported: number): string {
  const count = Number.isFinite(supported) ? Math.max(0, Math.round(supported)) : 0;
  if (status.trim() === "partial" && count === 0) return "No account details have a source yet";
  return completenessProductLabel(status);
}

/**
 * Sync lag is a duration. A missed day was printing as thousands of minutes
 * instead of how long the source has been behind.
 */
export function sourceLagLabel(lagSeconds: number): string {
  if (!Number.isFinite(lagSeconds) || lagSeconds <= 0) return "";
  const minute = 60;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (lagSeconds < hour) {
    const minutes = Math.max(1, Math.round(lagSeconds / minute));
    return minutes === 1 ? "1 minute behind" : `${minutes} minutes behind`;
  }
  if (lagSeconds < day) {
    const hours = Math.round(lagSeconds / hour);
    return hours === 1 ? "1 hour behind" : `${hours} hours behind`;
  }
  const days = Math.max(1, Math.round(lagSeconds / day));
  return days === 1 ? "1 day behind" : `${days} days behind`;
}

/** Stored completeness statuses are not labels. The company sheet names what is missing. */
export function completenessProductLabel(status: string): string {
  const labels: Record<string, string> = {
    complete: "Details are current",
    partial: "Some details are still missing",
    stale: "Details need a refresh",
    rebuilding: "Updating from connected sources",
    ambiguous: "Needs a review before you act",
    disconnected: "A source needs to be reconnected",
  };
  return labels[status] ?? relationshipLabel(status);
}

/** A possible duplicate blocks acting until someone reviews it. */
export function identityReviewBlockCopy(count: number): string {
  const total = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  if (total === 1) return "1 possible duplicate must be reviewed before you act.";
  return `${total} possible duplicates must be reviewed before you act.`;
}

/**
 * Completeness text is stored with the company. The empty-workspace sentence
 * talks about a sync. The sheet says what the person can do.
 */
/**
 * asOf is the moment the company was loaded, not a review time. A company
 * that has never been reviewed must not claim it was reviewed just now.
 */
/** A promise or meeting is a record even when no account detail has moved. */
export function reviewHasRecordedActivity(commitments: readonly unknown[]): boolean {
  return commitments.length > 0;
}

export function companyReviewCopy(
  model: {
    previousReviewedStateVersion: number;
    changedSinceReview: boolean;
  },
  hasRecordedActivity = false,
): { change: string; footer: string } {
  if (!model.changedSinceReview && model.previousReviewedStateVersion <= 0) {
    return {
      change: relationshipChangeEmptyCopy(hasRecordedActivity),
      footer: "Not reviewed yet.",
    };
  }
  return {
    change: "Nothing changed since your last review.",
    footer: "Nothing new since your last review.",
  };
}

/**
 * A correction reason explains a health or stage change. It is not the
 * company description, and it is not the next action.
 */
export function companyDescriptionCopy(record: {
  companyDescription?: string;
  summary?: string;
}): string {
  const description = record.companyDescription?.trim() || record.summary?.trim();
  return description || "No description yet";
}

/** The directory and the sheet use the same words when nothing has happened yet. */
export function companyLastActivityLabel(lastTouchAt?: string | null): string {
  const label = lastTouchAt ? relativeTime(lastTouchAt) : "";
  return label || "No activity";
}

/** Recovery already names the band. The company card should not print the raw score. */
export function recommendationPriorityLabel(score: number): string {
  return priorityTone(score).label;
}

export function companyNextActionCopy(record: {
  nextAction?: string;
  openActions?: number;
}): string {
  const next = record.nextAction?.trim();
  if (next) return next;
  const open = record.openActions ?? 0;
  if (open > 0) return `${open} open action${open === 1 ? "" : "s"}`;
  return "No open action";
}

/** Lifecycle and health are stored tokens. The sheet names which is which. */
export function companyStateAnswer(lifecycle: string, health: string): string {
  return `Lifecycle: ${companyRecordLabel(lifecycle)} · Health: ${companyRecordLabel(health)}`;
}

/**
 * A new company stores lifecycle as "prospect" before any source exists.
 * That default is not what is true now. Only a supported value is an answer.
 */
/**
 * A projection with no dimension change is recorded as "evidence".
 * The question asks what changed, so that token has to say the evidence moved.
 */
export function missionControlChangeAnswer(
  changes: readonly { dimension: string }[],
  unchanged: string,
): string {
  if (changes.length === 0) return unchanged;
  const labels = changes.map((change) => {
    if (change.dimension === "evidence") return "Supporting evidence";
    return RELATIONSHIP_DIMENSION_LABELS[change.dimension] ?? relationshipLabel(change.dimension);
  });
  if (labels.length === 1 && labels[0] === "Supporting evidence") {
    return "Supporting evidence changed.";
  }
  return labels.join(", ");
}

/**
 * Same clock as the company card and the register. A promise due inside this
 * window is at risk even while its stored status stays "open".
 */
const PROMISE_AT_RISK_WINDOW_MS = 72 * 60 * 60 * 1000;

function promiseDueAtRisk(dueAt: string | null | undefined, now: number): boolean {
  if (!dueAt?.trim()) return false;
  const due = Date.parse(dueAt);
  return Number.isFinite(due) && due < now + PROMISE_AT_RISK_WINDOW_MS;
}

/**
 * A confirmed promise is true now. A candidate is still a guess, and a closed
 * promise is no longer the current fact. The company card calls a promise due
 * inside 72 hours "At risk", so this answer uses that same word.
 */
export function missionControlPromiseAnswer(
  commitments: readonly {
    status?: string;
    text?: string;
    acceptance?: string;
    dueAt?: string | null;
  }[],
  now = Date.now(),
): string {
  const rows = commitments
    .filter((item) => (item.status || "open") === "open" || item.status === "at_risk")
    .filter((item) => item.acceptance !== "candidate" && item.acceptance !== "disputed")
    .map((item) => ({
      text: item.text?.trim() ?? "",
      atRisk: item.status === "at_risk" || promiseDueAtRisk(item.dueAt, now),
    }))
    .filter((item) => item.text);
  if (rows.length === 0) return "";
  if (rows.length === 1) {
    return rows[0].atRisk ? `At risk promise: ${rows[0].text}` : `Open promise: ${rows[0].text}`;
  }
  const atRisk = rows.filter((row) => row.atRisk).length;
  const open = rows.length - atRisk;
  if (atRisk === 0) return `${open} open promises.`;
  if (open === 0) return `${atRisk} promises are at risk.`;
  const openLabel = open === 1 ? "1 open promise" : `${open} open promises`;
  const riskLabel = atRisk === 1 ? "1 promise at risk" : `${atRisk} promises at risk`;
  return `${openLabel} and ${riskLabel}.`;
}

export function missionControlStateAnswer(
  evidence: {
    lifecycle?: { supported?: boolean; value?: unknown };
    health?: { supported?: boolean; value?: unknown };
    engagement?: { supported?: boolean; value?: unknown };
    sentiment?: { supported?: boolean; value?: unknown };
  },
  commitments: readonly {
    status?: string;
    text?: string;
    acceptance?: string;
    dueAt?: string | null;
  }[] = [],
  now = Date.now(),
): string {
  const shown = (item: { supported?: boolean; value?: unknown } | undefined) => {
    if (!item?.supported || item.value == null) return "";
    return String(item.value).trim();
  };
  const lifecycle = shown(evidence.lifecycle);
  const health = shown(evidence.health);
  const engagement = shown(evidence.engagement);
  const sentiment = shown(evidence.sentiment);
  const parts = [
    lifecycle ? `Lifecycle: ${companyRecordLabel(lifecycle)}` : "",
    health ? `Health: ${companyRecordLabel(health)}` : "",
    engagement ? `Engagement: ${companyRecordLabel(engagement)}` : "",
    sentiment ? `Sentiment: ${companyRecordLabel(sentiment)}` : "",
  ].filter(Boolean);
  const promise = missionControlPromiseAnswer(commitments, now);
  if (promise) parts.push(promise);
  if (parts.length === 0) return "No supported answer yet.";
  return parts.join(" · ");
}

/**
 * The question asks what should happen next. The stored reason says why the
 * recommendation exists, so the action name has to lead.
 */
export function missionControlActionAnswer(
  recommendation?: {
    actionType?: string | null;
    reason?: string | null;
  } | null,
  commitments?: readonly {
    status?: string;
    text?: string;
    acceptance?: string;
    dueAt?: string | null;
  }[],
  now = Date.now(),
): string {
  const type = recommendation?.actionType?.trim() ?? "";
  const reason = actionReasonCopy(recommendation?.reason);
  const label = type ? (ACTION_TYPE_LABELS[type] ?? humanize(type)) : "";
  if (label && reason) return `${label}. ${reason}`;
  if (label || reason) return label || reason;
  const open = missionControlPromiseAnswer(commitments ?? [], now);
  if (!open) return "No action is currently recommended.";
  const sentence = open.endsWith(".") ? open : `${open}.`;
  return `${sentence} No follow-up is drafted.`;
}

/** The eight details are account fields. The promise is a separate record. */
export function accountDetailSourceCopy(supported: number, total: number, trust = false): string {
  const shown = Number.isFinite(supported) ? Math.max(0, Math.round(supported)) : 0;
  const all = Number.isFinite(total) ? Math.max(0, Math.round(total)) : 0;
  return trust
    ? `${shown} of ${all} account details come from a source you can open.`
    : `${shown} of ${all} account details have a source`;
}

/**
 * A person can confirm a detail without attaching the note it came from.
 * The trust question only counts details that still have something to open.
 */
export function openableAccountDetailCount(
  evidence: Record<string, { evidence?: readonly unknown[] } | undefined>,
): number {
  return Object.values(evidence).filter((item) => (item?.evidence?.length ?? 0) > 0).length;
}

/**
 * The create form stores a company email. A domain then replaces it under the
 * title, so the address has to stay in the record. Only a plain address is a link.
 */
export function companyEmailHref(email: string | null | undefined): string | null {
  const trimmed = email?.trim() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return `mailto:${trimmed}`;
}

export function companyEmailDetail(email: string | null | undefined): {
  text: string;
  href?: string;
} {
  const trimmed = email?.trim() ?? "";
  if (!trimmed) return { text: "Not filled in" };
  const href = companyEmailHref(trimmed);
  return href ? { text: trimmed, href } : { text: trimmed };
}

/** Record badges sit together. The dimension has to travel with the value. */
export function recordDetailBadge(label: string, value: string): string {
  return `${label} · ${companyRecordLabel(value)}`;
}

/**
 * A new company stores lifecycle as "prospect" and health as "unknown" before
 * any source exists. Those defaults are not a stage or a health reading.
 */
export function supportedRecordValue(
  stored: string,
  evidence: { supported?: boolean } | undefined,
): string {
  if (!evidence?.supported) return "Not known";
  return companyRecordLabel(stored);
}

/**
 * The policy version is a hash. Privacy should say whether any decision
 * was recorded, not show that identifier.
 */
export function privacyDecisionCopy(count: number): string {
  if (count === 0) return "No privacy decisions recorded.";
  if (count === 1) return "1 privacy decision recorded.";
  return `${String(count)} privacy decisions recorded.`;
}

/** Capture is a rule, not a stored token. "Require Consent" does not say what happens. */
export function capturePolicyLabel(capture: string): string {
  switch (capture) {
    case "deny":
      return "Do not capture";
    case "require_consent":
      return "Ask before capturing";
    case "allow":
      return "Capture is allowed";
    default:
      return relationshipLabel(capture);
  }
}

function governanceFallback(value: string): string {
  const split = value
    .replaceAll(/[_./]+/g, " ")
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return humanize(split);
}

/** A blank subject is the same sentence the directory search uses. */
export function mailThreadSubjectLabel(subject?: string | null): string {
  const trimmed = subject?.trim() ?? "";
  return trimmed || "Email conversation";
}

/** The email and meeting timeline uses this when the subject is blank. */
export function communicationPreviewLabel(subject?: string | null): string {
  const trimmed = subject?.trim() ?? "";
  return trimmed || "No message preview";
}

/** Activity history uses this when an observation has no summary. */
export function activitySummaryLabel(summary?: string | null): string {
  const trimmed = summary?.trim() ?? "";
  const outcome = activityOutcomeSummary(trimmed);
  if (outcome) return outcome;
  return trimmed || "Open the source";
}

/** A blank quote is the same sentence as a missing one. */
export function evidenceExcerptLabel(excerpt?: string | null): string {
  const trimmed = excerpt?.trim() ?? "";
  return trimmed || "Evidence excerpt unavailable";
}

/** A blank address is the same party line the directory search uses. */
export function mailThreadPartyLabel(email?: string | null): string {
  const trimmed = email?.trim() ?? "";
  return trimmed || "Gmail";
}

/** The count line is "1 message" or "N messages," including a missing count. */
export function mailMessageCountLabel(count: number): string {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return n === 1 ? "1 message" : `${String(n)} messages`;
}

/** A Gmail thread stores who spoke last. The company sheet says what that means. */
export function mailReplyLabel(state: string): string {
  switch (state) {
    case "needs_reply":
      return "Needs a reply";
    case "awaiting_reply":
      return "Waiting on them";
    case "quiet":
      return "Quiet";
    default:
      return humanize(state);
  }
}

/** Focused review stores the kind of doubt. The badge says what to check. */
export function reviewEvidenceKindLabel(kind: string): string {
  switch (kind) {
    case "claim":
      return "What was said";
    case "speaker":
      return "Who said it";
    case "entity":
      return "Who this is";
    case "word":
      return "The wording";
    default:
      return humanize(kind);
  }
}

/** A shared plan stores an internal status. The heading says where it stands. */
export function mutualPlanStatusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "revised":
      return "Revised";
    case "internally_approved":
      return "Approved in this workspace";
    case "counterparty_responded":
      return "They responded";
    case "completed":
      return "Finished";
    case "cancelled":
      return "Cancelled";
    default:
      return humanize(status);
  }
}

/** The plan heading names the version. The stored word is "revision". */
export function mutualPlanHeading(status: string, version: number): string {
  const label = mutualPlanStatusLabel(status);
  const number = Number.isFinite(version) && version > 0 ? Math.floor(version) : 1;
  return `${label} · Version ${number}`;
}

/**
 * A plan step names its owner when that owner is a person. A redacted token
 * and a bare id are not a name.
 */
export function mutualPlanItemLine(title: string, owner?: string | null): string {
  const name = title.trim() || "Untitled step";
  const who = (owner ?? "").trim();
  if (!who || who === "plan-participant") return name;
  if (/^[0-9a-f-]{36}$/i.test(who)) return name;
  if (/^[a-z0-9_:-]+$/.test(who)) return name;
  return `${name} · ${who}`;
}

export function mutualPlanApproveLabel(): string {
  return "Approve this plan";
}

/** Sharing writes a draft email. It does not send the plan. */
export function mutualPlanShareLabel(): string {
  return "Draft an email to share this plan";
}

/**
 * Recording acceptance means the other party accepted. The button names that
 * promise so several confirmed promises stay distinct.
 */
export function acceptedPromiseLabel(text: string): string {
  const name = text.trim() || "this promise";
  return `They accepted “${name}”`;
}

/** A shared plan is built from promises the other party already accepted. */
export function mutualPlanCreateLabel(): string {
  return "Create from promises they accepted";
}

/** No plan exists until the other party accepts a promise. */
export function mutualPlanEmptyCopy(): string {
  return "A shared plan starts once they accept a promise.";
}

/** Dependencies are a small graph. The sheet names the links. */
export function promiseLinkTitle(count: number): string {
  return `Promise links (${count})`;
}

export function promiseLinkKindLabel(kind: string): string {
  switch (kind) {
    case "blocks":
      return "Blocks";
    case "requires":
      return "Requires";
    case "supersedes":
      return "Replaces";
    default:
      return humanize(kind);
  }
}

export function promiseLinkEndLabel(text?: string | null): string {
  const name = text?.trim() ?? "";
  return name || "Unknown promise";
}

/** A deletion receipt status is how far the delete got, not a one-word token. */
export function deletionReceiptStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Deletion is still running";
    case "blocked":
      return "Deletion is blocked";
    case "partial":
      return "Some copies are still there";
    case "verified":
      return "Deletion is finished";
    default:
      return humanize(status);
  }
}

/** A projection names the field that moved. Plural snapshot keys stay plural. */
export function relationshipChangeLabel(dimension: string): string {
  switch (dimension) {
    case "evidence":
      return "Supporting evidence";
    case "risks":
      return "Risks";
    case "milestones":
      return "Milestones";
    default:
      return RELATIONSHIP_DIMENSION_LABELS[dimension] ?? humanize(dimension);
  }
}

/** A contradiction side stores a source slug or an authority token. */
export function contradictionSourceLabel(source: string): string {
  switch (source.trim().toLowerCase()) {
    case "user_correction":
      return "Your correction";
    case "source_fact":
      return "A connected source";
    case "deterministic":
      return "A rule";
    case "ai_inference":
      return "A suggestion";
    default:
      return activitySourceLabel(source);
  }
}

/** Older contradiction rows stored the ranking rule. The sheet says who won. */
export function contradictionReasonCopy(reason: string): string {
  const raw = reason.trim();
  if (raw === "deterministic assertion authority selected the current value") {
    return "A stronger source already chose the current value.";
  }
  if (raw === "equally authoritative typed evidence overlaps with different values") {
    return "Two sources disagree. Choose which value is current.";
  }
  if (raw === "User selected the current value from a focused contradiction case.") {
    return "You chose the current value.";
  }
  const selected = /^Selected ([a-z0-9_]+) as current evidence\.$/.exec(raw);
  if (selected?.[1]) return `You chose the value from ${contradictionSourceLabel(selected[1])}.`;
  return raw;
}

/** Ranking stores a factor key. The inspection list names what moved the score. */
export function rankingFactorLabel(factor: string): string {
  switch (factor) {
    case "commitment_due_state":
      return "Due date";
    case "source_completeness":
      return "Source coverage";
    case "outcome_learning":
      return "Earlier outcomes";
    default:
      return humanize(factor);
  }
}

const RANKING_FACTOR_REASONS: Record<string, string> = {
  "An accepted commitment is overdue.": "This promise is past due.",
  "An accepted commitment is due now.": "This promise is due now.",
  "Fresh source coverage changes confidence in the queue position.":
    "How complete the sources are changes where this sits.",
  "More complete fresh evidence increases confidence in ordering.":
    "How complete the sources are changes where this sits.",
  "Bounded prior decisions and outcomes adjust ordering, never authority.":
    "Earlier results change the order. They do not approve the action.",
  "Recent evidence is more actionable than stale evidence.":
    "Newer evidence matters more than older evidence.",
  "The user has repeatedly retained this channel.": "You have kept this channel before.",
};

/** Older ranking rows stored the ranker rule. The inspection list says what changed. */
export function rankingFactorReason(reason: string): string {
  const raw = reason.trim();
  return RANKING_FACTOR_REASONS[raw] ?? raw;
}

/**
 * Reconcile stores a classification token. The promise list names the
 * situation, and an older explanation that repeated the token is rewritten.
 */
export function recoveryClassificationLabel(classification: string): string {
  switch (classification) {
    case "forgotten":
      return "This promise looks forgotten";
    case "unknown_stale_sources":
      return "A source is out of date";
    case "fulfilled":
      return "The promise was kept";
    case "likely_fulfilled":
      return "The promise may already be kept";
    case "superseded":
      return "Replaced by a later promise";
    case "renegotiated":
      return "The promise was renegotiated";
    case "blocked":
      return "The promise is blocked";
    default:
      return humanize(classification);
  }
}

const CURRENT_RECOVERY_EXPLANATIONS = new Set([
  "A connected source is out of date, so this promise cannot be checked yet.",
  "A newer source shows this promise was met.",
  "A newer source suggests this promise was met. Review it before closing it.",
  "A newer source shows this promise was kept.",
  "A newer source suggests this promise was kept. Review it before closing it.",
  "This promise is past due and nothing newer has closed it.",
  "A later promise replaced this one.",
  "This promise was renegotiated. Review the new terms.",
  "This promise is blocked. Review it before acting.",
  "Review this promise before acting on it.",
]);

export function recoveryExplanationCopy(classification: string, explanation: string): string {
  const raw = explanation.trim();
  if (CURRENT_RECOVERY_EXPLANATIONS.has(raw)) return raw;
  if (/unknown_stale_sources|stale sources:/i.test(raw)) {
    return "A connected source is out of date, so this promise cannot be checked yet.";
  }
  const suggested = /^Fresh evidence suggests ([a-z0-9_]+); human review is required\.$/.exec(raw);
  if (suggested) return `${recoveryClassificationLabel(suggested[1] ?? classification)}. Review it before acting.`;
  if (raw === "Fresh explicit source evidence proves fulfillment.") {
    return "A newer source shows this promise was kept.";
  }
  if (!raw || raw.includes(classification)) return recoveryClassificationLabel(classification);
  return raw;
}

/** A meeting receipt stores how the conversation was captured. */
export function governanceCaptureLabel(capture: string): string {
  switch (capture) {
    case "manual_capture":
      return "Captured by hand";
    case "explicit_upload":
      return "Uploaded on purpose";
    case "provider_import":
      return "Imported from the provider";
    case "calendar_prompt_or_manual":
      return "Started from the calendar or by hand";
    case "deny":
    case "require_consent":
    case "allow":
      return capturePolicyLabel(capture);
    default:
      return governanceFallback(capture);
  }
}

/** Where the transcript traveled before it was saved. */
export function governanceRouteLabel(routing: string): string {
  switch (routing) {
    case "local_transcription_to_oppulence":
      return "Transcribed on this device, then saved here";
    case "local_only":
      return "Stays on this device";
    default: {
      const imported = /^([a-z0-9]+)_to_oppulence$/.exec(routing);
      if (imported?.[1]) return `Imported from ${humanize(imported[1])}, then saved here`;
      return governanceFallback(routing);
    }
  }
}

/** The receipt's region is a boundary, not a machine name. */
export function governancePlaceLabel(region: string): string {
  switch (region) {
    case "local_device":
      return "On this device";
    case "provider_managed":
      return "At the provider";
    default:
      return governanceFallback(region);
  }
}

/** How long the captured audio or transcript is kept. */
export function governanceRetentionLabel(retention: string): string {
  switch (retention) {
    case "untilTranscribed":
    case "until_transcribed":
      return "Kept until it is transcribed";
    case "always":
      return "Kept";
    case "provider_policy_plus_oppulence_evidence":
      return "The provider's policy, plus the evidence saved here";
    default:
      return governanceFallback(retention);
  }
}

/** Whether the people in the conversation were told it was captured. */
export function governanceDisclosureLabel(disclosure: string): string {
  switch (disclosure) {
    case "not_recorded":
      return "People were not told";
    case "provider_reported":
      return "The provider says people were told";
    default:
      return governanceFallback(disclosure);
  }
}

/** What happened to the recording after it was used. */
export function governanceDeletionLabel(outcome: string): string {
  if (outcome.startsWith("deleted:")) return "Deleted";
  switch (outcome) {
    case "scheduled_after_transcription":
      return "Scheduled to be deleted after transcription";
    case "retained_by_user_policy":
      return "Kept because of your settings";
    case "not_applicable":
      return "Nothing to delete";
    case "retained":
      return "Kept";
    default:
      return governanceFallback(outcome);
  }
}

export const GOVERNANCE_RECEIPT_PAGE = 5;

/** Receipts past the first screen stay one click away. */
export function governanceReceiptRemainder(hidden: number): string {
  return hidden === 1 ? "Show the other 1 receipt" : `Show the other ${hidden} receipts`;
}

/** The mail heading says when the first page is not the whole timeline. */
export function communicationTimelineTitle(
  shown: number,
  hasMore: boolean,
  failed = false,
): string {
  if (failed && shown === 0) return "Email & meeting timeline";
  return hasMore
    ? `Email & meeting timeline (${shown}+)`
    : `Email & meeting timeline (${shown})`;
}

export function earlierMailLabel(): string {
  return "Show earlier mail and meetings";
}

/**
 * This list is mailbox and calendar records. A confirmed meeting lives in
 * Activity, so an empty list must not say there was no meeting.
 */
export function communicationTimelineEmptyCopy(hasMeetingActivity: boolean): string {
  if (hasMeetingActivity) {
    return "No Gmail or calendar events yet. Confirmed meetings are in Activity.";
  }
  return "No Gmail or calendar events yet.";
}

/** Overview email activity is Gmail threads. A confirmed meeting is not one of them. */
export function emailActivityEmptyCopy(hasMeetingActivity: boolean): string {
  if (hasMeetingActivity) {
    return "No Gmail threads linked yet. Confirmed meetings are in Activity.";
  }
  return "No Gmail threads linked yet.";
}

/** Activity history uses the same honest count as mail. */
export function activityHistoryTitle(shown: number, hasMore: boolean, failed = false): string {
  if (failed && shown === 0) return "Activity history";
  return hasMore ? `Activity history (${shown}+)` : `Activity history (${shown})`;
}

export function earlierActivityLabel(): string {
  return "Show earlier activity";
}

/** Mail and account changes name the empty list. Activity history does too. */
export function activityHistoryEmptyCopy(): string {
  return "No activity recorded for this company yet.";
}

function pageCursor(page: {
  nextBefore?: string;
  nextBeforeId?: string;
}): TimelinePageCursor | undefined {
  if (!page.nextBefore) return undefined;
  return { before: page.nextBefore, beforeId: page.nextBeforeId };
}

/** The change list says when the two newest snapshots are not the whole history. */
export function relationshipChangeTitle(shown: number, hasMore: boolean, failed = false): string {
  if (failed && shown === 0) return "What changed";
  return hasMore ? `What changed (${shown}+)` : `What changed (${shown})`;
}

/**
 * Snapshots cover account details such as health and lifecycle. A confirmed
 * meeting is activity, so an empty snapshot list must not say nothing happened.
 */
export function relationshipChangeEmptyCopy(hasRecordedActivity: boolean): string {
  if (hasRecordedActivity) {
    return "No account details have changed yet. Promises and meetings are in the sections below.";
  }
  return "No account details have changed yet.";
}

/** A failed company-sheet pane is not an empty history. */
export function sheetPaneFailureCopy(noun: string): string {
  return `${noun} could not load. Try again.`;
}

/** A later reload failed, so the history already on screen stays. */
export function sheetPaneRefreshCopy(noun: string): string {
  return `Could not refresh ${noun}. Try again.`;
}

/**
 * A pane that fails on a later load keeps what it already showed. A first look
 * at a company has nothing to keep.
 */
export function applySheetPane<T>(input: {
  sameCompany: boolean;
  current: readonly T[];
  failed: boolean;
  next: readonly T[] | null;
}): T[] {
  if (!input.failed && input.next) return [...input.next];
  if (input.sameCompany) return [...input.current];
  return [];
}

export async function captureSheetPane<T>(
  load: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await load() };
  } catch {
    return { ok: false };
  }
}

export function earlierChangesLabel(): string {
  return "Show earlier changes";
}

/** Focused review says when the newest conversations are not the whole record. */
export function focusedReviewTitle(count: number, hasMore: boolean): string {
  return hasMore ? `Focused evidence review (${count}+)` : `Focused evidence review (${count})`;
}

export function earlierEvidenceLabel(): string {
  return "Show earlier evidence";
}

function appendById<T extends { id: string }>(current: T[], next: T[]): T[] {
  const seen = new Set(current.map((item) => item.id));
  const added = next.filter((item) => !seen.has(item.id));
  return added.length === 0 ? current : [...current, ...added];
}

function appendByKey<T>(current: T[], next: T[], key: (item: T) => string): T[] {
  const seen = new Set(current.map(key));
  const added = next.filter((item) => !seen.has(key(item)));
  return added.length === 0 ? current : [...current, ...added];
}

type SheetDuplicatePages = {
  pending: RelationshipIdentityCandidate[];
  deferred: RelationshipIdentityCandidate[];
  resolved: RelationshipIdentityCandidate[];
  extraPending: RelationshipIdentityCandidate[];
  extraDeferred: RelationshipIdentityCandidate[];
  extraResolved: RelationshipIdentityCandidate[];
  pendingHasMore: boolean;
  deferredHasMore: boolean;
  resolvedHasMore: boolean;
};

function emptySheetDuplicatePages(): SheetDuplicatePages {
  return {
    pending: [],
    deferred: [],
    resolved: [],
    extraPending: [],
    extraDeferred: [],
    extraResolved: [],
    pendingHasMore: false,
    deferredHasMore: false,
    resolvedHasMore: false,
  };
}

function mergeIdentityPages(
  page: readonly RelationshipIdentityCandidate[],
  extra: readonly RelationshipIdentityCandidate[],
): RelationshipIdentityCandidate[] {
  return appendById([...page], [...extra]);
}

/** Whether any audio excerpt was saved with the receipt. */
export function governanceExcerptLabel(clip: string): string {
  switch (clip) {
    case "not_retained":
      return "No audio was kept";
    case "encrypted":
      return "The audio that was kept is encrypted";
    default:
      return governanceFallback(clip);
  }
}

/** publishEvidence is whether shared excerpts can be published. It is not a save switch. */
export function evidencePublicationLabel(enabled: boolean): string {
  return enabled ? "Shared excerpts: on" : "Shared excerpts: off";
}

/** externalShare is whether a plan can leave this workspace. */
export function externalPlanShareLabel(enabled: boolean): string {
  return enabled
    ? "Plan sharing outside this workspace: allowed"
    : "Plan sharing outside this workspace: blocked";
}

const CONVERSATION_NOTE_SOURCES = new Set(["meeting", "desktop_note", "voice_note", "browser"]);

/**
 * Deletion removes mail, meetings, notes, and commitments. An empty company
 * has none of those, so the button must not offer a deletion that cannot run.
 */
export function conversationDeletionAvailable(input: {
  emailThreads: number;
  meetingsAndMail: number;
  commitments: number;
  conversationNotes: number;
}): boolean {
  return (
    input.emailThreads > 0 ||
    input.meetingsAndMail > 0 ||
    input.commitments > 0 ||
    input.conversationNotes > 0
  );
}

export function conversationNoteCount(sources: readonly string[]): number {
  return sources.filter((source) => CONVERSATION_NOTE_SOURCES.has(source)).length;
}

/** Deleting conversation evidence is permanent for this workspace. Ask on the sheet. */
export function deleteConversationConfirmCopy(): string {
  return "Delete shared conversation evidence for this company? Device and provider copies will remain pending until separately confirmed.";
}

export { completenessExplanationCopy };

/**
 * Cue text is stored with the company. A missing next step is not a meeting,
 * so the sheet does not tell you to finish one.
 */
/** Stages where an empty next step is a real gap. A new company is a prospect. */
export function relationshipNeedsDatedNextStep(lifecycle: string): boolean {
  return (
    lifecycle === "evaluation" ||
    lifecycle === "contracting" ||
    lifecycle === "onboarding" ||
    lifecycle === "renewal"
  );
}

/** A stored cue can still describe a blank company. Hide that one. */
export function liveCueVisible(cue: { kind: string }, lifecycle: string): boolean {
  if (cue.kind !== "missing_next_step") return true;
  return relationshipNeedsDatedNextStep(lifecycle);
}

export function liveCueCopy(cue: { kind: string; title: string; detail: string }): {
  title: string;
  detail: string;
} {
  if (cue.kind === "missing_next_step") {
    return {
      title: "No next step",
      detail: "Add an owner and a date for what happens next.",
    };
  }
  if (cue.kind === "contradiction") {
    const named = /^Which (.+) value should be current\?$/.exec(cue.detail.trim());
    const detail = named?.[1]
      ? `Which ${relationshipChangeLabel(named[1])} should be the current one?`
      : cue.detail.replace(/value should be current\?$/, "should be the current one?");
    return { title: "Two details disagree", detail };
  }
  return { title: cue.title, detail: cue.detail };
}

/**
 * Missing-detail text is stored for the model. The sheet says what the person
 * can do about it. A supported detail keeps the reason that was recorded.
 */
export function detailEvidenceCopy(item: {
  supported: boolean;
  reason?: string;
  missingReason?: string;
}): string {
  if (item.supported) return item.reason?.trim() || "";
  const missing = item.missingReason?.trim() ?? "";
  if (missing === "" || missing.includes("asOf boundary")) {
    return "Nothing connected has filled this in.";
  }
  if (missing.includes("no accessible source evidence reference")) {
    return "This detail has no source you can open.";
  }
  return missing;
}

/** Authority codes stay in the model. The sheet says who the detail came from. */
export function detailSourceLabel(authority: string | undefined, supported: boolean): string {
  if (!supported) return "Not filled in yet";
  switch (authority) {
    case "user_correction":
      return "Confirmed by a person";
    case "source_fact":
      return "From a connected source";
    case "deterministic":
      return "From a workspace rule";
    case "ai_inference":
      return "Suggested";
    case "external_research":
      return "Public research";
    default:
      return authority ? relationshipLabel(authority) : "Not filled in yet";
  }
}

function MissionControlOverview({
  model,
  commitments,
  emailThreadCount,
  busy,
  onAcknowledge,
  onRetract,
}: {
  model: MissionControlReadModel;
  commitments: readonly {
    status?: string;
    text?: string;
    acceptance?: string;
    dueAt?: string | null;
  }[];
  emailThreadCount: number;
  busy: boolean;
  onAcknowledge: () => void;
  onRetract: (assertionId: string, reason: string) => void;
}) {
  const tone = completenessTone(model.completeness.status);
  const supported = Object.values(model.evidence).filter((item) => item.supported).length;
  const openable = openableAccountDetailCount(model.evidence);
  const total = Object.keys(model.evidence).length;
  const reviewCopy = companyReviewCopy(model, reviewHasRecordedActivity(commitments));
  return (
    <section
      aria-labelledby="mission-control-heading"
      className="space-y-3"
      data-capability="mission-control evidence-inspection assertion-retraction"
    >
      <div
        className={`border p-3 ${
          tone === "safe"
            ? "border-emerald-500/30 bg-emerald-500/5"
            : tone === "caution"
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-red-500/30 bg-red-500/5"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 id="mission-control-heading" className="text-sm font-medium text-primary">
              {completenessHeading(model.completeness.status, supported)}
            </h3>
            <p className="mt-1 text-xs text-primary/60">
              {emailThreadCount > 0 && supported === 0
                ? `${emailThreadCount} Gmail ${emailThreadCount === 1 ? "thread is" : "threads are"} linked. Health and status still need a clearer source.`
                : missionControlGapCopy(model.completeness.explanation, supported, total)}
            </p>
          </div>
          <Badge variant="outline" className="rounded-none font-normal">
            {accountDetailSourceCopy(supported, total)}
          </Badge>
        </div>
        {model.completeness.unresolvedIdentityCount > 0 ? (
          <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
            {identityReviewBlockCopy(model.completeness.unresolvedIdentityCount)}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {MISSION_CONTROL_QUESTIONS.map((question) => {
          let answer = "No supported answer yet.";
          if (question.key === "state") {
            answer = missionControlStateAnswer(model.evidence, commitments);
          } else if (question.key === "change") {
            answer = model.changedSinceReview
              ? missionControlChangeAnswer(model.changes, "State changed")
              : reviewCopy.change;
          } else if (question.key === "evidence") {
            answer = accountDetailSourceCopy(openable, total, true);
          } else if (question.key === "action") {
            answer = missionControlActionAnswer(model.activeRecommendation, commitments);
          }
          return (
            <div key={question.key} className="border border-border p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-primary/45">
                {question.label}
              </p>
              <p className="mt-1 text-xs text-primary/75">{answer}</p>
            </div>
          );
        })}
      </div>

      <details className="border border-border p-3 text-xs">
        <summary className="cursor-pointer font-medium text-primary">
          See where each detail came from
        </summary>
        <ul className="mt-3 space-y-2">
          {Object.values(model.evidence).map((item) => (
            <li key={item.dimension} className="border-l border-border pl-3">
              <div className="flex flex-wrap items-center gap-2">
                <Label className="font-medium">
                  {RELATIONSHIP_DIMENSION_LABELS[item.dimension] ??
                    relationshipLabel(item.dimension)}
                </Label>
                <Badge variant="outline" className="rounded-none font-normal">
                  {detailSourceLabel(item.authority, item.supported)}
                </Badge>
                {!item.fresh ? (
                  <Badge className="font-normal text-amber-600" variant="outline">
                    Needs refresh
                  </Badge>
                ) : null}
              </div>
              {detailEvidenceCopy(item) ? (
                <p className="mt-1 text-primary/55">{detailEvidenceCopy(item)}</p>
              ) : null}
              {item.evidence.length ? (
                <p className="mt-1 text-primary/40">
                  {item.evidence
                    .map(
                      (ref) => `${activitySourceLabel(ref.source)} · ${relativeTime(ref.observedAt)}`,
                    )
                    .join("; ")}
                </p>
              ) : null}
              {item.authority === "user_correction" && item.assertionId ? (
                <CorrectionRetraction
                  assertionId={item.assertionId}
                  disabled={busy}
                  onRetract={onRetract}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </details>

      {model.changedSinceReview ? (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onAcknowledge}>
          <Check /> Mark as reviewed
        </Button>
      ) : reviewCopy.footer !== reviewCopy.change ? (
        <p className="text-[11px] text-primary/40">{reviewCopy.footer}</p>
      ) : null}
    </section>
  );
}

function CorrectionRetraction({
  assertionId,
  disabled,
  onRetract,
}: {
  assertionId: string;
  disabled: boolean;
  onRetract: (assertionId: string, reason: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="mt-2"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Retract correction
      </Button>
    );
  }
  return (
    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
      <Input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Why is this correction no longer valid?"
        aria-label="Correction retraction reason"
      />
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={disabled || !reason.trim()}
        onClick={() => onRetract(assertionId, reason.trim())}
      >
        Confirm retraction
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}

function ImportedTranscriptPublisher({
  relationshipId,
  disabled,
  onPublish,
}: {
  relationshipId: string;
  disabled: boolean;
  onPublish: (
    observation: ReturnType<typeof buildImportedTranscriptObservation>,
  ) => Promise<boolean>;
}) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [transcript, setTranscript] = React.useState("");
  const [disclosureConfirmed, setDisclosureConfirmed] = React.useState(false);
  const [occurredAt, setOccurredAt] = React.useState(() => new Date().toISOString());
  const disclosureId = React.useId();

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Import transcript
      </Button>
    );
  }

  return (
    <section
      className="space-y-2 border border-border p-3"
      data-capability="transcript-publication"
    >
      <SectionTitle title="Publish an imported transcript" />
      <p className="text-xs text-primary/55">
        Paste reviewed transcript text. Prefix lines with a speaker name and colon when known.
        The text stays with this company. It is not treated as a confirmed detail until you review it.
      </p>
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Conversation title"
        aria-label="Imported transcript title"
      />
      <DateTimePicker value={occurredAt} onChange={setOccurredAt} aria-label="Conversation time" />
      <Textarea
        value={transcript}
        onChange={(event) => setTranscript(event.target.value)}
        placeholder={"Avery: We can renew next week.\nYou: I will send the paperwork."}
        aria-label="Imported transcript text"
        className="min-h-40"
      />
      <label
        htmlFor={disclosureId}
        className="flex cursor-pointer items-start gap-2 text-xs text-primary/60"
      >
        <Checkbox
          id={disclosureId}
          className="mt-0.5"
          checked={disclosureConfirmed}
          onCheckedChange={(checked) => setDisclosureConfirmed(checked === true)}
        />
        <Label className="font-normal">
          I confirm this transcript may be stored under workspace policy and participants were
          notified where required.
        </Label>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled || !transcript.trim() || !occurredAt || !disclosureConfirmed}
          onClick={async () => {
            const published = await onPublish(
              buildImportedTranscriptObservation({
                relationshipId,
                title,
                transcript,
                occurredAt: new Date(occurredAt).toISOString(),
              }),
            );
            if (!published) return;
            setOpen(false);
            setTitle("");
            setTranscript("");
            setDisclosureConfirmed(false);
          }}
        >
          Save this transcript
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

export function RelationshipSheet({
  id,
  seed,
  position,
  total,
  filtered = false,
  hasMore = false,
  onClose,
  onError,
  onChanged,
}: {
  id: string;
  seed?: RevenueRelationship;
  position: number;
  total: number;
  filtered?: boolean;
  hasMore?: boolean;
  onClose: () => void;
  onError: (m: string) => void;
  onChanged: () => void;
}) {
  const [data, setData] = React.useState<RelationshipDetail | null>(null);
  const [timeline, setTimeline] = React.useState<RelationshipObservation[]>([]);
  const [communicationTimeline, setCommunicationTimeline] = React.useState<
    CommunicationTimelineItem[]
  >([]);
  const [communicationHasMore, setCommunicationHasMore] = React.useState(false);
  const [communicationCursor, setCommunicationCursor] = React.useState<
    TimelinePageCursor | undefined
  >();
  const [timelineHasMore, setTimelineHasMore] = React.useState(false);
  const [timelineCursor, setTimelineCursor] = React.useState<TimelinePageCursor | undefined>();
  const [loadingEarlier, setLoadingEarlier] = React.useState<"mail" | "activity" | null>(null);
  const [governanceExpanded, setGovernanceExpanded] = React.useState(false);
  const [changes, setChanges] = React.useState<RelationshipStateSnapshot[]>([]);
  const [changesHasMore, setChangesHasMore] = React.useState(false);
  const [historyFailed, setHistoryFailed] = React.useState(false);
  const [mailFailed, setMailFailed] = React.useState(false);
  const [changesFailed, setChangesFailed] = React.useState(false);
  const [duplicatesFailed, setDuplicatesFailed] = React.useState(false);
  const [attributesFailed, setAttributesFailed] = React.useState(false);
  const paneCompanyRef = React.useRef<string | null>(null);
  const [loadingEarlierChanges, setLoadingEarlierChanges] = React.useState(false);
  const [extraReviewItems, setExtraReviewItems] = React.useState<ConversationReviewItem[]>([]);
  const [extraReceipts, setExtraReceipts] = React.useState<
    NonNullable<RelationshipDetail["intelligence"]>["governanceReceipts"]
  >([]);
  const [evidenceReviewHasMore, setEvidenceReviewHasMore] = React.useState(false);
  const [evidenceReviewOffset, setEvidenceReviewOffset] = React.useState(0);
  const [loadingEarlierEvidence, setLoadingEarlierEvidence] = React.useState(false);
  const [sheetDuplicates, setSheetDuplicates] = React.useState(emptySheetDuplicatePages);
  const [loadingSheetDuplicates, setLoadingSheetDuplicates] = React.useState(false);
  const sheetIdRef = React.useRef(id);
  sheetIdRef.current = id;
  const sheetPending = React.useMemo(
    () => mergeIdentityPages(sheetDuplicates.pending, sheetDuplicates.extraPending),
    [sheetDuplicates.extraPending, sheetDuplicates.pending],
  );
  const sheetDeferred = React.useMemo(
    () => mergeIdentityPages(sheetDuplicates.deferred, sheetDuplicates.extraDeferred),
    [sheetDuplicates.deferred, sheetDuplicates.extraDeferred],
  );
  const sheetResolved = React.useMemo(
    () => mergeIdentityPages(sheetDuplicates.resolved, sheetDuplicates.extraResolved),
    [sheetDuplicates.extraResolved, sheetDuplicates.resolved],
  );
  const hasMoreSheetPending = sheetDuplicates.pendingHasMore;
  const hasMoreSheetDeferred = sheetDuplicates.deferredHasMore;
  const hasMoreSheetResolved = sheetDuplicates.resolvedHasMore;
  const hasMoreSheetDuplicates =
    hasMoreSheetPending || hasMoreSheetDeferred || hasMoreSheetResolved;
  const identityCandidates = [...sheetPending, ...sheetDeferred, ...sheetResolved];
  const sheetReviewItems = [...(data?.intelligence?.reviewItems ?? []), ...extraReviewItems];
  const sheetReceipts = [...(data?.intelligence?.governanceReceipts ?? []), ...extraReceipts];
  const [busy, setBusy] = React.useState<string | null>(null);
  const [evidence, setEvidence] = React.useState<Record<string, unknown>>({});
  const [personAttributes, setPersonAttributes] = React.useState<
    Record<string, RelationshipPersonAttribute[]>
  >({});
  const [confirmingPersonId, setConfirmingPersonId] = React.useState<string | null>(null);
  const [confirmingDeletion, setConfirmingDeletion] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [activeSection, setActiveSection] = React.useState<
    "overview" | "history" | "emails" | "commitments" | "people"
  >("overview");
  const askOppulence = useAskOppulence();
  const askedCompany = data?.relationship ?? seed;
  const liveCues = (data?.intelligence?.liveCues ?? []).filter((cue) =>
    liveCueVisible(cue, data?.relationship.lifecycle ?? ""),
  );

  const load = React.useCallback(async () => {
    const sameCompany = paneCompanyRef.current === id;
    if (!sameCompany) {
      paneCompanyRef.current = id;
      setTimeline([]);
      setCommunicationTimeline([]);
      setChanges([]);
      setTimelineHasMore(false);
      setCommunicationHasMore(false);
      setChangesHasMore(false);
      setTimelineCursor(undefined);
      setCommunicationCursor(undefined);
      setHistoryFailed(false);
      setMailFailed(false);
      setChangesFailed(false);
      setDuplicatesFailed(false);
      setAttributesFailed(false);
      setSheetDuplicates(emptySheetDuplicatePages());
      setPersonAttributes({});
    }
    setLoading(true);
    setLoadError(null);
    setLoadingSheetDuplicates(false);
    setExtraReviewItems([]);
    setExtraReceipts([]);
    setEvidenceReviewHasMore(false);
    setEvidenceReviewOffset(0);
    setLoadingEarlierEvidence(false);
    try {
      const nextData = await getRelationship(id);
      if (sheetIdRef.current !== id) return;
      setData(nextData);

      const [timelinePane, mailPane, changesPane, pendingPane, deferredPane, resolvedPane] =
        await Promise.all([
          captureSheetPane(() => getRelationshipTimelinePage(id)),
          captureSheetPane(() => getRelationshipCommunicationTimeline(id)),
          captureSheetPane(() => getRelationshipChanges(id)),
          captureSheetPane(() => listIdentityCandidates("pending", id)),
          captureSheetPane(() => listIdentityCandidates("deferred", id)),
          captureSheetPane(() => listIdentityCandidates("resolved", id)),
        ]);
      if (sheetIdRef.current !== id) return;
      setTimeline((current) =>
        applySheetPane({
          sameCompany,
          current,
          failed: !timelinePane.ok,
          next: timelinePane.ok ? timelinePane.value.observations : null,
        }),
      );
      if (timelinePane.ok) {
        setTimelineHasMore(timelinePane.value.hasMore);
        setTimelineCursor(pageCursor(timelinePane.value));
      } else if (!sameCompany) {
        setTimelineHasMore(false);
        setTimelineCursor(undefined);
      }
      setHistoryFailed(!timelinePane.ok);
      setCommunicationTimeline((current) =>
        applySheetPane({
          sameCompany,
          current,
          failed: !mailPane.ok,
          next: mailPane.ok ? mailPane.value.items : null,
        }),
      );
      if (mailPane.ok) {
        setCommunicationHasMore(mailPane.value.hasMore);
        setCommunicationCursor(pageCursor(mailPane.value));
      } else if (!sameCompany) {
        setCommunicationHasMore(false);
        setCommunicationCursor(undefined);
      }
      setMailFailed(!mailPane.ok);
      setChanges((current) =>
        applySheetPane({
          sameCompany,
          current,
          failed: !changesPane.ok,
          next: changesPane.ok ? changesPane.value.snapshots : null,
        }),
      );
      if (changesPane.ok) setChangesHasMore(changesPane.value.hasMore);
      else if (!sameCompany) setChangesHasMore(false);
      setChangesFailed(!changesPane.ok);
      setEvidenceReviewHasMore(Boolean(nextData.intelligence?.observationPageHasMore));
      setEvidenceReviewOffset(
        nextData.intelligence?.observationPageHasMore ? INTELLIGENCE_OBSERVATION_PAGE : 0,
      );
      setSheetDuplicates((current) => {
        const base = sameCompany ? current : emptySheetDuplicatePages();
        if (pendingPane.ok && deferredPane.ok && resolvedPane.ok) {
          return {
            ...emptySheetDuplicatePages(),
            pending: identityCandidateRows(pendingPane.value),
            deferred: identityCandidateRows(deferredPane.value),
            resolved: identityCandidateRows(resolvedPane.value),
            pendingHasMore: identityCandidatePageHasMore(pendingPane.value),
            deferredHasMore: identityCandidatePageHasMore(deferredPane.value),
            resolvedHasMore: identityCandidatePageHasMore(resolvedPane.value),
          };
        }
        return {
          ...base,
          pending: pendingPane.ok ? identityCandidateRows(pendingPane.value) : base.pending,
          deferred: deferredPane.ok ? identityCandidateRows(deferredPane.value) : base.deferred,
          resolved: resolvedPane.ok ? identityCandidateRows(resolvedPane.value) : base.resolved,
          extraPending: pendingPane.ok ? [] : base.extraPending,
          extraDeferred: deferredPane.ok ? [] : base.extraDeferred,
          extraResolved: resolvedPane.ok ? [] : base.extraResolved,
          pendingHasMore: pendingPane.ok
            ? identityCandidatePageHasMore(pendingPane.value)
            : base.pendingHasMore,
          deferredHasMore: deferredPane.ok
            ? identityCandidatePageHasMore(deferredPane.value)
            : base.deferredHasMore,
          resolvedHasMore: resolvedPane.ok
            ? identityCandidatePageHasMore(resolvedPane.value)
            : base.resolvedHasMore,
        };
      });
      setDuplicatesFailed(!pendingPane.ok || !deferredPane.ok || !resolvedPane.ok);
      const people = nextData.participants
        .map((participant) => participant.person?.id)
        .filter((personId): personId is string => Boolean(personId));
      const attributePanes = await Promise.all(
        [...new Set(people)].map(async (personId) => {
          const pane = await captureSheetPane(() => getPersonAttributes(personId));
          return [personId, pane] as const;
        }),
      );
      if (sheetIdRef.current !== id) return;
      setPersonAttributes((current) => {
        const next = sameCompany ? { ...current } : {};
        for (const [personId, pane] of attributePanes) {
          if (pane.ok) next[personId] = pane.value;
        }
        return next;
      });
      setAttributesFailed(attributePanes.some(([, pane]) => !pane.ok));
    } catch (error) {
      const message = errMessage(error, "Could not load this company.");
      setLoadError(message);
      // Keep the failure in the sheet. A missing optional pane used to
      // paint the page-level "Action needed" banner and leave this
      // surface stuck on its loading line.
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    setActiveSection("overview");
    setActionError(null);
    setConfirmingPersonId(null);
    setConfirmingDeletion(false);
    setGovernanceExpanded(false);
  }, [id]);

  const reportSheetFailure = (error: unknown, fallback: string) => {
    const message = errMessage(error, fallback);
    setActionError(message);
    onError(message);
  };

  const act = async (key: string, operation: () => Promise<unknown>): Promise<boolean> => {
    setBusy(key);
    setActionError(null);
    try {
      await operation();
      await load();
      onChanged();
      return true;
    } catch (error) {
      const message = errMessage(error, "Could not update this company.");
      setActionError(message);
      onError(message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const loadMoreSheetDuplicates = async () => {
    if (loadingSheetDuplicates || !hasMoreSheetDuplicates) return;
    const requestedId = id;
    setLoadingSheetDuplicates(true);
    try {
      const [nextPending, nextDeferred, nextResolved] = await Promise.all([
        hasMoreSheetPending
          ? fetchIdentityCandidates(
              "pending",
              id,
              undefined,
              sheetDuplicates.pending.length + sheetDuplicates.extraPending.length,
            )
          : Promise.resolve({ candidates: [] as RelationshipIdentityCandidate[], hasMore: false }),
        hasMoreSheetDeferred
          ? fetchIdentityCandidates(
              "deferred",
              id,
              undefined,
              sheetDuplicates.deferred.length + sheetDuplicates.extraDeferred.length,
            )
          : Promise.resolve({ candidates: [] as RelationshipIdentityCandidate[], hasMore: false }),
        hasMoreSheetResolved
          ? fetchIdentityCandidates(
              "resolved",
              id,
              undefined,
              sheetDuplicates.resolved.length + sheetDuplicates.extraResolved.length,
            )
          : Promise.resolve({ candidates: [] as RelationshipIdentityCandidate[], hasMore: false }),
      ]);
      if (sheetIdRef.current !== requestedId) return;
      setSheetDuplicates((current) => ({
        ...current,
        extraPending: hasMoreSheetPending
          ? appendById(current.extraPending, identityCandidateRows(nextPending))
          : current.extraPending,
        extraDeferred: hasMoreSheetDeferred
          ? appendById(current.extraDeferred, identityCandidateRows(nextDeferred))
          : current.extraDeferred,
        extraResolved: hasMoreSheetResolved
          ? appendById(current.extraResolved, identityCandidateRows(nextResolved))
          : current.extraResolved,
        pendingHasMore: hasMoreSheetPending
          ? identityCandidatePageHasMore(nextPending)
          : current.pendingHasMore,
        deferredHasMore: hasMoreSheetDeferred
          ? identityCandidatePageHasMore(nextDeferred)
          : current.deferredHasMore,
        resolvedHasMore: hasMoreSheetResolved
          ? identityCandidatePageHasMore(nextResolved)
          : current.resolvedHasMore,
      }));
    } catch (error) {
      reportSheetFailure(error, "Could not load the next duplicates.");
    } finally {
      if (sheetIdRef.current === requestedId) setLoadingSheetDuplicates(false);
    }
  };

  const loadEarlierChanges = async () => {
    if (!changesHasMore || loadingEarlierChanges) return;
    setLoadingEarlierChanges(true);
    try {
      const page = await getRelationshipChanges(id, changes.length);
      setChanges((current) => appendById(current, page.snapshots));
      setChangesHasMore(page.hasMore);
    } catch (error) {
      reportSheetFailure(error, "Could not load earlier changes.");
    } finally {
      setLoadingEarlierChanges(false);
    }
  };

  const loadEarlierEvidence = async () => {
    if (!evidenceReviewHasMore || loadingEarlierEvidence) return;
    const requestedId = id;
    const offset = evidenceReviewOffset;
    setLoadingEarlierEvidence(true);
    try {
      const page = await getRelationshipConversationReview(id, offset);
      if (sheetIdRef.current !== requestedId) return;
      setExtraReviewItems((current) => appendById(current, page.reviewItems));
      setExtraReceipts((current) =>
        appendByKey(current, page.governanceReceipts, (receipt) => receipt.receiptId),
      );
      setEvidenceReviewHasMore(page.hasMore);
      setEvidenceReviewOffset(offset + INTELLIGENCE_OBSERVATION_PAGE);
    } catch (error) {
      reportSheetFailure(error, "Could not load earlier evidence.");
    } finally {
      if (sheetIdRef.current === requestedId) setLoadingEarlierEvidence(false);
    }
  };

  const loadEarlier = async (kind: "mail" | "activity") => {
    const cursor = kind === "mail" ? communicationCursor : timelineCursor;
    if (!cursor?.before || loadingEarlier) return;
    setLoadingEarlier(kind);
    try {
      if (kind === "mail") {
        const page = await getRelationshipCommunicationTimeline(id, 50, cursor);
        setCommunicationTimeline((current) => appendById(current, page.items));
        setCommunicationHasMore(page.hasMore);
        setCommunicationCursor(pageCursor(page));
      } else {
        const page = await getRelationshipTimelinePage(id, 50, cursor);
        setTimeline((current) => appendById(current, page.observations));
        setTimelineHasMore(page.hasMore);
        setTimelineCursor(pageCursor(page));
      }
    } catch (error) {
      reportSheetFailure(
        error,
        kind === "mail"
          ? "Could not load earlier mail and meetings."
          : "Could not load earlier activity.",
      );
    } finally {
      setLoadingEarlier(null);
    }
  };

  const revealEvidence = async (observation: RelationshipObservation) => {
    if (observation.id in evidence) {
      setEvidence((current) => {
        const next = { ...current };
        delete next[observation.id];
        return next;
      });
      return;
    }
    try {
      const result = await getRelationshipEvidence(id, observation.id);
      setEvidence((current) => ({ ...current, [observation.id]: result.payload }));
    } catch (error) {
      reportSheetFailure(error, "Could not open the original detail.");
    }
  };

  const openSection = (section: typeof activeSection) => {
    setActiveSection(section);
    document
      .getElementById(`${id}:${section}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const primaryContact = data?.participants.find((participant) => participant.email);
  const composeHref = data
    ? companyEmailHref(primaryContact?.email || data.relationship.primaryEmail)
    : null;
  const companyEmail = data ? companyEmailDetail(data.relationship.primaryEmail) : null;
  const companyLinkedIn = data
    ? companyLinkedInAction(
        companyName(data.relationship),
        data.relationship.resourceRefs,
        data.relationship.linkedinUrl,
      )
    : null;
  const companySource = data
    ? Object.values(data.relationship.companyEnrichmentRefs ?? {})
        .flat()
        .map(safeResearchCitationURL)
        .find((url): url is string => Boolean(url))
    : undefined;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        data-record-overlay="screen"
        overlayClassName="bg-transparent"
        closeButtonClassName="left-4 right-auto"
        className="left-0 flex w-full flex-col gap-0 overflow-hidden border-l-0 p-0 shadow-none sm:max-w-none md:left-[var(--shell-sidebar-screen-offset)] md:w-[calc(100%-var(--shell-sidebar-screen-offset))]"
      >
        <SheetHeader className="min-h-12 flex-row items-center border-b border-border py-2 pl-14 pr-3">
          <SheetTitle className="text-xs font-normal text-primary/55">
            {data || seed
              ? companySheetPositionLabel(position, total, filtered, hasMore)
              : "Company"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {data?.relationship.primaryEmail}
            {data?.relationship.accountDomain?.trim()
              ? ` · ${data.relationship.accountDomain.trim()}`
              : ""}
          </SheetDescription>
          <Button
            className="ml-auto h-7 px-2 text-xs font-normal"
            onClick={() => askOppulence(askedCompany ? companyName(askedCompany) : undefined)}
            size="sm"
            type="button"
            variant="outline"
          >
            Ask Oppulence
          </Button>
        </SheetHeader>
        {actionError ? (
          <p
            className="border-b border-destructive/30 px-4 py-2 text-sm text-destructive"
            role="alert"
          >
            {actionError}
          </p>
        ) : null}
        {!data ? (
          <div className="flex flex-col gap-3 px-4 py-6">
            {seed ? (
              <div>
                <h2 className="truncate text-lg font-semibold text-primary">{companyName(seed)}</h2>
                <p className="truncate text-xs text-primary/45">
                  {seed.accountDomain?.trim() || seed.primaryEmail?.trim() || "Company"}
                </p>
              </div>
            ) : null}
            {loadError && !loading ? (
              <>
                <p className="text-sm text-destructive">{loadError}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" type="button" variant="outline" onClick={() => void load()}>
                    Retry
                  </Button>
                  <Button size="sm" type="button" variant="ghost" onClick={onClose}>
                    Close
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-primary/50">Loading this company…</p>
            )}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 md:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="border-b border-border px-4 py-5 md:border-r md:border-b-0">
              <section>
                <div className="flex items-center gap-3">
                  <Avatar className="size-10 rounded-none">
                    <AvatarFallback className="rounded-none border border-border bg-background-100 text-xs font-semibold text-primary/60">
                      {companyName(data.relationship).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-primary">
                      {companyName(data.relationship)}
                    </h2>
                    <p className="truncate text-xs text-primary/45">
                      {companyDomainHref(data.relationship.accountDomain) ? (
                        <a
                          className="underline-offset-2 hover:underline"
                          href={companyDomainHref(data.relationship.accountDomain) ?? undefined}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {companyDomainLabel(data.relationship.accountDomain)}
                        </a>
                      ) : (
                        data.relationship.accountDomain?.trim() ||
                        data.relationship.primaryEmail?.trim() ||
                        "Company"
                      )}
                    </p>
                  </div>
                </div>
                {composeHref ? (
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="mt-4 w-full justify-center"
                  >
                    <a href={composeHref}>
                      <EnvelopeSimple /> Compose email
                    </a>
                  </Button>
                ) : null}
              </section>
              <section className="mt-5 border-t border-border pt-4">
                <p className="mb-3 text-xs font-medium text-primary/55">Record details</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="rounded-none">
                    Lifecycle ·{" "}
                    {supportedRecordValue(
                      data.relationship.lifecycle,
                      data.missionControl.evidence.lifecycle,
                    )}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`rounded-none ${HEALTH_TONE[data.relationship.health]}`}
                  >
                    Health ·{" "}
                    {supportedRecordValue(
                      data.relationship.health,
                      data.missionControl.evidence.health,
                    )}
                  </Badge>
                  <Badge variant="secondary">
                    Engagement ·{" "}
                    {supportedRecordValue(
                      data.relationship.engagement,
                      data.missionControl.evidence.engagement,
                    )}
                  </Badge>
                  <Badge variant="secondary">
                    Sentiment ·{" "}
                    {supportedRecordValue(
                      data.relationship.sentiment,
                      data.missionControl.evidence.sentiment,
                    )}
                  </Badge>
                </div>
                <dl className="mt-5 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-3 text-xs">
                  <dt className="text-primary/40">Domain</dt>
                  <dd className="truncate text-primary/75">
                    {companyDomainHref(data.relationship.accountDomain) ? (
                      <a
                        className="underline-offset-2 hover:underline"
                        href={companyDomainHref(data.relationship.accountDomain) ?? undefined}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {companyDomainLabel(data.relationship.accountDomain)}
                      </a>
                    ) : (
                      companyDomainLabel(data.relationship.accountDomain)
                    )}
                  </dd>
                  <dt className="text-primary/40">Email</dt>
                  <dd className="truncate text-primary/75">
                    {companyEmail?.href ? (
                      <a className="underline-offset-2 hover:underline" href={companyEmail.href}>
                        {companyEmail.text}
                      </a>
                    ) : (
                      companyEmail?.text
                    )}
                  </dd>
                  <dt className="text-primary/40">Company</dt>
                  {/* The name is whatever was saved. capitalize turned "acme harbor" into "Acme Harbor". */}
                  <dd className="text-primary/75">{companyName(data.relationship)}</dd>
                  <dt className="text-primary/40">Categories</dt>
                  <dd className="text-primary/75">
                    {companyCategoriesLabel(data.relationship.categories)}
                  </dd>
                  <dt className="text-primary/40">Description</dt>
                  <dd className="text-primary/75">
                    {companyDescriptionCopy(data.relationship)}
                  </dd>
                  <dt className="text-primary/40">LinkedIn</dt>
                  <dd className="text-primary/75">
                    <a
                      className="underline-offset-2 hover:underline"
                      href={companyLinkedIn?.href}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {companyLinkedIn?.label}
                    </a>
                  </dd>
                  {companySource ? (
                    <>
                      <dt className="text-primary/40">Source</dt>
                      <dd className="text-primary/75">
                        <a
                          className="underline-offset-2 hover:underline"
                          href={companySource}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Check the source
                        </a>
                      </dd>
                    </>
                  ) : null}
                  {Object.entries(data.relationship.companyEnrichmentData ?? {})
                    .filter(
                      ([field]) =>
                        ![
                          "industry_category",
                          "company_description",
                          "linkedin_company_url",
                        ].includes(field),
                    )
                    .map(([field, value]) => {
                      const source = (data.relationship.companyEnrichmentRefs?.[field] ?? [])
                        .map(safeResearchCitationURL)
                        .find((url): url is string => Boolean(url));
                      return (
                        <React.Fragment key={field}>
                          <dt className="text-primary/40">
                            {COMPANY_FIELD_LABELS[field] ?? humanize(field)}
                          </dt>
                          <dd className="text-primary/75">
                            {value}
                            {source ? (
                              <a
                                className="ml-2 text-[11px] text-primary/40 underline-offset-2 hover:underline"
                                href={source}
                                rel="noreferrer"
                                target="_blank"
                              >
                                source
                              </a>
                            ) : null}
                          </dd>
                        </React.Fragment>
                      );
                    })}
                  <dt className="text-primary/40">People</dt>
                  <dd className="text-primary/75">{data.participants.length}</dd>
                  <dt className="text-primary/40">Lifecycle</dt>
                  <dd className="text-primary/75">
                    {supportedRecordValue(
                      data.relationship.lifecycle,
                      data.missionControl.evidence.lifecycle,
                    )}
                  </dd>
                  <dt className="text-primary/40">Health</dt>
                  <dd className="text-primary/75">
                    {supportedRecordValue(
                      data.relationship.health,
                      data.missionControl.evidence.health,
                    )}
                  </dd>
                  <dt className="text-primary/40">Engagement</dt>
                  <dd className="text-primary/75">
                    {supportedRecordValue(
                      data.relationship.engagement,
                      data.missionControl.evidence.engagement,
                    )}
                  </dd>
                  <dt className="text-primary/40">Sentiment</dt>
                  <dd className="text-primary/75">
                    {supportedRecordValue(
                      data.relationship.sentiment,
                      data.missionControl.evidence.sentiment,
                    )}
                  </dd>
                  <dt className="text-primary/40">Last activity</dt>
                  <dd className="text-primary/75">
                    {companyLastActivityLabel(data.relationship.lastTouchAt)}
                  </dd>
                </dl>
              </section>
            </aside>

            <div className="min-w-0 overflow-y-auto">
              <nav className="sticky top-0 z-10 flex h-12 items-center gap-1 border-b border-border bg-background px-4 text-xs">
                {/* Activity is the history log. Email threads is the Gmail list.
                    They used to scroll to the same place. Overview used to
                    stay highlighted after those clicks. */}
                {(
                  [
                    ["overview", "Overview"],
                    ["history", "Activity"],
                    ["emails", `Email threads ${data.emailThreads.length}`],
                    ["commitments", `Promises ${data.commitments.length}`],
                    ["people", `People ${data.participants.length}`],
                  ] as const
                ).map(([section, label]) => (
                  <Button
                    aria-current={activeSection === section ? "page" : undefined}
                    className={
                      activeSection === section
                        ? "h-auto rounded-none bg-background-200 px-3 py-1.5 text-primary"
                        : "h-auto rounded-none px-3 py-1.5 text-primary/50 hover:text-primary"
                    }
                    key={section}
                    onClick={() => openSection(section)}
                    type="button"
                    variant={activeSection === section ? "secondary" : "ghost"}
                  >
                    {label}
                  </Button>
                ))}
              </nav>
              <div id={`${id}:overview`} className="flex scroll-mt-14 flex-col gap-6 px-5 py-5">
                {(() => {
                  const attention = accountAttentionFromHealth(data.relationship.health);
                  const preview = mapCommitmentsToAccountTimeline(data.commitments, 3);
                  const hiddenCommitments = data.commitments.length - preview.length;
                  return (
                    <>
                      <AccountMissionControlSurface
                        accountName={companyName(data.relationship)}
                        attentionLabel={attention?.label}
                        attentionVariant={attention?.variant}
                        items={preview}
                      />
                      {hiddenCommitments > 0 ? (
                        <Button
                          className="mt-2"
                          onClick={() => openSection("commitments")}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {commitmentPreviewRemainder(hiddenCommitments)}
                        </Button>
                      ) : null}
                    </>
                  );
                })()}

                <p className="text-xs font-medium text-primary/55">Highlights</p>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {[
                    [
                      "Lifecycle",
                      supportedRecordValue(
                        data.relationship.lifecycle,
                        data.missionControl.evidence.lifecycle,
                      ),
                    ],
                    [
                      "Health",
                      supportedRecordValue(
                        data.relationship.health,
                        data.missionControl.evidence.health,
                      ),
                    ],
                    [
                      "Engagement",
                      supportedRecordValue(
                        data.relationship.engagement,
                        data.missionControl.evidence.engagement,
                      ),
                    ],
                    [
                      "Sentiment",
                      supportedRecordValue(
                        data.relationship.sentiment,
                        data.missionControl.evidence.sentiment,
                      ),
                    ],
                    [
                      "Last activity",
                      companyLastActivityLabel(data.relationship.lastTouchAt),
                    ],
                    ["People", String(data.participants.length)],
                    ["Email threads", String(data.emailThreads.length)],
                    ["Open promises", String(openCommitmentCount(data.commitments))],
                  ].map(([label, value]) => (
                    <div key={label} className="min-h-24 rounded-none border border-border p-3">
                      <p className="text-[11px] text-primary/40">{label}</p>
                      <p className="mt-5 text-sm font-medium text-primary">{value}</p>
                    </div>
                  ))}
                </div>

                <section id={`${id}:emails`} className="scroll-mt-16">
                  <SectionTitle title={`Email threads (${data.emailThreads.length})`} />
                  {data.emailThreads.length === 0 ? (
                    <EmptyText>
                      {emailActivityEmptyCopy(timeline.some((item) => item.source === "meeting"))}
                    </EmptyText>
                  ) : (
                    <ul className="flex flex-col divide-y divide-primary/10 rounded-none border border-border">
                      {data.emailThreads.map((thread) => (
                        <li key={thread.id} className="flex items-start justify-between gap-4 p-3">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-primary">
                              {mailThreadSubjectLabel(thread.subject)}
                            </p>
                            <p className="mt-1 truncate text-[11px] text-primary/45">
                              {mailThreadPartyLabel(thread.counterpartyEmail)} ·{" "}
                              {mailMessageCountLabel(thread.messageCount)}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[11px] text-primary/55">
                              {mailReplyLabel(thread.replyState)}
                            </p>
                            <p className="mt-1 text-[11px] text-primary/35">
                              {thread.lastActivityAt
                                ? relativeTime(thread.lastActivityAt)
                                : "Unknown date"}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <MissionControlOverview
                  model={data.missionControl}
                  commitments={data.commitments}
                  emailThreadCount={data.emailThreads.length}
                  busy={Boolean(busy)}
                  onAcknowledge={() =>
                    act("acknowledge", () =>
                      acknowledgeMissionControl(
                        id,
                        data.missionControl.stateVersion,
                        data.missionControl.stateHash,
                      ),
                    )
                  }
                  onRetract={(assertionId, reason) =>
                    void act(`retract:${assertionId}`, () =>
                      retractRelationshipAssertion(id, assertionId, reason),
                    )
                  }
                />

                {duplicatesFailed ? (
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <EmptyText>
                      {identityCandidates.length > 0
                        ? sheetPaneRefreshCopy("duplicates")
                        : sheetPaneFailureCopy("Duplicates")}
                    </EmptyText>
                    <Button onClick={() => void load()} size="sm" type="button" variant="outline">
                      Try again
                    </Button>
                  </div>
                ) : null}
                <IdentityReviewInbox
                  candidates={identityCandidates}
                  hasMore={hasMoreSheetDuplicates}
                  loadingMore={loadingSheetDuplicates}
                  onLoadMore={() => void loadMoreSheetDuplicates()}
                  onError={onError}
                  onChanged={() => {
                    void load();
                    onChanged();
                  }}
                />

                <StateCorrection
                  key={data.relationship.stateVersion}
                  relationship={data.relationship}
                  disabled={Boolean(busy)}
                  onCorrect={(dimension, value, reason) =>
                    act(`correct:${dimension}`, () =>
                      correctRelationship(id, { dimension, value, reason }),
                    )
                  }
                />

                <ImportedTranscriptPublisher
                  relationshipId={id}
                  disabled={Boolean(busy)}
                  onPublish={(observation) =>
                    act("publish-transcript", () => ingestRelationshipObservations([observation]))
                  }
                />

                {data.intelligence ? (
                  <CorrectionReview
                    items={sheetReviewItems}
                    hasMore={evidenceReviewHasMore}
                    loadingMore={loadingEarlierEvidence}
                    onLoadMore={() => void loadEarlierEvidence()}
                    disabled={Boolean(busy)}
                    onCorrect={(item, correctedValue) =>
                      act(`review:${item.id}`, () =>
                        correctConversationReview(id, {
                          reviewItemId: item.id,
                          correctedValue,
                          reason: "User corrected conversation evidence during focused review.",
                        }),
                      )
                    }
                    onDecide={(item, kind, correctedValue, deferUntil) =>
                      act(`review:${item.id}:${kind}`, () =>
                        decideConversationReview(id, {
                          reviewItemId: item.id,
                          kind,
                          correctedValue,
                          deferUntil,
                          reason: "User decided a proposed conversation change.",
                        }),
                      )
                    }
                  />
                ) : null}

                {liveCues.length ? (
                  <section>
                    <SectionTitle title={`Suggestions (${liveCues.length})`} />
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {liveCues.map((cue) => {
                        const copy = liveCueCopy(cue);
                        return (
                          <li
                            key={cue.id}
                            className="rounded-none border border-amber-500/30 bg-amber-500/5 p-3"
                          >
                            <p className="text-xs font-medium text-primary">{copy.title}</p>
                            <p className="mt-1 text-xs text-primary/60">{copy.detail}</p>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : null}

                <TwoColumnList
                  leftTitle="Risks"
                  left={data.relationship.risks}
                  rightTitle="Milestones"
                  right={data.relationship.milestones}
                />

                {data.intelligence?.effectivePolicy ? (
                  <div
                    className="border border-border p-3 text-xs text-primary/60"
                    data-capability="privacy-deletion"
                  >
                    <details>
                      <summary className="cursor-pointer font-medium text-primary">
                        Privacy
                      </summary>
                      <div className="mt-2 grid gap-1 sm:grid-cols-2">
                        <Badge className="justify-start font-normal" variant="secondary">
                          Capture: {capturePolicyLabel(data.intelligence.effectivePolicy.capture)}
                        </Badge>
                        <Badge className="justify-start font-normal" variant="secondary">
                          Retention: {data.intelligence.effectivePolicy.retentionDays} days
                        </Badge>
                        <Badge className="justify-start font-normal" variant="secondary">
                          {evidencePublicationLabel(data.intelligence.effectivePolicy.publishEvidence)}
                        </Badge>
                        <Badge className="justify-start font-normal" variant="secondary">
                          {externalPlanShareLabel(data.intelligence.effectivePolicy.externalShare)}
                        </Badge>
                      </div>
                      <p className="mt-2 text-[11px]">
                        {privacyDecisionCopy(data.intelligence.governanceDecisions.length)}
                      </p>
                      {data.intelligence.deletionReceipts[0] ? (
                        <p className="mt-1">
                          Last deletion: {deletionReceiptStatusLabel(data.intelligence.deletionReceipts[0].status)}
                        </p>
                      ) : null}
                    </details>
                    {conversationDeletionAvailable({
                      emailThreads: data.emailThreads.length,
                      meetingsAndMail: communicationTimeline.length,
                      commitments: data.commitments.length,
                      conversationNotes: conversationNoteCount(timeline.map((item) => item.source)),
                    }) ? (
                      confirmingDeletion ? (
                        <div className="mt-3 space-y-2">
                          <p className="text-[12px] text-primary/70">
                            {deleteConversationConfirmCopy()}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy === "delete-conversation"}
                              onClick={() => {
                                void act("delete-conversation", () =>
                                  requestConversationDeletion(id, crypto.randomUUID()),
                                ).then(() => setConfirmingDeletion(false));
                              }}
                            >
                              Confirm delete
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={busy !== null}
                              onClick={() => setConfirmingDeletion(false)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-3"
                          disabled={busy !== null}
                          onClick={() => setConfirmingDeletion(true)}
                        >
                          Delete conversation data
                        </Button>
                      )
                    ) : (
                      <p className="mt-3 text-[11px] text-primary/45">No mail or meeting data to delete.</p>
                    )}
                  </div>
                ) : null}

                <section data-capability="commitment-management">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <SectionTitle
                      title={promiseFollowUpTitle(
                        data.intelligence?.recoveryEvaluations.length ?? 0,
                        atRiskPromiseCount(data.commitments),
                      )}
                    />
                    {/* No promises means there is nothing to reconcile. */}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy === "recovery" || data.commitments.length === 0}
                      onClick={() => void act("recovery", () => runCommitmentRecovery(id))}
                    >
                      {busy === "recovery" ? <Spinner className="size-4" /> : null}
                      Reconcile now
                    </Button>
                  </div>
                  {data.intelligence?.recoveryEvaluations.length ? (
                    <ul className="space-y-2">
                      {data.intelligence.recoveryEvaluations.map((evaluation) => (
                        <li
                          key={evaluation.evaluationId}
                          className="border border-border p-3 text-xs"
                        >
                          <p className="font-medium text-primary">
                            {recoveryClassificationLabel(evaluation.classification)}
                          </p>
                          <p className="mt-1 text-primary/60">
                            {recoveryExplanationCopy(evaluation.classification, evaluation.explanation)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyText>
                      {promiseFollowUpEmptyCopy(
                        atRiskPromiseCount(data.commitments),
                        overduePromiseCount(data.commitments),
                      )}
                    </EmptyText>
                  )}
                  {data.intelligence?.recommendationEvaluations.length ? (
                    <details className="mt-2 text-xs text-primary/55">
                      <summary className="cursor-pointer">Inspect ranking factors</summary>
                      {data.intelligence.recommendationEvaluations.map((evaluation) => (
                        <ul
                          key={evaluation.evaluationId}
                          className="mt-2 border-l border-border pl-3"
                        >
                          {evaluation.factors.map((factor) => (
                            <li key={factor.factor}>
                              {rankingFactorLabel(factor.factor)}: {factor.contribution >= 0 ? "+" : ""}
                              {factor.contribution} · {rankingFactorReason(factor.reason)}
                            </li>
                          ))}
                        </ul>
                      ))}
                    </details>
                  ) : null}
                </section>

                <section data-capability="governed-actions">
                  <SectionTitle title={`Recommendations (${data.recommendations.length})`} />
                  {data.recommendations.length === 0 ? (
                    <EmptyText>{missionControlActionAnswer(null, data.commitments)}</EmptyText>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {data.recommendations.map((action) => (
                        <li key={action.id} className="rounded-none border border-border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-primary">
                                {ACTION_TYPE_LABELS[action.actionType] ?? humanize(action.actionType)}
                              </p>
                              <p className="mt-1 text-xs text-primary/60">
                                {actionReasonCopy(action.reason)}
                              </p>
                            </div>
                            <ModeChip mode={action.executionMode} />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-primary/40">
                            <Badge className="font-normal" variant="outline">
                              {attentionReasonLabel(action.detector)}
                            </Badge>
                            <Badge className="font-normal" variant="secondary">
                              {recommendationPriorityLabel(action.priorityScore)}
                            </Badge>
                            <Badge className="font-normal" variant="secondary">
                              {recommendationPolicyLabel(action.policyStatus)}
                            </Badge>
                          </div>
                          {action.evidence.length > 0 ? (
                            <details className="mt-2 text-xs text-primary/55">
                              <summary className="cursor-pointer">Inspect supporting words</summary>
                              <ul className="mt-2 space-y-1 border-l border-border pl-3">
                                {action.evidence.map((item) => (
                                  <li key={item.id}>
                                    “{evidenceExcerptLabel(item.excerpt)}”
                                  </li>
                                ))}
                              </ul>
                            </details>
                          ) : null}
                          {action.approvalStatus === "pending" ? (
                            <div className="mt-3 flex gap-2">
                              <Button
                                size="sm"
                                onClick={() =>
                                  void act(`approve:${action.id}`, () =>
                                    approveRecommendation(action.id),
                                  )
                                }
                                disabled={Boolean(busy)}
                              >
                                {busy === `approve:${action.id}` ? (
                                  <Spinner className="size-4" />
                                ) : (
                                  <Check />
                                )}
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  void act(`reject:${action.id}`, () =>
                                    rejectRecommendation(action.id, "Not the right next move"),
                                  )
                                }
                                disabled={Boolean(busy)}
                              >
                                <X /> Reject
                              </Button>
                            </div>
                          ) : (
                            <Badge variant="secondary" className="mt-3">
                              {recommendationApprovalLabel(action.approvalStatus)}
                            </Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <div className="grid gap-5 sm:grid-cols-2">
                  <section
                    id={`${id}:people`}
                    className="scroll-mt-16"
                    data-capability="person-management"
                  >
                    <SectionTitle title={`People (${data.participants.length})`} />
                    {attributesFailed ? (
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <EmptyText>
                          {Object.values(personAttributes).some((rows) => rows.length > 0)
                            ? sheetPaneRefreshCopy("profile details")
                            : sheetPaneFailureCopy("Profile details")}
                        </EmptyText>
                        <Button
                          onClick={() => void load()}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Try again
                        </Button>
                      </div>
                    ) : null}
                    {data.participants.length === 0 ? (
                      <EmptyText>None recorded.</EmptyText>
                    ) : (
                      <ul className="flex flex-col gap-1.5" aria-label="People">
                        {data.participants.map((participant) => {
                          const person = participant.person;
                          const departed = person?.employmentStatus === "departed";
                          const profile = personSheetProfile({
                            title: person?.title,
                            fallbackTitle: participant.title,
                            company: person ? personCompanyTitle(person) : undefined,
                            seniority: person ? personSeniorityLabel(person.seniority) : undefined,
                            location: person?.location,
                          });
                          const cited = (personAttributes[person?.id ?? ""] ?? []).filter(
                            (attribute) =>
                              attribute.sourceType === "external_research" &&
                              attribute.status !== "retracted",
                          );
                          const name = personParticipantLabel(participant);
                          return (
                            <li
                              key={participant.id}
                              className="flex items-start justify-between gap-2 border border-border p-2 text-xs"
                            >
                              <div className={`min-w-0 ${departed ? "text-primary/50" : ""}`}>
                                <p className="font-medium text-primary">
                                  {name}
                                  {participant.role
                                    ? ` · ${participantRoleLabel(participant.role)}`
                                    : ""}
                                  {departed ? (
                                    <Badge variant="secondary" className="ml-2">
                                      Left the company
                                    </Badge>
                                  ) : null}
                                </p>
                                <p className="mt-1 text-primary/60">
                                  {profile.length
                                    ? profile.join(" · ")
                                    : "No profile details yet"}
                                </p>
                                <p className="mt-1 text-[10px] uppercase tracking-wide text-primary/40">
                                  {profile.length}/4 profile fields
                                </p>
                                {cited.length ? (
                                  <details className="mt-2">
                                    <summary className="cursor-pointer text-primary/60">
                                      Public research · {cited.length}{" "}
                                      {cited.length === 1 ? "detail" : "details"}
                                    </summary>
                                    <ul className="mt-1 space-y-1 border-l border-border pl-2">
                                      {cited.map((attribute) => (
                                        <li key={attribute.id}>
                                          <Badge className="font-normal" variant="outline">
                                            {personEvidenceLabel(attribute.dimension)}
                                          </Badge>
                                          : {personFactValue(attribute.dimension, attribute.value)}
                                          {` · ${Math.round(attribute.confidence * 100)}% confidence`}
                                          {(attribute.citations ?? []).map((citation, index) => {
                                            const href = safeResearchCitationURL(citation.url);
                                            return href ? (
                                              <a
                                                key={`${attribute.id}:${index}`}
                                                className="ml-1 text-oppulence-orange underline underline-offset-2"
                                                href={href}
                                                target="_blank"
                                                rel="noreferrer"
                                              >
                                                {citation.title || `Source ${index + 1}`}
                                              </a>
                                            ) : null;
                                          })}
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                ) : null}
                              </div>
                              {person?.id ? (
                                confirmingPersonId === person.id ? (
                                  <div className="flex max-w-xs shrink-0 flex-col items-end gap-2">
                                    <p className="text-right text-[12px] text-primary/70">
                                      {removePersonConfirmCopy(name)}
                                    </p>
                                    <div className="flex gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={busy === `delete-person:${person.id}`}
                                        onClick={() => {
                                          const personId = person.id;
                                          void act(`delete-person:${personId}`, () =>
                                            deletePerson(personId),
                                          ).then(() => setConfirmingPersonId(null));
                                        }}
                                      >
                                        Confirm remove
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        disabled={busy !== null}
                                        onClick={() => setConfirmingPersonId(null)}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="shrink-0"
                                    disabled={busy !== null}
                                    onClick={() => setConfirmingPersonId(person.id)}
                                  >
                                    Remove
                                  </Button>
                                )
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                  <section id={`${id}:commitments`} className="scroll-mt-16">
                    <SectionTitle title={`Promises (${data.commitments.length})`} />
                    <AccountMissionControlSurface
                      accountName={companyName(data.relationship)}
                      className="mt-2"
                      items={mapCommitmentsToAccountTimeline(
                        data.commitments,
                        data.commitments.length,
                      )}
                      showHeader={false}
                    />
                  </section>
                </div>

                {data.commitmentDependencies.length ? (
                  <section>
                    <SectionTitle
                      title={promiseLinkTitle(data.commitmentDependencies.length)}
                    />
                    <ul className="mt-2 space-y-2 text-xs">
                      {data.commitmentDependencies.map((dependency) => {
                        const from = data.commitments.find(
                          (item) => item.id === dependency.fromCommitmentId,
                        );
                        const to = data.commitments.find(
                          (item) => item.id === dependency.toCommitmentId,
                        );
                        return (
                          <li key={dependency.dependencyId} className="border border-border p-3">
                            <Label className="font-normal">
                              {promiseLinkEndLabel(from?.text)}
                            </Label>
                            <Badge variant="secondary" className="mx-2">
                              {promiseLinkKindLabel(dependency.kind)}
                            </Badge>
                            <Label className="font-normal">
                              {promiseLinkEndLabel(to?.text)}
                            </Label>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : null}

                <section data-capability="mutual-action-plans">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <SectionTitle
                      title={`Mutual action plans (${data.intelligence?.mutualActionPlans.length ?? 0})`}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        Boolean(busy) ||
                        !data.commitments.some((item) => item.acceptance === "accepted")
                      }
                      onClick={() =>
                        void act("create-plan", () =>
                          createMutualActionPlan(
                            id,
                            data.commitments
                              .filter(
                                (item) => item.acceptance === "accepted" && item.status === "open",
                              )
                              .map((item) => item.id),
                          ),
                        )
                      }
                    >
                      {mutualPlanCreateLabel()}
                    </Button>
                  </div>
                  {data.commitments.some((item) => item.acceptance === "internally_confirmed") ? (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {data.commitments
                        .filter((item) => item.acceptance === "internally_confirmed")
                        .map((item) => (
                          <Button
                            key={item.id}
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={Boolean(busy)}
                            onClick={() =>
                              void act(`accept:${item.id}`, () =>
                                appendCommitmentTransition(id, item.id, {
                                  kind: "accepted",
                                  idempotencyKey: `user-accepted:${item.id}`,
                                  reason: "They accepted this promise.",
                                  evidenceRefs: [`user-decision:${item.id}:accepted`],
                                }),
                              )
                            }
                          >
                            {acceptedPromiseLabel(item.text)}
                          </Button>
                        ))}
                    </div>
                  ) : null}
                  {data.intelligence?.mutualActionPlans.length ? (
                    <ul className="space-y-2">
                      {data.intelligence.mutualActionPlans.map((plan) => (
                        <li key={plan.planId} className="border border-border p-3 text-xs">
                          <p className="font-medium text-primary">
                            {mutualPlanHeading(plan.status, plan.currentRevision.version)}
                          </p>
                          <ul className="mt-1 list-disc pl-4 text-primary/60">
                            {plan.currentRevision.items.map((item) => (
                              <li key={item.itemId}>
                                {mutualPlanItemLine(item.title, item.ownerParticipantRef)}
                              </li>
                            ))}
                          </ul>
                          <div className="mt-2 flex gap-1.5">
                            {plan.status === "draft" || plan.status === "revised" ? (
                              <Button
                                size="sm"
                                disabled={Boolean(busy)}
                                onClick={() =>
                                  void act(`approve-plan:${plan.planId}`, () =>
                                    approveMutualActionPlan(id, plan.planId),
                                  )
                                }
                              >
                                {mutualPlanApproveLabel()}
                              </Button>
                            ) : null}
                            {plan.status === "internally_approved" ? (
                              <Button
                                size="sm"
                                disabled={Boolean(busy)}
                                onClick={() =>
                                  void act(`share-plan:${plan.planId}`, () =>
                                    shareMutualActionPlan(id, plan.planId),
                                  )
                                }
                              >
                                {mutualPlanShareLabel()}
                              </Button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyText>{mutualPlanEmptyCopy()}</EmptyText>
                  )}
                </section>

                <section data-capability="contradiction-resolution">
                  <SectionTitle
                    title={relationshipChangeTitle(changes.length, changesHasMore, changesFailed)}
                  />
                  {data.intelligence?.delta.changes.length ? (
                    <ul className="mb-3 flex flex-col gap-2">
                      {data.intelligence.delta.changes.map((change) => (
                        <li
                          key={change.dimension}
                          className="rounded-none border border-border p-3"
                        >
                          <p className="text-xs font-medium text-primary">
                            {relationshipChangeLabel(change.dimension)}
                          </p>
                          <p className="mt-1 text-xs text-primary/60">
                            {relationshipDeltaValue(change.before)} → {relationshipDeltaValue(change.after)}
                          </p>
                          {change.reason ? (
                            <p className="mt-1 text-[11px] text-primary/40">{change.reason}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {data.intelligence?.contradictionCases.length ? (
                    <ul className="mb-3 space-y-2 rounded-none border border-amber-500/30 p-3 text-xs text-primary/60">
                      {data.intelligence.contradictionCases.map((item) => (
                        <li key={item.caseId}>
                          <Label className="font-medium text-primary">
                            {relationshipChangeLabel(item.dimension)}:
                          </Label>{" "}
                          {item.status === "open"
                            ? `Choose the current value from ${item.sides.length} sources.`
                            : contradictionReasonCopy(item.reason)}
                          <Badge className="ml-1 font-normal text-primary/40" variant="secondary">
                            ({item.sides.map((side) => contradictionSourceLabel(side.source)).join(" vs ")})
                          </Badge>
                          {item.status === "open" ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {item.sides.map((side) => (
                                <Button
                                  key={side.assertionId}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={busy === item.caseId}
                                  onClick={() =>
                                    void act(item.caseId, () =>
                                      resolveRelationshipContradiction(id, item.caseId, {
                                        selectedAssertionId: side.assertionId,
                                        reason: `You chose the value from ${contradictionSourceLabel(side.source)}.`,
                                      }),
                                    )
                                  }
                                >
                                  Use {relationshipDeltaValue(side.value)}
                                </Button>
                              ))}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {data.intelligence?.delta.uncertainClaimIds.length ? (
                    <p className="mb-3 text-xs text-primary/50">
                      {data.intelligence.delta.uncertainClaimIds.length} material claim
                      {data.intelligence.delta.uncertainClaimIds.length === 1
                        ? " remains"
                        : "s remain"}{" "}
                      uncertain and queued for focused review.
                    </p>
                  ) : null}
                  {data.intelligence?.delta.recommendationReason ? (
                    <p className="mb-3 rounded-none border border-border p-3 text-xs text-primary/60">
                      <Label className="font-medium text-primary">
                        Why the recommendation changed:
                      </Label>{" "}
                      {data.intelligence.delta.recommendationReason}
                    </p>
                  ) : null}
                  <SheetPaneStatus
                    count={changes.length}
                    empty={relationshipChangeEmptyCopy(
                      timeline.length > 0 || data.commitments.length > 0,
                    )}
                    failed={changesFailed}
                    noun="Changes"
                    onRetry={() => void load()}
                  >
                    <ul className="flex flex-col gap-2">
                      {changes.map((snapshot) => (
                        <li key={snapshot.id} className="flex gap-3 border-l border-border pl-3">
                          <ClockCounterClockwise className="mt-0.5 size-4 shrink-0 text-primary/35" />
                          <div>
                            <p className="text-xs text-primary/70">
                              {snapshot.changedDimensions.map(relationshipChangeLabel).join(", ")}
                            </p>
                            <p className="text-[11px] text-primary/35">
                              v{snapshot.version} · {relativeTime(snapshot.createdAt)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </SheetPaneStatus>
                  {changesHasMore ? (
                    <Button
                      className="mt-2"
                      disabled={loadingEarlierChanges}
                      onClick={() => void loadEarlierChanges()}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {loadingEarlierChanges ? "Loading…" : earlierChangesLabel()}
                    </Button>
                  ) : null}
                </section>

                {sheetReceipts.length ? (
                  <section>
                    <SectionTitle
                      title={`Consent and governance (${sheetReceipts.length})`}
                    />
                    <ul className="flex flex-col gap-2">
                      {(governanceExpanded
                        ? sheetReceipts
                        : sheetReceipts.slice(0, GOVERNANCE_RECEIPT_PAGE)
                      ).map((receipt) => (
                        <li
                          key={receipt.receiptId}
                          className="rounded-none border border-border p-3 text-xs text-primary/60"
                        >
                          <p>
                            {governanceCaptureLabel(receipt.capturePolicy)} ·{" "}
                            {governanceRouteLabel(receipt.routing)}
                          </p>
                          <p className="mt-1 text-[11px] text-primary/40">
                            {governancePlaceLabel(receipt.region)} ·{" "}
                            {governanceRetentionLabel(receipt.retention)} ·{" "}
                            {governanceDisclosureLabel(receipt.participantDisclosure)} ·{" "}
                            {governanceDeletionLabel(receipt.deletionOutcome)}
                          </p>
                          <p className="mt-1 text-[11px] text-primary/40">
                            Legal hold {receipt.legalHold ? "on" : "off"} ·{" "}
                            {governanceExcerptLabel(receipt.evidenceClip)}
                          </p>
                        </li>
                      ))}
                    </ul>
                    {(() => {
                      const hiddenReceipts = governanceExpanded
                        ? 0
                        : Math.max(0, sheetReceipts.length - GOVERNANCE_RECEIPT_PAGE);
                      return hiddenReceipts > 0 ? (
                        <Button
                          className="mt-2"
                          onClick={() => setGovernanceExpanded(true)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {governanceReceiptRemainder(hiddenReceipts)}
                        </Button>
                      ) : null;
                    })()}
                  </section>
                ) : null}

                <section>
                  <SectionTitle
                    title={communicationTimelineTitle(
                      communicationTimeline.length,
                      communicationHasMore,
                      mailFailed,
                    )}
                  />
                  <SheetPaneStatus
                    count={communicationTimeline.length}
                    empty={communicationTimelineEmptyCopy(
                      timeline.some((item) => item.source === "meeting"),
                    )}
                    failed={mailFailed}
                    noun="Mail and meetings"
                    onRetry={() => void load()}
                  >
                    <ul className="flex flex-col divide-y divide-primary/10 rounded-none border border-border">
                      {communicationTimeline.map((item) => (
                        <li key={item.id} className="p-3">
                          <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs font-medium text-primary">
                              {activitySourceLabel(item.source)} · {humanize(item.interactionType)}
                            </Label>
                            <Badge
                              className="text-[11px] font-normal text-primary/35"
                              variant="secondary"
                            >
                              {item.bodyLocked ? "Locked" : "Shared"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-primary/55">
                            {communicationPreviewLabel(item.subject)}
                          </p>
                          <p className="mt-1 text-[11px] text-primary/40">
                            {relativeTime(item.occurredAt)} · {mailAccessReason(item.access.reason)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </SheetPaneStatus>
                  {communicationHasMore && communicationCursor?.before ? (
                    <Button
                      className="mt-2"
                      disabled={loadingEarlier !== null}
                      onClick={() => void loadEarlier("mail")}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {earlierMailLabel()}
                    </Button>
                  ) : null}
                </section>

                <section id={`${id}:history`} className="scroll-mt-16">
                  <SectionTitle
                    title={activityHistoryTitle(timeline.length, timelineHasMore, historyFailed)}
                  />
                  <SheetPaneStatus
                    count={timeline.length}
                    empty={activityHistoryEmptyCopy()}
                    failed={historyFailed}
                    noun="Activity"
                    onRetry={() => void load()}
                  >
                    <ul className="flex flex-col divide-y divide-primary/10 rounded-none border border-border">
                      {timeline.map((observation) => (
                        <li key={observation.id} className="p-3">
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => void revealEvidence(observation)}
                            className="h-auto w-full justify-start rounded-none p-0 text-left hover:bg-transparent"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Label className="text-xs font-medium text-primary">
                                {activityHeading(observation.source, observation.eventType)}
                              </Label>
                              <Badge
                                className="text-[11px] font-normal text-primary/35"
                                variant="secondary"
                              >
                                {relativeTime(observation.occurredAt)}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-primary/55">
                              {activitySummaryLabel(observation.summary)}
                            </p>
                          </Button>
                          {observation.id in evidence ? (
                            <div className="mt-2 max-h-52 space-y-1 overflow-auto rounded-none bg-background-100 p-2 text-[11px] text-primary/60 dark:bg-background-200">
                              {activityLinesBesideSummary(
                                activityEvidenceLines(
                                  evidence[observation.id],
                                  observation.normalizedFacts,
                                ),
                                observation.summary,
                              ).map((line, index) => (
                                <p key={`${observation.id}:${index}`}>{line}</p>
                              ))}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </SheetPaneStatus>
                  {timelineHasMore && timelineCursor?.before ? (
                    <Button
                      className="mt-2"
                      disabled={loadingEarlier !== null}
                      onClick={() => void loadEarlier("activity")}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {earlierActivityLabel()}
                    </Button>
                  ) : null}
                </section>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CorrectionReview({
  items,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  disabled,
  onCorrect,
  onDecide,
}: {
  items: ConversationReviewItem[];
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  disabled: boolean;
  onCorrect: (item: ConversationReviewItem, correctedValue: string) => void;
  onDecide: (
    item: ConversationReviewItem,
    kind: "approve" | "correct" | "reject" | "defer",
    correctedValue?: string,
    deferUntil?: string,
  ) => void;
}) {
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  if (items.length === 0 && !hasMore) return null;
  return (
    <section
      className="rounded-none border border-amber-500/30 bg-amber-500/5 p-3"
      data-capability="conversation-review"
    >
      <SectionTitle title={focusedReviewTitle(items.length, hasMore)} />
      <p className="mb-3 text-xs text-primary/55">
        {items.length === 0
          ? "Older conversations may still need review."
          : "Approve, correct, reject, or defer each proposed material change before it affects state."}
      </p>
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const draft = drafts[item.id] ?? item.currentValue;
          return (
            <li key={item.id} className="rounded-none border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-primary">{item.label}</p>
                <Badge className="text-[11px] font-normal text-primary/40" variant="secondary">
                  {Math.round(item.confidence * 100)}% · {reviewEvidenceKindLabel(item.kind)}
                </Badge>
              </div>
              {item.exactQuote ? (
                <blockquote className="my-2 border-l border-border pl-2 text-xs text-primary/55">
                  “{item.exactQuote}”
                </blockquote>
              ) : null}
              <div className="flex gap-2">
                <Input
                  value={draft}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [item.id]: event.target.value }))
                  }
                />
                {item.batchId ? (
                  <>
                    <Button size="sm" disabled={disabled} onClick={() => onDecide(item, "approve")}>
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled || !draft.trim() || draft.trim() === item.currentValue}
                      onClick={() => onDecide(item, "correct", draft.trim())}
                    >
                      Correct
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => onDecide(item, "reject")}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={disabled}
                      onClick={() =>
                        onDecide(
                          item,
                          "defer",
                          undefined,
                          new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                        )
                      }
                    >
                      Defer 1 day
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={disabled || !draft.trim() || draft.trim() === item.currentValue}
                    onClick={() => onCorrect(item, draft.trim())}
                  >
                    Correct
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {hasMore ? (
        <Button
          className="mt-2"
          disabled={disabled || loadingMore}
          onClick={onLoadMore}
          size="sm"
          type="button"
          variant="outline"
        >
          {loadingMore ? "Loading…" : earlierEvidenceLabel()}
        </Button>
      ) : null}
    </section>
  );
}

function StateCorrection({
  relationship,
  disabled,
  onCorrect,
}: {
  relationship: RevenueRelationship;
  disabled: boolean;
  onCorrect: (
    dimension: "lifecycle" | "engagement" | "sentiment" | "health",
    value: string,
    reason: string,
  ) => void;
}) {
  const [dimension, setDimension] = React.useState<
    "lifecycle" | "engagement" | "sentiment" | "health"
  >("health");
  const [value, setValue] = React.useState<string>(relationship.health);
  const [reason, setReason] = React.useState("");
  const options =
    dimension === "lifecycle"
      ? LIFECYCLE_OPTIONS
      : dimension === "engagement"
        ? ENGAGEMENT_OPTIONS
        : dimension === "sentiment"
          ? ["unknown", "positive", "mixed", "negative"]
          : HEALTH_OPTIONS;

  return (
    <section
      className="rounded-none border border-dashed border-border p-3"
      data-capability="state-correction"
    >
      <SectionTitle title="Correct a detail" />
      <div className="grid gap-2 sm:grid-cols-[130px_150px_1fr_auto]">
        <Select
          value={dimension}
          onValueChange={(next) => {
            const nextDimension = next as typeof dimension;
            setDimension(nextDimension);
            setValue(relationship[nextDimension]);
          }}
        >
          <SelectTrigger aria-label={comboboxFilterName("Detail", humanize(dimension))} size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="app-shell rounded-none">
            {["health", "lifecycle", "engagement", "sentiment"].map((item) => (
              <SelectItem key={item} value={item}>
                {humanize(item)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger aria-label={comboboxFilterName("Value", companyRecordLabel(value))} size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="app-shell rounded-none">
            {options.map((item) => (
              <SelectItem key={item} value={item}>
                {companyRecordLabel(item)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why is this wrong?"
        />
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || !reason.trim() || value === relationship[dimension]}
          onClick={() => onCorrect(dimension, value, reason.trim())}
        >
          Correct
        </Button>
      </div>
    </section>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-primary/45">{title}</h3>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-primary/45">{children}</p>;
}

function SheetPaneStatus({
  failed,
  count,
  empty,
  noun,
  onRetry,
  children,
}: {
  failed: boolean;
  count: number;
  empty: string;
  noun: string;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  const retry = (
    <Button onClick={onRetry} size="sm" type="button" variant="outline">
      Try again
    </Button>
  );
  if (failed && count === 0) {
    return (
      <div className="flex items-center justify-between gap-3">
        <EmptyText>{sheetPaneFailureCopy(noun)}</EmptyText>
        {retry}
      </div>
    );
  }
  return (
    <>
      {failed ? (
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[13px] text-primary/70">{sheetPaneRefreshCopy(noun)}</p>
          {retry}
        </div>
      ) : null}
      {count === 0 ? <EmptyText>{empty}</EmptyText> : children}
    </>
  );
}

function TwoColumnList({
  leftTitle,
  left,
  rightTitle,
  right,
}: {
  leftTitle: string;
  left: string[];
  rightTitle: string;
  right: string[];
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {[
        [leftTitle, left],
        [rightTitle, right],
      ].map(([title, items]) => (
        <section key={title as string}>
          <SectionTitle title={title as string} />
          {(items as string[]).length === 0 ? (
            <EmptyText>None recorded.</EmptyText>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {(items as string[]).map((item, index) => (
                <li key={`${item}:${index}`} className="text-xs text-primary/65">
                  · {item}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function CreateRelationshipDialog({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: () => void;
  onError: (m: string) => void;
}) {
  const [displayName, setDisplayName] = React.useState("");
  const [primaryEmail, setPrimaryEmail] = React.useState("");
  const [accountDomain, setAccountDomain] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const submit = async () => {
    if (!displayName.trim()) return;
    setBusy(true);
    setFormError(null);
    onError("");
    try {
      await createRelationship({
        kind: "company",
        displayName: displayName.trim(),
        primaryEmail: primaryEmail.trim() || undefined,
        accountDomain: accountDomain.trim() || undefined,
        summary: summary.trim() || undefined,
      });
      onCreated();
    } catch (error) {
      const message = errMessage(error, "Could not create the company.");
      setFormError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New company</DialogTitle>
          <DialogDescription>
            Add a company. Mail and meetings can fill in its people and activity later.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            aria-label="Company name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Company name"
          />
          <Input
            aria-label="Company domain"
            value={accountDomain}
            onChange={(event) => setAccountDomain(event.target.value)}
            placeholder="Company domain (optional)"
          />
          <Input
            aria-label="Primary email"
            value={primaryEmail}
            onChange={(event) => setPrimaryEmail(event.target.value)}
            placeholder="Primary email (optional)"
          />
          <Input
            aria-label="Description"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Description (optional)"
          />
        </div>
        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={busy || !displayName.trim()}>
            {busy ? <Spinner className="size-4" /> : <Plus />} Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
