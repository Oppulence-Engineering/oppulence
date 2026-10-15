"use client";

import "client-only";

import { z } from "zod";

import { schemaMismatchCopy } from "@/lib/api/request-json";
import { dashboardFetch, toDashboardAPIPath } from "@/lib/auth/client";
import {
  CreateConsoleResource201Response,
  CreateConsoleResourceBody,
  PatchConsolePreferences200Response,
  PatchConsoleResource200Response,
  PatchConsoleResourceBody,
} from "@/lib/api/generated/zod/console/console";
import {
  ConsoleAPIError,
  isConsoleRouteUnavailable,
  SyncedConsolePreferencesPatchSchema,
  SyncedConsolePreferencesSchema,
  type ConsolePreferences,
  type ConsolePreferencesPatch,
  type ConsoleResource,
  type ConsoleResourceKind,
} from "@/lib/console/console-contract";
import {
  fetchConsolePreferences,
  fetchConsoleResources,
} from "@/hooks/queries/utils/fetch-console";

export {
  ConsoleAPIError,
  type ConsolePreferences,
  type ConsolePreferencesPatch,
  type ConsoleResource,
  type ConsoleResourceKind,
};
/** A missing console route is not a deployment instruction. */
export function consoleUnavailableCopy(): string {
  return "Saving is not available in this workspace yet.";
}

/** A validator phrase names the field. The page says what to change. */
function consoleInputCopy(detail: string): string {
  if (detail.startsWith("name is required for note_template")) return "Enter a name for this template.";
  if (detail.startsWith("name is required for graph_saved_view")) return "Enter a name for this view.";
  if (detail.startsWith("template title must contain")) return "Enter a title for this template.";
  if (detail.startsWith("template body or content exceeds")) return "This template is too large to save.";
  if (detail.startsWith("noteId must contain")) return "Choose a note before saving.";
  if (detail.startsWith("relationshipId is required")) {
    return "Choose a company before saving this view.";
  }
  if (detail.startsWith("graph query must be at most")) return "That search is too long to save.";
  if (detail.startsWith("name must be valid UTF-8") || detail.startsWith("displayName must be valid")) {
    return "That name is too long to save.";
  }
  if (detail.startsWith("payload must contain between") || detail.startsWith("normalized payload exceeds")) {
    return "This is too large to save.";
  }
  return "This could not be saved. Try again.";
}

/** Stored console details are handler phrases. The page says what happened. */
export function consoleFailureCopy(detail: string): string | null {
  const raw = detail.trim();
  if (raw.startsWith("invalid console input:")) {
    return consoleInputCopy(raw.slice("invalid console input:".length).trim());
  }
  switch (raw) {
    case "console resource not found":
    case "resourceId must be a UUID":
      return "This could not be found.";
    case "console resource already exists":
      return "This is already saved.";
    case "console access forbidden":
    case "user actor required":
      return "You do not have access to this.";
    case "invalid JSON body":
    case "request body must contain exactly one JSON document":
    case "Content-Type must be application/json":
    case "console operation failed":
      return "This could not be saved. Try again.";
    case "request body exceeds 262144 bytes":
      return "This is too large to save.";
    default:
      return null;
  }
}

export type ConsoleResourceCreate = z.infer<typeof CreateConsoleResourceBody>;
export type ConsoleResourcePatch = z.infer<typeof PatchConsoleResourceBody>;

const ConsoleErrorBodySchema = z.object({
  code: z.string().optional(),
  detail: z.string().optional(),
  title: z.string().optional(),
});

async function errorFromResponse(response: Response): Promise<ConsoleAPIError> {
  const fallback = `Console request failed (${response.status}).`;
  try {
    const body = ConsoleErrorBodySchema.parse(await response.json());
    const raw =
      typeof body.detail === "string"
        ? body.detail
        : typeof body.title === "string"
          ? body.title
          : "";
    return new ConsoleAPIError(
      consoleFailureCopy(raw) ?? (raw || fallback),
      response.status,
      typeof body.code === "string" ? body.code : undefined,
    );
  } catch {
    return new ConsoleAPIError(fallback, response.status);
  }
}

/**
 * Keeps durable console state behind the authenticated BFF and validates every
 * response before it reaches React or browser storage migration code.
 */
async function request<T>(
  path: string,
  schema: { parse: (value: unknown) => T },
  init?: RequestInit,
): Promise<T> {
  const response = await dashboardFetch(toDashboardAPIPath(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) throw await errorFromResponse(response);
  let body: unknown;
  try {
    // eslint-disable-next-line oppulence-web/no-unvalidated-json -- the generic runtime schema parses this unknown value on the next line.
    body = await response.json();
    return schema.parse(body);
  } catch (error) {
    console.error(`Unexpected ${path} response`, error);
    throw new ConsoleAPIError(schemaMismatchCopy(), response.status, "schema_mismatch");
  }
}

export const getConsolePreferences = (signal?: AbortSignal) => fetchConsolePreferences(signal);

export const patchConsolePreferences = (input: ConsolePreferencesPatch, signal?: AbortSignal) =>
  request("/console/preferences", PatchConsolePreferences200Response, {
    body: JSON.stringify(SyncedConsolePreferencesPatchSchema.parse(input)),
    method: "PATCH",
    signal,
  }).then((preferences) => SyncedConsolePreferencesSchema.parse(preferences));

export const listConsoleResources = (kind: ConsoleResourceKind, signal?: AbortSignal) =>
  fetchConsoleResources(kind, signal);

export const createConsoleResource = async (input: ConsoleResourceCreate, signal?: AbortSignal) => {
  try {
    return await request("/console/resources", CreateConsoleResource201Response, {
      body: JSON.stringify(CreateConsoleResourceBody.parse(input)),
      method: "POST",
      signal,
    });
  } catch (error) {
    if (isConsoleRouteUnavailable(error)) {
      throw new ConsoleAPIError(consoleUnavailableCopy(), 404, "console_unavailable");
    }
    throw error;
  }
};

export const patchConsoleResource = (
  resourceId: string,
  input: ConsoleResourcePatch,
  signal?: AbortSignal,
) =>
  request(`/console/resources/${encodeURIComponent(resourceId)}`, PatchConsoleResource200Response, {
    body: JSON.stringify(PatchConsoleResourceBody.parse(input)),
    method: "PATCH",
    signal,
  });

export async function deleteConsoleResource(
  resourceId: string,
  signal?: AbortSignal,
): Promise<void> {
  const response = await dashboardFetch(
    toDashboardAPIPath(`/console/resources/${encodeURIComponent(resourceId)}`),
    { method: "DELETE", signal },
  );
  if (!response.ok) throw await errorFromResponse(response);
}
