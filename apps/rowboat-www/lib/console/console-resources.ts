"use client";

import "client-only";

import {
  RelationshipGraphSavedViewSchema,
  RelationshipGraphSavedViewsSchema,
  type RelationshipGraphSavedView,
  type RelationshipGraphSavedViewState,
} from "@/lib/revenue/types";
import type { ConsoleResource } from "@/lib/console/console";

const GRAPH_VIEWS_STORAGE_KEY = "oppulence.relationship-graph.saved-views.v2";

export const graphViewsStorageKey = (userId?: string): string | null =>
  userId ? `${GRAPH_VIEWS_STORAGE_KEY}.${encodeURIComponent(userId)}` : null;

export type NoteTemplateResource = ConsoleResource & {
  kind: "note_template";
  payload: { title: string; body?: string; content?: Array<Record<string, unknown>> };
};

export type NoteFavoriteResource = ConsoleResource & {
  kind: "note_favorite";
  payload: { noteId: string };
};

export type GraphSavedViewResource = ConsoleResource & {
  kind: "graph_saved_view";
  name: string;
  payload: { state: RelationshipGraphSavedViewState };
};

export const noteTemplates = (resources: ConsoleResource[]): NoteTemplateResource[] =>
  resources.filter(
    (resource): resource is NoteTemplateResource =>
      resource.kind === "note_template" && "title" in resource.payload,
  );

export const noteFavorites = (resources: ConsoleResource[]): NoteFavoriteResource[] =>
  resources.filter(
    (resource): resource is NoteFavoriteResource =>
      resource.kind === "note_favorite" && "noteId" in resource.payload,
  );

export const graphSavedViews = (resources: ConsoleResource[]): GraphSavedViewResource[] =>
  resources.filter(
    (resource): resource is GraphSavedViewResource =>
      resource.kind === "graph_saved_view" &&
      typeof resource.name === "string" &&
      "state" in resource.payload,
  );

export function readLegacyGraphViews(
  storage: Pick<Storage, "getItem">,
  key: string | null,
): RelationshipGraphSavedView[] {
  if (!key) return [];
  try {
    return RelationshipGraphSavedViewsSchema.parse(
      JSON.parse(storage.getItem(key) || "[]"),
    );
  } catch {
    return [];
  }
}
