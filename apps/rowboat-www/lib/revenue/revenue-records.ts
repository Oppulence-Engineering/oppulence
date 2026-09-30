import type { RelationshipObservation, RevenueRelationship } from "@/lib/revenue/types";

export type WorkspaceNote = {
  externalId: string;
  title: string;
  body: string;
  content?: unknown;
  meetingLinked?: boolean;
  liveLinked?: boolean;
  relationshipId: string;
  relationshipName: string;
  occurredAt: string;
  eventType: string;
};

const nodeText = (node: unknown): string => {
  if (!node || typeof node !== "object") return "";
  if ("text" in node) return String(node.text || "");
  if (!("children" in node) || !Array.isArray(node.children)) return "";
  return node.children.map(nodeText).join("");
};

export const plateText = (value: unknown) =>
  Array.isArray(value) ? value.map(nodeText).join("\n").trimEnd() : "";

/**
 * Runs large relationship fan-outs with bounded pressure while retaining each
 * result position so callers can report and recover from partial failures.
 */
export async function mapSettledWithConcurrency<Input, Output>(
  inputs: readonly Input[],
  concurrency: number,
  worker: (input: Input) => Promise<Output>,
): Promise<PromiseSettledResult<Output>[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("concurrency must be a positive integer");
  }
  const results: PromiseSettledResult<Output>[] = new Array(inputs.length);
  let nextIndex = 0;
  const run = async () => {
    while (nextIndex < inputs.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: "fulfilled", value: await worker(inputs[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, inputs.length) }, run));
  return results;
}

export function collapseWorkspaceNotes(
  relationships: RevenueRelationship[],
  timelines: RelationshipObservation[][],
): WorkspaceNote[] {
  const latest = new Map<string, WorkspaceNote>();
  timelines.forEach((observations, index) =>
    observations.forEach((observation) => {
      if (
        observation.source !== "desktop_note" ||
        !["note", "note_deleted"].includes(observation.eventType)
      )
        return;
      const noteId = String(observation.normalizedFacts.noteId || observation.externalId);
      const current = latest.get(noteId);
      if (current && current.occurredAt >= observation.occurredAt) return;
      latest.set(noteId, {
        externalId: noteId,
        title: String(observation.normalizedFacts.title || observation.summary || "Untitled"),
        body: String(observation.normalizedFacts.body || ""),
        content: observation.normalizedFacts.content,
        meetingLinked: Boolean(observation.normalizedFacts.meetingLinked),
        liveLinked: Boolean(observation.normalizedFacts.liveLinked),
        relationshipId: relationships[index].id,
        relationshipName: relationships[index].displayName,
        occurredAt: observation.occurredAt,
        eventType: observation.eventType,
      });
    }),
  );
  return [...latest.values()]
    .filter((note) => note.eventType === "note")
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

export type WorkspaceNoteDay = "today" | "yesterday" | "earlier";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight, so "today" follows the reader's calendar rather than UTC. */
function localDayStart(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

/**
 * The notes list used to title every note "Created today". Day buckets keep
 * that label for notes from the current local day and separate the rest.
 * A timestamp in the future stays with today so a clock skew does not invent
 * a fourth section. DST makes a local-day delta 23 or 25 hours, so the day
 * count is rounded.
 */
export function workspaceNoteDay(occurredAt: string, now: Date): WorkspaceNoteDay {
  const occurred = new Date(occurredAt);
  if (Number.isNaN(occurred.getTime())) return "earlier";
  const diffDays = Math.round((localDayStart(now) - localDayStart(occurred)) / DAY_MS);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  return "earlier";
}

export const WORKSPACE_NOTE_DAY_LABEL: Record<WorkspaceNoteDay, string> = {
  today: "Created today",
  yesterday: "Created yesterday",
  earlier: "Earlier",
};

export function groupWorkspaceNotes(
  notes: readonly WorkspaceNote[],
  now: Date,
  newestFirst: boolean,
): { day: WorkspaceNoteDay; label: string; notes: WorkspaceNote[] }[] {
  const buckets: Record<WorkspaceNoteDay, WorkspaceNote[]> = {
    today: [],
    yesterday: [],
    earlier: [],
  };
  for (const note of notes) buckets[workspaceNoteDay(note.occurredAt, now)].push(note);
  const order: WorkspaceNoteDay[] = newestFirst
    ? ["today", "yesterday", "earlier"]
    : ["earlier", "yesterday", "today"];
  return order
    .filter((day) => buckets[day].length > 0)
    .map((day) => ({ day, label: WORKSPACE_NOTE_DAY_LABEL[day], notes: buckets[day] }));
}
