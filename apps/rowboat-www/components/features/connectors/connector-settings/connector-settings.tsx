"use client";

import "client-only";

import * as React from "react";

import { Badge } from "@oppulence/ui/components/badge";
import { Button } from "@oppulence/ui/components/button";
import { Checkbox } from "@oppulence/ui/components/checkbox";
import { CardDescription } from "@oppulence/ui/components/card";
import { Input } from "@oppulence/ui/components/input";
import { Label } from "@oppulence/ui/components/label";

import {
  getDeleteConnectionUrl,
  getSetConnectionAPIKeyUrl,
} from "@/lib/api/generated/client/connectors/connectors";
import { useQueryClient } from "@tanstack/react-query";
import { useConnectors } from "@/hooks/queries/use-connectors";
import { useGoogleConnectionStatus } from "@/hooks/queries/use-google-oauth";
import { useRelationshipSourceStatuses } from "@/hooks/queries/use-relationship-sources";
import { connectorKeys } from "@/hooks/queries/utils/connector-keys";
import { googleOauthKeys } from "@/hooks/queries/utils/google-oauth-keys";
import type {
  Connector,
  ConnectorScope,
  GoogleConnectionStatus,
} from "@/lib/api/generated/client/model";
import { createGoogleCommitmentsAuthorizationURL } from "@/lib/api/connectors/google-oauth";
import { startHostedOAuth } from "@/lib/api/connectors/hosted-oauth";
import { GOOGLE_OAUTH_CONNECTED_EVENT } from "@/components/features/connectors/google-oauth-return-handler/google-oauth-return-handler";
import { planLabel } from "@/lib/product/plan-label";
import { cn } from "@/lib/utils";
import { ComposioConnections } from "@/components/features/connectors/composio-connections/composio-connections";
import { dashboardFetch } from "@/lib/auth/client";
import {
  connectionReasonCopy,
  hostedOAuthUnsupportedReason,
  requiredConnectorScopes,
  safeAuthorizationURL,
  type HostedOAuthOutcome,
} from "@/lib/connectors/hosted-oauth";
import {
  connectorProductDescription,
  scopeProductDetail,
  scopeProductLabel,
} from "@/lib/connectors/connector-product-copy";
import { explainedRevenueError, friendlyRevenueError } from "@/lib/revenue/revenue";

const OUTCOME_MESSAGES: Record<HostedOAuthOutcome, string> = {
  active: "Connected.",
  entitlement: "This workspace plan does not include this connection.",
  error: "The connection could not be completed. Nothing was saved.",
  expired: "That connection link expired. Start again.",
  redirect: "This address isn't allowed to finish the connection. Nothing was saved.",
  replay: "That connection link was already used. The existing connection was not changed.",
  restart: "The connection needs to start over. Nothing was saved.",
  retry: "The connection service is busy. Wait a moment, then try again.",
  scope: "The provider asked for permissions this workspace cannot accept. Review them and connect again.",
};

function proxyPath(path: string): string {
  return `/api/rowboat${path}`;
}

function displayDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toLocaleString();
}

// The Google card used to render a bare connected/not-connected badge, so a
// dead grant still read as "Active" while every scan failed with a 401. The
// source status is the only thing that knows whether the token actually works.
const GOOGLE_HEALTH: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "neutral" }> = {
  live: { label: "Active", tone: "ok" },
  connected: { label: "Active", tone: "ok" },
  backfilling: { label: "Syncing", tone: "warn" },
  rebuilding: { label: "Updating", tone: "warn" },
  authorizing: { label: "Waiting for Google", tone: "warn" },
  degraded: { label: "Limited", tone: "warn" },
  stale: { label: "Out of date", tone: "warn" },
  reconnect_required: { label: "Reconnect required", tone: "bad" },
  disconnected: { label: "Disconnected", tone: "bad" },
  // Never linked is not a failed grant. Red "Required" looked like Google had broken.
  not_connected: { label: "Not connected", tone: "neutral" },
};

function googleHealth(connected: boolean, sourceStatus?: string) {
  if (sourceStatus && GOOGLE_HEALTH[sourceStatus]) return GOOGLE_HEALTH[sourceStatus];
  return connected ? GOOGLE_HEALTH.connected : GOOGLE_HEALTH.not_connected;
}

export type GoogleConnectionAction = "connect" | "reconnect" | "change" | "retry" | "wait";

/** Unknown status is not "Not connected". Connect stays hidden until the check finishes. */
export function googleConnectionPresentation(
  connected: boolean | null,
  sourceStatus: string | undefined,
  phase: "loading" | "error" | "ready",
): {
  label: string;
  tone: "ok" | "warn" | "bad" | "neutral";
  action: GoogleConnectionAction;
} {
  if (connected == null && phase === "error") {
    return { label: "Couldn't load", tone: "warn", action: "retry" };
  }
  if (connected == null && phase === "loading") {
    return { label: "Loading…", tone: "neutral", action: "wait" };
  }
  const health = googleHealth(Boolean(connected), sourceStatus);
  const action: GoogleConnectionAction = !connected
    ? "connect"
    : health.tone === "bad"
      ? "reconnect"
      : "change";
  return { label: health.label, tone: health.tone, action };
}

function googleConnectionButtonLabel(action: GoogleConnectionAction, busy: boolean): string {
  if (busy && action !== "retry" && action !== "wait") return "Connecting…";
  if (action === "retry") return "Try again";
  if (action === "wait") return "Loading…";
  if (action === "reconnect") return "Reconnect Google";
  if (action === "change") return "Change Google access";
  return "Connect Google";
}

/** A connected mailbox already has a grant. Opening Google again needs a yes on this page. */
export function googleAccessConfirmCopy(tone: string): string {
  return tone === "bad"
    ? "This starts Google authorization to restore access."
    : "This opens Google only to switch accounts or update permissions. It does not catch mail up.";
}

function healthLabel(connector: Connector): string | null {
  // A connector that was never linked already says "Not connected". Repeating
  // the catalog health "disconnected" makes it look like a link that broke.
  if (!connector.connected && connector.connectionHealth === "disconnected") return null;
  if (connector.connected && connector.connectionHealth === "healthy") return "Healthy";
  const raw = connector.connectionHealth.replaceAll("_", " ").trim();
  if (!raw) return null;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function OptionalConnectorScope({ scope }: { scope: ConnectorScope }) {
  const [checked, setChecked] = React.useState(false);

  return (
    <label
      className="flex items-start gap-2 text-xs text-muted-foreground"
      htmlFor={`connector-scope-${scope.name}`}
    >
      <Checkbox
        aria-label={scopeProductLabel(scope.name, scope.displayName)}
        checked={checked}
        className="mt-0.5"
        id={`connector-scope-${scope.name}`}
        onCheckedChange={(value) => setChecked(value === true)}
      />
      {checked ? <input name="requested_scope" type="hidden" value={scope.name} /> : null}
      <div>
        <Label className="font-normal text-primary/80">
          {scopeProductLabel(scope.name, scope.displayName)} · Optional
          {scope.requiredPlan ? ` · ${planLabel(scope.requiredPlan)} plan` : ""}
        </Label>
        <CardDescription className="block">
          {scopeProductDetail(scope.name, scope.description)}
        </CardDescription>
      </div>
    </label>
  );
}

function ConnectorScopeList({
  productName,
  scopes,
  action,
}: {
  productName: string;
  scopes: ConnectorScope[];
  action?: React.ReactNode;
}) {
  if (scopes.length === 0) return null;
  return (
    <details className="rounded-[3px] border border-primary/10 bg-primary/[0.02] px-3 py-2">
      <summary
        aria-label={`Permissions for ${productName}`}
        className="cursor-pointer text-xs font-medium text-primary/70"
      >
        Permissions
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {scopes.map((scope) =>
          scope.grantTier === "required" ? (
            <div className="flex items-start gap-2 text-xs text-muted-foreground" key={scope.name}>
              <input
                aria-label={scopeProductLabel(scope.name, scope.displayName)}
                name="requested_scope"
                type="hidden"
                value={scope.name}
              />
              <div>
                <Label className="font-normal text-primary/80">
                  {scopeProductLabel(scope.name, scope.displayName)} · Required
                  {scope.requiredPlan ? ` · ${planLabel(scope.requiredPlan)} plan` : ""}
                </Label>
                <CardDescription className="block">
                  {scopeProductDetail(scope.name, scope.description)}
                </CardDescription>
              </div>
            </div>
          ) : (
            <OptionalConnectorScope key={scope.name} scope={scope} />
          ),
        )}
      </div>
      {action ? <div className="mt-3">{action}</div> : null}
    </details>
  );
}

function GoogleConnectionSettings() {
  const queryClient = useQueryClient();
  const statusQuery = useGoogleConnectionStatus();
  const sourcesQuery = useRelationshipSourceStatuses();
  const status = statusQuery.data ?? null;
  const sourceStatus = sourcesQuery.data?.find((entry) => entry.source === "google")?.status;
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadStatus = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: googleOauthKeys.status() });
    return queryClient.getQueryData(googleOauthKeys.status());
  }, [queryClient]);

  React.useEffect(() => {
    if (!statusQuery.error) {
      setError(null);
      return;
    }
    setError(
      statusQuery.data
        ? "Could not refresh the Google connection. Try again."
        : explainedRevenueError(statusQuery.error, "Could not load Google connection status."),
    );
  }, [statusQuery.data, statusQuery.error]);

  React.useEffect(() => {
    const refresh = () => void loadStatus();
    window.addEventListener(GOOGLE_OAUTH_CONNECTED_EVENT, refresh);
    return () => window.removeEventListener(GOOGLE_OAUTH_CONNECTED_EVENT, refresh);
  }, [loadStatus]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      window.location.assign((await createGoogleCommitmentsAuthorizationURL()).toString());
    } catch (error) {
      setError(
        friendlyRevenueError(
          error instanceof Error ? error.message : "Google authorization could not be started.",
        ),
      );
      setBusy(false);
    }
  };

  const knownConnected = status ? status.connected : statusQuery.isSuccess ? false : null;
  const connectionPhase = statusQuery.isPending
    ? "loading"
    : statusQuery.isError
      ? "error"
      : "ready";
  const health = googleConnectionPresentation(knownConnected, sourceStatus, connectionPhase);

  const startConnection = () => {
    if (status?.connected) {
      setConfirming(true);
      return;
    }
    void connect();
  };

  return (
    <div className="settings-panel mb-3 flex items-start justify-between gap-4 px-4 py-3">
      <div>
        <Label className="flex items-center gap-2 text-sm font-medium text-primary">
          Gmail &amp; Google Calendar
          <Badge
            className={cn(
              "rounded-[2px]",
              health.tone === "ok" && "border-oppulence-green/40 text-oppulence-green",
              health.tone === "bad" && "border-destructive/40 text-destructive",
            )}
            variant="outline"
          >
            {health.label}
          </Badge>
        </Label>
        <CardDescription className="mt-1 text-xs">
          Read recent mail and meetings to find promises. Sending and calendar changes wait for approval.
        </CardDescription>
        {health.tone === "bad" && status?.connected ? (
          <p className="mt-1 text-xs text-destructive">
            Google is no longer accepting this authorization, so audits cannot read your mail.
            Reconnect to resume.
          </p>
        ) : null}
        {sourceStatus === "stale" && status?.connected ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Google is still connected. Mail and calendar are behind. Connecting again will not
            catch them up.
          </p>
        ) : null}
        {status?.accounts.map((account) => (
          <p className="mt-1 font-mono text-[11px] text-primary/50" key={account.accountId}>
            {account.accountId}
          </p>
        ))}
        {error ? (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-destructive">
            <span>{error}</span>
            {health.action === "retry" ? null : (
              <Button onClick={() => void loadStatus()} size="sm" type="button" variant="outline">
                Try again
              </Button>
            )}
          </p>
        ) : null}
      </div>
      {confirming ? (
        <div className="flex max-w-xs flex-col items-end gap-2">
          <p className="text-right text-xs text-primary/70">{googleAccessConfirmCopy(health.tone)}</p>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void connect()} size="sm" type="button">
              {busy ? "Connecting…" : "Continue"}
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
          disabled={busy || health.action === "wait"}
          onClick={() => {
            if (health.action === "retry") {
              void loadStatus();
              return;
            }
            startConnection();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {googleConnectionButtonLabel(health.action, busy)}
        </Button>
      )}
    </div>
  );
}

function ConnectorRow({ connector, onChanged }: { connector: Connector; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [keyOpen, setKeyOpen] = React.useState(false);
  const [apiKey, setApiKey] = React.useState("");
  const unsupportedReason = hostedOAuthUnsupportedReason(connector);
  const connectedAt = displayDate(connector.connectedAt);
  const lastUsedAt = displayDate(connector.lastUsedAt);
  const health = healthLabel(connector);
  // `status` is whether the catalog offers this connector ("enabled"), not
  // whether this workspace linked it. Printing "Lifecycle: enabled" beside
  // "Not connected" reads as two opposite answers.
  const activity = [
    connectedAt ? `Connected ${connectedAt}` : "",
    lastUsedAt ? `Last used ${lastUsedAt}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const isHubSpot = connector.name === "hubspot";
  const credentialLabel = isHubSpot
    ? "HubSpot private app token"
    : `${connector.displayName} API key`;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (caught) {
      setError(
        friendlyRevenueError(
          caught instanceof Error ? caught.message : "That connection change did not go through.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const saveKey = () =>
    run(async () => {
      const response = await dashboardFetch(proxyPath(getSetConnectionAPIKeyUrl(connector.name)), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { detail?: unknown } | null;
        throw new Error(
          typeof problem?.detail === "string"
            ? problem.detail
            : "Could not save that connection.",
        );
      }
      setApiKey("");
      setKeyOpen(false);
    });

  const disconnect = () =>
    run(async () => {
      const response = await dashboardFetch(proxyPath(getDeleteConnectionUrl(connector.name)), {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Could not disconnect.");
      setConfirming(false);
    });

  const startOAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (unsupportedReason || busy) return;

    const action = event.currentTarget.action;
    const body = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const result = await startHostedOAuth(action, body, AbortSignal.timeout(15_000));
      if (result.kind === "sign-in") {
        window.location.assign(new URL(result.signInUrl, window.location.origin).toString());
        return;
      }
      if (result.kind === "failure") {
        setError(OUTCOME_MESSAGES[result.outcome]);
        return;
      }
      const safeURL = safeAuthorizationURL(result.authorizationUrl);
      if (!safeURL) {
        setError(OUTCOME_MESSAGES.error);
        return;
      }
      window.location.assign(safeURL.toString());
    } catch {
      setError(OUTCOME_MESSAGES.error);
    } finally {
      setBusy(false);
    }
  };

  const apiKeyUnavailable = connector.status !== "enabled" || connector.health === "unavailable";
  const requiredScopes = requiredConnectorScopes(connector);

  return (
    <div className="flex flex-col gap-3 px-4 py-3" data-testid={`connector-${connector.name}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="truncate text-sm font-medium text-primary">
              {connector.displayName}
            </Label>
            {connector.connected ? (
              <Badge className="shrink-0 rounded-[2px] border-oppulence-green/40 text-oppulence-green">
                Active
              </Badge>
            ) : (
              <Badge className="shrink-0 rounded-[2px] text-primary/50" variant="outline">
                Not connected
              </Badge>
            )}
            {health ? (
              <Badge className="shrink-0 rounded-[2px] capitalize" variant="outline">
                {health}
              </Badge>
            ) : null}
          </div>
          <CardDescription className="mt-1 block text-xs">
            {connectorProductDescription(connector.name, connector.description)}
          </CardDescription>
          {activity ? (
            <Badge
              className="mt-1 block font-mono text-[11px] font-normal text-primary/45"
              variant="secondary"
            >
              {activity}
            </Badge>
          ) : null}
          {connector.connectionReason ? (
            <Badge
              className="mt-1 block text-[11px] font-normal text-oppulence-orange"
              id={`connector-support-${connector.name}`}
              variant="outline"
            >
              {connectionReasonCopy(connector.connectionReason)}
            </Badge>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {connector.connected ? (
            confirming ? (
              <>
                <Button disabled={busy} onClick={disconnect} size="sm" variant="destructive">
                  {busy ? "Disconnecting…" : "Confirm"}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                  size="sm"
                  variant="ghost"
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                aria-label={`Disconnect ${connector.displayName}`}
                onClick={() => setConfirming(true)}
                size="sm"
                variant="outline"
              >
                Disconnect
              </Button>
            )
          ) : connector.authType === "api_key" ? (
            <Button
              disabled={busy || apiKeyUnavailable}
              onClick={() => setKeyOpen((open) => !open)}
              size="sm"
              variant="outline"
            >
              {keyOpen ? "Cancel" : `Connect ${connector.displayName}`}
            </Button>
          ) : connector.authType === "oauth" ? (
            <form
              action={`/api/connectors/${encodeURIComponent(connector.name)}/start`}
              method="post"
              onSubmit={startOAuth}
            >
              {requiredScopes.map((scope) => (
                <input key={scope} name="requested_scope" type="hidden" value={scope} />
              ))}
              <Button
                aria-describedby={
                  unsupportedReason ? `connector-support-${connector.name}` : undefined
                }
                aria-label={`Connect ${connector.displayName}`}
                disabled={Boolean(unsupportedReason) || busy}
                size="sm"
                type="submit"
              >
                Connect
              </Button>
            </form>
          ) : (
            <Button disabled size="sm" variant="outline">
              Unavailable
            </Button>
          )}
        </div>
      </div>

      {!connector.connected && connector.authType === "oauth" ? (
        <form
          action={`/api/connectors/${encodeURIComponent(connector.name)}/start`}
          className="flex flex-col gap-2"
          method="post"
          onSubmit={startOAuth}
        >
          <ConnectorScopeList
            productName={connector.displayName}
            action={
              unsupportedReason ? null : (
                <Button
                  aria-label={`Connect ${connector.displayName} with these permissions`}
                  className="self-start"
                  disabled={busy}
                  size="sm"
                  type="submit"
                  variant="outline"
                >
                  Connect with these permissions
                </Button>
              )
            }
            scopes={connector.availableScopes ?? []}
          />
          {unsupportedReason && !connector.connectionReason ? (
            <p
              className="text-xs text-oppulence-orange"
              id={`connector-support-${connector.name}`}
            >
              {unsupportedReason}
            </p>
          ) : null}
        </form>
      ) : null}

      {connector.connected && connector.grantedScopes?.length ? (
        <p className="font-mono text-[11px] text-primary/50">
          Permissions:{" "}
          {connector.grantedScopes
            .map((scope) => scopeProductLabel(scope.name, scope.displayName?.trim() || scope.name))
            .join(", ")}
        </p>
      ) : null}

      {keyOpen && !connector.connected ? (
        <div className="flex items-center gap-2">
          <Input
            className="max-w-sm"
            onChange={(event) => setApiKey(event.target.value)}
            aria-label={credentialLabel}
            placeholder={credentialLabel}
            type="password"
            value={apiKey}
          />
          <Button disabled={!apiKey.trim() || busy} onClick={saveKey} size="sm">
            {busy ? "Connecting…" : isHubSpot ? "Connect" : "Save key"}
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function ConnectorSettings({ showHeading = true }: { showHeading?: boolean }) {
  const queryClient = useQueryClient();
  const connectorsQuery = useConnectors();
  const connectors = connectorsQuery.data ?? [];
  const state = connectorsQuery.isPending ? "loading" : connectorsQuery.isError ? "error" : "ready";
  const [notice, setNotice] = React.useState<{ outcome: HostedOAuthOutcome; connector?: string }>();
  const [composioSlugs, setComposioSlugs] = React.useState<string[]>([]);
  // A disabled native card next to a working Composio row is the same product
  // twice, and only one of the two connect buttons does anything.
  const visibleConnectors = connectors.filter(
    (connector) => connector.status === "enabled" || !composioSlugs.includes(connector.name),
  );
  const refreshConnectors = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: connectorKeys.list() });
  }, [queryClient]);

  React.useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const outcome = parameters.get("connector_oauth") as HostedOAuthOutcome | null;
    const connector = parameters.get("connector") || undefined;
    if (outcome && outcome in OUTCOME_MESSAGES) {
      setNotice({ outcome, connector });
      if (outcome === "active") refreshConnectors();
      parameters.delete("connector_oauth");
      parameters.delete("connector");
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${parameters.size ? `?${parameters.toString()}` : ""}${window.location.hash}`,
      );
    }
  }, [refreshConnectors]);

  return (
    <section className="settings-section-block" data-slot="connector-settings">
      {showHeading ? (
        <div className="settings-section-heading">
          <div>
            <h2 className="settings-section-title">Connections</h2>
            <p className="settings-section-description">
              Connections your agents can use. Sign-in stays with Oppulence, and passwords for those
              services are not stored in this browser.
            </p>
          </div>
        </div>
      ) : null}
      {notice ? (
        <div className="settings-inline-notice" role="status">
          <strong className="capitalize">{notice.connector || "Connection"}:</strong>{" "}
          {OUTCOME_MESSAGES[notice.outcome]}
        </div>
      ) : null}
      <GoogleConnectionSettings />
      {/* Workspace connections stay above the extra catalog. A failure there
          used to sit on top of this list and read as if these products had
          failed to load. */}
      <div className="settings-panel flex flex-col">
        {state === "loading" && connectors.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Loading connections…</p>
        ) : connectorsQuery.isError && connectors.length === 0 ? (
          <div className="flex flex-col items-start gap-3 p-4">
            <p className="text-sm text-muted-foreground">
              {explainedRevenueError(connectorsQuery.error, "Could not load connections.")}
            </p>
            <Button
              onClick={() => void connectorsQuery.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              Try again
            </Button>
          </div>
        ) : visibleConnectors.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No connections are available yet.</p>
        ) : (
          <>
            {connectorsQuery.isError ? (
              <div
                className={
                  "flex items-center justify-between gap-3 border-b border-primary/10 px-4 py-3"
                }
              >
                <p className="text-sm text-muted-foreground">
                  Could not refresh connections. Try again.
                </p>
                <Button
                  onClick={() => void connectorsQuery.refetch()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Try again
                </Button>
              </div>
            ) : null}
            <div className="flex flex-col divide-y divide-primary/10">
              {visibleConnectors.map((connector) => (
                <ConnectorRow
                  connector={connector}
                  key={connector.name}
                  onChanged={refreshConnectors}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <ComposioConnections onToolkits={setComposioSlugs} />
    </section>
  );
}
