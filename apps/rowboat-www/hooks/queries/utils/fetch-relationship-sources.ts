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

function connectorSourceRows(body: unknown): unknown {
  const parsed = LooseSourceStatusList.safeParse(body);
  if (!parsed.success) return body;
  return {
    sources: (parsed.data.sources ?? []).filter((item) => {
      if (!item || typeof item !== "object" || !("source" in item)) return false;
      return CONNECTOR_SOURCES.has(String((item as { source: unknown }).source));
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
