"use client";

import "client-only";

import * as React from "react";
import Link from "next/link";
import { CheckCircle, MagnifyingGlass, Plugs, WarningCircle } from "@/lib/icons";

import { Badge } from "@oppulence/ui/components/badge";
import { Label } from "@oppulence/ui/components/label";
import { Button } from "@oppulence/ui/components/button";
import { Spinner } from "@oppulence/ui/components/spinner";
import {
  ListRefreshFailure,
  listRefreshFailureCopy,
  WorkspaceEmptyState,
} from "@/components/features/revenue/shared/shared";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@oppulence/ui/components/table";
import {
  auditFailureCopy,
  auditLaunchLabel,
  examinedConversationCount,
  relativeTime,
  REVENUE_EVIDENCE_LOOKBACK_LABEL,
} from "@/lib/revenue/revenue";
import type { RevenueLeakScan } from "@/lib/revenue/types";

/** A failed audit list is not a workspace that has never been audited. */
export function auditListFailureCopy(): string {
  return "Audits could not load. Try again.";
}

export function auditRefreshCopy(): string {
  return listRefreshFailureCopy("audits");
}

export function ScansView({
  scans,
  activeScan,
  scanning,
  needsReconnect = false,
  needsConnect = false,
  hasMoreAudits = false,
  loadingEarlierAudits = false,
  earlierAuditsError = null,
  loadFailed = false,
  refreshFailed = false,
  onLoadEarlierAudits,
  onRetry,
  onScan,
}: {
  scans: RevenueLeakScan[];
  activeScan: RevenueLeakScan | null;
  scanning: boolean;
  /** The audit can only fail until Google is reconnected; `onScan` opens the fix. */
  needsReconnect?: boolean;
  /** No mailbox is connected, so `onScan` opens connections instead of a scan. */
  needsConnect?: boolean;
  /** The server found another audit past the scans already loaded. */
  hasMoreAudits?: boolean;
  loadingEarlierAudits?: boolean;
  earlierAuditsError?: string | null;
  /** The audit list request failed and no audits are on screen. */
  loadFailed?: boolean;
  /** A later refresh failed. Audits already loaded stay on screen. */
  refreshFailed?: boolean;
  onLoadEarlierAudits?: () => void;
  onRetry?: () => void;
  onScan: () => void;
}) {
  const rows = React.useMemo(() => {
    const map = new Map<string, RevenueLeakScan>();
    for (const s of scans) map.set(s.id, s);
    if (activeScan) map.set(activeScan.id, activeScan);
    return [...map.values()].sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
  }, [scans, activeScan]);
  const launchLabel = auditLaunchLabel({
    needsReconnect,
    needsConnect,
    scanning,
    scanningLabel: "Auditing…",
    runLabel: "Run Promise Leak Audit",
  });
  const waitingOnGoogle = needsReconnect || needsConnect;

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col" data-slot="scans-view">
      <div className="flex min-h-12 items-center justify-between gap-4 border-b border-border px-3 py-2">
        <p className="min-w-0 flex-1 truncate text-[13px] text-primary/55">
          A Promise Leak Audit reads the last {REVENUE_EVIDENCE_LOOKBACK_LABEL} of Gmail for
          promises and follow-ups that have gone quiet. Nothing is sent without your approval.
        </p>
        <Button size="sm" onClick={onScan} disabled={scanning}>
          {waitingOnGoogle ? <Plugs /> : scanning ? <Spinner /> : <MagnifyingGlass />}
          {launchLabel}
        </Button>
      </div>

      {refreshFailed ? (
        <ListRefreshFailure message={auditRefreshCopy()} onRetry={() => onRetry?.()} />
      ) : null}

      {loadFailed && rows.length === 0 ? (
        <WorkspaceEmptyState
          action={
            <Button onClick={onRetry} size="sm" type="button" variant="outline">
              Try again
            </Button>
          }
          description={auditListFailureCopy()}
          image="audits"
          learnMore={[]}
          title="Audits"
        />
      ) : rows.length === 0 ? (
        <WorkspaceEmptyState
          action={
            <Button
              className="bg-[#3478f6] text-white hover:bg-[#2f6fe6]"
              disabled={scanning}
              onClick={onScan}
              size="sm"
            >
              {waitingOnGoogle ? (
                <>
                  <Plugs /> {launchLabel}
                </>
              ) : (
                <>
                  {scanning ? <Spinner /> : <MagnifyingGlass />} {launchLabel}
                </>
              )}
            </Button>
          }
          description={
            needsConnect ? (
              <>
                Connect Gmail and Calendar before an audit
                <br />
                can read your mail.
              </>
            ) : (
              <>
                No audits yet! Run your first audit
                <br />
                to find promises in your mail.
              </>
            )
          }
          image="audits"
          learnMore={[
            { label: "Reads the mail you connect" },
            { label: "Nothing is sent without approval" },
          ]}
          title="Audits"
        />
      ) : (
        <div className="min-w-0 flex-1 overflow-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="h-10 border-border px-3 text-[12px] text-primary/45 hover:bg-transparent">
                <TableHead className="h-10 min-w-[220px] px-3 text-primary/45">Audit</TableHead>
                <TableHead className="h-10 w-[70px] px-3 text-primary/45">Window</TableHead>
                <TableHead className="h-10 w-[120px] px-3 text-primary/45">Conversations</TableHead>
                <TableHead className="h-10 w-[140px] px-3 text-primary/45">Follow-up signals</TableHead>
                <TableHead className="h-10 w-[100px] px-3 text-primary/45">Drafts</TableHead>
                <TableHead className="h-10 w-[100px] px-3 text-primary/45">Companies</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((scan) => (
                <ScanRow key={scan.id} scan={scan} />
              ))}
            </TableBody>
          </Table>
          {hasMoreAudits ? (
            <div className="border-t border-border px-3 py-3">
              <Button
                disabled={loadingEarlierAudits || !onLoadEarlierAudits}
                onClick={onLoadEarlierAudits}
                size="sm"
                type="button"
                variant="outline"
              >
                {loadingEarlierAudits ? "Loading…" : "Show earlier audits"}
              </Button>
              {earlierAuditsError ? (
                <p className="mt-2 text-[13px] text-destructive">{earlierAuditsError}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ScanRow({ scan }: { scan: RevenueLeakScan }) {
  const running = scan.status === "running" || scan.status === "pending";
  const title = running
    ? "Auditing your inbox…"
    : scan.status === "completed"
      ? "Audit complete"
      : "Audit failed";
  return (
    <TableRow className="min-h-11 border-border px-3 text-[13px] hover:bg-background-100/70">
      <TableCell className="min-w-[220px] px-3 py-2 align-middle whitespace-normal">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            {running ? (
              <Spinner className="size-4 text-primary/60" />
            ) : scan.status === "completed" ? (
              <CheckCircle weight="fill" className="size-4 text-emerald-500" />
            ) : (
              <WarningCircle weight="fill" className="size-4 text-red-500" />
            )}
            {scan.status === "completed" ? (
              <Link
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                href={`/app/report?scan=${encodeURIComponent(scan.id)}`}
              >
                {title}
              </Link>
            ) : (
              <Label className="text-sm font-medium text-primary">{title}</Label>
            )}
            <Badge
              variant="secondary"
              className="ml-auto hidden font-normal text-primary/40 sm:inline-flex"
            >
              {relativeTime(scan.completedAt ?? scan.startedAt)}
            </Badge>
          </div>
          {scan.error ? (
            <p
              className="mt-1 truncate text-[12px] text-primary/45"
              title={auditFailureCopy(scan.error)}
            >
              {auditFailureCopy(scan.error)}
            </p>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="w-[70px] px-3">
        <Badge variant="outline" className="w-fit rounded-[2px] font-normal">
          {scan.lookbackDays}d
        </Badge>
      </TableCell>
      <TableCell
        className="w-[120px] px-3 tabular-nums text-primary/65"
        title={
          (scan.threadsSkipped ?? 0) > 0
            ? `${scan.threadsSkipped} were not conversations`
            : undefined
        }
      >
        {examinedConversationCount(scan)}
      </TableCell>
      <TableCell className="w-[140px] px-3 tabular-nums text-primary/65">
        {scan.candidatesSeen ?? 0}
      </TableCell>
      <TableCell className="w-[100px] px-3 tabular-nums text-primary/65">
        {scan.actionsCreated ?? 0}
      </TableCell>
      <TableCell className="w-[100px] px-3 tabular-nums text-primary/65">
        {scan.relationshipsCreated ?? 0}
      </TableCell>
    </TableRow>
  );
}
