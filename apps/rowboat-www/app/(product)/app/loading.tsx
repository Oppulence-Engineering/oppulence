import { DashboardRouteFallback } from "@/components/providers/prefetch-hydration";

export default function ProductLoading() {
  return <DashboardRouteFallback label="Loading workspace…" />;
}
