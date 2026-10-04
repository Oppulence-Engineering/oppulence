import { DashboardRouteFallback } from "@/lib/query/prefetch-hydration";

/**
 * Companies, people, notes, and tasks all suspend on this route. "Revenue" is
 * the old route name, so the fallback names the workspace instead of a tab
 * the person did not open.
 */
export default function RevenueLoading() {
  return <DashboardRouteFallback label="Loading workspace…" />;
}
