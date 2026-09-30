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
