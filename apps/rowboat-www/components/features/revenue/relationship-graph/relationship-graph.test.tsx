import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  accountGraphPrompt,
  graphCanvasEmptyState,
  graphInspectorPrompt,
  graphActionNotice,
  graphAsOfLabel,
  graphChangedDetail,
  graphDetailLabel,
  graphExecutionLabel,
  graphNodeFieldLabel,
  graphPromiseDirection,
  graphNodeSummaryLabel,
  graphStateFromSearch,
  graphCountLabel,
  graphNodeCap,
  graphCanvasCapLabel,
  graphCanvasCapState,
  graphNextCompaniesLabel,
  graphEarlierEvidenceLabel,
  graphEvidencePage,
  graphListRemainderLabel,
  graphDetailNodes,
  graphEvidenceChipLabel,
  graphInspectorSummary,
  graphLayoutLabel,
  graphAccountChoice,
  graphSavedViewChoice,
  nextSavedViewsLabel,
  graphAskChanges,
  graphCanReset,
  graphFiltersCleared,
  graphQueryAnswer,
  graphQueryMissLabel,
  graphEdgeLabel,
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
    expect(graphNodeCap(0.72)).toBe(170);
    expect(graphNodeCap(1)).toBeNull();
    expect(graphCanvasCapLabel(170, 400)).toBe(
      "Showing 170 of 400 · raise how many to show for more",
    );
    expect(graphCanvasCapState(0, 170)).toEqual({ capped: false, shown: 0 });
    expect(graphCanvasCapState(4, 170)).toEqual({ capped: false, shown: 4 });
    expect(graphCanvasCapState(400, null)).toEqual({ capped: false, shown: 400 });
    expect(graphCanvasCapState(400, 170)).toEqual({ capped: true, shown: 170 });
    expect(source).toContain("graphNodeCap(viewState.density)");
    expect(source).toContain("graphCanvasCapLabel(visible.nodes.length, visible.matchedCount)");
    expect(source).toContain("visible.capped");
    expect(graphNextCompaniesLabel()).toBe("Show the next companies");
    expect(source).toContain("graphNextCompaniesLabel()");
    expect(source).toContain("onLoadMoreCompanies?.()");
    expect(source).toContain("Could not load the next companies.");
    expect(graphEarlierEvidenceLabel()).toBe("Show earlier evidence");
    expect(graphEvidencePage("relationship")).toBe(100);
    expect(graphEvidencePage("portfolio")).toBe(500);
    expect(source).toContain("graphEarlierEvidenceLabel()");
    expect(source).toContain("Could not load earlier evidence.");
    expect(source).toContain("raise how many to show for more");
    expect(source).not.toContain("raise density");
    expect(source).not.toContain("No nodes match");
    expect(source).toContain("Could not load the company graph.");
    expect(source).toContain("setActionError(message)");
    expect(source).toContain("Could not propose a follow-up.");
    expect(source).toContain("actionError={actionError}");
    expect(source).toContain('{actionError ? (');
    expect(source).toContain("graphQuery.error && !loadedGraph");
    expect(source).toContain("graphQuery.error && loadedGraph");
    expect(source).toContain('listRefreshFailureCopy("the company graph")');
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
    expect(graphActionNotice("evaluate")).toBe("Sending check finished.");
    expect(graphActionNotice("approve")).toBe("Action approved.");
    expect(graphActionNotice("reject")).toBe("Action rejected.");
    expect(source).toContain("onNotice(graphActionNotice(kind))");
    expect(source).not.toContain("`Action ${kind}d.`");
    expect(graphAsOfLabel("2026-09-30T13:00:00.000Z")).toMatch(/^As of /);
    expect(graphChangedDetail(["next_action", "health"])).toBe(
      "Changed since you last looked: Next action, Health.",
    );
    expect(graphChangedDetail(["evidence"])).toBe(
      "Changed since you last looked: Supporting evidence.",
    );
    expect(graphChangedDetail([])).toBe("Changed since you last looked.");
    expect(graphChangedDetail(["next_action"])).not.toContain("next_action");
    expect(graphDetailLabel("unknown")).toBe("Not known");
    expect(graphNodeFieldLabel("relationship", "health", "unknown")).toBe("Not known");
    expect(graphNodeFieldLabel("relationship", "lifecycle", "unknown")).toBe("Not known");
    expect(graphDetailLabel("historical_unknown")).toBe("Not recorded for this date");
    expect(graphDetailLabel("review_required")).toBe("Needs review");
    expect(graphDetailLabel("needs_attention")).toBe("Needs attention");
    expect(graphDetailLabel("active_customer")).toBe("Active customer");
    expect(graphDetailLabel("former_customer")).toBe("Former customer");
    expect(graphNodeFieldLabel("relationship", "lifecycle", "active_customer")).toBe(
      "Active customer",
    );
    expect(graphDetailLabel("stale")).toBe("Out of date");
    expect(graphDetailLabel("historical_unknown")).not.toContain("historical_unknown");
    expect(graphDetailLabel("open")).toBe("Open");
    expect(graphDetailLabel("Promise confirmed")).toBe("Promise confirmed");
    expect(graphNodeSummaryLabel({ kind: "evidence", status: "Promise confirmed" })).toBe(
      "Promise confirmed",
    );
    expect(graphNodeFieldLabel("source", "status", "live")).toBe("Active");
    expect(graphNodeFieldLabel("source", "status", "connected")).toBe("Active");
    expect(graphNodeFieldLabel("source", "status", "stale")).toBe("Out of date");
    expect(graphNodeFieldLabel("source", "status", "reconnect_required")).toBe("Reconnect required");
    expect(graphNodeFieldLabel("source", "status", "backfilling")).toBe("Syncing");
    expect(graphNodeSummaryLabel({ kind: "source", status: "stale" })).toBe("Out of date");
    expect(graphNodeFieldLabel("commitment", "status", "open")).toBe("Open");
    expect(graphNodeFieldLabel("commitment", "status", "at_risk")).toBe("At risk");
    expect(graphNodeFieldLabel("commitment", "status", "met")).toBe("Kept");
    expect(graphNodeFieldLabel("commitment", "status", "waived")).toBe("Waived");
    expect(graphNodeFieldLabel("commitment", "status", "missed")).toBe("Missed");
    expect(graphNodeFieldLabel("commitment", "status", "review")).toBe("Review");
    expect(graphPromiseDirection("promised_by_them")).toBe("They owe us");
    expect(graphPromiseDirection("promised_by_me")).toBe("We owe them");
    expect(graphPromiseDirection("mutual")).toBe("We both owe");
    expect(graphPromiseDirection("local-user")).toBeUndefined();
    expect(graphPromiseDirection("")).toBeUndefined();
    expect(source).toContain("graphPromiseDirection(node.metadata.direction)");
    expect(source).toContain("promiseDueDay(node.dueAt)");
    expect(source).not.toContain("node.dueAt ? new Date(node.dueAt).toLocaleDateString()");
    expect(graphNodeFieldLabel("action", "status", "open")).toBe("Held");
    expect(graphNodeFieldLabel("action", "status", "snoozed")).toBe("Snoozed");
    expect(graphNodeFieldLabel("action", "policy", "passed")).toBe("Cleared");
    expect(graphNodeFieldLabel("action", "policy", "pending")).toBe("Not checked");
    expect(graphNodeFieldLabel("action", "policy", "review_required")).toBe("Review required");
    expect(graphNodeFieldLabel("action", "approval", "pending")).toBe("Awaiting approval");
    expect(graphNodeFieldLabel("evidence", "freshness", "aging")).toBe("Getting old");
    expect(graphNodeFieldLabel("evidence", "freshness", "current")).toBe("Up to date");
    expect(graphNodeFieldLabel("evidence", "freshness", "stale")).toBe("Out of date");
    expect(graphExecutionLabel("pending")).toBeUndefined();
    expect(graphExecutionLabel("ambiguous")).toBe("Needs reconcile");
    expect(graphExecutionLabel("failed")).toBe("Failed");
    expect(
      graphNodeSummaryLabel({ kind: "action", status: "open", approvalStatus: "pending" }),
    ).toBe("Awaiting approval");
    expect(graphNodeSummaryLabel({ kind: "action", status: "open" })).toBe("Held");
    expect(
      graphNodeSummaryLabel({ kind: "source", status: "live", freshness: "current" }),
    ).toBe("Up to date");
    expect(
      graphNodeSummaryLabel({ kind: "source", status: "not_connected", freshness: "current" }),
    ).toBe("Not connected");
    expect(
      graphNodeSummaryLabel({
        kind: "evidence",
        status: "Promise confirmed",
        freshness: "current",
      }),
    ).toBe("Up to date");
    expect(
      graphNodeSummaryLabel({ kind: "commitment", status: "open" }),
    ).toBe("Open");
    expect(
      graphNodeSummaryLabel({
        kind: "relationship",
        health: "unknown",
        status: "active",
      }),
    ).toBe("Not known");
    expect(
      graphNodeSummaryLabel({
        kind: "relationship",
        health: "unknown",
        status: "archived",
      }),
    ).toBe("Archived");
    expect(
      graphNodeSummaryLabel({
        kind: "relationship",
        health: "needs_attention",
        status: "active",
      }),
    ).toBe("Needs attention");
    expect(
      graphNodeSummaryLabel({
        kind: "person",
        role: "decision_maker",
        status: "active",
      }),
    ).toBe("Decision maker");
    expect(source).toContain("graphNodeFieldLabel(node.kind, field, String(value))");
    expect(source).toContain("graphNodeSummaryLabel(node)");
    expect(source).not.toContain("graphDetailLabel(String(value))");
    expect(source).toContain("graphChangedDetail(node.changedDimensions)");
    expect(source).not.toContain("node.changedDimensions.join");
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
    expect(source).not.toContain("Changed since your last review");
    expect(source).not.toContain("overdue commitments");
    expect(source).not.toContain("stale evidence");
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
    expect(graphAccountChoice("")).toBe("Choose a company");
    expect(graphSavedViewChoice(undefined)).toBe("Saved views");
    expect(nextSavedViewsLabel()).toBe("Show the next saved views");
    expect(source).toContain("remoteSavedViews.length + extraSavedViews.length");
    expect(source).toContain('comboboxFilterName(\n                  "Company",');
    expect(source).toContain('comboboxFilterName(\n                  "Saved view",');
    expect(source).toContain('placeholder="Choose a company"');
    expect(source).toContain("One company");
    expect(source).not.toContain("Account graph");
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
    expect(graphFiltersCleared({
      ...fresh,
      scope: "relationship",
      relationshipId: "company-1",
      query: "quillhaven",
      hideIsolated: true,
      changedSinceReview: true,
      focusDepth: 2,
      selectedNodeId: "node-1",
      asOf: "2026-09-01T15:00:00.000Z",
      layout: "radial",
      density: 1,
    })).toEqual({
      ...fresh,
      scope: "relationship",
      relationshipId: "company-1",
      layout: "radial",
      density: 1,
      selectedNodeId: undefined,
      asOf: undefined,
    });
    expect(source).toContain("onReset={clearFilters}");
    expect(source).not.toContain("onReset={reset}");
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
    expect(accountGraphPrompt(2)).toBe("Choose a company to build its graph.");
    expect(graphQueryAnswer("0 relationships match lifecycle: renewal.", 0)).toBe(
      "No companies are in this graph yet.",
    );
    expect(graphQueryAnswer("1 relationship matches the query.", 2)).toBe("1 company matches the query.");
    expect(graphQueryAnswer("1 relationship matches text: dogfood.", 2)).toBe(
      "1 company matches Dogfood.",
    );
    expect(
      graphQueryAnswer(
        "0 relationships match nodes: note · approval: pending · sources: gmail, desktop_note.",
        1,
      ),
    ).toBe(
      "0 companies match Included: Note · Approval: Awaiting approval · Sources: Gmail, A note.",
    );
    expect(graphQueryAnswer("2 relationships match overdue promises.", 2)).toBe(
      "2 companies match overdue promises.",
    );
    expect(graphQueryAnswer("1 relationship matches out of date.", 1)).toBe(
      "1 company matches out of date.",
    );
    expect(graphQueryAnswer("1 relationship matches changed since you last looked.", 1)).toBe(
      "1 company matches changed since you last looked.",
    );
    expect(graphQueryAnswer("0 relationships match text: quillhaven.", 200, true)).toBe(
      graphQueryMissLabel(),
    );
    expect(graphQueryAnswer("0 relationships match text: quillhaven.", 200, false)).toBe(
      "0 companies match Quillhaven.",
    );
    expect(graphQueryFilterLabel("text: dogfood")).toBe("Dogfood");
    expect(graphQueryFilterLabel("lifecycle: renewal")).toBe("Renewal");
    expect(graphQueryFilterLabel("lifecycle: active_customer")).toBe("Active customer");
    expect(graphQueryFilterLabel("lifecycle: active_customer, former_customer")).toBe(
      "Active customer, Former customer",
    );
    expect(graphQueryFilterLabel("health: at_risk")).toBe("At risk");
    expect(graphQueryFilterLabel("health: needs_attention, critical")).toBe(
      "Needs attention, Critical",
    );
    expect(graphQueryFilterLabel("sources: gmail, desktop_note")).toBe("Sources: Gmail, A note");
    expect(graphQueryFilterLabel("sources: voice_note")).toBe("Sources: A voice note");
    expect(graphQueryFilterLabel("approval: pending")).toBe("Approval: Awaiting approval");
    expect(graphQueryFilterLabel("nodes: relationship, evidence")).toBe("Included: Company, Detail");
    expect(graphQueryFilterLabel("nodes: commitment")).toBe("Included: Promise");
    expect(graphQueryFilterLabel("edges: blocks")).toBe("Connections: Blocks");
    expect(graphQueryFilterLabel("edges: has_commitment")).toBe("Connections: Has promise");
    expect(graphQueryFilterLabel("edges: supersedes")).toBe("Connections: Replaces");
    expect(graphEdgeLabel("has commitment")).toBe("has promise");
    expect(graphEdgeLabel("has_commitment")).toBe("has promise");
    expect(graphEdgeLabel("supersedes")).toBe("replaces");
    expect(graphEdgeLabel("owns")).toBe("owns");
    expect(graphQueryFilterLabel("overdue promises")).toBe("overdue promises");
    expect(graphQueryFilterLabel("at risk")).toBe("at risk");
    expect(graphQueryFilterLabel("due soon")).toBe("due soon");
    expect(graphQueryFilterLabel("they owe us")).toBe("they owe us");
    expect(graphQueryFilterLabel("kept")).toBe("kept");
    expect(graphQueryAnswer("1 relationship matches kept.", 1)).toBe("1 company matches kept.");
    expect(graphQueryFilterLabel("health: unknown")).toBe("Not known");
    expect(graphQueryAnswer("1 relationship matches health: unknown.", 1)).toBe(
      "1 company matches Not known.",
    );
    expect(graphQueryAnswer("1 relationship matches approval: pending.", 1)).toBe(
      "1 company matches Approval: Awaiting approval.",
    );
    expect(graphQueryFilterLabel("up to date")).toBe("up to date");
    expect(graphQueryAnswer("1 relationship matches up to date.", 2)).toBe(
      "1 company matches up to date.",
    );
    expect(graphQueryFilterLabel("getting old")).toBe("getting old");
    expect(graphQueryAnswer("1 relationship matches getting old.", 2)).toBe(
      "1 company matches getting old.",
    );
    expect(graphQueryFilterLabel("meeting follow-up")).toBe("meeting follow-up");
    expect(graphQueryAnswer("1 relationship matches meeting follow-up.", 2)).toBe(
      "1 company matches meeting follow-up.",
    );
    expect(graphQueryAnswer("2 relationships match follow-up.", 2)).toBe(
      "2 companies match follow-up.",
    );
    expect(graphQueryAnswer("1 relationship matches customer risk.", 2)).toBe(
      "1 company matches customer risk.",
    );
    expect(graphQueryAnswer("1 relationship matches promise follow-up.", 2)).toBe(
      "1 company matches promise follow-up.",
    );
    expect(graphQueryAnswer("1 relationship matches calendar hold.", 3)).toBe(
      "1 company matches calendar hold.",
    );
    expect(graphQueryAnswer("1 relationship matches crm update.", 3)).toBe(
      "1 company matches crm update.",
    );
    expect(graphQueryAnswer("1 relationship matches meeting recap.", 3)).toBe(
      "1 company matches meeting recap.",
    );
    expect(graphQueryAnswer("1 relationship matches nodes: commitment.", 2)).toBe(
      "1 company matches Included: Promise.",
    );
    expect(graphQueryAnswer("1 relationship matches nodes: evidence.", 2)).toBe(
      "1 company matches Included: Detail.",
    );
    expect(graphQueryFilterLabel("open")).toBe("open");
    expect(graphQueryAnswer("1 relationship matches open.", 2)).toBe("1 company matches open.");
    expect(graphQueryAnswer("1 relationship matches they owe us.", 1)).toBe(
      "1 company matches they owe us.",
    );
    expect(graphQueryAnswer("1 relationship matches due soon.", 1)).toBe(
      "1 company matches due soon.",
    );
    expect(graphQueryAnswer("1 relationship matches at risk.", 1)).toBe(
      "1 company matches at risk.",
    );
    expect(graphQueryFilterLabel("out of date")).toBe("out of date");
    expect(graphQueryFilterLabel("changed since you last looked")).toBe(
      "changed since you last looked",
    );
    expect(graphQueryFilterLabel("not connected")).toBe("not connected");
    expect(graphQueryAnswer("1 relationship matches not connected.", 2)).toBe(
      "1 company matches not connected.",
    );
    expect(graphQueryFilterLabel("hide unconnected")).toBe("hide unconnected");
    expect(graphQueryAnswer("1 relationship matches hide unconnected.", 2)).toBe(
      "1 company matches hide unconnected.",
    );
    expect(graphQueryFilterLabel("sources: desktop_note")).not.toContain("desktop_note");
    expect(graphQueryFilterLabel("approval: pending")).not.toContain("pending");
    expect(source).toContain("Building the company graph");
    expect(source).not.toContain("Building authorized graph");
    expect(graphInspectorPrompt(0)).toEqual({
      title: "Nothing to inspect",
      body: "No companies are in this graph yet.",
    });
    expect(graphInspectorPrompt(2).body).toBe(
      "Select a company or a person to see how it connects.",
    );
    expect(graphInspectorPrompt(4, 0)).toEqual({
      title: "Nothing to inspect",
      body: "Nothing in this view can be selected.",
    });
    expect(source).toContain("graphInspectorPrompt(graph.nodes.length, visibleCount)");
    expect(source).toContain("Select a company or a person to see how it connects.");
    expect(source).not.toContain("or evidence item");
    expect(source).not.toContain("evidence item");
    expect(source).toContain(
      'graphCountLabel(queryResult.evidenceRefs.length, "detail", "details")',
    );
    expect(source).not.toContain("governed next actions");
    expect(source).toContain('relationship: "Company"');
    expect(source).toContain('commitment: "Promise"');
    expect(source).not.toContain('commitment: "Commitment"');
    expect(source).toContain("graphEdgeLabel(");
    expect(source).not.toContain("{edge.label}");
    expect(source).not.toContain("{props.data?.graphEdge.label}");
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
    expect(graphListRemainderLabel(1, "connection", "connections")).toBe(
      "Show the other 1 connection",
    );
    expect(graphListRemainderLabel(3, "detail", "details")).toBe("Show the other 3 details");
    expect(graphEvidenceChipLabel({ label: "  The harbor sentence.  ", source: "gmail" })).toBe(
      "The harbor sentence.",
    );
    expect(graphEvidenceChipLabel({ label: "   ", source: "gmail" })).toBe("Gmail");
    expect(graphEvidenceChipLabel({ label: "", source: "" })).toBe("Detail");
    const confirmation = {
      id: "evidence:obs",
      kind: "evidence",
      evidenceRefs: ["obs"],
      label: "Promise confirmed",
    };
    expect(graphDetailNodes(confirmation, [confirmation])).toEqual([]);
    expect(
      graphDetailNodes(
        { id: "commitment:promise", evidenceRefs: ["quote"] },
        [{ id: "evidence:quote", kind: "evidence", evidenceRefs: ["quote"], label: "The quote" }],
      ).map((item) => item.id),
    ).toEqual(["evidence:quote"]);
    expect(source).toContain("graphDetailNodes(node, graph.nodes)");
    expect(graphInspectorSummary({ label: "Send the quay echo", summary: "Send the quay echo" })).toBeUndefined();
    expect(graphInspectorSummary({ label: "Send the quay echo", summary: "  Send the quay echo  " })).toBeUndefined();
    expect(graphInspectorSummary({ label: "Promise confirmed", summary: "Send the quay echo" })).toBe(
      "Send the quay echo",
    );
    expect(graphInspectorSummary({ label: "Send the quay echo", summary: "   " })).toBeUndefined();
    expect(source).toContain("graphInspectorSummary(node)");
    expect(source).toContain("{inspectorSummary}");
    expect(source).toContain("graphEvidenceChipLabel(evidence)");
    expect(source).not.toContain('{evidence.source || "detail"}');
    expect(source).toContain('graphCountLabel(graphNodes.length, "item", "items")');
    expect(source).toContain(
      'graphListRemainderLabel(hiddenConnections, "connection", "connections")',
    );
    expect(source).toContain('graphListRemainderLabel(hiddenEvidence, "detail", "details")');
    expect(source).not.toContain("connected.slice(0, 12)");
    expect(source).not.toContain("evidenceNodes.slice(0, 6)");
    expect(source).not.toContain("directed links");
  });

  it("names a saved view in the product dialog", () => {
    expect(source).toContain('onNotice("Link copied.")');
    expect(source).toContain("Follow-up proposed. It still needs your approval.");
    expect(source).toContain("Sending check finished.");
    expect(source).toContain("Saved views unavailable · Retry");
    expect(source).toContain("savedViewsQuery.isError && savedViewResources.length === 0");
    expect(source).toContain("legacy: readLegacyGraphViews(window.localStorage)");
    expect(source).toContain("!migrationSettled || migrationPending");
    expect(source).not.toContain("policy evaluation");
    expect(source).not.toContain("Graph deep link");
    expect(source).not.toContain("Views offline");
    expect(source).not.toContain("window.prompt");
    expect(source).toContain("Name this graph view");
    expect(source).toContain('errMessage(error, "Could not save this graph view.")');
    expect(source).toContain("setViewError(message)");
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
    expect(source).toContain("withoutPersonDirectoryRecords(nodes, edges)");
  });

  it("drops graph parameters when the company list is the current view", () => {
    expect(
      searchWithoutCompanyGraph(
        "?tab=relationships&graph=1&graphScope=portfolio&graphLayout=force&graphDensity=0.72&graphQuery=overdue",
      ),
    ).toBe("tab=relationships");
    expect(searchWithoutCompanyGraph("?tab=relationships")).toBe("tab=relationships");
    expect(source).toContain("searchWithoutCompanyGraph(url.search)");
    expect(source).toContain("graphStateFromSearch(window.location.search)");
  });

  it("keeps an as-of moment when the graph link omits the other settings", () => {
    expect(
      graphStateFromSearch("?tab=relationships&graph=1&graphAsOf=2026-10-01T08:00:00.000Z"),
    ).toMatchObject({
      scope: "portfolio",
      asOf: "2026-10-01T08:00:00.000Z",
    });
    expect(
      graphStateFromSearch("?graph=1&graphScope=portfolio&graphAsOf=not-a-date").asOf,
    ).toBeUndefined();
    expect(graphStateFromSearch("?tab=relationships").asOf).toBeUndefined();
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
