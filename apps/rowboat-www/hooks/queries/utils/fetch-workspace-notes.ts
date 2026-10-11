import { z } from "zod";

import { loadRelationships, relationshipRows } from "@/hooks/queries/utils/fetch-relationships";
import { requestJson, type RequestJsonFn } from "@/lib/api/request-json";
import type { WorkspaceNote } from "@/lib/revenue/revenue-records";
import type { RevenueRelationship } from "@/lib/revenue/types";

/** One page of collapsed notes. The API refuses a larger page. */
export const WORKSPACE_NOTE_PAGE = 50;

/** Oldest pages from the earliest note. Newest is the default. */
export type WorkspaceNoteOrder = "newest" | "oldest";

/**
 * Marks the next page of workspace notes. Company timeline cursors used to
 * live in this list; those requests are what tripped the revenue rate limit.
 */
const WORKSPACE_NOTES_CURSOR = "__workspace_notes__";

const WorkspaceNoteSchema = z.object({
  externalId: z.string(),
  title: z.string(),
  body: z.string(),
  content: z.unknown().optional(),
  meetingLinked: z.boolean().optional(),
  liveLinked: z.boolean().optional(),
  relationshipId: z.string(),
  relationshipName: z.string(),
  occurredAt: z.string(),
  createdAt: z.string().optional(),
  eventType: z.string(),
});

const WorkspaceNotesPageSchema = z.object({
  notes: z.array(WorkspaceNoteSchema).default([]),
  hasMore: z.boolean().optional(),
});

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
  order?: WorkspaceNoteOrder;
};

function workspaceNotesPath(offset: number, order: WorkspaceNoteOrder = "newest"): string {
  const params = new URLSearchParams({ limit: String(WORKSPACE_NOTE_PAGE) });
  if (offset > 0) params.set("offset", String(offset));
  if (order === "oldest") params.set("order", "oldest");
  return `/workspace-notes?${params.toString()}`;
}

function notePageCursor(offset: number | undefined): NoteTimelineCursor[] {
  if (offset === undefined) return [];
  return [{ relationshipId: WORKSPACE_NOTES_CURSOR, before: String(offset) }];
}

function nextNoteOffset(
  offset: number,
  notes: readonly WorkspaceNote[],
  hasMore: boolean,
): number | undefined {
  if (!hasMore || notes.length === 0) return undefined;
  return offset + notes.length;
}

async function loadNotePage(
  request: RequestJsonFn,
  offset: number,
  signal: AbortSignal | undefined,
  order: WorkspaceNoteOrder,
) {
  const page = await request({
    path: workspaceNotesPath(offset, order),
    schema: WorkspaceNotesPageSchema,
    signal,
  });
  return {
    notes: page.notes,
    hasMore: Boolean(page.hasMore),
  };
}

function companyRows(
  page: Awaited<ReturnType<typeof loadRelationships>> | undefined,
): RevenueRelationship[] {
  return relationshipRows(page).filter((relationship) => relationship.kind !== "person");
}

export async function loadWorkspaceNotes(
  request: RequestJsonFn,
  signal?: AbortSignal,
  order: WorkspaceNoteOrder = "newest",
): Promise<WorkspaceNotesBundle> {
  const [directory, page] = await Promise.all([
    loadRelationships(request, {}, signal),
    loadNotePage(request, 0, signal, order),
  ]);
  const rows = relationshipRows(directory);
  const notesOffset = nextNoteOffset(0, page.notes, page.hasMore);
  const nextRelationshipOffset = directory.hasMore ? rows.length : undefined;
  return {
    notes: page.notes,
    relationships: rows.filter((relationship) => relationship.kind !== "person"),
    failedTimelineCount: 0,
    // The company directory is only the note picker. Notes already cover the
    // whole workspace, so another company page is not another note page.
    hasMoreNotes: notesOffset !== undefined,
    timelineCursors: notePageCursor(notesOffset),
    nextRelationshipOffset,
  };
}

export async function loadMoreWorkspaceNotes(
  request: RequestJsonFn,
  input: MoreWorkspaceNotesInput,
  signal?: AbortSignal,
): Promise<WorkspaceNotesBundle> {
  const workspaceCursor = input.timelineCursors.find(
    (cursor) => cursor.relationshipId === WORKSPACE_NOTES_CURSOR,
  );
  const noteOffset = workspaceCursor ? Number(workspaceCursor.before) : Number.NaN;
  const moreDirectory =
    input.nextRelationshipOffset === undefined
      ? undefined
      : await loadRelationships(request, { offset: input.nextRelationshipOffset }, signal);
  const moreRows = relationshipRows(moreDirectory);
  const knownIds = new Set(input.relationships.map((relationship) => relationship.id));
  const moreCompanies = companyRows(moreDirectory).filter(
    (relationship) => !knownIds.has(relationship.id),
  );
  const notesPage =
    Number.isInteger(noteOffset) && noteOffset >= 0
      ? await loadNotePage(request, noteOffset, signal, input.order ?? "newest")
      : { notes: [], hasMore: false };
  const notesOffset = Number.isInteger(noteOffset)
    ? nextNoteOffset(noteOffset, notesPage.notes, notesPage.hasMore)
    : undefined;
  const nextRelationshipOffset = moreDirectory?.hasMore
    ? (input.nextRelationshipOffset ?? 0) + moreRows.length
    : undefined;
  return {
    notes: notesPage.notes,
    relationships: moreCompanies,
    failedTimelineCount: 0,
    hasMoreNotes: notesOffset !== undefined,
    timelineCursors: notePageCursor(notesOffset),
    nextRelationshipOffset,
  };
}

export function fetchWorkspaceNotes(
  signal?: AbortSignal,
  order: WorkspaceNoteOrder = "newest",
): Promise<WorkspaceNotesBundle> {
  return loadWorkspaceNotes(requestJson, signal, order);
}

export function fetchMoreWorkspaceNotes(
  input: MoreWorkspaceNotesInput,
  signal?: AbortSignal,
): Promise<WorkspaceNotesBundle> {
  return loadMoreWorkspaceNotes(requestJson, input, signal);
}
