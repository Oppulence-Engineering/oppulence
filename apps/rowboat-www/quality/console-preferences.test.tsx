// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/quality/test-support/render-query";

const mocks = vi.hoisted(() => ({
  dashboardFetch: vi.fn(),
  getPreferences: vi.fn(),
  patchPreferences: vi.fn(),
  setConsent: vi.fn(),
}));

vi.mock("@/hooks/queries/utils/fetch-console", () => ({
  fetchConsolePreferences: mocks.getPreferences,
  fetchConsoleResources: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/hooks/queries/utils/fetch-agents", () => ({
  fetchAgentSummaries: vi.fn().mockResolvedValue([{ slug: "reviewer", name: "Reviewer" }]),
}));
vi.mock("@/lib/console/console", () => ({
  patchConsolePreferences: mocks.patchPreferences,
}));
vi.mock("@/lib/analytics/analytics", () => ({
  capture: vi.fn(),
  RevenueEvents: { UpgradeClicked: "upgrade" },
  setAnalyticsConsent: mocks.setConsent,
}));
vi.mock("@/lib/auth/client", () => ({
  dashboardFetch: mocks.dashboardFetch,
}));
vi.mock("@/components/features/connectors/connector-settings/connector-settings", () => ({
  ConnectorSettings: () => null,
}));
vi.mock("@/components/features/account/delete-account-row/delete-account-row", () => ({
  DeleteAccountRow: () => null,
}));

import { fetchAgentSummaries } from "@/hooks/queries/utils/fetch-agents";

import { SettingsView } from "@/components/features/settings/app-settings/app-settings";

const preferences = {
  defaultAgentSlug: "reviewer",
  displayName: "Ada",
  shareUsageData: false,
};

function renderPreferences() {
  return renderWithQuery(
    <SettingsView
      onNavigate={vi.fn()}
      section="preferences"
      session={{ user: { permissions: [] } }}
    />,
  );
}

describe("synced console preferences", () => {
  beforeEach(() => {
    mocks.getPreferences.mockResolvedValue(preferences);
    mocks.patchPreferences.mockImplementation((patch: Partial<typeof preferences>) =>
      Promise.resolve({ ...preferences, ...patch }),
    );
    mocks.dashboardFetch.mockResolvedValue(
      new Response(JSON.stringify({ agents: [{ slug: "reviewer" }] })),
    );
    vi.mocked(fetchAgentSummaries).mockResolvedValue([
      { slug: "reviewer", name: "Reviewer" },
    ] as Awaited<ReturnType<typeof fetchAgentSummaries>>);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows only preferences with real consumers", async () => {
    renderPreferences();

    expect(await screen.findByLabelText("Share anonymous usage data")).not.toBeChecked();
    expect(
      await screen.findByRole("combobox", { name: "Default agent, Reviewer" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Memory Bank (preview)")).not.toBeInTheDocument();
    expect(screen.queryByText("Show model reasoning")).not.toBeInTheDocument();
    expect(screen.queryByText("Auto context compaction")).not.toBeInTheDocument();
    expect(screen.queryByText("Desktop notifications")).not.toBeInTheDocument();
  });

  it("shows Assistant when no default agent has been saved", async () => {
    mocks.getPreferences.mockResolvedValue({ ...preferences, defaultAgentSlug: "" });
    vi.mocked(fetchAgentSummaries).mockResolvedValue([
      { slug: "assistant", name: "Assistant" },
    ] as Awaited<ReturnType<typeof fetchAgentSummaries>>);

    renderPreferences();

    expect(await screen.findByRole("combobox", { name: "Default agent, Assistant" })).toHaveTextContent(
      "Assistant",
    );
  });

  it("associates the display name field with its label", async () => {
    renderWithQuery(
      <SettingsView
        onNavigate={vi.fn()}
        section="account"
        session={{ user: { email: "ada@example.com", permissions: [] } }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Display name")).toHaveValue("Ada");
    });
  });

  it("does not present preferences as notification settings", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <SettingsView
        onNavigate={onNavigate}
        section="notifications"
        session={{ user: { permissions: [] } }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Notifications" })).toBeVisible();
    expect(
      screen.getByText("This workspace does not send browser or email notifications."),
    ).toBeVisible();
    expect(screen.queryByText("Default agent")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open preferences" }));
    expect(onNavigate).toHaveBeenCalledWith("preferences");
  });

  it("does not present appearance as branding settings", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <SettingsView
        onNavigate={onNavigate}
        section="customization"
        session={{ user: { permissions: [] } }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Customization" })).toBeVisible();
    expect(screen.queryByRole("group", { name: "Theme" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open appearance" }));
    expect(onNavigate).toHaveBeenCalledWith("appearance");
  });

  it("does not repeat the personal connection list as shared connections", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <SettingsView
        onNavigate={onNavigate}
        section="connect"
        session={{ user: { permissions: [] } }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Oppulence Connect" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Connect Google" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open connections" }));
    expect(onNavigate).toHaveBeenCalledWith("connections");
  });

  it("patches analytics consent and updates the capture gate", async () => {
    const user = userEvent.setup();
    renderPreferences();

    await user.click(await screen.findByLabelText("Share anonymous usage data"));

    await waitFor(() => {
      expect(mocks.patchPreferences).toHaveBeenCalledWith({ shareUsageData: true });
    });
    expect(mocks.setConsent).toHaveBeenCalledWith(true);
  });
});
