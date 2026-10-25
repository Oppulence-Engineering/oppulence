import { DashboardRouteFallback } from "@/components/providers/prefetch-hydration";

export default function AgentsLoading() {
  return <DashboardRouteFallback label="Loading agents…" />;
}
