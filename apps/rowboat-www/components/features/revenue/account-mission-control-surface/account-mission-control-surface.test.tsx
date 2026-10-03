// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import fs from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(import.meta.dirname, "account-mission-control-surface.tsx"), "utf8");

import {
  AccountMissionControlSurface,
  atRiskPromiseCount,
  overduePromiseCount,
  commitmentPreviewRemainder,
  commitmentTimelineDue,
  commitmentTimelineLabel,
  commitmentTimelineStatus,
  mapCommitmentsToAccountTimeline,
  openCommitmentCount,
  promiseFollowUpEmptyCopy,
  promiseFollowUpTitle,
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
    expect(row?.label).toBe("They owe us");
    expect(row?.due).toBeUndefined();
    const [dated] = mapCommitmentsToAccountTimeline(
      [promise({ dueAt: "2026-10-20T15:00:00Z", text: "Send the quay due" })],
      1,
      now,
    );
    expect(dated?.due).toBe("Due: Oct 20, 2026");
    expect(commitmentTimelineDue("not-a-date")).toBeUndefined();
    expect(commitmentTimelineDue("")).toBeUndefined();
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

  it("counts a due-soon promise as a follow-up before reconcile", () => {
    const dueSoon = promise({ dueAt: "2026-10-02T12:00:00Z" });
    const later = promise({ id: "later", dueAt: "2026-12-01T12:00:00Z" });
    expect(atRiskPromiseCount([dueSoon, later], now)).toBe(1);
    expect(promiseFollowUpTitle(0, 1)).toBe("Promises to follow up (1)");
    expect(promiseFollowUpTitle(2, 1)).toBe("Promises to follow up (2)");
    expect(promiseFollowUpTitle(0, 0)).toBe("Promises to follow up (0)");
    expect(promiseFollowUpEmptyCopy(1)).toBe(
      "A promise is due soon. Reconcile to check the follow-up.",
    );
    expect(promiseFollowUpEmptyCopy(2)).toBe(
      "2 promises are due soon. Reconcile to check the follow-up.",
    );
    expect(promiseFollowUpEmptyCopy(0)).toBe("No promises are due for a follow-up.");
    const past = promise({ id: "past", dueAt: "2026-09-29T12:00:00Z" });
    const soon = promise({ id: "soon", dueAt: "2026-10-02T12:00:00Z" });
    expect(overduePromiseCount([past, soon, later], now)).toBe(1);
    expect(promiseFollowUpEmptyCopy(1, 1)).toBe(
      "A promise is past due. Reconcile to check the follow-up.",
    );
    expect(promiseFollowUpEmptyCopy(2, 2)).toBe(
      "2 promises are past due. Reconcile to check the follow-up.",
    );
    expect(promiseFollowUpEmptyCopy(2, 1)).toBe(
      "A promise is past due and 1 is due soon. Reconcile to check the follow-up.",
    );
  });

  it("shows the due day on the company promise", () => {
    render(
      <AccountMissionControlSurface
        accountName="Quay Due"
        showHeader={false}
        items={[
          {
            id: "1",
            label: "They owe us",
            detail: "Send the quay due",
            due: "Due: Oct 20, 2026",
            statusLabel: "Open",
            statusVariant: "amber",
          },
        ]}
      />,
    );
    expect(screen.getByText("Due: Oct 20, 2026")).toBeVisible();
    expect(source).toContain("commitmentTimelineDue(commitment.dueAt)");
    expect(source).toContain("{item.due}");
  });

  it("names who owes the promise", () => {
    expect(commitmentTimelineLabel("mutual")).toBe("We both owe");
    expect(commitmentTimelineLabel("promised_by_me")).toBe("We owe them");
    expect(commitmentTimelineLabel("promised_by_them")).toBe("They owe us");
    expect(commitmentTimelineLabel("")).toBe("We owe them");
    expect(source).toContain("promiseDirectionLabel(direction)");
    expect(source).not.toContain("Outbound promise");
    expect(source).not.toContain("Inbound promise");
  });
});
