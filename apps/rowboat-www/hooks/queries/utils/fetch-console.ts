import { ListConsoleResources200Response } from "@/lib/api/generated/zod/console/console";
import {
  isConsoleRouteUnavailable,
  SyncedConsolePreferencesSchema,
  type ConsolePreferences,
  type ConsoleResource,
  type ConsoleResourceKind,
} from "@/lib/console/console-contract";
import { requestJson, type RequestJsonFn } from "@/lib/api/request-json";

const PREFERENCES_PATH = "/console/preferences";

/** Shared page for templates, favorites, and saved views. */
export const CONSOLE_RESOURCE_PAGE = 100;

export type ConsoleResourcePage = {
  resources: ConsoleResource[];
  hasMore: boolean;
};

/** Test doubles still return a bare array. A bare array is a complete page. */
export function consoleResourceRows(
  page: ConsoleResourcePage | ConsoleResource[] | null | undefined,
): ConsoleResource[] {
  if (!page) return [];
  return Array.isArray(page) ? page : page.resources;
}

export function consoleResourcePageHasMore(
  page: ConsoleResourcePage | ConsoleResource[] | null | undefined,
): boolean {
  if (!page || Array.isArray(page)) return false;
  return Boolean(page.hasMore);
}

function resourcesPath(kind: ConsoleResourceKind, offset = 0): string {
  const params = new URLSearchParams({
    kind,
    limit: String(CONSOLE_RESOURCE_PAGE),
    offset: String(offset),
  });
  return `/console/resources?${params.toString()}`;
}

export async function loadConsolePreferences(
  request: RequestJsonFn,
  signal?: AbortSignal,
): Promise<ConsolePreferences> {
  return request({
    path: PREFERENCES_PATH,
    schema: SyncedConsolePreferencesSchema,
    signal,
  });
}

export async function loadConsoleResources(
  request: RequestJsonFn,
  kind: ConsoleResourceKind,
  offset = 0,
  signal?: AbortSignal,
): Promise<ConsoleResourcePage> {
  try {
    const page = await request({
      path: resourcesPath(kind, offset),
      schema: ListConsoleResources200Response,
      signal,
    });
    return {
      resources: page.resources as ConsoleResource[],
      hasMore: Boolean(page.hasMore),
    };
  } catch (error) {
    if (isConsoleRouteUnavailable(error)) return { resources: [], hasMore: false };
    throw error;
  }
}

export function fetchConsolePreferences(signal?: AbortSignal): Promise<ConsolePreferences> {
  return loadConsolePreferences(requestJson, signal);
}

export function fetchConsoleResources(
  kind: ConsoleResourceKind,
  signal?: AbortSignal,
  offset = 0,
): Promise<ConsoleResourcePage> {
  return loadConsoleResources(requestJson, kind, offset, signal);
}
