// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchCommunicationPolicy,
  fetchCommunicationPrivacyRules,
} from "@/hooks/queries/utils/fetch-communication";
import { renderWithQuery } from "@/quality/test-support/render-query";

import {
  CommunicationPrivacySettings,
  privacyLoadNotice,
  privacyRuleLabel,
  privacyRulesEmptyCopy,
} from "./communication-privacy-settings";

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
  it("renders the mailbox privacy controls shell", () => {
    renderWithQuery(<CommunicationPrivacySettings />);
    expect(screen.getByText("Mailbox account")).toBeInTheDocument();
    expect(screen.getByLabelText("Mailbox account email")).toBeInTheDocument();
    expect(screen.getByText(/visible only to you/)).toBeInTheDocument();
    expect(screen.queryByText(/project into/)).not.toBeInTheDocument();
    expect(screen.queryByText(/owner-only/)).not.toBeInTheDocument();
    expect(privacyRuleLabel("protected_address")).toBe("Protected address");
    expect(privacyRuleLabel("blocked_domain")).toBe("Blocked domain");
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
