import { ACTION_TYPE_LABELS, actionReasonCopy } from "./revenue";

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
  email_exchanged: "Mail",
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
  meeting_attendance_recorded: "Attendance",
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

/** Gmail stores the connector slug. The activity uses the same name as the heading. */
function activityProviderLine(value: unknown): string | null {
  const text = activityScalar(value);
  if (!text || text === "local-user" || text === "meeting-counterparty") return null;
  return `Provider: ${activitySourceLabel(text)}`;
}

/** Mail direction is outbound or inbound. The activity capitalizes the word. */
function activityMailDirectionLine(value: unknown): string | null {
  const text = activityScalar(value);
  if (!text || text === "local-user" || text === "meeting-counterparty") return null;
  const key = text.trim().toLowerCase();
  if (key === "outbound") return "Direction: Outbound";
  if (key === "inbound") return "Direction: Inbound";
  const shown = /^[a-z0-9_]+$/.test(text) && text.includes("_") ? enumLabel(text) : text;
  return `Direction: ${shown}`;
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
 * The company sheet already names these tokens. Title-casing them made What
 * changed say "Needs Attention" beside a badge that says "Needs attention".
 * A missing value stays "Unknown". The stored token unknown is "Not known".
 */
const SHEET_STATE_LABELS: Record<string, string> = {
  unknown: "Not known",
  historical_unknown: "Not recorded for this date",
  review_required: "Needs review",
  needs_attention: "Needs attention",
  at_risk: "At risk",
  active_customer: "Active customer",
  former_customer: "Former customer",
  stale: "Out of date",
};

/**
 * A company-sheet state change is a word or a short phrase. Closed sheet
 * tokens use the sheet's words. Other stored enums become labels. Free text
 * stays as written. Missing values stay "Unknown" instead of a quoted JSON token.
 */
export function relationshipDeltaValue(value: unknown): string {
  if (value == null) return "Unknown";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "Unknown";
    if (/^[a-z0-9_]+$/.test(trimmed)) return SHEET_STATE_LABELS[trimmed] ?? enumLabel(trimmed);
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

  // Gmail ids. The attachment and participant counts are the activity.
  "thread_id",
  "message_id",
  // Meeting ids. The title, the transcript, and who attended are the activity.
  "session_id",
  "dedupe_fingerprint",
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

/**
 * A confirmed meeting stores who spoke the promise. The activity says which
 * side. A speaker id stays on the observation.
 */
function activityPromiseOwnerLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  switch (value.trim()) {
    case "me":
    case "local-user":
      return "We made this promise";
    case "them":
      return "They made this promise";
    default:
      return null;
  }
}

/**
 * A confirmed meeting stores whether the promise is still open. The activity
 * says that in words. The register's Kept and Open badges stay their own words.
 */
function activityPromiseStatusLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  switch (value.trim()) {
    case "open":
      return "This promise is still open";
    case "done":
      return "This promise is done";
    case "dropped":
      return "This promise was dropped";
    case "fulfilled":
      return "This promise was kept";
    case "cancelled":
      return "This promise was called off";
    case "missed":
      return "This promise was missed";
    case "waived":
      return "This promise was waived";
    case "superseded":
      return "This promise was replaced";
    default:
      return null;
  }
}

/**
 * A status change stores "Commitment marked fulfilled: …". The activity row
 * uses the same sentence as an opened promise.
 */
export function activityPromiseUpdateSummary(summary: string): string | null {
  const match = /^Commitment marked (fulfilled|cancelled|open): (.+)$/.exec(summary.trim());
  if (!match?.[1] || !match[2]) return null;
  const status = activityPromiseStatusLine(match[1]);
  const text = match[2].trim();
  if (!status || !text || text === "local-user") return status;
  return `${status}: ${text}`;
}

/**
 * Attendance stores "2 external participant(s) on \"Q3 review\"". The row
 * uses the same people sentence as the opened activity.
 */
export function activityAttendanceSummary(summary: string): string | null {
  const match = /^(\d+) external participant\(s\) on "(.+)"$/.exec(summary.trim());
  if (!match?.[1] || !match[2]) return null;
  const count = Number(match[1]);
  const title = match[2].trim();
  if (!Number.isInteger(count) || count < 0 || !title || title === "local-user") return null;
  const people =
    count === 0
      ? "No one from outside the company"
      : count === 1
        ? "1 person from outside the company"
        : `${String(count)} people from outside the company`;
  return `${people} on ${title}`;
}

/**
 * A reviewed conversation stores "Q3 review · 12 segments · 3 material claims".
 * The row uses the same line count as the opened transcript.
 */
export function activityConversationSummary(summary: string): string | null {
  const match = /^(.+) · (\d+) segments · (\d+) material claims$/.exec(summary.trim());
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const title = match[1].trim();
  const lines = Number(match[2]);
  const claims = Number(match[3]);
  if (!title || title === "local-user") return null;
  if (!Number.isInteger(lines) || lines < 0 || !Number.isInteger(claims) || claims < 0) return null;
  const lineLabel = lines === 1 ? "1 line in the transcript" : `${String(lines)} lines in the transcript`;
  const claimLabel = claims === 1 ? "1 claim" : `${String(claims)} claims`;
  return `${title} · ${lineLabel} · ${claimLabel}`;
}

/**
 * Gmail stores "4-message thread with acme.com". The row says how many
 * messages and who they were with. A missing company stays a person.
 */
export function activityMailThreadSummary(summary: string): string | null {
  const match = /^(\d+)-message thread with (.+)$/.exec(summary.trim());
  if (!match?.[1] || !match[2]) return null;
  const count = Number(match[1]);
  const who = match[2].trim();
  if (!Number.isInteger(count) || count < 0 || !who || who === "local-user") return null;
  const party = who === "an external contact" ? "someone outside the company" : who;
  const messages = count === 1 ? "1 message" : `${String(count)} messages`;
  return `${messages} with ${party}`;
}

/**
 * A confirmed meeting stores "We committed to: Send the proposal". The row
 * uses the same promise sentence as the opened activity. A named guest keeps
 * their name. A speaker id does not.
 */
export function activityCommitmentSummary(summary: string): string | null {
  const match = /^(.+?) committed to: (.+)$/.exec(summary.trim());
  if (!match?.[1] || !match[2]) return null;
  const who = match[1].trim();
  const text = match[2].trim();
  if (!who || !text) return null;
  const unnamed =
    who === "local-user" ||
    who === "meeting-counterparty" ||
    who === "Other" ||
    who === "Unknown speaker" ||
    /^speaker\s+\d+$/i.test(who) ||
    /^[a-z0-9_:-]+$/.test(who);
  const owner =
    who === "We"
      ? "We made this promise"
      : unnamed
        ? "They made this promise"
        : `${who} made this promise`;
  if (text === "local-user" || text === "meeting-counterparty") return owner;
  return `${owner}: ${text}`;
}

/**
 * The activity row and the company graph share one sentence. A stored
 * summary that is already company language stays as written.
 */
export function activityRowSummary(summary: string): string {
  const trimmed = summary.trim();
  return (
    activityOutcomeSummary(trimmed) ??
    activityPromiseUpdateSummary(trimmed) ??
    activityCommitmentSummary(trimmed) ??
    activityAttendanceSummary(trimmed) ??
    activityConversationSummary(trimmed) ??
    activityMailThreadSummary(trimmed) ??
    trimmed
  );
}

/** A status change stores the promise and the new state together. */
function activityCommitmentUpdateLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  const seen = new Set<string>();
  const push = (line: string) => {
    if (!line || seen.has(line)) return;
    seen.add(line);
    lines.push(line);
  };
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const update = item as Record<string, unknown>;
    const status = activityPromiseStatusLine(update.status);
    const text = typeof update.text === "string" ? update.text.trim() : "";
    if (status && text && text !== "local-user" && !/^[a-z0-9_:-]+$/.test(text)) {
      push(`${status}: ${text}`);
    } else if (status) {
      push(status);
    }
    const due = activityDueLine(update.dueAt);
    if (due) push(due);
  }
  return lines;
}

/** The due phrase is the deadline as it was said. The activity quotes it. */
function activityPromiseDuePhraseLine(value: unknown): string | null {
  const phrase = activityScalar(value);
  if (!phrase || phrase === "local-user" || phrase === "meeting-counterparty") return null;
  return `They said: ${phrase}`;
}

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

/**
 * Gmail stores who speaks next. The opened activity says that in words.
 * The mail row's "Waiting on them", "Needs a reply", and "Quiet" stay
 * their own sentences.
 */
function activityReplyStateLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  switch (value.trim()) {
    case "awaiting_reply":
      return "Their reply has not arrived";
    case "needs_reply":
      return "We have not answered this thread";
    case "quiet":
      return "No reply is outstanding";
    default:
      return null;
  }
}

/**
 * A bounce stores why the address failed. The opened activity says that in
 * words. The stored token stays on the observation.
 */
function activityDepartureKindLine(value: unknown): string | null {
  if (typeof value !== "string") return null;
  switch (value.trim()) {
    case "left_organization":
      return "Left this company";
    case "recipient_unknown":
      return "Address was not recognized";
    default:
      return null;
  }
}

/** The bounce stores the mail system's sentence. The activity quotes it. */
function activityDepartureEvidenceLine(value: unknown): string | null {
  const text = activityScalar(value);
  if (!text || text === "local-user" || text === "meeting-counterparty") return null;
  return `The bounce said: ${text}`;
}

/**
 * Roster caveats are stored as capture notes. The opened activity uses the
 * same sentences as the invite counts. A note that only repeats those counts
 * stays off the activity.
 */
function activityCaveatLine(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (
    text === "transcript payload was truncated" ||
    text === "This meeting was not recorded; attendance comes from the invite alone." ||
    /^\d+ invitee\(s\) declined and are not recorded as participants\.$/.test(text) ||
    /^Invitees span \d+ organization domains \(.*\)\.$/.test(text)
  ) {
    return null;
  }
  if (
    text ===
    "Attendance is derived from the calendar invite, not from the recording: an invitee may not have joined."
  ) {
    return "Someone on the invite may not have joined.";
  }
  if (text.startsWith("remote speaker was resolved from the 1:1 calendar attendee")) {
    return "The other person was named from the guest list.";
  }
  if (text === "speaker assignment requires review") return "Who spoke is not confirmed.";
  const shared =
    /^(\d+) participants shared one audio channel; no per-speaker attribution was attempted\.$/.exec(
      text,
    );
  if (shared) {
    const n = Number(shared[1]);
    return n === 1
      ? "1 person shared one audio channel."
      : `${String(n)} people shared one audio channel.`;
  }
  const rooms = /^(\d+) invitee\(s\) excluded as rooms, resources, or notetaker bots\.$/.exec(text);
  if (rooms) {
    const n = Number(rooms[1]);
    return n === 1 ? "1 room or bot was left off." : `${String(n)} rooms or bots were left off.`;
  }
  const pending = /^(\d+) of (\d+) invitee\(s\) had not accepted at capture time\.$/.exec(text);
  if (pending) {
    const n = Number(pending[1]);
    const total = Number(pending[2]);
    const people = total === 1 ? "person" : "people";
    return `${String(n)} of ${String(total)} ${people} had not accepted.`;
  }
  const guardian = /^capture guardian: [a-z0-9_]+ — (.+)$/.exec(text);
  if (guardian?.[1]) return guardian[1].trim();
  if (text === "renderer fallback: timed audio evidence was not retained") {
    return "The timed recording was not saved with this transcript.";
  }
  if (text.startsWith("recovered_without_meta:")) {
    return "The recorder stopped before it finished saving. The two sides may be slightly out of sync.";
  }
  if (text === "long source segments were split into bounded evidence excerpts") {
    return "A long stretch was split into shorter excerpts.";
  }
  if (text === "transcript was truncated at the canonical evidence size limit") {
    return "The transcript was shortened";
  }
  if (text === "remote speaker labels are meeting-scoped") {
    return "Speaker names apply only to this meeting.";
  }
  if (text.startsWith("mic_voice_processing_unavailable:")) {
    return "Echo cancellation was unavailable, so the microphone was recorded without it.";
  }
  if (text.startsWith("mic_voice_processing_silent:")) {
    return "Echo cancellation was silent, so the microphone was recorded without it.";
  }
  if (text.startsWith("mic_raw_fallback_failed:")) {
    return "The microphone could not be recorded.";
  }
  const coded = /^([a-z0-9_:-]+): (.+)$/.exec(text);
  if (coded?.[1] && coded[2]) {
    const recorder = activityRecorderFailureLine(coded[1]);
    if (recorder) return recorder;
    if (coded[1].includes("_")) {
      const message = coded[2].trim();
      if (!message || /^[a-z0-9_:-]+$/.test(message)) return null;
      return message;
    }
  }
  return text;
}

/**
 * A failed recorder stores a machine code and a host sentence that names
 * OSStatus, process taps, and aggregate devices. The opened activity says
 * which side failed. The code and the status number stay off the sheet.
 */
function activityRecorderFailureLine(code: string): string | null {
  switch (code) {
    case "system_tap_denied":
      return "The other side could not be recorded. Allow screen and system audio recording in System Settings.";
    case "system_tap_format":
    case "system_aggregate_failed":
    case "system_ioproc_failed":
    case "system_device_start_failed":
      return "The other side could not be recorded.";
    case "system_writer_failed":
      return "The other side could not be saved.";
    case "mic_permission_denied":
      return "The microphone is blocked. Allow microphone access in System Settings.";
    case "mic_engine_start_failed":
      return "The microphone could not be started.";
    case "mic_format_unsupported":
      return "The microphone could not be recorded.";
    case "mic_writer_failed":
      return "The microphone recording could not be saved.";
    case "standby_flush_failed":
    case "standby_promote_failed":
      return "The recording could not be saved.";
    default:
      return null;
  }
}

/**
 * A meeting transcript stores capture notes on the sealed envelope. The
 * opened activity reads facts, so those notes never appeared. The same
 * sentences as an attendance caveat are the ones to show.
 */
/**
 * A meeting transcript stores what was said on the sealed envelope. The
 * opened activity used to show the line count and skip the words. Speaker
 * ids, confidence, and timestamps stay on the envelope.
 */
function activityEnvelopeLines(payload: unknown): string[] {
  const record = activityRecord(payload);
  const envelope = record ? activityRecord(record.envelope) : null;
  if (!envelope) return [];
  const lines: string[] = [];
  const title = activityScalar(envelope.title);
  if (title && title !== "local-user" && !/^[a-z0-9_:-]+$/.test(title)) {
    lines.push(`Meeting: ${title}`);
  }
  const segments = envelope.segments;
  if (!Array.isArray(segments)) return lines;
  const seen = new Set<string>();
  for (const item of segments) {
    const line = activityTranscriptSegmentLine(item);
    if (!line || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return lines;
}

function activityTranscriptSegmentLine(item: unknown): string | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const segment = item as Record<string, unknown>;
  const text = typeof segment.text === "string" ? segment.text.trim() : "";
  if (!text || text === "local-user" || text === "meeting-counterparty") return null;
  if (/^[a-z0-9_:-]+$/.test(text)) return null;
  const speaker = activityClaimSpeaker(segment.speakerLabel);
  return speaker ? `${speaker}: ${text}` : text;
}

function activityPayloadCaveatLines(payload: unknown): string[] {
  const record = activityRecord(payload);
  if (!record) return [];
  const envelope = activityRecord(record.envelope) ?? record;
  const caveats = envelope.captureCaveats ?? envelope.capture_caveats;
  if (!Array.isArray(caveats)) return [];
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const item of caveats) {
    if (typeof item !== "string") continue;
    const line = activityCaveatLine(item);
    if (!line || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return lines;
}

/**
 * Calendar attendance stores the invite beside the event id. The opened
 * activity says who was invited. The event id stays hidden.
 */
function activityAttendanceLines(key: string, value: unknown): string[] | null {
  switch (key) {
    case "calendar_event_id":
      return [];
    case "meeting_title": {
      const title = activityScalar(value);
      return title && title !== "local-user" ? [`Meeting: ${title}`] : [];
    }
    case "attendance_source":
      return value === "calendar_invite" ? ["Taken from the invite"] : [];
    case "recorded":
      if (typeof value !== "boolean") return [];
      return [value ? "A recording was saved" : "No recording was saved"];
    case "meeting_size":
      return activityMeetingSizeLines(value);
    case "invitee_count":
      return activityPeopleCount(value, "person invited", "people invited");
    case "external_count":
      return activityPeopleCount(
        value,
        "person from outside the company",
        "people from outside the company",
      );
    case "declined_count":
      return activityPeopleCount(value, "person declined", "people declined");
    case "external_domains":
      return activityOutsideDomainLines(value);
    case "organizer_email": {
      const email = activityScalar(value);
      if (!email || email === "local-user" || /^[a-z0-9_:-]+$/.test(email)) return [];
      return [`Organizer: ${email}`];
    }
    case "attendance_confidence":
      return activityAttendanceConfidenceLines(value);
    case "capture_caveats":
      if (!Array.isArray(value)) return [];
      return value
        .filter((item): item is string => typeof item === "string")
        .map((item) => activityCaveatLine(item))
        .filter((item): item is string => Boolean(item));
    default:
      return null;
  }
}

/**
 * A reviewed conversation stores each material claim on the activity. The
 * suggestion card already names a risk and an objection. The opened activity
 * uses those titles. Lifecycle and sentiment use the company sheet's words.
 * A review id and a speaker id stay hidden.
 */
function activityConversationClaimLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const line = activityConversationClaimLine(item);
    if (!line || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return lines;
}

function activityConversationClaimLine(item: unknown): string | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const claim = item as Record<string, unknown>;
  const kind = typeof claim.kind === "string" ? claim.kind.trim() : "";
  const title = activityClaimTitle(kind);
  if (!title) return null;
  const stored = typeof claim.value === "string" ? claim.value.trim() : "";
  const quote = typeof claim.exactQuote === "string" ? claim.exactQuote.trim() : "";
  const raw = stored || quote;
  if (!raw || raw === "local-user" || raw === "meeting-counterparty") return null;
  const shown = activityClaimValue(kind, raw);
  if (!shown) return null;
  const speaker = activityClaimSpeaker(claim.speakerLabel);
  return speaker ? `${title}: ${shown} — ${speaker}` : `${title}: ${shown}`;
}

/**
 * A reviewed conversation stores who each voice was resolved to. A named
 * guest is the activity. The local user, a speaker id, and an anonymous
 * label stay hidden.
 */
function activityParticipantResolutionLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  const seen = new Set<string>();
  let unnamed = false;
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const source = typeof row.resolution_source === "string" ? row.resolution_source.trim() : "";
    const anonymous =
      source === "anonymous" ||
      !label ||
      label === "Other" ||
      label === "Unknown speaker" ||
      /^speaker\s+\d+$/i.test(label);
    if (anonymous) {
      unnamed = true;
      continue;
    }
    if (label === "You" || label === "local-user" || label === "meeting-counterparty") continue;
    if (/^[a-z0-9_:-]+$/.test(label)) continue;
    const line = `Named from the guest list: ${label}`;
    if (seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  if (unnamed) lines.push("A speaker was not named");
  return lines;
}

/** A claim stores who spoke. A speaker id and an anonymous label stay hidden. */
function activityClaimSpeaker(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.trim();
  if (!label || label === "local-user" || label === "meeting-counterparty") return null;
  if (label === "Other" || label === "Unknown speaker" || /^speaker\s+\d+$/i.test(label)) return null;
  if (/^[a-z0-9_:-]+$/.test(label)) return null;
  return label;
}

function activityClaimTitle(kind: string): string | null {
  switch (kind) {
    case "risk":
      return "Risk raised in a conversation";
    case "objection":
      return "Unresolved objection";
    case "decision":
      return "Decision";
    case "milestone":
      return "Milestone";
    case "stakeholder":
      return "Stakeholder";
    case "commitment":
      return "Promise";
    case "lifecycle":
      return "Lifecycle";
    case "sentiment":
      return "Sentiment";
    default:
      return null;
  }
}

function activityClaimValue(kind: string, value: string): string | null {
  if (kind === "lifecycle" || kind === "sentiment") {
    if (/^[a-z0-9_]+$/.test(value)) return SHEET_STATE_LABELS[value] ?? enumLabel(value);
    return value;
  }
  if (/^[a-z0-9_:-]+$/.test(value)) return null;
  return value;
}

/**
 * A reviewed conversation stores the follow-ups it proposed. The
 * recommendation card already names the type. The opened activity uses that
 * label and the reason. The draft, the channel, and the action id stay hidden.
 * A shadow pack is not a proposal someone can approve.
 */
function activityActionPackLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  const seen = new Set<string>();
  const push = (line: string) => {
    if (!line || seen.has(line)) return;
    seen.add(line);
    lines.push(line);
  };
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const action = item as Record<string, unknown>;
    const type = typeof action.actionType === "string" ? action.actionType.trim() : "";
    const label = ACTION_TYPE_LABELS[type];
    if (!label) continue;
    const reason = actionReasonCopy(typeof action.reason === "string" ? action.reason : "");
    if (reason && !/^[a-z0-9_:-]+$/.test(reason)) push(`${label}: ${reason}`);
    else push(label);
    const due = activityDueLine(action.dueAt);
    if (due) push(due);
  }
  return lines;
}

/**
 * Attendance stores how sure the invite is for each person. Accepted is 0.9.
 * Invited and not declined, but never confirmed, is 0.6. A speaker id stays hidden.
 */
function activityAttendanceConfidenceLines(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const [rawWho, rawScore] of Object.entries(value)) {
    const who = rawWho.trim();
    if (!who || who === "local-user" || who === "meeting-counterparty") continue;
    if (/^[a-z0-9_:-]+$/.test(who)) continue;
    if (typeof rawScore !== "number" || !Number.isFinite(rawScore)) continue;
    let line = "";
    if (Math.abs(rawScore - 0.9) < 0.001) line = `Accepted the invite: ${who}`;
    else if (Math.abs(rawScore - 0.6) < 0.001) line = `Had not accepted: ${who}`;
    if (!line || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return lines;
}

/**
 * The invite stores how large the meeting was: solo, one to one, a small
 * group, or a large group. A headcount is not what was saved.
 */
function activityMeetingSizeLines(value: unknown): string[] {
  if (typeof value !== "string") return [];
  switch (value.trim()) {
    case "solo":
      return ["No one else was on the invite"];
    case "one_to_one":
      return ["One other person was on the invite"];
    case "small_group":
      return ["A small group was on the invite"];
    case "large_group":
      return ["A large group was on the invite"];
    default:
      return [];
  }
}

/** Outside companies are stored as domain and count. The activity names the domain. */
function activityOutsideDomainLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const domains: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const domain = activityOutsideDomain(item);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    domains.push(domain);
  }
  return domains.length > 0 ? [`Outside domains: ${domains.join(", ")}`] : [];
}

function activityOutsideDomain(item: unknown): string | null {
  const raw =
    typeof item === "string"
      ? item
      : item && typeof item === "object" && !Array.isArray(item) && typeof (item as { domain?: unknown }).domain === "string"
        ? (item as { domain: string }).domain
        : "";
  const domain = raw.trim();
  if (!domain || domain === "local-user" || domain === "meeting-counterparty") return null;
  if (/^[a-z0-9_:-]+$/.test(domain)) return null;
  return domain;
}

function activityPeopleCount(value: unknown, one: string, many: string): string[] {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return [];
  return [value === 1 ? `1 ${one}` : `${String(value)} ${many}`];
}

/**
 * A meeting stores how the transcript was made and whether the recording
 * stays. The opened activity says that in words. Session ids stay hidden.
 */
function activityTranscriptLines(key: string, value: unknown): string[] | null {
  switch (key) {
    case "transcript_segments":
      return activityPeopleCount(value, "line in the transcript", "lines in the transcript");
    case "transcript_payload_truncated":
      return value === true ? ["The transcript was shortened"] : [];
    case "transcription_engine":
      return activityTranscriptionEngineLines(value);
    case "transcription_model":
      return activityTranscriptionModelLines(value);
    case "audio_retention":
      if (typeof value !== "string") return [];
      switch (value.trim()) {
        case "untilTranscribed":
          return ["The recording is removed after transcription"];
        case "always":
          return ["The recording is kept"];
        case "never":
          return ["The recording is not kept"];
        default:
          return [];
      }
    case "tracks":
      return activityTrackLines(value);
    default:
      return null;
  }
}

/**
 * Settings name the on-device engines Whisper and Parakeet, and the cloud
 * route Deepgram. A cloud transcript stores deepgram or solomon, which the
 * activity used to drop. A speaker id stays hidden.
 */
function activityTranscriptionEngineLines(value: unknown): string[] {
  const engine = activityScalar(value);
  if (!engine || engine === "local-user" || engine === "meeting-counterparty") return [];
  switch (engine.trim().toLowerCase()) {
    case "parakeet":
      return ["Transcribed with Parakeet"];
    case "whisper":
    case "whisper.cpp":
    case "whisper-local":
      return ["Transcribed with Whisper"];
    case "deepgram":
      return ["Transcribed with Deepgram"];
    case "solomon":
      return ["Transcribed with Oppulence Cloud (Deepgram)"];
    default:
      if (/^[a-z0-9_:-]+$/.test(engine)) return [];
      return [`Transcribed with ${engine}`];
  }
}

/**
 * Settings name the downloaded model, and a cloud meeting stores Nova-3.
 * A Parakeet meeting stores the checkpoint filename. An unknown file name
 * stays as written.
 */
const TRANSCRIPTION_MODEL_LABELS: Record<string, string> = {
  "tiny.en-q5_1": "Tiny · English",
  "base.en-q5_1": "Base · English (recommended)",
  "base-q5_1": "Base · Multilingual",
  "small.en-q5_1": "Small · English",
  "small-q5_1": "Small · Multilingual",
  "large-v3-turbo-q5_0": "Large v3 Turbo · Multilingual (fast, accurate)",
  "large-v3-q5_0": "Large v3 · Multilingual (max accuracy)",
  "parakeet-tdt-0.6b-v3": "Parakeet v3",
  "parakeet-tdt-0.6b-v3-coreml": "Parakeet v3",
  "parakeet-tdt-0.6b-v2": "Parakeet v2",
  "parakeet-tdt-0.6b-v2-coreml": "Parakeet v2",
  "nova-3": "Nova-3",
};

function activityTranscriptionModelLines(value: unknown): string[] {
  const model = activityScalar(value);
  if (!model || model === "local-user" || model === "meeting-counterparty") return [];
  const known = TRANSCRIPTION_MODEL_LABELS[model.trim().toLowerCase()];
  return [`Model: ${known ?? model}`];
}

/**
 * A meeting stores whether the microphone and the other side were silent.
 * A peak level stays off the activity. A track that had sound needs no line.
 */
function activityTrackLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const track = item as Record<string, unknown>;
    if (track.silent !== true) continue;
    const id = typeof track.id === "string" ? track.id.trim() : "";
    const line =
      id === "mic"
        ? "The microphone was silent"
        : id === "system"
          ? "The other side was silent"
          : "";
    if (!line || seen.has(line)) continue;
    seen.add(line);
    lines.push(line);
  }
  return lines;
}

/**
 * Gmail stores how many messages, files, and people were on the thread.
 * The opened activity says the count. The mail row's "4 messages" stays
 * its own sentence.
 */
function activityCountLine(key: string, value: unknown): string | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  const n = value;
  const unit = (one: string, many: string) => (n === 1 ? `1 ${one}` : `${String(n)} ${many}`);
  switch (key) {
    case "message_count":
      return unit("message in this activity", "messages in this activity");
    case "outbound_count":
      return unit("message sent from this mailbox", "messages sent from this mailbox");
    case "inbound_count":
      return unit("message received from them", "messages received from them");
    case "attachment_count":
      return unit("file attached to this activity", "files attached to this activity");
    case "participant_count":
      return unit("person on this activity", "people on this activity");
    case "external_participant_count":
      return unit("person outside the company", "people outside the company");
    default:
      return null;
  }
}

/**
 * Gmail stores yes/no flags. The opened activity says the fact. A number such
 * as 1 stays on the count line, because it is not the word true.
 */
function activityFlagLine(key: string, value: unknown): string | null {
  if (typeof value !== "boolean") return null;
  switch (key) {
    case "has_attachments":
      return value ? "Includes an attachment" : "No attachments";
    case "is_first_contact":
      return value ? "First email in this thread" : "Not the first email";
    case "subject_present":
      return value ? "Subject is filled in" : "Subject was left blank";
    default:
      return null;
  }
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
    if (key === "commitment_owner") {
      const owner = activityPromiseOwnerLine(item);
      if (owner) lines.push(owner);
      continue;
    }
    if (key === "commitment_status") {
      const status = activityPromiseStatusLine(item);
      if (status) lines.push(status);
      continue;
    }
    if (key === "commitment_updates") {
      lines.push(...activityCommitmentUpdateLines(item));
      continue;
    }
    if (key === "commitment_due_phrase") {
      const phrase = activityPromiseDuePhraseLine(item);
      if (phrase) lines.push(phrase);
      continue;
    }
    if (key === "provider") {
      const provider = activityProviderLine(item);
      if (provider) lines.push(provider);
      continue;
    }
    if (key === "direction") {
      const direction = activityMailDirectionLine(item);
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
    const flag = activityFlagLine(key, item);
    if (flag) {
      lines.push(flag);
      continue;
    }
    if (key === "departure_kind") {
      const departure = activityDepartureKindLine(item);
      if (departure) lines.push(departure);
      continue;
    }
    if (key === "departure_evidence") {
      const evidence = activityDepartureEvidenceLine(item);
      if (evidence) lines.push(evidence);
      continue;
    }
    if (key === "reply_state") {
      const reply = activityReplyStateLine(item);
      if (reply) lines.push(reply);
      continue;
    }
    const attendance = activityAttendanceLines(key, item);
    if (attendance !== null) {
      lines.push(...attendance);
      continue;
    }
    const transcript = activityTranscriptLines(key, item);
    if (transcript !== null) {
      lines.push(...transcript);
      continue;
    }
    if (key === "conversation_claims") {
      lines.push(...activityConversationClaimLines(item));
      continue;
    }
    if (key === "participant_resolution") {
      lines.push(...activityParticipantResolutionLines(item));
      continue;
    }
    if (key === "legacy_shadow_action_pack") continue;
    if (key === "action_pack") {
      lines.push(...activityActionPackLines(item));
      continue;
    }
    if (
      key === "message_count" ||
      key === "outbound_count" ||
      key === "inbound_count" ||
      key === "attachment_count" ||
      key === "participant_count" ||
      key === "external_participant_count"
    ) {
      const count = activityCountLine(key, item);
      if (count) lines.push(count);
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
  const lines = fromPayload.length > 0 ? [...fromPayload] : linesFromActivity(facts);
  for (const line of activityEnvelopeLines(payload)) {
    if (!lines.includes(line)) lines.push(line);
  }
  for (const line of activityPayloadCaveatLines(payload)) {
    if (!lines.includes(line)) lines.push(line);
  }
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
