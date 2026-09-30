// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearSelectedResource: vi.fn(),
  setPaletteOpen: vi.fn(),
  setSidebarOpen: vi.fn(),
}));

vi.mock("@/components/features/dashboard/app-shell/app-shell", () => ({
  AppShellSidebar: () => <aside aria-label="Sidebar" />,
  AppTopBar: ({ onAsk }: { onAsk: () => void }) => (
    <button onClick={onAsk} type="button">
      Ask
    </button>
  ),
  REVENUE_TAB_LABELS: { commitments: "Commitments" },
  SETTINGS_SECTIONS: [{ key: "overview", label: "Settings" }],
  ViewBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/auth/auth-gate", () => ({
  useAuthSession: () => ({
    user: { email: "person@example.com", organizationId: "org" },
    billing: null,
  }),
}));
vi.mock("@/components/features/dashboard/command-palette/command-palette", () => ({
  CommandPalette: ({ open, querySeed }: { open: boolean; querySeed?: string }) => (
    <div aria-label="Command palette" data-open={String(open)} data-seed={querySeed ?? ""} />
  ),
}));
vi.mock("@/components/features/dashboard/chat-route-provider/chat-route-provider", () => ({
  useDashboardChatController: () => ({
    agentOptions: ["assistant"],
    agentCatalog: [{ slug: "assistant", name: "Assistant" }],
    activeRunId: null,
    empty: true,
    sessions: [],
    selectedResource: null,
    clearSelectedResource: mocks.clearSelectedResource,
    onAgentsChanged: vi.fn(),
    onNewChat: vi.fn(),
    onOpenAgent: vi.fn(),
    onOpenResource: vi.fn(),
    onOpenSession: vi.fn(),
    onUseAgent: vi.fn(),
  }),
}));
vi.mock("@/hooks/dashboard/use-product-route-state", () => ({
  useProductRouteState: () => ({
    view: "chat",
    revenueTab: "commitments",
    settingsSection: "overview",
    workflowFocus: "scheduled",
    navigateTo: vi.fn(),
    openRevenueTab: vi.fn(),
    openSettings: vi.fn(),
    openWorkflows: vi.fn(),
  }),
}));
vi.mock("@/lib/console/console-prefs", () => ({
  useBooleanPref: () => [true, mocks.setSidebarOpen],
}));
vi.mock("@/lib/icons", () => ({ SidebarSimple: () => <span aria-hidden /> }));

import { DashboardShell, useAskOppulence } from "./dashboard-shell";

function AskAboutAcme() {
  const ask = useAskOppulence();
  return (
    <button onClick={() => ask("Acme")} type="button">
      Ask about Acme
    </button>
  );
}

describe("DashboardShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it("forwards accessible section props and renders its content", () => {
    render(<DashboardShell aria-label="Example dashboard-shell">Content</DashboardShell>);

    const component = screen.getByRole("region", { name: "Example dashboard-shell" });
    expect(component).toHaveAttribute("data-slot", "dashboard-shell");
    expect(component).toHaveTextContent("Content");
  });

  it("owns command-palette and sidebar keyboard handling", () => {
    render(<DashboardShell aria-label="Dashboard">Content</DashboardShell>);

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByLabelText("Command palette")).toHaveAttribute("data-open", "true");
    expect(screen.getByLabelText("Command palette")).toHaveAttribute("data-seed", "");

    fireEvent.keyDown(window, { key: "[" });
    expect(mocks.setSidebarOpen).toHaveBeenCalledWith(false);

    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "[" });
    expect(mocks.setSidebarOpen).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it("opens the palette seeded with the company a surface asks about", () => {
    render(
      <DashboardShell aria-label="Dashboard">
        <AskAboutAcme />
      </DashboardShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ask about Acme" }));
    const palette = screen.getByLabelText("Command palette");
    expect(palette).toHaveAttribute("data-open", "true");
    expect(palette).toHaveAttribute("data-seed", "Acme");

    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(screen.getByLabelText("Command palette")).toHaveAttribute("data-seed", "");
  });
});
