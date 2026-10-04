/**
 * First-party tasks are provisioned with the name stored by the API. Rewrite
 * only these system slugs when that stored name is internal job language.
 * A workflow someone named themselves is left exactly as stored.
 */
const COMPANY_REFRESH = {
  name: "Company refresh",
  description: "Summarize what is new for each company, including open promises.",
};

const ATTENTION_MONITOR = {
  name: "Attention monitor",
  description: "Explain which companies need attention now and why.",
};

const MEETING_FOLLOW_UP = {
  name: "Meeting follow-up",
  description:
    "Turn a finished meeting into promises, risks, and a follow-up that waits for your approval.",
};

const MEETING_PRE_BRIEF = {
  name: "Meeting pre-brief",
  description: "Get the promises, risks, and goals ready before a meeting.",
};

const RECOMMENDATION_REVIEW = {
  name: "Recommendation review",
  description: "Collect recommendations that are waiting so you can approve them together.",
};

const SOURCE_HEALTH = {
  name: "Source health",
  description:
    "Watch whether each connected source is current, and repair the ones that stop updating.",
};

// Starter templates are not first-party jobs, but their stored descriptions
// still read like an internal spec. The create dialog shows this copy.
const EVENT_TRIAGE = {
  description:
    "Turn events from GitHub, Linear, or Stripe into a short list of what needs a response.",
};

const DATA_REPORT = {
  description: "Turn a question about your data into a written report.",
};

const FIRST_PARTY_WORKFLOW_COPY: Record<string, { name?: string; description?: string }> = {
  "oppulence-relationship-refresh": COMPANY_REFRESH,
  "relationship-refresh": COMPANY_REFRESH,
  "oppulence-attention-monitor": ATTENTION_MONITOR,
  "attention-monitor": ATTENTION_MONITOR,
  "oppulence-post-meeting-processor": MEETING_FOLLOW_UP,
  "post-meeting-processor": MEETING_FOLLOW_UP,
  "oppulence-meeting-pre-brief": MEETING_PRE_BRIEF,
  "meeting-pre-brief": MEETING_PRE_BRIEF,
  "oppulence-recommendation-review": RECOMMENDATION_REVIEW,
  "recommendation-review": RECOMMENDATION_REVIEW,
  "oppulence-connector-health-repair": SOURCE_HEALTH,
  "connector-health-repair": SOURCE_HEALTH,
  "event-triage": EVENT_TRIAGE,
  "data-report": DATA_REPORT,
};

export function workflowProductName(slug: string | undefined, stored: string | undefined): string {
  const fallback = stored?.trim() || "";
  if (!slug) return fallback;
  return FIRST_PARTY_WORKFLOW_COPY[slug]?.name || fallback;
}

export function workflowProductDescription(
  slug: string | undefined,
  stored: string | undefined,
): string {
  const fallback = stored?.trim() || "";
  if (!slug) return fallback;
  return FIRST_PARTY_WORKFLOW_COPY[slug]?.description || fallback;
}
