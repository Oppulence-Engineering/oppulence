import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  accountGraphPrompt,
  graphCanvasEmptyState,
  graphInspectorPrompt,
  graphAsOfLabel,
  graphCountLabel,
  graphLayoutLabel,
  graphAccountChoice,
  graphSavedViewChoice,
  graphAskChanges,
  graphCanReset,
  graphQueryAnswer,
  graphQueryFilterLabel,
  searchWithoutCompanyGraph,
  withoutPersonDirectoryRecords,
} from "@/components/features/revenue/relationship-graph/relationship-graph";
import type {
  RelationshipGraphEdge,
  RelationshipGraphNode,
} from "@/lib/revenue/types";

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
    expect(graphCanvasEmptyState(4)).toEqual({
      message: "Nothing matches this view.",
      offerReset: true,
    });
    expect(source).toContain("raise how many to show for more");
    expect(source).not.toContain("raise density");
    expect(source).not.toContain("No nodes match");
    expect(source).toContain("Could not load the company graph.");
    expect(source).toContain("friendlyRevenueError(errMessage(graphQuery.error");
    expect(source).not.toContain("onError(errMessage(graphQuery.error");
    expect(source).not.toContain("Could not load the relationship graph.");
    expect(source).toContain(">Company graph</h2>");
    expect(source).toContain("<Graph /> Diagram");
    expect(source).toContain('mode === "table" ? (');
    expect(source).toContain("empty={graphCanvasEmptyState(graph.nodes.length)}");
    expect(source).toContain("How many to show");
    expect(source).toContain("Hide unconnected");
    expect(source).toContain("Changed since you last looked");
    expect(source).toContain('placeholder="Ask about a company or a promise."');
    expect(source).toContain('placeholder="As of a date"');
    expect(source).toContain('aria-label="View the graph as of a date"');
    expect(source).not.toContain("Historical view");
    expect(source).not.toContain("Historical as of");
    expect(source).toContain("graphAsOfLabel(viewState.asOf)");
    expect(source).not.toContain("graph?.historical");
    expect(graphAsOfLabel("not-a-date")).toBe("As of not-a-date");
    expect(graphAsOfLabel("2026-09-30T13:00:00.000Z")).toMatch(/^As of /);
    expect(source).toContain('aria-label="Ask this graph"');
    expect(source).not.toContain("Ask graph");
    expect(source).toContain("disabled={\n              !graphAskChanges(queryDraft,");
    expect(graphAskChanges("  ", { query: "", focusDepth: 0 })).toBe(false);
    expect(graphAskChanges("overdue promises", { query: "", focusDepth: 0 })).toBe(true);
    expect(graphAskChanges("", { query: "overdue promises", focusDepth: 0 })).toBe(true);
    expect(graphAskChanges("overdue promises", { query: "overdue promises", focusDepth: 0 })).toBe(
      false,
    );
    expect(
      graphAskChanges("", { query: "", focusDepth: 0, selectedNodeId: "company-1" }),
    ).toBe(true);
    expect(graphAskChanges("", { query: "", focusDepth: 1 })).toBe(true);
    expect(source).not.toContain("Changed since review");
    expect(source).not.toContain("overdue commitments");
    expect(graphLayoutLabel("force")).toBe("Grouped");
    expect(graphLayoutLabel("radial")).toBe("Circle");
    expect(graphLayoutLabel("timeline")).toBe("By time");
    expect(source).toContain('graphLayoutLabel("force")');
    expect(source).toContain(
      'aria-label={comboboxFilterName("Layout", graphLayoutLabel(viewState.layout))}',
    );
    expect(source).toContain('{mode === "canvas" ? (');
    expect(source).toContain("{graphEnabled ? (");
    expect(graphAccountChoice("  Harbor  ")).toBe("Harbor");
    expect(graphAccountChoice("")).toBe("Choose an account");
    expect(graphSavedViewChoice(undefined)).toBe("Saved views");
    expect(source).toContain('comboboxFilterName(\n                  "Account",');
    expect(source).toContain('comboboxFilterName(\n                  "Saved view",');
    expect(source).toContain('placeholder="Choose an account"');
    expect(source).not.toContain("Cluster layout");
    expect(source).not.toContain("Radial layout");
    expect(source).not.toContain("<Graph /> Canvas");
    expect(source).not.toContain("Hide isolated");
    expect(source).not.toContain('aria-label="Graph density"');
    expect(source).toContain("Companies, people, and the promises between them");
    expect(source).not.toContain("the evidence between them");
    expect(source).toContain("All companies");
    expect(source).not.toContain(
      'className="capitalize data-[state=on]:bg-primary data-[state=on]:text-background"',
    );
    const fresh = {
      scope: "portfolio" as const,
      query: "",
      layout: "force" as const,
      density: 0.72,
      hideIsolated: false,
      focusDepth: 0 as const,
      changedSinceReview: false,
    };
    expect(graphCanReset(fresh, "")).toBe(false);
    expect(graphCanReset({ ...fresh, layout: "radial" }, "")).toBe(true);
    expect(graphCanReset(fresh, "overdue promises")).toBe(true);
    expect(graphCanReset(fresh, "", "saved-view")).toBe(true);
    expect(source).toContain("disabled={!graphCanReset(viewState, queryDraft, activeSavedViewId)}");
    expect(source).toContain("setActiveSavedViewId(undefined);");
    expect(source).toContain("How far to look");
    expect(source).toContain("Nearby");
    expect(source).toContain("Wider");
    expect(source).toContain("one step at a time");
    expect(source).not.toContain("Explore this node");
    expect(source).not.toContain("one node at a time");
    expect(source).not.toContain("hop");
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
    expect(graphQueryAnswer("1 relationship matches text: dogfood.", 2)).toBe(
      "1 company matches dogfood.",
    );
    expect(graphQueryAnswer("2 relationships match overdue commitments.", 2)).toBe(
      "2 companies match overdue commitments.",
    );
    expect(graphQueryFilterLabel("text: dogfood")).toBe("Dogfood");
    expect(graphQueryFilterLabel("lifecycle: renewal")).toBe("Renewal");
    expect(graphQueryFilterLabel("health: at_risk")).toBe("At risk");
    expect(graphQueryFilterLabel("overdue commitments")).toBe("overdue commitments");
    expect(source).toContain("Building the company graph");
    expect(source).not.toContain("Building authorized graph");
    expect(graphInspectorPrompt(0)).toEqual({
      title: "Nothing to inspect",
      body: "No companies are in this graph yet.",
    });
    expect(graphInspectorPrompt(2).body).toBe(
      "Select a company or a person to see how it connects.",
    );
    expect(source).toContain("graphInspectorPrompt(graph.nodes.length)");
    expect(source).toContain("Select a company or a person to see how it connects.");
    expect(source).not.toContain("or evidence item");
    expect(source).not.toContain("evidence item");
    expect(source).toContain(
      'graphCountLabel(queryResult.evidenceRefs.length, "detail", "details")',
    );
    expect(source).not.toContain("governed next actions");
    expect(source).toContain('relationship: "Company"');
    expect(source).not.toContain('relationship: "Account"');
    expect(source).toContain('evidence: "Detail"');
    expect(source).toContain(">Name</TableHead>");
    expect(source).toContain(">Details</TableHead>");
    expect(source).not.toContain(">Node</TableHead>");
    expect(source).not.toContain(">Evidence</TableHead>");
    expect(source).toContain("Details kept on this record.");
    expect(source).not.toContain("Evidence references retained");
    expect(graphCountLabel(1, "item", "items")).toBe("1 item");
    expect(graphCountLabel(0, "connection", "connections")).toBe("0 connections");
    expect(source).toContain('graphCountLabel(graphNodes.length, "item", "items")');
    expect(source).not.toContain("directed links");
  });

  it("names a saved view in the product dialog", () => {
    expect(source).toContain('onNotice("Link copied.")');
    expect(source).toContain("Follow-up proposed. It still needs your approval.");
    expect(source).toContain("Sending check finished.");
    expect(source).toContain("Saved views unavailable · Retry");
    expect(source).not.toContain("policy evaluation");
    expect(source).not.toContain("Graph deep link");
    expect(source).not.toContain("Views offline");
    expect(source).not.toContain("window.prompt");
    expect(source).toContain("Name this graph view");
    expect(source).toContain('htmlFor="graph-view-name"');
    expect(source).toContain("Save view");
  });

  it("hides a person directory record from the company graph", () => {
    const company = graphNode({
      id: "relationship:company",
      kind: "relationship",
      label: "Acme",
      relationshipId: "company",
      relationshipIds: ["company"],
      metadata: { kind: "company" },
    });
    const personRecord = graphNode({
      id: "relationship:person-record",
      kind: "relationship",
      label: "Ada Lovelace",
      relationshipId: "person-record",
      relationshipIds: ["person-record"],
      metadata: { kind: "person" },
    });
    const directoryPerson = graphNode({
      id: "person:ada",
      kind: "person",
      label: "Ada Lovelace",
      relationshipId: "person-record",
      relationshipIds: ["person-record"],
    });
    const sharedPerson = graphNode({
      id: "person:shared",
      kind: "person",
      label: "Grace Hopper",
      relationshipId: "person-record",
      relationshipIds: ["person-record", "company"],
    });
    const evidence = graphNode({
      id: "evidence:added",
      kind: "evidence",
      label: "Ada Lovelace added by the user",
      relationshipId: "person-record",
      relationshipIds: ["person-record"],
    });
    const userSource = graphNode({
      id: "source:user",
      kind: "source",
      label: "user",
      relationshipIds: [],
    });
    const untouched = graphNode({
      id: "note:loose",
      kind: "note",
      label: "Loose note",
      relationshipIds: [],
    });
    const unlabeled = graphNode({
      id: "relationship:legacy",
      kind: "relationship",
      label: "Legacy Co",
      relationshipId: "legacy",
      relationshipIds: ["legacy"],
    });
    const edges: RelationshipGraphEdge[] = [
      graphEdge("e1", "person:ada", "relationship:person-record"),
      graphEdge("e2", "evidence:added", "relationship:person-record"),
      graphEdge("e3", "evidence:added", "source:user"),
      graphEdge("e4", "person:shared", "relationship:person-record"),
      graphEdge("e5", "person:shared", "relationship:company"),
    ];
    const filtered = withoutPersonDirectoryRecords(
      [company, personRecord, directoryPerson, sharedPerson, evidence, userSource, untouched, unlabeled],
      edges,
    );

    expect(filtered.nodes.map((node) => node.id).sort()).toEqual([
      "note:loose",
      "person:shared",
      "relationship:company",
      "relationship:legacy",
    ]);
    expect(filtered.edges.map((edge) => edge.id)).toEqual(["e5"]);
    expect(source).toContain(
      "withoutPersonDirectoryRecords(loadedGraph.nodes, loadedGraph.edges)",
    );
  });

  it("drops graph parameters when the company list is the current view", () => {
    expect(
      searchWithoutCompanyGraph(
        "?tab=relationships&graph=1&graphScope=portfolio&graphLayout=force&graphDensity=0.72&graphQuery=overdue",
      ),
    ).toBe("tab=relationships");
    expect(searchWithoutCompanyGraph("?tab=relationships")).toBe("tab=relationships");
    expect(source).toContain("searchWithoutCompanyGraph(url.search)");
  });
});

function graphNode(
  overrides: Pick<RelationshipGraphNode, "id" | "kind" | "label"> &
    Partial<RelationshipGraphNode>,
): RelationshipGraphNode {
  return {
    relationshipIds: [],
    changedSinceReview: false,
    changedDimensions: [],
    evidenceRefs: [],
    metadata: {},
    ...overrides,
  };
}

function graphEdge(id: string, from: string, to: string): RelationshipGraphEdge {
  return {
    id,
    source: from,
    target: to,
    kind: "supports",
    label: "supports",
    directed: true,
    evidenceRefs: [],
  };
}
