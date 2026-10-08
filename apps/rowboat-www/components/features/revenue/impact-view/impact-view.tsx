"use client";

import "client-only";

import * as React from "react";
import { EnvelopeSimple, MagnifyingGlass, Plugs, WarningDiamond } from "@/lib/icons";
import { useImpactBundle } from "@/hooks/queries/use-impact";
import { useRelationships } from "@/hooks/queries/use-relationships";
import {
  relationshipPageHasMore,
  relationshipRows,
} from "@/hooks/queries/utils/fetch-relationships";

import { Alert, AlertDescription, AlertTitle } from "@oppulence/ui/components/alert";
import { Badge } from "@oppulence/ui/components/badge";
import { Button } from "@oppulence/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@oppulence/ui/components/card";
import { Label } from "@oppulence/ui/components/label";
import { Spinner } from "@oppulence/ui/components/spinner";
import { Progress } from "@oppulence/ui/components/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@oppulence/ui/components/table";

import { actionReasonCopy, attentionReasonLabel, auditLaunchLabel } from "@/lib/revenue/revenue";
import { detectorsWithoutTasks, recoveryOpenCount } from "@/lib/revenue/revenue-records";
import type { RevenueImpact } from "@/lib/revenue/types";
import {
  EmptyBlock,
  errMessage,
  ListRefreshFailure,
  listRefreshFailureCopy,
  ListSkeleton,
  priorityTone,
  refetchClearingBanner,
} from "@/components/features/revenue/shared/shared";
import { cn } from "@/lib/utils";

/**
 * The impact totals are open promises past their due time. "Missed" is a
 * different, closed state. A mutual promise is in the total and in neither
 * side, so it gets its own line when that remainder is real.
 */
export function overdueDirectionLines(
  impact: Pick<RevenueImpact, "overdueCommitments" | "overdueByUs" | "overdueByThem">,
): { label: string; value: number }[] {
  const together = Math.max(
    0,
    impact.overdueCommitments - impact.overdueByUs - impact.overdueByThem,
  );
  const lines = [
    { label: "Overdue from us", value: impact.overdueByUs },
    { label: "Overdue from them", value: impact.overdueByThem },
  ];
  if (together > 0) lines.push({ label: "Overdue together", value: together });
  return lines;
}

/**
 * "Missed" means a promise is already past due. An open follow-up that is
 * still on time is exposure, and the heading has to say that.
 */
export function impactExposureTitle(overdue: number): string {
  const count = Number.isFinite(overdue) ? Math.max(0, Math.round(overdue)) : 0;
  if (count > 0) return "What missed communication is putting at risk now";
  return "What is putting these companies at risk now";
}

/**
 * A zero count is an empty bar. The two-percent floor is only so a small
 * non-zero count stays visible next to a much larger one.
 */
export function funnelBarPercent(value: number, max: number): number {
  const shown = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (shown === 0) return 0;
  const scale = Number.isFinite(max) && max > 0 ? max : 1;
  return Math.max(2, (shown / scale) * 100);
}

/**
 * A real overdue promise is counted as at least one day. Zero means none are
 * past due, so the line must not say "0 days".
 */
export function longestOverdueCopy(days: number): string {
  const shown = Number.isFinite(days) ? Math.max(0, Math.round(days)) : 0;
  if (shown === 0) return "None";
  if (shown === 1) return "1 day";
  return `${shown} days`;
}

/**
 * Impact's relationship total counts People records too. The "of N companies"
 * line is about companies, so a person saved from People is not a company.
 * The directory is paged. A full first page is not the portfolio, and the
 * count says another company may still be past it. Until that list has
 * loaded, the impact total is the only number available.
 */
export function impactAccountTotal(
  relationships: readonly { kind?: string }[] | undefined,
  fallback: number,
  hasMore = false,
): string {
  if (!relationships) return String(fallback);
  const accounts = relationships.filter((record) => record.kind !== "person").length;
  return hasMore ? `${accounts}+` : String(accounts);
}

/**
 * The digest email already names a signal. A stored token, or a name the
 * API left blank, is not what the preview badge should print.
 */
export function digestFailureCopy(): string {
  return "The weekly digest could not load. Try again.";
}

export function digestRefreshCopy(): string {
  return "Could not refresh the weekly digest. Try again.";
}

export function impactRefreshCopy(): string {
  return listRefreshFailureCopy("impact");
}

/** A promise already in Promises stays visible when Impact has nothing else to score. */
export function recordedPromisePrefix(count: number | undefined, hasMore = false): string {
  const total = Number.isFinite(count) ? Math.max(0, Math.round(count ?? 0)) : 0;
  if (total <= 0) return "";
  const sentence = hasMore
    ? `${total}+ promises are already in Promises.`
    : total === 1
      ? "1 promise is already in Promises."
      : `${total} promises are already in Promises.`;
  return `${sentence} `;
}

/**
 * An empty impact page with a dead Google grant cannot run an audit. The
 * button already says reconnect. The sentence has to say that too.
 */
export function impactEmptyBody(input: {
  needsConnect: boolean;
  needsReconnect: boolean;
  knownPromiseCount?: number;
  knownPromiseHasMore?: boolean;
}): string {
  const prefix = recordedPromisePrefix(input.knownPromiseCount, input.knownPromiseHasMore);
  if (input.needsReconnect) {
    return `${prefix}Reconnect Google. Replies, meetings, and wins show up here after an audit.`;
  }
  if (input.needsConnect) {
    return `${prefix}Connect Gmail and Calendar. Replies, meetings, and wins show up here after an audit.`;
  }
  return `${prefix}Run an audit and start reviewing actions — replies, meetings, and wins show up here as they come in.`;
}

/** Digest email is off for this workspace. The card is a preview, not a sent message. */
export function digestPreviewBadge(): string {
  return "Preview of open loops";
}

export function digestSignalLabel(detector: string): string {
  const value = detector.trim();
  if (!value) return "";
  if (value === "Manual") return "Added by you";
  if (/^[a-z0-9_]+$/.test(value)) return attentionReasonLabel(value);
  return value;
}

/** The digest names who the loop is for. The preview names them too. */
export function digestLoopCopy(action: {
  recipient?: string | null;
  reason?: string | null;
}): string {
  const who = action.recipient?.trim() || "a contact";
  const why = actionReasonCopy(action.reason);
  if (!why) return who;
  return `${who}. ${why}`;
}

function DigestLoadNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <p className="text-[13px] text-primary/70">{digestFailureCopy()}</p>
      <Button onClick={onRetry} size="sm" type="button" variant="outline">
        Try again
      </Button>
    </div>
  );
}

export function ImpactView({
  onError,
  onScan,
  scanning = false,
  needsReconnect = false,
  needsConnect = false,
  knownPromiseCount = 0,
  knownPromiseHasMore = false,
  knownPromisesPending = false,
}: {
  onError: (m: string) => void;
  /** Same audit the Audits and Recovery empty states start. Omitted in tests that only retry a failed load. */
  onScan?: () => void;
  scanning?: boolean;
  /** The audit can only fail until Google is reconnected; `onScan` opens the fix. */
  needsReconnect?: boolean;
  /** No mailbox is connected, so `onScan` opens connections instead of a scan. */
  needsConnect?: boolean;
  /** Open or at-risk promises already in Promises. */
  knownPromiseCount?: number;
  knownPromiseHasMore?: boolean;
  /** The empty sentence waits so it does not hide a promise that is still loading. */
  knownPromisesPending?: boolean;
}) {
  const impactQuery = useImpactBundle();
  const relationshipsQuery = useRelationships();

  React.useEffect(() => {
    if (!impactQuery.error || impactQuery.data) return;
    onError(errMessage(impactQuery.error, "Could not load impact."));
  }, [impactQuery.data, impactQuery.error, onError]);

  if (impactQuery.isPending) return <ListSkeleton rows={2} />;
  if (!impactQuery.data) {
    return (
      <EmptyBlock
        body="Impact data is temporarily unavailable. Your companies and people were not changed."
        image="impact"
        learnMore={[]}
        title="Impact could not load"
      >
        <Button
          onClick={() => void refetchClearingBanner(() => impactQuery.refetch(), onError)}
          type="button"
          variant="outline"
        >
          Try again
        </Button>
      </EmptyBlock>
    );
  }
  const { data, digest, digestFailed } = impactQuery.data;
  const reload = () => void refetchClearingBanner(() => impactQuery.refetch(), onError);
  const accountTotal = impactAccountTotal(
    relationshipsQuery.isSuccess ? relationshipRows(relationshipsQuery.data) : undefined,
    data.relationships,
    relationshipsQuery.isSuccess && relationshipPageHasMore(relationshipsQuery.data),
  );
  const atRiskShown = data.atRiskRelationships;
  const riskScore = data.portfolioRiskScore;
  const riskReasons = data.riskReasons ?? [];
  const taskCount = Math.max(0, data.openTasks);
  const recoveryOpen = recoveryOpenCount(data.open, taskCount);
  const surfacedShown = Math.max(0, data.surfaced - taskCount);
  const openShown = recoveryOpen;
  const digestTop = digest?.top ?? [];
  const digestOpen = Math.max(0, digest?.openCount ?? 0);

  if (
    surfacedShown === 0 &&
    atRiskShown === 0 &&
    data.overdueCommitments === 0 &&
    openShown === 0
  ) {
    const auditLabel = auditLaunchLabel({
      needsReconnect,
      needsConnect,
      scanning,
      scanningLabel: "Auditing…",
      runLabel: "Run Promise Leak Audit",
    });
    if (knownPromisesPending) return <ListSkeleton rows={2} />;
    return (
      <div className="flex min-h-full flex-col" data-slot="impact-view">
        {impactQuery.isError ? (
          <ListRefreshFailure message={impactRefreshCopy()} onRetry={reload} />
        ) : null}
        {digestFailed && digestTop.length === 0 ? <DigestLoadNotice onRetry={reload} /> : null}
        <EmptyBlock
          body={impactEmptyBody({
            needsConnect,
            needsReconnect,
            knownPromiseCount,
            knownPromiseHasMore,
          })}
          image="impact"
          learnMore={[{ label: "Track recovery outcomes" }, { label: "Measure company risk" }]}
          title="Impact"
        >
          {onScan ? (
            <Button
              className="bg-[#3478f6] text-white hover:bg-[#2f6fe6]"
              disabled={scanning}
              onClick={onScan}
              size="sm"
              type="button"
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
          ) : null}
        </EmptyBlock>
      </div>
    );
  }

  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  const funnel = [
    { label: "Surfaced", value: surfacedShown },
    { label: "Approved", value: data.approved },
    { label: "Drafted / sent", value: data.executed },
    { label: "Replied", value: data.replied },
    { label: "Meetings", value: data.meetingsBooked },
  ];
  const maxFunnel = Math.max(...funnel.map((f) => f.value), 1);

  // "source_degradation" means we stopped receiving evidence. It is the only
  // risk reason that is about our own plumbing rather than the relationship.
  const degradedCount =
    data.riskReasons?.find((risk) => risk.reason === "source_degradation")?.relationships ?? 0;
  const sourceDegradationDominates = degradedCount > 0 && degradedCount >= Math.max(1, atRiskShown);

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col gap-6" data-slot="impact-view">
      {impactQuery.isError ? (
        <ListRefreshFailure message={impactRefreshCopy()} onRetry={reload} />
      ) : null}
      <Card className="gap-0 py-0" data-capability="relationship-impact">
        <CardHeader className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
          <div>
            <Badge className="font-mono text-[10px] uppercase tracking-wider" variant="outline">
              Company exposure
            </Badge>
            <CardTitle className="mt-1 text-base text-primary">
              {impactExposureTitle(data.overdueCommitments)}
            </CardTitle>
            <CardDescription className="mt-1 max-w-3xl text-xs text-primary/50">
              The score is deterministic: each company contributes its highest open risk rank,
              divided across the active portfolio. No invented contract or pipeline value.
            </CardDescription>
          </div>
          <Badge className="gap-2 font-normal text-primary/50" variant="secondary">
            <WarningDiamond className="size-4 text-amber-500" /> Updated from live company state
          </Badge>
        </CardHeader>
        {/* Exposure caused by a broken source is a statement about us, not
            about the customer's companies. Rendered as portfolio risk it reads
            as "your business is on fire" when the truth is "we cannot see your
            mail" — so when degradation drives most of the exposure, that is
            said first, before any score. */}
        {sourceDegradationDominates ? (
          <Alert className="rounded-none border-x-0 border-t border-amber-500/40 bg-amber-500/[0.06]">
            <WarningDiamond className="size-4 text-amber-500" />
            <AlertTitle className="text-[13px] text-primary">
              This score reflects missing data, not company behaviour.
            </AlertTitle>
            <AlertDescription className="text-[13px] text-primary/60">
              {degradedCount} of {accountTotal} companies are exposed because a connected source
              stopped reporting. Reconnect it before reading these numbers as risk.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid grid-cols-2 divide-x divide-y divide-border md:grid-cols-4 md:divide-y-0">
          <Stat label="Portfolio risk score" value={`${riskScore}/100`} />
          <Stat label={`At-risk companies of ${accountTotal}`} value={atRiskShown} />
          <Stat label="Critical companies" value={data.criticalRelationships} />
          <Stat label="Overdue promises" value={data.overdueCommitments} />
        </div>
        <div className="grid border-t border-border md:grid-cols-[1fr_1fr] md:divide-x md:divide-border">
          <dl className="space-y-2 p-4 text-sm">
            {overdueDirectionLines(data).map((line) => (
              <Line key={line.label} label={line.label} value={line.value} />
            ))}
            <Line label="Longest overdue" value={longestOverdueCopy(data.longestOverdueDays)} />
          </dl>
          <div className="border-t border-border p-4 md:border-t-0">
            <p className="mb-2 text-xs font-medium text-primary/55">Why companies are exposed</p>
            {riskReasons.length ? (
              <ul className="space-y-1.5 text-sm">
                {riskReasons.map((risk) => (
                  <li className="flex items-center justify-between gap-3" key={risk.reason}>
                    <Label className="font-normal text-primary/60">
                      {attentionReasonLabel(risk.reason)}
                    </Label>
                    <Badge
                      className="rounded-none tabular-nums font-normal text-primary/80"
                      variant="outline"
                    >
                      {risk.relationships}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-primary/40">No active company risks.</p>
            )}
          </div>
        </div>
      </Card>

      {digestFailed && digestTop.length === 0 ? <DigestLoadNotice onRetry={reload} /> : null}
      {/* Queue preview. Digest email stays off, matching Notifications. */}
      {digestTop.length ? (
        <Card className="gap-3 py-4">
          <CardHeader className="px-4 pb-0">
            <div className="flex items-center gap-2">
              <EnvelopeSimple weight="fill" className="size-4 text-primary/55" />
              <CardTitle className="text-sm text-primary">Your weekly digest</CardTitle>
              <Badge className="font-normal text-primary/45" variant="secondary">
                {digestPreviewBadge()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="px-4">
            {digestFailed ? (
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[13px] text-primary/70">{digestRefreshCopy()}</p>
                <Button onClick={reload} size="sm" type="button" variant="outline">
                  Try again
                </Button>
              </div>
            ) : null}
            <ul className="flex flex-col gap-1.5">
              {digestTop.map((a, i) => {
                const signal = digestSignalLabel(a.detector ?? "");
                return (
                  <li key={i} className="flex items-center justify-between gap-3 text-sm">
                    <Label className="truncate font-normal text-primary/75">
                      {signal ? (
                        <Badge className="mr-1 font-normal text-primary/45" variant="outline">
                          {signal}
                        </Badge>
                      ) : null}
                      {digestLoopCopy(a)}
                    </Label>
                    <Badge className="shrink-0 font-normal text-primary/40" variant="secondary">
                      {priorityTone(a.priority ?? 0).label}
                    </Badge>
                  </li>
                );
              })}
            </ul>
            {digestOpen > digestTop.length ? (
              <CardDescription className="mt-2 text-xs text-primary/45">
                +{digestOpen - digestTop.length} more in your queue
              </CardDescription>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* headline stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Open loops surfaced" value={surfacedShown} />
        <Stat label="Drafted / sent" value={data.executed} />
        <Stat label="Reply rate" value={pct(data.replyRate)} tone="good" />
        <Stat label="Meetings booked" value={data.meetingsBooked} tone="good" />
      </div>

      {/* funnel */}
      <Card className="gap-3 py-4">
        <CardHeader className="px-4 pb-0">
          <CardTitle className="text-sm text-primary">From surfaced to booked</CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <ul className="flex flex-col gap-2">
            {funnel.map((f) => (
              <li key={f.label} className="flex items-center gap-3">
                <Label className="w-28 shrink-0 text-xs font-normal text-primary/55">
                  {f.label}
                </Label>
                <Progress
                  className="h-5 flex-1 rounded-none bg-background-100 dark:bg-background-100/50 [&>[data-slot=progress-indicator]]:bg-oppulence-orange/70"
                  value={funnelBarPercent(f.value, maxFunnel)}
                />
                <Badge
                  className="w-8 shrink-0 justify-center tabular-nums font-medium text-primary"
                  variant="secondary"
                >
                  {f.value}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* triage split + wins */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4 pb-0">
            <CardTitle className="text-sm text-primary">Triage</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <dl className="flex flex-col gap-1.5 text-sm">
              <Line label="Open" value={openShown} />
              <Line label="Handled" value={data.handled} />
              <Line label="Snoozed" value={data.snoozed} />
              <Line label="Dismissed" value={data.dismissed} />
            </dl>
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardHeader className="px-4 pb-0">
            <CardTitle className="text-sm text-primary">Outcomes</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <dl className="flex flex-col gap-1.5 text-sm">
              <Line label="Replied" value={data.replied} />
              <Line label="Meetings booked" value={data.meetingsBooked} />
              <Line label="Won" value={data.won} tone="good" />
              <Line label="Lost" value={data.lost} />
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* per-detector */}
      {detectorsWithoutTasks(data.byDetector, taskCount).length ? (
        <Card className="gap-3 py-4">
          <CardHeader className="px-4 pb-0">
            <CardTitle className="text-sm text-primary">Which signals pay off</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <Table>
              <TableHeader>
                <TableRow className="text-xs text-primary/45 hover:bg-transparent">
                  <TableHead className="font-normal">Signal</TableHead>
                  <TableHead className="text-right font-normal">Surfaced</TableHead>
                  <TableHead className="text-right font-normal">Handled</TableHead>
                  <TableHead className="text-right font-normal">Handled %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...detectorsWithoutTasks(data.byDetector, taskCount)]
                  .sort((a, b) => b.surfaced - a.surfaced)
                  .map((d) => (
                    <TableRow key={d.detector}>
                      <TableCell className="text-primary/80">
                        {attentionReasonLabel(d.detector)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-primary/70">
                        {d.surfaced}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-primary/70">
                        {d.handled}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-primary/55">
                        {d.surfaced > 0 ? `${Math.round((d.handled / d.surfaced) * 100)}%` : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

/** A zero, or a rate that cannot be computed, is not a win. */
export function statReadsAsGood(value: number | string): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  const match = /^(\d+(?:\.\d+)?)%$/.exec(String(value).trim());
  return match ? Number(match[1]) > 0 : false;
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "good" }) {
  return (
    <CardContent className="p-3">
      <div
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "good" && statReadsAsGood(value)
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-primary",
        )}
      >
        {value}
      </div>
      <Label className="mt-0.5 text-xs font-normal text-primary/55">{label}</Label>
    </CardContent>
  );
}

function Line({
  label,
  value,
  tone,
  suffix = "",
}: {
  label: string;
  value: number | string;
  tone?: "good";
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label asChild className="font-normal text-primary/55">
        <dt>{label}</dt>
      </Label>
      <Badge
        asChild
        className={cn(
          "tabular-nums font-normal",
          tone === "good" && typeof value === "number" && value > 0
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-primary/80",
        )}
        variant="secondary"
      >
        <dd>
          {value}
          {suffix}
        </dd>
      </Badge>
    </div>
  );
}
