import type { RelationshipObservation, RevenueRelationship } from "@/lib/revenue/types";

function emailShapedCompanyName(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function domainCompanyLabel(domain: string): string {
  return domain
    .split(".")[0]
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * A company stored under its domain, or under the address that created it,
 * reads as that host. Any other typed name, including one with an @ sign,
 * stays as the teammate wrote it.
 */
export function companyName(relationship: {
  displayName: string;
  accountDomain?: string | null;
}): string {
  const domain = relationship.accountDomain?.trim() ?? "";
  const name = relationship.displayName.trim();
  if (domain && (name.toLowerCase() === domain.toLowerCase() || emailShapedCompanyName(name))) {
    return domainCompanyLabel(domain);
  }
  return relationship.displayName;
}

/** The directory names the company the same way the companies page does. */
export function personCompanyTitle(person: {
  orgName?: string | null;
  orgDomain?: string | null;
}): string {
  const name = person.orgName?.trim() ?? "";
  if (!name) return "";
  return companyName({ displayName: name, accountDomain: person.orgDomain });
}

/** Attention rows carry the stored company name. The queue should show its title. */
export function attentionWithCompanyTitles<
  T extends { relationshipId: string; relationshipName: string },
>(
  items: readonly T[],
  companies: readonly {
    id: string;
    displayName: string;
    accountDomain?: string | null;
    kind?: string | null;
  }[],
): T[] {
  const titles = new Map(
    companies
      .filter((row) => row.kind !== "person")
      .map((row) => [row.id, companyName(row)]),
  );
  return items.map((item) => {
    const title = titles.get(item.relationshipId);
    return title ? { ...item, relationshipName: title } : item;
  });
}

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
        relationshipName: companyName(relationships[index]),
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
 * YYYY-MM-DD on the reader's calendar. A task saved for 5pm local is already
 * the next UTC date west of UTC, so the UTC prefix is not "today".
 */
export function localCalendarDay(instant: string | Date): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A task is a follow-up stored for the Tasks page, not a recovery draft. */
export function isWorkspaceTask(action: { actionType?: string; channel?: string }): boolean {
  return action.actionType === "follow_up_task" && action.channel === "task";
}

/**
 * Home's recovery number is open actions that are not tasks. Zero open actions
 * needs no split. Until the action list arrives, the number stays unset so a
 * task is not briefly counted as recovery.
 */
export function recoveryPulseCount(
  openTotal: number | undefined,
  actions: readonly { actionType?: string; channel?: string }[] | undefined,
  actionsFailed = false,
): number | null {
  if (openTotal == null) return null;
  if (openTotal === 0 || actionsFailed) return openTotal;
  if (!actions) return null;
  const tasks = actions.filter(isWorkspaceTask).length;
  return Math.max(0, openTotal - tasks);
}

export function recoveryQueueActions<T extends { actionType?: string; channel?: string }>(
  actions: readonly T[],
): T[] {
  return actions.filter((action) => !isWorkspaceTask(action));
}

export function workspaceTaskIds(
  actions: readonly { id: string; actionType?: string; channel?: string }[] | undefined,
): ReadonlySet<string> {
  return new Set((actions ?? []).filter(isWorkspaceTask).map((action) => action.id));
}

/** A task recommendation is the task itself, not a company risk. */
export function isTaskAttention(
  item: { recommendationId?: string },
  taskIds: ReadonlySet<string>,
): boolean {
  return Boolean(item.recommendationId && taskIds.has(item.recommendationId));
}

export function attentionWithoutTasks<T extends { recommendationId?: string }>(
  items: readonly T[],
  taskIds: ReadonlySet<string>,
): T[] {
  return items.filter((item) => !isTaskAttention(item, taskIds));
}

/**
 * Home's at-risk number counts companies with an open attention item. A task
 * also opens one, and that company is not at risk when the task is the only
 * reason. Until both lists arrive, the number stays unset.
 */
export function atRiskPulseCount(
  apiCount: number | undefined,
  attention: readonly { relationshipId: string; recommendationId?: string }[] | undefined,
  actions: readonly { id: string; actionType?: string; channel?: string }[] | undefined,
  listsFailed = false,
): number | null {
  if (apiCount == null) return null;
  if (apiCount === 0 || listsFailed) return apiCount;
  if (!attention || !actions) return null;
  const taskIds = workspaceTaskIds(actions);
  const taskOnly = new Set<string>();
  const other = new Set<string>();
  for (const item of attention) {
    if (isTaskAttention(item, taskIds)) taskOnly.add(item.relationshipId);
    else other.add(item.relationshipId);
  }
  let subtracted = 0;
  for (const id of taskOnly) if (!other.has(id)) subtracted += 1;
  return Math.max(0, apiCount - subtracted);
}

/** A portfolio score driven only by a task is not account risk. */
export function exposureRiskScore(apiScore: number, atRisk: number | null): number {
  if (atRisk === 0) return 0;
  return apiScore;
}

/**
 * The weekly digest is the inbox summary. A task the person saved is not an
 * open loop slipping in mail, even though it is stored as a manual action.
 */
export function digestWithoutTasks<T extends { detector?: string; reason?: string }>(
  top: readonly T[] | undefined,
  actions: readonly { actionType?: string; channel?: string; reason?: string }[] | undefined,
): T[] {
  const items = [...(top ?? [])];
  if (!actions) return items;
  const taskReasons = new Set(
    actions
      .filter(isWorkspaceTask)
      .map((action) => (action.reason ?? "").trim())
      .filter(Boolean),
  );
  return items.filter((item) => {
    const manual = (item.detector ?? "").trim().toLowerCase() === "manual";
    return !(manual && taskReasons.has((item.reason ?? "").trim()));
  });
}

export function detectorsWithoutTasks<
  T extends { detector: string; surfaced: number; handled: number },
>(rows: readonly T[] | undefined, taskCount: number): T[] {
  const list = [...(rows ?? [])];
  if (taskCount <= 0) return list;
  return list.flatMap((row) => {
    if (row.detector !== "manual") return [row];
    const surfaced = Math.max(0, row.surfaced - taskCount);
    if (surfaced === 0 && row.handled === 0) return [];
    return [{ ...row, surfaced }];
  });
}

export function exposureReasons<T extends { reason: string; relationships: number }>(
  reasons: readonly T[] | undefined,
  attention: readonly { relationshipId: string; reasonCode?: string; recommendationId?: string }[] | undefined,
  actions: readonly { id: string; actionType?: string; channel?: string }[] | undefined,
): T[] {
  const list = [...(reasons ?? [])];
  if (!attention || !actions) return list;
  const taskIds = workspaceTaskIds(actions);
  const recommendationAccounts = new Set(
    attention
      .filter((item) => item.reasonCode === "recommendation" && !isTaskAttention(item, taskIds))
      .map((item) => item.relationshipId),
  );
  return list.flatMap((reason) => {
    if (reason.reason !== "recommendation") return [reason];
    if (recommendationAccounts.size === 0) return [];
    return [{ ...reason, relationships: recommendationAccounts.size }];
  });
}

export function taskIsDueToday(dueAt: string | null | undefined, today: string): boolean {
  if (!dueAt) return false;
  const day = localCalendarDay(dueAt);
  return day !== "" && day === today;
}

/**
 * A task is saved at 5pm on the chosen day, and the list only prints that
 * day. Overdue means the day has passed. 6pm on the due date is still that day.
 */
export function taskIsOverdue(dueAt: string | null | undefined, now: number | Date): boolean {
  if (!dueAt) return false;
  const dueDay = localCalendarDay(dueAt);
  const today = localCalendarDay(now instanceof Date ? now : new Date(now));
  if (!dueDay || !today) return false;
  return dueDay < today;
}

/**
 * The report used to call every promise that was not inbound "we owe them".
 * A mutual promise is one both sides made.
 */
export function promiseDirectionLabel(direction: string | null | undefined): string {
  if (direction === "promised_by_them") return "they owe us";
  if (direction === "mutual") return "we both owe";
  return "we owe them";
}

/** Open promises used to print the UTC date prefix. The reader sees their own day. */
export function promiseDueLabel(dueAt: string | null | undefined): string {
  if (!dueAt) return "due unspecified";
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) return "due unspecified";
  return `due ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
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
