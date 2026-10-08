import { z } from "zod";

import {
  GetRelationshipSourceInventory200Response,
  GetRelationshipSourceStatuses200Response,
} from "@/lib/api/generated/zod/relationship-intelligence/relationship-intelligence";
import { requestJson, type RequestJsonFn } from "@/lib/api/request-json";
import type {
  RelationshipSourceInventoryItem,
  RelationshipSourceStatus,
} from "@/lib/revenue/types";

const RELATIONSHIP_SOURCE_STATUS_PATH = "/relationship-sources/status";

/** The status contract publishes connector rows only. Observation provenance
 * such as "user" is stored in the same table, and one unknown row used to
 * fail the whole list so the sidebar said the status was unavailable. */
const CONNECTOR_SOURCES = new Set(["google", "slack", "hubspot"]);

const LooseSourceStatusList = z.object({
  sources: z.array(z.unknown()).optional(),
});

/**
 * A Gmail or Calendar observation is stored under the Google connector name.
 * That row has no consent and no history sync, so it is not a connection.
 * Leaving it in the list made the sidebar say Google was behind.
 */
function isProviderConnection(item: Record<string, unknown>): boolean {
  if (!CONNECTOR_SOURCES.has(String(item.source ?? ""))) return false;
  const required = Array.isArray(item.requiredScopes) ? item.requiredScopes.length : 0;
  const granted = Array.isArray(item.grantedScopes) ? item.grantedScopes.length : 0;
  if (required > 0 || granted > 0) return true;
  const account = String(item.sourceAccountId ?? "default");
  if (account !== "default") return true;
  const status = String(item.status ?? "");
  if (
    status === "connected" ||
    status === "authorizing" ||
    status === "not_connected" ||
    status === "reconnect_required" ||
    status === "disconnected"
  ) {
    return true;
  }
  // A missed cadence can relabel a real mailbox as stale and leave its scopes
  // empty. A sync error is the record that this row is the connector, not a
  // note stored under the same source name.
  const errorCode = String(item.errorCode ?? "").trim();
  if (errorCode) return true;
  if (item.lastFailedSyncAt || item.syncStartedAt) return true;
  if (Number(item.retryCount ?? 0) > 0) return true;
  const phase = String(item.backfillPhase ?? "");
  return (
    phase === "queued" ||
    phase === "running" ||
    phase === "failed" ||
    phase === "live" ||
    phase === "paused"
  );
}

function connectorSourceRows(body: unknown): unknown {
  const parsed = LooseSourceStatusList.safeParse(body);
  if (!parsed.success) return body;
  return {
    sources: (parsed.data.sources ?? []).filter((item) => {
      if (!item || typeof item !== "object") return false;
      return isProviderConnection(item as Record<string, unknown>);
    }),
  };
}

export async function loadRelationshipSourceStatuses(
  request: RequestJsonFn,
  signal?: AbortSignal,
): Promise<RelationshipSourceStatus[]> {
  const raw = await request({
    path: RELATIONSHIP_SOURCE_STATUS_PATH,
    schema: z.unknown(),
    signal,
  });
  const body = GetRelationshipSourceStatuses200Response.parse(connectorSourceRows(raw));
  return body.sources ?? [];
}

export function fetchRelationshipSourceStatuses(
  signal?: AbortSignal,
): Promise<RelationshipSourceStatus[]> {
  return loadRelationshipSourceStatuses(requestJson, signal);
}

const RELATIONSHIP_SOURCE_INVENTORY_PATH = "/relationship-sources";

export async function loadRelationshipSources(
  request: RequestJsonFn,
  signal?: AbortSignal,
): Promise<RelationshipSourceInventoryItem[]> {
  const body = await request({
    path: RELATIONSHIP_SOURCE_INVENTORY_PATH,
    schema: GetRelationshipSourceInventory200Response,
    signal,
  });
  return body.sources ?? [];
}

export function fetchRelationshipSources(
  signal?: AbortSignal,
): Promise<RelationshipSourceInventoryItem[]> {
  return loadRelationshipSources(requestJson, signal);
}
