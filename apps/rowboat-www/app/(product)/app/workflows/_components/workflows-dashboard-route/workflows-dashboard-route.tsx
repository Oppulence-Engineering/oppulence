"use client";

import "client-only";

import dynamic from "next/dynamic";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@oppulence/ui/lib/utils";
import { useDashboardChatController } from "@/components/features/dashboard/chat-route-provider/chat-route-provider";
import { useProductRouteState } from "@/hooks/dashboard/use-product-route-state";
import type { WorkflowFocus } from "@/lib/dashboard/product-navigation";

const CloudWorkflowsView = dynamic(() =>
  import("@/components/features/workflows/cloud-workflows-view/cloud-workflows-view").then(
    (module) => module.CloudWorkflowsView,
  ),
);

export type WorkflowsDashboardRouteProps = ComponentPropsWithoutRef<"section"> & {
  focus: WorkflowFocus;
};

export function WorkflowsDashboardRoute({
  className,
  focus: _serverFocus,
  ...props
}: WorkflowsDashboardRouteProps) {
  const { selectedResource: resource } = useDashboardChatController();
  const { workflowFocus } = useProductRouteState();
  // nuqs writes `?focus=runs` with history.replace. Cache Components does not
  // refetch this route on that update, so the server `focus` prop stays on the
  // first paint and the library stays open while the header says Runs. The
  // hook is the live focus; it matches the prop on the initial document load.
  const focus: WorkflowFocus = workflowFocus;
  const isTaskResource = resource?.kind === "task" || resource?.kind === "taskrun";
  return (
    <section
      className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}
      data-slot="workflows-dashboard-route"
      {...props}
    >
      <CloudWorkflowsView
        key={isTaskResource ? `${focus}:${resource.name}` : focus}
        focus={focus}
        initialRunId={
          resource?.kind === "taskrun" ? resource.name.split("/").slice(1).join("/") : undefined
        }
        initialSlug={
          resource?.kind === "task"
            ? resource.name
            : resource?.kind === "taskrun"
              ? resource.name.split("/")[0]
              : undefined
        }
      />
    </section>
  );
}
