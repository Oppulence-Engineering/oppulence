// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/quality/test-support/render-query";

const mocks = vi.hoisted(() => ({
  listComposioToolkits: vi.fn(),
  listComposioConnections: vi.fn(),
  startComposioConnection: vi.fn(),
  disconnectComposio: vi.fn(),
  UnconfiguredError: class extends Error {},
}));

vi.mock("@/hooks/queries/utils/fetch-composio", () => ({
  fetchComposioToolkits: mocks.listComposioToolkits,
  fetchComposioConnections: mocks.listComposioConnections,
  ComposioUnconfiguredError: mocks.UnconfiguredError,
}));
vi.mock("@/lib/api/composio/client", () => ({
  startComposioConnection: mocks.startComposioConnection,
  disconnectComposio: mocks.disconnectComposio,
  ComposioUnconfiguredError: mocks.UnconfiguredError,
}));

import { ComposioConnections } from "./composio-connections";

afterEach(cleanup);

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    if (typeof mock === "function" && "mockReset" in mock) mock.mockReset();
  }
  mocks.listComposioToolkits.mockResolvedValue([
    { slug: "jira", name: "Jira", managedAuth: true },
    { slug: "asana", name: "Asana", managedAuth: true },
  ]);
  mocks.listComposioConnections.mockResolvedValue([]);
});

describe("Composio connections", () => {
  it("offers a connect action for each product that is not linked", async () => {
    renderWithQuery(<ComposioConnections />);

    expect(await screen.findByText("Jira")).toBeInTheDocument();
    expect(screen.getByText(/not treated as promises/)).toBeInTheDocument();
    const promiseSources = screen.getByText(
      /Promises come from Gmail, Google Calendar, and HubSpot/,
    );
    expect(promiseSources).toBeInTheDocument();
    expect(promiseSources).not.toHaveTextContent(/Slack/);
    expect(screen.queryByText(/so those are/)).toBeNull();
    expect(screen.getAllByText("Not connected")).toHaveLength(2);
    expect(screen.queryByText(/company evidence/)).toBeNull();
    expect(screen.queryByText(/relationship sources/)).toBeNull();
    expect(screen.getByRole("button", { name: "Connect Jira" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Asana" })).toBeInTheDocument();
  });

  // The account is linked on Composio's page, not here, so the click must hand
  // the user that page rather than claim the product is connected.
  it("opens the hosted authorization page rather than connecting in place", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    mocks.startComposioConnection.mockResolvedValue({
      connectionId: "ca_1",
      redirectUrl: "https://connect.composio.dev/link/lk_1",
      expiresAt: "",
    });
    renderWithQuery(<ComposioConnections />);
    await screen.findByText("Jira");

    await userEvent.click(screen.getByRole("button", { name: "Connect Jira" }));

    expect(mocks.startComposioConnection).toHaveBeenCalledWith("jira");
    expect(open).toHaveBeenCalledWith(
      "https://connect.composio.dev/link/lk_1",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("explains a connect failure that is only a status code", async () => {
    mocks.startComposioConnection.mockRejectedValue(new Error("Composio request failed (429)"));
    renderWithQuery(<ComposioConnections />);

    await userEvent.click(await screen.findByRole("button", { name: "Connect Jira" }));

    expect(
      await screen.findByText(
        "Too many requests were sent from this workspace. Wait a moment, then try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Composio request failed/)).toBeNull();
  });

  it("names a connect failure that has no explanation", async () => {
    mocks.startComposioConnection.mockRejectedValue(new Error("Composio request failed (500)"));
    renderWithQuery(<ComposioConnections />);

    await userEvent.click(await screen.findByRole("button", { name: "Connect Jira" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not start the connection.");
    expect(screen.queryByText(/Composio request failed/)).toBeNull();
    expect(screen.getByRole("button", { name: "Connect Jira" })).toBeEnabled();
  });

  it("names a disconnect failure that has no explanation", async () => {
    mocks.listComposioConnections.mockResolvedValue([
      { id: "ca_1", toolkit: "jira", status: "ACTIVE", createdAt: "" },
    ]);
    mocks.disconnectComposio.mockRejectedValue(new Error("Composio request failed (500)"));
    renderWithQuery(<ComposioConnections />);

    await userEvent.click(await screen.findByRole("button", { name: "Disconnect Jira" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not disconnect.");
    expect(screen.queryByText(/Composio request failed/)).toBeNull();
    expect(screen.getByRole("button", { name: "Disconnect Jira" })).toBeEnabled();
  });

  it("offers disconnect for a linked product and reloads after it", async () => {
    mocks.listComposioConnections.mockResolvedValue([
      { id: "ca_1", toolkit: "jira", status: "ACTIVE", createdAt: "" },
    ]);
    mocks.disconnectComposio.mockResolvedValue(undefined);
    renderWithQuery(<ComposioConnections />);

    await userEvent.click(await screen.findByRole("button", { name: "Disconnect Jira" }));

    expect(mocks.disconnectComposio).toHaveBeenCalledWith("ca_1");
    expect(mocks.listComposioConnections).toHaveBeenCalledTimes(2);
  });

  // A deployment with no project key has nothing to offer. An empty panel would
  // read as a broken feature rather than one that was never switched on.
  it("shows the finished connection when the user returns to the tab", async () => {
    vi.stubGlobal("open", vi.fn());
    mocks.startComposioConnection.mockResolvedValue({
      connectionId: "ca_1",
      redirectUrl: "https://connect.composio.dev/link/lk_1",
      expiresAt: "2026-09-16T17:58:42.979Z",
    });
    const user = userEvent.setup();
    renderWithQuery(<ComposioConnections />);
    await user.click(await screen.findByRole("button", { name: "Connect Jira" }));

    // The user authorizes on Composio's page, so the account now exists.
    mocks.listComposioConnections.mockResolvedValue([
      { id: "ca_1", toolkit: "jira", status: "ACTIVE" },
    ]);
    document.dispatchEvent(new Event("visibilitychange"));

    expect(await screen.findByRole("button", { name: "Disconnect Jira" })).toBeInTheDocument();
    expect(mocks.listComposioConnections).toHaveBeenCalledTimes(2);
  });

  it("does not refetch when the tab regains focus with no connection pending", async () => {
    renderWithQuery(<ComposioConnections />);
    await screen.findByText("Jira");

    document.dispatchEvent(new Event("visibilitychange"));

    expect(mocks.listComposioConnections).toHaveBeenCalledTimes(1);
  });

  it("shows one row per product when retries left several connections", async () => {
    mocks.listComposioConnections.mockResolvedValue([
      { id: "ca_old", toolkit: "jira", status: "INITIATED", createdAt: "2026-09-16T09:00:00Z" },
      { id: "ca_live", toolkit: "jira", status: "ACTIVE", createdAt: "2026-09-16T10:00:00Z" },
      { id: "ca_new", toolkit: "jira", status: "INITIATED", createdAt: "2026-09-16T11:00:00Z" },
    ]);
    renderWithQuery(<ComposioConnections />);

    // The live connection wins over the newer pending ones, and Jira shows once.
    expect(await screen.findByRole("button", { name: "Disconnect Jira" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Disconnect/ })).toHaveLength(1);
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("falls back to the newest connection when none is active", async () => {
    mocks.listComposioConnections.mockResolvedValue([
      { id: "ca_old", toolkit: "jira", status: "INITIATED", createdAt: "2026-09-16T09:00:00Z" },
      { id: "ca_new", toolkit: "jira", status: "EXPIRED", createdAt: "2026-09-16T11:00:00Z" },
    ]);
    renderWithQuery(<ComposioConnections />);

    expect(await screen.findByText("Expired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disconnect Jira" })).toBeInTheDocument();
  });

  it("renders nothing when the server holds no project key", async () => {
    mocks.listComposioToolkits.mockRejectedValue(new mocks.UnconfiguredError());
    const { container } = renderWithQuery(<ComposioConnections />);

    await vi.waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });

  it("names a connection that is still waiting, and an unfamiliar status", async () => {
    mocks.listComposioConnections.mockResolvedValue([
      { id: "ca_wait", toolkit: "jira", status: "INITIATED", createdAt: "2026-09-16T09:00:00Z" },
      { id: "ca_fail", toolkit: "asana", status: "FAILED", createdAt: "2026-09-16T09:00:00Z" },
    ]);
    renderWithQuery(<ComposioConnections />);

    expect(await screen.findByText("Waiting to finish")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("says so when the products cannot be loaded", async () => {
    mocks.listComposioToolkits.mockRejectedValue(new Error("upstream"));
    renderWithQuery(<ComposioConnections />);

    expect(
      await screen.findByText("Additional products are temporarily unavailable."),
    ).toBeInTheDocument();
  });

  it("keeps offered products when the refresh fails", async () => {
    const { client } = renderWithQuery(<ComposioConnections />);
    expect(await screen.findByText("Jira")).toBeVisible();

    mocks.listComposioToolkits.mockRejectedValue(new Error("upstream"));
    await client.invalidateQueries({ queryKey: ["composio", "toolkits"] });

    expect(await screen.findByText("Could not refresh products. Try again.")).toBeVisible();
    expect(screen.getByText("Jira")).toBeVisible();
    expect(screen.getByRole("button", { name: "Connect Asana" })).toBeVisible();
    expect(
      screen.queryByText("Additional products are temporarily unavailable."),
    ).not.toBeInTheDocument();
  });
});

describe("Composio connections for products no longer offered", () => {
  // Gmail moved to the native connector and left the product list, but an
  // account linked before that still exists on Composio. Hidden, nothing could
  // disconnect it.
  it("still shows a linked product that left the list, with a disconnect action", async () => {
    mocks.listComposioConnections.mockResolvedValue([
      { id: "ca_1", toolkit: "gmail", status: "ACTIVE", createdAt: "2026-09-16T01:01:39.923Z" },
    ]);
    mocks.disconnectComposio.mockResolvedValue(undefined);
    renderWithQuery(<ComposioConnections />);

    expect(await screen.findByText("gmail")).toBeInTheDocument();
    expect(screen.getByText("Connected · no longer offered here")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Disconnect gmail" }));

    expect(mocks.disconnectComposio).toHaveBeenCalledWith("ca_1");
  });

  it("reports the offered product slugs so the caller can drop duplicate cards", async () => {
    const onToolkits = vi.fn();
    renderWithQuery(<ComposioConnections onToolkits={onToolkits} />);
    await screen.findByText("Jira");

    expect(onToolkits).toHaveBeenCalledWith(["jira", "asana"]);
  });
});
