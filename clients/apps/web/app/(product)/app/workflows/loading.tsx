import { DashboardRouteFallback } from "@/components/providers/prefetch-hydration";

export default function WorkflowsLoading() {
  return <DashboardRouteFallback label="Loading workflows…" />;
}
