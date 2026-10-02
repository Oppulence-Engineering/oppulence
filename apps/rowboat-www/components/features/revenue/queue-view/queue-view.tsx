"use client";

import "client-only";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { openCompanyCreate } from "@/lib/dashboard/company-create-request";
import { useRelationships } from "@/hooks/queries/use-relationships";
import {
  fetchRelationships,
  relationshipPageHasMore,
  relationshipRows,
} from "@/hooks/queries/utils/fetch-relationships";
import { useRevenueActions } from "@/hooks/queries/use-revenue-actions";
import {
  ACTION_QUEUE_PAGE,
  actionPageHasMore,
  actionRows,
  fetchRevenueActions,
  replaceActionPage,
} from "@/hooks/queries/utils/fetch-revenue-actions";
import { revenueActionKeys } from "@/hooks/queries/utils/revenue-action-keys";
import {
  Alarm,
  CheckCircle,
  ClockCounterClockwise,
  MagnifyingGlass,
  PencilSimple,
  Plugs,
  Plus,
  Prohibit,
} from "@/lib/icons";

import { Badge } from "@oppulence/ui/components/badge";
import { Button } from "@oppulence/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader } from "@oppulence/ui/components/empty";
import { Label } from "@oppulence/ui/components/label";
import { Spinner } from "@oppulence/ui/components/spinner";
import { EmptyBlock, WorkspaceEmptyState } from "@/components/features/revenue/shared/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@oppulence/ui/components/dialog";
import { Input } from "@oppulence/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@oppulence/ui/components/select";
import { Textarea } from "@oppulence/ui/components/textarea";
import { Badge as SimBadge, Chip } from "@sim/emcn";
import { cn } from "@/lib/utils";
import {
  SimProductHeader,
  SimProductPanel,
  SimProductToolbar,
} from "@/components/features/sim-product/sim-product-frame/sim-product-frame";
import {
  ACTION_TYPE_LABELS,
  auditLaunchLabel,
  createAction,
  DETECTOR_LABELS,
  dismissAction,
  dismissReasonLabel,
  explainedRevenueError,
  QUEUE_FILTERS,
  snoozeWakeCopy,
  snoozeAction,
  type CreateActionInput,
} from "@/lib/revenue/revenue";
import {
  errMessage,
  ExecutionBadge,
  ListRefreshFailure,
  ListSkeleton,
  listNeverLoaded,
  listRefreshFailureCopy,
  PolicyBadge,
  priorityTone,
  refetchClearingBanner,
} from "@/components/features/revenue/shared/shared";
import { comboboxFilterName } from "@/lib/a11y/combobox-filter-name";
import { capture, RevenueEvents } from "@/lib/analytics/analytics";
import {
  executionFailureCopy,
  ReviewSheet,
} from "@/components/features/revenue/review-sheet/review-sheet";
import { AuditSheet } from "@/components/features/revenue/audit-sheet/audit-sheet";
import { companyName, recoveryQueueActions } from "@/lib/revenue/revenue-records";
import type { RevenueAction, RevenueRelationship, RevenueWorkspace } from "@/lib/revenue/types";

/**
 * A non-empty filter says how many rows match. Zero is the empty state below
 * the header, so "0 shown" would read as if rows were hidden.
 */
export function recoveryShownLabel(count: number, hasMore = false): string | null {
  if (count <= 0) return null;
  const shown = hasMore ? `${count}+` : String(count);
  return `${shown} shown`;
}

export function recoveryRemainderLabel(): string {
  return "Show the next follow-ups";
}

/**
 * A filtered recovery list is empty. The sentence uses the filter's name.
 * The stored value "all" is not a name, so it must not be interpolated.
 */
/** The visible word is the current recovery filter, not the menu's name. */
export function recoveryFilterName(value: string): string {
  const label = QUEUE_FILTERS.find((filter) => filter.value === value)?.label ?? "Open";
  return comboboxFilterName("Recovery", label);
}

/** The company menu shows a name. The accessible name has to include it. */
export function recoveryCompanyName(label: string): string {
  return comboboxFilterName("Company", label);
}

/** Follow-up kinds are stored as snake case. The menu names the readable kind. */
export function recoveryFollowUpName(actionType: string): string {
  const label = ACTION_TYPE_LABELS[actionType as keyof typeof ACTION_TYPE_LABELS];
  return comboboxFilterName("Follow-up", label ?? actionType.replaceAll("_", " "));
}

/**
 * A follow-up with no address still belongs to a company. The card names that
 * company instead of calling the recipient unknown.
 */
export function recoveryRecipientLabel(action: {
  recipientEmail?: string | null;
  relationshipName?: string | null;
}): string {
  return action.recipientEmail?.trim() || action.relationshipName?.trim() || "Unknown recipient";
}

/** The address is the heading. The company stays visible beside it. */
export function recoveryCompanyCaption(action: {
  recipientEmail?: string | null;
  relationshipName?: string | null;
}): string {
  const email = action.recipientEmail?.trim() || "";
  const company = action.relationshipName?.trim() || "";
  if (!email || !company) return "";
  return company;
}

/** Open recovery is "Held". The other stored statuses already have filter names. */
export function recoveryStatusLabel(status: string): string {
  switch (status) {
    case "open":
      return "Held";
    case "snoozed":
      return "Snoozed";
    case "handled":
      return "Handled";
    case "dismissed":
      return "Dismissed";
    default: {
      const words = status.replaceAll("_", " ").trim();
      if (!words) return status;
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
  }
}

export function recoveryEmptyDescription(filter: string): string {
  switch (filter) {
    case "snoozed":
      return "Nothing is snoozed right now.";
    case "handled":
      return "Nothing has been handled yet.";
    case "dismissed":
      return "Nothing has been dismissed.";
    default:
      return "No recovery drafts right now.";
  }
}

/** A follow-up is stored on a company. The empty workspace has nothing to attach it to. */
export function newActionIntro(hasCompany: boolean): string {
  return hasCompany
    ? "Add a follow-up for a company already in this workspace."
    : "Add a company before a follow-up can be created.";
}

export function recoveryNextCompaniesLabel(): string {
  return "Show the next companies";
}

export function recoveryNoCompaniesCopy(hasMoreCompanies: boolean): string {
  return hasMoreCompanies
    ? "More companies are still in this list."
    : "No companies yet. Add one in Companies, or run an audit to find them.";
}

export function QueueView({
  workspace,
  onError,
  onNotice,
  onScan,
  scanning,
  needsReconnect = false,
  needsConnect = false,
  onOpenCompanies,
}: {
  workspace: RevenueWorkspace | null;
  onError: (m: string) => void;
  onNotice: (m: string) => void;
  onScan: () => void;
  scanning: boolean;
  /** The audit can only fail until Google is reconnected; `onScan` opens the fix. */
  needsReconnect?: boolean;
  /** No mailbox is connected, so `onScan` opens connections instead of a scan. */
  needsConnect?: boolean;
  /** Opens the company directory when a new action has nothing to attach to. */
  onOpenCompanies?: () => void;
}) {
  const [filter, setFilter] = React.useState("open");
  const [selected, setSelected] = React.useState<RevenueAction | null>(null);
  const [auditFor, setAuditFor] = React.useState<RevenueAction | null>(null);
  const [creating, setCreating] = React.useState(false);
  const queryClient = useQueryClient();
  const actionsQueryKey = revenueActionKeys.list(filter, ACTION_QUEUE_PAGE, "recovery");
  const actionsQuery = useRevenueActions(filter, ACTION_QUEUE_PAGE, "recovery");
  const [extraActions, setExtraActions] = React.useState<RevenueAction[]>([]);
  const [laterRecoveryHasMore, setLaterRecoveryHasMore] = React.useState<boolean | null>(null);
  const [loadingMoreRecovery, setLoadingMoreRecovery] = React.useState(false);
  const recoveryPage = actionRows(actionsQuery.data);
  const recoveryRows = React.useMemo(() => {
    if (extraActions.length === 0) return recoveryPage;
    const seen = new Set(recoveryPage.map((action) => action.id));
    return [
      ...recoveryPage,
      ...extraActions.filter((action) => {
        if (seen.has(action.id)) return false;
        seen.add(action.id);
        return true;
      }),
    ];
  }, [extraActions, recoveryPage]);
  const actions = recoveryQueueActions(recoveryRows);
  const hasMoreRecovery =
    laterRecoveryHasMore ?? (recoveryPage.length > 0 && actionPageHasMore(actionsQuery.data));
  React.useEffect(() => {
    setExtraActions([]);
    setLaterRecoveryHasMore(null);
  }, [filter]);

  React.useEffect(() => {
    if (!actionsQuery.error || actionsQuery.data != null) return;
    onError(errMessage(actionsQuery.error, "Could not load recovery."));
  }, [actionsQuery.data, actionsQuery.error, onError]);

  const loadMoreRecovery = React.useCallback(async () => {
    if (loadingMoreRecovery || !hasMoreRecovery) return;
    setLoadingMoreRecovery(true);
    try {
      const next = await fetchRevenueActions(
        filter,
        ACTION_QUEUE_PAGE,
        undefined,
        "recovery",
        recoveryPage.length + extraActions.length,
      );
      setLaterRecoveryHasMore(actionPageHasMore(next));
      setExtraActions((current) => [...current, ...actionRows(next)]);
    } catch (reason) {
      onError(explainedRevenueError(reason, "Could not load the next follow-ups."));
    } finally {
      setLoadingMoreRecovery(false);
    }
  }, [
    extraActions.length,
    filter,
    hasMoreRecovery,
    loadingMoreRecovery,
    onError,
    recoveryPage.length,
  ]);

  const removeFromQueue = React.useCallback(
    (id: string) => {
      queryClient.setQueryData(actionsQueryKey, (current) =>
        replaceActionPage(
          current,
          actionRows(current).filter((action) => action.id !== id),
        ),
      );
      setExtraActions((current) => current.filter((action) => action.id !== id));
      setSelected((cur) => (cur?.id === id ? null : cur));
    },
    [actionsQueryKey, queryClient],
  );

  const patchAction = React.useCallback(
    (updated: RevenueAction) => {
      queryClient.setQueryData(actionsQueryKey, (current) =>
        replaceActionPage(
          current,
          actionRows(current).map((action) => (action.id === updated.id ? updated : action)),
        ),
      );
      setExtraActions((current) =>
        current.map((action) => (action.id === updated.id ? updated : action)),
      );
      setSelected((cur) => (cur?.id === updated.id ? updated : cur));
    },
    [actionsQueryKey, queryClient],
  );

  const empty = actionsQuery.data != null && actions.length === 0;
  const auditLabel = auditLaunchLabel({
    needsReconnect,
    needsConnect,
    scanning,
    scanningLabel: "Auditing…",
    runLabel: "Run Promise Leak Audit",
  });

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col p-3" data-slot="queue-view">
      <SimProductPanel className="flex min-h-0 flex-1 flex-col">
        <SimProductHeader
          actions={recoveryShownLabel(actions.length, hasMoreRecovery)}
          title="Recovery queue"
        />
        <SimProductToolbar>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger
              aria-label={recoveryFilterName(filter)}
              className="h-7 w-36 border-0 bg-transparent px-0 shadow-none"
              size="sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="app-shell rounded-[2px]">
              {QUEUE_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="ml-auto" onClick={() => setCreating(true)} size="sm" variant="outline">
            <Plus /> New action
          </Button>
        </SimProductToolbar>

        {actionsQuery.isError && actionsQuery.data != null ? (
          <ListRefreshFailure
            message={listRefreshFailureCopy("recovery")}
            onRetry={() => void refetchClearingBanner(() => actionsQuery.refetch(), onError)}
          />
        ) : null}
        {actionsQuery.isPending ? (
          <div className="p-3">
            <ListSkeleton />
          </div>
        ) : listNeverLoaded(actionsQuery.isError, actionsQuery.data) ? (
          <EmptyBlock
            body="The recovery queue is temporarily unavailable. Existing drafts and approvals were not changed."
            image="recovery"
            learnMore={[]}
            title="Recovery could not load"
          >
            <Button
              onClick={() => void refetchClearingBanner(() => actionsQuery.refetch(), onError)}
              type="button"
              variant="outline"
            >
              Try again
            </Button>
          </EmptyBlock>
        ) : empty ? (
          filter === "open" ? (
            <WorkspaceEmptyState
              action={
                <Button
                  className="bg-[#3478f6] text-white hover:bg-[#2f6fe6]"
                  disabled={scanning}
                  onClick={onScan}
                  size="sm"
                >
                  {needsReconnect || needsConnect ? (
                    <>
                      <Plugs /> {auditLabel}
                    </>
                  ) : (
                    <>
                      {scanning ? <Spinner /> : <MagnifyingGlass />} {auditLabel}
                    </>
                  )}
                </Button>
              }
              description={
                needsConnect ? (
                  <>
                    No recovery drafts yet. Connect Gmail and Calendar
                    <br />
                    before an audit can find promises to recover.
                  </>
                ) : (
                  <>
                    No recovery drafts yet! Run an audit
                    <br />
                    or draft recovery from a promise.
                  </>
                )
              }
              image="recovery"
              learnMore={[
                { label: "Approve recovery before sending" },
                { label: "Draft from a confirmed promise" },
              ]}
              title="Recovery"
            />
          ) : (
            <WorkspaceEmptyState
              description={recoveryEmptyDescription(filter)}
              image="recovery"
              learnMore={[]}
              title="Recovery"
            />
          )
        ) : (
          <>
          <ul className="flex flex-col gap-3 p-3">
            {actions.map((action) => (
              <li key={action.id}>
                <ActionCard
                  action={action}
                  onAudit={() => setAuditFor(action)}
                  onError={onError}
                  onOptimisticRemove={removeFromQueue}
                  onReview={() => {
                    capture(RevenueEvents.ActionReviewed, { detector: action.detector });
                    setSelected(action);
                  }}
                />
              </li>
            ))}
          </ul>
          {hasMoreRecovery ? (
            <Button
              className="m-3"
              disabled={loadingMoreRecovery}
              onClick={() => void loadMoreRecovery()}
              size="sm"
              type="button"
              variant="outline"
            >
              {recoveryRemainderLabel()}
            </Button>
          ) : null}
          </>
        )}
      </SimProductPanel>

      {selected ? (
        <ReviewSheet
          action={selected}
          workspace={workspace}
          onClose={() => setSelected(null)}
          onPatched={patchAction}
          onRemoved={removeFromQueue}
          onError={onError}
          onNotice={onNotice}
          onOpenAudit={(a) => {
            setSelected(null);
            setAuditFor(a);
          }}
        />
      ) : null}

      {auditFor ? (
        <AuditSheet action={auditFor} onClose={() => setAuditFor(null)} onError={onError} />
      ) : null}

      {creating ? (
        <CreateActionDialog
          onClose={() => setCreating(false)}
          onCreated={(a) => {
            setCreating(false);
            onNotice("Action created.");
            if (filter === "open") {
              queryClient.setQueryData<RevenueAction[]>(actionsQueryKey, (current = []) => [
                a,
                ...current,
              ]);
            }
          }}
          onError={onError}
          onOpenCompanies={onOpenCompanies}
        />
      ) : null}
    </div>
  );
}

function ActionCard({
  action,
  onReview,
  onAudit,
  onOptimisticRemove,
  onError,
}: {
  action: RevenueAction;
  onReview: () => void;
  onAudit: () => void;
  onOptimisticRemove: (id: string) => void;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const tone = priorityTone(action.priorityScore);
  const recipient = recoveryRecipientLabel(action);
  const company = recoveryCompanyCaption(action);
  const open = action.queueStatus === "open";
  const sendFailure =
    action.executionStatus === "pending" || action.executionStatus === "failed"
      ? executionFailureCopy(action.executionError)
      : "";
  const dismissal =
    action.queueStatus === "dismissed" ? dismissReasonLabel(action.dismissReason) : "";
  const snooze = action.queueStatus === "snoozed" ? snoozeWakeCopy(action.snoozedUntil) : "";

  const triage = async (kind: "snooze" | "dismiss") => {
    setBusy(kind);
    try {
      if (kind === "dismiss") await dismissAction(action.id, "not_relevant");
      else await snoozeAction(action.id, new Date(Date.now() + 7 * 86_400_000).toISOString());
      onOptimisticRemove(action.id);
    } catch (e) {
      onError(errMessage(e, `Could not ${kind} the action.`));
      setBusy(null);
    }
  };

  return (
    <SimProductPanel className="overflow-hidden">
      <div className="flex items-start gap-4 px-4 py-3">
        <div className="flex w-12 shrink-0 flex-col items-center">
          <span className={cn("text-2xl font-semibold tabular-nums", tone.className)}>
            {action.priorityScore}
          </span>
          <SimBadge className="mt-0.5" variant="amber">
            {tone.label}
          </SimBadge>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SimBadge variant="amber">
              {DETECTOR_LABELS[action.detector] ?? action.detector}
            </SimBadge>
            <Label className="truncate text-sm font-medium text-[var(--text-primary)]">
              {recipient}
            </Label>
            {company ? (
              <Label className="truncate text-[12px] font-normal text-[var(--text-muted)]">
                {company}
              </Label>
            ) : null}
            <Chip className="ml-auto">{recoveryStatusLabel(action.queueStatus)}</Chip>
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm text-[var(--text-secondary)]">
            {action.reason}
          </p>
          {sendFailure ? (
            <p className="mt-1.5 text-sm text-amber-700 dark:text-amber-300">{sendFailure}</p>
          ) : null}
          {dismissal ? (
            <p className="mt-1.5 text-sm text-[var(--text-secondary)]">Dismissed: {dismissal}</p>
          ) : null}
          {snooze ? <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{snooze}</p> : null}
          {action.proposedSubject ? (
            <p className="mt-1 truncate text-xs text-[var(--text-muted)]">
              Draft subject: {action.proposedSubject}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-[var(--border)] border-t px-4 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {action.executionMode === "send" ? <PolicyBadge status={action.policyStatus} /> : null}
          {action.approvalStatus === "approved" ? (
            <Badge
              className="gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
              variant="outline"
            >
              <CheckCircle weight="fill" /> Approved
            </Badge>
          ) : null}
          <ExecutionBadge action={action} />
        </div>
        <div className="flex items-center gap-1">
          <Button onClick={onAudit} size="sm" variant="ghost">
            <ClockCounterClockwise /> History
          </Button>
          {open ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => triage("snooze")}
                disabled={busy !== null}
              >
                {busy === "snooze" ? <Spinner /> : <Alarm />} Snooze
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => triage("dismiss")}
                disabled={busy !== null}
              >
                {busy === "dismiss" ? <Spinner /> : <Prohibit />} Dismiss
              </Button>
              <Button size="sm" onClick={onReview} disabled={busy !== null}>
                <PencilSimple /> Review
              </Button>
            </>
          ) : (
            <Button onClick={onReview} size="sm" variant="outline">
              <PencilSimple /> Open
            </Button>
          )}
        </div>
      </div>
    </SimProductPanel>
  );
}

function CreateActionDialog({
  onClose,
  onCreated,
  onError,
  onOpenCompanies,
}: {
  onClose: () => void;
  onCreated: (a: RevenueAction) => void;
  onError: (m: string) => void;
  onOpenCompanies?: () => void;
}) {
  const relationshipsQuery = useRelationships();
  const directoryRows = React.useMemo(
    () => relationshipRows(relationshipsQuery.data),
    [relationshipsQuery.data],
  );
  const [extraCompanies, setExtraCompanies] = React.useState<RevenueRelationship[]>([]);
  const [companyOffset, setCompanyOffset] = React.useState<number | undefined>();
  const [laterCompaniesHasMore, setLaterCompaniesHasMore] = React.useState<boolean | null>(null);
  const [loadingMoreCompanies, setLoadingMoreCompanies] = React.useState(false);
  React.useEffect(() => {
    setExtraCompanies([]);
    setCompanyOffset(undefined);
    setLaterCompaniesHasMore(null);
  }, [relationshipsQuery.dataUpdatedAt]);
  const relationships = React.useMemo(() => {
    const seen = new Set<string>();
    return [...directoryRows, ...extraCompanies].filter((record) => {
      if (record.kind === "person" || seen.has(record.id)) return false;
      seen.add(record.id);
      return true;
    });
  }, [directoryRows, extraCompanies]);
  const hasMoreCompanies =
    laterCompaniesHasMore ?? relationshipPageHasMore(relationshipsQuery.data);
  const loadMoreCompanies = async () => {
    if (loadingMoreCompanies || !hasMoreCompanies) return;
    setLoadingMoreCompanies(true);
    try {
      const offset = companyOffset ?? directoryRows.length;
      const next = await fetchRelationships({ offset });
      const rows = relationshipRows(next);
      setCompanyOffset(offset + rows.length);
      setLaterCompaniesHasMore(next.hasMore);
      setExtraCompanies((current) => [...current, ...rows]);
    } catch (reason) {
      onError(explainedRevenueError(reason, "Could not load the next companies."));
    } finally {
      setLoadingMoreCompanies(false);
    }
  };
  const [relationshipId, setRelationshipId] = React.useState("");
  const createActionTypes = [
    "warm_follow_up",
    "proposal_nudge",
    "referral_reconnect",
    "customer_risk",
    "meeting_follow_up",
  ] as const satisfies readonly CreateActionInput["actionType"][];
  const [actionType, setActionType] =
    React.useState<CreateActionInput["actionType"]>("warm_follow_up");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (relationshipsQuery.error) {
      onError(errMessage(relationshipsQuery.error, "Could not load companies."));
    }
  }, [onError, relationshipsQuery.error]);

  const submit = async () => {
    if (!relationshipId || !reason.trim()) return;
    setBusy(true);
    onError("");
    try {
      const rel = relationships.find((r) => r.id === relationshipId);
      const created = await createAction({
        relationshipId,
        actionType,
        channel: "email",
        reason: reason.trim(),
        recipientEmail: rel?.primaryEmail,
        proposedSubject: subject || undefined,
        proposedMessage: message || undefined,
        executionMode: "draft",
      });
      onCreated(created);
    } catch (e) {
      onError(errMessage(e, "Could not create the action."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New action</DialogTitle>
          <DialogDescription>
            {newActionIntro(relationships.length > 0 || hasMoreCompanies)}
          </DialogDescription>
        </DialogHeader>
        {relationships.length === 0 && !hasMoreCompanies ? (
          <Empty className="gap-3 py-4">
            <EmptyHeader>
              <EmptyDescription className="text-sm text-primary/55">
                {recoveryNoCompaniesCopy(false)}
              </EmptyDescription>
            </EmptyHeader>
            {onOpenCompanies ? (
              <Button
                onClick={() => {
                  onClose();
                  openCompanyCreate(onOpenCompanies);
                }}
                size="sm"
                type="button"
              >
                <Plus /> Add a company
              </Button>
            ) : null}
          </Empty>
        ) : (
          <div className="flex flex-col gap-3">
            <Select onValueChange={setRelationshipId} value={relationshipId || undefined}>
              <SelectTrigger
                aria-label={recoveryCompanyName(
                  (() => {
                    const selected = relationships.find((item) => item.id === relationshipId);
                    if (selected) return companyName(selected);
                    if (relationships.length === 0 && hasMoreCompanies) {
                      return "More companies are still in this list.";
                    }
                    return "Choose a company";
                  })(),
                )}
                size="sm"
              >
                <SelectValue placeholder="Company" />
              </SelectTrigger>
              <SelectContent className="app-shell rounded-[2px]">
                {relationships.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {companyName(r)}
                    {r.primaryEmail ? ` · ${r.primaryEmail}` : ""}
                  </SelectItem>
                ))}
                {hasMoreCompanies ? (
                  <Button
                    className={cn(
                      "sticky bottom-0 z-10 h-8 w-full justify-start rounded-none",
                      "border-t border-border bg-background px-2 text-[12px]",
                    )}
                    disabled={loadingMoreCompanies}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      void loadMoreCompanies();
                    }}
                    type="button"
                    variant="ghost"
                  >
                    {loadingMoreCompanies ? "Loading…" : recoveryNextCompaniesLabel()}
                  </Button>
                ) : null}
              </SelectContent>
            </Select>
            <Select
              value={actionType}
              onValueChange={(value) => {
                const next = createActionTypes.find((type) => type === value);
                if (next) setActionType(next);
              }}
            >
              <SelectTrigger aria-label={recoveryFollowUpName(actionType)} size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="app-shell rounded-[2px]">
                {createActionTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {ACTION_TYPE_LABELS[t] ?? t.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why this follow-up is needed"
            />
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Draft subject (optional)"
            />
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="Draft message (optional)"
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {relationships.length > 0 ? (
            <Button size="sm" onClick={submit} disabled={busy || !relationshipId || !reason.trim()}>
              {busy ? <Spinner /> : <Plus />} Create
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
