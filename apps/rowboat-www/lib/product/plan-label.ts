const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  intelligence: "Intelligence",
};

const BILLING_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Past due",
  canceled: "Canceled",
};

function titledSlug(value: string): string {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Plan ids are stored slugs. A permission row would otherwise say
 * "intelligence plan" next to the permission name.
 */
export function planLabel(plan?: string | null): string {
  const trimmed = plan?.trim() ?? "";
  if (!trimmed) return "";
  const known = PLAN_LABELS[trimmed.toLowerCase()];
  if (known) return known;
  return titledSlug(trimmed);
}

/** Subscription status is a slug. "past_due" would otherwise keep the underscore. */
export function billingStatusLabel(status?: string | null): string {
  const trimmed = status?.trim() ?? "";
  if (!trimmed) return "";
  const known = BILLING_STATUS_LABELS[trimmed.toLowerCase()];
  if (known) return known;
  return titledSlug(trimmed);
}
