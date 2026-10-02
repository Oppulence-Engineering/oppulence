// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));
vi.mock("@/components/ai-elements/conversation", () => ({
  Conversation: function ConversationMock(props: Record<string, unknown>) {
    return createElement("div", null, props.children as never);
  },
  ConversationContent: function ConversationContentMock(props: Record<string, unknown>) {
    return createElement("div", null, props.children as never);
  },
}));
vi.mock("@/components/features/dashboard/chat-route-provider/chat-route-provider", () => ({
  useChatRouteState: () => ({
    activeAgent: "Revenue operator",
    artifact: null,
    conversation: [],
    empty: true,
    onOpenRevenueTab: vi.fn(),
    onResolveApproval: vi.fn(),
    onSelectPrompt: vi.fn(),
    processing: false,
    promptInput: createElement("label", null, "Brief"),
    workspace: "Acme",
  }),
}));
vi.mock("@/components/auth/auth-gate", () => ({
  useAuthSession: () => ({ user: { email: "morgan@acme.com", workosUserId: "user-1" } }),
}));

import {
  ChatDashboardRoute,
  pulseFigureValue,
  pulseLoadFailureCopy,
  pulseRefreshFailureCopy,
} from "./chat-dashboard-route";

describe("ChatDashboardRoute", () => {
  it("forwards accessible section props and renders its content boundary", () => {
    render(createElement(ChatDashboardRoute, { "aria-label": "Chat home" }, "Content"));

    const route = screen.getByRole("region", { name: "Chat home" });
    expect(route).toHaveAttribute("data-slot", "chat-dashboard-route");
  });

  it("names a tool call with the product label", () => {
    const source = fs.readFileSync(path.join(import.meta.dirname, "chat-dashboard-route.tsx"), "utf8");
    expect(source).toContain('label: "overdue"');
    expect(source).toContain("recoveryOpenCount(impact.open, impact.openTasks)");
    expect(source).toContain("impact.atRiskRelationships");
    expect(source).not.toContain("atRiskPulseCount(");
    expect(source).not.toContain('useRevenueActions("open", 100, "task")');
    expect(source).toContain("impact.overdueCommitments");
    expect(source).toContain('if (stat.tab === "commitments") requestDueCommitments();');
    expect(source).not.toContain('label: "commitments"');
    expect(source).toContain("pulseFigureValue(loaded, failed)");
    expect(source).toContain("pulseLoadFailureCopy()");
    expect(source).toContain("pulseRefreshFailureCopy()");
    expect(source).not.toContain('failed ? "—"');
    expect(source).toContain("agentToolLabel(item.name)");
    expect(source).toContain("approvalTrustCopy(item.trustTier)");
    expect(source).not.toContain('Trust tier: {item.trustTier.replaceAll("_", " ")}');
    expect(source).not.toContain("title={item.name}");
    expect(source).not.toContain("Approval required: {item.name}");
  });

  it("names a missed pulse instead of leaving a blank count", () => {
    expect(pulseFigureValue(false, false)).toBe("loading");
    expect(pulseFigureValue(false, true)).toBe("failed");
    expect(pulseFigureValue(true, true)).toBe("ready");
    expect(pulseLoadFailureCopy()).toBe("Workspace counts could not load. Try again.");
    expect(pulseRefreshFailureCopy()).toBe("Could not refresh workspace counts. Try again.");
  });
});
