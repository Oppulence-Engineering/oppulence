// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listNeverLoaded } from "@/components/features/revenue/shared/shared";
import {
  gmailDraftsAvailable,
  localModeNotice,
  sendingCheckLabel,
  sourceConnectionLabel,
  sourceRefreshNotice,
  WorkspaceView,
  workspaceMetadataValue,
} from "@/components/features/revenue/workspace-view/workspace-view";
import { fetchRelationshipSourceStatuses } from "@/hooks/queries/utils/fetch-relationship-sources";
import { fetchRelationshipRefreshBlocker } from "@/hooks/queries/utils/fetch-workflows";
import { resyncRelationshipSource } from "@/lib/revenue/revenue";
import type { RelationshipSourceStatus } from "@/lib/revenue/types";

vi.mock("@/components/features/connectors/connector-settings/connector-settings", () => ({
  ConnectorSettings: () => <div data-testid="connector-settings">Connectors</div>,
}));

vi.mock("@/hooks/queries/utils/fetch-relationship-sources", () => ({
  fetchRelationshipSourceStatuses: vi.fn(),
  loadRelationshipSourceStatuses: vi.fn(),
}));

vi.mock("@/lib/revenue/revenue", () => ({
  linkWorkspace: vi.fn(),
  relativeTime: vi.fn(),
  resyncRelationshipSource: vi.fn(),
  RevenueAPIError: class RevenueAPIError extends Error {},
}));

vi.mock("@/hooks/queries/utils/fetch-workflows", () => ({
  fetchRelationshipRefreshBlocker: vi.fn(),
  fetchWorkflowRuns: vi.fn(),
  fetchWorkflowTasks: vi.fn(),
  fetchWorkflowTemplates: vi.fn(),
}));

const incomplete: RelationshipSourceStatus = {
  connectionId: "google-1",
  source: "google",
  sourceAccountId: "owner@example.com",
  status: "connected",
  backfillPhase: "failed",
  backfillCompleted: 0,
  backfillTotal: 0,
  completeness: "partial",
  expectedCadenceSeconds: 900,
  lagSeconds: 0,
  requiredScopes: [],
  grantedScopes: [],
  missingScopes: [],
  retryCount: 4,
};

function renderWorkspace(overrides?: Partial<React.ComponentProps<typeof WorkspaceView>>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <WorkspaceView
          workspace={{ id: "ws-1", mode: "local", status: "active", preflightAvailable: false }}
          onLinked={vi.fn()}
          onError={vi.fn()}
          onNotice={vi.fn()}
          {...overrides}
        />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => {
  vi.mocked(fetchRelationshipRefreshBlocker).mockResolvedValue("");
  vi.mocked(fetchRelationshipSourceStatuses).mockResolvedValue([
    {
      ...incomplete,
      connectionId: "desktop-1",
      source: "desktop_note",
      sourceAccountId: "default",
      status: "live",
      backfillPhase: "idle",
      completeness: "complete",
    },
    incomplete,
  ]);
  vi.mocked(resyncRelationshipSource).mockImplementation(async () => {
    const updated = {
      ...incomplete,
      status: "backfilling" as const,
      backfillPhase: "queued",
      completeness: "rebuilding",
    };
    vi.mocked(fetchRelationshipSourceStatuses).mockResolvedValue([
      {
        ...incomplete,
        connectionId: "desktop-1",
        source: "desktop_note",
        sourceAccountId: "default",
        status: "live",
        backfillPhase: "idle",
        completeness: "complete",
      },
      updated,
    ]);
    return updated;
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WorkspaceView", () => {
  it("shows an incomplete connected source and lets the user retry its sync", async () => {
    const onNotice = vi.fn();
    renderWorkspace({ onNotice });

    expect(await screen.findByText("Sync incomplete")).toBeInTheDocument();
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
    expect(screen.getByText("A note")).toBeInTheDocument();
    expect(screen.queryByText("live")).not.toBeInTheDocument();
    expect(screen.queryByText("desktop_note")).not.toBeInTheDocument();
    expect(
      screen.getByText(/connection works, but its history is not fully synced/i),
    ).toBeVisible();
    expect(screen.getByTestId("connector-settings")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry sync" }));

    await waitFor(() =>
      expect(resyncRelationshipSource).toHaveBeenCalledWith("google", "owner@example.com"),
    );
    expect(await screen.findByText("Syncing")).toBeInTheDocument();
    expect(onNotice).toHaveBeenCalledWith("Google refresh queued.");
    expect(sourceRefreshNotice("slack")).toBe("Slack refresh queued.");
    expect(sourceRefreshNotice("desktop_note")).toBe("A note refresh queued.");
  });

  it("distinguishes stale freshness from an incomplete history sync", async () => {
    vi.mocked(fetchRelationshipSourceStatuses).mockResolvedValue([
      { ...incomplete, status: "stale", backfillPhase: "live", completeness: "stale" },
    ]);

    renderWorkspace();

    expect(await screen.findByText("Out of date")).toBeInTheDocument();
    expect(screen.getByText("owner@example.com")).toHaveClass("normal-case");
    expect(
      screen.getByText(/no successful update arrived on schedule/i),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Refresh now" })).toBeEnabled();
    expect(screen.queryByText("Sync incomplete")).not.toBeInTheDocument();
  });

  it.each([
    ["workspace credits", "insufficient_credits", /out of AI credits.*still connected/i],
    ["provider credits", "upstream_credits_exhausted", /AI provider.*still connected/i],
  ])(
    "explains when stale automation needs %s instead of a Google reconnect",
    async (_, errorCode, message) => {
      vi.mocked(fetchRelationshipSourceStatuses).mockResolvedValue([
        { ...incomplete, status: "stale", backfillPhase: "live", completeness: "stale" },
      ]);
      vi.mocked(fetchRelationshipRefreshBlocker).mockResolvedValue(errorCode);

      renderWorkspace();

      expect(await screen.findByText(message)).toHaveTextContent(/reconnecting will not fix it/i);
      expect(fetchRelationshipRefreshBlocker).toHaveBeenCalled();
    },
  );

  it("names a source connection instead of the stored status", () => {
    expect(sourceConnectionLabel(incomplete)).toBe("Sync incomplete");
    expect(
      sourceConnectionLabel({
        ...incomplete,
        source: "hubspot",
        status: "reconnect_required",
        completeness: "disconnected",
      }),
    ).toBe("Reconnect required");
    expect(
      sourceConnectionLabel({
        ...incomplete,
        source: "desktop_note",
        status: "live",
        completeness: "complete",
      }),
    ).toBe("Active");
  });

  it("names a workspace that needs repair instead of showing the stored slug", () => {
    expect(workspaceMetadataValue("repair_required")).toBe("Needs repair");
    expect(workspaceMetadataValue("local")).toBe("Local");
    expect(workspaceMetadataValue("disconnected")).toBe("Disconnected");
    expect(workspaceMetadataValue("needs_review")).toBe("Needs Review");
  });

  it("keeps the preflight sentence as written", async () => {
    vi.mocked(fetchRelationshipSourceStatuses).mockResolvedValue([]);
    renderWorkspace();
    const preflight = await screen.findByText("Unavailable");
    expect(preflight).toBeVisible();
    expect(preflight).not.toHaveClass("capitalize");
    expect(screen.queryByText("Unavailable (drafts only)")).not.toBeInTheDocument();
    expect(screen.getByText("Sending check")).toBeVisible();
    expect(screen.getByText("Turn on checked sending")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Sending workspace ID" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Organization ID" })).toBeVisible();
    expect(screen.getByPlaceholderText("Workspace id")).toBeVisible();
    expect(screen.getByPlaceholderText("Organization id")).toBeVisible();
    expect(screen.queryByPlaceholderText("ws_…")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("org_…")).not.toBeInTheDocument();
    const emptySources = await screen.findByText(/Nothing is connected yet/);
    expect(emptySources).toBeVisible();
    expect(screen.getByText(/Connect Gmail before a draft can land in your mailbox/)).toBeVisible();
    expect(screen.queryByText(/Drafts still land in your Gmail/)).not.toBeInTheDocument();
    expect(emptySources).toHaveTextContent(
      "Nothing is connected yet. Connect Gmail and Calendar, or another tool below.",
    );
    expect(emptySources).not.toHaveTextContent(/Slack/);
    expect(screen.queryByText(/OutboundConsole/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bCRM\b/)).not.toBeInTheDocument();
  });

  it("says the source list failed instead of claiming nothing is connected", async () => {
    vi.mocked(fetchRelationshipSourceStatuses).mockRejectedValue(new Error("boom"));
    renderWorkspace();
    expect(await screen.findByText("Sources could not load. Try again.")).toBeVisible();
    expect(screen.getByText("Couldn't load")).toBeVisible();
    expect(screen.queryByText(/Nothing is connected yet/)).not.toBeInTheDocument();
    expect(screen.queryByText("0 sources")).not.toBeInTheDocument();
    vi.mocked(fetchRelationshipSourceStatuses).mockResolvedValue([]);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Nothing is connected yet/)).toBeVisible();
    expect(screen.getByText("0 sources")).toBeVisible();
  });

  it("keeps loaded sources when a refresh fails", async () => {
    const { client } = renderWorkspace();
    expect(await screen.findByText("A note")).toBeVisible();
    expect(screen.getByText("2 sources")).toBeVisible();
    vi.mocked(fetchRelationshipSourceStatuses).mockRejectedValue(new Error("boom"));
    await client.invalidateQueries();
    expect(await screen.findByText("Could not refresh sources. Try again.")).toBeVisible();
    expect(screen.getByText("A note")).toBeVisible();
    expect(screen.getByText("Google")).toBeVisible();
    expect(screen.getByText("2 sources")).toBeVisible();
    expect(screen.queryByText("Sources could not load. Try again.")).not.toBeInTheDocument();
    expect(screen.queryByText("Couldn't load")).not.toBeInTheDocument();
  });

  it("keeps the empty source list when a refresh fails", async () => {
    vi.mocked(fetchRelationshipSourceStatuses).mockResolvedValue([]);
    const { client } = renderWorkspace();
    expect(await screen.findByText(/Nothing is connected yet/)).toBeVisible();
    expect(screen.getByText("0 sources")).toBeVisible();
    vi.mocked(fetchRelationshipSourceStatuses).mockRejectedValue(new Error("boom"));
    await client.invalidateQueries();
    expect(await screen.findByText("Could not refresh sources. Try again.")).toBeVisible();
    expect(screen.getByText(/Nothing is connected yet/)).toBeVisible();
    expect(screen.getByText("0 sources")).toBeVisible();
    expect(screen.queryByText("Sources could not load. Try again.")).not.toBeInTheDocument();
    expect(screen.queryByText("Couldn't load")).not.toBeInTheDocument();
    expect(listNeverLoaded(true, undefined)).toBe(true);
    expect(listNeverLoaded(true, [])).toBe(false);
  });

  it("keeps the Gmail draft sentence once Google is connected", () => {
    expect(gmailDraftsAvailable([{ source: "google", status: "live" }])).toBe(true);
    expect(gmailDraftsAvailable([{ source: "google", status: "disconnected" }])).toBe(false);
    expect(localModeNotice("connected")).toContain(
      "Drafts still land in your Gmail so you can send them yourself.",
    );
    expect(localModeNotice("missing")).toContain(
      "Connect Gmail before a draft can land in your mailbox.",
    );
    expect(localModeNotice("unknown")).not.toContain("Gmail");
    expect(sendingCheckLabel(true, "missing")).toBe("Available");
    expect(sendingCheckLabel(false, "missing")).toBe("Unavailable");
    expect(sendingCheckLabel(false, "connected")).toBe("Unavailable (drafts only)");
  });
});
