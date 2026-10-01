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
  return titleCase((value || "unknown").replaceAll("_", " "));
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

export function missingScopeLabels(scopes: readonly string[]): string {
  const labels = [...new Set(scopes.map((scope) => scopeLabel(scope)).filter(Boolean))];
  return labels.join(", ");
}
