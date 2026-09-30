// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "@/quality/test-support/render-query";

import {
  CommunicationPrivacySettings,
  privacyRuleLabel,
} from "./communication-privacy-settings";

vi.mock("@/lib/revenue/revenue", () => ({
  getCommunicationPolicy: vi.fn(),
  listCommunicationPrivacyRules: vi.fn(async () => []),
  putCommunicationPolicy: vi.fn(),
  createCommunicationPrivacyRule: vi.fn(),
  deleteCommunicationPrivacyRule: vi.fn(),
}));

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
});
