// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchCommunicationPolicy,
  fetchCommunicationPrivacyRules,
} from "@/hooks/queries/utils/fetch-communication";
import { communicationKeys } from "@/hooks/queries/utils/communication-keys";
import { renderWithQuery } from "@/quality/test-support/render-query";

import {
  CommunicationPrivacySettings,
  mailboxPrivacyCopy,
  privacyLoadNotice,
  privacyRuleLabel,
  privacyRulesEmptyCopy,
} from "./communication-privacy-settings";

const { googleStatus } = vi.hoisted(() => ({
  googleStatus: vi.fn(),
}));

vi.mock("@/hooks/queries/use-google-oauth", () => ({
  useGoogleConnectionStatus: googleStatus,
}));

function googleConnection(connected: boolean | null, failed = false) {
  googleStatus.mockReturnValue({
    data: connected == null ? undefined : { connected, accounts: [] },
    isSuccess: connected != null,
    isError: failed,
    isPending: connected == null && !failed,
  });
}

vi.mock("@/hooks/queries/utils/fetch-communication", () => ({
  fetchCommunicationPolicy: vi.fn(),
  fetchCommunicationPrivacyRules: vi.fn(),
}));

vi.mock("@/lib/revenue/revenue", async () => {
  const actual = await vi.importActual<typeof import("@/lib/revenue/revenue")>(
    "@/lib/revenue/revenue",
  );
  return {
    ...actual,
    getCommunicationPolicy: vi.fn(),
    listCommunicationPrivacyRules: vi.fn(async () => []),
    putCommunicationPolicy: vi.fn(),
    createCommunicationPrivacyRule: vi.fn(),
    deleteCommunicationPrivacyRule: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CommunicationPrivacySettings", () => {
  beforeEach(() => {
    googleConnection(true);
  });

  it("renders the mailbox privacy controls shell", () => {
    renderWithQuery(<CommunicationPrivacySettings />);
    expect(screen.getByText("Mailbox account")).toBeInTheDocument();
    expect(
      screen.getByText("Configure privacy defaults for one connected Google mailbox."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mailbox account email")).toBeInTheDocument();
    expect(screen.getByText(/visible only to you/)).toBeInTheDocument();
    expect(screen.queryByText(/project into/)).not.toBeInTheDocument();
    expect(screen.queryByText(/owner-only/)).not.toBeInTheDocument();
    expect(privacyRuleLabel("protected_address")).toBe("Protected address");
    expect(privacyRuleLabel("blocked_domain")).toBe("Blocked domain");
  });

  it("does not claim a mailbox is connected when Google has no grant", () => {
    googleConnection(false);
    renderWithQuery(<CommunicationPrivacySettings />);
    expect(
      screen.getByText("Connect a Google mailbox before privacy defaults can apply."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Configure privacy defaults for one connected Google mailbox."),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mailbox account email")).not.toBeInTheDocument();
    expect(mailboxPrivacyCopy({ connected: null, failed: false })).toBe(
      "Checking whether a Google mailbox is connected.",
    );
    expect(mailboxPrivacyCopy({ connected: null, failed: true })).toBe(
      "Could not check whether a Google mailbox is connected.",
    );
    expect(mailboxPrivacyCopy({ connected: true, failed: true })).toBe(
      "Configure privacy defaults for one connected Google mailbox.",
    );
  });

  it("keeps Add rule off until an address or domain is entered", () => {
    renderWithQuery(<CommunicationPrivacySettings />);
    const add = screen.getByRole("button", { name: "Add rule" });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Privacy rule value"), {
      target: { value: "  " },
    });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Privacy rule value"), {
      target: { value: "buyer@example.com" },
    });
    expect(add).toBeEnabled();
  });

  it("names a failed rules load and shows the saved rule after retry", async () => {
    vi.mocked(fetchCommunicationPolicy).mockResolvedValue({
      id: "policy-1",
      sourceAccountId: "you@company.com",
      metadataVisibility: "workspace",
      shareSubject: false,
      shareBody: false,
      shareAttachments: false,
      signatureEnrichment: false,
      modelContactExtraction: false,
      retentionDays: 30,
      version: 1,
    });
    vi.mocked(fetchCommunicationPrivacyRules)
      .mockRejectedValueOnce(new Error("rules down"))
      .mockResolvedValueOnce([
        {
          id: "rule-1",
          kind: "protected_address",
          value: "buyer@example.com",
          valueHash: "hash",
          active: true,
        },
      ]);

    renderWithQuery(<CommunicationPrivacySettings />);
    fireEvent.change(screen.getByLabelText("Mailbox account email"), {
      target: { value: "you@company.com" },
    });

    expect(await screen.findByText("Privacy rules could not load. Try again.")).toBeVisible();
    expect(screen.queryByText(privacyRulesEmptyCopy())).not.toBeInTheDocument();
    expect(screen.queryByText("Protected address: buyer@example.com")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Protected address: buyer@example.com")).toBeVisible();
    expect(screen.queryByText("Privacy rules could not load. Try again.")).not.toBeInTheDocument();
    expect(privacyLoadNotice({ accountEntered: true, policyFailed: true, rulesFailed: true })).toBe(
      "Mailbox policy and privacy rules could not load. Try again.",
    );
    expect(
      privacyLoadNotice({ accountEntered: false, policyFailed: true, rulesFailed: true }),
    ).toBe(null);
    expect(
      privacyLoadNotice({
        accountEntered: true,
        policyFailed: true,
        rulesFailed: true,
        policyLoaded: true,
        rulesLoaded: true,
      }),
    ).toBe("Could not refresh mailbox policy and privacy rules. Try again.");
    expect(
      privacyLoadNotice({
        accountEntered: true,
        policyFailed: false,
        rulesFailed: true,
        rulesLoaded: true,
      }),
    ).toBe("Could not refresh privacy rules. Try again.");
    expect(
      privacyLoadNotice({
        accountEntered: true,
        policyFailed: true,
        rulesFailed: true,
        rulesLoaded: true,
      }),
    ).toBe("Mailbox policy could not load. Could not refresh privacy rules. Try again.");
  });

  it("keeps saved privacy rules when a refresh fails", async () => {
    const rule = {
      id: "rule-1",
      kind: "protected_address" as const,
      value: "buyer@example.com",
      valueHash: "hash",
      active: true,
    };
    vi.mocked(fetchCommunicationPolicy).mockResolvedValue({
      id: "policy-1",
      sourceAccountId: "you@company.com",
      metadataVisibility: "private",
      shareSubject: false,
      shareBody: false,
      shareAttachments: false,
      signatureEnrichment: false,
      modelContactExtraction: false,
      retentionDays: 30,
      version: 1,
    });
    vi.mocked(fetchCommunicationPrivacyRules).mockResolvedValue([rule]);

    const { client } = renderWithQuery(<CommunicationPrivacySettings />);
    fireEvent.change(screen.getByLabelText("Mailbox account email"), {
      target: { value: "you@company.com" },
    });

    expect(await screen.findByText("Protected address: buyer@example.com")).toBeVisible();
    expect(screen.getByLabelText("Share subject lines by default")).toBeInTheDocument();
    vi.mocked(fetchCommunicationPrivacyRules).mockRejectedValue(new Error("rules down"));
    vi.mocked(fetchCommunicationPolicy).mockRejectedValue(new Error("policy down"));
    await client.invalidateQueries({ queryKey: communicationKeys.all });

    expect(
      await screen.findByText("Could not refresh mailbox policy and privacy rules. Try again."),
    ).toBeVisible();
    expect(screen.getByText("Protected address: buyer@example.com")).toBeVisible();
    expect(screen.getByLabelText("Share subject lines by default")).toBeInTheDocument();
    expect(screen.queryByText("Privacy rules could not load. Try again.")).not.toBeInTheDocument();
    expect(screen.queryByText("Mailbox policy could not load. Try again.")).not.toBeInTheDocument();
  });

  it("says there are no privacy rules only after they load", async () => {
    vi.mocked(fetchCommunicationPolicy).mockResolvedValue({
      id: "policy-1",
      sourceAccountId: "you@company.com",
      metadataVisibility: "private",
      shareSubject: false,
      shareBody: false,
      shareAttachments: false,
      signatureEnrichment: false,
      modelContactExtraction: false,
      retentionDays: 30,
      version: 1,
    });
    vi.mocked(fetchCommunicationPrivacyRules).mockResolvedValue([]);

    renderWithQuery(<CommunicationPrivacySettings />);
    fireEvent.change(screen.getByLabelText("Mailbox account email"), {
      target: { value: "you@company.com" },
    });

    expect(await screen.findByText(privacyRulesEmptyCopy())).toBeVisible();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});
