"use client";

import "client-only";

import * as React from "react";

import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@oppulence/ui/components/button";
import { useComposioConnections, useComposioToolkits } from "@/hooks/queries/use-composio";
import { ComposioUnconfiguredError } from "@/hooks/queries/utils/fetch-composio";
import { composioKeys } from "@/hooks/queries/utils/composio-keys";
import {
  disconnectComposio,
  startComposioConnection,
  type ComposioConnection,
} from "@/lib/api/composio/client";

/**
 * Composio returns connection enums. A teammate should see the same kind of
 * status the native cards use, not `active` or `expired`.
 */
const CONNECTION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Connected",
  INITIATED: "Waiting to finish",
  EXPIRED: "Expired",
};

function connectionStatusLabel(status: string): string {
  const key = status.trim().toUpperCase();
  if (!key) return "Not connected";
  const known = CONNECTION_STATUS_LABELS[key];
  if (known) return known;
  const words = key.toLowerCase().replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** An active connection wins; otherwise the most recently created one does. */
function betterConnection(candidate: ComposioConnection, held: ComposioConnection): boolean {
  const candidateActive = candidate.status.toUpperCase() === "ACTIVE";
  const heldActive = held.status.toUpperCase() === "ACTIVE";
  if (candidateActive !== heldActive) return candidateActive;
  return candidate.createdAt > held.createdAt;
}

/**
 * The long-tail connect surface.
 *
 * Unlike the connectors above it, nothing here is an Oppulence connector: the
 * user authorizes a product on Composio's hosted page, and the account lands
 * back inside our project scoped to them.
 */
export function ComposioConnections({
  onToolkits,
}: {
  /** Receives the offered product slugs, so a caller can drop its own duplicate cards. */
  onToolkits?: (slugs: string[]) => void;
} = {}) {
  const queryClient = useQueryClient();
  const toolkitsQuery = useComposioToolkits();
  const connectionsQuery = useComposioConnections();
  const toolkits = toolkitsQuery.data ?? [];
  const connections = connectionsQuery.data ?? [];
  const state =
    toolkitsQuery.isPending || connectionsQuery.isPending
      ? "loading"
      : toolkitsQuery.error instanceof ComposioUnconfiguredError ||
          connectionsQuery.error instanceof ComposioUnconfiguredError
        ? "unconfigured"
        : toolkitsQuery.isError || connectionsQuery.isError
          ? "error"
          : "ready";
  const [busy, setBusy] = React.useState("");
  const [error, setError] = React.useState("");
  // Set when the user leaves for Composio's page, so their return refreshes the
  // list. Without it a finished connection still reads "Not connected".
  const awaitingConnection = React.useRef(false);

  React.useEffect(() => {
    if (state === "ready") onToolkits?.(toolkits.map((kit) => kit.slug));
  }, [onToolkits, state, toolkits]);

  const refreshLists = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: composioKeys.all });
  }, [queryClient]);

  React.useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState !== "visible" || !awaitingConnection.current) return;
      awaitingConnection.current = false;
      refreshLists();
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("focus", refreshOnReturn);
    return () => {
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.removeEventListener("focus", refreshOnReturn);
    };
  }, [refreshLists]);

  // A product can hold several connections: retrying before the list refreshed
  // left a pending one behind each time. Show the live one, else the newest.
  const connectedBySlug = new Map<string, ComposioConnection>();
  for (const connection of connections) {
    const held = connectedBySlug.get(connection.toolkit);
    if (!held || betterConnection(connection, held)) {
      connectedBySlug.set(connection.toolkit, connection);
    }
  }
  // A product can leave the list after an account was linked to it (Gmail did,
  // when it moved to the native connector). The account still exists on
  // Composio; hidden, nothing could disconnect it.
  const offered = new Set(toolkits.map((kit) => kit.slug));
  const orphans = [...connectedBySlug.values()].filter(
    (connection) => !offered.has(connection.toolkit),
  );

  const connect = async (toolkit: string) => {
    setBusy(toolkit);
    setError("");
    try {
      const link = await startComposioConnection(toolkit);
      // The account is not linked until the user finishes on Composio's page,
      // so the list is refreshed when they come back to this tab.
      awaitingConnection.current = true;
      window.open(link.redirectUrl, "_blank", "noopener,noreferrer");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the connection.");
    } finally {
      setBusy("");
    }
  };

  const disconnect = async (connection: ComposioConnection) => {
    setBusy(connection.toolkit);
    setError("");
    try {
      await disconnectComposio(connection.id);
      refreshLists();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not disconnect.");
    } finally {
      setBusy("");
    }
  };

  // A server with no project key has nothing to offer; saying so is better than
  // an empty panel that looks broken.
  if (state === "unconfigured") return null;

  return (
    <div className="settings-panel flex flex-col" data-slot="composio-connections">
      <div className="border-b border-primary/10 p-4">
        <h3 className="text-sm font-medium text-primary">More products</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect other tools, such as Jira or Asana. Agents can use them, but they are not treated
          as promises. Promises come from Gmail, Google Calendar, and HubSpot.
        </p>
      </div>
      {state === "loading" ? (
        <p className="p-4 text-sm text-muted-foreground">Loading products…</p>
      ) : state === "error" ? (
        <p className="p-4 text-sm text-muted-foreground">Could not load products.</p>
      ) : toolkits.length === 0 && orphans.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No products are available to connect.</p>
      ) : (
        <div className="flex flex-col divide-y divide-primary/10">
          {toolkits.map((toolkit) => {
            const connection = connectedBySlug.get(toolkit.slug);
            return (
              <div className="flex items-center justify-between gap-3 p-4" key={toolkit.slug}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary">{toolkit.name || toolkit.slug}</p>
                  <p className="text-xs text-muted-foreground">
                    {connection ? connectionStatusLabel(connection.status) : "Not connected"}
                  </p>
                </div>
                {connection ? (
                  <Button
                    aria-label={
                      busy === toolkit.slug
                        ? `Working on ${toolkit.name || toolkit.slug}`
                        : `Disconnect ${toolkit.name || toolkit.slug}`
                    }
                    disabled={busy === toolkit.slug}
                    onClick={() => void disconnect(connection)}
                    size="sm"
                    variant="outline"
                  >
                    {busy === toolkit.slug ? "Working…" : "Disconnect"}
                  </Button>
                ) : (
                  <Button
                    aria-label={
                      busy === toolkit.slug
                        ? `Opening ${toolkit.name || toolkit.slug}`
                        : `Connect ${toolkit.name || toolkit.slug}`
                    }
                    disabled={busy === toolkit.slug}
                    onClick={() => void connect(toolkit.slug)}
                    size="sm"
                  >
                    {busy === toolkit.slug ? "Opening…" : "Connect"}
                  </Button>
                )}
              </div>
            );
          })}
          {orphans.map((connection) => (
            <div className="flex items-center justify-between gap-3 p-4" key={connection.id}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-primary">{connection.toolkit}</p>
                <p className="text-xs text-muted-foreground">
                  {connectionStatusLabel(connection.status)} · no longer offered here
                </p>
              </div>
              <Button
                aria-label={
                  busy === connection.toolkit
                    ? `Working on ${connection.toolkit}`
                    : `Disconnect ${connection.toolkit}`
                }
                disabled={busy === connection.toolkit}
                onClick={() => void disconnect(connection)}
                size="sm"
                variant="outline"
              >
                {busy === connection.toolkit ? "Working…" : "Disconnect"}
              </Button>
            </div>
          ))}
        </div>
      )}
      {error ? <p className="p-4 pt-0 font-mono text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
