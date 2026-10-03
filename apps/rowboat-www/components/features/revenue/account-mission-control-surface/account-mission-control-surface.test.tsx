// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  AccountMissionControlSurface,
  commitmentPreviewRemainder,
  commitmentTimelineLabel,
  commitmentTimelineStatus,
  mapCommitmentsToAccountTimeline,
  openCommitmentCount,
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

  it("names the promises still off the overview", () => {
    expect(commitmentPreviewRemainder(1)).toBe("Show the other 1 commitment");
    expect(commitmentPreviewRemainder(6)).toBe("Show the other 6 commitments");
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
    ).toBe("Disputed");
    expect(
      commitmentTimelineStatus(
        promise({ acceptance: "candidate", dueAt: "2026-09-29T12:00:00Z" }),
        now,
      ).label,
    ).toBe("Review");
    expect(commitmentTimelineStatus(promise({ status: "fulfilled" }), now).label).toBe("Kept");
    expect(commitmentTimelineStatus(promise({ status: "waived" }), now).label).toBe("Waived");
    expect(commitmentTimelineStatus(promise({ status: "missed" }), now).label).toBe("Missed");
    expect(commitmentTimelineStatus(promise({ status: "cancelled" }), now).label).toBe("Cancelled");
    expect(commitmentTimelineStatus(promise({ status: "superseded" }), now).label).toBe(
      "Superseded",
    );
  });

  it("prints the promise sentence without surrounding space", () => {
    const [row] = mapCommitmentsToAccountTimeline(
      [promise({ text: "  Send the waived note.  ", status: "waived" })],
      1,
      now,
    );
    expect(row?.detail).toBe("Send the waived note.");
    expect(row?.statusLabel).toBe("Waived");
  });

  it("counts confirmed open promises and leaves reviews and disputes out", () => {
    expect(
      openCommitmentCount([
        promise({ status: "open", acceptance: "accepted" }),
        promise({ id: "guess", status: "open", acceptance: "candidate" }),
        promise({ id: "fight", status: "open", acceptance: "disputed" }),
        promise({ id: "done", status: "waived", acceptance: "accepted" }),
        promise({ id: "miss", status: "missed", acceptance: "accepted" }),
      ]),
    ).toBe(1);
  });

  it("names a mutual promise as mutual", () => {
    expect(commitmentTimelineLabel("mutual")).toBe("Mutual promise");
    expect(commitmentTimelineLabel("promised_by_me")).toBe("Outbound promise");
    expect(commitmentTimelineLabel("promised_by_them")).toBe("Inbound promise");
  });
});
