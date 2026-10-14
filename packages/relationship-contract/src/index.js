export const MISSION_CONTROL_QUESTIONS = [
  { key: "state", label: "What is true now?" },
  { key: "change", label: "What changed?" },
  { key: "evidence", label: "Why should I trust it?" },
  { key: "action", label: "What should happen next?" },
];

// User-facing RFC 038 capabilities that must remain reachable in both clients.
// Platform-specific capture mechanics may differ, but both clients must expose a
// path to publish reviewed transcript evidence into the same relationship state.
export const RELATIONSHIP_CLIENT_CAPABILITIES = [
  "source-lifecycle",
  "identity-review",
  "mission-control",
  "evidence-inspection",
  "state-correction",
  "assertion-retraction",
  "conversation-review",
  "contradiction-resolution",
  "commitment-management",
  "mutual-action-plans",
  "attention-queue",
  "governed-actions",
  "action-audit",
  "outcome-observation",
  "transcript-publication",
  "privacy-deletion",
  "support-diagnostics",
  "relationship-graph",
  "graph-query",
  "graph-saved-views",
  "graph-governed-actions",
];

export const RELATIONSHIP_GRAPH_CONTRACT_VERSION = "2026-08-01";

export const RELATIONSHIP_GRAPH_NODE_KINDS = [
  "relationship",
  "person",
  "commitment",
  "risk",
  "milestone",
  "action",
  "evidence",
  "source",
  "note",
];

export const RELATIONSHIP_GRAPH_EDGE_KINDS = [
  "participant_of",
  "owns",
  "has_commitment",
  "blocks",
  "requires",
  "supersedes",
  "has_risk",
  "has_milestone",
  "recommended_for",
  "supports",
  "contradicts",
  "observed_from",
  "linked_note",
];

const GRAPH_QUERY_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "for",
  "from",
  "in",
  "is",
  "me",
  "of",
  "on",
  "show",
  "that",
  "the",
  "this",
  "to",
  "what",
  "which",
  "who",
  "with",
]);

const GRAPH_QUERY_NODE_ALIASES = {
  account: "relationship",
  accounts: "relationship",
  company: "relationship",
  companies: "relationship",
  relationship: "relationship",
  relationships: "relationship",
  people: "person",
  person: "person",
  contacts: "person",
  commitment: "commitment",
  commitments: "commitment",
  promise: "commitment",
  promises: "commitment",
  risk: "risk",
  risks: "risk",
  milestone: "milestone",
  milestones: "milestone",
  action: "action",
  actions: "action",
  recommendation: "action",
  recommendations: "action",
  evidence: "evidence",
  observation: "evidence",
  observations: "evidence",
  detail: "evidence",
  details: "evidence",
  source: "source",
  sources: "source",
  note: "note",
  notes: "note",
};

const GRAPH_QUERY_LIFECYCLES = [
  "prospect",
  "evaluation",
  "contracting",
  "onboarding",
  "active_customer",
  "renewal",
  "churned",
  "former_customer",
];

const GRAPH_QUERY_HEALTH = ["healthy", "needs_attention", "critical", "unknown"];
// The inspector names these readings. They are not words in the company name.
const GRAPH_QUERY_ENGAGEMENT = ["increasing", "steady", "declining", "dormant"];
const GRAPH_QUERY_SENTIMENT = ["positive", "mixed", "negative"];
const GRAPH_QUERY_SOURCES = [
  "gmail",
  "calendar",
  "slack",
  "hubspot",
  "meeting",
  "desktop_note",
  "voice_note",
  "browser",
  "crm",
  "user",
];

const normalizedGraphValue = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

// The question turns a hyphen into an underscore before it keeps leftover
// words. The card still prints the hyphen, so the comparison uses the same
// spelling on both sides.
const graphSearchText = (value) => normalizedGraphValue(value).replaceAll("-", "_");

// A calendar snapshot's status is Meeting. That badge is the same word as
// the meeting source, and the snapshot itself is stored as calendar.
const GRAPH_MEETING_BADGES = new Set([
  "meeting",
  "a meeting",
  "meeting updated",
  "meeting missing",
  "meeting booked",
]);

/** A kept, missed, waived, or unconfirmed promise is not still overdue. */
const graphPromiseCanBeOverdue = (status) => {
  const normalized = normalizedGraphValue(status);
  return normalized === "open" || normalized === "at_risk";
};

// The card and the inspector say Not known. Engagement and sentiment hide
// their unknown fallback, so those fields are not this sentence.
function graphNodePrintsNotKnown(node) {
  const reading = (field) => normalizedGraphValue(node[field]);
  if (
    ["freshness", "health", "lifecycle", "status", "approvalStatus", "policyStatus", "executionStatus"].some(
      (field) => reading(field) === "unknown",
    )
  ) {
    return true;
  }
  return (
    node.kind === "relationship" &&
    (!node.status || reading("status") === "active") &&
    (!node.health || reading("health") === "unknown")
  );
}

const graphNodeRelationshipIds = (node) => {
  if (node.kind === "relationship") return [node.id.replace(/^relationship:/, "")];
  const ids = Array.isArray(node.relationshipIds) ? node.relationshipIds : [];
  if (node.relationshipId && !ids.includes(node.relationshipId))
    return [node.relationshipId, ...ids];
  return ids;
};

/**
 * Parse a bounded, explainable natural-language graph query. This parser is
 * deliberately deterministic: it never invents graph facts and every applied
 * filter is returned to the UI for inspection.
 */
const GRAPH_CHANGE_LABELS = [
  ["supporting evidence", "evidence"],
  ["next action", "next_action"],
  ["milestones", "milestones"],
  ["risks", "risks"],
  ["lifecycle", "lifecycle"],
  ["engagement", "engagement"],
  ["sentiment", "sentiment"],
  ["health", "health"],
  ["summary", "summary"],
];

// The inspector prints "Changed since you last looked." and, when fields moved,
// "Changed since you last looked: Supporting evidence."
function printedGraphChangeDetail(normalized) {
  const match = /\bchanged since you last looked\b(\s*:\s*([^.]*))?\.?/.exec(normalized);
  if (!match) return null;
  const list = (match[2] ?? "").trim();
  const dimensions = [];
  if (list) {
    for (const part of list.split(",")) {
      const label = part.trim();
      if (!label) continue;
      const found = GRAPH_CHANGE_LABELS.find(([name]) => name === label);
      if (!found) return null;
      dimensions.push(found[1]);
    }
  }
  return { dimensions, span: match[0] };
}

const GRAPH_DUE_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function graphDueLabel(value) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(date)
    .toLowerCase();
}

// The inspector Due cell prints the UTC day, such as "Oct 20, 2026".
function printedGraphDueDay(normalized) {
  const re = new RegExp(
    `(?:^|\\s)((?:due(?::|\\s+date)?\\s+)?(${GRAPH_DUE_MONTHS.join("|")})\\s+(\\d{1,2}),\\s+(\\d{4})\\b\\.?)`,
    "g",
  );
  const found = [];
  for (const match of normalized.matchAll(re)) {
    const rawDay = match[3];
    const day = Number(rawDay);
    const year = Number(match[4]);
    const month = GRAPH_DUE_MONTHS.indexOf(match[2]);
    if (rawDay !== String(day) || month < 0 || year < 1000) continue;
    const date = new Date(Date.UTC(year, month, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
      continue;
    }
    found.push({ label: graphDueLabel(date), span: match[1] });
  }
  if (found.length === 0 || found.some((item) => item.label !== found[0].label)) return null;
  const label = found[0].label;
  return {
    label,
    spans: found.map((item) => item.span),
    core: new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b\\.?`, "g"),
  };
}

// The graph card prints "80% confidence". "80%" and the word alone are not that badge.
function printedGraphConfidence(normalized) {
  const found = [];
  for (const match of normalized.matchAll(/(?:^|\s)(\d{1,3})% confidence\b/g)) {
    const raw = match[1];
    const percent = Number(raw);
    if (raw === String(percent) && percent >= 0 && percent <= 100) found.push(percent);
  }
  if (found.length === 0 || found.some((percent) => percent !== found[0])) return null;
  return found[0];
}

// Graph details use these names when the activity has no longer sentence.
// The inspector still prints the name as Status when a longer sentence is the title.
// "Promise" in "Promise confirmed" is that name, not a request for every promise.
// "Company" in "Company added" is that name, not a request for every company.
// "A note" is the desktop-note badge, not a request for note nodes.
const GRAPH_NODE_LABELS = [
  "onboarding moved forward",
  "engagement changed",
  "a voice note",
  "promise confirmed",
  "promise evidence",
  "promise updated",
  "meeting updated",
  "meeting missing",
  "meeting booked",
  "message sent",
  "company updated",
  "company record",
  "company added",
  "promise added",
  "person added",
  "detail chosen",
  "action recorded",
  "note removed",
  "crm activity",
  "note saved",
  "a note",
];

function printedGraphNodeLabels(normalized) {
  const labels = [];
  let rest = normalized;
  for (const label of GRAPH_NODE_LABELS) {
    const re = new RegExp(`\\b${label.replaceAll(" ", "[ _]")}\\b\\.?`, "g");
    if (!re.test(rest)) continue;
    labels.push(label);
    rest = rest.replace(new RegExp(`\\b${label.replaceAll(" ", "[ _]")}\\b\\.?`, "g"), " ");
  }
  return { labels, rest };
}

// The activity row rewrites a stored snapshot into the sentence a person reads.
// "Meeting" inside "Meeting with ada@acme.com" is that sentence, not a source.
// "Review" inside "Mail: Q3 review" is the subject, not a promise that needs review.
function graphRowTitle(value) {
  return normalizedGraphValue(value)
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\.$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// "show me" is how someone asks. The rest is the line on the row.
function graphQuestionTitle(raw) {
  let title = graphRowTitle(raw);
  while (GRAPH_ROW_LEADING_STOP.test(title)) {
    const next = title.replace(GRAPH_ROW_LEADING_STOP, "");
    if (!next) break;
    title = next;
  }
  return title;
}

const GRAPH_ROW_LEADING_STOP =
  /^(?:a|an|and|are|for|from|in|is|me|of|on|show|that|the|this|to|what|which|who|with)\s+/;

function graphRowDetail(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\.$/, "").replace(/\s+/g, " ");
}

function graphRowPlaceholder(value) {
  return value === "local-user" || value === "meeting-counterparty";
}

// A speaker id is printed as "They made this promise". A real name has a space
// or an address, which is the sentence the activity row shows.
function graphRowUnnamedWho(who) {
  return (
    !who ||
    who === "a person" ||
    who === "local-user" ||
    who === "meeting-counterparty" ||
    who === "other" ||
    who === "unknown speaker" ||
    /^speaker\s+\d+$/.test(who) ||
    /^[a-z0-9_:-]+$/.test(who)
  );
}

function graphRowNamedWho(value) {
  let who = graphRowDetail(value);
  while (GRAPH_ROW_LEADING_STOP.test(who)) {
    const next = who.replace(GRAPH_ROW_LEADING_STOP, "");
    if (!next || graphRowUnnamedWho(next)) break;
    who = next;
  }
  if (graphRowUnnamedWho(who) || who === "we" || who === "they") return "";
  return who;
}

function printedGraphRowTitles(normalized) {
  const labels = [];
  let rest = normalized;
  const push = (label, span) => {
    const printed = graphRowTitle(label);
    if (!printed || labels.includes(printed)) return;
    labels.push(printed);
    rest = rest.replace(span, " ");
  };
  const take = (re, labelFrom) => {
    const match = re.exec(rest);
    if (!match) return;
    const label = labelFrom(match);
    if (!label) return;
    push(label, match[0]);
  };
  const blank = (value) =>
    !value || value === "local-user" || value === "meeting-counterparty" || value === "a person";

  take(/\byou added a person\b\.?/, () => "you added a person");
  take(/\byou added\s+(.+?)\.?\s*$/, (match) => {
    const name = match[1].trim().replace(/\.$/, "").replace(/\s+/g, " ");
    if (blank(name)) return "";
    return `you added ${name}`;
  });
  take(/\bmeeting with\s+(.+?)\.?\s*$/, (match) => {
    const guest = match[1].trim().replace(/\.$/, "").replace(/\s+/g, " ");
    if (!guest || guest === "local-user" || guest === "meeting-counterparty") return "";
    return `meeting with ${guest}`;
  });
  take(/\bmail:\s*(.+?)\.?\s*$/, (match) => {
    const subject = match[1].trim().replace(/\.$/, "").replace(/\s+/g, " ");
    if (!subject || subject === "local-user" || subject === "meeting-counterparty") return "";
    return `mail: ${subject}`;
  });
  take(/\bcompany from hubspot:\s*(.+?)\.?\s*$/, (match) => {
    const name = match[1].trim().replace(/\.$/, "").replace(/\s+/g, " ");
    if (!name || name === "local-user" || name.startsWith("hubspot company")) return "";
    return `company from hubspot: ${name}`;
  });
  take(/\bcompany from hubspot\b\.?/, () => "company from hubspot");
  take(/\bmessage in slack\b\.?/, () => "message in slack");
  take(/\bmessage in #(\S+)\.?\s*$/, (match) => {
    const channel = match[1].replace(/\.$/, "");
    if (!channel || channel === "local-user" || channel.startsWith("slack")) return "";
    return `message in #${channel}`;
  });
  // Gmail stores "4-message thread with acme.com". The row says
  // "4 messages with acme.com". "Review" and "company" in that sentence
  // name the other party. They are not a promise badge or a company filter.
  take(/\b(\d+ messages? with .+?)\.?\s*$/, (match) => {
    const sentence = graphRowDetail(match[1]);
    const split = /^(\d+) (message|messages) with (.+)$/.exec(sentence);
    if (!split) return "";
    const count = split[1];
    const word = split[2];
    const who = split[3].trim();
    if (/^0\d/.test(count)) return "";
    if ((count === "1") !== (word === "message")) return "";
    if (
      !who ||
      graphRowPlaceholder(who) ||
      who === "local_user" ||
      who === "meeting_counterparty" ||
      who === "an external contact"
    ) {
      return "";
    }
    return `${count} ${word} with ${who}`;
  });
  // "This promise was kept: Send the proposal" is the activity sentence.
  // "Kept" and "open" inside it are not the promise badges.
  take(
    /\b(this promise is still open|this promise is done|this promise was dropped|this promise was kept|this promise was called off|this promise was missed|this promise was waived|this promise was replaced)(?::\s*(.+?))?\.?\s*$/,
    (match) => {
      const text = graphRowDetail(match[2]);
      if (graphRowPlaceholder(text)) return "";
      return text ? `${match[1]}: ${text}` : match[1];
    },
  );
  take(
    /\b(we made this promise|they made this promise)(?::\s*(.+?))?\.?\s*$/,
    (match) => {
      const text = graphRowDetail(match[2]);
      if (graphRowPlaceholder(text)) return "";
      return text ? `${match[1]}: ${text}` : match[1];
    },
  );
  take(/\b(.+?)\s+made this promise(?::\s*(.+?))?\.?\s*$/, (match) => {
    const who = graphRowNamedWho(match[1]);
    if (!who) return "";
    const text = graphRowDetail(match[2]);
    if (graphRowPlaceholder(text)) return "";
    const owner = `${who} made this promise`;
    return text ? `${owner}: ${text}` : owner;
  });
  // Attendance and the transcript line name the meeting. "Person", "company",
  // and "review" in those sentences are not filters.
  take(
    /\b((?:no one|1 person|[1-9]\d* people) from outside the company on .+?)\.?\s*$/,
    (match) => {
      const sentence = graphRowDetail(match[1]);
      const split = /^(no one|1 person|[1-9]\d* people) from outside the company on (.+)$/.exec(
        sentence,
      );
      if (!split) return "";
      const head = split[1];
      const title = split[2].trim();
      if (!title || graphRowPlaceholder(title)) return "";
      if (head.endsWith(" people") && Number(head.split(" ")[0]) < 2) return "";
      return `${head} from outside the company on ${title}`;
    },
  );
  take(
    /\b(.+? · (?:\d+ lines|1 line) in the transcript · (?:\d+ claims|1 claim))\.?\s*$/,
    (match) => {
      const sentence = graphRowDetail(match[1]);
      const split =
        /^(.+?) · (\d+) (line|lines) in the transcript · (\d+) (claim|claims)$/.exec(sentence);
      if (!split) return "";
      const title = split[1].trim();
      const lines = split[2];
      const lineWord = split[3];
      const claims = split[4];
      const claimWord = split[5];
      if (!title || graphRowPlaceholder(title)) return "";
      if (/^0\d/.test(lines) || /^0\d/.test(claims)) return "";
      if ((lines === "1") !== (lineWord === "line")) return "";
      if ((claims === "1") !== (claimWord === "claim")) return "";
      return `${title} · ${lines} ${lineWord} in the transcript · ${claims} ${claimWord}`;
    },
  );
  // A reviewed conversation titles the claim. The title word is that line,
  // not a request for every risk, promise, or lifecycle.
  take(/\brisk raised in a conversation(?::\s*(.+?))?\.?\s*$/, (match) => {
    const text = graphRowDetail(match[1]);
    if (graphRowPlaceholder(text)) return "";
    return text ? `risk raised in a conversation: ${text}` : "risk raised in a conversation";
  });
  for (const title of [
    "unresolved objection",
    "milestone",
    "promise",
    "lifecycle",
    "sentiment",
    "engagement",
    "health",
    "person",
    "decision",
  ]) {
    take(new RegExp(`\\b${title}:\\s*(.+?)\\.?\\s*$`), (match) => {
      const text = graphRowDetail(match[1]);
      if (!text || graphRowPlaceholder(text)) return "";
      return `${title}: ${text}`;
    });
  }
  return { labels, rest };
}

export function parseRelationshipGraphQuery(query) {
  const raw = String(query || "").trim();
  const nodeLabelDetail = printedGraphNodeLabels(raw.toLowerCase().replaceAll("-", "_"));
  const rowTitleDetail = printedGraphRowTitles(nodeLabelDetail.rest);
  const normalized = rowTitleDetail.rest;
  const filters = {
    nodeKinds: [],
    lifecycle: [],
    health: [],
    engagement: [],
    sentiment: [],
    approvalStatus: [],
    sources: [],
    edgeKinds: [],
    overdue: /\boverdue\b|\bpast due\b|\bpast_due\b/.test(normalized),
    atRisk: /\bat risk\b|\bat_risk\b/.test(normalized),
    dueSoon:
      /\bdue soon\b|\bdue_soon\b|\bdue within 72h\b|\bwithin 72h\b|\bdue within 72 hours\b|\bwithin 72 hours\b/.test(
        normalized,
      ),
    direction: /\bthey owe us\b|\bwhat they owe\b|\bthey owe\b/.test(normalized)
      ? "promised_by_them"
      : /\bwe both owe\b|\bshared promises?\b/.test(normalized)
        ? "mutual"
        : /\bwe owe them\b|\bwhat we owe\b|\bwe owe\b/.test(normalized)
          ? "promised_by_me"
          : "",
    // The promise row says Open. An open follow-up is still awaiting approval.
    open: /\bopen\b/.test(normalized) && !/\bnot open\b/.test(normalized),
    // The follow-up inspector says Held. The stored queue status is still open.
    held: /\bheld\b/.test(normalized),
    // A finished draft says Drafted. Sent is a message that went out.
    drafted: /\bdrafted\b/.test(normalized),
    sent: /\bsent\b/.test(normalized) && !/\bnot sent\b/.test(normalized),
    // The follow-up says Sending…, Failed, or Needs reconcile. Those stored
    // execution states are requested, failed, and ambiguous.
    sending: /\bsending\b/.test(normalized),
    executionFailed: /\bfailed\b/.test(normalized),
    needsReconcile: /\bneeds reconcile\b|\bneeds_reconcile\b/.test(normalized),
    // The inspector says Cancelled for a send that was cancelled, and the
    // promise row uses the same word. The stored execution state is cancelled.
    executionCancelled:
      /\bcancelled\b/.test(normalized) && !/\bnot cancelled\b/.test(normalized),
    // The company card says Kept. The stored status is still met.
    kept: /\bkept\b|\bkept_promises?\b/.test(normalized),
    stale: /\bstale\b|\boutdated\b|\bout of date\b/.test(normalized),
    // The row says Up to date or Getting old. The stored freshness is current or aging.
    current:
      /\bup to date\b|\bup_to_date\b/.test(normalized) &&
      !/\bnot up to date\b|\bnot_up_to_date\b/.test(normalized),
    aging: /\bgetting old\b|\bgetting_old\b/.test(normalized),
    // The row is titled "Meeting follow-up". A hyphen must not become a
    // different word, and the word meeting in that title is not a source.
    meetingFollowUp: /\bmeeting follow_ups?\b|\bmeeting follow ups?\b/.test(normalized),
    // "Promise follow-up" is that row. The word promise is not a request for
    // every promise, and a meeting follow-up is a different row.
    promiseFollowUp: /\bpromise follow_ups?\b|\bpromise follow ups?\b/.test(normalized),
    followUp: /\bfollow_ups?\b|\bfollow ups?\b/.test(normalized),
    // "Customer risk" is that follow-up. The word risk is not a request for risk nodes.
    customerRisk: /\bcustomer risks?\b/.test(normalized),
    // These titles contain a source word. The row is the follow-up, not that source.
    calendarHold: /\bcalendar holds?\b/.test(normalized),
    crmUpdate: /\bcrm updates?\b/.test(normalized),
    meetingRecap: /\bmeeting recaps?\b/.test(normalized),
    changed:
      /\bchanged\b|\bsince (?:my )?last review\b|\bchanged since review\b|\bsince you last looked\b|\byou last looked\b/.test(
        normalized,
      ),
    // The source row says Not connected. The word connected in that phrase
    // is not a request to hide unconnected rows.
    notConnected: /\bnot connected\b|\bnot_connected\b/.test(normalized),
    // The source inspector says Syncing while a history sync is running, and
    // Active once that source is live. The stored statuses are backfilling,
    // rebuilding, live, and connected.
    syncing: /\bsyncing\b/.test(normalized),
    sourceActive:
      /\bactive\b/.test(normalized) &&
      !/\bactive[ _]customers?\b/.test(normalized) &&
      !/\bnot active\b/.test(normalized),
    // The follow-up badge says Not checked, Cleared, Review required, or
    // Re-check needed. The stored policy is pending, passed, review_required, or stale.
    notChecked: /\bnot checked\b|\bnot_checked\b/.test(normalized),
    cleared: /\bcleared\b/.test(normalized),
    reviewRequired: /\breview required\b|\breview_required\b/.test(normalized),
    // The promise row says Review while it still needs a person to confirm it.
    // "Review required" stays the policy badge.
    promiseReview:
      (/\breview\b/.test(normalized) || /\bneeds_review\b/.test(normalized)) &&
      !/\breview required\b|\breview_required\b/.test(normalized) &&
      !/\bnot review\b/.test(normalized) &&
      !/\bsince (?:my )?last review\b|\bchanged since review\b/.test(normalized),
    recheck: /\bre_check needed\b|\brecheck needed\b/.test(normalized),
    // "Blocked" is the policy badge and a blocked promise. "Blocks" is a connection.
    blocked: /\bblocked\b/.test(normalized),
    hideIsolated:
      !/\bnot connected\b|\bnot_connected\b/.test(normalized) &&
      /\bconnected\b|\bhide isolated\b|\bunconnected\b|\bhide unconnected\b/.test(normalized),
    freeText: [],
    confidencePercent: null,
    nodeLabels: nodeLabelDetail.labels,
    rowTitles: rowTitleDetail.labels,
  };
  filters.confidencePercent = printedGraphConfidence(normalized);
  const changeDetail = printedGraphChangeDetail(normalized);
  const dueDetail = printedGraphDueDay(normalized);
  filters.changedDimensions = changeDetail ? changeDetail.dimensions : [];
  filters.dueLabel = dueDetail ? dueDetail.label : null;
  // The people list says Unknown person when no name or address was saved.
  // The word unknown in that name is not a health reading.
  filters.unknownPerson = /\bunknown person\b/.test(normalized);
  // The role badge says Former contact. The stored role is former_contact.
  // "former" is also the start of Former customer, so the badge is the whole phrase.
  filters.formerContact = /\bformer contacts?\b/.test(normalized);
  const healthHaystack = normalized.replace(/\bunknown person\b\.?/g, " ");
  const aliasHaystack = changeDetail ? normalized.replaceAll(changeDetail.span, " ") : normalized;

  for (const [alias, kind] of Object.entries(GRAPH_QUERY_NODE_ALIASES)) {
    // "at risk" is the promise badge. "Customer risk" is the follow-up title.
    // Neither phrase is a request for risk nodes.
    if (
      alias === "risk" &&
      (/\bat risk\b|\bat_risk\b/.test(normalized) ||
        /\bcustomer risks?\b/.test(normalized) ||
        /\bhas risks?\b/.test(normalized))
    ) {
      continue;
    }
    if (
      (alias === "milestone" || alias === "milestones") &&
      /\bhas milestones?\b/.test(normalized)
    ) {
      continue;
    }
    if (
      (alias === "promise" ||
        alias === "promises" ||
        alias === "commitment" ||
        alias === "commitments") &&
      (/\bpromise follow_ups?\b|\bpromise follow ups?\b/.test(normalized) ||
        /\bopen promises?\b/.test(normalized) ||
        /\bhas promises?\b/.test(normalized))
    ) {
      continue;
    }
    if (new RegExp(`\\b${alias}\\b`).test(aliasHaystack) && !filters.nodeKinds.includes(kind)) {
      filters.nodeKinds.push(kind);
    }
  }
  for (const lifecycle of GRAPH_QUERY_LIFECYCLES) {
    const aliases = lifecycle === "renewal" ? ["renewal", "renewals", "renewing"] : [lifecycle];
    if (
      aliases.some((alias) =>
        new RegExp(`\\b${alias.replaceAll("_", "[ _]")}s?\\b`).test(normalized),
      ) &&
      !filters.lifecycle.includes(lifecycle)
    ) {
      filters.lifecycle.push(lifecycle);
    }
  }
  if (
    /\bneeds attention\b/.test(normalized) &&
    !filters.health.includes("needs_attention")
  ) {
    filters.health.push("needs_attention");
  }
    // The inspector prints Not known for an unknown health, lifecycle, status,
    // or freshness, and for a company that has no health reading yet.
    filters.notKnown = /\bnot known\b|\bnot_known\b/.test(normalized);
    // A date before the record existed says "Not recorded for this date".
    // The stored token is historical_unknown.
    filters.notRecorded = /\bnot recorded for this date\b|\bnot_recorded_for_this_date\b/.test(
      normalized,
    );
  for (const health of GRAPH_QUERY_HEALTH) {
    if (
      new RegExp(`\\b${health.replaceAll("_", "[ _]")}\\b`).test(healthHaystack) &&
      !filters.health.includes(health)
    ) {
      filters.health.push(health);
    }
  }
  // The inspector says Declining or Negative. Those stored fields are
  // engagement and sentiment. Unknown stays off the inspector, so it is not
  // a second way to ask "not known".
  for (const engagement of GRAPH_QUERY_ENGAGEMENT) {
    if (
      new RegExp(`\\b${engagement}\\b`).test(normalized) &&
      !filters.engagement.includes(engagement)
    ) {
      filters.engagement.push(engagement);
    }
  }
  for (const sentiment of GRAPH_QUERY_SENTIMENT) {
    if (
      new RegExp(`\\b${sentiment}\\b`).test(normalized) &&
      !filters.sentiment.includes(sentiment)
    ) {
      filters.sentiment.push(sentiment);
    }
  }
  // The follow-up row says Awaiting approval. The stored approval is pending.
  if (
    /\bawaiting approvals?\b|\bawaiting_approvals?\b/.test(normalized) &&
    !filters.approvalStatus.includes("pending")
  ) {
    filters.approvalStatus.push("pending");
  }
  for (const status of ["pending", "approved", "rejected"]) {
    if (new RegExp(`\\b${status}\\b`).test(normalized) && !filters.approvalStatus.includes(status)) {
      filters.approvalStatus.push(status);
    }
  }
  const withoutFollowUpTitle = normalized
    .replace(/\bmeeting follow_ups?\b/g, " ")
    .replace(/\bmeeting follow ups?\b/g, " ")
    .replace(/\bfollow_ups?\b/g, " ")
    .replace(/\bfollow ups?\b/g, " ")
    .replace(/\bcalendar holds?\b/g, " ")
    .replace(/\bmeeting recaps?\b/g, " ")
    .replace(/\bcrm updates?\b/g, " ");
  for (const source of GRAPH_QUERY_SOURCES) {
    if (new RegExp(`\\b${source.replaceAll("_", "[ _]")}s?\\b`).test(withoutFollowUpTitle)) {
      filters.sources.push(source);
    }
  }
  if (/\bdepend(?:s|ent)?\b|\brequires?\b/.test(normalized)) {
    filters.edgeKinds.push("requires");
  }
  if (/\bblocks?\b/.test(normalized)) filters.edgeKinds.push("blocks");
  if (/\bcontradict(?:s|ed|ion)?\b/.test(normalized)) filters.edgeKinds.push("contradicts");
  // The connection row says replaces, has promise, has risk, or has milestone.
  // Those stored kinds are supersedes, has_commitment, has_risk, and has_milestone.
  const addEdgeKind = (kind) => {
    if (!filters.edgeKinds.includes(kind)) filters.edgeKinds.push(kind);
  };
  if (/\breplaces\b|\bsupersedes\b/.test(normalized)) addEdgeKind("supersedes");
  if (/\bhas promises?\b/.test(normalized)) addEdgeKind("has_commitment");
  if (/\bhas risks?\b/.test(normalized)) addEdgeKind("has_risk");
  if (/\bhas milestones?\b/.test(normalized)) addEdgeKind("has_milestone");
  if (/\bparticipates in\b/.test(normalized)) addEdgeKind("participant_of");
  if (/\bobserved from\b/.test(normalized)) addEdgeKind("observed_from");
  if (/\brecommended for\b/.test(normalized)) addEdgeKind("recommended_for");
  if (/\bowns\b/.test(normalized) && !/\bwe both owe\b|\bthey owe\b|\bwe owe\b/.test(normalized)) {
    addEdgeKind("owns");
  }
  if (/\bsupports\b/.test(normalized)) addEdgeKind("supports");

  const recognized = new Set([
    ...Object.keys(GRAPH_QUERY_NODE_ALIASES),
    ...GRAPH_QUERY_LIFECYCLES.flatMap((value) => value.split("_")),
    ...GRAPH_QUERY_HEALTH.flatMap((value) => value.split("_")),
    ...GRAPH_QUERY_ENGAGEMENT,
    ...GRAPH_QUERY_SENTIMENT,
    ...GRAPH_QUERY_SOURCES.flatMap((value) => value.split("_")),
    "attention",
    "at",
    "awaiting",
    "approved",
    "blocked",
    "changed",
    "connected",
    "critical",
    "depend",
    "depends",
    "hide",
    "isolated",
    "kept",
    "known",
    "last",
    "outdated",
    "overdue",
    "pending",
    "approval",
    "approvals",
    "rejected",
    "renewal",
    "renewals",
    "renewing",
    "review",
    "stale",
  ]);
  const recognizedToken = (token) => {
    if (GRAPH_QUERY_STOP_WORDS.has(token) || recognized.has(token)) return true;
    // "customers" is the same word as the stage token "customer".
    return token.endsWith("s") && recognized.has(token.slice(0, -1));
  };
  // These phrases are the filter. Leaving "since" or "date" behind turns the
  // question into a text search and hides the company that actually changed.
  const withoutFilterPhrases = (changeDetail
    ? normalized.replaceAll(changeDetail.span, " ")
    : normalized)
    .replace(/\bnot up to date\b/g, " ")
    .replace(/\bnot_up_to_date\b/g, " ")
    .replace(/\bup to date\b/g, " ")
    .replace(/\bup_to_date\b/g, " ")
    .replace(/\bgetting old\b/g, " ")
    .replace(/\bgetting_old\b/g, " ")
    .replace(/\bout of date\b\.?/g, " ")
    .replace(/\bsince you last looked\b/g, " ")
    .replace(/\byou last looked\b/g, " ")
    .replace(/\bsince my last review\b/g, " ")
    .replace(/\bsince last review\b/g, " ")
    .replace(/\bchanged since review\b/g, " ")
    .replace(/\bhide unconnected\b/g, " ")
    .replace(/\bnot connected\b/g, " ")
    .replace(/\bnot_connected\b/g, " ")
    .replace(/\bnot active\b/g, " ")
    .replace(/\bsyncing\b/g, " ")
    .replace(/\bactive\b/g, " ")
    .replace(/\bunconnected\b/g, " ")
    .replace(/\bnot checked\b/g, " ")
    .replace(/\bnot_checked\b/g, " ")
    .replace(/\bcleared\b/g, " ")
    .replace(/\breview required\b/g, " ")
    .replace(/\breview_required\b/g, " ")
    .replace(/\bneeds review\b/g, " ")
    .replace(/\bneeds_review\b/g, " ")
    .replace(/\bnot review\b/g, " ")
    .replace(/\breview\b/g, " ")
    .replace(/\bre_check needed\b/g, " ")
    .replace(/\brecheck needed\b/g, " ")
    .replace(/\bblocked\b/g, " ")
    .replace(/\bhide isolated\b/g, " ")
    .replace(/\bpast due\b/g, " ")
    .replace(/\bpast_due\b/g, " ")
    .replace(/\bat risk\b/g, " ")
    .replace(/\bat_risk\b/g, " ")
    .replace(/\bdue within 72 hours\b/g, " ")
    .replace(/\bwithin 72 hours\b/g, " ")
    .replace(/\bdue within 72h\b/g, " ")
    .replace(/\bwithin 72h\b/g, " ")
    .replace(/\bdue soon\b/g, " ")
    .replace(/\bdue_soon\b/g, " ")
    .replace(/\bwhat they owe us\b/g, " ")
    .replace(/\bthey owe us\b/g, " ")
    .replace(/\bwhat they owe\b/g, " ")
    .replace(/\bthey owe\b/g, " ")
    .replace(/\bwhat we owe them\b/g, " ")
    .replace(/\bwe owe them\b/g, " ")
    .replace(/\bwhat we owe\b/g, " ")
    .replace(/\bwe both owe\b/g, " ")
    .replace(/\bwe owe\b/g, " ")
    .replace(/\bshared promises\b/g, " ")
    .replace(/\bshared promise\b/g, " ")
    .replace(/\bkept_promises\b/g, " ")
    .replace(/\bkept_promise\b/g, " ")
    .replace(/\bkept\b/g, " ")
    .replace(/\bnot known\b\.?/g, " ")
    .replace(/\bnot_known\b\.?/g, " ")
    .replace(/\bnot recorded for this date\b\.?/g, " ")
    .replace(/\bnot_recorded_for_this_date\b\.?/g, " ")
    .replace(/\bawaiting approvals\b/g, " ")
    .replace(/\bawaiting approval\b/g, " ")
    .replace(/\bawaiting_approvals\b/g, " ")
    .replace(/\bawaiting_approval\b/g, " ")
    .replace(/\bmeeting follow_ups?\b/g, " ")
    .replace(/\bmeeting follow ups?\b/g, " ")
    .replace(/\bpromise follow_ups?\b/g, " ")
    .replace(/\bpromise follow ups?\b/g, " ")
    .replace(/\bfollow_ups?\b/g, " ")
    .replace(/\bfollow ups?\b/g, " ")
    .replace(/\bcustomer risks?\b/g, " ")
    .replace(/\bcalendar holds?\b/g, " ")
    .replace(/\bmeeting recaps?\b/g, " ")
    .replace(/\bcrm updates?\b/g, " ")
    .replace(/\bopen promises\b/g, " ")
    .replace(/\bopen promise\b/g, " ")
    .replace(/\bnot open\b/g, " ")
    .replace(/\bopen\b/g, " ")
    .replace(/\bheld\b/g, " ")
    .replace(/\bnot sent\b/g, " ")
    .replace(/\bdrafted\b/g, " ")
    .replace(/\bsent\b/g, " ")
    .replace(/\bneeds reconcile\b/g, " ")
    .replace(/\bneeds_reconcile\b/g, " ")
    .replace(/\bsending\b/g, " ")
    .replace(/\bfailed\b/g, " ")
    .replace(/\bnot cancelled\b/g, " ")
    .replace(/\bcancelled\b/g, " ")
    .replace(/\bhas promises?\b/g, " ")
    .replace(/\bhas risks?\b/g, " ")
    .replace(/\bhas milestones?\b/g, " ")
    .replace(/\bparticipates in\b/g, " ")
    .replace(/\bobserved from\b/g, " ")
    .replace(/\brecommended for\b/g, " ")
    .replace(/\bsupersedes\b/g, " ")
    .replace(/\breplaces\b/g, " ")
    .replace(/\bowns\b/g, " ")
    .replace(/\bsupports\b/g, " ");
  let withoutDue = withoutFilterPhrases;
  if (dueDetail) {
    for (const span of dueDetail.spans) withoutDue = withoutDue.replaceAll(span, " ");
    withoutDue = withoutDue.replace(dueDetail.core, " ");
  }
  const withoutConfidence =
    typeof filters.confidencePercent === "number"
      ? withoutDue.replace(
          new RegExp(`\\b${filters.confidencePercent}% confidence\\b\\.?`, "g"),
          " ",
        )
      : withoutDue;
  filters.freeText = withoutConfidence
    .replace(/\bunknown person\b\.?/g, " ")
    .replace(/\bformer contacts?\b\.?/g, " ")
    .replace(/[^a-z0-9_@.\s-]/g, " ")
    .split(/\s+/)
    .flatMap((token) => {
      if (!token || token === ".") return [];
      // The inspector prints Closed, Snoozed, and Primary contact without a
      // period. A question that ends on that word still means the badge.
      const stem = token.endsWith(".") ? token.slice(0, -1) : token;
      if (!stem || recognizedToken(stem)) return [];
      return [stem];
    });

  const applied = [];
  if (filters.lifecycle.length) applied.push(`lifecycle: ${filters.lifecycle.join(", ")}`);
  if (filters.health.length) applied.push(`health: ${filters.health.join(", ")}`);
  if (filters.engagement.length) applied.push(`engagement: ${filters.engagement.join(", ")}`);
  if (filters.sentiment.length) applied.push(`sentiment: ${filters.sentiment.join(", ")}`);
  if (filters.nodeKinds.length) applied.push(`nodes: ${filters.nodeKinds.join(", ")}`);
  if (filters.approvalStatus.length) {
    applied.push(`approval: ${filters.approvalStatus.join(", ")}`);
  }
  if (filters.sources.length) applied.push(`sources: ${filters.sources.join(", ")}`);
  if (filters.edgeKinds.length) applied.push(`edges: ${filters.edgeKinds.join(", ")}`);
  if (filters.overdue) applied.push("overdue promises");
  if (filters.atRisk) applied.push("at risk");
  if (filters.dueSoon) applied.push("due soon");
  if (filters.direction === "promised_by_them") applied.push("they owe us");
  else if (filters.direction === "mutual") applied.push("we both owe");
  else if (filters.direction === "promised_by_me") applied.push("we owe them");
  if (filters.kept) applied.push("kept");
  if (filters.open) applied.push("open");
  if (filters.held) applied.push("held");
  if (filters.drafted) applied.push("drafted");
  if (filters.sent) applied.push("sent");
  if (filters.sending) applied.push("sending");
  if (filters.executionFailed) applied.push("failed");
  if (filters.needsReconcile) applied.push("needs reconcile");
  if (filters.executionCancelled) applied.push("cancelled");
  if (filters.stale) applied.push("out of date");
  if (filters.current) applied.push("up to date");
  if (filters.aging) applied.push("getting old");
  if (filters.notRecorded) applied.push("not recorded for this date");
  if (filters.notKnown) applied.push("not known");
  if (typeof filters.confidencePercent === "number") {
    applied.push(`${filters.confidencePercent}% confidence`);
  }
  if (filters.dueLabel) applied.push(filters.dueLabel);
  if (filters.unknownPerson) applied.push("unknown person");
  if (filters.formerContact) applied.push("former contact");
  for (const label of filters.nodeLabels) applied.push(label);
  for (const label of filters.rowTitles) applied.push(label);
  if (filters.meetingFollowUp) applied.push("meeting follow-up");
  else if (filters.promiseFollowUp) applied.push("promise follow-up");
  else if (filters.followUp) applied.push("follow-up");
  if (filters.customerRisk) applied.push("customer risk");
  if (filters.calendarHold) applied.push("calendar hold");
  if (filters.crmUpdate) applied.push("crm update");
  if (filters.meetingRecap) applied.push("meeting recap");
  if (filters.changed) {
    const names = filters.changedDimensions
      .map((dimension) => GRAPH_CHANGE_LABELS.find((entry) => entry[1] === dimension)?.[0])
      .filter(Boolean);
    applied.push(
      names.length
        ? `changed since you last looked: ${names.join(", ")}`
        : "changed since you last looked",
    );
  }
  if (filters.notConnected) applied.push("not connected");
  if (filters.syncing) applied.push("syncing");
  if (filters.sourceActive) applied.push("active");
  if (filters.notChecked) applied.push("not checked");
  if (filters.cleared) applied.push("cleared");
  if (filters.reviewRequired) applied.push("review required");
  if (filters.promiseReview) applied.push("review");
  if (filters.recheck) applied.push("re-check needed");
  if (filters.blocked) applied.push("blocked");
  if (filters.hideIsolated) applied.push("hide unconnected");
  if (filters.freeText.length) applied.push(`text: ${filters.freeText.join(" ")}`);

  return { raw, normalized, filters, applied };
}

const graphSetIntersection = (left, right) =>
  new Set([...left].filter((value) => right.has(value)));

/** Apply a natural-language query to an evidence-bearing relationship graph. */
export function queryRelationshipGraph(graph, query, options = {}) {
  const parsed = parseRelationshipGraphQuery(query);
  const { filters } = parsed;
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const asOf = new Date(options.asOf || graph?.asOf || Date.now());
  const allRelationshipIds = new Set(
    nodes.flatMap(graphNodeRelationshipIds).filter((value) => typeof value === "string" && value),
  );
  let relationshipIds = new Set(allRelationshipIds);
  let constrained = false;
  const matched = new Set();

  const constrainBy = (predicate) => {
    const ids = new Set();
    for (const node of nodes) {
      if (!predicate(node)) continue;
      matched.add(node.id);
      for (const relationshipId of graphNodeRelationshipIds(node)) ids.add(relationshipId);
    }
    relationshipIds = constrained ? graphSetIntersection(relationshipIds, ids) : ids;
    constrained = true;
  };

  if (filters.lifecycle.length) {
    constrainBy(
      (node) =>
        node.kind === "relationship" &&
        filters.lifecycle.includes(normalizedGraphValue(node.lifecycle)),
    );
  }
  if (filters.health.length) {
    constrainBy(
      (node) =>
        node.kind === "relationship" && filters.health.includes(normalizedGraphValue(node.health)),
    );
  }
  if (filters.engagement.length) {
    constrainBy((node) => {
      if (node.kind !== "relationship") return false;
      if (filters.engagement.includes(normalizedGraphValue(node.engagement))) return true;
      // The inspector Status cell says Dormant for a dormant account.
      // Engagement uses the same word when the account has gone quiet.
      return (
        filters.engagement.includes("dormant") &&
        normalizedGraphValue(node.status) === "dormant"
      );
    });
  }
  if (filters.sentiment.length) {
    constrainBy(
      (node) =>
        node.kind === "relationship" &&
        filters.sentiment.includes(normalizedGraphValue(node.sentiment)),
    );
  }
  if (filters.overdue) {
    constrainBy((node) => {
      if (node.kind !== "commitment" || !graphPromiseCanBeOverdue(node.status)) return false;
      const dueAt = node.dueAt ? new Date(node.dueAt) : null;
      return Boolean(dueAt && Number.isFinite(dueAt.getTime()) && dueAt < asOf);
    });
  }
  if (filters.atRisk) {
    constrainBy(
      (node) => node.kind === "commitment" && normalizedGraphValue(node.status) === "at_risk",
    );
  }
  if (filters.dueSoon) {
    constrainBy((node) => {
      if (node.kind !== "commitment" || normalizedGraphValue(node.status) !== "at_risk") return false;
      const dueAt = node.dueAt ? new Date(node.dueAt) : null;
      return Boolean(dueAt && Number.isFinite(dueAt.getTime()) && dueAt >= asOf);
    });
  }
  if (filters.direction) {
    constrainBy((node) => {
      if (node.kind !== "commitment") return false;
      return normalizedGraphValue(node.metadata?.direction) === filters.direction;
    });
  }
  if (filters.kept) {
    constrainBy((node) => {
      if (node.kind !== "commitment") return false;
      const status = normalizedGraphValue(node.status);
      return status === "met" || status === "fulfilled";
    });
  }
  if (filters.open) {
    constrainBy(
      (node) => node.kind === "commitment" && normalizedGraphValue(node.status) === "open",
    );
  }
  if (filters.promiseReview) {
    constrainBy(
      (node) => node.kind === "commitment" && normalizedGraphValue(node.status) === "review",
    );
  }
  if (filters.held) {
    constrainBy(
      (node) => node.kind === "action" && normalizedGraphValue(node.status) === "open",
    );
  }
  if (filters.drafted) {
    constrainBy(
      (node) =>
        node.kind === "action" &&
        normalizedGraphValue(node.executionStatus) === "sent" &&
        normalizedGraphValue(node.metadata?.executionMode) === "draft",
    );
  }
  if (filters.sent) {
    constrainBy(
      (node) =>
        node.kind === "action" &&
        normalizedGraphValue(node.executionStatus) === "sent" &&
        normalizedGraphValue(node.metadata?.executionMode) !== "draft",
    );
  }
  if (filters.sending) {
    constrainBy(
      (node) => node.kind === "action" && normalizedGraphValue(node.executionStatus) === "requested",
    );
  }
  if (filters.executionFailed) {
    constrainBy((node) => {
      if (node.kind === "action" && normalizedGraphValue(node.executionStatus) === "failed") {
        return true;
      }
      return node.kind === "source" && normalizedGraphValue(node.status) === "failed";
    });
  }
  if (filters.needsReconcile) {
    constrainBy(
      (node) => node.kind === "action" && normalizedGraphValue(node.executionStatus) === "ambiguous",
    );
  }
  if (filters.executionCancelled) {
    constrainBy((node) => {
      if (node.kind === "action" && normalizedGraphValue(node.executionStatus) === "cancelled") {
        return true;
      }
      return node.kind === "commitment" && normalizedGraphValue(node.status) === "cancelled";
    });
  }
  if (filters.approvalStatus.length) {
    constrainBy(
      (node) =>
        node.kind === "action" &&
        filters.approvalStatus.includes(normalizedGraphValue(node.approvalStatus)),
    );
  }
  if (filters.sources.length) {
    constrainBy((node) => {
      if (filters.sources.includes(normalizedGraphValue(node.source))) return true;
      if (!filters.sources.includes("meeting")) return false;
      return (
        GRAPH_MEETING_BADGES.has(graphRowTitle(node.status)) ||
        GRAPH_MEETING_BADGES.has(graphRowTitle(node.label))
      );
    });
  }
  // The source inspector says Out of date when the connection missed its
  // cadence. That stored status is stale. Freshness can still be current
  // when the last activity is inside 72 hours.
  if (filters.stale) {
    constrainBy((node) => {
      if (normalizedGraphValue(node.freshness) === "stale") return true;
      return node.kind === "source" && normalizedGraphValue(node.status) === "stale";
    });
  }
  if (filters.current) {
    constrainBy((node) => normalizedGraphValue(node.freshness) === "current");
  }
  if (filters.aging) {
    constrainBy((node) => normalizedGraphValue(node.freshness) === "aging");
  }
  if (filters.notRecorded) {
    constrainBy((node) =>
      [
        "status",
        "health",
        "lifecycle",
        "engagement",
        "sentiment",
        "approvalStatus",
        "policyStatus",
        "executionStatus",
        "freshness",
      ].some((field) => normalizedGraphValue(node[field]) === "historical_unknown"),
    );
  }
  if (filters.notKnown) {
    constrainBy(graphNodePrintsNotKnown);
  }
  if (typeof filters.confidencePercent === "number") {
    const percent = filters.confidencePercent;
    constrainBy((node) => {
      const confidence = node.confidence;
      if (typeof confidence !== "number" || !Number.isFinite(confidence)) return false;
      return Math.round(confidence * 100) === percent;
    });
  }
  if (filters.dueLabel) {
    const label = filters.dueLabel;
    constrainBy((node) => graphDueLabel(node.dueAt) === label);
  }
  if (filters.unknownPerson) {
    constrainBy(
      (node) => node.kind === "person" && normalizedGraphValue(node.label) === "unknown person",
    );
  }
  if (filters.formerContact) {
    constrainBy((node) => {
      if (node.kind !== "person") return false;
      const role = normalizedGraphValue(node.role).replaceAll("_", " ").replaceAll("-", " ");
      return role === "former contact";
    });
  }
  for (const label of filters.nodeLabels) {
    constrainBy(
      (node) =>
        normalizedGraphValue(node.label) === label || normalizedGraphValue(node.status) === label,
    );
  }
  for (const label of filters.rowTitles) {
    // A confirmed promise keeps the event name on the card and puts the
    // sentence in the detail. Attendance and transcript sentences are the card.
    constrainBy(
      (node) =>
        graphRowTitle(node.label) === label ||
        graphRowTitle(node.status) === label ||
        graphRowTitle(node.summary) === label,
    );
  }
  if (filters.notConnected) {
    constrainBy(
      (node) => node.kind === "source" && normalizedGraphValue(node.status) === "not_connected",
    );
  }
  if (filters.syncing) {
    constrainBy((node) => {
      if (node.kind !== "source") return false;
      const status = normalizedGraphValue(node.status);
      return status === "backfilling" || status === "rebuilding";
    });
  }
  if (filters.sourceActive) {
    constrainBy((node) => {
      if (node.kind !== "source") return false;
      const status = normalizedGraphValue(node.status);
      return status === "live" || status === "connected";
    });
  }
  if (filters.notChecked) {
    constrainBy(
      (node) => node.kind === "action" && normalizedGraphValue(node.policyStatus) === "pending",
    );
  }
  if (filters.cleared) {
    constrainBy(
      (node) => node.kind === "action" && normalizedGraphValue(node.policyStatus) === "passed",
    );
  }
  if (filters.reviewRequired) {
    constrainBy(
      (node) =>
        node.kind === "action" && normalizedGraphValue(node.policyStatus) === "review_required",
    );
  }
  if (filters.recheck) {
    constrainBy(
      (node) => node.kind === "action" && normalizedGraphValue(node.policyStatus) === "stale",
    );
  }
  if (filters.blocked) {
    constrainBy((node) => {
      if (node.kind === "action" && normalizedGraphValue(node.policyStatus) === "blocked") {
        return true;
      }
      return node.kind === "commitment" && normalizedGraphValue(node.status) === "blocked";
    });
  }
  if (filters.meetingFollowUp) {
    constrainBy((node) => {
      if (node.kind !== "action") return false;
      const label = normalizedGraphValue(node.label).replaceAll("-", "_");
      return /\bmeeting\b/.test(label) && /\bfollow_ups?\b/.test(label);
    });
  } else if (filters.promiseFollowUp) {
    constrainBy((node) => {
      if (node.kind !== "action") return false;
      const label = normalizedGraphValue(node.label).replaceAll("-", "_");
      return /\bpromise\b/.test(label) && /\bfollow_ups?\b/.test(label);
    });
  } else if (filters.followUp) {
    constrainBy((node) => {
      if (node.kind !== "action") return false;
      const label = normalizedGraphValue(node.label).replaceAll("-", "_");
      return /\bfollow_ups?\b/.test(label);
    });
  }
  if (filters.customerRisk) {
    constrainBy((node) => {
      if (node.kind !== "action") return false;
      return /\bcustomer risks?\b/.test(normalizedGraphValue(node.label));
    });
  }
  if (filters.calendarHold) {
    constrainBy((node) => {
      if (node.kind !== "action") return false;
      return /\bcalendar holds?\b/.test(normalizedGraphValue(node.label));
    });
  }
  if (filters.crmUpdate) {
    constrainBy((node) => {
      if (node.kind !== "action") return false;
      return /\bcrm updates?\b/.test(normalizedGraphValue(node.label));
    });
  }
  if (filters.meetingRecap) {
    constrainBy((node) => {
      if (node.kind !== "action") return false;
      return /\bmeeting recaps?\b/.test(normalizedGraphValue(node.label));
    });
  }
  if (filters.changed) {
    const dimensions = filters.changedDimensions;
    constrainBy((node) => {
      if (node.kind !== "relationship" || !node.changedSinceReview) return false;
      if (!dimensions.length) return true;
      const present = Array.isArray(node.changedDimensions) ? node.changedDimensions : [];
      return dimensions.every((dimension) => present.includes(dimension));
    });
  }
  if (filters.freeText.length) {
    constrainBy((node) => {
      const haystack = [node.label, node.summary, node.status, node.role, node.source]
        .map(graphSearchText)
        .join(" ");
      return filters.freeText.every((token) => haystack.includes(token));
    });
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  if (filters.edgeKinds.length) {
    const ids = new Set();
    for (const edge of edges) {
      if (!filters.edgeKinds.includes(edge.kind)) continue;
      matched.add(edge.source);
      matched.add(edge.target);
      for (const endpoint of [nodesById.get(edge.source), nodesById.get(edge.target)]) {
        if (!endpoint) continue;
        for (const relationshipId of graphNodeRelationshipIds(endpoint)) ids.add(relationshipId);
      }
    }
    relationshipIds = constrained ? graphSetIntersection(relationshipIds, ids) : ids;
    constrained = true;
  }

  if (filters.nodeKinds.length) {
    constrainBy((node) => filters.nodeKinds.includes(node.kind));
  }

  // Each individual constraint can find useful nodes while their relationship sets have no
  // overlap. Only keep nodes that belong to the final intersection; otherwise a zero-result
  // answer can still render unrelated accounts and evidence in the client.
  const dropUnrelatedMatches = () => {
    if (!constrained) return;
    for (const nodeId of [...matched]) {
      const node = nodesById.get(nodeId);
      if (
        !node ||
        !graphNodeRelationshipIds(node).some((relationshipId) =>
          relationshipIds.has(relationshipId),
        )
      ) {
        matched.delete(nodeId);
      }
    }
  };
  dropUnrelatedMatches();

  // A risk line is "Security review has no owner." "Review" in that line is
  // not a promise waiting for confirmation, and "renewal" in "renewal slip"
  // is not the lifecycle. When the question is the line itself and the badge
  // reading hid it, keep the line.
  const questionTitle = graphQuestionTitle(parsed.raw);
  const printsQuestion = (node) =>
    questionTitle.includes(" ") &&
    (graphRowTitle(node.label) === questionTitle || graphRowTitle(node.summary) === questionTitle);
  const printed = nodes.filter(printsQuestion);
  const printedSurvived = printed.some((node) =>
    graphNodeRelationshipIds(node).some((id) => relationshipIds.has(id)),
  );
  if (printed.length > 0 && constrained && !printedSurvived) {
    relationshipIds = new Set(allRelationshipIds);
    matched.clear();
    constrained = false;
    constrainBy(printsQuestion);
    dropUnrelatedMatches();
    parsed.applied = [questionTitle];
  }

  const relationshipNodeIds = new Set(
    nodes
      .filter(
        (node) =>
          node.kind === "relationship" &&
          graphNodeRelationshipIds(node).some((id) => relationshipIds.has(id)),
      )
      .map((node) => node.id),
  );
  for (const id of relationshipNodeIds) matched.add(id);

  const qualifyingKinds = new Set(filters.nodeKinds);
  for (const node of nodes) {
    const nodeRelationshipIds = graphNodeRelationshipIds(node);
    if (!nodeRelationshipIds.some((id) => relationshipIds.has(id))) continue;
    if (!qualifyingKinds.size || qualifyingKinds.has(node.kind) || node.kind === "relationship") {
      matched.add(node.id);
    }
  }

  const edgeKindCandidates = new Set(
    edges
      .filter((edge) => !filters.edgeKinds.length || filters.edgeKinds.includes(edge.kind))
      .map((edge) => edge.id),
  );
  const visible = new Set(matched);
  for (const edge of edges) {
    if (filters.edgeKinds.length && !edgeKindCandidates.has(edge.id)) continue;
    if (matched.has(edge.source) || matched.has(edge.target)) {
      visible.add(edge.source);
      visible.add(edge.target);
    }
  }
  if (filters.hideIsolated) {
    const connected = new Set();
    for (const edge of edges) {
      if (!edgeKindCandidates.has(edge.id)) continue;
      if (visible.has(edge.source) && visible.has(edge.target)) {
        connected.add(edge.source);
        connected.add(edge.target);
      }
    }
    for (const nodeId of [...visible]) {
      if (!connected.has(nodeId)) visible.delete(nodeId);
    }
    for (const nodeId of [...matched]) {
      if (!visible.has(nodeId)) matched.delete(nodeId);
    }
    const remaining = new Set();
    for (const node of nodes) {
      if (node.kind !== "relationship" || !visible.has(node.id)) continue;
      for (const relationshipId of graphNodeRelationshipIds(node)) remaining.add(relationshipId);
    }
    relationshipIds = constrained ? graphSetIntersection(relationshipIds, remaining) : remaining;
    constrained = true;
  }
  const matchedEdgeIds = new Set(
    edges
      .filter(
        (edge) =>
          edgeKindCandidates.has(edge.id) && (matched.has(edge.source) || matched.has(edge.target)),
      )
      .map((edge) => edge.id),
  );
  const evidenceRefs = [
    ...new Set([
      ...nodes
        .filter((node) => matched.has(node.id))
        .flatMap((node) => (Array.isArray(node.evidenceRefs) ? node.evidenceRefs : [])),
      ...edges
        .filter(
          (edge) =>
            matchedEdgeIds.has(edge.id) && (matched.has(edge.source) || matched.has(edge.target)),
        )
        .flatMap((edge) => (Array.isArray(edge.evidenceRefs) ? edge.evidenceRefs : [])),
    ]),
  ];
  const relationshipCount = relationshipIds.size;
  const answer = constrained
    ? `${relationshipCount} relationship${relationshipCount === 1 ? "" : "s"} match${relationshipCount === 1 ? "es" : ""} ${parsed.applied.join(" · ") || "the query"}.`
    : parsed.raw
      ? `${matched.size} graph item${matched.size === 1 ? "" : "s"} match the query.`
      : "Showing the complete graph.";

  return {
    parsed,
    answer,
    relationshipIds: [...relationshipIds],
    matchedNodeIds: [...matched],
    visibleNodeIds: [...visible],
    matchedEdgeIds: [...matchedEdgeIds],
    evidenceRefs,
  };
}

/** Return a deterministic, induced neighborhood around one graph node. */
export function relationshipGraphNeighborhood(graph, rootNodeId, depth = 1) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const normalizedRootNodeId = String(rootNodeId || "");
  const normalizedDepth = Math.max(1, Math.min(3, Math.trunc(Number(depth) || 1)));
  if (!nodes.some((node) => node.id === normalizedRootNodeId)) {
    return {
      rootNodeId: normalizedRootNodeId,
      depth: normalizedDepth,
      nodeIds: [],
      edgeIds: [],
      boundaryNodeIds: [],
    };
  }

  const distances = new Map([[normalizedRootNodeId, 0]]);
  let frontier = new Set([normalizedRootNodeId]);
  for (let hop = 1; hop <= normalizedDepth && frontier.size; hop += 1) {
    const next = new Set();
    for (const edge of edges) {
      if (frontier.has(edge.source) && !distances.has(edge.target)) next.add(edge.target);
      if (frontier.has(edge.target) && !distances.has(edge.source)) next.add(edge.source);
    }
    for (const nodeId of next) distances.set(nodeId, hop);
    frontier = next;
  }

  const nodeIds = nodes.map((node) => node.id).filter((id) => distances.has(id));
  const nodeIdSet = new Set(nodeIds);
  return {
    rootNodeId: normalizedRootNodeId,
    depth: normalizedDepth,
    nodeIds,
    edgeIds: edges
      .filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target))
      .map((edge) => edge.id),
    boundaryNodeIds: nodeIds.filter((id) => distances.get(id) === normalizedDepth),
  };
}

export function createRelationshipGraphSavedView(input) {
  const createdAt = input.createdAt || new Date().toISOString();
  const label = String(input.label || "Saved graph view").trim() || "Saved graph view";
  return {
    id:
      input.id ||
      stableFingerprint(`${label}:${createdAt}:${JSON.stringify(input.state || {})}`, "graph-view"),
    label,
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    state: {
      scope: input.state?.scope === "relationship" ? "relationship" : "portfolio",
      relationshipId: input.state?.relationshipId || undefined,
      query: String(input.state?.query || ""),
      layout: ["force", "radial", "timeline"].includes(input.state?.layout)
        ? input.state.layout
        : "force",
      density: Math.max(0.25, Math.min(1, Number(input.state?.density) || 1)),
      hideIsolated: Boolean(input.state?.hideIsolated),
      selectedNodeId: input.state?.selectedNodeId || undefined,
      focusDepth: Math.max(0, Math.min(2, Math.trunc(Number(input.state?.focusDepth) || 0))),
      asOf: input.state?.asOf || undefined,
      changedSinceReview: Boolean(input.state?.changedSinceReview),
    },
  };
}

export const RELATIONSHIP_DIMENSION_LABELS = {
  lifecycle: "Lifecycle",
  engagement: "Engagement",
  sentiment: "Sentiment",
  health: "Health",
  summary: "Summary",
  next_action: "Next action",
  risk: "Risk",
  milestone: "Milestone",
};

export const COMPLETENESS_LABELS = {
  complete: "Evidence current",
  partial: "Partial evidence",
  stale: "Evidence stale",
  rebuilding: "Sources rebuilding",
  ambiguous: "Identity review required",
  disconnected: "Source disconnected",
};

export const AUTHORITY_LABELS = {
  user_correction: "Confirmed by a person",
  source_fact: "Source fact",
  deterministic: "Deterministic rule",
  ai_inference: "AI inference",
};

export function relationshipLabel(value) {
  return (value || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function completenessTone(status) {
  if (status === "complete") return "safe";
  if (status === "partial" || status === "rebuilding") return "caution";
  return "blocked";
}

function stableFingerprint(value, prefix = "import") {
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ code, 0x85ebca6b);
  }
  return `${prefix}-${(left >>> 0).toString(16).padStart(8, "0")}${(right >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

function transcriptSegments(transcript) {
  let cursor = 0;
  return transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const colonIndex = line.indexOf(":");
      const separator = line[colonIndex + 1];
      const attributed =
        colonIndex > 0 &&
        colonIndex <= 80 &&
        (separator === " " || separator === "\t") &&
        line.slice(colonIndex + 1).trim().length > 0;
      const speakerLabel = attributed ? line.slice(0, colonIndex).trim() : "Unknown speaker";
      const text = attributed ? line.slice(colonIndex + 1).trim() : line;
      const duration = Math.max(1_000, Math.min(30_000, text.length * 55));
      const segment = {
        id: `segment-${index + 1}`,
        speakerId: `imported-speaker-${stableFingerprint(speakerLabel.toLowerCase())}`,
        speakerLabel,
        speakerConfidence: attributed ? 0.9 : 0.5,
        startMs: cursor,
        endMs: cursor + duration,
        text,
      };
      cursor += duration;
      return segment;
    });
}

/** Build reviewable, append-only evidence from a user-supplied transcript. */
export function buildImportedTranscriptObservation({
  relationshipId,
  title,
  transcript,
  occurredAt,
  sourceRecordId,
  participantDisclosure = "confirmed_by_importer",
}) {
  const normalizedTranscript = String(transcript || "").trim();
  if (!relationshipId || !normalizedTranscript) {
    throw new Error("relationshipId and transcript are required");
  }
  const timestamp = new Date(occurredAt || Date.now()).toISOString();
  const normalizedTitle = String(title || "Imported conversation").trim();
  const segments = transcriptSegments(normalizedTranscript);
  const fingerprint = stableFingerprint(
    JSON.stringify({ relationshipId, normalizedTitle, normalizedTranscript, timestamp }),
  );
  const recordId = String(sourceRecordId || `${timestamp}:${fingerprint}`);
  const envelope = {
    schemaVersion: 1,
    provider: "upload",
    sourceRecordId: recordId,
    fingerprint,
    title: normalizedTitle,
    occurredAt: timestamp,
    participants: [],
    segments,
    captureCaveats: [
      "Transcript text was imported by a user; Oppulence did not verify the original audio.",
    ],
    governance: {
      receiptId: `governance:${fingerprint}`,
      capturedAt: timestamp,
      capturePolicy: "manual_transcript_import",
      routing: "reviewed_import_to_oppulence",
      region: "client",
      retention: "workspace_policy",
      participantDisclosure,
      legalHold: false,
      deletionOutcome: "managed_by_workspace_policy",
      evidenceClip: "not_retained",
    },
  };
  return {
    relationshipId,
    source: "meeting",
    sourceAccountId: "upload",
    externalId: `upload:${recordId}`,
    sourceVersion: fingerprint,
    eventType: "conversation_evidence_compiled",
    occurredAt: timestamp,
    summary: `${normalizedTitle} · ${segments.length} imported segment${segments.length === 1 ? "" : "s"}`,
    normalizedFacts: {
      provider: "upload",
      dedupe_fingerprint: fingerprint,
      canonical_transcript: {
        schema_version: 1,
        source_record_id: recordId,
        segment_count: segments.length,
      },
      conversation_claims: [],
      action_pack: [],
      governance_receipt: envelope.governance,
    },
    payload: { envelope },
    assertions: [],
  };
}
