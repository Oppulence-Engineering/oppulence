import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  AUTHORITY_LABELS,
  COMPLETENESS_LABELS,
  MISSION_CONTROL_QUESTIONS,
  RELATIONSHIP_CLIENT_CAPABILITIES,
  RELATIONSHIP_GRAPH_CONTRACT_VERSION,
  buildImportedTranscriptObservation,
  completenessTone,
  createRelationshipGraphSavedView,
  parseRelationshipGraphQuery,
  queryRelationshipGraph,
  relationshipGraphNeighborhood,
  relationshipLabel,
} from "./index.js";

test("web and desktop share the four trust questions in one stable order", () => {
  assert.deepEqual(
    MISSION_CONTROL_QUESTIONS.map(({ key }) => key),
    ["state", "change", "evidence", "action"],
  );
  assert.equal(new Set(MISSION_CONTROL_QUESTIONS.map(({ key }) => key)).size, 4);
});

test("completeness never renders an unsafe state with the safe tone", () => {
  assert.equal(completenessTone("complete"), "safe");
  for (const status of ["partial", "stale", "rebuilding", "ambiguous", "disconnected"]) {
    assert.notEqual(completenessTone(status), "safe", status);
    assert.ok(COMPLETENESS_LABELS[status], status);
  }
});

test("authority and dimension labels remain human-readable", () => {
  assert.equal(AUTHORITY_LABELS.user_correction, "Confirmed by a person");
  assert.equal(AUTHORITY_LABELS.ai_inference, "AI inference");
  assert.equal(relationshipLabel("next_action"), "Next Action");
  assert.equal(relationshipLabel(), "Unknown");
});

test("the cross-client capability contract has no duplicates", () => {
  assert.equal(
    new Set(RELATIONSHIP_CLIENT_CAPABILITIES).size,
    RELATIONSHIP_CLIENT_CAPABILITIES.length,
  );
  assert.ok(RELATIONSHIP_CLIENT_CAPABILITIES.includes("assertion-retraction"));
  assert.ok(RELATIONSHIP_CLIENT_CAPABILITIES.includes("action-audit"));
  assert.ok(RELATIONSHIP_CLIENT_CAPABILITIES.includes("transcript-publication"));
  assert.ok(RELATIONSHIP_CLIENT_CAPABILITIES.includes("relationship-graph"));
  assert.ok(RELATIONSHIP_CLIENT_CAPABILITIES.includes("graph-governed-actions"));
});

test("natural-language graph queries stay deterministic and evidence-linked", () => {
  const graph = {
    contractVersion: RELATIONSHIP_GRAPH_CONTRACT_VERSION,
    asOf: "2026-08-01T12:00:00.000Z",
    nodes: [
      {
        id: "relationship:r-1",
        kind: "relationship",
        label: "Northstar Labs",
        lifecycle: "renewal",
        health: "needs_attention",
        changedSinceReview: true,
      },
      {
        id: "commitment:c-1",
        kind: "commitment",
        label: "Security review",
        relationshipId: "r-1",
        status: "open",
        dueAt: "2026-07-15T12:00:00.000Z",
        evidenceRefs: ["observation:o-1"],
      },
      {
        id: "commitment:c-2",
        kind: "commitment",
        label: "Renewal approval",
        relationshipId: "r-1",
        status: "open",
      },
      {
        id: "relationship:r-2",
        kind: "relationship",
        label: "Atlas Retail",
        lifecycle: "onboarding",
        health: "healthy",
      },
    ],
    edges: [
      {
        id: "edge:r-1:c-1",
        source: "relationship:r-1",
        target: "commitment:c-1",
        kind: "has_commitment",
      },
      {
        id: "edge:c-2:c-1",
        source: "commitment:c-2",
        target: "commitment:c-1",
        kind: "requires",
        evidenceRefs: ["observation:o-2"],
      },
    ],
  };
  const parsed = parseRelationshipGraphQuery("Which renewals depend on overdue commitments?");
  assert.deepEqual(parsed.filters.lifecycle, ["renewal"]);
  assert.equal(parsed.filters.overdue, true);
  assert.ok(parsed.applied.includes("overdue promises"));
  assert.equal(parsed.applied.includes("overdue commitments"), false);
  assert.deepEqual(parsed.filters.edgeKinds, ["requires"]);
  const result = queryRelationshipGraph(graph, parsed.raw);
  assert.deepEqual(result.relationshipIds, ["r-1"]);
  assert.ok(result.matchedNodeIds.includes("relationship:r-1"));
  assert.ok(result.evidenceRefs.includes("observation:o-1"));
  assert.ok(result.evidenceRefs.includes("observation:o-2"));
  assert.deepEqual(result.matchedEdgeIds, ["edge:c-2:c-1"]);
  assert.match(result.answer, /1 relationship matches/);

  const withoutDependency = queryRelationshipGraph(
    { ...graph, edges: graph.edges.filter((edge) => edge.kind !== "requires") },
    parsed.raw,
  );
  assert.deepEqual(withoutDependency.relationshipIds, []);
  assert.deepEqual(withoutDependency.matchedNodeIds, []);
  assert.deepEqual(withoutDependency.visibleNodeIds, []);
  assert.match(withoutDependency.answer, /0 relationships match/);
});

test("a kept promise is not still overdue", () => {
  const asOf = "2026-10-03T12:00:00.000Z";
  const kept = {
    asOf,
    nodes: [
      { id: "relationship:kept", kind: "relationship", label: "Quay Kept" },
      {
        id: "commitment:kept",
        kind: "commitment",
        label: "Send the quay kept",
        relationshipId: "kept",
        status: "met",
        dueAt: "2026-10-01T15:00:00.000Z",
      },
    ],
    edges: [],
  };
  const keptResult = queryRelationshipGraph(kept, "overdue");
  assert.deepEqual(keptResult.relationshipIds, []);
  assert.equal(keptResult.answer, "0 relationships match overdue promises.");

  const late = queryRelationshipGraph(
    {
      asOf,
      nodes: [
        ...kept.nodes,
        { id: "relationship:late", kind: "relationship", label: "Quay Late" },
        {
          id: "commitment:late",
          kind: "commitment",
          label: "Send the quay late",
          relationshipId: "late",
          status: "at_risk",
          dueAt: "2026-10-01T15:00:00.000Z",
        },
      ],
      edges: [],
    },
    "overdue",
  );
  assert.deepEqual(late.relationshipIds, ["late"]);
});

test("asking past due finds a late promise", () => {
  const asOf = "2026-10-03T12:00:00.000Z";
  const parsed = parseRelationshipGraphQuery("past due");
  assert.equal(parsed.filters.overdue, true);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.ok(parsed.applied.includes("overdue promises"));
  assert.equal(parsed.applied.some((item) => item.startsWith("text:")), false);

  const hyphenated = parseRelationshipGraphQuery("past-due");
  assert.equal(hyphenated.filters.overdue, true);
  assert.deepEqual(hyphenated.filters.freeText, []);

  const late = queryRelationshipGraph(
    {
      asOf,
      nodes: [
        { id: "relationship:late", kind: "relationship", label: "Quay Late" },
        {
          id: "commitment:late",
          kind: "commitment",
          label: "Send the quay late",
          relationshipId: "late",
          status: "open",
          dueAt: "2026-09-01T15:00:00.000Z",
        },
      ],
      edges: [
        {
          id: "edge:late",
          source: "relationship:late",
          target: "commitment:late",
          kind: "has_commitment",
        },
      ],
    },
    "past due",
  );
  assert.deepEqual(late.relationshipIds, ["late"]);
  assert.equal(late.answer, "1 relationship matches overdue promises.");
});

test("asking at risk finds the promise marked at risk", () => {
  const asOf = "2026-10-03T12:00:00.000Z";
  const parsed = parseRelationshipGraphQuery("at-risk");
  assert.equal(parsed.filters.atRisk, true);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.filters.health, []);

  const graph = {
    asOf,
    nodes: [
      {
        id: "relationship:risk",
        kind: "relationship",
        label: "Quay Risk",
        health: "unknown",
      },
      {
        id: "commitment:risk",
        kind: "commitment",
        label: "Send the quay risk",
        relationshipId: "risk",
        status: "at_risk",
        dueAt: "2026-10-04T15:00:00.000Z",
      },
      {
        id: "relationship:attention",
        kind: "relationship",
        label: "Quay Attention",
        health: "needs_attention",
      },
    ],
    edges: [
      {
        id: "edge:risk",
        source: "relationship:risk",
        target: "commitment:risk",
        kind: "has_commitment",
      },
    ],
  };
  const result = queryRelationshipGraph(graph, "at risk");
  assert.deepEqual(result.relationshipIds, ["risk"]);
  assert.equal(result.visibleNodeIds.includes("relationship:attention"), false);
  assert.equal(result.answer, "1 relationship matches at risk.");

  const attention = queryRelationshipGraph(graph, "needs attention");
  assert.deepEqual(attention.relationshipIds, ["attention"]);
});

test("asking due soon keeps a promise that is not past due yet", () => {
  const asOf = "2026-10-03T12:00:00.000Z";
  const parsed = parseRelationshipGraphQuery("due within 72h");
  assert.equal(parsed.filters.dueSoon, true);
  assert.equal(parsed.filters.atRisk, false);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.ok(parsed.applied.includes("due soon"));

  const soon = parseRelationshipGraphQuery("due soon");
  assert.equal(soon.filters.dueSoon, true);
  assert.deepEqual(soon.filters.freeText, []);

  const graph = {
    asOf,
    nodes: [
      { id: "relationship:soon", kind: "relationship", label: "Quay Soon" },
      {
        id: "commitment:soon",
        kind: "commitment",
        label: "Send the quay soon",
        relationshipId: "soon",
        status: "at_risk",
        dueAt: "2026-10-04T15:00:00.000Z",
      },
      { id: "relationship:late", kind: "relationship", label: "Quay Late" },
      {
        id: "commitment:late",
        kind: "commitment",
        label: "Send the quay late",
        relationshipId: "late",
        status: "at_risk",
        dueAt: "2026-09-01T15:00:00.000Z",
      },
    ],
    edges: [],
  };
  const result = queryRelationshipGraph(graph, "due soon");
  assert.deepEqual(result.relationshipIds, ["soon"]);
  assert.equal(result.answer, "1 relationship matches due soon.");
});

test("asking they owe us keeps that side of the promise", () => {
  const parsed = parseRelationshipGraphQuery("what they owe us");
  assert.equal(parsed.filters.direction, "promised_by_them");
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["they owe us"]);

  const ours = parseRelationshipGraphQuery("what we owe");
  assert.equal(ours.filters.direction, "promised_by_me");
  assert.deepEqual(ours.filters.freeText, []);
  assert.ok(ours.applied.includes("we owe them"));

  const shared = parseRelationshipGraphQuery("we both owe");
  assert.equal(shared.filters.direction, "mutual");
  assert.deepEqual(shared.filters.freeText, []);

  const graph = {
    nodes: [
      { id: "relationship:theirs", kind: "relationship", label: "Quay Owe" },
      {
        id: "commitment:theirs",
        kind: "commitment",
        label: "Send the quay owe",
        relationshipId: "theirs",
        status: "open",
        metadata: { direction: "promised_by_them" },
      },
      { id: "relationship:ours", kind: "relationship", label: "Quay Ours" },
      {
        id: "commitment:ours",
        kind: "commitment",
        label: "Send the quay ours",
        relationshipId: "ours",
        status: "open",
        metadata: { direction: "promised_by_me" },
      },
    ],
    edges: [],
  };
  const result = queryRelationshipGraph(graph, "they owe us");
  assert.deepEqual(result.relationshipIds, ["theirs"]);
  assert.equal(result.visibleNodeIds.includes("relationship:ours"), false);
  assert.equal(result.answer, "1 relationship matches they owe us.");
});

test("an up to date detail is not out of date", () => {
  const asOf = "2026-10-03T12:00:00.000Z";
  const current = {
    asOf,
    nodes: [
      { id: "relationship:fresh", kind: "relationship", label: "Quay Fresh" },
      {
        id: "evidence:fresh",
        kind: "evidence",
        label: "The quay note",
        relationshipId: "fresh",
        freshness: "current",
      },
    ],
    edges: [],
  };
  const parsed = parseRelationshipGraphQuery("outdated");
  assert.equal(parsed.filters.stale, true);
  assert.ok(parsed.applied.includes("out of date"));
  assert.equal(parsed.applied.includes("stale evidence"), false);
  const freshResult = queryRelationshipGraph(current, "outdated");
  assert.deepEqual(freshResult.relationshipIds, []);
  assert.equal(freshResult.answer, "0 relationships match out of date.");

  const stale = queryRelationshipGraph(
    {
      asOf,
      nodes: [
        ...current.nodes,
        { id: "relationship:old", kind: "relationship", label: "Quay Dated" },
        {
          id: "source:old",
          kind: "source",
          label: "Meeting",
          relationshipId: "old",
          freshness: "stale",
        },
      ],
      edges: [],
    },
    "stale",
  );
  assert.deepEqual(stale.relationshipIds, ["old"]);
  assert.equal(stale.answer, "1 relationship matches out of date.");
});

test("the graph's own change and freshness words are the filter, not a text search", () => {
  const looked = parseRelationshipGraphQuery("changed since you last looked");
  assert.equal(looked.filters.changed, true);
  assert.deepEqual(looked.filters.freeText, []);
  assert.deepEqual(looked.applied, ["changed since you last looked"]);

  const review = parseRelationshipGraphQuery("since last review");
  assert.equal(review.filters.changed, true);
  assert.deepEqual(review.filters.freeText, []);

  const chip = parseRelationshipGraphQuery("changed since review");
  assert.equal(chip.filters.changed, true);
  assert.deepEqual(chip.filters.freeText, []);
  assert.equal(chip.applied.includes("changed since review"), false);

  const dated = parseRelationshipGraphQuery("out of date");
  assert.equal(dated.filters.stale, true);
  assert.deepEqual(dated.filters.freeText, []);
  assert.deepEqual(dated.applied, ["out of date"]);

  const matched = queryRelationshipGraph(
    {
      nodes: [
        {
          id: "relationship:shift",
          kind: "relationship",
          label: "Quay Shift",
          changedSinceReview: true,
        },
        {
          id: "relationship:still",
          kind: "relationship",
          label: "Quay Still",
          changedSinceReview: false,
        },
      ],
      edges: [],
    },
    "changed since you last looked",
  );
  assert.deepEqual(matched.relationshipIds, ["shift"]);
  assert.equal(matched.answer, "1 relationship matches changed since you last looked.");

  const datedGraph = queryRelationshipGraph(
    {
      nodes: [
        { id: "relationship:old", kind: "relationship", label: "Quay Dated" },
        {
          id: "evidence:old",
          kind: "evidence",
          label: "Promise confirmed",
          relationshipId: "old",
          freshness: "stale",
        },
        { id: "relationship:fresh", kind: "relationship", label: "Quay Fresh" },
        {
          id: "evidence:fresh",
          kind: "evidence",
          label: "Promise confirmed",
          relationshipId: "fresh",
          freshness: "current",
        },
      ],
      edges: [],
    },
    "out of date",
  );
  assert.deepEqual(datedGraph.relationshipIds, ["old"]);
  assert.equal(datedGraph.answer, "1 relationship matches out of date.");
});

test("hide unconnected drops a company with nothing linked", () => {
  const parsed = parseRelationshipGraphQuery("hide unconnected");
  assert.equal(parsed.filters.hideIsolated, true);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["hide unconnected"]);

  const isolated = parseRelationshipGraphQuery("hide isolated");
  assert.equal(isolated.filters.hideIsolated, true);
  assert.deepEqual(isolated.filters.freeText, []);

  const result = queryRelationshipGraph(
    {
      nodes: [
        { id: "relationship:linked", kind: "relationship", label: "Quay Linked" },
        {
          id: "commitment:linked",
          kind: "commitment",
          label: "Send the quay link",
          relationshipId: "linked",
        },
        { id: "relationship:alone", kind: "relationship", label: "Quay Alone" },
      ],
      edges: [
        {
          id: "edge:linked",
          source: "relationship:linked",
          target: "commitment:linked",
          kind: "has_commitment",
        },
      ],
    },
    "hide unconnected",
  );
  assert.deepEqual(result.relationshipIds, ["linked"]);
  assert.equal(result.visibleNodeIds.includes("relationship:alone"), false);
  assert.equal(result.answer, "1 relationship matches hide unconnected.");
});

test("graph questions use the stage and health words a person would type", () => {
  const active = parseRelationshipGraphQuery("active customer");
  assert.deepEqual(active.filters.lifecycle, ["active_customer"]);
  assert.deepEqual(active.applied, ["lifecycle: active_customer"]);

  const former = parseRelationshipGraphQuery("former customer");
  assert.deepEqual(former.filters.lifecycle, ["former_customer"]);
  assert.deepEqual(former.applied, ["lifecycle: former_customer"]);

  const attention = parseRelationshipGraphQuery("needs attention");
  assert.deepEqual(attention.filters.health, ["needs_attention"]);
  assert.deepEqual(attention.applied, ["health: needs_attention"]);

  const atRisk = parseRelationshipGraphQuery("at risk");
  assert.equal(atRisk.filters.atRisk, true);
  assert.deepEqual(atRisk.filters.health, []);
  assert.deepEqual(atRisk.filters.nodeKinds, []);
  assert.deepEqual(atRisk.filters.freeText, []);
  assert.deepEqual(atRisk.applied, ["at risk"]);

  const risks = parseRelationshipGraphQuery("show risks");
  assert.deepEqual(risks.filters.nodeKinds, ["risk"]);
  assert.deepEqual(risks.filters.health, []);

  const customers = parseRelationshipGraphQuery("active customers");
  assert.deepEqual(customers.filters.lifecycle, ["active_customer"]);
  assert.deepEqual(customers.filters.freeText, []);
  assert.deepEqual(customers.applied, ["lifecycle: active_customer"]);

  const healthy = parseRelationshipGraphQuery("healthy companies");
  assert.deepEqual(healthy.filters.health, ["healthy"]);
  assert.deepEqual(healthy.filters.nodeKinds, ["relationship"]);
  assert.deepEqual(healthy.filters.freeText, []);

  const pending = parseRelationshipGraphQuery("pending approval");
  assert.deepEqual(pending.filters.approvalStatus, ["pending"]);
  assert.deepEqual(pending.filters.freeText, []);
  assert.deepEqual(pending.applied, ["approval: pending"]);

  const notes = parseRelationshipGraphQuery("desktop notes");
  assert.deepEqual(notes.filters.sources, ["desktop_note"]);
});

test("saved graph views normalize shareable state", () => {
  const view = createRelationshipGraphSavedView({
    label: "Renewal risks",
    createdAt: "2026-08-01T12:00:00.000Z",
    state: { scope: "portfolio", query: "critical renewals", density: 4, layout: "radial" },
  });
  assert.equal(view.label, "Renewal risks");
  assert.equal(view.state.density, 1);
  assert.equal(view.state.layout, "radial");
  assert.equal(view.state.focusDepth, 0);
  assert.match(view.id, /^graph-view-/);
});

test("graph neighborhoods are deterministic induced subgraphs", () => {
  const graph = {
    nodes: ["a", "b", "c", "d"].map((id) => ({ id, kind: "note", label: id })),
    edges: [
      { id: "a-b", source: "a", target: "b", kind: "linked_note" },
      { id: "b-c", source: "b", target: "c", kind: "linked_note" },
      { id: "a-c", source: "a", target: "c", kind: "linked_note" },
      { id: "c-d", source: "c", target: "d", kind: "linked_note" },
    ],
  };

  assert.deepEqual(relationshipGraphNeighborhood(graph, "b", 1), {
    rootNodeId: "b",
    depth: 1,
    nodeIds: ["a", "b", "c"],
    edgeIds: ["a-b", "b-c", "a-c"],
    boundaryNodeIds: ["a", "c"],
  });
  assert.deepEqual(relationshipGraphNeighborhood(graph, "missing", 2).nodeIds, []);
  assert.equal(relationshipGraphNeighborhood(graph, "b", 99).depth, 3);
});

test("saved graph views preserve a bounded neighborhood focus", () => {
  assert.equal(createRelationshipGraphSavedView({ state: { focusDepth: 2 } }).state.focusDepth, 2);
  assert.equal(createRelationshipGraphSavedView({ state: { focusDepth: 8 } }).state.focusDepth, 2);
});

test("every contracted capability has an explicit surface in web and desktop", () => {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const clientSources = {
    web: [
      "apps/rowboat-www/components/revenue/relationships-view.tsx",
      "apps/rowboat-www/components/revenue/audit-sheet.tsx",
    ],
    desktop: ["apps/x/apps/renderer/src/components/relationships-view.tsx"],
  };

  for (const [client, paths] of Object.entries(clientSources)) {
    const exposed = new Set();
    for (const path of paths) {
      const source = readFileSync(resolve(repositoryRoot, path), "utf8");
      for (const match of source.matchAll(/data-capability="([^"]+)"/g)) {
        for (const capability of match[1].split(/\s+/)) exposed.add(capability);
      }
    }
    assert.deepEqual(
      RELATIONSHIP_CLIENT_CAPABILITIES.filter((capability) => !exposed.has(capability)),
      [],
      `${client} is missing a user-facing relationship capability`,
    );
  }
});

test("an imported transcript becomes deterministic, reviewable relationship evidence", () => {
  const input = {
    relationshipId: "relationship-1",
    title: "Renewal call",
    transcript: "Avery: We can renew next week.\nYou: I will send the paperwork.",
    occurredAt: "2026-08-01T14:00:00.000Z",
    sourceRecordId: "upload-1",
  };
  const first = buildImportedTranscriptObservation(input);
  const second = buildImportedTranscriptObservation(input);
  assert.deepEqual(first, second);
  assert.equal(first.source, "meeting");
  assert.equal(first.externalId, "upload:upload-1");
  assert.equal(first.payload.envelope.segments.length, 2);
  assert.equal(first.payload.envelope.governance.participantDisclosure, "confirmed_by_importer");
  assert.equal(first.normalizedFacts.action_pack.length, 0);
  assert.deepEqual(first.assertions, []);
});

test("an empty imported transcript is rejected before publication", () => {
  assert.throws(
    () => buildImportedTranscriptObservation({ relationshipId: "relationship-1", transcript: " " }),
    /transcript are required/,
  );
});

test("an imported transcript retry keeps the same idempotency identity", () => {
  const input = {
    relationshipId: "relationship-1",
    transcript: "Avery: Same reviewed evidence.",
    occurredAt: "2026-08-01T14:00:00.000Z",
  };
  assert.equal(
    buildImportedTranscriptObservation(input).externalId,
    buildImportedTranscriptObservation(input).externalId,
  );
});

test("speaker parsing stays bounded for adversarial whitespace", () => {
  const observation = buildImportedTranscriptObservation({
    relationshipId: "relationship-1",
    transcript: `9:\t${"\t".repeat(10_000)}reviewed evidence`,
    occurredAt: "2026-08-01T14:00:00.000Z",
  });
  assert.equal(observation.payload.envelope.segments[0].speakerLabel, "9");
  assert.equal(observation.payload.envelope.segments[0].text, "reviewed evidence");
});
