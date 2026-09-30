import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { graphCanvasEmptyState } from "@/components/features/revenue/relationship-graph/relationship-graph";

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
    expect(source).toContain("Companies, people, and the evidence between them");
    expect(source).toContain("All companies");
    expect(source).toContain("walk this graph one node at a time");
    expect(source).not.toContain("Portfolio graph");
    expect(source).not.toContain("walk the relationship");
    expect(source).not.toContain("evidence refs");
    expect(source).not.toContain(">Relationship graph</h2>");
    expect(source).not.toContain("Versioned state, evidence, and governed action");
  });
});
