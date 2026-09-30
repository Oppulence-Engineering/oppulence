// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () =>
    function WorkflowsView(props: { focus?: string }) {
      return <div>Workflows {props.focus}</div>;
    },
}));
vi.mock("@/components/features/dashboard/chat-route-provider/chat-route-provider", () => ({
  useDashboardChatController: () => ({ selectedResource: null }),
}));
vi.mock("@/hooks/dashboard/use-product-route-state", () => ({
  useProductRouteState: () => ({ workflowFocus: "runs" }),
}));

import { WorkflowsDashboardRoute } from "./workflows-dashboard-route";

describe("WorkflowsDashboardRoute", () => {
  it("forwards accessible section props and renders its content", () => {
    render(
      <WorkflowsDashboardRoute aria-label="Workflows" focus="scheduled">
        Content
      </WorkflowsDashboardRoute>,
    );

    const route = screen.getByRole("region", { name: "Workflows" });
    expect(route).toHaveAttribute("data-slot", "workflows-dashboard-route");
    // The server prop is "scheduled". The live nuqs focus is what the view uses.
    expect(route).toHaveTextContent("Workflows runs");
  });
});
