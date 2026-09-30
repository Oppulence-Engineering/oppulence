const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  intelligence: "Intelligence",
};

/**
 * Plan ids are stored slugs. A permission row would otherwise say
 * "intelligence plan" next to the permission name.
 */
export function planLabel(plan?: string | null): string {
  const trimmed = plan?.trim() ?? "";
  if (!trimmed) return "";
  const known = PLAN_LABELS[trimmed.toLowerCase()];
  if (known) return known;
  return trimmed
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
