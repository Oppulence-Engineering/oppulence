import { describe, expect, it } from "vitest";

import {
  approvalDecisionCopy,
  conversationFromAgentEvents,
  friendlyAgentError,
  parseAgentSessionEventsResponse,
  parseAgentSessionsResponse,
  runFailedCopy,
  runLimitCopy,
  shownAgentError,
  toolArgumentsVisible,
  toolFailureCopy,
  toolResultCopy,
} from "@/lib/agents/agent-history";

it("hides model and workflow details from agent failures", () => {
  expect(
    friendlyAgentError(
      "activity error: agent llm call: llm upstream returned status 402: openrouter_credits",
    ),
  ).toBe(
    "Oppulence cannot reach the model right now. Your workspace credits were not charged. Try again later.",
  );
  expect(friendlyAgentError("upstream provider account is out of credits")).toBe(
    "Oppulence cannot reach the model right now. Your workspace credits were not charged. Try again later.",
  );
  expect(friendlyAgentError("insufficient_credits")).toBe(
    "This workspace is out of AI credits. Ask an administrator to add credits, then try again.",
  );
  expect(friendlyAgentError("insufficient credits for cloud run preflight", "run")).toBe(
    "This workspace is out of AI credits. Ask an administrator to add credits, then try again.",
  );
  expect(friendlyAgentError("subscription not active for cloud run preflight", "run")).toBe(
    "An active subscription is required before this workflow can run.",
  );
  expect(friendlyAgentError("daily credit limit exceeded for cloud run preflight", "run")).toBe(
    "This workspace has used its daily AI credits. Try again tomorrow.",
  );
  expect(friendlyAgentError("monthly credit limit exceeded for cloud run preflight", "run")).toBe(
    "This workspace has used its monthly AI credits.",
  );
  expect(friendlyAgentError("cloud run queue is at global capacity", "run")).toBe(
    "Too many workflows are running right now. Try again in a moment.",
  );
  expect(friendlyAgentError("cloud run start rate limit exceeded for this user", "run")).toBe(
    "Too many requests were sent from this workspace. Wait a moment, then try again.",
  );
  expect(
    friendlyAgentError(
      'activity error (type: rowboat.agent.llm_complete.v1): llm upstream returned status 401: {"error":{"message":"Missing Authentication header","code":401}}',
    ),
  ).toBe("The model rejected the API key for this workspace. Nothing was charged.");
  expect(friendlyAgentError("activity error: scheduledEventID=1 startedEventID=2")).toBe(
    "The agent could not complete this request. Please try again.",
  );
  expect(
    friendlyAgentError(
      "llm_call_failed: activity error (type: rowboat.background_tasks.execute_api_task.v1, scheduledEventID: 11): llm upstream returned status 401: Missing Authentication header",
      "run",
    ),
  ).toBe("The model rejected the API key for this workspace. Nothing was charged.");
  expect(friendlyAgentError("activity error: scheduledEventID=1", "run")).toBe(
    "This run could not finish. Please try again.",
  );
  expect(
    friendlyAgentError(
      "activity error (type: rowboat.background_tasks.execute_api_task.v1, scheduledEventID: 11): connector_unavailable: google is not connected for this user",
      "run",
    ),
  ).toBe("Connect Google, then try again.");
  expect(
    friendlyAgentError(
      "activity error: connector_unavailable: google refresh token is invalid; the user must reconnect",
      "run",
    ),
  ).toBe("Google stopped accepting the sign-in. Reconnect, then try again.");
  expect(
    friendlyAgentError(
      "connector_unavailable: google connection is missing the https://www.googleapis.com/auth/gmail.readonly scope; reconnect Google to grant it",
      "run",
    ),
  ).toBe("Google is missing a permission. Reconnect, then try again.");
  expect(
    friendlyAgentError(
      "activity error: connector_unavailable: could not obtain a google access token",
      "run",
    ),
  ).toBe("Google could not authorize this. Reconnect, then try again.");
  expect(
    friendlyAgentError(
      "activity error: connector_unavailable: HubSpot is not connected for this user",
      "run",
    ),
  ).toBe("Connect HubSpot, then try again.");
  expect(friendlyAgentError("HubSpot is not configured on this server", "run")).toBe(
    "HubSpot is not set up for this workspace yet.",
  );
  expect(
    friendlyAgentError(
      "that product is not connected yet; link it under Settings, Connected Accounts, More products",
      "run",
    ),
  ).toBe("Connect that product under Settings, then try again.");
  expect(friendlyAgentError("Composio is not configured on this server", "run")).toBe(
    "More products are not set up for this workspace yet.",
  );
  expect(friendlyAgentError("Composio rejected this deployment's project key", "run")).toBe(
    "More products could not be reached. Try again later.",
  );
  expect(friendlyAgentError("sandbox executor is not configured", "run")).toBe(
    "Running code is not set up for this workspace yet.",
  );
  expect(friendlyAgentError("sandbox image is not configured", "run")).toBe(
    "Running code is not set up for this workspace yet.",
  );
  expect(friendlyAgentError("sandbox execution failed: exit 1", "run")).toBe(
    "The code could not finish. Try again.",
  );
  expect(
    friendlyAgentError(
      "tool_not_allowed: tool is not on the allowlist or the run's scope does not permit it",
      "run",
    ),
  ).toBe("This tool is not available in this run.");
  expect(
    friendlyAgentError(
      "tool is not on the allowlist or the run's scope does not permit it",
    ),
  ).toBe("This tool is not available in this chat.");
  expect(friendlyAgentError("llm_call_failed: llm gateway call failed: dial timeout", "run")).toBe(
    "The model could not be reached. Try again.",
  );
  expect(friendlyAgentError("event_bytes limit exceeded (9000 > 1000)", "run")).toBe(
    "This run reached its limit.",
  );
  expect(friendlyAgentError("The agent was canceled.")).toBe("The agent was canceled.");
  expect(friendlyAgentError("rate limit exceeded")).toBe(
    "Too many requests were sent from this workspace. Wait a moment, then try again.",
  );
  expect(friendlyAgentError("Could not delete agent (429)")).toBe(
    "Too many requests were sent from this workspace. Wait a moment, then try again.",
  );
  expect(friendlyAgentError("Agent stream failed (429)")).toBe(
    "Too many requests were sent from this workspace. Wait a moment, then try again.",
  );
  expect(approvalDecisionCopy("granted")).toBe("Approved");
  expect(approvalDecisionCopy("denied")).toBe("Denied");
  expect(approvalDecisionCopy("resolving")).toBe("Submitting decision…");
  expect(toolFailureCopy("not on the allowlist for this session")).toBe(
    "This tool is not available in this chat.",
  );
  expect(toolFailureCopy("tool requires approval but HITL is disabled")).toBe(
    "This tool needs approval, and approval is turned off.",
  );
  expect(toolFailureCopy("subagents disabled")).toBe(
    "Related agents are turned off for this chat.",
  );
  expect(toolFailureCopy("denied by registry")).toBe("This tool is not allowed.");
  expect(toolFailureCopy("llm_call_failed")).toBe("This tool could not finish.");
  expect(toolFailureCopy("The mailbox is busy.")).toBe("The mailbox is busy.");
  expect(toolResultCopy({ resultBytes: 42 })).toBe("Finished.");
  expect(toolResultCopy({ subject: "Hello" })).toBeNull();
  expect(toolArgumentsVisible({})).toBe(false);
  expect(toolArgumentsVisible({ company: "Acme" })).toBe(true);
  expect(runLimitCopy()).toBe("This run reached its limit.");
  expect(runFailedCopy()).toBe("This run could not finish.");
});

describe("shownAgentError", () => {
  it("replaces a bare status and keeps a specific sentence", () => {
    const send = "Failed to send message";
    expect(shownAgentError(new Error("Request failed: 500 Internal Server Error"), send)).toBe(
      send,
    );
    expect(shownAgentError(new Error("Request failed (500)"), send)).toBe(send);
    expect(
      shownAgentError(new Error("Failed to load file (500)"), "Could not load this file."),
    ).toBe("Could not load this file.");
    expect(
      shownAgentError(new Error("Failed to save file (500)"), "Could not save this file."),
    ).toBe("Could not save this file.");
    expect(
      shownAgentError(new Error("Could not delete agent (500)"), "Could not delete this agent."),
    ).toBe("Could not delete this agent.");
    expect(shownAgentError(new Error("The agent was canceled."), send)).toBe(
      "The agent was canceled.",
    );
    expect(shownAgentError(new Error("Request failed: 429 Too Many Requests"), send)).toBe(
      "Too many requests were sent from this workspace. Wait a moment, then try again.",
    );
    expect(shownAgentError("nope", "Could not load conversation")).toBe(
      "Could not load conversation",
    );
  });
});

describe("conversationFromAgentEvents", () => {
  it("reconstructs durable messages, tools, and approvals", () => {
    const items = conversationFromAgentEvents([
      { seq: 1, type: "agent.turn_started", turnSeq: 1, data: { input: "Review Acme" } },
      {
        seq: 2,
        type: "agent.tool_call_started",
        turnSeq: 1,
        data: { callIndex: 0, tool: "crm.lookup" },
      },
      {
        seq: 3,
        type: "agent.tool_call_completed",
        turnSeq: 1,
        data: { callIndex: 0, tool: "crm.lookup", resultBytes: 42 },
      },
      {
        seq: 4,
        type: "agent.approval_requested",
        turnSeq: 1,
        data: { approvalId: "approval-1", tool: "slack.post", trustTier: "act" },
      },
      {
        seq: 5,
        type: "agent.approval_resolved",
        turnSeq: 1,
        data: { approvalId: "approval-1", decision: "granted" },
      },
      { seq: 6, type: "agent.message", turnSeq: 1, data: { content: "Acme is healthy." } },
    ]);

    expect(
      items.map((item) => [item.type, item.type === "message" ? item.role : item.status]),
    ).toEqual([
      ["message", "user"],
      ["tool", "completed"],
      ["approval", "granted"],
      ["message", "assistant"],
    ]);
  });

  it("validates durable history responses at the API boundary", () => {
    expect(
      parseAgentSessionsResponse({
        sessions: [
          {
            sessionId: "session-1",
            agent: "assistant",
            agentSource: null,
            channel: "web",
            continuationToken: null,
            costUnits: 0,
            title: null,
            createdAt: "2026-09-02T12:00:00Z",
            error: null,
            errorCode: null,
            lastActivityAt: null,
            llmCalls: 0,
            status: "active",
            toolCalls: 0,
            turns: 0,
          },
        ],
      }),
    ).toHaveLength(1);
    expect(
      parseAgentSessionEventsResponse({
        events: [{ seq: 0, type: "agent.message", data: { content: "Done" } }],
        nextSeq: null,
      }).events,
    ).toHaveLength(1);
    expect(() => parseAgentSessionsResponse({ sessions: [{ sessionId: 1 }] })).toThrow();
  });
});
