// @vitest-environment jsdom

import fs from "node:fs";
import path from "node:path";

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const decideRelationshipAttention = vi.hoisted(() => vi.fn());

vi.mock("@/lib/revenue/revenue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/revenue/revenue")>();
  return { ...actual, decideRelationshipAttention };
});

import {
  AttentionQueueSurface,
  attentionBand,
  attentionBandEmptyCopy,
  attentionNextPageLabel,
  attentionQueueCountLabel,
  attentionQueueRemainderLabel,
  filterAttentionItems,
} from "./attention-queue-surface";
import type { RelationshipAttentionItem } from "@/lib/revenue/types";

afterEach(cleanup);

describe("AttentionQueueSurface", () => {
  it("renders the attention queue with its product slot", () => {
    render(
      <AttentionQueueSurface
        items={[
          {
            evidenceRefs: [],
            explanation: "No reply in 14 days",
            id: "attn-1",
            rankFactors: {},
            rankScore: 0.8,
            reasonCode: "quiet_account",
            relationshipId: "rel-1",
            relationshipName: "Acme",
            sourceRequirements: [],
            status: "open",
            triggeringObjectRef: "rel-1",
            urgencyBand: "high",
            version: 1,
          },
        ]}
        onActionError={vi.fn()}
        onChanged={vi.fn()}
        onOpenRelationship={vi.fn()}
      />,
    );

    const surface = screen.getByRole("region", { name: "Attention queue" });
    expect(surface).toHaveAttribute("data-slot", "attention-queue-surface");
    expect(screen.getAllByText("Acme").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No reply in 14 days").length).toBeGreaterThan(1);
    expect(
      screen.getByText("No reply in 14 days", { selector: "[data-slot=attention-reason]" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Filter" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open items" })).not.toBeInTheDocument();
  });

  it("names an overdue promise when the stored sentence says commitment", () => {
    render(
      <AttentionQueueSurface
        items={[
          item(
            "attn-overdue",
            "Quay Overdue",
            "high",
            "A confirmed commitment is overdue by 2 days.",
          ),
        ]}
        onActionError={vi.fn()}
        onChanged={vi.fn()}
        onOpenRelationship={vi.fn()}
      />,
    );
    expect(screen.getAllByText("A confirmed promise is overdue by 2 days.").length).toBeGreaterThan(0);
    expect(screen.queryByText(/confirmed commitment/)).toBeNull();
  });

  it("counts one company when it has two reasons", () => {
    const shared = item("attn-overdue", "Quay Overdue", "high", "A confirmed promise is overdue by 3 days.");
    render(
      <AttentionQueueSurface
        items={[
          shared,
          {
            ...item(
              "attn-meeting",
              "Quay Overdue",
              "high",
              "You confirmed this follow-up from the meeting.",
            ),
            relationshipId: shared.relationshipId,
          },
        ]}
        onActionError={vi.fn()}
        onChanged={vi.fn()}
        onOpenRelationship={vi.fn()}
      />,
    );
    expect(screen.getByText("1 company")).toBeInTheDocument();
    expect(screen.queryByText("2 companies")).not.toBeInTheDocument();
  });

  it("names a quiet company when the reason has no sentence", () => {
    render(
      <AttentionQueueSurface
        items={[item("attn-quiet", "Harbor Quiet", "high", "")]}
        onActionError={vi.fn()}
        onChanged={vi.fn()}
        onOpenRelationship={vi.fn()}
      />,
    );
    expect(screen.getAllByText("Quiet company").length).toBeGreaterThan(0);
    expect(screen.queryByText("Quiet account")).toBeNull();
    expect(screen.queryByText("Quiet Account")).toBeNull();
  });

  it("keeps only the selected urgency band", async () => {
    const user = userEvent.setup();
    render(
      <AttentionQueueSurface
        items={[
          item("attn-risk", "Acme", "high", "No reply in 14 days"),
          item("attn-watch", "Northwind", "normal", "Renewal in 30 days"),
        ]}
        onActionError={vi.fn()}
        onChanged={vi.fn()}
        onOpenRelationship={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Attention band" }), "watch");

    expect(screen.getAllByText("Renewal in 30 days").length).toBeGreaterThan(1);
    expect(screen.queryByText("No reply in 14 days")).not.toBeInTheDocument();
    expect(screen.getByText("1 company")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Company" })).toBeInTheDocument();
  });

  it("says there are no companies when a band is empty", async () => {
    const user = userEvent.setup();
    render(
      <AttentionQueueSurface
        items={[item("attn-risk", "Acme", "high", "No reply in 14 days")]}
        onActionError={vi.fn()}
        onChanged={vi.fn()}
        onOpenRelationship={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Attention band" }), "stable");

    expect(screen.getByText("No companies in this band.")).toBeInTheDocument();
    expect(screen.getByText("0 companies")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Show the next companies in the queue" }),
    ).not.toBeInTheDocument();
  });

  it("keeps looking when a band is empty only on the loaded page", async () => {
    const user = userEvent.setup();
    const onLoadMore = vi.fn();
    render(
      <AttentionQueueSurface
        hasMore
        items={[item("attn-risk", "Acme", "high", "No reply in 14 days")]}
        onActionError={vi.fn()}
        onChanged={vi.fn()}
        onLoadMore={onLoadMore}
        onOpenRelationship={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Attention band" }), "stable");

    expect(screen.getByText("Nothing loaded is in this band.")).toBeInTheDocument();
    expect(screen.queryByText("No companies in this band.")).not.toBeInTheDocument();
    expect(screen.getByText("0+")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show the next companies in the queue" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("selects a reason without opening the company", async () => {
    const user = userEvent.setup();
    const onOpenRelationship = vi.fn();
    render(
      <AttentionQueueSurface
        items={[
          item("attn-risk", "Acme", "high", "No reply in 14 days"),
          item("attn-watch", "Northwind", "normal", "Renewal in 30 days"),
        ]}
        onActionError={vi.fn()}
        onChanged={vi.fn()}
        onOpenRelationship={onOpenRelationship}
      />,
    );

    await user.click(screen.getByText("Renewal in 30 days"));
    expect(onOpenRelationship).not.toHaveBeenCalled();
    expect(
      screen.getByText("Renewal in 30 days", { selector: "[data-slot=attention-reason]" }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Northwind" }));
    expect(onOpenRelationship).toHaveBeenCalledWith("attn-watch");
  });

  it("keeps the full reason next to the decision", () => {
    const reason =
      "No recorded interaction for 12 days. Companies in contracting are usually contacted again within 7 days.";
    render(
      <AttentionQueueSurface
        items={[item("attn-quiet", "Dogfood Label", "normal", reason)]}
        onActionError={vi.fn()}
        onChanged={vi.fn()}
        onOpenRelationship={vi.fn()}
      />,
    );

    expect(
      screen.getByText(reason, { selector: "[data-slot=attention-reason]" }),
    ).toHaveTextContent("within 7 days.");
  });

  it("keeps companies past the first screen one click away", async () => {
    const user = userEvent.setup();
    const names = Array.from({ length: 11 }, (_, index) => `Queue Co ${index + 1}`);
    render(
      <AttentionQueueSurface
        items={names.map((name, index) =>
          item(`attn-${index + 1}`, name, "high", `Reason for ${name}`),
        )}
        onActionError={vi.fn()}
        onChanged={vi.fn()}
        onOpenRelationship={vi.fn()}
      />,
    );

    expect(screen.getByText("10 of 11 companies")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Queue Co 10" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Queue Co 11" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show the other 1 company" }));
    expect(screen.getByRole("button", { name: "Queue Co 11" })).toBeInTheDocument();
    expect(screen.getByText("11 companies")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show the other 1 company" })).not.toBeInTheDocument();
  });

  it("asks for a dismiss reason on the queue", async () => {
    const user = userEvent.setup();
    const prompt = vi.spyOn(window, "prompt");
    decideRelationshipAttention.mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(
      <AttentionQueueSurface
        items={[item("attn-risk", "Acme", "high", "No reply in 14 days")]}
        onActionError={vi.fn()}
        onChanged={onChanged}
        onOpenRelationship={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    const reason = screen.getByRole("textbox", { name: "Why this should be dismissed" });
    expect(reason).toHaveValue("Not relevant right now");
    expect(prompt).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm dismiss" }));
    expect(decideRelationshipAttention).toHaveBeenCalledWith("attn-risk", {
      decision: "dismiss",
      reason: "Not relevant right now",
      expectedVersion: 1,
      snoozedUntil: undefined,
    });
    expect(onChanged).toHaveBeenCalledOnce();
    const source = fs.readFileSync(
      path.join(import.meta.dirname, "attention-queue-surface.tsx"),
      "utf8",
    );
    expect(source).not.toContain("window.prompt");
    prompt.mockRestore();
  });
});

function item(
  id: string,
  name: string,
  urgencyBand: RelationshipAttentionItem["urgencyBand"],
  explanation: string,
): RelationshipAttentionItem {
  return {
    evidenceRefs: [],
    explanation,
    id,
    rankFactors: {},
    rankScore: 0.8,
    reasonCode: "quiet_account",
    relationshipId: id,
    relationshipName: name,
    sourceRequirements: [],
    status: "open",
    triggeringObjectRef: id,
    urgencyBand,
    version: 1,
  };
}

describe("attention queue count", () => {
  it("names a partial screen and the companies still hidden", () => {
    expect(attentionQueueCountLabel(10, 11)).toBe("10 of 11 companies");
    expect(attentionQueueCountLabel(11, 11)).toBe("11 companies");
    expect(attentionQueueCountLabel(1, 1)).toBe("1 company");
    expect(attentionQueueRemainderLabel(1)).toBe("Show the other 1 company");
    expect(attentionQueueRemainderLabel(4)).toBe("Show the other 4 companies");
    expect(attentionQueueCountLabel(10, 50, true)).toBe("10 of 50+");
    expect(attentionQueueCountLabel(50, 50, true)).toBe("50+");
    expect(attentionNextPageLabel()).toBe("Show the next companies in the queue");
    expect(attentionBandEmptyCopy(false)).toBe("No companies in this band.");
    expect(attentionBandEmptyCopy(true)).toBe("Nothing loaded is in this band.");
  });
});

describe("attentionBand", () => {
  it("maps urgency onto the same bands the health badge shows", () => {
    const watch = item("w", "Northwind", "normal", "soon");
    const risk = item("r", "Acme", "critical", "late");
    const stable = item("s", "Contoso", "low", "quiet");
    expect(attentionBand(watch)).toBe("watch");
    expect(attentionBand(risk)).toBe("at_risk");
    expect(attentionBand(stable)).toBe("stable");
    expect(filterAttentionItems([watch, risk, stable], "at_risk").map((row) => row.id)).toEqual([
      "r",
    ]);
  });
});
