import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(import.meta.dirname, "relationships-view.tsx"), "utf8");

import { companyDirectoryTitle } from "@/components/features/revenue/relationships-view/relationships-view";

describe("RelationshipsView", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function RelationshipsView");
  });

  it("names a filtered company list and offers to clear it", () => {
    expect(companyDirectoryTitle({ query: "", health: "all", lifecycle: "all" })).toEqual({
      label: "All companies",
      filtered: false,
    });
    expect(companyDirectoryTitle({ query: "acme", health: "all", lifecycle: "all" })).toEqual({
      label: "Filtered",
      filtered: true,
    });
    expect(
      companyDirectoryTitle({ query: " ", health: "at_risk", lifecycle: "all" }).filtered,
    ).toBe(true);
  });

  it("does not offer company checkboxes that select nothing", () => {
    expect(source).not.toContain("Select all companies");
    expect(source).not.toContain("Select ${relationship.displayName}");
  });

  it("uses company words for create, update, and load failures", () => {
    expect(source).toContain('onNotice("Company added.")');
    expect(source).toContain('onNotice("Company updated.")');
    expect(source).toContain('errMessage(error, "Could not create the company.")');
    expect(source).toContain('errMessage(error, "Could not load this company.")');
    expect(source).toContain('errMessage(error, "Could not update this company.")');
    expect(source).toContain('errMessage(error, "Could not load companies.")');
    expect(source).toContain('errMessage(error, "Could not enrich companies and people.")');
    expect(source).not.toContain("Relationship added.");
    expect(source).not.toContain("Relationship state updated.");
    expect(source).not.toContain("Could not create the relationship.");
    expect(source).not.toContain("Could not load the relationship.");
    expect(source).not.toContain("Could not load relationship intelligence.");
    expect(source).not.toContain("Could not update this relationship.");
    expect(source).not.toContain("Could not enrich relationship profiles.");
    expect(source).toContain('aria-label="Show company graph"');
    expect(source).not.toContain('aria-label="Show relationship graph"');
    expect(source).toContain("Profile enrichment");
    expect(source).not.toContain("Relationship enrichment");
    expect(source).toContain("Delete shared conversation evidence for this company?");
    expect(source).not.toContain("for this relationship?");
    expect(source).toContain('companyAttention.length === 1 ? "company" : "companies"');
  });

  it("asks Oppulence from the company sheet instead of showing a dead badge", () => {
    expect(source).toContain("useAskOppulence");
    expect(source).toContain("askOppulence(askedCompany ? companyName(askedCompany) : undefined)");
    expect(source).not.toContain(">Ask Oppulence</Badge>");
  });
});
