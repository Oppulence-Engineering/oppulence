/**
 * The connector catalog stores internal capability sentences. The connections
 * page shows what a person can do with the product. Unknown connectors keep
 * the stored sentence so a new integration is not blank.
 */
const KNOWN_CONNECTOR_DESCRIPTIONS: Record<string, string> = {
  canvas: "Banking, invoices, collections, and payments.",
  corinthian: "Money owed, collections, and customer messages.",
  cadence: "Billing, payments, and approvals before money moves.",
  conduit: "How data moves between the tools you connect.",
  eigen: "Search what you know, and run an action only after you approve it.",
  hubspot: "Contacts, deals, companies, tickets, and notes.",
  linear: "Issues, projects, and comments.",
  notion: "Pages and databases.",
};

export function connectorProductDescription(name: string, stored: string): string {
  const known = KNOWN_CONNECTOR_DESCRIPTIONS[name.trim().toLowerCase()];
  if (known) return known;
  return stored.trim();
}

/**
 * Scope titles come from the catalog. A few still name an internal product
 * or a policy gate. Unknown scopes keep the stored title.
 */
const KNOWN_SCOPE_COPY: Record<string, { label: string; detail: string }> = {
  "eigen:knowledge.read": {
    label: "Search what you know",
    detail: "Search what this workspace already knows.",
  },
  "eigen:actions.execute": {
    label: "Run an approved action",
    detail: "Run an action after you approve it.",
  },
};

export function scopeProductLabel(name: string, stored: string): string {
  return KNOWN_SCOPE_COPY[name]?.label ?? stored.trim();
}

export function scopeProductDetail(name: string, stored: string): string {
  return KNOWN_SCOPE_COPY[name]?.detail ?? stored.trim();
}
