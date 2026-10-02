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

import { attentionReasonLabel, auditLaunchLabel } from "@/lib/revenue/revenue";
import { detectorsWithoutTasks, recoveryOpenCount } from "@/lib/revenue/revenue-records";
import type { RevenueImpact } from "@/lib/revenue/types";
import {
  EmptyBlock,
  errMessage,
  ListSkeleton,
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
 * Impact's relationship total counts People records too. The "of N accounts"
 * line is about companies, so a person saved from People is not an account.
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

export function digestSignalLabel(detector: string): string {
  const value = detector.trim();
  if (!value) return "";
  if (/^[a-z0-9_]+$/.test(value)) return attentionReasonLabel(value);
  return value;
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
}: {
  onError: (m: string) => void;
  /** Same audit the Audits and Recovery empty states start. Omitted in tests that only retry a failed load. */
  onScan?: () => void;
  scanning?: boolean;
  /** The audit can only fail until Google is reconnected; `onScan` opens the fix. */
  needsReconnect?: boolean;
  /** No mailbox is connected, so `onScan` opens connections instead of a scan. */
  needsConnect?: boolean;
}) {
  const impactQuery = useImpactBundle();
  const relationshipsQuery = useRelationships();

  React.useEffect(() => {
    if (impactQuery.error) {
      onError(errMessage(impactQuery.error, "Could not load impact."));
    }
  }, [impactQuery.error, onError]);

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
    return (
      <div className="flex min-h-full flex-col" data-slot="impact-view">
        {digestFailed && digestTop.length === 0 ? <DigestLoadNotice onRetry={reload} /> : null}
        <EmptyBlock
        body={
          needsConnect
            ? "Connect Gmail and Calendar. Replies, meetings, and wins show up here after an audit."
            : "Run an audit and start reviewing actions — replies, meetings, and wins show up here as they come in."
        }
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
      <Card className="gap-0 py-0" data-capability="relationship-impact">
        <CardHeader className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
          <div>
            <Badge className="font-mono text-[10px] uppercase tracking-wider" variant="outline">
              Company exposure
            </Badge>
            <CardTitle className="mt-1 text-base text-primary">
              What missed communication is putting at risk now
            </CardTitle>
            <CardDescription className="mt-1 max-w-3xl text-xs text-primary/50">
              The score is deterministic: each account contributes its highest open risk rank,
              divided across the active portfolio. No invented contract or pipeline value.
            </CardDescription>
          </div>
          <Badge className="gap-2 font-normal text-primary/50" variant="secondary">
            <WarningDiamond className="size-4 text-amber-500" /> Updated from live account state
          </Badge>
        </CardHeader>
        {/* Exposure caused by a broken source is a statement about us, not
            about the customer's accounts. Rendered as portfolio risk it reads
            as "your business is on fire" when the truth is "we cannot see your
            mail" — so when degradation drives most of the exposure, that is
            said first, before any score. */}
        {sourceDegradationDominates ? (
          <Alert className="rounded-none border-x-0 border-t border-amber-500/40 bg-amber-500/[0.06]">
            <WarningDiamond className="size-4 text-amber-500" />
            <AlertTitle className="text-[13px] text-primary">
              This score reflects missing data, not account behaviour.
            </AlertTitle>
            <AlertDescription className="text-[13px] text-primary/60">
              {degradedCount} of {accountTotal} accounts are exposed because a connected source
              stopped reporting. Reconnect it before reading these numbers as risk.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid grid-cols-2 divide-x divide-y divide-border md:grid-cols-4 md:divide-y-0">
          <Stat label="Portfolio risk score" value={`${riskScore}/100`} />
          <Stat label={`At-risk accounts of ${accountTotal}`} value={atRiskShown} />
          <Stat label="Critical accounts" value={data.criticalRelationships} />
          <Stat label="Overdue promises" value={data.overdueCommitments} />
        </div>
        <div className="grid border-t border-border md:grid-cols-[1fr_1fr] md:divide-x md:divide-border">
          <dl className="space-y-2 p-4 text-sm">
            {overdueDirectionLines(data).map((line) => (
              <Line key={line.label} label={line.label} value={line.value} />
            ))}
            <Line label="Longest overdue" value={data.longestOverdueDays} suffix=" days" />
          </dl>
          <div className="border-t border-border p-4 md:border-t-0">
            <p className="mb-2 text-xs font-medium text-primary/55">Why accounts are exposed</p>
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
      {/* weekly digest preview — the same summary the email is built from */}
      {digestTop.length ? (
        <Card className="gap-3 py-4">
          <CardHeader className="px-4 pb-0">
            <div className="flex items-center gap-2">
              <EnvelopeSimple weight="fill" className="size-4 text-primary/55" />
              <CardTitle className="text-sm text-primary">Your weekly digest</CardTitle>
              <Badge className="font-normal text-primary/45" variant="secondary">
                emailed while you have open loops
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
                const signal = digestSignalLabel(a.detector);
                return (
                  <li key={i} className="flex items-center justify-between gap-3 text-sm">
                    <Label className="truncate font-normal text-primary/75">
                      {signal ? (
                        <Badge className="mr-1 font-normal text-primary/45" variant="outline">
                          {signal}
                        </Badge>
                      ) : null}
                      {a.reason}
                    </Label>
                    <Badge
                      className="shrink-0 tabular-nums font-normal text-primary/40"
                      variant="secondary"
                    >
                      {a.priority}
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
                  value={Math.max(2, (f.value / maxFunnel) * 100)}
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
                  <TableHead className="font-normal">Detector</TableHead>
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

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "good" }) {
  return (
    <CardContent className="p-3">
      <div
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "good" ? "text-emerald-600 dark:text-emerald-400" : "text-primary",
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
  value: number;
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
          tone === "good" && value > 0
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
