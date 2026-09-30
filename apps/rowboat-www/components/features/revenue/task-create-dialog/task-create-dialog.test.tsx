// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAction: vi.fn(),
}));

vi.mock("@/lib/revenue/revenue", () => ({
  createAction: mocks.createAction,
}));

import { TaskCreateDialog } from "@/components/features/revenue/task-create-dialog/task-create-dialog";

describe("TaskCreateDialog", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("requires a linked company before saving", async () => {
    const user = userEvent.setup();

    render(
      <TaskCreateDialog
        open
        relationships={[{ id: "relationship-1", kind: "organization", displayName: "Acme" }]}
        onError={vi.fn()}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Task title"), "Follow up on renewal");
    expect(screen.getByRole("button", { name: "Company, Link a company" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Add a company before saving.");
    expect(mocks.createAction).not.toHaveBeenCalled();
  });

  it("does not offer a save when the workspace has no companies", async () => {
    const user = userEvent.setup();

    render(
      <TaskCreateDialog
        open
        relationships={[]}
        onError={vi.fn()}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Task title"), "Follow up on renewal");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Create more tasks after saving" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Company, No companies yet" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Due date, Today" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a company" })).toBeNull();
    expect(screen.getByLabelText("Task title")).toHaveAttribute(
      "placeholder",
      "Follow up on the proposal",
    );
    expect(mocks.createAction).not.toHaveBeenCalled();
  });

  it("offers to add a company when the workspace has none", async () => {
    const user = userEvent.setup();
    const onAddCompany = vi.fn();

    render(
      <TaskCreateDialog
        open
        relationships={[]}
        onAddCompany={onAddCompany}
        onError={vi.fn()}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add a company" }));
    expect(onAddCompany).toHaveBeenCalledOnce();
    expect(mocks.createAction).not.toHaveBeenCalled();
  });
});
