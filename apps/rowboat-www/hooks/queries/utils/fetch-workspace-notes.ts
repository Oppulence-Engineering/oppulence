import { loadRelationships } from "@/hooks/queries/utils/fetch-relationships";
import { requestJson, type RequestJsonFn } from "@/lib/api/request-json";
import { getRelationshipTimelinePage, type TimelinePageCursor } from "@/lib/revenue/revenue";
import {
  collapseWorkspaceNotes,
  mapSettledWithConcurrency,
  type WorkspaceNote,
} from "@/lib/revenue/revenue-records";
import type { RevenueRelationship } from "@/lib/revenue/types";

/** One timeline page and one company page. The API refuses a larger request. */
export const NOTE_SOURCE_PAGE = 200;

export type NoteTimelineCursor = {
  relationshipId: string;
  before: string;
  beforeId?: string;
};

export type WorkspaceNotesBundle = {
  notes: WorkspaceNote[];
  relationships: RevenueRelationship[];
  failedTimelineCount: number;
  hasMoreNotes: boolean;
  timelineCursors: NoteTimelineCursor[];
  nextRelationshipOffset?: number;
};

export type MoreWorkspaceNotesInput = {
  relationships: RevenueRelationship[];
  timelineCursors: NoteTimelineCursor[];
  nextRelationshipOffset?: number;
};

async function notesFromCompanies(
  request: RequestJsonFn,
  companies: RevenueRelationship[],
  beforeById: ReadonlyMap<string, TimelinePageCursor>,
  signal?: AbortSignal,
): Promise<{
  notes: WorkspaceNote[];
  failedTimelineCount: number;
  timelineCursors: NoteTimelineCursor[];
}> {
  const results = await mapSettledWithConcurrency(companies, 6, (company) =>
    getRelationshipTimelinePage(company.id, NOTE_SOURCE_PAGE, beforeById.get(company.id), signal),
  );
  const successfulCompanies: RevenueRelationship[] = [];
  const timelines = [];
  const timelineCursors: NoteTimelineCursor[] = [];
  let failedTimelineCount = 0;
  results.forEach((result, index) => {
    const company = companies[index];
    if (!company) return;
    if (result.status !== "fulfilled") {
      failedTimelineCount += 1;
      const before = beforeById.get(company.id);
      if (before?.before) {
        timelineCursors.push({
          relationshipId: company.id,
          before: before.before,
          beforeId: before.beforeId,
        });
      }
      return;
    }
    successfulCompanies.push(company);
    timelines.push(result.value.observations);
    if (result.value.hasMore && result.value.nextBefore) {
      timelineCursors.push({
        relationshipId: company.id,
        before: result.value.nextBefore,
        beforeId: result.value.nextBeforeId,
      });
    }
  });
  return {
    notes: collapseWorkspaceNotes(successfulCompanies, timelines),
    failedTimelineCount,
    timelineCursors,
  };
}

export async function loadWorkspaceNotes(
  request: RequestJsonFn,
  signal?: AbortSignal,
): Promise<WorkspaceNotesBundle> {
  const rows = await loadRelationships(request, {}, signal);
  const relationships = rows.filter((relationship) => relationship.kind !== "person");
  const page = await notesFromCompanies(request, relationships, new Map(), signal);
  const nextRelationshipOffset = rows.length === NOTE_SOURCE_PAGE ? rows.length : undefined;
  return {
    ...page,
    relationships,
    hasMoreNotes: nextRelationshipOffset !== undefined || page.timelineCursors.length > 0,
    nextRelationshipOffset,
  };
}

export async function loadMoreWorkspaceNotes(
  request: RequestJsonFn,
  input: MoreWorkspaceNotesInput,
  signal?: AbortSignal,
): Promise<WorkspaceNotesBundle> {
  const continuedIds = new Set(input.timelineCursors.map((cursor) => cursor.relationshipId));
  const known = input.relationships.filter((relationship) => continuedIds.has(relationship.id));
  const beforeById = new Map(
    input.timelineCursors.map((cursor) => [
      cursor.relationshipId,
      { before: cursor.before, beforeId: cursor.beforeId },
    ]),
  );
  const moreRows =
    input.nextRelationshipOffset === undefined
      ? []
      : await loadRelationships(request, { offset: input.nextRelationshipOffset }, signal);
  const moreCompanies = moreRows.filter(
    (relationship) => relationship.kind !== "person" && !continuedIds.has(relationship.id),
  );
  const [continued, added] = await Promise.all([
    notesFromCompanies(request, known, beforeById, signal),
    notesFromCompanies(request, moreCompanies, new Map(), signal),
  ]);
  const nextRelationshipOffset =
    moreRows.length === NOTE_SOURCE_PAGE
      ? (input.nextRelationshipOffset ?? 0) + moreRows.length
      : undefined;
  const timelineCursors = [...continued.timelineCursors, ...added.timelineCursors];
  return {
    notes: [...continued.notes, ...added.notes],
    relationships: moreCompanies,
    failedTimelineCount: continued.failedTimelineCount + added.failedTimelineCount,
    hasMoreNotes: nextRelationshipOffset !== undefined || timelineCursors.length > 0,
    timelineCursors,
    nextRelationshipOffset,
  };
}

export function fetchWorkspaceNotes(signal?: AbortSignal): Promise<WorkspaceNotesBundle> {
  return loadWorkspaceNotes(requestJson, signal);
}

export function fetchMoreWorkspaceNotes(
  input: MoreWorkspaceNotesInput,
  signal?: AbortSignal,
): Promise<WorkspaceNotesBundle> {
  return loadMoreWorkspaceNotes(requestJson, input, signal);
}
