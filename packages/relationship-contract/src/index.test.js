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

test("asking kept finds a promise the company card calls kept", () => {
  const parsed = parseRelationshipGraphQuery("kept promises");
  assert.equal(parsed.filters.kept, true);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.ok(parsed.applied.includes("kept"));
  assert.equal(parsed.applied.some((item) => item.startsWith("text:")), false);

  const hyphenated = parseRelationshipGraphQuery("kept-promises");
  assert.equal(hyphenated.filters.kept, true);
  assert.deepEqual(hyphenated.filters.freeText, []);

  const graph = {
    nodes: [
      { id: "relationship:kept", kind: "relationship", label: "Quay Harbor" },
      {
        id: "commitment:kept",
        kind: "commitment",
        label: "Send the quay note",
        relationshipId: "kept",
        status: "met",
      },
      { id: "relationship:open", kind: "relationship", label: "Quay Open" },
      {
        id: "commitment:open",
        kind: "commitment",
        label: "Send the quay open",
        relationshipId: "open",
        status: "open",
      },
    ],
    edges: [],
  };
  const result = queryRelationshipGraph(graph, "kept");
  assert.deepEqual(result.relationshipIds, ["kept"]);
  assert.equal(result.visibleNodeIds.includes("relationship:open"), false);
  assert.equal(result.answer, "1 relationship matches kept.");
});

test("asking not known finds a company whose health is unknown", () => {
  const parsed = parseRelationshipGraphQuery("not known");
  assert.equal(parsed.filters.notKnown, true);
  assert.deepEqual(parsed.filters.health, []);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["not known"]);

  const hyphenated = parseRelationshipGraphQuery("not-known");
  assert.equal(hyphenated.filters.notKnown, true);
  assert.deepEqual(hyphenated.filters.health, []);
  assert.deepEqual(hyphenated.filters.freeText, []);

  const dotted = parseRelationshipGraphQuery("Not known.");
  assert.equal(dotted.filters.notKnown, true);
  assert.deepEqual(dotted.filters.freeText, []);

  const graph = {
    nodes: [
      { id: "relationship:plain", kind: "relationship", label: "Quay Plain", health: "unknown" },
      {
        id: "relationship:fresh",
        kind: "relationship",
        label: "Quay Fresh",
        health: "healthy",
        status: "active",
      },
      {
        id: "source:fresh",
        kind: "source",
        label: "Gmail",
        relationshipId: "fresh",
        source: "gmail",
        status: "live",
        freshness: "unknown",
      },
      {
        id: "relationship:life",
        kind: "relationship",
        label: "Quay Life",
        health: "healthy",
        status: "active",
        lifecycle: "unknown",
      },
      { id: "relationship:blank", kind: "relationship", label: "Quay Blank", status: "active" },
      {
        id: "relationship:healthy",
        kind: "relationship",
        label: "Quay Healthy",
        health: "healthy",
        status: "active",
        lifecycle: "active_customer",
        freshness: "current",
      },
    ],
    edges: [],
  };
  for (const query of ["not known", "Not known.", "not-known"]) {
    assert.deepEqual(queryRelationshipGraph(graph, query).relationshipIds.sort(), [
      "blank",
      "fresh",
      "life",
      "plain",
    ]);
  }
  assert.equal(
    queryRelationshipGraph(graph, "not known").visibleNodeIds.includes("relationship:healthy"),
    false,
  );
  assert.equal(queryRelationshipGraph(graph, "not known").answer, "4 relationships match not known.");
});

test("asking declining finds a company whose engagement is declining", () => {
  const parsed = parseRelationshipGraphQuery("declining");
  assert.deepEqual(parsed.filters.engagement, ["declining"]);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["engagement: declining"]);

  const steady = parseRelationshipGraphQuery("steady");
  assert.deepEqual(steady.filters.engagement, ["steady"]);
  assert.deepEqual(steady.filters.freeText, []);

  const graph = {
    nodes: [
      {
        id: "relationship:slide",
        kind: "relationship",
        label: "Quay Slide",
        engagement: "declining",
        health: "unknown",
      },
      {
        id: "relationship:plain",
        kind: "relationship",
        label: "Quay Plain",
        engagement: "unknown",
        health: "unknown",
      },
    ],
    edges: [],
  };
  const result = queryRelationshipGraph(graph, "declining");
  assert.deepEqual(result.relationshipIds, ["slide"]);
  assert.equal(result.visibleNodeIds.includes("relationship:plain"), false);
  assert.equal(result.answer, "1 relationship matches engagement: declining.");
});

test("asking negative finds a company whose sentiment is negative", () => {
  const parsed = parseRelationshipGraphQuery("negative");
  assert.deepEqual(parsed.filters.sentiment, ["negative"]);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["sentiment: negative"]);

  const positive = parseRelationshipGraphQuery("positive");
  assert.deepEqual(positive.filters.sentiment, ["positive"]);
  assert.deepEqual(positive.filters.engagement, []);

  const graph = {
    nodes: [
      {
        id: "relationship:tone",
        kind: "relationship",
        label: "Quay Tone",
        sentiment: "negative",
        engagement: "unknown",
      },
      {
        id: "relationship:plain",
        kind: "relationship",
        label: "Quay Plain",
        sentiment: "unknown",
        engagement: "steady",
      },
    ],
    edges: [],
  };
  const result = queryRelationshipGraph(graph, "negative");
  assert.deepEqual(result.relationshipIds, ["tone"]);
  assert.equal(result.visibleNodeIds.includes("relationship:plain"), false);
  assert.equal(result.answer, "1 relationship matches sentiment: negative.");
});

test("asking awaiting approval finds a follow-up that is still pending", () => {
  const parsed = parseRelationshipGraphQuery("awaiting approval");
  assert.deepEqual(parsed.filters.approvalStatus, ["pending"]);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["approval: pending"]);

  const hyphenated = parseRelationshipGraphQuery("awaiting-approval");
  assert.deepEqual(hyphenated.filters.approvalStatus, ["pending"]);
  assert.deepEqual(hyphenated.filters.freeText, []);

  const graph = {
    nodes: [
      { id: "relationship:plain", kind: "relationship", label: "Quay Plain" },
      {
        id: "action:plain",
        kind: "action",
        label: "Meeting follow-up",
        relationshipId: "plain",
        status: "open",
        approvalStatus: "pending",
      },
      { id: "relationship:clear", kind: "relationship", label: "Quay Clear" },
      {
        id: "action:clear",
        kind: "action",
        label: "Meeting follow-up",
        relationshipId: "clear",
        status: "open",
        approvalStatus: "approved",
      },
    ],
    edges: [],
  };
  const result = queryRelationshipGraph(graph, "awaiting approval");
  assert.deepEqual(result.relationshipIds, ["plain"]);
  assert.equal(result.visibleNodeIds.includes("relationship:clear"), false);
  assert.equal(result.answer, "1 relationship matches approval: pending.");
});

test("asking meeting follow-up finds the row with that title", () => {
  const parsed = parseRelationshipGraphQuery("meeting follow-up");
  assert.equal(parsed.filters.meetingFollowUp, true);
  assert.deepEqual(parsed.filters.sources, []);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["meeting follow-up"]);

  const hyphenated = parseRelationshipGraphQuery("follow-up");
  assert.equal(hyphenated.filters.followUp, true);
  assert.equal(hyphenated.filters.meetingFollowUp, false);
  assert.deepEqual(hyphenated.filters.freeText, []);
  assert.deepEqual(hyphenated.applied, ["follow-up"]);

  const meeting = parseRelationshipGraphQuery("meeting");
  assert.deepEqual(meeting.filters.sources, ["meeting"]);
  assert.equal(meeting.filters.meetingFollowUp, false);

  const graph = {
    nodes: [
      { id: "relationship:follow", kind: "relationship", label: "Quay Follow" },
      {
        id: "action:follow",
        kind: "action",
        label: "Meeting follow-up",
        relationshipId: "follow",
        status: "open",
        approvalStatus: "pending",
      },
      { id: "source:follow", kind: "source", label: "A meeting", relationshipId: "follow", source: "meeting" },
      { id: "relationship:quiet", kind: "relationship", label: "Quay Quiet" },
      {
        id: "source:quiet",
        kind: "source",
        label: "A meeting",
        relationshipId: "quiet",
        source: "meeting",
      },
      { id: "relationship:warm", kind: "relationship", label: "Quay Warm" },
      {
        id: "action:warm",
        kind: "action",
        label: "Warm follow-up",
        relationshipId: "warm",
        status: "open",
      },
    ],
    edges: [],
  };
  const titled = queryRelationshipGraph(graph, "meeting follow-up");
  assert.deepEqual(titled.relationshipIds, ["follow"]);
  assert.equal(titled.visibleNodeIds.includes("relationship:quiet"), false);
  assert.equal(titled.visibleNodeIds.includes("relationship:warm"), false);
  assert.equal(titled.answer, "1 relationship matches meeting follow-up.");

  const anyFollowUp = queryRelationshipGraph(graph, "follow-ups");
  assert.deepEqual(anyFollowUp.relationshipIds.sort(), ["follow", "warm"]);
});

test("asking customer risk finds that follow-up and leaves other companies", () => {
  const parsed = parseRelationshipGraphQuery("customer risk");
  assert.equal(parsed.filters.customerRisk, true);
  assert.deepEqual(parsed.filters.nodeKinds, []);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["customer risk"]);

  const atRisk = parseRelationshipGraphQuery("at risk");
  assert.equal(atRisk.filters.customerRisk, false);
  assert.equal(atRisk.filters.atRisk, true);
  assert.deepEqual(atRisk.filters.nodeKinds, []);

  const graph = {
    nodes: [
      { id: "relationship:cedar", kind: "relationship", label: "Quay Cedar" },
      {
        id: "action:cedar",
        kind: "action",
        label: "Customer risk",
        relationshipId: "cedar",
        status: "open",
      },
      { id: "relationship:quiet", kind: "relationship", label: "Quay Quiet" },
      {
        id: "action:quiet",
        kind: "action",
        label: "Meeting follow-up",
        relationshipId: "quiet",
        status: "open",
      },
    ],
    edges: [],
  };
  const result = queryRelationshipGraph(graph, "customer risk");
  assert.deepEqual(result.relationshipIds, ["cedar"]);
  assert.equal(result.visibleNodeIds.includes("relationship:quiet"), false);
  assert.equal(result.answer, "1 relationship matches customer risk.");
});

test("asking promise follow-up leaves a meeting follow-up", () => {
  const parsed = parseRelationshipGraphQuery("promise follow-up");
  assert.equal(parsed.filters.promiseFollowUp, true);
  assert.equal(parsed.filters.followUp, true);
  assert.deepEqual(parsed.filters.nodeKinds, []);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["promise follow-up"]);

  const graph = {
    nodes: [
      { id: "relationship:maple", kind: "relationship", label: "Quay Maple" },
      {
        id: "action:maple",
        kind: "action",
        label: "Promise follow-up",
        relationshipId: "maple",
        status: "open",
      },
      { id: "relationship:quiet", kind: "relationship", label: "Quay Quiet" },
      {
        id: "action:quiet",
        kind: "action",
        label: "Meeting follow-up",
        relationshipId: "quiet",
        status: "open",
      },
    ],
    edges: [],
  };
  const result = queryRelationshipGraph(graph, "promise follow-up");
  assert.deepEqual(result.relationshipIds, ["maple"]);
  assert.equal(result.visibleNodeIds.includes("relationship:quiet"), false);
  assert.equal(result.answer, "1 relationship matches promise follow-up.");
});

test("asking promises keeps the company that has one", () => {
  const parsed = parseRelationshipGraphQuery("promises");
  assert.deepEqual(parsed.filters.nodeKinds, ["commitment"]);
  assert.deepEqual(parsed.filters.freeText, []);

  const detail = parseRelationshipGraphQuery("details");
  assert.deepEqual(detail.filters.nodeKinds, ["evidence"]);
  assert.deepEqual(detail.filters.freeText, []);

  const graph = {
    nodes: [
      { id: "relationship:has", kind: "relationship", label: "Quay Has", relationshipId: "has" },
      {
        id: "commitment:has",
        kind: "commitment",
        label: "Send the note",
        relationshipId: "has",
        status: "open",
      },
      {
        id: "evidence:has",
        kind: "evidence",
        label: "Promise confirmed",
        relationshipId: "has",
      },
      { id: "relationship:bare", kind: "relationship", label: "Quay Bare", relationshipId: "bare" },
    ],
    edges: [],
  };
  const promises = queryRelationshipGraph(graph, "promises");
  assert.deepEqual(promises.relationshipIds, ["has"]);
  assert.equal(promises.visibleNodeIds.includes("relationship:bare"), false);
  assert.equal(promises.answer, "1 relationship matches nodes: commitment.");

  const details = queryRelationshipGraph(graph, "detail");
  assert.deepEqual(details.relationshipIds, ["has"]);
  assert.equal(details.visibleNodeIds.includes("relationship:bare"), false);
  assert.equal(details.answer, "1 relationship matches nodes: evidence.");
});

test("asking open promises leaves a kept promise with an open follow-up", () => {
  const parsed = parseRelationshipGraphQuery("open promises");
  assert.equal(parsed.filters.open, true);
  assert.deepEqual(parsed.filters.nodeKinds, []);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["open"]);

  const bare = parseRelationshipGraphQuery("open");
  assert.equal(bare.filters.open, true);
  assert.deepEqual(bare.filters.freeText, []);

  const graph = {
    nodes: [
      { id: "relationship:open", kind: "relationship", label: "Quay North" },
      {
        id: "commitment:open",
        kind: "commitment",
        label: "Send the quay note",
        relationshipId: "open",
        status: "open",
      },
      { id: "relationship:kept", kind: "relationship", label: "Quay South" },
      {
        id: "commitment:kept",
        kind: "commitment",
        label: "Send the south note",
        relationshipId: "kept",
        status: "met",
      },
      {
        id: "action:kept",
        kind: "action",
        label: "Meeting follow-up",
        relationshipId: "kept",
        status: "open",
        approvalStatus: "pending",
      },
    ],
    edges: [],
  };
  const result = queryRelationshipGraph(graph, "open promises");
  assert.deepEqual(result.relationshipIds, ["open"]);
  assert.equal(result.visibleNodeIds.includes("relationship:kept"), false);
  assert.equal(result.answer, "1 relationship matches open.");
});

test("asking held finds an open follow-up and leaves an open promise", () => {
  const parsed = parseRelationshipGraphQuery("held");
  assert.equal(parsed.filters.held, true);
  assert.equal(parsed.filters.open, false);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["held"]);

  const result = queryRelationshipGraph(
    {
      nodes: [
        { id: "relationship:hold", kind: "relationship", label: "Quay Hold" },
        {
          id: "action:hold",
          kind: "action",
          label: "Customer risk",
          relationshipId: "hold",
          status: "open",
          approvalStatus: "pending",
        },
        { id: "relationship:note", kind: "relationship", label: "Quay Note" },
        {
          id: "commitment:note",
          kind: "commitment",
          label: "Send the quay note",
          relationshipId: "note",
          status: "open",
        },
        { id: "relationship:later", kind: "relationship", label: "Quay Later" },
        {
          id: "action:later",
          kind: "action",
          label: "Warm follow-up",
          relationshipId: "later",
          status: "snoozed",
        },
      ],
      edges: [],
    },
    "held",
  );
  assert.deepEqual(result.relationshipIds, ["hold"]);
  assert.equal(result.answer, "1 relationship matches held.");
});

test("asking drafted leaves a message that was sent", () => {
  const drafted = parseRelationshipGraphQuery("drafted");
  assert.equal(drafted.filters.drafted, true);
  assert.equal(drafted.filters.sent, false);
  assert.deepEqual(drafted.filters.freeText, []);
  assert.deepEqual(drafted.applied, ["drafted"]);

  const sent = parseRelationshipGraphQuery("sent");
  assert.equal(sent.filters.sent, true);
  assert.equal(sent.filters.drafted, false);
  assert.deepEqual(sent.filters.freeText, []);
  assert.deepEqual(sent.applied, ["sent"]);

  const graph = {
    nodes: [
      { id: "relationship:draft", kind: "relationship", label: "Quay Draft" },
      {
        id: "action:draft",
        kind: "action",
        label: "Customer risk",
        relationshipId: "draft",
        executionStatus: "sent",
        metadata: { executionMode: "draft" },
      },
      { id: "relationship:sent", kind: "relationship", label: "Quay Sent" },
      {
        id: "action:sent",
        kind: "action",
        label: "Calendar hold",
        relationshipId: "sent",
        executionStatus: "sent",
        metadata: { executionMode: "send" },
      },
    ],
    edges: [],
  };
  const drafts = queryRelationshipGraph(graph, "drafted");
  assert.deepEqual(drafts.relationshipIds, ["draft"]);
  assert.equal(drafts.answer, "1 relationship matches drafted.");
  const messages = queryRelationshipGraph(graph, "sent");
  assert.deepEqual(messages.relationshipIds, ["sent"]);
  assert.equal(messages.answer, "1 relationship matches sent.");
});

test("asking needs reconcile finds that follow-up and leaves a send still going out", () => {
  const reconcile = parseRelationshipGraphQuery("needs reconcile");
  assert.equal(reconcile.filters.needsReconcile, true);
  assert.deepEqual(reconcile.filters.freeText, []);
  assert.deepEqual(reconcile.applied, ["needs reconcile"]);

  const sending = parseRelationshipGraphQuery("sending");
  assert.equal(sending.filters.sending, true);
  assert.deepEqual(sending.filters.freeText, []);
  assert.deepEqual(sending.applied, ["sending"]);

  const failed = parseRelationshipGraphQuery("failed");
  assert.equal(failed.filters.executionFailed, true);
  assert.deepEqual(failed.filters.freeText, []);
  assert.deepEqual(failed.applied, ["failed"]);

  const graph = {
    nodes: [
      { id: "relationship:mix", kind: "relationship", label: "Quay Mix" },
      {
        id: "action:mix",
        kind: "action",
        label: "Calendar hold",
        relationshipId: "mix",
        executionStatus: "ambiguous",
      },
      { id: "relationship:wait", kind: "relationship", label: "Quay Wait" },
      {
        id: "action:wait",
        kind: "action",
        label: "Meeting recap",
        relationshipId: "wait",
        executionStatus: "requested",
      },
      { id: "relationship:fail", kind: "relationship", label: "Quay Fail" },
      {
        id: "action:fail",
        kind: "action",
        label: "Customer risk",
        relationshipId: "fail",
        executionStatus: "failed",
        status: "open",
      },
      { id: "relationship:source", kind: "relationship", label: "Quay Source" },
      {
        id: "source:source",
        kind: "source",
        label: "Slack",
        relationshipId: "source",
        status: "failed",
      },
    ],
    edges: [],
  };
  assert.deepEqual(queryRelationshipGraph(graph, "needs reconcile").relationshipIds, ["mix"]);
  assert.deepEqual(queryRelationshipGraph(graph, "sending").relationshipIds, ["wait"]);
  assert.deepEqual(queryRelationshipGraph(graph, "failed").relationshipIds.sort(), ["fail", "source"]);
});

test("asking cancelled finds a cancelled send and a cancelled promise", () => {
  const parsed = parseRelationshipGraphQuery("cancelled");
  assert.equal(parsed.filters.executionCancelled, true);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["cancelled"]);
  assert.equal(parseRelationshipGraphQuery("not cancelled").filters.executionCancelled, false);

  const graph = {
    nodes: [
      { id: "relationship:stop", kind: "relationship", label: "Quay Stop" },
      {
        id: "action:stop",
        kind: "action",
        label: "Customer risk",
        relationshipId: "stop",
        status: "open",
        approvalStatus: "pending",
        executionStatus: "cancelled",
      },
      { id: "relationship:void", kind: "relationship", label: "Quay Void" },
      {
        id: "commitment:void",
        kind: "commitment",
        label: "Send the quay void",
        relationshipId: "void",
        status: "cancelled",
      },
      { id: "relationship:open", kind: "relationship", label: "Quay Open" },
      {
        id: "commitment:open",
        kind: "commitment",
        label: "Send the quay note",
        relationshipId: "open",
        status: "open",
      },
    ],
    edges: [],
  };
  const result = queryRelationshipGraph(graph, "cancelled");
  assert.deepEqual(result.relationshipIds.sort(), ["stop", "void"]);
  assert.equal(result.visibleNodeIds.includes("relationship:open"), false);
  assert.equal(result.answer, "2 relationships match cancelled.");
});

test("asking a follow-up title does not require that source", () => {
  const titles = [
    ["calendar hold", "Calendar hold", "calendar"],
    ["crm update", "CRM update", "crm"],
    ["meeting recap", "Meeting recap", "meeting"],
  ];
  for (const [query, label, source] of titles) {
    const parsed = parseRelationshipGraphQuery(query);
    assert.deepEqual(parsed.filters.sources, [], query);
    assert.deepEqual(parsed.filters.freeText, [], query);
    assert.deepEqual(parsed.applied, [query]);

    const alone = parseRelationshipGraphQuery(source);
    assert.deepEqual(alone.filters.sources, [source], source);

    const graph = {
      nodes: [
        { id: "relationship:hit", kind: "relationship", label: "Quay Hit" },
        {
          id: "action:hit",
          kind: "action",
          label,
          relationshipId: "hit",
          status: "open",
        },
        { id: "relationship:decoy", kind: "relationship", label: "Quay Decoy" },
        {
          id: "source:decoy",
          kind: "source",
          label: "A source",
          relationshipId: "decoy",
          source,
        },
      ],
      edges: [],
    };
    const result = queryRelationshipGraph(graph, query);
    assert.deepEqual(result.relationshipIds, ["hit"], query);
    assert.equal(result.visibleNodeIds.includes("relationship:decoy"), false, query);
    assert.equal(result.answer, `1 relationship matches ${query}.`);
  }
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

test("asking up to date keeps a current detail and leaves an older one", () => {
  const parsed = parseRelationshipGraphQuery("up to date");
  assert.equal(parsed.filters.current, true);
  assert.equal(parsed.filters.stale, false);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["up to date"]);

  const hyphenated = parseRelationshipGraphQuery("up-to-date");
  assert.equal(hyphenated.filters.current, true);
  assert.deepEqual(hyphenated.filters.freeText, []);

  const denied = parseRelationshipGraphQuery("not up to date");
  assert.equal(denied.filters.current, false);
  assert.deepEqual(denied.filters.freeText, []);

  const aging = parseRelationshipGraphQuery("getting old");
  assert.equal(aging.filters.aging, true);
  assert.equal(aging.filters.current, false);
  assert.deepEqual(aging.filters.freeText, []);
  assert.deepEqual(aging.applied, ["getting old"]);

  const graph = {
    nodes: [
      { id: "relationship:fresh", kind: "relationship", label: "Quay Fresh" },
      {
        id: "evidence:fresh",
        kind: "evidence",
        label: "The quay note",
        relationshipId: "fresh",
        freshness: "current",
      },
      { id: "relationship:aged", kind: "relationship", label: "Quay Aged" },
      {
        id: "evidence:aged",
        kind: "evidence",
        label: "The older note",
        relationshipId: "aged",
        freshness: "aging",
      },
    ],
    edges: [],
  };
  const current = queryRelationshipGraph(graph, "up to date");
  assert.deepEqual(current.relationshipIds, ["fresh"]);
  assert.equal(current.visibleNodeIds.includes("relationship:aged"), false);
  assert.equal(current.answer, "1 relationship matches up to date.");

  const older = queryRelationshipGraph(graph, "getting old");
  assert.deepEqual(older.relationshipIds, ["aged"]);
  assert.equal(older.visibleNodeIds.includes("relationship:fresh"), false);
  assert.equal(older.answer, "1 relationship matches getting old.");
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
  assert.deepEqual(
    queryRelationshipGraph(
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
      "Changed since you last looked.",
    ).relationshipIds,
    ["shift"],
  );

  const detailed = {
    nodes: [
      {
        id: "relationship:ev",
        kind: "relationship",
        label: "Quay Evidence",
        changedSinceReview: true,
        changedDimensions: ["evidence"],
      },
      {
        id: "relationship:both",
        kind: "relationship",
        label: "Quay Both",
        changedSinceReview: true,
        changedDimensions: ["health", "evidence"],
      },
      {
        id: "relationship:risk",
        kind: "relationship",
        label: "Quay Risk",
        changedSinceReview: true,
        changedDimensions: ["risks"],
      },
      {
        id: "relationship:quiet",
        kind: "relationship",
        label: "Quay Quiet",
        changedSinceReview: false,
        changedDimensions: ["evidence"],
      },
    ],
    edges: [],
  };
  const evidenceSentence = "Changed since you last looked: Supporting evidence.";
  const evidenceQuery = parseRelationshipGraphQuery(evidenceSentence);
  assert.equal(evidenceQuery.filters.changed, true);
  assert.deepEqual(evidenceQuery.filters.changedDimensions, ["evidence"]);
  assert.deepEqual(evidenceQuery.filters.nodeKinds, []);
  assert.deepEqual(evidenceQuery.filters.freeText, []);
  assert.deepEqual(queryRelationshipGraph(detailed, evidenceSentence).relationshipIds.sort(), [
    "both",
    "ev",
  ]);
  assert.deepEqual(
    queryRelationshipGraph(detailed, "Changed since you last looked: Risks.").relationshipIds,
    ["risk"],
  );
  assert.deepEqual(
    queryRelationshipGraph(
      detailed,
      "Changed since you last looked: Health, Supporting evidence.",
    ).relationshipIds,
    ["both"],
  );

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

test("asking not connected finds that source and leaves a live one", () => {
  const parsed = parseRelationshipGraphQuery("not connected");
  assert.equal(parsed.filters.notConnected, true);
  assert.equal(parsed.filters.hideIsolated, false);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["not connected"]);

  const hyphen = parseRelationshipGraphQuery("not-connected");
  assert.equal(hyphen.filters.notConnected, true);
  assert.equal(hyphen.filters.hideIsolated, false);
  assert.deepEqual(hyphen.filters.freeText, []);

  const hidden = parseRelationshipGraphQuery("hide unconnected");
  assert.equal(hidden.filters.hideIsolated, true);
  assert.equal(hidden.filters.notConnected, false);

  const result = queryRelationshipGraph(
    {
      nodes: [
        { id: "relationship:off", kind: "relationship", label: "Quay Off" },
        {
          id: "source:off",
          kind: "source",
          label: "Slack",
          relationshipId: "off",
          status: "not_connected",
          source: "slack",
          freshness: "current",
        },
        { id: "relationship:live", kind: "relationship", label: "Quay Live" },
        {
          id: "source:live",
          kind: "source",
          label: "A meeting",
          relationshipId: "live",
          status: "live",
          source: "meeting",
          freshness: "current",
        },
        { id: "relationship:alone", kind: "relationship", label: "Quay Alone" },
      ],
      edges: [
        { id: "edge:off", source: "relationship:off", target: "source:off", kind: "observed_by" },
        { id: "edge:live", source: "relationship:live", target: "source:live", kind: "observed_by" },
      ],
    },
    "not connected",
  );
  assert.deepEqual(result.relationshipIds, ["off"]);
  assert.equal(result.visibleNodeIds.includes("relationship:live"), false);
  assert.equal(result.visibleNodeIds.includes("relationship:alone"), false);
  assert.equal(result.answer, "1 relationship matches not connected.");
});

test("asking replaces keeps the promise that takes another's place", () => {
  const replaces = parseRelationshipGraphQuery("replaces");
  assert.deepEqual(replaces.filters.edgeKinds, ["supersedes"]);
  assert.deepEqual(replaces.filters.freeText, []);
  assert.deepEqual(replaces.applied, ["edges: supersedes"]);

  const promise = parseRelationshipGraphQuery("has promise");
  assert.deepEqual(promise.filters.edgeKinds, ["has_commitment"]);
  assert.deepEqual(promise.filters.nodeKinds, []);
  assert.deepEqual(promise.filters.freeText, []);
  assert.deepEqual(promise.applied, ["edges: has_commitment"]);

  const risk = parseRelationshipGraphQuery("has risk");
  assert.deepEqual(risk.filters.edgeKinds, ["has_risk"]);
  assert.deepEqual(risk.filters.nodeKinds, []);
  assert.deepEqual(risk.filters.freeText, []);

  const graph = {
    nodes: [
      { id: "relationship:swap", kind: "relationship", label: "Quay Swap" },
      {
        id: "commitment:old",
        kind: "commitment",
        label: "Send the old note",
        relationshipId: "swap",
        status: "open",
      },
      {
        id: "commitment:new",
        kind: "commitment",
        label: "Send the new note",
        relationshipId: "swap",
        status: "open",
      },
      { id: "relationship:open", kind: "relationship", label: "Quay Open" },
      {
        id: "commitment:open",
        kind: "commitment",
        label: "Send the open note",
        relationshipId: "open",
        status: "open",
      },
      { id: "relationship:risk", kind: "relationship", label: "Quay Risk" },
      { id: "risk:one", kind: "risk", label: "A risk", relationshipId: "risk" },
    ],
    edges: [
      { id: "edge:old", source: "relationship:swap", target: "commitment:old", kind: "has_commitment" },
      { id: "edge:new", source: "relationship:swap", target: "commitment:new", kind: "has_commitment" },
      { id: "edge:replace", source: "commitment:new", target: "commitment:old", kind: "supersedes" },
      { id: "edge:open", source: "relationship:open", target: "commitment:open", kind: "has_commitment" },
      { id: "edge:risk", source: "relationship:risk", target: "risk:one", kind: "has_risk" },
    ],
  };
  assert.deepEqual(queryRelationshipGraph(graph, "replaces").relationshipIds, ["swap"]);
  assert.deepEqual(queryRelationshipGraph(graph, "has promise").relationshipIds.sort(), ["open", "swap"]);
  assert.deepEqual(queryRelationshipGraph(graph, "has risk").relationshipIds, ["risk"]);
});

test("asking syncing finds a source that is still loading", () => {
  const syncing = parseRelationshipGraphQuery("syncing");
  assert.equal(syncing.filters.syncing, true);
  assert.equal(syncing.filters.sourceActive, false);
  assert.deepEqual(syncing.filters.freeText, []);
  assert.deepEqual(syncing.applied, ["syncing"]);

  const active = parseRelationshipGraphQuery("active");
  assert.equal(active.filters.sourceActive, true);
  assert.equal(active.filters.syncing, false);
  assert.deepEqual(active.filters.lifecycle, []);
  assert.deepEqual(active.filters.freeText, []);
  assert.deepEqual(active.applied, ["active"]);

  const stage = parseRelationshipGraphQuery("active customer");
  assert.equal(stage.filters.sourceActive, false);
  assert.deepEqual(stage.filters.lifecycle, ["active_customer"]);
  assert.deepEqual(stage.applied, ["lifecycle: active_customer"]);

  const graph = {
    nodes: [
      { id: "relationship:sync", kind: "relationship", label: "Quay Sync", status: "active" },
      {
        id: "source:sync",
        kind: "source",
        label: "Slack",
        relationshipId: "sync",
        source: "slack",
        status: "backfilling",
        freshness: "current",
      },
      { id: "relationship:live", kind: "relationship", label: "Quay Live", status: "active" },
      {
        id: "source:live",
        kind: "source",
        label: "A meeting",
        relationshipId: "live",
        source: "meeting",
        status: "live",
        freshness: "current",
      },
      { id: "relationship:rebuild", kind: "relationship", label: "Quay Rebuild" },
      {
        id: "source:rebuild",
        kind: "source",
        label: "Gmail",
        relationshipId: "rebuild",
        source: "gmail",
        status: "rebuilding",
      },
    ],
    edges: [],
  };
  assert.deepEqual(queryRelationshipGraph(graph, "syncing").relationshipIds.sort(), ["rebuild", "sync"]);
  assert.deepEqual(queryRelationshipGraph(graph, "active").relationshipIds, ["live"]);
});

test("asking review keeps the promise that still needs confirmation", () => {
  const parsed = parseRelationshipGraphQuery("review");
  assert.equal(parsed.filters.promiseReview, true);
  assert.equal(parsed.filters.reviewRequired, false);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["review"]);

  const needs = parseRelationshipGraphQuery("needs review");
  assert.equal(needs.filters.promiseReview, true);
  assert.equal(needs.filters.reviewRequired, false);
  assert.deepEqual(needs.filters.freeText, []);
  assert.deepEqual(needs.applied, ["review"]);

  const policy = parseRelationshipGraphQuery("review required");
  assert.equal(policy.filters.promiseReview, false);
  assert.equal(policy.filters.reviewRequired, true);

  const graph = {
    nodes: [
      { id: "relationship:review", kind: "relationship", label: "Quay Review" },
      {
        id: "commitment:review",
        kind: "commitment",
        label: "Send the quay review",
        relationshipId: "review",
        status: "review",
      },
      { id: "relationship:open", kind: "relationship", label: "Quay Open" },
      {
        id: "commitment:open",
        kind: "commitment",
        label: "Send the open note",
        relationshipId: "open",
        status: "open",
      },
      { id: "relationship:policy", kind: "relationship", label: "Quay Policy" },
      {
        id: "action:policy",
        kind: "action",
        label: "Customer risk",
        relationshipId: "policy",
        status: "open",
        policyStatus: "review_required",
      },
    ],
    edges: [],
  };
  const result = queryRelationshipGraph(graph, "review");
  assert.deepEqual(result.relationshipIds, ["review"]);
  assert.equal(result.visibleNodeIds.includes("relationship:open"), false);
  assert.equal(result.visibleNodeIds.includes("relationship:policy"), false);
  assert.equal(result.answer, "1 relationship matches review.");
  assert.deepEqual(queryRelationshipGraph(graph, "needs review").relationshipIds, ["review"]);
  assert.deepEqual(queryRelationshipGraph(graph, "review required").relationshipIds, ["policy"]);
});

test("asking not checked finds a follow-up whose policy has not run", () => {
  const parsed = parseRelationshipGraphQuery("not checked");
  assert.equal(parsed.filters.notChecked, true);
  assert.equal(parsed.filters.cleared, false);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["not checked"]);

  const cleared = parseRelationshipGraphQuery("cleared");
  assert.equal(cleared.filters.cleared, true);
  assert.equal(cleared.filters.notChecked, false);
  assert.deepEqual(cleared.filters.freeText, []);
  assert.deepEqual(cleared.applied, ["cleared"]);

  const review = parseRelationshipGraphQuery("review required");
  assert.equal(review.filters.reviewRequired, true);
  assert.deepEqual(review.filters.freeText, []);
  assert.deepEqual(review.applied, ["review required"]);

  const recheck = parseRelationshipGraphQuery("re-check needed");
  assert.equal(recheck.filters.recheck, true);
  assert.deepEqual(recheck.filters.freeText, []);
  assert.deepEqual(recheck.applied, ["re-check needed"]);

  const blocked = parseRelationshipGraphQuery("blocked");
  assert.equal(blocked.filters.blocked, true);
  assert.deepEqual(blocked.filters.edgeKinds, []);
  assert.deepEqual(blocked.filters.freeText, []);
  assert.deepEqual(blocked.applied, ["blocked"]);

  const blocks = parseRelationshipGraphQuery("blocks");
  assert.deepEqual(blocks.filters.edgeKinds, ["blocks"]);
  assert.equal(blocks.filters.blocked, false);

  const graph = {
    nodes: [
      { id: "relationship:check", kind: "relationship", label: "Quay Check" },
      {
        id: "action:check",
        kind: "action",
        label: "Meeting follow-up",
        relationshipId: "check",
        status: "open",
        approvalStatus: "pending",
        policyStatus: "pending",
      },
      { id: "relationship:clear", kind: "relationship", label: "Quay Clear" },
      {
        id: "action:clear",
        kind: "action",
        label: "Calendar hold",
        relationshipId: "clear",
        status: "open",
        approvalStatus: "pending",
        policyStatus: "passed",
      },
    ],
    edges: [
      { id: "edge:check", source: "relationship:check", target: "action:check", kind: "recommends" },
      { id: "edge:clear", source: "relationship:clear", target: "action:clear", kind: "recommends" },
    ],
  };
  const pending = queryRelationshipGraph(graph, "not checked");
  assert.deepEqual(pending.relationshipIds, ["check"]);
  assert.equal(pending.answer, "1 relationship matches not checked.");
  const passed = queryRelationshipGraph(graph, "cleared");
  assert.deepEqual(passed.relationshipIds, ["clear"]);
  assert.equal(passed.answer, "1 relationship matches cleared.");

  const heldBack = queryRelationshipGraph(
    {
      nodes: [
        { id: "relationship:policy", kind: "relationship", label: "Quay Policy" },
        {
          id: "action:policy",
          kind: "action",
          label: "Warm follow-up",
          relationshipId: "policy",
          policyStatus: "blocked",
          status: "open",
        },
        { id: "relationship:promise", kind: "relationship", label: "Quay Promise" },
        {
          id: "commitment:promise",
          kind: "commitment",
          label: "Send the quay note",
          relationshipId: "promise",
          status: "blocked",
        },
        { id: "relationship:open", kind: "relationship", label: "Quay Open" },
        {
          id: "commitment:open",
          kind: "commitment",
          label: "Send the open note",
          relationshipId: "open",
          status: "open",
        },
      ],
      edges: [],
    },
    "blocked",
  );
  assert.deepEqual(heldBack.relationshipIds.sort(), ["policy", "promise"]);
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

test("asking not recorded for this date finds a record that did not exist yet", () => {
  const parsed = parseRelationshipGraphQuery("Not recorded for this date");
  assert.equal(parsed.filters.notRecorded, true);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["not recorded for this date"]);

  const graph = {
    nodes: [
      { id: "relationship:later", kind: "relationship", label: "Quay Later", status: "historical_unknown" },
      { id: "relationship:source", kind: "relationship", label: "Quay Source" },
      {
        id: "source:later",
        kind: "source",
        label: "Gmail",
        relationshipId: "source",
        source: "gmail",
        status: "historical_unknown",
      },
      { id: "relationship:now", kind: "relationship", label: "Quay Now", status: "active", health: "healthy" },
    ],
    edges: [],
  };
  assert.deepEqual(queryRelationshipGraph(graph, "Not recorded for this date").relationshipIds.sort(), [
    "later",
    "source",
  ]);
  assert.deepEqual(queryRelationshipGraph(graph, "Not recorded for this date.").relationshipIds.sort(), [
    "later",
    "source",
  ]);
  assert.deepEqual(queryRelationshipGraph(graph, "show me Not recorded for this date").relationshipIds.sort(), [
    "later",
    "source",
  ]);
  assert.deepEqual(queryRelationshipGraph(graph, "historical unknown").relationshipIds, []);
});

test("asking for a confidence badge finds the promise that prints that percent", () => {
  const exact = parseRelationshipGraphQuery("80% confidence");
  assert.equal(exact.filters.confidencePercent, 80);
  assert.deepEqual(exact.filters.freeText, []);
  assert.deepEqual(exact.applied, ["80% confidence"]);

  const dotted = parseRelationshipGraphQuery("80% confidence.");
  assert.equal(dotted.filters.confidencePercent, 80);
  assert.deepEqual(dotted.filters.freeText, []);

  const shown = parseRelationshipGraphQuery("show me 80% confidence");
  assert.equal(shown.filters.confidencePercent, 80);
  assert.deepEqual(shown.filters.freeText, []);

  assert.equal(parseRelationshipGraphQuery("80%").filters.confidencePercent, null);
  assert.equal(parseRelationshipGraphQuery("confidence").filters.confidencePercent, null);
  assert.equal(
    parseRelationshipGraphQuery("65% confidence and 40% confidence").filters.confidencePercent,
    null,
  );
  assert.equal(parseRelationshipGraphQuery("065% confidence").filters.confidencePercent, null);

  const graph = {
    nodes: [
      { id: "relationship:quoted", kind: "relationship", label: "Quay Quoted" },
      {
        id: "commitment:quoted",
        kind: "commitment",
        label: "Send the security packet",
        relationshipId: "quoted",
        status: "open",
        confidence: 0.8,
      },
      { id: "relationship:rounded", kind: "relationship", label: "Quay Rounded" },
      {
        id: "commitment:rounded",
        kind: "commitment",
        label: "Send the rounded packet",
        relationshipId: "rounded",
        status: "open",
        confidence: 0.804,
      },
      { id: "relationship:lower", kind: "relationship", label: "Quay Lower" },
      {
        id: "commitment:lower",
        kind: "commitment",
        label: "Send the renewal note",
        relationshipId: "lower",
        status: "open",
        confidence: 0.4,
      },
      { id: "relationship:plain", kind: "relationship", label: "Quay Plain" },
      {
        id: "commitment:plain",
        kind: "commitment",
        label: "Send the agenda",
        relationshipId: "plain",
        status: "open",
      },
      { id: "relationship:sure", kind: "relationship", label: "Quay Sure" },
      {
        id: "commitment:sure",
        kind: "commitment",
        label: "Send the sure packet",
        relationshipId: "sure",
        status: "open",
        confidence: 0.855,
      },
      { id: "relationship:later", kind: "relationship", label: "Quay Later", status: "historical_unknown" },
    ],
    edges: [],
  };

  for (const query of ["80% confidence", "80% confidence.", "show me 80% confidence"]) {
    assert.deepEqual(queryRelationshipGraph(graph, query).relationshipIds.sort(), ["quoted", "rounded"]);
  }
  assert.deepEqual(queryRelationshipGraph(graph, "86% confidence").relationshipIds, ["sure"]);
  assert.deepEqual(queryRelationshipGraph(graph, "40% confidence").relationshipIds, ["lower"]);
  assert.deepEqual(queryRelationshipGraph(graph, "80%").relationshipIds, []);
  assert.deepEqual(queryRelationshipGraph(graph, "confidence").relationshipIds, []);
  assert.deepEqual(queryRelationshipGraph(graph, "Not recorded for this date").relationshipIds, ["later"]);
});

test("asking for the due day finds the promise that prints that day", () => {
  const exact = parseRelationshipGraphQuery("Oct 20, 2026");
  assert.equal(exact.filters.dueLabel, "oct 20, 2026");
  assert.deepEqual(exact.filters.freeText, []);
  assert.deepEqual(exact.applied, ["oct 20, 2026"]);

  const prefixed = parseRelationshipGraphQuery("Due: Oct 20, 2026");
  assert.equal(prefixed.filters.dueLabel, "oct 20, 2026");
  assert.deepEqual(prefixed.filters.freeText, []);

  const dated = parseRelationshipGraphQuery("due date Oct 20, 2026.");
  assert.equal(dated.filters.dueLabel, "oct 20, 2026");
  assert.deepEqual(dated.filters.freeText, []);

  assert.equal(parseRelationshipGraphQuery("Oct 20").filters.dueLabel, null);
  assert.equal(parseRelationshipGraphQuery("Oct 05, 2026").filters.dueLabel, null);
  assert.equal(parseRelationshipGraphQuery("Oct 20, 2026 and Nov 2, 2026").filters.dueLabel, null);

  const graph = {
    nodes: [
      { id: "relationship:due", kind: "relationship", label: "Quay Due" },
      {
        id: "commitment:due",
        kind: "commitment",
        label: "Send the security packet",
        relationshipId: "due",
        status: "open",
        dueAt: "2026-10-20T15:00:00.000Z",
      },
      { id: "relationship:next", kind: "relationship", label: "Quay Next" },
      {
        id: "commitment:next",
        kind: "commitment",
        label: "Send the renewal note",
        relationshipId: "next",
        status: "open",
        dueAt: "2026-11-02T00:30:00.000Z",
      },
      { id: "relationship:open", kind: "relationship", label: "Quay Open" },
      {
        id: "commitment:open",
        kind: "commitment",
        label: "Send the agenda",
        relationshipId: "open",
        status: "open",
      },
    ],
    edges: [],
  };
  for (const query of ["Oct 20, 2026", "Oct 20, 2026.", "Due: Oct 20, 2026", "show me due Oct 20, 2026"]) {
    assert.deepEqual(queryRelationshipGraph(graph, query).relationshipIds, ["due"]);
  }
  assert.deepEqual(queryRelationshipGraph(graph, "Nov 2, 2026").relationshipIds, ["next"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Oct 20").relationshipIds, []);
});

test("asking for an unknown person finds the person with no name", () => {
  const parsed = parseRelationshipGraphQuery("Unknown person");
  assert.equal(parsed.filters.unknownPerson, true);
  assert.deepEqual(parsed.filters.health, []);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["nodes: person", "unknown person"]);

  const dotted = parseRelationshipGraphQuery("Unknown person.");
  assert.equal(dotted.filters.unknownPerson, true);
  assert.deepEqual(dotted.filters.freeText, []);

  const known = parseRelationshipGraphQuery("Not known");
  assert.equal(known.filters.unknownPerson, false);
  assert.equal(known.filters.notKnown, true);
  assert.deepEqual(known.filters.health, []);

  const graph = {
    nodes: [
      { id: "relationship:healthy", kind: "relationship", label: "Quay Healthy", health: "healthy" },
      {
        id: "person:unknown",
        kind: "person",
        label: "Unknown person",
        relationshipId: "healthy",
        role: "contact",
      },
      { id: "relationship:sick", kind: "relationship", label: "Quay Sick", health: "unknown" },
      {
        id: "person:ada",
        kind: "person",
        label: "Ada Lovelace",
        relationshipId: "sick",
        role: "champion",
      },
    ],
    edges: [],
  };
  for (const query of ["Unknown person", "Unknown person.", "show me Unknown person"]) {
    assert.deepEqual(queryRelationshipGraph(graph, query).relationshipIds, ["healthy"]);
  }
  assert.deepEqual(queryRelationshipGraph(graph, "Not known").relationshipIds, ["sick"]);
});

test("asking for a former contact finds that role", () => {
  const parsed = parseRelationshipGraphQuery("Former contact");
  assert.equal(parsed.filters.formerContact, true);
  assert.deepEqual(parsed.filters.lifecycle, []);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["former contact"]);

  const dotted = parseRelationshipGraphQuery("Former contact.");
  assert.equal(dotted.filters.formerContact, true);
  assert.deepEqual(dotted.filters.freeText, []);

  const customer = parseRelationshipGraphQuery("Former customer");
  assert.equal(customer.filters.formerContact, false);
  assert.deepEqual(customer.filters.lifecycle, ["former_customer"]);

  const graph = {
    nodes: [
      { id: "relationship:roles", kind: "relationship", label: "Quay Roles" },
      {
        id: "person:former",
        kind: "person",
        label: "Ada Former",
        relationshipId: "roles",
        role: "former_contact",
      },
      {
        id: "person:primary",
        kind: "person",
        label: "Ada Primary",
        relationshipId: "roles",
        role: "primary_contact",
      },
      { id: "relationship:current", kind: "relationship", label: "Quay Current" },
      {
        id: "person:now",
        kind: "person",
        label: "Ada Now",
        relationshipId: "current",
        role: "contact",
      },
      { id: "relationship:left", kind: "relationship", label: "Quay Left", lifecycle: "former_customer" },
    ],
    edges: [],
  };
  for (const query of ["Former contact", "Former contact.", "show me Former contact"]) {
    assert.deepEqual(queryRelationshipGraph(graph, query).relationshipIds, ["roles"]);
  }
  assert.deepEqual(queryRelationshipGraph(graph, "Former customer").relationshipIds, ["left"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Primary contact").relationshipIds, ["roles"]);
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

test("asking for an activity name finds the detail that prints that name", () => {
  const confirmed = parseRelationshipGraphQuery("Promise confirmed");
  assert.deepEqual(confirmed.filters.nodeLabels, ["promise confirmed"]);
  assert.deepEqual(confirmed.filters.nodeKinds, []);
  assert.deepEqual(confirmed.filters.freeText, []);
  assert.deepEqual(confirmed.applied, ["promise confirmed"]);

  const dotted = parseRelationshipGraphQuery("Promise confirmed.");
  assert.deepEqual(dotted.filters.nodeLabels, ["promise confirmed"]);
  assert.deepEqual(dotted.filters.freeText, []);

  const evidence = parseRelationshipGraphQuery("Promise evidence");
  assert.deepEqual(evidence.filters.nodeLabels, ["promise evidence"]);
  assert.deepEqual(evidence.filters.nodeKinds, []);

  const person = parseRelationshipGraphQuery("Person added");
  assert.deepEqual(person.filters.nodeLabels, ["person added"]);
  assert.deepEqual(person.filters.nodeKinds, []);
  assert.deepEqual(person.filters.freeText, []);

  const note = parseRelationshipGraphQuery("A note");
  assert.deepEqual(note.filters.nodeLabels, ["a note"]);
  assert.deepEqual(note.filters.nodeKinds, []);
  assert.deepEqual(note.filters.freeText, []);

  const voice = parseRelationshipGraphQuery("A voice note");
  assert.deepEqual(voice.filters.nodeLabels, ["a voice note"]);
  assert.deepEqual(voice.filters.nodeKinds, []);
  assert.deepEqual(voice.filters.sources, []);

  const changed = parseRelationshipGraphQuery("Engagement changed");
  assert.deepEqual(changed.filters.nodeLabels, ["engagement changed"]);
  assert.equal(changed.filters.changed, false);
  assert.deepEqual(changed.filters.freeText, []);

  const sent = parseRelationshipGraphQuery("Message sent");
  assert.deepEqual(sent.filters.nodeLabels, ["message sent"]);
  assert.equal(sent.filters.sent, false);
  assert.deepEqual(sent.filters.freeText, []);

  const onboarding = parseRelationshipGraphQuery("Onboarding moved forward");
  assert.deepEqual(onboarding.filters.nodeLabels, ["onboarding moved forward"]);
  assert.deepEqual(onboarding.filters.lifecycle, []);
  assert.deepEqual(onboarding.filters.freeText, []);

  const desktop = parseRelationshipGraphQuery("desktop notes");
  assert.deepEqual(desktop.filters.nodeLabels, []);
  assert.deepEqual(desktop.filters.sources, ["desktop_note"]);

  const graph = {
    nodes: [
      { id: "relationship:confirmed", kind: "relationship", label: "Quay Confirmed" },
      {
        id: "evidence:confirmed",
        kind: "evidence",
        label: "Promise confirmed",
        relationshipId: "confirmed",
      },
      { id: "relationship:word", kind: "relationship", label: "Quay Word" },
      {
        id: "commitment:word",
        kind: "commitment",
        label: "Confirmed the date",
        relationshipId: "word",
        status: "open",
      },
      { id: "relationship:both", kind: "relationship", label: "Quay Both" },
      {
        id: "commitment:both",
        kind: "commitment",
        label: "Send the note",
        relationshipId: "both",
        status: "open",
      },
      {
        id: "evidence:both",
        kind: "evidence",
        label: "Other detail",
        relationshipId: "both",
      },
      { id: "relationship:evidence", kind: "relationship", label: "Quay Evidence" },
      {
        id: "evidence:evidence",
        kind: "evidence",
        label: "Promise evidence",
        relationshipId: "evidence",
      },
      { id: "relationship:added", kind: "relationship", label: "Quay Added" },
      {
        id: "evidence:added",
        kind: "evidence",
        label: "Person added",
        relationshipId: "added",
      },
      { id: "relationship:ada", kind: "relationship", label: "Quay Ada" },
      {
        id: "person:ada",
        kind: "person",
        label: "Ada Lovelace",
        relationshipId: "ada",
        role: "champion",
      },
      { id: "relationship:noted", kind: "relationship", label: "Quay Noted" },
      {
        id: "source:noted",
        kind: "source",
        label: "A note",
        relationshipId: "noted",
        source: "desktop_note",
      },
      { id: "relationship:standup", kind: "relationship", label: "Quay Standup" },
      {
        id: "note:standup",
        kind: "note",
        label: "Standup",
        relationshipId: "standup",
      },
      { id: "relationship:voice", kind: "relationship", label: "Quay Voice" },
      {
        id: "source:voice",
        kind: "source",
        label: "A voice note",
        relationshipId: "voice",
        source: "voice_note",
      },
      { id: "relationship:engaged", kind: "relationship", label: "Quay Engaged" },
      {
        id: "evidence:engaged",
        kind: "evidence",
        label: "Engagement changed",
        relationshipId: "engaged",
      },
      { id: "relationship:shift", kind: "relationship", label: "Quay Shift", changedSinceReview: true },
      { id: "relationship:sent", kind: "relationship", label: "Quay Sent" },
      {
        id: "evidence:sent",
        kind: "evidence",
        label: "Message sent",
        relationshipId: "sent",
      },
      { id: "relationship:out", kind: "relationship", label: "Quay Out" },
      {
        id: "action:out",
        kind: "action",
        label: "Warm follow-up",
        relationshipId: "out",
        executionStatus: "sent",
      },
      { id: "relationship:forward", kind: "relationship", label: "Quay Forward" },
      {
        id: "evidence:forward",
        kind: "evidence",
        label: "Onboarding moved forward",
        relationshipId: "forward",
      },
      {
        id: "relationship:stage",
        kind: "relationship",
        label: "Quay Stage",
        lifecycle: "onboarding",
      },
      { id: "relationship:company", kind: "relationship", label: "Quay Company" },
      {
        id: "evidence:company",
        kind: "evidence",
        label: "Company added",
        relationshipId: "company",
      },
      { id: "relationship:summary", kind: "relationship", label: "Quay Summary" },
      {
        id: "evidence:summary",
        kind: "evidence",
        label: "Harbor joined the workspace",
        status: "Company added",
        relationshipId: "summary",
      },
      { id: "relationship:salt", kind: "relationship", label: "Added Salt" },
      { id: "relationship:mail", kind: "relationship", label: "Quay Mail" },
      {
        id: "evidence:mail",
        kind: "evidence",
        label: "Mail updated",
        relationshipId: "mail",
      },
      { id: "relationship:updated", kind: "relationship", label: "Quay Updated" },
      {
        id: "evidence:updated",
        kind: "evidence",
        label: "Company updated",
        relationshipId: "updated",
      },
      { id: "relationship:record", kind: "relationship", label: "Quay Record" },
      {
        id: "evidence:record",
        kind: "evidence",
        label: "Company record",
        relationshipId: "record",
      },
      { id: "relationship:recorded", kind: "relationship", label: "Quay Recorded" },
      {
        id: "evidence:recorded",
        kind: "evidence",
        label: "Recorded",
        relationshipId: "recorded",
      },
      { id: "relationship:chosen", kind: "relationship", label: "Quay Chosen" },
      {
        id: "evidence:chosen",
        kind: "evidence",
        label: "Detail chosen",
        relationshipId: "chosen",
      },
      { id: "relationship:quote", kind: "relationship", label: "Quay Quote" },
      {
        id: "evidence:quote",
        kind: "evidence",
        label: "A quote was chosen",
        relationshipId: "quote",
      },
    ],
    edges: [],
  };

  for (const query of ["Promise confirmed", "Promise confirmed.", "show me Promise confirmed"]) {
    assert.deepEqual(queryRelationshipGraph(graph, query).relationshipIds, ["confirmed"]);
  }
  assert.deepEqual(queryRelationshipGraph(graph, "Promise evidence").relationshipIds, ["evidence"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Person added").relationshipIds, ["added"]);
  assert.deepEqual(queryRelationshipGraph(graph, "A note").relationshipIds, ["noted"]);
  assert.deepEqual(queryRelationshipGraph(graph, "A note.").relationshipIds, ["noted"]);
  assert.deepEqual(queryRelationshipGraph(graph, "A voice note").relationshipIds, ["voice"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Engagement changed").relationshipIds, ["engaged"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Message sent").relationshipIds, ["sent"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Onboarding moved forward").relationshipIds, ["forward"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Changed since you last looked.").relationshipIds, ["shift"]);

  const company = parseRelationshipGraphQuery("Company added");
  assert.deepEqual(company.filters.nodeLabels, ["company added"]);
  assert.deepEqual(company.filters.nodeKinds, []);
  assert.deepEqual(company.filters.freeText, []);
  assert.deepEqual(parseRelationshipGraphQuery("Company added.").filters.freeText, []);
  assert.deepEqual(parseRelationshipGraphQuery("Company updated").filters.nodeKinds, []);
  assert.deepEqual(parseRelationshipGraphQuery("Company record").filters.nodeLabels, ["company record"]);
  const chosen = parseRelationshipGraphQuery("Detail chosen");
  assert.deepEqual(chosen.filters.nodeLabels, ["detail chosen"]);
  assert.deepEqual(chosen.filters.nodeKinds, []);
  assert.deepEqual(chosen.filters.freeText, []);

  for (const query of ["Company added", "Company added.", "show me Company added"]) {
    assert.deepEqual(queryRelationshipGraph(graph, query).relationshipIds.sort(), ["company", "summary"]);
  }
  assert.deepEqual(queryRelationshipGraph(graph, "Company updated").relationshipIds, ["updated"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Company record").relationshipIds, ["record"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Detail chosen").relationshipIds, ["chosen"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Detail chosen.").relationshipIds, ["chosen"]);
});

test("asking for an activity sentence finds the row that prints it", () => {
  const meeting = parseRelationshipGraphQuery("Meeting with ada@acme.com");
  assert.deepEqual(meeting.filters.rowTitles, ["meeting with ada@acme.com"]);
  assert.deepEqual(meeting.filters.sources, []);
  assert.deepEqual(meeting.filters.freeText, []);

  const mail = parseRelationshipGraphQuery("Mail: Q3 review");
  assert.deepEqual(mail.filters.rowTitles, ["mail: q3 review"]);
  assert.equal(mail.filters.promiseReview, false);
  assert.deepEqual(mail.filters.freeText, []);

  const added = parseRelationshipGraphQuery("You added a person.");
  assert.deepEqual(added.filters.rowTitles, ["you added a person"]);
  assert.deepEqual(added.filters.nodeKinds, []);
  assert.deepEqual(added.filters.freeText, []);

  assert.deepEqual(parseRelationshipGraphQuery("You added Ada.").filters.rowTitles, ["you added ada"]);
  const hubspot = parseRelationshipGraphQuery("Company from HubSpot");
  assert.deepEqual(hubspot.filters.rowTitles, ["company from hubspot"]);
  assert.deepEqual(hubspot.filters.sources, []);
  assert.deepEqual(hubspot.filters.nodeKinds, []);
  const namedHub = parseRelationshipGraphQuery("Company from HubSpot: Acme");
  assert.deepEqual(namedHub.filters.rowTitles, ["company from hubspot: acme"]);
  assert.deepEqual(namedHub.filters.sources, []);
  const slack = parseRelationshipGraphQuery("Message in Slack");
  assert.deepEqual(slack.filters.rowTitles, ["message in slack"]);
  assert.deepEqual(slack.filters.sources, []);
  assert.deepEqual(parseRelationshipGraphQuery("Message in #design").filters.rowTitles, [
    "message in #design",
  ]);
  assert.deepEqual(parseRelationshipGraphQuery("meeting").filters.rowTitles, []);
  assert.deepEqual(parseRelationshipGraphQuery("meeting").filters.sources, ["meeting"]);
  assert.deepEqual(parseRelationshipGraphQuery("hubspot").filters.sources, ["hubspot"]);

  const graph = {
    nodes: [
      { id: "relationship:meet", kind: "relationship", label: "Quay Meet" },
      {
        id: "evidence:meet",
        kind: "evidence",
        label: "Meeting with ada@acme.com",
        status: "Meeting",
        source: "calendar",
        relationshipId: "meet",
      },
      { id: "relationship:source", kind: "relationship", label: "Quay Source" },
      {
        id: "source:meet",
        kind: "source",
        label: "A meeting",
        source: "meeting",
        relationshipId: "source",
      },
      { id: "relationship:mail", kind: "relationship", label: "Quay Mail" },
      {
        id: "evidence:mail",
        kind: "evidence",
        label: "Mail: Q3 review",
        status: "Mail",
        source: "gmail",
        relationshipId: "mail",
      },
      { id: "relationship:review", kind: "relationship", label: "Quay Review" },
      {
        id: "commitment:review",
        kind: "commitment",
        label: "Send the notes",
        status: "review",
        relationshipId: "review",
      },
      { id: "relationship:blank", kind: "relationship", label: "Quay Blank" },
      {
        id: "evidence:blank",
        kind: "evidence",
        label: "You added a person.",
        status: "Person added",
        source: "user",
        relationshipId: "blank",
      },
      { id: "relationship:ada", kind: "relationship", label: "Quay Ada" },
      {
        id: "person:ada",
        kind: "person",
        label: "Ada Lovelace",
        role: "champion",
        relationshipId: "ada",
      },
      {
        id: "evidence:ada",
        kind: "evidence",
        label: "You added Ada.",
        status: "Person added",
        source: "user",
        relationshipId: "ada",
      },
      { id: "relationship:hub", kind: "relationship", label: "Quay Hub" },
      {
        id: "evidence:hub",
        kind: "evidence",
        label: "Company from HubSpot",
        status: "Company record",
        source: "hubspot",
        relationshipId: "hub",
      },
      { id: "relationship:hubonly", kind: "relationship", label: "Quay Hub Only" },
      {
        id: "source:hubonly",
        kind: "source",
        label: "HubSpot",
        source: "hubspot",
        relationshipId: "hubonly",
      },
      { id: "relationship:acme", kind: "relationship", label: "Acme" },
      {
        id: "evidence:acme",
        kind: "evidence",
        label: "Company from HubSpot: Acme",
        source: "hubspot",
        relationshipId: "acme",
      },
      { id: "relationship:slack", kind: "relationship", label: "Quay Slack" },
      {
        id: "evidence:slack",
        kind: "evidence",
        label: "Message in Slack",
        status: "Message",
        source: "slack",
        relationshipId: "slack",
      },
      { id: "relationship:channel", kind: "relationship", label: "Quay Channel" },
      {
        id: "evidence:channel",
        kind: "evidence",
        label: "Message in #design",
        status: "Message",
        source: "slack",
        relationshipId: "channel",
      },
    ],
    edges: [],
  };

  for (const query of ["Meeting with ada@acme.com", "Meeting with ada@acme.com.", "show me Meeting with ada@acme.com"]) {
    assert.deepEqual(queryRelationshipGraph(graph, query).relationshipIds, ["meet"]);
  }
  assert.deepEqual(queryRelationshipGraph(graph, "Mail: Q3 review").relationshipIds, ["mail"]);
  assert.deepEqual(queryRelationshipGraph(graph, "You added a person.").relationshipIds, ["blank"]);
  assert.deepEqual(queryRelationshipGraph(graph, "You added Ada.").relationshipIds, ["ada"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Company from HubSpot").relationshipIds, ["hub"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Company from HubSpot: Acme").relationshipIds, ["acme"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Message in Slack").relationshipIds, ["slack"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Message in #design").relationshipIds, ["channel"]);
});

test("asking for a promise or attendance sentence finds the row that prints it", () => {
  const stillOpen = parseRelationshipGraphQuery("This promise is still open: Send the proposal");
  assert.deepEqual(stillOpen.filters.rowTitles, ["this promise is still open: send the proposal"]);
  assert.equal(stillOpen.filters.open, false);
  assert.deepEqual(stillOpen.filters.nodeKinds, []);
  assert.deepEqual(stillOpen.filters.freeText, []);

  const kept = parseRelationshipGraphQuery("This promise was kept.");
  assert.deepEqual(kept.filters.rowTitles, ["this promise was kept"]);
  assert.equal(kept.filters.kept, false);
  assert.deepEqual(kept.filters.nodeKinds, []);

  const ours = parseRelationshipGraphQuery("We made this promise: Send the proposal");
  assert.deepEqual(ours.filters.rowTitles, ["we made this promise: send the proposal"]);
  assert.deepEqual(ours.filters.nodeKinds, []);
  assert.equal(ours.filters.direction, "");

  const outside = parseRelationshipGraphQuery("1 person from outside the company on Q3 review");
  assert.deepEqual(outside.filters.rowTitles, [
    "1 person from outside the company on q3 review",
  ]);
  assert.deepEqual(outside.filters.nodeKinds, []);
  assert.equal(outside.filters.promiseReview, false);
  assert.deepEqual(outside.filters.freeText, []);

  const transcript = parseRelationshipGraphQuery(
    "Q3 review · 12 lines in the transcript · 3 claims",
  );
  assert.deepEqual(transcript.filters.rowTitles, [
    "q3 review · 12 lines in the transcript · 3 claims",
  ]);
  assert.equal(transcript.filters.promiseReview, false);
  assert.deepEqual(transcript.filters.freeText, []);

  const risk = parseRelationshipGraphQuery(
    "Risk raised in a conversation: the renewal slipped",
  );
  assert.deepEqual(risk.filters.rowTitles, [
    "risk raised in a conversation: the renewal slipped",
  ]);
  assert.deepEqual(risk.filters.nodeKinds, []);
  assert.deepEqual(risk.filters.lifecycle, []);

  const lifecycle = parseRelationshipGraphQuery("Lifecycle: Active customer");
  assert.deepEqual(lifecycle.filters.rowTitles, ["lifecycle: active customer"]);
  assert.deepEqual(lifecycle.filters.lifecycle, []);
  assert.deepEqual(lifecycle.filters.freeText, []);

  const sentiment = parseRelationshipGraphQuery("Sentiment: Negative");
  assert.deepEqual(sentiment.filters.rowTitles, ["sentiment: negative"]);
  assert.deepEqual(sentiment.filters.sentiment, []);

  assert.deepEqual(parseRelationshipGraphQuery("Promise: Send the proposal").filters.nodeKinds, []);
  assert.deepEqual(parseRelationshipGraphQuery("Milestone: kickoff complete").filters.nodeKinds, []);
  assert.deepEqual(
    parseRelationshipGraphQuery("Person: Avery Chen is the champion").filters.nodeKinds,
    [],
  );
  assert.deepEqual(
    parseRelationshipGraphQuery("Decision: We decided to renew.").filters.lifecycle,
    [],
  );
  assert.deepEqual(
    parseRelationshipGraphQuery("Decision: We decided to renew.").filters.rowTitles,
    ["decision: we decided to renew"],
  );
  assert.deepEqual(parseRelationshipGraphQuery("Unresolved objection").filters.rowTitles, []);
  assert.equal(parseRelationshipGraphQuery("open").filters.open, true);
  assert.deepEqual(parseRelationshipGraphQuery("open").filters.rowTitles, []);
  assert.equal(parseRelationshipGraphQuery("kept").filters.kept, true);
  assert.deepEqual(parseRelationshipGraphQuery("promises").filters.nodeKinds, ["commitment"]);
  assert.equal(parseRelationshipGraphQuery("review").filters.promiseReview, true);
  assert.deepEqual(parseRelationshipGraphQuery("active customer").filters.lifecycle, ["active_customer"]);
  assert.deepEqual(parseRelationshipGraphQuery("active customer").filters.rowTitles, []);
  assert.deepEqual(parseRelationshipGraphQuery("negative").filters.sentiment, ["negative"]);
  assert.deepEqual(parseRelationshipGraphQuery("negative").filters.rowTitles, []);
  assert.deepEqual(parseRelationshipGraphQuery("risk").filters.nodeKinds, ["risk"]);
  assert.deepEqual(parseRelationshipGraphQuery("risk").filters.rowTitles, []);

  const graph = {
    nodes: [
      { id: "relationship:open", kind: "relationship", label: "Quay Open" },
      {
        id: "evidence:open",
        kind: "evidence",
        label: "This promise is still open: Send the proposal",
        status: "Promise updated",
        source: "meeting",
        relationshipId: "open",
      },
      { id: "relationship:promise", kind: "relationship", label: "Quay Promise" },
      {
        id: "commitment:promise",
        kind: "commitment",
        label: "Send the proposal",
        status: "open",
        relationshipId: "promise",
      },
      { id: "relationship:kept", kind: "relationship", label: "Quay Kept" },
      {
        id: "evidence:kept",
        kind: "evidence",
        label: "This promise was kept",
        status: "Promise updated",
        relationshipId: "kept",
      },
      { id: "relationship:met", kind: "relationship", label: "Quay Met" },
      {
        id: "commitment:met",
        kind: "commitment",
        label: "Send the proposal",
        status: "fulfilled",
        relationshipId: "met",
      },
      { id: "relationship:we", kind: "relationship", label: "Quay We" },
      {
        id: "evidence:we",
        kind: "evidence",
        label: "Promise confirmed",
        summary: "We made this promise: Send the proposal",
        status: "Promise confirmed",
        source: "meeting",
        relationshipId: "we",
      },
      { id: "relationship:they", kind: "relationship", label: "Quay They" },
      {
        id: "evidence:they",
        kind: "evidence",
        label: "Promise confirmed",
        summary: "They made this promise.",
        status: "Promise confirmed",
        relationshipId: "they",
      },
      { id: "relationship:ada", kind: "relationship", label: "Quay Ada" },
      {
        id: "evidence:ada",
        kind: "evidence",
        label: "Promise confirmed",
        summary: "Ada Mesa made this promise: Send the proposal",
        status: "Promise confirmed",
        relationshipId: "ada",
      },
      { id: "relationship:room", kind: "relationship", label: "Quay Room" },
      {
        id: "evidence:room",
        kind: "evidence",
        label: "1 person from outside the company on Q3 review",
        status: "Meeting",
        source: "calendar",
        relationshipId: "room",
      },
      { id: "relationship:crowd", kind: "relationship", label: "Quay Crowd" },
      {
        id: "evidence:crowd",
        kind: "evidence",
        label: "2 people from outside the company on Q3 review",
        status: "Meeting",
        relationshipId: "crowd",
      },
      { id: "relationship:none", kind: "relationship", label: "Quay None" },
      {
        id: "evidence:none",
        kind: "evidence",
        label: "No one from outside the company on Q3 review",
        status: "Meeting",
        relationshipId: "none",
      },
      { id: "relationship:talk", kind: "relationship", label: "Quay Talk" },
      {
        id: "evidence:talk",
        kind: "evidence",
        label: "Q3 review · 12 lines in the transcript · 3 claims",
        status: "Meeting",
        source: "meeting",
        relationshipId: "talk",
      },
      { id: "relationship:line", kind: "relationship", label: "Quay Line" },
      {
        id: "evidence:line",
        kind: "evidence",
        label: "Q3 review · 1 line in the transcript · 1 claim",
        status: "Meeting",
        relationshipId: "line",
      },
      { id: "relationship:review", kind: "relationship", label: "Quay Review" },
      {
        id: "commitment:review",
        kind: "commitment",
        label: "Q3 review",
        status: "review",
        relationshipId: "review",
      },
      { id: "relationship:risk", kind: "relationship", label: "Quay Risk" },
      {
        id: "evidence:risk",
        kind: "evidence",
        label: "Risk raised in a conversation: the renewal slipped",
        status: "Meeting",
        relationshipId: "risk",
      },
      { id: "relationship:life", kind: "relationship", label: "Quay Life", lifecycle: "prospect" },
      {
        id: "evidence:life",
        kind: "evidence",
        label: "Lifecycle: Active customer",
        relationshipId: "life",
      },
      { id: "relationship:feel", kind: "relationship", label: "Quay Feel", sentiment: "positive" },
      {
        id: "evidence:feel",
        kind: "evidence",
        label: "Sentiment: Negative",
        relationshipId: "feel",
      },
      { id: "relationship:mile", kind: "relationship", label: "Quay Mile" },
      {
        id: "evidence:mile",
        kind: "evidence",
        label: "Milestone: kickoff complete",
        relationshipId: "mile",
      },
      { id: "relationship:word", kind: "relationship", label: "Quay Word" },
      {
        id: "evidence:word",
        kind: "evidence",
        label: "Promise: Send the proposal",
        relationshipId: "word",
      },
    ],
    edges: [],
  };

  for (const query of [
    "This promise is still open: Send the proposal",
    "This promise is still open: Send the proposal.",
    "show me This promise is still open: Send the proposal",
  ]) {
    assert.deepEqual(queryRelationshipGraph(graph, query).relationshipIds, ["open"]);
  }
  assert.deepEqual(queryRelationshipGraph(graph, "This promise was kept").relationshipIds, ["kept"]);
  assert.deepEqual(queryRelationshipGraph(graph, "This promise was called off: Send the proposal").relationshipIds, []);
  assert.deepEqual(
    queryRelationshipGraph(graph, "We made this promise: Send the proposal").relationshipIds,
    ["we"],
  );
  assert.deepEqual(queryRelationshipGraph(graph, "They made this promise.").relationshipIds, ["they"]);
  assert.deepEqual(
    queryRelationshipGraph(graph, "show me Ada Mesa made this promise: Send the proposal").relationshipIds,
    ["ada"],
  );
  assert.deepEqual(
    queryRelationshipGraph(graph, "1 person from outside the company on Q3 review").relationshipIds,
    ["room"],
  );
  assert.deepEqual(
    queryRelationshipGraph(graph, "2 people from outside the company on Q3 review").relationshipIds,
    ["crowd"],
  );
  assert.deepEqual(
    queryRelationshipGraph(graph, "No one from outside the company on Q3 review").relationshipIds,
    ["none"],
  );
  assert.deepEqual(
    queryRelationshipGraph(graph, "Q3 review · 12 lines in the transcript · 3 claims").relationshipIds,
    ["talk"],
  );
  assert.deepEqual(
    queryRelationshipGraph(graph, "Q3 review · 1 line in the transcript · 1 claim").relationshipIds,
    ["line"],
  );
  assert.deepEqual(
    queryRelationshipGraph(graph, "Risk raised in a conversation: the renewal slipped").relationshipIds,
    ["risk"],
  );
  assert.deepEqual(queryRelationshipGraph(graph, "Lifecycle: Active customer").relationshipIds, ["life"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Sentiment: Negative").relationshipIds, ["feel"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Milestone: kickoff complete").relationshipIds, ["mile"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Promise: Send the proposal").relationshipIds, ["word"]);
  assert.deepEqual(queryRelationshipGraph(graph, "open").relationshipIds, ["promise"]);
  assert.deepEqual(queryRelationshipGraph(graph, "kept").relationshipIds, ["met"]);
});

test("asking for a hyphenated name finds the row that prints the hyphen", () => {
  const parsed = parseRelationshipGraphQuery("Nova-3");
  assert.deepEqual(parsed.filters.freeText, ["nova_3"]);
  assert.deepEqual(parsed.filters.sources, []);

  const model = parseRelationshipGraphQuery("Model: Nova-3");
  assert.deepEqual(model.filters.freeText, ["model", "nova_3"]);

  const graph = {
    nodes: [
      { id: "relationship:nova", kind: "relationship", label: "Nova-3" },
      {
        id: "evidence:nova",
        kind: "evidence",
        label: "Model: Nova-3",
        status: "Meeting",
        source: "meeting",
        relationshipId: "nova",
      },
      { id: "relationship:acme", kind: "relationship", label: "Acme-Corp" },
      { id: "relationship:plain", kind: "relationship", label: "Acme Corp" },
    ],
    edges: [],
  };

  assert.deepEqual(queryRelationshipGraph(graph, "Nova-3").relationshipIds, ["nova"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Model: Nova-3").relationshipIds, ["nova"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Acme-Corp").relationshipIds, ["acme"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Acme Corp").relationshipIds.sort(), ["acme", "plain"]);
});

test("asking meeting finds a calendar row whose status is Meeting", () => {
  const parsed = parseRelationshipGraphQuery("Meeting");
  assert.deepEqual(parsed.filters.sources, ["meeting"]);
  assert.deepEqual(parsed.filters.freeText, []);

  const graph = {
    nodes: [
      { id: "relationship:cal", kind: "relationship", label: "Quay Calendar" },
      {
        id: "evidence:cal",
        kind: "evidence",
        label: "Q3 review",
        status: "Meeting",
        source: "calendar",
        relationshipId: "cal",
      },
      { id: "relationship:updated", kind: "relationship", label: "Quay Updated" },
      {
        id: "evidence:updated",
        kind: "evidence",
        label: "The guest list changed",
        status: "Meeting updated",
        source: "calendar",
        relationshipId: "updated",
      },
      { id: "relationship:source", kind: "relationship", label: "Quay Source" },
      {
        id: "source:meet",
        kind: "source",
        label: "A meeting",
        source: "meeting",
        relationshipId: "source",
      },
      { id: "relationship:mail", kind: "relationship", label: "Quay Mail" },
      {
        id: "evidence:mail",
        kind: "evidence",
        label: "Mail: Q3 review",
        status: "Mail",
        source: "gmail",
        relationshipId: "mail",
      },
      { id: "relationship:follow", kind: "relationship", label: "Quay Follow" },
      {
        id: "action:follow",
        kind: "action",
        label: "Meeting follow-up",
        status: "open",
        relationshipId: "follow",
      },
    ],
    edges: [],
  };

  assert.deepEqual(queryRelationshipGraph(graph, "Meeting").relationshipIds.sort(), [
    "cal",
    "source",
    "updated",
  ]);
  assert.deepEqual(queryRelationshipGraph(graph, "show me the meeting").relationshipIds.sort(), [
    "cal",
    "source",
    "updated",
  ]);
  assert.deepEqual(queryRelationshipGraph(graph, "Meeting updated").relationshipIds, ["updated"]);
});

test("asking out of date finds a source whose status is Out of date", () => {
  const parsed = parseRelationshipGraphQuery("Out of date");
  assert.equal(parsed.filters.stale, true);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["out of date"]);

  const withPeriod = parseRelationshipGraphQuery("Out of date.");
  assert.equal(withPeriod.filters.stale, true);
  assert.deepEqual(withPeriod.filters.freeText, []);

  const graph = {
    nodes: [
      { id: "relationship:cadence", kind: "relationship", label: "Quay Cadence" },
      {
        id: "source:cadence",
        kind: "source",
        label: "Gmail",
        status: "stale",
        freshness: "current",
        source: "gmail",
        relationshipId: "cadence",
      },
      { id: "relationship:old", kind: "relationship", label: "Quay Dated" },
      {
        id: "evidence:old",
        kind: "evidence",
        label: "The quay note",
        status: "Note saved",
        freshness: "stale",
        source: "desktop_note",
        relationshipId: "old",
      },
      { id: "relationship:live", kind: "relationship", label: "Quay Live" },
      {
        id: "source:live",
        kind: "source",
        label: "Slack",
        status: "live",
        freshness: "current",
        source: "slack",
        relationshipId: "live",
      },
    ],
    edges: [],
  };

  assert.deepEqual(queryRelationshipGraph(graph, "Out of date").relationshipIds.sort(), [
    "cadence",
    "old",
  ]);
  assert.deepEqual(queryRelationshipGraph(graph, "Out of date.").relationshipIds.sort(), [
    "cadence",
    "old",
  ]);
  assert.deepEqual(queryRelationshipGraph(graph, "up to date").relationshipIds.sort(), [
    "cadence",
    "live",
  ]);
});

test("asking for a mail thread sentence finds the row that prints it", () => {
  const outside = parseRelationshipGraphQuery("1 message with someone outside the company");
  assert.deepEqual(outside.filters.rowTitles, ["1 message with someone outside the company"]);
  assert.deepEqual(outside.filters.nodeKinds, []);
  assert.deepEqual(outside.filters.freeText, []);

  const outsidePeriod = parseRelationshipGraphQuery("1 message with someone outside the company.");
  assert.deepEqual(outsidePeriod.filters.rowTitles, ["1 message with someone outside the company"]);
  assert.deepEqual(outsidePeriod.filters.freeText, []);

  const review = parseRelationshipGraphQuery("4 messages with Q3 review");
  assert.deepEqual(review.filters.rowTitles, ["4 messages with q3 review"]);
  assert.equal(review.filters.promiseReview, false);
  assert.deepEqual(review.filters.freeText, []);

  const domain = parseRelationshipGraphQuery("4 messages with acme.com");
  assert.deepEqual(domain.filters.rowTitles, ["4 messages with acme.com"]);
  assert.deepEqual(domain.filters.freeText, []);

  assert.deepEqual(parseRelationshipGraphQuery("1 messages with acme.com").filters.rowTitles, []);
  assert.deepEqual(parseRelationshipGraphQuery("2 message with acme.com").filters.rowTitles, []);
  assert.deepEqual(parseRelationshipGraphQuery("01 messages with acme.com").filters.rowTitles, []);
  assert.deepEqual(parseRelationshipGraphQuery("messages").filters.rowTitles, []);

  const graph = {
    nodes: [
      { id: "relationship:out", kind: "relationship", label: "Quay Out" },
      {
        id: "evidence:out",
        kind: "evidence",
        label: "1 message with someone outside the company",
        status: "Mail",
        source: "gmail",
        relationshipId: "out",
      },
      { id: "relationship:named", kind: "relationship", label: "Someone Outside Company" },
      { id: "relationship:review", kind: "relationship", label: "Quay Review" },
      {
        id: "evidence:review",
        kind: "evidence",
        label: "4 messages with Q3 review",
        status: "Mail",
        source: "gmail",
        relationshipId: "review",
      },
      { id: "relationship:promise", kind: "relationship", label: "Quay Promise" },
      {
        id: "commitment:promise",
        kind: "commitment",
        label: "Send the notes",
        status: "review",
        relationshipId: "promise",
      },
      { id: "relationship:domain", kind: "relationship", label: "Quay Domain" },
      {
        id: "evidence:domain",
        kind: "evidence",
        label: "4 messages with acme.com",
        status: "Mail",
        source: "gmail",
        relationshipId: "domain",
      },
      { id: "relationship:one", kind: "relationship", label: "Quay One" },
      {
        id: "evidence:one",
        kind: "evidence",
        label: "1 message with acme.com",
        status: "Mail",
        source: "gmail",
        relationshipId: "one",
      },
    ],
    edges: [],
  };

  for (const query of [
    "1 message with someone outside the company",
    "1 message with someone outside the company.",
    "show me 1 message with someone outside the company",
  ]) {
    assert.deepEqual(queryRelationshipGraph(graph, query).relationshipIds, ["out"]);
  }
  assert.deepEqual(queryRelationshipGraph(graph, "4 messages with Q3 review").relationshipIds, [
    "review",
  ]);
  assert.deepEqual(queryRelationshipGraph(graph, "4 messages with acme.com").relationshipIds, [
    "domain",
  ]);
  assert.deepEqual(queryRelationshipGraph(graph, "1 message with acme.com").relationshipIds, ["one"]);
});

test("a trailing period still finds the badge it follows", () => {
  const declining = parseRelationshipGraphQuery("Declining.");
  assert.deepEqual(declining.filters.engagement, ["declining"]);
  assert.deepEqual(declining.filters.freeText, []);

  const active = parseRelationshipGraphQuery("Active.");
  assert.equal(active.filters.sourceActive, true);
  assert.deepEqual(active.filters.freeText, []);

  const open = parseRelationshipGraphQuery("Open.");
  assert.equal(open.filters.open, true);
  assert.deepEqual(open.filters.freeText, []);

  const healthy = parseRelationshipGraphQuery("Healthy.");
  assert.deepEqual(healthy.filters.health, ["healthy"]);
  assert.deepEqual(healthy.filters.freeText, []);

  const graph = {
    nodes: [
      {
        id: "relationship:slide",
        kind: "relationship",
        label: "Quay Slide",
        engagement: "declining",
        health: "unknown",
      },
      {
        id: "relationship:well",
        kind: "relationship",
        label: "Quay Well",
        health: "healthy",
        engagement: "steady",
      },
      { id: "relationship:live", kind: "relationship", label: "Quay Live" },
      {
        id: "source:live",
        kind: "source",
        label: "Gmail",
        status: "live",
        freshness: "current",
        source: "gmail",
        relationshipId: "live",
      },
      { id: "relationship:open", kind: "relationship", label: "Quay Open" },
      {
        id: "commitment:open",
        kind: "commitment",
        label: "Send the proposal",
        status: "open",
        relationshipId: "open",
      },
      {
        id: "relationship:plain",
        kind: "relationship",
        label: "Quay Plain",
        engagement: "unknown",
        health: "unknown",
      },
    ],
    edges: [],
  };

  assert.deepEqual(queryRelationshipGraph(graph, "Declining.").relationshipIds, ["slide"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Healthy.").relationshipIds, ["well"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Active.").relationshipIds, ["live"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Open.").relationshipIds, ["open"]);
});

test("a trailing period still finds a badge stored without one", () => {
  const closed = parseRelationshipGraphQuery("Closed.");
  assert.deepEqual(closed.filters.freeText, ["closed"]);
  const sponsor = parseRelationshipGraphQuery("Executive sponsor.");
  assert.deepEqual(sponsor.filters.freeText, ["executive", "sponsor"]);
  const reconnect = parseRelationshipGraphQuery("Reconnect required.");
  assert.deepEqual(reconnect.filters.freeText, ["reconnect", "required"]);

  const graph = {
    nodes: [
      {
        id: "relationship:closed",
        kind: "relationship",
        label: "Quay Closed",
        status: "closed",
        engagement: "steady",
      },
      {
        id: "relationship:archived",
        kind: "relationship",
        label: "Quay Archived",
        status: "archived",
      },
      {
        id: "relationship:open",
        kind: "relationship",
        label: "Quay Open",
        status: "active",
        engagement: "increasing",
      },
      { id: "relationship:down", kind: "relationship", label: "Quay Down" },
      {
        id: "source:down",
        kind: "source",
        label: "Gmail",
        status: "disconnected",
        source: "gmail",
        relationshipId: "down",
      },
      { id: "relationship:live", kind: "relationship", label: "Quay Live" },
      {
        id: "source:live",
        kind: "source",
        label: "Slack",
        status: "live",
        source: "slack",
        relationshipId: "live",
      },
      { id: "relationship:again", kind: "relationship", label: "Quay Again" },
      {
        id: "source:again",
        kind: "source",
        label: "HubSpot",
        status: "reconnect_required",
        source: "hubspot",
        relationshipId: "again",
      },
      { id: "relationship:later", kind: "relationship", label: "Quay Later" },
      {
        id: "action:later",
        kind: "action",
        label: "Follow up",
        status: "snoozed",
        relationshipId: "later",
      },
      { id: "relationship:ada", kind: "relationship", label: "Quay Ada" },
      {
        id: "person:ada",
        kind: "person",
        label: "Ada Mesa",
        role: "executive_sponsor",
        relationshipId: "ada",
      },
      {
        id: "person:primary",
        kind: "person",
        label: "Ren Park",
        role: "primary_contact",
        relationshipId: "ada",
      },
    ],
    edges: [],
  };

  assert.deepEqual(queryRelationshipGraph(graph, "Closed.").relationshipIds, ["closed"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Archived.").relationshipIds, ["archived"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Disconnected.").relationshipIds, ["down"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Reconnect required.").relationshipIds, ["again"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Snoozed.").relationshipIds, ["later"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Executive sponsor.").relationshipIds, ["ada"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Primary contact.").relationshipIds, ["ada"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Active.").relationshipIds, ["live"]);
});

test("asking dormant finds a company whose status is Dormant", () => {
  const parsed = parseRelationshipGraphQuery("Dormant");
  assert.deepEqual(parsed.filters.engagement, ["dormant"]);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parseRelationshipGraphQuery("Dormant.").filters.freeText, []);

  const graph = {
    nodes: [
      {
        id: "relationship:account",
        kind: "relationship",
        label: "Quay Account",
        status: "dormant",
        engagement: "steady",
        health: "healthy",
      },
      {
        id: "relationship:quiet",
        kind: "relationship",
        label: "Quay Quiet",
        status: "active",
        engagement: "dormant",
        health: "healthy",
      },
      {
        id: "relationship:busy",
        kind: "relationship",
        label: "Quay Busy",
        status: "active",
        engagement: "increasing",
        health: "healthy",
      },
    ],
    edges: [],
  };

  for (const query of ["Dormant", "Dormant.", "show me dormant"]) {
    assert.deepEqual(queryRelationshipGraph(graph, query).relationshipIds.sort(), [
      "account",
      "quiet",
    ]);
  }
  assert.deepEqual(queryRelationshipGraph(graph, "Steady").relationshipIds, ["account"]);
  assert.deepEqual(queryRelationshipGraph(graph, "Increasing").relationshipIds, ["busy"]);
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
