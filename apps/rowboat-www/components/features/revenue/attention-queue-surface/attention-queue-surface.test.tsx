// @vitest-environment jsdom

import fs from "node:fs";
import path from "node:path";

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const decideRelationshipAttention = vi.hoisted(() => vi.fn());

vi.mock("@/lib/revenue/revenue", () => ({
  decideRelationshipAttention,
}));

import {
  AttentionQueueSurface,
  attentionBand,
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
