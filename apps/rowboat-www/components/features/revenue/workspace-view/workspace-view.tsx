"use client";

import "client-only";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRelationshipSourceStatuses } from "@/hooks/queries/use-relationship-sources";
import { useRelationshipRefreshBlocker } from "@/hooks/queries/use-workflows";
import { relationshipSourceKeys } from "@/hooks/queries/utils/relationship-source-keys";
import { ArrowClockwise, LinkSimple, Plugs, ShieldCheck } from "@/lib/icons";
import { Badge as SimBadge, Chip } from "@sim/emcn";

import { Alert, AlertDescription, AlertTitle } from "@oppulence/ui/components/alert";
import { Badge } from "@oppulence/ui/components/badge";
import { Button } from "@oppulence/ui/components/button";
import { Label } from "@oppulence/ui/components/label";
import { Skeleton } from "@oppulence/ui/components/skeleton";
import { Spinner } from "@oppulence/ui/components/spinner";
import { Input } from "@oppulence/ui/components/input";
import {
  linkWorkspace,
  relativeTime,
  resyncRelationshipSource,
  RevenueAPIError,
} from "@/lib/revenue/revenue";
import { ConnectorSettings } from "@/components/features/connectors/connector-settings/connector-settings";
import {
  SimProductHeader,
  SimProductPanel,
} from "@/components/features/sim-product/sim-product-frame/sim-product-frame";
import { Field, errMessage } from "@/components/features/revenue/shared/shared";
import { capture, RevenueEvents } from "@/lib/analytics/analytics";
import {
  activitySourceLabel,
  sourceConnectionLabel,
} from "@/lib/revenue/source-product-copy";
import { cn } from "@/lib/utils";
import type { RelationshipSourceStatus, RevenueWorkspace } from "@/lib/revenue/types";

const CONNECTORS_SECTION_ID = "sources-connectors";

const GMAIL_DRAFT_STATUSES = new Set(["connected", "live", "backfilling"]);

/**
 * Local mode never sends. A Gmail draft is only possible once Google is
 * connected, so the page must not promise a mailbox the workspace does not have.
 */
export function gmailDraftsAvailable(
  statuses: readonly { source: string; status: string }[],
): boolean {
  return statuses.some(
    (source) => source.source === "google" && GMAIL_DRAFT_STATUSES.has(source.status),
  );
}

export function localModeNotice(gmail: "connected" | "missing" | "unknown"): string {
  const base = "Audits and drafts work here. Sending stays off until this workspace is linked.";
  if (gmail === "connected") {
    return `${base} Drafts still land in your Gmail so you can send them yourself.`;
  }
  if (gmail === "missing") {
    return `${base} Connect Gmail before a draft can land in your mailbox.`;
  }
  return base;
}

/** Preflight off means Oppulence will not send. "Drafts only" is true once Gmail can receive one. */
export function sendingCheckLabel(
  preflightAvailable: boolean,
  gmail: "connected" | "missing" | "unknown",
): string {
  if (preflightAvailable) return "Available";
  if (gmail === "connected") return "Unavailable (drafts only)";
  return "Unavailable";
}

function scrollToConnectors() {
  document
    .getElementById(CONNECTORS_SECTION_ID)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function WorkspaceView({
  workspace,
  onLinked,
  onError,
  onNotice,
  onOpenConnectors,
}: {
  workspace: RevenueWorkspace | null;
  onLinked: (ws: RevenueWorkspace) => void;
  onError: (m: string) => void;
  onNotice: (m: string) => void;
  onOpenConnectors?: () => void;
}) {
  const queryClient = useQueryClient();
  const sourcesQuery = useRelationshipSourceStatuses();
  const autoRefreshQuery = useRelationshipRefreshBlocker();

  const [orgId, setOrgId] = React.useState("");
  const [wsId, setWsId] = React.useState("");
  const [linkBusy, setLinkBusy] = React.useState(false);

  const refreshSources = React.useCallback(
    async (updated: RelationshipSourceStatus) => {
      queryClient.setQueryData<RelationshipSourceStatus[]>(
        relationshipSourceKeys.list(),
        (current) =>
          (current ?? []).map((item) =>
            item.connectionId === updated.connectionId ? updated : item,
          ),
      );
      await queryClient.invalidateQueries({ queryKey: relationshipSourceKeys.lists() });
    },
    [queryClient],
  );

  if (!workspace) {
    return (
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-24 w-full rounded-[2px]" />
      </div>
    );
  }

  const linked = workspace.mode === "linked" && workspace.status === "active";
  const sources = sourcesQuery.data;
  const gmail =
    sourcesQuery.isLoading || sourcesQuery.isError
      ? "unknown"
      : gmailDraftsAvailable(sources ?? [])
        ? "connected"
        : "missing";
  const autoRefreshBlocker = autoRefreshQuery.data ?? "";

  const submitLink = async () => {
    if (!wsId.trim()) return;
    setLinkBusy(true);
    onError("");
    try {
      const ws = await linkWorkspace({
        outboundWorkspaceId: wsId.trim(),
        outboundOrganizationId: orgId.trim() || undefined,
      });
      onLinked(ws);
      capture(RevenueEvents.WorkspaceLinked);
      onNotice("Workspace linked. Checked sending is on.");
    } catch (error) {
      onError(
        error instanceof RevenueAPIError && error.code === "facade_unavailable"
          ? "Checked sending isn't configured on the server yet, so linking can't be completed. Drafts still work."
          : errMessage(error, "Could not link the workspace."),
      );
    } finally {
      setLinkBusy(false);
    }
  };

  return (
    <div className="flex min-h-full w-full min-w-0 flex-col gap-3 p-3" data-slot="sources-view">
      <SimProductPanel className="flex min-h-0 flex-1 flex-col">
        <SimProductHeader
          actions={
            sourcesQuery.isLoading
              ? "Loading…"
              : sourcesQuery.isError
                ? "Couldn't load"
                : `${sources?.length ?? 0} source${sources?.length === 1 ? "" : "s"}`
          }
          title="Connected sources"
        />
        {sourcesQuery.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-16 w-full rounded-[2px]" />
          </div>
        ) : sourcesQuery.isError ? (
          <div className="flex flex-col gap-3 px-4 py-6 text-sm text-[var(--text-secondary)]">
            <p>Sources could not load. Try again.</p>
            <Button onClick={() => void sourcesQuery.refetch()} size="sm" type="button">
              Try again
            </Button>
          </div>
        ) : !sources?.length ? (
          <div className="flex flex-col gap-3 px-4 py-6 text-sm text-[var(--text-secondary)]">
            <p>
              Nothing is connected yet. Connect Gmail and Calendar, or another tool below.
            </p>
            <Button onClick={scrollToConnectors} size="sm" type="button">
              <Plugs /> Connect sources
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {sources.map((source) => (
              <SourceRow
                autoRefreshBlocker={autoRefreshBlocker}
                key={`${source.source}:${source.sourceAccountId}`}
                onError={onError}
                onNotice={onNotice}
                onOpenConnectors={scrollToConnectors}
                onUpdated={refreshSources}
                source={source}
              />
            ))}
          </div>
        )}
      </SimProductPanel>

      <SimProductPanel className="flex flex-col" id={CONNECTORS_SECTION_ID}>
        <SimProductHeader
          actions={
            onOpenConnectors ? (
              <button
                className="text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                onClick={onOpenConnectors}
                type="button"
              >
                All settings
              </button>
            ) : null
          }
          title="Connections"
        />
        <div className="sources-connectors px-1 py-2">
          <ConnectorSettings showHeading={false} />
        </div>
      </SimProductPanel>

      <SimProductPanel>
        <SimProductHeader
          actions={
            <SimBadge variant={linked ? "green" : "amber"}>
              {linked ? "Linked" : "Local mode"}
            </SimBadge>
          }
          title="Workspace"
        />
        <div className="divide-y divide-[var(--border)] text-sm">
          <MetadataRow label="Mode" value={workspaceMetadataValue(workspace.mode)} />
          <MetadataRow label="Status" value={workspaceMetadataValue(workspace.status)} />
          <MetadataRow
            label="Sending check"
            value={sendingCheckLabel(workspace.preflightAvailable, gmail)}
          />
          {workspace.outboundOrganizationId ? (
            <MetadataRow label="Organization" mono value={workspace.outboundOrganizationId} />
          ) : null}
          {workspace.outboundWorkspaceId ? (
            <MetadataRow
              label="Sending workspace"
              mono
              value={workspace.outboundWorkspaceId}
            />
          ) : null}
          {workspace.lastVerifiedAt ? (
            <MetadataRow label="Last verified" value={relativeTime(workspace.lastVerifiedAt)} />
          ) : null}
        </div>
      </SimProductPanel>

      {linked ? (
        <Alert>
          <ShieldCheck weight="fill" />
          <AlertTitle>Checked sending is on</AlertTitle>
          <AlertDescription>
            Each send is checked for blocks, identity, and ownership before it leaves.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Alert>
            <Plugs weight="fill" />
            <AlertTitle>Local mode</AlertTitle>
            <AlertDescription>{localModeNotice(gmail)}</AlertDescription>
          </Alert>

          <SimProductPanel>
            <SimProductHeader title="Turn on checked sending" />
            <div className="flex flex-col gap-3 px-4 py-4">
              <p className="text-sm text-[var(--text-secondary)]">
                Link a sending workspace to check each message before it goes out.
              </p>
              {/* The stored id belongs to the sending service. The label does not name that service. */}
              <Field label="Sending workspace ID">
                <Input
                  aria-label="Sending workspace ID"
                  onChange={(event) => setWsId(event.target.value)}
                  placeholder="Workspace id"
                  value={wsId}
                />
              </Field>
              <Field label="Organization ID (optional)">
                <Input
                  aria-label="Organization ID"
                  onChange={(event) => setOrgId(event.target.value)}
                  placeholder="Organization id"
                  value={orgId}
                />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={linkBusy || !wsId.trim()}
                  onClick={() => void submitLink()}
                  size="sm"
                >
                  {linkBusy ? <Spinner /> : <LinkSimple />} Link workspace
                </Button>
              </div>
            </div>
          </SimProductPanel>
        </>
      )}
    </div>
  );
}

function SourceRow({
  source,
  autoRefreshBlocker,
  onError,
  onNotice,
  onOpenConnectors,
  onUpdated,
}: {
  source: RelationshipSourceStatus;
  autoRefreshBlocker: string;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  onOpenConnectors: () => void;
  onUpdated: (source: RelationshipSourceStatus) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const stopped = source.status === "reconnect_required" || source.status === "disconnected";
  const syncing =
    source.status === "backfilling" ||
    source.status === "rebuilding" ||
    source.backfillPhase === "queued" ||
    source.backfillPhase === "running";
  const supportsResync = ["google", "slack", "hubspot"].includes(source.source.toLowerCase());
  const stale = supportsResync && !stopped && !syncing && source.status === "stale";
  const incomplete =
    supportsResync && !stopped && !syncing && !stale && source.completeness !== "complete";
  const label = sourceConnectionLabel(source);
  const canResync = stale || incomplete;

  const retry = async () => {
    setBusy(true);
    onError("");
    try {
      const updated = await resyncRelationshipSource(source.source, source.sourceAccountId);
      await onUpdated(updated);
      onNotice(sourceRefreshNotice(source.source));
    } catch (error) {
      onError(errMessage(error, "Could not retry the source sync."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3">
      <div className="min-w-0">
        <div className="font-normal text-[var(--text-primary)]">
          {activitySourceLabel(source.source)}
          {source.sourceAccountId && source.sourceAccountId !== "default" ? (
            // The row title-cases the provider slug. The account id is often an
            // email, and that same transform would rewrite owner@example.com.
            <Badge
              className="ml-2 font-mono text-xs font-normal normal-case text-[var(--text-muted)]"
              variant="outline"
            >
              {source.sourceAccountId}
            </Badge>
          ) : null}
        </div>
        {stopped || stale || incomplete ? (
          <p
            className={cn(
              "mt-1 text-sm",
              stopped ? "text-destructive" : "text-amber-600 dark:text-amber-400",
            )}
          >
            {stopped
              ? "This source has stopped reporting, so promises from it are not being read."
              : stale
                ? autoRefreshBlocker === "insufficient_credits"
                  ? "Automatic refresh is paused because this workspace is out of AI credits. The source is still connected; reconnecting will not fix it."
                  : autoRefreshBlocker === "upstream_credits_exhausted"
                    ? "Automatic refresh is paused because Oppulence's AI provider is temporarily unavailable. The source is still connected; reconnecting will not fix it."
                    : "No successful update arrived on schedule. Refresh to catch up."
                : "The connection works, but its history is not fully synced."}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {stopped ? (
          <Chip onClick={onOpenConnectors} type="button">
            Reconnect
          </Chip>
        ) : null}
        {canResync ? (
          <Button
            disabled={busy}
            onClick={() => void retry()}
            size="sm"
            type="button"
            variant="outline"
          >
            {busy ? <Spinner /> : <ArrowClockwise />} {stale ? "Refresh now" : "Retry sync"}
          </Button>
        ) : null}
        <SimBadge variant={stopped || stale || incomplete ? "amber" : "gray"}>{label}</SimBadge>
      </div>
    </div>
  );
}

export { sourceConnectionLabel };

/** The stored source is a lowercase provider name. The toast is a sentence. */
export function sourceRefreshNotice(source: string): string {
  const name = source.trim() ? activitySourceLabel(source) : "Source";
  return `${name} refresh queued.`;
}

/** Stored workspace slugs are not labels. "repair_required" would otherwise show the underscore. */
export function workspaceMetadataValue(value: string): string {
  const labels: Record<string, string> = {
    local: "Local",
    linked: "Linked",
    active: "Active",
    disconnected: "Disconnected",
    repair_required: "Needs repair",
  };
  const known = labels[value];
  if (known) return known;
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function MetadataRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <Label className="font-normal text-[var(--text-secondary)]">{label}</Label>
      <span className={cn("text-[var(--text-primary)]", mono && "font-mono text-xs")}>{value}</span>
    </div>
  );
}
