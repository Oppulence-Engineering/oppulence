// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  AccountMissionControlSurface,
  commitmentTimelineLabel,
  commitmentTimelineStatus,
} from "./account-mission-control-surface";
import type { RelationshipCommitment } from "@/lib/revenue/types";

const now = Date.parse("2026-10-01T12:00:00Z");

function promise(overrides: Partial<RelationshipCommitment> = {}): RelationshipCommitment {
  return {
    id: "commitment-1",
    direction: "promised_by_them",
    text: "Send the sandbox login",
    status: "open",
    confidence: 0.9,
    userConfirmed: true,
    acceptance: "internally_confirmed",
    ...overrides,
  };
}

describe("AccountMissionControlSurface", () => {
  it("renders an empty account timeline with its product slot", () => {
    render(<AccountMissionControlSurface accountName="Acme" items={[]} />);

    const surface = screen.getByRole("region", { name: "Acme" });
    expect(surface).toHaveAttribute("data-slot", "account-mission-control-surface");
    expect(screen.getByText("No commitments recorded for this company yet.")).toBeInTheDocument();
  });

  it("marks a past-due open promise at risk, and leaves a later one open", () => {
    expect(
      commitmentTimelineStatus(
        promise({ dueAt: "2026-09-29T12:00:00Z" }),
        now,
      ).label,
    ).toBe("At risk");
    expect(
      commitmentTimelineStatus(
        promise({ dueAt: "2026-11-01T12:00:00Z", direction: "promised_by_me" }),
        now,
      ).label,
    ).toBe("Open");
    expect(
      commitmentTimelineStatus(
        promise({ acceptance: "disputed", dueAt: "2026-11-01T12:00:00Z" }),
        now,
      ).label,
    ).toBe("At risk");
    expect(
      commitmentTimelineStatus(
        promise({ acceptance: "candidate", dueAt: "2026-09-29T12:00:00Z" }),
        now,
      ).label,
    ).toBe("Review");
    expect(commitmentTimelineStatus(promise({ status: "fulfilled" }), now).label).toBe("Kept");
  });

  it("names a mutual promise as mutual", () => {
    expect(commitmentTimelineLabel("mutual")).toBe("Mutual promise");
    expect(commitmentTimelineLabel("promised_by_me")).toBe("Outbound promise");
    expect(commitmentTimelineLabel("promised_by_them")).toBe("Inbound promise");
  });
});
