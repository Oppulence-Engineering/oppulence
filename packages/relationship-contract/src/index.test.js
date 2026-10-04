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
  assert.deepEqual(parsed.filters.health, ["unknown"]);
  assert.deepEqual(parsed.filters.freeText, []);
  assert.deepEqual(parsed.applied, ["health: unknown"]);

  const hyphenated = parseRelationshipGraphQuery("not-known");
  assert.deepEqual(hyphenated.filters.health, ["unknown"]);
  assert.deepEqual(hyphenated.filters.freeText, []);

  const graph = {
    nodes: [
      { id: "relationship:plain", kind: "relationship", label: "Quay Plain", health: "unknown" },
      { id: "relationship:healthy", kind: "relationship", label: "Quay Healthy", health: "healthy" },
    ],
    edges: [],
  };
  const result = queryRelationshipGraph(graph, "not known");
  assert.deepEqual(result.relationshipIds, ["plain"]);
  assert.equal(result.visibleNodeIds.includes("relationship:healthy"), false);
  assert.equal(result.answer, "1 relationship matches health: unknown.");
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
