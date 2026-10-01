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
  ListSkeleton,
  ModeChip,
} from "@/components/features/revenue/shared/shared";
import { AttentionQueueSurface } from "@/components/features/revenue/attention-queue-surface/attention-queue-surface";
import { useAskOppulence } from "@/components/features/dashboard/dashboard-shell/dashboard-shell";
import { revenueParsers, revenueUrlKeys } from "@/app/(product)/app/revenue/search-params";
import { subscribeCompanyCreate } from "@/lib/dashboard/company-create-request";
import {
  AccountMissionControlSurface,
  accountAttentionFromHealth,
  mapCommitmentsToAccountTimeline,
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
  acknowledgeMissionControl,
  decideIdentityCandidate,
  type DecideRelationshipIdentityCandidateInput,
  approveRecommendation,
  correctConversationReview,
  decideConversationReview,
  correctRelationship,
  createRelationship,
  deletePerson,
  DETECTOR_LABELS,
  getRelationship,
  getRelationshipBetaDiagnostics,
  getRelationshipChanges,
  getRelationshipEvidence,
  getRelationshipCommunicationTimeline,
  getRelationshipTimeline,
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
  companyLinkedInURL,
  webAddressHref,
  interactionCountLabel,
  RevenueAPIError,
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
import {
  useIdentityCandidates,
  useRelationshipAttention,
  useRelationships,
} from "@/hooks/queries/use-relationships";
import {
  useRelationshipSourceInventory,
  useRelationshipSourceStatuses,
} from "@/hooks/queries/use-relationship-sources";
import { relationshipKeys } from "@/hooks/queries/utils/relationship-keys";
import { relationshipSourceKeys } from "@/hooks/queries/utils/relationship-source-keys";
import { useQueryClient } from "@tanstack/react-query";
import { comboboxFilterName } from "@/lib/a11y/combobox-filter-name";
import { planLabel } from "@/lib/product/plan-label";
import { attentionWithoutTasks, workspaceTaskIds } from "@/lib/revenue/revenue-records";
import {
  activityEvidenceLines,
  enumLabel as humanize,
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
  | "emails"
  | "health"
  | "nextAction"
  | "headquarters"
  | "employees"
  | "funding"
  | "revenue"
  | "signals";

const OPTIONAL_COMPANY_COLUMNS: Array<{ id: OptionalCompanyColumn; label: string }> = [
  { id: "people", label: "People" },
  { id: "emails", label: "Emails" },
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

/** A copied address is not a company name. "Billing @ Northwind" is. */
function emailShapedCompanyName(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function domainCompanyLabel(domain: string): string {
  return domain
    .split(".")[0]
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * A company stored under its domain, or under the address that created it,
 * reads as that host. Any other typed name, including one with an @ sign,
 * stays as the teammate wrote it.
 */
export function companyName(relationship: {
  displayName: string;
  accountDomain?: string | null;
}): string {
  const domain = relationship.accountDomain?.trim() ?? "";
  const name = relationship.displayName.trim();
  if (
    domain &&
    (name.toLowerCase() === domain.toLowerCase() || emailShapedCompanyName(name))
  ) {
    return domainCompanyLabel(domain);
  }
  return relationship.displayName;
}

const formatResearchCost = (usd: number) =>
  usd < 0.01 ? "less than a cent" : `$${usd.toFixed(2)}`;

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
  const [personEstimate, setPersonEstimate] = React.useState<ResearchEstimate | null>(null);
  const [companyEstimate, setCompanyEstimate] = React.useState<ResearchEstimate | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const nextStatus = await getResearchStatus();
      setStatus(nextStatus);
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
    if (
      !window.confirm(
        `Enrich ${companies} ${companies === 1 ? "company" : "companies"} and ${people} ${people === 1 ? "person" : "people"} for about ${formatResearchCost(companyEstimate.usd + personEstimate.usd)}? Only names, company domains, and known employers are sent.`,
      )
    )
      return;
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
          <h3 className="mt-1 text-sm font-semibold text-primary">Know who is behind the inbox</h3>
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
        <p className="mt-3 text-xs text-primary/45">Checking whether public research is available…</p>
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
            <Button type="button" size="sm" disabled={busy} onClick={() => void run()}>
              {busy ? <Spinner className="size-4" /> : <Sparkle />}
              Fill in companies and people
            </Button>
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
): string {
  return `${position} of ${total} in ${filtered ? "this filter" : "All companies"}`;
}

export function companyListEmptyCopy(input: {
  filtered: boolean;
  hasConnectedSource: boolean;
  lookbackLabel: string;
}): string {
  if (input.filtered) return "No companies match these filters.";
  if (input.hasConnectedSource) {
    return `Gmail is connected. Run the ${input.lookbackLabel} audit from Commitments to discover companies and the people behind each conversation.`;
  }
  return "Connect Gmail to discover companies from real conversations, or add one by hand.";
}

/** Health and stage are comboboxes. The visible word is the choice, not the name. */
export function companyHealthFilterName(value: string): string {
  return comboboxFilterName("Health", value === "all" ? "Any health" : humanize(value));
}

export function companyStageFilterName(value: string): string {
  return comboboxFilterName("Stage", value === "all" ? "All stages" : humanize(value));
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
  const sourcesQuery = useRelationshipSourceStatuses();
  const inventoryQuery = useRelationshipSourceInventory();
  const pendingQuery = useIdentityCandidates("pending");
  const deferredQuery = useIdentityCandidates("deferred");
  const attentionQuery = useRelationshipAttention("open");
  const openActionsQuery = useRevenueActions("open", 100);
  const rows = relationshipsQuery.data ?? [];
  const sources = sourcesQuery.data ?? [];
  const sourceInventory = inventoryQuery.data ?? [];
  const identityCandidates = [...(pendingQuery.data ?? []), ...(deferredQuery.data ?? [])];
  const attention = attentionQuery.data ?? [];
  const loading =
    relationshipsQuery.isPending ||
    sourcesQuery.isPending ||
    inventoryQuery.isPending ||
    pendingQuery.isPending ||
    deferredQuery.isPending ||
    attentionQuery.isPending;
  const hasConnectedSource = sources.some((source) =>
    ["connected", "backfilling", "live"].includes(source.status),
  );
  const companies = rows.filter((relationship) => relationship.kind !== "person");
  const directoryTitle = companyDirectoryTitle({ query, health, lifecycle });
  const clearCompanyFilters = () => {
    setQuery("");
    setDebouncedQuery("");
    setHealth("all");
    setLifecycle("all");
  };
  const companyAttention = attentionWithoutTasks(
    attention.filter((item) =>
      companies.some((relationship) => relationship.id === item.relationshipId),
    ),
    openActionsQuery.isSuccess ? workspaceTaskIds(openActionsQuery.data) : new Set(),
  );

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("graph") !== "1") return;
    const timer = window.setTimeout(() => setSurface("graph"), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Recovery and tasks request a company before this surface mounts.
  // The flag is read here so New company opens on the first paint of Companies.
  React.useEffect(() => subscribeCompanyCreate(() => setCreating(true)), []);

  const load = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: relationshipKeys.all }),
      queryClient.invalidateQueries({ queryKey: relationshipSourceKeys.all }),
    ]);
  }, [queryClient]);

  React.useEffect(() => {
    const error =
      relationshipsQuery.error ??
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
              {companies.length}
            </Badge>
          </Button>
        ) : (
          <Badge
            className="h-8 gap-2 rounded-none border border-border bg-background px-3 text-[13px] font-medium text-primary"
            variant="outline"
          >
            <Buildings /> {directoryTitle.label}{" "}
            <Badge className="font-normal text-primary/40" variant="secondary">
              {companies.length}
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

      {surface === "graph" ? (
        <RelationshipGraphWorkspace
          relationships={companies}
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
                    {humanize(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={lifecycle} onValueChange={setLifecycle}>
              <SelectTrigger
                aria-label={companyStageFilterName(lifecycle)}
                className="h-8 w-40"
                size="sm"
              >
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent className="app-shell rounded-none">
                <SelectItem value="all">All stages</SelectItem>
                {LIFECYCLE_OPTIONS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {humanize(value)}
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
                {companyAttention.length + identityCandidates.length > 0 ? (
                  <Badge variant="secondary">
                    {companyAttention.length + identityCandidates.length}
                  </Badge>
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
                    {companyAttention.length}{" "}
                    {companyAttention.length === 1 ? "company" : "companies"} in the{" "}
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
                items={companyAttention}
                loading={loading}
                onActionError={onError}
                onChanged={() => void load()}
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
                    <TableHead className="h-10 w-32 border-r px-3">Last interaction</TableHead>
                    <TableHead className="h-10 w-40 border-r px-3">Email threads</TableHead>
                    <TableHead className="h-10 w-[136px] border-r px-3">Categories</TableHead>
                    <TableHead className="h-10 w-44 border-r px-3">Domains</TableHead>
                    <TableHead className="h-10 w-[120px] border-r px-3">LinkedIn</TableHead>
                    {optionalColumns.includes("people") ? (
                      <TableHead className="h-10 w-20 border-r px-3 text-center">People</TableHead>
                    ) : null}
                    {optionalColumns.includes("emails") ? (
                      <TableHead className="h-10 w-20 border-r px-3 text-center">Emails</TableHead>
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
                        {relationship.lastTouchAt ? relativeTime(relationship.lastTouchAt) : "—"}
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
                          className="bg-background-100 text-[11px] capitalize text-primary/60"
                          variant="outline"
                        >
                          {relationship.categories?.[0] ?? "—"}
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
                            {relationship.accountDomain}
                          </a>
                        ) : relationship.accountDomain ? (
                          <span className="text-primary/65">{relationship.accountDomain}</span>
                        ) : (
                          <Badge className="font-normal text-primary/35" variant="ghost">
                            —
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="border-r px-3 text-[13px]">
                        <a
                          className="text-primary/55 underline-offset-2 hover:text-primary hover:underline"
                          href={companyLinkedInURL(
                            companyName(relationship),
                            relationship.resourceRefs,
                            relationship.linkedinUrl,
                          )}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {webAddressHref(relationship.linkedinUrl) ||
                          relationship.resourceRefs.some((ref) =>
                            ref.startsWith("linkedin:company:"),
                          )
                            ? "View profile"
                            : "Find profile"}
                        </a>
                      </TableCell>
                      {optionalColumns.includes("people") ? (
                        <TableCell className="border-r px-3 text-center text-[13px] text-primary/60">
                          {relationship.peopleCount ?? 0}
                        </TableCell>
                      ) : null}
                      {optionalColumns.includes("emails") ? (
                        <TableCell className="border-r px-3 text-center text-[13px] text-primary/60">
                          {relationship.emailThreadCount ?? 0}
                        </TableCell>
                      ) : null}
                      {optionalColumns.includes("health") ? (
                        <TableCell className="border-r px-3">
                          <Badge
                            className={cn(
                              "text-[13px] font-normal capitalize",
                              HEALTH_TONE[relationship.health] ?? HEALTH_TONE.unknown,
                            )}
                            variant="outline"
                          >
                            {humanize(relationship.health)}
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
      {statuses.slice(0, 4).map((source) => (
        <Badge
          key={`${source.source}:${source.sourceAccountId}`}
          variant="outline"
          title={source.lastError || source.lastObservationAt || undefined}
          className={`rounded-none font-normal capitalize ${
            source.status === "live"
              ? "border-emerald-500/30"
              : ["connected", "backfilling"].includes(source.status)
                ? "border-sky-500/30"
                : "border-amber-500/30"
          }`}
        >
          {source.source} · {source.status}
        </Badge>
      ))}
      {needsRepair > 0 ? (
        <Badge className="gap-1 font-normal text-amber-600 dark:text-amber-400" variant="outline">
          <Warning /> {needsRepair} need attention
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
export function sourceListedOnConnectionsPage(source: string): boolean {
  return source === "google" || source === "hubspot";
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
          Sources to connect
        </h3>
        <p className="mt-0.5 text-xs text-primary/55">
          Connect Gmail or HubSpot. Reading builds company history. Anything that writes
          waits for your approval.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {needsAttention.map((item) => {
          const account = item.accounts[0];
          const copy = sourceProductCopy(item.source, item.scopeExplanation);
          const progress =
            account && account.backfillTotal > 0
              ? Math.round((account.backfillCompleted / account.backfillTotal) * 100)
              : null;
          return (
            <article
              key={item.source}
              className="min-w-0 space-y-3 rounded-none border border-border p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-medium text-primary">{item.displayName}</h4>
                <Badge variant="outline" className="rounded-none capitalize">
                  {humanize(account?.status || "not_connected")}
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
                    {humanize(account.completeness)}
                    {progress !== null ? ` · ${progress}% of history synced` : ""}
                    {account.lagSeconds ? ` · ${Math.round(account.lagSeconds / 60)}m lag` : ""}
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
export function identityMatchDetail(candidate: {
  anchorKind: string;
  anchorProvider?: string | null;
  anchorPreview?: string | null;
}): string {
  const kind = humanize(candidate.anchorKind);
  const provider = candidate.anchorProvider?.trim() ?? "";
  const from = provider ? ` from ${provider.charAt(0).toUpperCase()}${provider.slice(1)}` : "";
  const preview = candidate.anchorPreview?.trim() || "not shown";
  return `Matched on ${kind}${from}: ${preview}`;
}

function IdentityReviewInbox({
  candidates,
  onChanged,
  onError,
}: {
  candidates: RelationshipIdentityCandidate[];
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  if (candidates.length === 0) return null;

  const decide = async (
    candidate: RelationshipIdentityCandidate,
    decision: DecideRelationshipIdentityCandidateInput["decision"],
  ) => {
    setBusy(`${candidate.id}:${decision}`);
    try {
      await decideIdentityCandidate(candidate.id, {
        decision,
        reason: reasons[candidate.id]?.trim() || `Reviewed in the identity inbox: ${decision}.`,
        expectedVersion: candidate.version,
        idempotencyKey: crypto.randomUUID(),
      });
      onChanged();
    } catch (error) {
      onError(errMessage(error, "Could not save this review. Refresh and try again."));
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
            {candidates.length} possible {candidates.length === 1 ? "duplicate" : "duplicates"}{" "}
            cannot receive actions until reviewed.
          </p>
        </div>
        <Badge variant="outline" className="rounded-none border-amber-500/40">
          Needs your review
        </Badge>
      </div>
      {candidates.map((candidate) => (
        <article key={candidate.id} className="space-y-3 border-t border-amber-500/20 pt-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-primary">
                {candidate.proposedRelationship.displayName} may match{" "}
                {candidate.existingRelationship.displayName}
              </p>
              <p className="mt-0.5 text-xs text-primary/55">{identityMatchDetail(candidate)}</p>
            </div>
            <Badge className="text-xs font-normal text-primary/45" variant="secondary">
              {identitySupportLabel(candidate.evidenceCount)} ·{" "}
              {identityMatchLabel(candidate.recommendationConfidence)}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] text-primary/55">
            {Object.entries(candidate.impact).map(([kind, count]) => (
              <Badge className="font-normal" key={kind} variant="outline">
                {count} {humanize(kind)}
              </Badge>
            ))}
          </div>
          <Input
            aria-label={`Reason for identity decision about ${candidate.proposedRelationship.displayName}`}
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
                {relationshipLabel(decision)}
              </Button>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
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

/**
 * Completeness text is stored with the company. The empty-workspace sentence
 * talks about a sync. The sheet says what the person can do.
 */
/**
 * asOf is the moment the company was loaded, not a review time. A company
 * that has never been reviewed must not claim it was reviewed just now.
 */
export function companyReviewCopy(model: {
  previousReviewedStateVersion: number;
  changedSinceReview: boolean;
}): { change: string; footer: string } {
  if (!model.changedSinceReview && model.previousReviewedStateVersion <= 0) {
    return { change: "Not reviewed yet.", footer: "Not reviewed yet." };
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
  return `Lifecycle: ${relationshipLabel(lifecycle)} · Health: ${relationshipLabel(health)}`;
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

export function missionControlStateAnswer(evidence: {
  lifecycle?: { supported?: boolean; value?: unknown };
  health?: { supported?: boolean; value?: unknown };
}): string {
  const shown = (item: { supported?: boolean; value?: unknown } | undefined) => {
    if (!item?.supported || item.value == null) return "";
    return String(item.value).trim();
  };
  const lifecycle = shown(evidence.lifecycle);
  const health = shown(evidence.health);
  const parts = [
    lifecycle ? `Lifecycle: ${relationshipLabel(lifecycle)}` : "",
    health ? `Health: ${relationshipLabel(health)}` : "",
  ].filter(Boolean);
  if (parts.length === 0) return "No supported answer yet.";
  return parts.join(" · ");
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
  return `${label} · ${relationshipLabel(value)}`;
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

export function completenessExplanationCopy(explanation: string): string {
  if (explanation.trim() === "No source connection has completed its first useful sync.") {
    return "Connect a source before these details can fill in.";
  }
  return explanation;
}

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
    return {
      title: "Two details disagree",
      detail: cue.detail.replace(/value should be current\?$/, "should be the current one?"),
    };
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
    default:
      return authority ? relationshipLabel(authority) : "Not filled in yet";
  }
}

function MissionControlOverview({
  model,
  emailThreadCount,
  busy,
  onAcknowledge,
  onRetract,
}: {
  model: MissionControlReadModel;
  emailThreadCount: number;
  busy: boolean;
  onAcknowledge: () => void;
  onRetract: (assertionId: string, reason: string) => void;
}) {
  const tone = completenessTone(model.completeness.status);
  const supported = Object.values(model.evidence).filter((item) => item.supported).length;
  const total = Object.keys(model.evidence).length;
  const reviewCopy = companyReviewCopy(model);
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
              {completenessProductLabel(model.completeness.status)}
            </h3>
            <p className="mt-1 text-xs text-primary/60">
              {emailThreadCount > 0 && supported === 0
                ? `${emailThreadCount} Gmail ${emailThreadCount === 1 ? "thread is" : "threads are"} linked. Health and status still need a clearer source.`
                : completenessExplanationCopy(model.completeness.explanation)}
            </p>
          </div>
          <Badge variant="outline" className="rounded-none font-normal">
            {supported} of {total} details have a source
          </Badge>
        </div>
        {model.completeness.unresolvedIdentityCount > 0 ? (
          <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
            {model.completeness.unresolvedIdentityCount} identity review
            {model.completeness.unresolvedIdentityCount === 1 ? "" : "s"} block acting.
          </p>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {MISSION_CONTROL_QUESTIONS.map((question) => {
          let answer = "No supported answer yet.";
          if (question.key === "state") {
            answer = missionControlStateAnswer(model.evidence);
          } else if (question.key === "change") {
            answer = model.changedSinceReview
              ? missionControlChangeAnswer(model.changes, "State changed")
              : reviewCopy.change;
          } else if (question.key === "evidence") {
            answer = `${supported} of ${total} details come from a source you can open.`;
          } else if (question.key === "action") {
            answer = model.activeRecommendation?.reason || "No action is currently recommended.";
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
                      (ref) => `${relationshipLabel(ref.source)} · ${relativeTime(ref.observedAt)}`,
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
  onClose,
  onError,
  onChanged,
}: {
  id: string;
  seed?: RevenueRelationship;
  position: number;
  total: number;
  filtered?: boolean;
  onClose: () => void;
  onError: (m: string) => void;
  onChanged: () => void;
}) {
  const [data, setData] = React.useState<RelationshipDetail | null>(null);
  const [timeline, setTimeline] = React.useState<RelationshipObservation[]>([]);
  const [communicationTimeline, setCommunicationTimeline] = React.useState<
    CommunicationTimelineItem[]
  >([]);
  const [changes, setChanges] = React.useState<RelationshipStateSnapshot[]>([]);
  const [identityCandidates, setIdentityCandidates] = React.useState<
    RelationshipIdentityCandidate[]
  >([]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [evidence, setEvidence] = React.useState<Record<string, unknown>>({});
  const [personAttributes, setPersonAttributes] = React.useState<
    Record<string, RelationshipPersonAttribute[]>
  >({});
  const [confirmingPersonId, setConfirmingPersonId] = React.useState<string | null>(null);
  const [confirmingDeletion, setConfirmingDeletion] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [activeSection, setActiveSection] = React.useState<
    "overview" | "history" | "emails" | "commitments" | "people"
  >("overview");
  const askOppulence = useAskOppulence();
  const askedCompany = data?.relationship ?? seed;
  const liveCues = (data?.intelligence?.liveCues ?? []).filter((cue) =>
    liveCueVisible(cue, data?.relationship.lifecycle ?? ""),
  );

  const load = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const nextData = await getRelationship(id);
      setData(nextData);

      const [nextTimeline, nextCommunicationTimeline, nextChanges, pending, deferred, resolved] =
        await Promise.all([
          getRelationshipTimeline(id).catch(() => [] as RelationshipObservation[]),
          getRelationshipCommunicationTimeline(id).catch(() => [] as CommunicationTimelineItem[]),
          getRelationshipChanges(id).catch(() => [] as RelationshipStateSnapshot[]),
          listIdentityCandidates("pending", id).catch(() => [] as RelationshipIdentityCandidate[]),
          listIdentityCandidates("deferred", id).catch(() => [] as RelationshipIdentityCandidate[]),
          listIdentityCandidates("resolved", id).catch(() => [] as RelationshipIdentityCandidate[]),
        ]);
      setTimeline(nextTimeline);
      setCommunicationTimeline(nextCommunicationTimeline);
      setChanges(nextChanges);
      setIdentityCandidates([...pending, ...deferred, ...resolved]);
      const people = nextData.participants
        .map((participant) => participant.person?.id)
        .filter((personId): personId is string => Boolean(personId));
      const attributes = await Promise.all(
        [...new Set(people)].map(
          async (personId) =>
            [personId, await getPersonAttributes(personId).catch(() => [])] as const,
        ),
      );
      setPersonAttributes(Object.fromEntries(attributes));
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
    setConfirmingPersonId(null);
    setConfirmingDeletion(false);
  }, [id]);

  const act = async (key: string, operation: () => Promise<unknown>): Promise<boolean> => {
    setBusy(key);
    try {
      await operation();
      await load();
      onChanged();
      return true;
    } catch (error) {
      onError(errMessage(error, "Could not update this company."));
      return false;
    } finally {
      setBusy(null);
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
      onError(errMessage(error, "Could not open the original detail."));
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
  const companySource = data
    ? Object.values(data.relationship.companyEnrichmentRefs ?? {})
        .flat()
        .map(safeResearchCitationURL)
        .find((url): url is string => Boolean(url))
    : undefined;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        overlayClassName="bg-transparent"
        closeButtonClassName="left-4 right-auto"
        className="left-0 flex w-full flex-col gap-0 overflow-hidden border-l-0 p-0 shadow-none sm:max-w-none md:left-[285px] md:w-[calc(100%-285px)]"
      >
        <SheetHeader className="min-h-12 flex-row items-center border-b border-border py-2 pl-14 pr-3">
          <SheetTitle className="text-xs font-normal text-primary/55">
            {data || seed ? companySheetPositionLabel(position, total, filtered) : "Company"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {data?.relationship.primaryEmail}
            {data?.relationship.accountDomain ? ` · ${data.relationship.accountDomain}` : ""}
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
        {!data ? (
          <div className="flex flex-col gap-3 px-4 py-6">
            {seed ? (
              <div>
                <h2 className="truncate text-lg font-semibold text-primary">{companyName(seed)}</h2>
                <p className="truncate text-xs text-primary/45">
                  {seed.accountDomain || seed.primaryEmail || "Company"}
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
                          {data.relationship.accountDomain}
                        </a>
                      ) : (
                        data.relationship.accountDomain ||
                        data.relationship.primaryEmail ||
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
                    {recordDetailBadge("Lifecycle", data.relationship.lifecycle)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={`rounded-none ${HEALTH_TONE[data.relationship.health]}`}
                  >
                    {recordDetailBadge("Health", data.relationship.health)}
                  </Badge>
                  <Badge variant="secondary">
                    {recordDetailBadge("Engagement", data.relationship.engagement)}
                  </Badge>
                  <Badge variant="secondary">
                    {recordDetailBadge("Sentiment", data.relationship.sentiment)}
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
                        {data.relationship.accountDomain}
                      </a>
                    ) : (
                      data.relationship.accountDomain?.trim() || "Not filled in"
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
                  <dt className="text-primary/40">Category</dt>
                  <dd className="text-primary/75">
                    {data.relationship.categories?.join(", ") || "Not filled in"}
                  </dd>
                  <dt className="text-primary/40">Description</dt>
                  <dd className="text-primary/75">
                    {companyDescriptionCopy(data.relationship)}
                  </dd>
                  <dt className="text-primary/40">LinkedIn</dt>
                  <dd className="text-primary/75">
                    {webAddressHref(data.relationship.linkedinUrl) ? (
                      <a
                        className="underline-offset-2 hover:underline"
                        href={webAddressHref(data.relationship.linkedinUrl) ?? undefined}
                        rel="noreferrer"
                        target="_blank"
                      >
                        View company
                      </a>
                    ) : (
                      "Not filled in"
                    )}
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
                  <dd className="capitalize text-primary/75">
                    {humanize(data.relationship.lifecycle)}
                  </dd>
                  <dt className="text-primary/40">Health</dt>
                  <dd className="capitalize text-primary/75">
                    {humanize(data.relationship.health)}
                  </dd>
                  <dt className="text-primary/40">Engagement</dt>
                  <dd className="capitalize text-primary/75">
                    {humanize(data.relationship.engagement)}
                  </dd>
                  <dt className="text-primary/40">Last activity</dt>
                  <dd className="text-primary/75">
                    {data.relationship.lastTouchAt
                      ? relativeTime(data.relationship.lastTouchAt)
                      : "No activity"}
                  </dd>
                </dl>
              </section>
            </aside>

            <div className="min-w-0 overflow-y-auto">
              <nav className="sticky top-0 z-10 flex h-12 items-center gap-1 border-b border-border bg-background px-4 text-xs">
                {/* Activity is the history log. Emails is the thread list.
                    They used to scroll to the same place. Overview used to
                    stay highlighted after those clicks. */}
                {(
                  [
                    ["overview", "Overview"],
                    ["history", "Activity"],
                    ["emails", `Emails ${data.emailThreads.length}`],
                    ["commitments", `Commitments ${data.commitments.length}`],
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
                  return (
                    <AccountMissionControlSurface
                      accountName={companyName(data.relationship)}
                      attentionLabel={attention?.label}
                      attentionVariant={attention?.variant}
                      items={mapCommitmentsToAccountTimeline(data.commitments, 3)}
                    />
                  );
                })()}

                <p className="text-xs font-medium text-primary/55">Highlights</p>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {[
                    ["Health", humanize(data.relationship.health)],
                    ["Engagement", humanize(data.relationship.engagement)],
                    [
                      "Last interaction",
                      data.relationship.lastTouchAt
                        ? relativeTime(data.relationship.lastTouchAt)
                        : "No activity",
                    ],
                    ["People", String(data.participants.length)],
                    ["Email threads", String(data.emailThreads.length)],
                    [
                      "Open commitments",
                      String(data.commitments.filter((item) => item.status === "open").length),
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="min-h-24 rounded-none border border-border p-3">
                      <p className="text-[11px] text-primary/40">{label}</p>
                      <p className="mt-5 text-sm font-medium text-primary">{value}</p>
                    </div>
                  ))}
                </div>

                <section id={`${id}:emails`} className="scroll-mt-16">
                  <SectionTitle title={`Email activity (${data.emailThreads.length})`} />
                  {data.emailThreads.length === 0 ? (
                    <EmptyText>No Gmail threads linked yet.</EmptyText>
                  ) : (
                    <ul className="flex flex-col divide-y divide-primary/10 rounded-none border border-border">
                      {data.emailThreads.map((thread) => (
                        <li key={thread.id} className="flex items-start justify-between gap-4 p-3">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-primary">
                              {thread.subject || "Email conversation"}
                            </p>
                            <p className="mt-1 truncate text-[11px] text-primary/45">
                              {thread.counterpartyEmail || "Gmail"} · {thread.messageCount}{" "}
                              {thread.messageCount === 1 ? "message" : "messages"}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-[11px] capitalize text-primary/55">
                              {humanize(thread.replyState)}
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

                <IdentityReviewInbox
                  candidates={identityCandidates}
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
                    items={data.intelligence.reviewItems}
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
                          Last deletion: {humanize(data.intelligence.deletionReceipts[0].status)}
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
                      title={`Promises to follow up (${data.intelligence?.recoveryEvaluations.length ?? 0})`}
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
                          <p className="font-medium capitalize text-primary">
                            {humanize(evaluation.classification)}
                          </p>
                          <p className="mt-1 text-primary/60">{evaluation.explanation}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyText>No promises are due for a follow-up.</EmptyText>
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
                              {humanize(factor.factor)}: {factor.contribution >= 0 ? "+" : ""}
                              {factor.contribution} · {factor.reason}
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
                    <EmptyText>No action is currently recommended.</EmptyText>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {data.recommendations.map((action) => (
                        <li key={action.id} className="rounded-none border border-border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-primary">
                                {ACTION_TYPE_LABELS[action.actionType] ?? action.actionType}
                              </p>
                              <p className="mt-1 text-xs text-primary/60">{action.reason}</p>
                            </div>
                            <ModeChip mode={action.executionMode} />
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-primary/40">
                            <Badge className="font-normal" variant="outline">
                              {DETECTOR_LABELS[action.detector] ?? action.detector}
                            </Badge>
                            <Badge className="font-normal" variant="secondary">
                              priority {action.priorityScore}
                            </Badge>
                            <Badge className="font-normal capitalize" variant="secondary">
                              {action.policyStatus}
                            </Badge>
                          </div>
                          {action.evidence.length > 0 ? (
                            <details className="mt-2 text-xs text-primary/55">
                              <summary className="cursor-pointer">Inspect supporting words</summary>
                              <ul className="mt-2 space-y-1 border-l border-border pl-3">
                                {action.evidence.map((item) => (
                                  <li key={item.id}>
                                    “{item.excerpt || "Evidence excerpt unavailable"}”
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
                            <Badge variant="secondary" className="mt-3 capitalize">
                              {action.approvalStatus}
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
                    {data.participants.length === 0 ? (
                      <EmptyText>None recorded.</EmptyText>
                    ) : (
                      <ul className="flex flex-col gap-1.5" aria-label="People">
                        {data.participants.map((participant) => {
                          const person = participant.person;
                          const departed = person?.employmentStatus === "departed";
                          const profile = [
                            person?.title || participant.title,
                            person?.orgName,
                            person?.seniority,
                            person?.location,
                          ].filter(Boolean);
                          const cited = (personAttributes[person?.id ?? ""] ?? []).filter(
                            (attribute) =>
                              attribute.sourceType === "external_research" &&
                              attribute.status !== "retracted",
                          );
                          return (
                            <li
                              key={participant.id}
                              className="flex items-start justify-between gap-2 border border-border p-2 text-xs"
                            >
                              <div className={`min-w-0 ${departed ? "text-primary/50" : ""}`}>
                                <p className="font-medium text-primary">
                                  {participant.displayName}
                                  {participant.role ? ` · ${participant.role}` : ""}
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
                                          <Badge
                                            className="capitalize font-normal"
                                            variant="outline"
                                          >
                                            {humanize(attribute.dimension)}
                                          </Badge>
                                          : {attribute.value}
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
                                      {removePersonConfirmCopy(participant.displayName)}
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
                    <SectionTitle title={`Commitments (${data.commitments.length})`} />
                    <AccountMissionControlSurface
                      accountName={companyName(data.relationship)}
                      className="mt-2"
                      items={mapCommitmentsToAccountTimeline(data.commitments, 8)}
                      showHeader={false}
                    />
                  </section>
                </div>

                {data.commitmentDependencies.length ? (
                  <section>
                    <SectionTitle
                      title={`Commitment graph (${data.commitmentDependencies.length})`}
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
                              {from?.text ?? "Unknown commitment"}
                            </Label>
                            <Badge variant="secondary" className="mx-2 capitalize">
                              {dependency.kind}
                            </Badge>
                            <Label className="font-normal">
                              {to?.text ?? "Unknown commitment"}
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
                      Create from accepted promises
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
                                  reason: "User confirmed counterparty acceptance.",
                                  evidenceRefs: [`user-decision:${item.id}:accepted`],
                                }),
                              )
                            }
                          >
                            Confirm accepted: {item.text}
                          </Button>
                        ))}
                    </div>
                  ) : null}
                  {data.intelligence?.mutualActionPlans.length ? (
                    <ul className="space-y-2">
                      {data.intelligence.mutualActionPlans.map((plan) => (
                        <li key={plan.planId} className="border border-border p-3 text-xs">
                          <p className="font-medium capitalize text-primary">
                            {humanize(plan.status)} · revision {plan.currentRevision.version}
                          </p>
                          <ul className="mt-1 list-disc pl-4 text-primary/60">
                            {plan.currentRevision.items.map((item) => (
                              <li key={item.itemId}>
                                {item.title} · {item.ownerParticipantRef}
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
                                Approve revision
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
                                Queue exact revision for sharing
                              </Button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyText>
                      Accept a promise to build a shared plan.
                    </EmptyText>
                  )}
                </section>

                <section data-capability="contradiction-resolution">
                  <SectionTitle title={`What changed (${changes.length})`} />
                  {data.intelligence?.delta.changes.length ? (
                    <ul className="mb-3 flex flex-col gap-2">
                      {data.intelligence.delta.changes.map((change) => (
                        <li
                          key={change.dimension}
                          className="rounded-none border border-border p-3"
                        >
                          <p className="text-xs font-medium capitalize text-primary">
                            {humanize(change.dimension)}
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
                          <Label className="font-medium capitalize text-primary">
                            {humanize(item.dimension)}:
                          </Label>{" "}
                          {item.status === "open"
                            ? `Choose the current value from ${item.sides.length} sources.`
                            : item.reason}
                          <Badge className="ml-1 font-normal text-primary/40" variant="secondary">
                            ({item.sides.map((side) => side.source).join(" vs ")})
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
                                        reason: `Selected ${side.source} as current evidence.`,
                                      }),
                                    )
                                  }
                                >
                                  Use{" "}
                                  {String("value" in side.value ? side.value.value : side.source)}
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
                  {changes.length === 0 ? (
                    <EmptyText>Nothing has changed yet.</EmptyText>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {changes.map((snapshot) => (
                        <li key={snapshot.id} className="flex gap-3 border-l border-border pl-3">
                          <ClockCounterClockwise className="mt-0.5 size-4 shrink-0 text-primary/35" />
                          <div>
                            <p className="text-xs text-primary/70">
                              {snapshot.changedDimensions.map(humanize).join(", ")}
                            </p>
                            <p className="text-[11px] text-primary/35">
                              v{snapshot.version} · {relativeTime(snapshot.createdAt)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {data.intelligence?.governanceReceipts.length ? (
                  <section>
                    <SectionTitle title="Consent and governance" />
                    <ul className="flex flex-col gap-2">
                      {data.intelligence.governanceReceipts.slice(0, 5).map((receipt) => (
                        <li
                          key={receipt.receiptId}
                          className="rounded-none border border-border p-3 text-xs text-primary/60"
                        >
                          <p>
                            {humanize(receipt.capturePolicy)} · {humanize(receipt.routing)}
                          </p>
                          <p className="mt-1 text-[11px] text-primary/40">
                            {receipt.region} · retention {receipt.retention} · disclosure{" "}
                            {humanize(receipt.participantDisclosure)} ·{" "}
                            {humanize(receipt.deletionOutcome)}
                          </p>
                          <p className="mt-1 text-[11px] text-primary/40">
                            Legal hold {receipt.legalHold ? "on" : "off"} · saved excerpt{" "}
                            {humanize(receipt.evidenceClip)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <section>
                  <SectionTitle
                    title={`Email & meeting timeline (${communicationTimeline.length})`}
                  />
                  {communicationTimeline.length === 0 ? (
                    <EmptyText>No mail or meetings yet.</EmptyText>
                  ) : (
                    <ul className="flex flex-col divide-y divide-primary/10 rounded-none border border-border">
                      {communicationTimeline.map((item) => (
                        <li key={item.id} className="p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-xs font-medium capitalize text-primary">
                              {item.source} · {humanize(item.interactionType)}
                            </Label>
                            <Badge
                              className="text-[11px] font-normal text-primary/35"
                              variant="secondary"
                            >
                              {item.bodyLocked ? "Locked" : "Shared"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-primary/55">
                            {item.subject || "No message preview"}
                          </p>
                          <p className="mt-1 text-[11px] text-primary/40">
                            {relativeTime(item.occurredAt)} · {humanize(item.access.reason)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section id={`${id}:history`} className="scroll-mt-16">
                  <SectionTitle title={`Activity history (${timeline.length})`} />
                  {timeline.length === 0 ? (
                    <EmptyText>Nothing recorded yet.</EmptyText>
                  ) : (
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
                              <Label className="text-xs font-medium capitalize text-primary">
                                {humanize(observation.source)} · {humanize(observation.eventType)}
                              </Label>
                              <Badge
                                className="text-[11px] font-normal text-primary/35"
                                variant="secondary"
                              >
                                {relativeTime(observation.occurredAt)}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-primary/55">
                              {observation.summary || "Open the source"}
                            </p>
                          </Button>
                          {observation.id in evidence ? (
                            <div className="mt-2 max-h-52 space-y-1 overflow-auto rounded-none bg-background-100 p-2 text-[11px] text-primary/60 dark:bg-background-200">
                              {activityEvidenceLines(
                                evidence[observation.id],
                                observation.normalizedFacts,
                              ).map((line, index) => (
                                <p key={`${observation.id}:${index}`}>{line}</p>
                              ))}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
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
  disabled,
  onCorrect,
  onDecide,
}: {
  items: ConversationReviewItem[];
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
  if (items.length === 0) return null;
  return (
    <section
      className="rounded-none border border-amber-500/30 bg-amber-500/5 p-3"
      data-capability="conversation-review"
    >
      <SectionTitle title={`Focused evidence review (${items.length})`} />
      <p className="mb-3 text-xs text-primary/55">
        Approve, correct, reject, or defer each proposed material change before it affects state.
      </p>
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const draft = drafts[item.id] ?? item.currentValue;
          return (
            <li key={item.id} className="rounded-none border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-primary">{item.label}</p>
                <Badge className="text-[11px] font-normal text-primary/40" variant="secondary">
                  {Math.round(item.confidence * 100)}% · {item.kind}
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
          <SelectTrigger aria-label={comboboxFilterName("Value", humanize(value))} size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="app-shell rounded-none">
            {options.map((item) => (
              <SelectItem key={item} value={item}>
                {humanize(item)}
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

  const submit = async () => {
    if (!displayName.trim()) return;
    setBusy(true);
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
      onError(errMessage(error, "Could not create the company."));
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
            aria-label="Company notes"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="Notes about this company (optional)"
          />
        </div>
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
