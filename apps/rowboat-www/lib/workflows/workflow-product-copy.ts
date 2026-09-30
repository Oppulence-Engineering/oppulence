/**
 * First-party tasks are provisioned with the name stored by the API. Rewrite
 * only these system slugs when that stored name is internal job language.
 * A workflow someone named themselves is left exactly as stored.
 */
const COMPANY_REFRESH = {
  name: "Company refresh",
  description:
    "Summarize each company's latest state, evidence freshness, commitments, and material changes.",
};

const ATTENTION_MONITOR = {
  description: "Explain which companies need attention now and why.",
};

const MEETING_FOLLOW_UP = {
  name: "Meeting follow-up",
};

const SOURCE_HEALTH = {
  name: "Source health",
};

const FIRST_PARTY_WORKFLOW_COPY: Record<string, { name?: string; description?: string }> = {
  "oppulence-relationship-refresh": COMPANY_REFRESH,
  "relationship-refresh": COMPANY_REFRESH,
  "oppulence-attention-monitor": ATTENTION_MONITOR,
  "attention-monitor": ATTENTION_MONITOR,
  "oppulence-post-meeting-processor": MEETING_FOLLOW_UP,
  "post-meeting-processor": MEETING_FOLLOW_UP,
  "oppulence-connector-health-repair": SOURCE_HEALTH,
  "connector-health-repair": SOURCE_HEALTH,
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
