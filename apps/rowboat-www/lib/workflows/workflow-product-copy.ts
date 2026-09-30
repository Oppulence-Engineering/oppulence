/**
 * First-party tasks are provisioned with the name and description stored by
 * the API. Those rows still say "relationship" after the product started
 * saying "company". Rewrite only these system slugs. A workflow someone
 * named themselves is left exactly as stored.
 */
const COMPANY_REFRESH = {
  name: "Company refresh",
  description:
    "Summarize each company's latest state, evidence freshness, commitments, and material changes.",
};

const ATTENTION_MONITOR = {
  description: "Explain which companies need attention now and why.",
};

const FIRST_PARTY_WORKFLOW_COPY: Record<string, { name?: string; description?: string }> = {
  "oppulence-relationship-refresh": COMPANY_REFRESH,
  "relationship-refresh": COMPANY_REFRESH,
  "oppulence-attention-monitor": ATTENTION_MONITOR,
  "attention-monitor": ATTENTION_MONITOR,
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
