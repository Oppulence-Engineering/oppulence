// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    expect(screen.getByText("No reply in 14 days")).toBeInTheDocument();
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

    expect(screen.getByText("Renewal in 30 days")).toBeInTheDocument();
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
