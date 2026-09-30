// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { compileVisualWorkflow } from "@/lib/workflows/cloud-workflows";
import { VisualWorkflowBuilder } from "./visual-workflow-builder";

vi.mock("@xyflow/react", () => ({
  Background: () => null,
  Controls: () => null,
  MarkerType: { ArrowClosed: "arrowclosed" },
  ReactFlow: ({
    nodes,
    onNodeClick,
  }: {
    nodes: Array<{ id: string; data: { label: ReactNode } }>;
    onNodeClick?: (event: unknown, node: { id: string }) => void;
  }) => (
    <div>
      {nodes.map((node) => (
        <button
          aria-label={`Select ${node.id}`}
          key={node.id}
          onClick={() => onNodeClick?.({}, node)}
        >
          {node.data.label}
        </button>
      ))}
    </div>
  ),
  useEdgesState: (value: unknown) => [value, vi.fn()],
  useNodesState: (value: unknown) => [value, vi.fn(), vi.fn()],
}));

afterEach(cleanup);

const workflow = {
  version: 1 as const,
  trigger: { kind: "communication" as const },
  actions: ["review-account", "draft-email"] as const,
};

describe("VisualWorkflowBuilder", () => {
  it("forwards accessible section props and renders its content", () => {
    render(
      <VisualWorkflowBuilder
        aria-label="Example visual-workflow-builder"
        onChange={vi.fn()}
        value={{ ...workflow, actions: [...workflow.actions] }}
      />,
    );

    const component = screen.getByRole("region", { name: "Example visual-workflow-builder" });
    expect(component).toHaveAttribute("data-slot", "visual-workflow-builder");
    expect(component).toHaveTextContent("Mail or message received");
    expect(component).toHaveTextContent("Read the company, the people on it, and its open promises.");
    expect(component).not.toHaveTextContent("evidence");
    expect(component).toHaveTextContent("Step 1");
    expect(component).toHaveTextContent("Step 2");
    expect(component).not.toHaveTextContent("Then ·");
    expect(component).toHaveTextContent("Review company");
    expect(component).not.toHaveTextContent("Review account");
    expect(component).not.toHaveTextContent("Step configuration");
    expect(component).toHaveTextContent("Draft a follow-up");
    expect(component).not.toHaveTextContent("Draft recovery email");
    expect(component).toHaveTextContent("Add step");
    expect(component).not.toHaveTextContent("Read relationships");
  });

  it("hides add step on a workflow the workspace cannot edit", () => {
    render(
      <VisualWorkflowBuilder
        disabled
        onChange={vi.fn()}
        value={{ ...workflow, actions: [...workflow.actions] }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Add step" })).not.toBeInTheDocument();
  });

  it("names a repeating schedule without calling it a cadence", () => {
    render(
      <VisualWorkflowBuilder
        onChange={vi.fn()}
        value={{
          version: 1,
          trigger: { kind: "schedule", cronExpr: "*/15 * * * *" },
          actions: ["review-account"],
        }}
      />,
    );

    expect(screen.getByText("How often")).toBeInTheDocument();
    expect(screen.getAllByText("Run on a repeating schedule.")).toHaveLength(2);
    expect(screen.queryByText(/cadence/i)).not.toBeInTheDocument();
  });

  it("removes a selected action from the persisted definition", () => {
    const onChange = vi.fn();
    render(
      <VisualWorkflowBuilder
        onChange={onChange}
        value={{ ...workflow, actions: [...workflow.actions] }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select action:0" }));
    expect(screen.getByText("Which companies")).toBeInTheDocument();
    expect(screen.queryByText("Company scope")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select action:1" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Draft a follow-up" }));

    expect(onChange).toHaveBeenCalledWith({
      ...workflow,
      actions: ["review-account"],
      stepConfig: {},
    });
  });

  it("names the brief step for what it saves", () => {
    render(
      <VisualWorkflowBuilder
        onChange={vi.fn()}
        value={{
          version: 1,
          trigger: { kind: "schedule", cronExpr: "*/15 * * * *" },
          actions: ["write-brief"],
        }}
      />,
    );

    expect(screen.getByText("Save a brief")).toBeInTheDocument();
    expect(screen.getByText("Keep a brief this workflow can update.")).toBeInTheDocument();
    expect(screen.queryByText("Publish live brief")).not.toBeInTheDocument();
    expect(screen.queryByText(/evidence-backed/i)).not.toBeInTheDocument();
  });

  it("compiles communication triggers and approval-gated actions for the real runtime", () => {
    const compiled = compileVisualWorkflow({
      ...workflow,
      actions: [...workflow.actions],
      trigger: { kind: "communication", criteria: "Customer mentions a missed deadline" },
      stepConfig: {
        "action:1": { recipient: "promise-recipient", tone: "warm" },
      },
    });

    expect(compiled.triggers).toMatchObject({
      eventMatchCriteria: "Customer mentions a missed deadline",
      workflow: { version: 1, trigger: { kind: "communication" } },
    });
    expect(compiled.instructions).toContain("connector.write.gmail_draft");
    expect(compiled.instructions).toContain("tone: warm");
    expect(compiled.instructions).toContain("runtime approval gate");
  });
});
