/**
 * Evidence-source cards used to print the API's scope explanation and the
 * raw OAuth scope list. The stored text is the contract; the card says what
 * a person can read and what still waits for approval.
 */
const KNOWN_SOURCES: Record<string, { explanation: string; read: string; write: string }> = {
  google: {
    explanation:
      "Read recent mail and meetings to build company history. Sending and calendar changes wait for approval.",
    read: "Mail and calendar",
    write: "Drafts, sending, and calendar changes",
  },
  slack: {
    explanation:
      "Read channels and people to add shared context. Posting waits until you approve the exact message.",
    read: "Channels and people",
    write: "Post a message",
  },
  hubspot: {
    explanation:
      "Read companies, contacts, and deals. Notes and tasks are created only after you approve them.",
    read: "Companies, contacts, and deals",
    write: "Notes and tasks",
  },
};

const KNOWN_SCOPES: Record<string, string> = {
  "https://www.googleapis.com/auth/gmail.readonly": "Mail",
  "https://www.googleapis.com/auth/gmail.compose": "Drafts",
  "https://www.googleapis.com/auth/gmail.send": "Sending",
  "https://www.googleapis.com/auth/calendar.events.readonly": "Calendar",
  "https://www.googleapis.com/auth/calendar.events": "Calendar changes",
  "channels:history": "Channel history",
  "channels:read": "Channels",
  "users:read": "People",
  "chat:write": "Post a message",
  "crm.objects.companies.read": "Companies",
  "crm.objects.contacts.read": "Contacts",
  "crm.objects.deals.read": "Deals",
  "crm.objects.notes.write": "Notes",
  "crm.objects.tasks.write": "Tasks",
};

function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Health, lifecycle, and similar stored tokens are not sentences. */
export function enumLabel(value?: string): string {
  return titleCase((value || "unknown").replaceAll("_", " ").replaceAll(".", " "));
}

/** A person on a company stores a role token. The row names the role. */
export function participantRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    contact: "Contact",
    primary_contact: "Primary contact",
    champion: "Champion",
    decision_maker: "Decision maker",
    blocker: "Blocker",
    executive_sponsor: "Executive sponsor",
    owner: "Owner",
    former_contact: "Former contact",
  };
  return labels[role] ?? enumLabel(role);
}

const ACTIVITY_SOURCE_LABELS: Record<string, string> = {
  gmail: "Gmail",
  google: "Google",
  calendar: "Calendar",
  slack: "Slack",
  hubspot: "HubSpot",
  meeting: "A meeting",
  desktop_note: "A note",
  voice_note: "A voice note",
  browser: "The browser",
  crm: "The CRM",
  user: "Added by you",
  web: "The web",
  composio: "A connected app",
};

const ACTIVITY_EVENT_LABELS: Record<string, string> = {
  "thread.updated": "Mail updated",
  thread: "Mail",
  "thread.snapshot": "Mail",
  "message.posted": "Message",
  "message.snapshot": "Message",
  "message.created": "Message",
  "event.updated": "Meeting updated",
  "meeting.snapshot": "Meeting",
  "company.created": "Company added",
  "company.updated": "Company updated",
  "company.snapshot": "Company record",
  "relationship.observed": "Recorded",
  "relationship.reviewed": "Reviewed",
  person_added: "Person added",
  note: "Note saved",
  note_deleted: "Note removed",
  commitment_confirmed: "Promise confirmed",
  commitment_created: "Promise added",
  commitment_status_changed: "Promise updated",
  commitment_evidence_observed: "Promise evidence",
  lifecycle_changed: "Lifecycle updated",
  lifecycle_observed: "Lifecycle updated",
  deal_stage_changed: "Deal stage updated",
  meeting_missing: "Meeting missing",
  engagement_declined: "Engagement changed",
  engagement_changed: "Engagement changed",
  contact_departed: "Contact left",
  conversation_evidence_compiled: "Conversation reviewed",
  conversation_evidence_corrected: "Conversation corrected",
  relationship_contradiction_resolved: "Contradiction resolved",
  "crm.activity": "CRM activity",
  mutual_action_plan_response_received: "Plan response",
  oppulence_action: "Action recorded",
};

/**
 * The sources menu and the sources page share this badge. A stored status
 * such as "live" or "reconnect_required" is not the label.
 */
export function sourceConnectionLabel(source: {
  source: string;
  status: string;
  backfillPhase?: string;
  completeness?: string;
}): string {
  if (source.status === "not_connected") return "Not connected";
  const stopped = source.status === "reconnect_required" || source.status === "disconnected";
  const syncing =
    source.status === "backfilling" ||
    source.status === "rebuilding" ||
    source.backfillPhase === "queued" ||
    source.backfillPhase === "running";
  const supportsResync = ["google", "slack", "hubspot"].includes(source.source.toLowerCase());
  // A missed cadence is the same state on a meeting as on Gmail. Only a
  // half-finished history sync is limited to sources that can be refreshed.
  const stale = !stopped && !syncing && source.status === "stale";
  const incomplete =
    supportsResync && !stopped && !syncing && !stale && source.completeness !== "complete";
  if (stopped) {
    return source.status === "reconnect_required" ? "Reconnect required" : "Disconnected";
  }
  if (syncing) return "Syncing";
  if (stale) return "Out of date";
  if (incomplete) return "Sync incomplete";
  if (source.status === "live" || source.status === "connected") return "Active";
  return enumLabel(source.status);
}

/** A stored connector slug becomes the name a person already sees elsewhere. */
export function activitySourceLabel(source: string): string {
  const key = source.trim().toLowerCase();
  return ACTIVITY_SOURCE_LABELS[key] ?? enumLabel(key);
}

const ACTION_OUTCOME_LABELS: Record<string, string> = {
  sent: "Message sent",
  delivered: "Delivered",
  bounced: "Bounced",
  replied: "They replied",
  meeting_booked: "Meeting booked",
  won: "Won",
  lost: "Lost",
  dismissed: "Dismissed",
  bad_recommendation: "Not a good suggestion",
  deal_advanced: "Deal moved forward",
  onboarding_progressed: "Onboarding moved forward",
  renewed: "Renewed",
  escalated: "Escalated",
  churned: "They left",
  corrected: "Corrected",
};

/** An outcome kind is stored on the activity. The timeline names the result. */
export function actionOutcomeLabel(kind: string): string {
  const key = kind.trim().toLowerCase().replaceAll(" ", "_");
  return ACTION_OUTCOME_LABELS[key] ?? enumLabel(key);
}

/**
 * Older history stored "Action outcome observed: meeting booked." The sentence
 * a person reads is the same label as the heading.
 */
export function activityOutcomeSummary(summary: string): string | null {
  const observed = /^Action outcome observed: ([^.]+)\.$/i.exec(summary.trim());
  if (!observed) return null;
  return actionOutcomeLabel(observed[1]);
}

/** A stored event type becomes a short activity name. Dots are not words. */
export function activityEventLabel(eventType: string): string {
  const key = eventType.trim().toLowerCase();
  const outcome = /^action\.outcome\.(.+)$/.exec(key);
  if (outcome) return actionOutcomeLabel(outcome[1]);
  return ACTIVITY_EVENT_LABELS[key] ?? enumLabel(key);
}

export function activityHeading(source: string, eventType: string): string {
  return `${activitySourceLabel(source)} · ${activityEventLabel(eventType)}`;
}

const MAIL_ACCESS_REASONS: Record<string, string> = {
  mailbox_owner: "Your mailbox",
  owner_default: "Shared in this workspace",
  owner_private: "Kept private",
  protected_recipient: "Protected",
  explicit_grant: "Shared with you",
  cross_tenant: "Outside this workspace",
  missing_identity: "Could not confirm who this is",
  owner_outside_workspace: "Outside this workspace",
  membership_unavailable: "Workspace membership could not be checked",
  workspace_policy_unavailable: "Privacy settings could not be checked",
  policy_unavailable: "Privacy settings could not be checked",
  rules_unavailable: "Privacy settings could not be checked",
  grants_unavailable: "Sharing settings could not be checked",
};

/** Why a mail row is visible. The stored reason is a policy token, not a sentence. */
export function mailAccessReason(reason: string): string {
  const key = reason.trim().toLowerCase();
  return MAIL_ACCESS_REASONS[key] ?? enumLabel(key);
}

/**
 * A company-sheet state change is a word or a short phrase. Stored enums
 * become labels. Free text stays as written. Missing values stay "Unknown"
 * instead of a quoted JSON token.
 */
export function relationshipDeltaValue(value: unknown): string {
  if (value == null) return "Unknown";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "Unknown";
    if (/^[a-z0-9_]+$/.test(trimmed)) return enumLabel(trimmed);
    return trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => relationshipDeltaValue(item))
      .filter((item) => item !== "Unknown");
    return parts.length > 0 ? parts.join(", ") : "None";
  }
  if (typeof value === "object" && "value" in value) {
    return relationshipDeltaValue((value as { value: unknown }).value);
  }
  return "Unknown";
}

const HIDDEN_ACTIVITY_KEYS = new Set([
  "noteId",
  "content",
  "meetingLinked",
  "liveLinked",
  "externalId",
  "contentHash",
  "outcome_kind",
  "provider_source",
  "action_id",
  "recommendation_revision",
  "channel",
  // Confirmation machinery. The promise, who owes it, and the quote are the
  // activity. The flag, the session id, and the clip offsets are not.
  "user_confirmed",
  "commitment_id",
  "evidence_start_ms",
  "evidence_end_ms",
  "commitment_due_timezone",
  // The clock was clamped. The first and last message days are the activity.
  "occurred_at_clamped",
]);

const ACTIVITY_FACT_LABELS: Record<string, string> = {
  title: "Title",
  body: "Note",
  subject: "Subject",
  summary: "Summary",
  from: "From",
  to: "To",
  snippet: "Preview",
  text: "Text",
  preview: "Preview",
  commitment_text: "Promise",
  evidence_quote: "Quote",
};

/** A confirmed meeting stores who owes the promise. The activity says which side. */
function activityDirectionLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  switch (value.trim()) {
    case "promised_by_me":
      return "Direction: We owe them";
    case "promised_by_them":
      return "Direction: They owe us";
    case "mutual":
      return "Direction: We both owe";
    default:
      return null;
  }
}

/** A due instant is stored in UTC. The activity names the day. */
function activityDueLine(value: unknown): string | null {
  const day = activityUtcDay(value);
  return day ? `Due: ${day}` : null;
}

/** Gmail stores the first and last message as instants. The activity names the day. */
function activityMessageDayLine(label: string, value: unknown): string | null {
  const day = activityUtcDay(value);
  return day ? `${label}: ${day}` : null;
}

function activityUtcDay(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Participant refs on a confirmed meeting are tokens until a person is named. */
function activityParticipantLine(key: string, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const who = value.trim();
  if (!who || who === "local-user" || who === "meeting-counterparty") return null;
  if (/^[0-9a-f-]{36}$/i.test(who) || /^[a-z0-9_:-]+$/.test(who)) return null;
  const label =
    key === "owner_participant_ref" ? "From" : key === "beneficiary_participant_ref" ? "For" : "To";
  return `${label}: ${who}`;
}

function activityRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function activityScalar(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object" && "text" in item) {
        return String((item as { text: unknown }).text ?? "").trim();
      }
      if (item && typeof item === "object" && "children" in item) {
        return activityScalar((item as { children: unknown }).children);
      }
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

function linesFromActivity(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  const record = activityRecord(value);
  if (!record) return [];
  const lines: string[] = [];
  for (const [key, item] of Object.entries(record)) {
    if (HIDDEN_ACTIVITY_KEYS.has(key)) continue;
    if (key === "commitment_direction") {
      const direction = activityDirectionLine(item);
      if (direction) lines.push(direction);
      continue;
    }
    if (key === "commitment_due_at") {
      const due = activityDueLine(item);
      if (due) lines.push(due);
      continue;
    }
    if (key === "first_message_at" || key === "last_message_at") {
      const day = activityMessageDayLine(
        key === "first_message_at" ? "First message" : "Last message",
        item,
      );
      if (day) lines.push(day);
      continue;
    }
    if (key === "evidence_quote") {
      const quote = activityScalar(item);
      const promise = activityScalar(record.commitment_text);
      if (quote && quote !== promise) lines.push(`Quote: ${quote}`);
      continue;
    }
    if (
      key === "owner_participant_ref" ||
      key === "counterparty_participant_ref" ||
      key === "beneficiary_participant_ref"
    ) {
      const participant = activityParticipantLine(key, item);
      if (participant) lines.push(participant);
      continue;
    }
    const text = activityScalar(item);
    if (!text || text === "local-user" || text === "meeting-counterparty") continue;
    const shown = /^[a-z0-9_]+$/.test(text) && text.includes("_") ? enumLabel(text) : text;
    lines.push(`${ACTIVITY_FACT_LABELS[key] ?? enumLabel(key)}: ${shown}`);
  }
  if (!lines.some((line) => line.startsWith("Note:")) && "content" in record) {
    const text = activityScalar(record.content);
    if (text) lines.push(`Note: ${text}`);
  }
  return lines;
}

/**
 * Opening an activity used to print the decrypted payload. A saved note has
 * no payload, so the sheet said null. The words already stored on the
 * observation are the thing to read.
 */
export function activityEvidenceLines(
  payload: unknown,
  facts?: Record<string, unknown> | null,
): string[] {
  const fromPayload = linesFromActivity(payload);
  const lines = fromPayload.length > 0 ? fromPayload : linesFromActivity(facts);
  if (activityRecord(facts)?.meetingLinked === true) lines.push("Marked as a meeting note.");
  if (lines.length === 0) return ["Nothing else was saved with this activity."];
  return lines;
}

/**
 * The activity row already prints the summary. A fact that repeats that
 * sentence, such as "Promise: Send the quay quote" under "Send the quay quote",
 * is the same words again.
 */
export function activityLinesBesideSummary(
  lines: readonly string[],
  summary?: string | null,
): string[] {
  const sentence = summary?.trim() ?? "";
  if (!sentence) return [...lines];
  return lines.filter((line) => {
    const split = line.indexOf(": ");
    const value = (split >= 0 ? line.slice(split + 2) : line).trim();
    return value !== sentence;
  });
}

/** A scope id or URL becomes a short permission name. Known grants win. */
export function scopeLabel(scope: string): string {
  const trimmed = scope.trim();
  const known = KNOWN_SCOPES[trimmed];
  if (known) return known;
  const slash = trimmed.lastIndexOf("/");
  const bare = slash >= 0 ? trimmed.slice(slash + 1) : trimmed;
  return titleCase(bare.replaceAll(/[._:-]+/g, " "));
}

export function sourceProductCopy(
  source: string,
  storedExplanation: string,
): { explanation: string; read: string; write: string } {
  const known = KNOWN_SOURCES[source.trim().toLowerCase()];
  if (known) return known;
  return {
    explanation: storedExplanation.trim() || "This source can be connected for company evidence.",
    read: "What this source can read",
    write: "Changes that wait for approval",
  };
}

/** Removing a person suppresses their address. The question stays on the page. */
export function removePersonConfirmCopy(name: string): string {
  const person = name.trim() || "this person";
  return `Remove ${person} and everything derived from them? Their address is suppressed, so a later sync will not recreate them. This cannot be undone.`;
}

export function missingScopeLabels(scopes: readonly string[]): string {
  const labels = [...new Set(scopes.map((scope) => scopeLabel(scope)).filter(Boolean))];
  return labels.join(", ");
}
