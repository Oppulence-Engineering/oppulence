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

import {
  TaskCreateDialog,
  taskCompanyMenuLabel,
  taskCompanyRequiredCopy,
  taskNextCompaniesLabel,
} from "@/components/features/revenue/task-create-dialog/task-create-dialog";

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

    expect(await screen.findByRole("alert")).toHaveTextContent(taskCompanyRequiredCopy(false));
    expect(taskCompanyRequiredCopy(false)).toBe("Link a company before saving.");
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
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(taskCompanyRequiredCopy(true));
    expect(taskCompanyRequiredCopy(true)).toBe("Add a company before saving.");
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

  it("loads a later company into a new task without saving", async () => {
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.setPointerCapture ??= () => undefined;
    Element.prototype.releasePointerCapture ??= () => undefined;
    Element.prototype.scrollIntoView ??= () => undefined;
    const user = userEvent.setup();
    const onLoadMoreCompanies = vi.fn();
    const acme = { id: "relationship-1", kind: "company" as const, displayName: "Acme" };
    const hidden = {
      id: "relationship-hidden",
      kind: "company" as const,
      displayName: "Hidden Account Co",
    };
    const { rerender } = render(
      <TaskCreateDialog
        hasMoreCompanies
        open
        relationships={[acme]}
        onError={vi.fn()}
        onLoadMoreCompanies={onLoadMoreCompanies}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: taskNextCompaniesLabel() })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Company, Link a company" }));
    expect(screen.getByRole("menuitem", { name: "Acme" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Hidden Account Co" })).toBeNull();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: taskNextCompaniesLabel() }));
    expect(onLoadMoreCompanies).toHaveBeenCalledOnce();

    rerender(
      <TaskCreateDialog
        open
        relationships={[acme, hidden]}
        onError={vi.fn()}
        onLoadMoreCompanies={onLoadMoreCompanies}
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Company, Link a company" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Company, Link a company" }));
    expect(screen.getByRole("menuitem", { name: "Hidden Account Co" })).toBeInTheDocument();
    expect(mocks.createAction).not.toHaveBeenCalled();
    expect(taskCompanyMenuLabel(0, true)).toBe("More companies are still in this list.");
    expect(taskCompanyRequiredCopy(true, true)).toBe("Show the next companies before saving.");
  });
});
