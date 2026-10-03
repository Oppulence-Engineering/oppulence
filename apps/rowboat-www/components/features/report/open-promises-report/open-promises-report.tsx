"use client";

import "client-only";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightIcon, CircleNotchIcon, ExportIcon, PlugsIcon, WarningIcon } from "@/lib/icons";
import {
  useOpenPromisesReport,
  useReportScan,
  useReportScanList,
} from "@/hooks/queries/use-report";
import { useRelationshipSourceStatuses } from "@/hooks/queries/use-relationship-sources";
import {
  commitmentPageHasMore,
  commitmentRows,
  fetchCommitments,
} from "@/hooks/queries/utils/fetch-commitments";
import {
  COMMITMENT_REGISTER_STALE_TIME,
  commitmentKeys,
} from "@/hooks/queries/utils/commitment-keys";
import { REGISTER_PAGE_SIZE } from "@/lib/revenue/commitment-register-filter";
import { reportKeys } from "@/hooks/queries/utils/report-keys";
import { relationshipSourceKeys } from "@/hooks/queries/utils/relationship-source-keys";
import { useReportScanParam } from "@/hooks/dashboard/use-product-route-state";
import { downloadMarkdown } from "@/lib/content/download-markdown";

import { WorkspaceEmptyState } from "@/components/features/revenue/shared/shared";
import { Badge } from "@oppulence/ui/components/badge";
import { Button } from "@oppulence/ui/components/button";
import { Label } from "@oppulence/ui/components/label";
import { capture, RevenueEvents } from "@/lib/analytics/analytics";
import { createGoogleCommitmentsAuthorizationURL } from "@/lib/api/connectors/google-oauth";
import {
  GOOGLE_OAUTH_CLAIM_RESULT_EVENT,
  GOOGLE_OAUTH_CONNECTED_EVENT,
  type GoogleOAuthClaimResult,
} from "@/components/features/connectors/google-oauth-return-handler/google-oauth-return-handler";
import {
  auditFailureCopy,
  auditHistoryLabel,
  getOpenPromisesReportMarkdown,
  latestCompletedScan,
  relationshipSourceHealth,
  REVENUE_EVIDENCE_LOOKBACK_DAYS,
  REVENUE_EVIDENCE_LOOKBACK_LABEL,
  safeResearchCitationURL,
  shownRequestError,
  startScan,
} from "@/lib/revenue/revenue";
import { promiseDirectionLabel, promiseDueLabel } from "@/lib/revenue/revenue-records";
import type { OpenPromisesReport, RelationshipSourceStatus } from "@/lib/revenue/types";

export function OpenPromisesReportClient() {
  // The app shell already holds the session; Suspense is here for the scan id,
  // which this page reads from the URL.
  return (
    <React.Suspense fallback={null}>
      <ReportBody />
    </React.Suspense>
  );
}

function ReportBody() {
  // The running scan is identified in the URL. That makes "leave the page and
  // come back" work with no browser storage, and the link is shareable.
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const [reportParams, setReportParams] = useReportScanParam();
  const scanId = reportParams.scan;
  const googleConnectedInURL = params.get("google_connected") === "1";
  const hasGoogleCallback = Boolean(params.get("google_session") || params.get("google_status"));
  const setScanId = React.useCallback(
    (id: string | null) => {
      void setReportParams({ scan: id });
    },
    [setReportParams],
  );
  const [starting, setStarting] = React.useState(false);
  const [connecting, setConnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [googleOAuthClaimed, setGoogleOAuthClaimed] = React.useState(false);
  const [googleClaimState, setGoogleClaimState] = React.useState<
    GoogleOAuthClaimResult | "claiming" | "idle"
  >(hasGoogleCallback ? "claiming" : "idle");
  const autoScanStarted = React.useRef(false);

  React.useEffect(() => {
    const acknowledgeReturn = () => {
      setGoogleOAuthClaimed(true);
    };
    const recordClaimResult = (event: Event) => {
      setGoogleClaimState((event as CustomEvent<GoogleOAuthClaimResult>).detail);
    };
    window.addEventListener(GOOGLE_OAUTH_CONNECTED_EVENT, acknowledgeReturn);
    window.addEventListener(GOOGLE_OAUTH_CLAIM_RESULT_EVENT, recordClaimResult);
    return () => {
      window.removeEventListener(GOOGLE_OAUTH_CONNECTED_EVENT, acknowledgeReturn);
      window.removeEventListener(GOOGLE_OAUTH_CLAIM_RESULT_EVENT, recordClaimResult);
    };
  }, []);

  const sourcesQuery = useRelationshipSourceStatuses({
    refetchInterval: (query) => {
      const google = (query.state.data ?? []).find((source) => source.source === "google");
      return googleSourceSyncActive(google) ? 2_000 : false;
    },
  });
  const googleSource = sourcesQuery.data?.find((source) => source.source === "google");
  const health = relationshipSourceHealth(sourcesQuery.data ?? []);
  const connectGate = health === "not_connected" || health === "needs_reconnect";
  const knownPromises = useQuery({
    queryKey: [...commitmentKeys.lists(), "report-known"],
    queryFn: ({ signal }) =>
      fetchCommitments({ state: ["open", "at_risk"], limit: REGISTER_PAGE_SIZE }, signal),
    enabled: connectGate,
    staleTime: COMMITMENT_REGISTER_STALE_TIME,
  });
  const knownCopy = reportKnownPromiseCopy(
    commitmentRows(knownPromises.data).length,
    commitmentPageHasMore(knownPromises.data),
  );

  const scansQuery = useReportScanList();
  const {
    earlierAuditsError,
    hasMoreAudits,
    loadEarlierAudits,
    loadingEarlierAudits,
  } = scansQuery;
  const effectiveScanId = scanId ?? latestCompletedScan(scansQuery.data ?? [])?.id ?? null;

  const scanQuery = useReportScan(effectiveScanId, {
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 2_000;
    },
  });
  const scanDone = scanQuery.data?.status === "completed";
  const scanTerminal =
    scanQuery.data?.status === "completed" || scanQuery.data?.status === "failed";

  React.useEffect(() => {
    if (!scanTerminal) return;
    void queryClient.invalidateQueries({ queryKey: relationshipSourceKeys.lists() });
    void queryClient.invalidateQueries({ queryKey: reportKeys.scans() });
  }, [queryClient, scanTerminal]);

  const reportQuery = useOpenPromisesReport(effectiveScanId, scanDone);

  React.useEffect(() => {
    if (reportQuery.data) {
      capture(RevenueEvents.ReportViewed, {
        outbound: reportQuery.data.outboundCount,
        inbound: reportQuery.data.inboundCount,
      });
    }
  }, [reportQuery.data]);

  const run = React.useCallback(async () => {
    if (health !== "ready") {
      setError(
        health === "needs_reconnect"
          ? "Reconnect Google before starting another audit."
          : "Connect Gmail and Calendar before starting an audit.",
      );
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const scan = await startScan(REVENUE_EVIDENCE_LOOKBACK_DAYS);
      setScanId(scan.id);
      capture(RevenueEvents.ScanStarted, {
        lookbackDays: REVENUE_EVIDENCE_LOOKBACK_DAYS,
        surface: "report",
      });
    } catch (e) {
      setError(shownRequestError(e, "Could not start the scan."));
    } finally {
      setStarting(false);
    }
  }, [health, setScanId]);

  React.useEffect(() => {
    if (
      (!googleConnectedInURL && !googleOAuthClaimed) ||
      autoScanStarted.current ||
      sourcesQuery.isLoading ||
      scansQuery.isLoading ||
      health !== "ready"
    ) {
      return;
    }
    autoScanStarted.current = true;
    const activeScan = scansQuery.data?.find(
      (scan) => scan.status !== "completed" && scan.status !== "failed",
    );
    if (activeScan) {
      setScanId(activeScan.id);
      return;
    }
    void run();
  }, [
    googleConnectedInURL,
    googleOAuthClaimed,
    health,
    run,
    scansQuery.data,
    scansQuery.isLoading,
    setScanId,
    sourcesQuery.isLoading,
  ]);

  const connectGoogle = React.useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      window.location.assign(
        (await createGoogleCommitmentsAuthorizationURL("/app/report")).toString(),
      );
    } catch (error) {
      setError(shownRequestError(error, "Google authorization could not be started."));
      setConnecting(false);
    }
  }, []);

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10"
      data-slot="open-promises-report"
    >
      <header>
        <h1 className="text-[28px] font-medium leading-tight text-primary">Open promises</h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-primary/60">
          Promises from the last {REVENUE_EVIDENCE_LOOKBACK_LABEL} that still look open, and the
          message each one came from.
        </p>
      </header>

      {(scansQuery.data?.length ?? 0) > 1 ? (
        <div className="flex flex-col gap-2">
          <Label className="flex items-center gap-3 text-xs text-primary/55">
            Audit
            <select
              className="h-8 min-w-56 border border-border bg-background px-2 text-xs text-primary"
              onChange={(event) => {
                setScanId(event.target.value || null);
              }}
              value={effectiveScanId ?? ""}
            >
              {scansQuery.data?.map((scan) => (
                <option key={scan.id} value={scan.id}>
                  {auditHistoryLabel(scan.status)} ·{" "}
                  {scan.completedAt || scan.startedAt
                    ? new Date(scan.completedAt ?? scan.startedAt ?? "").toLocaleDateString()
                    : scan.id}
                </option>
              ))}
            </select>
          </Label>
          {hasMoreAudits ? (
            <Button
              disabled={loadingEarlierAudits}
              onClick={() => {
                void loadEarlierAudits();
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {loadingEarlierAudits ? "Loading…" : "Show earlier audits"}
            </Button>
          ) : null}
          {earlierAuditsError ? (
            <p className="text-[13px] text-destructive">{earlierAuditsError}</p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="flex items-start gap-2 border border-destructive/40 bg-destructive/5 p-3 text-[13px] text-destructive">
          <WarningIcon className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      ) : null}

      <GoogleEvidenceSyncState claiming={googleClaimState === "claiming"} source={googleSource} />

      {/*
        isLoading is true only after a fetch has started. SSR starts that
        fetch; the browser's first paint has not. isPending stays true on
        both until the source list is in the cache, so the connect step is
        not hydrated over this loading line.
      */}
      {sourcesQuery.isPending || (!scanId && scansQuery.isPending) || (connectGate && knownPromises.isPending) ? (
        <p className="flex items-center gap-2 text-[13px] text-primary/55">
          <CircleNotchIcon className="size-4 animate-spin" /> Loading your report.
        </p>
      ) : health === "not_connected" ? (
        <GoogleConnectionStep
          busy={connecting}
          knownCopy={knownCopy}
          onConnect={() => {
            void connectGoogle();
          }}
        />
      ) : health === "needs_reconnect" ? (
        <GoogleConnectionStep
          busy={connecting}
          knownCopy={knownCopy}
          onConnect={() => {
            void connectGoogle();
          }}
          reconnect
        />
      ) : !effectiveScanId ? (
        <StartStep
          onRun={() => {
            void run();
          }}
          busy={starting}
        />
      ) : !scanDone ? (
        <ScanningStep
          threads={scanQuery.data?.threadsSeen ?? 0}
          failed={scanQuery.data?.status === "failed"}
          reason={scanQuery.data?.error}
          onRetry={() => {
            setScanId(null);
          }}
        />
      ) : reportQuery.data ? (
        <Report report={reportQuery.data} scanId={effectiveScanId} />
      ) : reportQuery.isError ? (
        <section className="border border-destructive/40 bg-destructive/5 p-5" role="alert">
          <h2 className="text-[15px] font-medium text-destructive">The report could not load</h2>
          <p className="mt-1.5 text-[13px] text-primary/70">
            {shownRequestError(reportQuery.error, "The report could not load. Try again.")}
          </p>
          <Button
            className="mt-4"
            onClick={() => void reportQuery.refetch()}
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </section>
      ) : (
        <p className="flex items-center gap-2 text-[13px] text-primary/55">
          <CircleNotchIcon className="size-4 animate-spin" /> Building the report.
        </p>
      )}
    </div>
  );
}

function googleSourceSyncActive(source?: RelationshipSourceStatus): boolean {
  return (
    source?.status === "authorizing" ||
    source?.status === "backfilling" ||
    source?.status === "rebuilding" ||
    source?.backfillPhase === "queued" ||
    source?.backfillPhase === "running"
  );
}

function GoogleEvidenceSyncState({
  claiming,
  source,
}: {
  claiming: boolean;
  source?: RelationshipSourceStatus;
}) {
  if (claiming) {
    return (
      <section className="border border-border bg-background-50 p-4" role="status">
        <p className="flex items-center gap-2 text-[13px] font-medium text-primary">
          <CircleNotchIcon className="size-4 animate-spin" /> Saving your Google connection
        </p>
        <p className="mt-1 text-[12px] text-primary/55">
          Oppulence is securely claiming the authorization returned by Google.
        </p>
      </section>
    );
  }
  if (!source) return null;

  const active = googleSourceSyncActive(source);
  const failed = source.backfillPhase === "failed" || source.status === "reconnect_required";
  const completed = Math.max(0, source.backfillCompleted);
  const total = Math.max(0, source.backfillTotal);
  const progress = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
  const title = failed
    ? source.status === "reconnect_required"
      ? "Google needs to be reconnected"
      : "Google could not finish reading"
    : active
      ? "Reading Google"
      : source.status === "live"
        ? "Google is up to date"
        : "Google is connected";

  return (
    <section
      className={
        failed
          ? "border border-destructive/40 bg-destructive/5 p-4"
          : "border border-border bg-background-50 p-4"
      }
      role={failed ? "alert" : "status"}
    >
      <p className="flex items-center gap-2 text-[13px] font-medium text-primary">
        {active ? <CircleNotchIcon className="size-4 animate-spin" /> : null}
        {title}
      </p>
      <p className="mt-1 text-[12px] text-primary/55">
        {failed
          ? source.lastError || "Reading stopped. Reconnect Google or try again."
          : active && total > 0
            ? `${String(completed)} of ${String(total)} conversations read.`
            : active
              ? `Reading mail and meetings from the last ${REVENUE_EVIDENCE_LOOKBACK_LABEL}.`
              : source.status === "live"
                ? "Gmail and Calendar finished their first read."
                : "The first read has not started yet."}
      </p>
      {active && total > 0 ? (
        <div
          aria-label="Google reading progress"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress}
          className="mt-3 h-1.5 overflow-hidden bg-primary/10"
          role="progressbar"
        >
          <div className="h-full bg-[#3478f6]" style={{ width: `${String(progress)}%` }} />
        </div>
      ) : null}
    </section>
  );
}

function GoogleConnectionStep({
  busy,
  knownCopy = "",
  onConnect,
  reconnect = false,
}: {
  busy: boolean;
  knownCopy?: string;
  onConnect: () => void;
  reconnect?: boolean;
}) {
  return (
    <WorkspaceEmptyState
      action={
        <Button
          className="bg-[#3478f6] text-white hover:bg-[#2f6fe6]"
          disabled={busy}
          onClick={onConnect}
          size="sm"
          type="button"
        >
          {busy ? <CircleNotchIcon className="animate-spin" /> : <PlugsIcon />}
          {busy ? "Connecting…" : reconnect ? "Reconnect Google" : "Connect Gmail & Calendar"}
        </Button>
      }
      description={reportConnectDescription(
        reconnect,
        knownCopy,
        REVENUE_EVIDENCE_LOOKBACK_LABEL,
      )}
      image="openPromises"
      learnMore={[
        { label: "See the message each promise came from" },
        { label: "Nothing is sent on your behalf" },
      ]}
      title={reconnect ? "Reconnect Google" : "Connect Gmail and Calendar"}
    />
  );
}

function StartStep({ onRun, busy }: { onRun: () => void; busy: boolean }) {
  return (
    <WorkspaceEmptyState
      action={
        <Button
          className="bg-[#3478f6] text-white hover:bg-[#2f6fe6]"
          disabled={busy}
          onClick={() => {
            onRun();
          }}
          size="sm"
          type="button"
        >
          {busy ? <CircleNotchIcon className="animate-spin" /> : <ArrowRightIcon />}
          {busy ? "Starting" : "Find my open promises"}
        </Button>
      }
      description={`Read the last ${REVENUE_EVIDENCE_LOOKBACK_LABEL} for promises that still look open. This takes a few minutes — you can leave and come back.`}
      image="openPromises"
      learnMore={[
        { label: "See the message each promise came from" },
        { label: "Nothing is sent on your behalf" },
      ]}
      title="Find promises in your mail"
    />
  );
}

function ScanningStep({
  threads,
  failed,
  reason,
  onRetry,
}: {
  threads: number;
  failed: boolean;
  reason?: string;
  onRetry: () => void;
}) {
  if (failed) {
    return (
      <section className="border border-destructive/40 bg-destructive/5 p-5">
        <h2 className="text-[15px] font-medium text-destructive">The scan did not finish</h2>
        <p className="mt-1.5 text-[13px] text-primary/70">
          {reason ? auditFailureCopy(reason) : "No reason was recorded."}
        </p>
        <Button className="mt-4" onClick={onRetry} type="button" variant="outline">
          Try again
        </Button>
      </section>
    );
  }
  return (
    <section className="border border-border bg-background-50 p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-medium text-primary">
        <CircleNotchIcon className="size-4 animate-spin" /> Reading your last{" "}
        {REVENUE_EVIDENCE_LOOKBACK_LABEL}
      </h2>
      <p className="mt-1.5 text-[13px] text-primary/60">
        {threads > 0 ? `${String(threads)} conversations read so far.` : "Starting up."}
      </p>
    </section>
  );
}

/** Promises already on the record are not hidden behind the mail connection. */
export function reportKnownPromiseCopy(count: number, hasMore = false): string {
  const total = Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
  if (total <= 0) return "";
  if (hasMore) return `${total}+ promises are already in Commitments.`;
  if (total === 1) return "1 promise is already in Commitments.";
  return `${total} promises are already in Commitments.`;
}

/** Connecting mail looks for more promises. It does not erase the ones already recorded. */
export function reportConnectDescription(
  reconnect: boolean,
  known: string,
  lookback: string,
): string {
  const recorded = known.trim();
  const next = reconnect
    ? "Google stopped accepting the authorization, so we cannot read your mail. Reconnect to run the audit."
    : recorded
      ? `Oppulence reads the last ${lookback} to find promises in mail. Nothing is sent, written, or replied to on your behalf.`
      : `Oppulence reads the last ${lookback} to find promises. Nothing is sent, written, or replied to on your behalf.`;
  return recorded ? `${recorded} ${next}` : next;
}

/** A blank excerpt is not a citation. Spaces are not a sentence. */
export function reportSourceQuote(quote?: string | null): string {
  return quote?.trim() ?? "";
}

/** The commitments queue and the export both say "At risk". The report badge matches. */
export function reportRiskLabel(): string {
  return "At risk";
}

/** An extraction no person has confirmed. The company record and the graph say the same word. */
export function reportReviewLabel(): string {
  return "Review";
}

/** A badge only when the row is a confirmed risk or still waiting for review. */
export function reportStateBadge(state: string): string | null {
  if (state === "at_risk") return reportRiskLabel();
  if (state === "review") return reportReviewLabel();
  return null;
}

function Report({ report, scanId }: { report: OpenPromisesReport; scanId: string }) {
  const [downloading, setDownloading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);
  const download = React.useCallback(async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      downloadMarkdown("open-promises.md", await getOpenPromisesReportMarkdown(scanId));
    } catch (error) {
      setDownloadError(shownRequestError(error, "The report could not be downloaded."));
    } finally {
      setDownloading(false);
    }
  }, [scanId]);

  if (report.items.length === 0) {
    return (
      <section className="border border-border bg-background-50 p-5">
        <h2 className="text-[15px] font-medium text-primary">No open promises found</h2>
        <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-primary/60">
          We read {report.threadsSeen} conversations and found nothing outstanding. That is either
          good news, or a sign that more sources need connecting.
        </p>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/app/settings">Connect more sources</Link>
        </Button>
      </section>
    );
  }

  const sharedCount = report.items.filter((item) => item.direction === "mutual").length;

  return (
    <>
      <section
        className={
          sharedCount > 0 ? "grid grid-cols-2 gap-3 sm:grid-cols-4" : "grid grid-cols-3 gap-3"
        }
      >
        <Stat label="We promised" value={report.outboundCount} />
        <Stat label="They promised us" value={report.inboundCount} />
        {sharedCount > 0 ? <Stat label="We both promised" value={sharedCount} /> : null}
        <Stat label="Conversations read" value={report.threadsSeen} />
      </section>

      <div className="flex items-center gap-2">
        <Button
          disabled={downloading}
          onClick={() => void download()}
          type="button"
          variant="outline"
        >
          {downloading ? <CircleNotchIcon className="animate-spin" /> : <ExportIcon />}
          {downloading ? "Downloading" : "Download the report"}
        </Button>
        <Button asChild variant="outline">
          <Link href="/app/revenue">
            Open commitments <ArrowRightIcon />
          </Link>
        </Button>
      </div>

      {downloadError ? <p className="text-[13px] text-destructive">{downloadError}</p> : null}
      {report.truncated ? (
        <p className="border border-amber-500/40 bg-amber-500/5 p-3 text-[13px] text-primary/70">
          This report shows the first 200 open promises. Open commitments to see the rest.
        </p>
      ) : null}

      <ol className="flex flex-col gap-3">
        {report.items.map((item) => {
          const badge = reportStateBadge(item.state);
          return (
            <li key={item.commitmentId} className="border border-border bg-background p-4">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <Label className="text-[13px] font-medium text-primary">{item.account}</Label>
                <Label className="text-[12px] font-normal text-primary/45">
                  {promiseDirectionLabel(item.direction)}
                </Label>
                {badge ? (
                  <Badge
                    className="rounded-none border-amber-500/40 px-1.5 py-0.5 text-[11px] font-normal text-amber-500"
                    variant="outline"
                  >
                    {badge}
                  </Badge>
                ) : null}
                <Label className="ml-auto text-[12px] font-normal text-primary/45">
                  {promiseDueLabel(item.dueAt)}
                </Label>
              </div>
              <p className="mt-1.5 text-[14px] leading-snug text-primary">{item.text}</p>
              {/* Every claim carries its citation, or it is not made. */}
              {reportSourceQuote(item.sourceQuote) ? (
                <blockquote className="mt-2.5 border-l-2 border-border pl-3 text-[13px] italic leading-relaxed text-primary/55">
                  {reportSourceQuote(item.sourceQuote)}
                </blockquote>
              ) : null}
              {item.occurredAt || safeResearchCitationURL(item.sourceUri ?? "") ? (
                <p className="mt-2 text-[12px] text-primary/45">
                  {item.occurredAt
                    ? `Source observed ${new Date(item.occurredAt).toLocaleString()}`
                    : "Source"}
                  {safeResearchCitationURL(item.sourceUri ?? "") ? (
                    <>
                      {" · "}
                      <a
                        className="underline underline-offset-2 hover:text-primary"
                        href={safeResearchCitationURL(item.sourceUri ?? "") as string}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open source
                      </a>
                    </>
                  ) : null}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border bg-background-50 p-3">
      <div className="text-[24px] font-medium leading-none text-primary">{value}</div>
      <div className="mt-1.5 text-[12px] text-primary/50">{label}</div>
    </div>
  );
}
