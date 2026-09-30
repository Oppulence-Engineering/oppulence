import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  accountGraphPrompt,
  graphCanvasEmptyState,
  graphLayoutLabel,
  graphQueryAnswer,
  graphQueryFilterLabel,
} from "@/components/features/revenue/relationship-graph/relationship-graph";

const source = fs.readFileSync(path.join(import.meta.dirname, "relationship-graph.tsx"), "utf8");

describe("RelationshipGraphWorkspace", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function RelationshipGraphWorkspace");
  });

  it("does not offer a filter reset when the graph has no nodes", () => {
    expect(graphCanvasEmptyState(0)).toEqual({
      message: "No companies are in this graph yet.",
      offerReset: false,
    });
    expect(graphCanvasEmptyState(4).offerReset).toBe(true);
    expect(source).toContain("Could not load the company graph.");
    expect(source).not.toContain("Could not load the relationship graph.");
    expect(source).toContain(">Company graph</h2>");
    expect(source).toContain("<Graph /> Diagram");
    expect(source).toContain("How many to show");
    expect(source).toContain("Hide unconnected");
    expect(source).toContain("Changed since you last looked");
    expect(source).toContain('placeholder="Ask about a company or a promise."');
    expect(source).not.toContain("Changed since review");
    expect(source).not.toContain("overdue commitments");
    expect(graphLayoutLabel("force")).toBe("Grouped");
    expect(graphLayoutLabel("radial")).toBe("Circle");
    expect(graphLayoutLabel("timeline")).toBe("By time");
    expect(source).toContain('graphLayoutLabel("force")');
    expect(source).not.toContain("Cluster layout");
    expect(source).not.toContain("Radial layout");
    expect(source).not.toContain("<Graph /> Canvas");
    expect(source).not.toContain("Hide isolated");
    expect(source).not.toContain('aria-label="Graph density"');
    expect(source).toContain("Companies, people, and the promises between them");
    expect(source).not.toContain("the evidence between them");
    expect(source).toContain("All companies");
    expect(source).toContain("walk this graph one node at a time");
    expect(source).not.toContain("Portfolio graph");
    expect(source).not.toContain("walk the relationship");
    expect(source).not.toContain("evidence refs");
    expect(source).not.toContain(">Relationship graph</h2>");
    expect(accountGraphPrompt(0)).toBe("Add a company before this graph can be built.");
    expect(accountGraphPrompt(2)).toBe("Choose an account to build its graph.");
    expect(graphQueryAnswer("0 relationships match lifecycle: renewal.", 0)).toBe(
      "No companies are in this graph yet.",
    );
    expect(graphQueryAnswer("1 relationship matches the query.", 2)).toBe("1 company matches the query.");
    expect(graphQueryAnswer("2 relationships match overdue commitments.", 2)).toBe(
      "2 companies match overdue commitments.",
    );
    expect(graphQueryFilterLabel("lifecycle: renewal")).toBe("Renewal");
    expect(graphQueryFilterLabel("health: at_risk")).toBe("At risk");
    expect(graphQueryFilterLabel("overdue commitments")).toBe("overdue commitments");
    expect(source).toContain("Building the company graph");
    expect(source).not.toContain("Building authorized graph");
    expect(source).toContain("Select a company or a person to see how it connects.");
    expect(source).not.toContain("or evidence item");
    expect(source).not.toContain("governed next actions");
    expect(source).toContain('relationship: "Company"');
    expect(source).not.toContain('relationship: "Account"');
  });

  it("names a saved view in the product dialog", () => {
    expect(source).not.toContain("window.prompt");
    expect(source).toContain("Name this graph view");
    expect(source).toContain('htmlFor="graph-view-name"');
    expect(source).toContain("Save view");
  });
});
