// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeAgentSurface, resolveGreetingName } from "./home-agent-surface";

const onSelectPrompt = vi.fn();

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("HomeAgentSurface", () => {
  it("forwards accessible section props and renders workspace context", () => {
    render(
      <HomeAgentSurface
        activeAgent="Revenue operator"
        aria-label="Home agent"
        onSelectPrompt={onSelectPrompt}
        promptInput={<label>Operator brief</label>}
        signalPanel={<p>3 promises at risk</p>}
        userName="morgan@acme.com"
        workspace="Acme"
      />,
    );

    const component = screen.getByRole("region", { name: "Home agent" });
    expect(component).toHaveAttribute("data-slot", "home-agent-surface");
    expect(screen.getByText("What should we get done, Morgan?")).toBeVisible();
    expect(resolveGreetingName("Ada Lovelace")).toBe("Ada Lovelace");
    expect(resolveGreetingName("dev")).toBe("Dev");
    expect(resolveGreetingName("")).toBe("there");
    expect(component).toHaveTextContent("Acme · Revenue operator");
    expect(screen.getByText("3 promises at risk")).toBeVisible();
  });

  it("offers suggested actions to reduced-motion users on mobile", async () => {
    const user = userEvent.setup();
    render(
      <HomeAgentSurface
        activeAgent="Revenue operator"
        onSelectPrompt={onSelectPrompt}
        promptInput={<label>Operator brief</label>}
        signalPanel={null}
        workspace="Acme"
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "Review an at-risk company" })[0]!);

    expect(onSelectPrompt).toHaveBeenCalledWith(expect.stringContaining("Which company needs attention"));
    expect(screen.queryByRole("button", { name: "Review an at-risk relationship" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Prioritize what we owe" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Sequence open obligations" })).toBeNull();
  });

  it("fills a suggested action without internal wording", async () => {
    const user = userEvent.setup();
    render(
      <HomeAgentSurface
        activeAgent="Revenue operator"
        onSelectPrompt={onSelectPrompt}
        promptInput={<label>Operator brief</label>}
        signalPanel={null}
        workspace="Acme"
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "Find a slipping promise" })[0]!);
    await user.click(screen.getAllByRole("button", { name: "Prioritize what we owe" })[0]!);

    expect(onSelectPrompt).toHaveBeenNthCalledWith(
      1,
      expect.not.stringContaining("intervention"),
    );
    expect(onSelectPrompt).toHaveBeenNthCalledWith(
      2,
      expect.not.stringContaining("obligations"),
    );
  });
});
