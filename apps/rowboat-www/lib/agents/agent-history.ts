import type { DurableAgentSessionEvent } from "@/lib/api/generated/client/model/durableAgentSessionEvent";
import type { DurableAgentSessionView } from "@/lib/api/generated/client/model/durableAgentSessionView";
import {
  ListAgentSessionEvents200Response,
  ListAgentSessions200Response,
} from "@/lib/api/generated/zod/agent-sessions/agent-sessions";
import {
  AgentStreamEventSchema,
  parseKnownAgentStreamEvent,
  type KnownAgentStreamEvent,
} from "@/lib/agents/agent-stream";

export type AgentSessionSummary = Pick<
  DurableAgentSessionView,
  "sessionId" | "agent" | "title" | "createdAt" | "lastActivityAt"
>;

export function modelOutageCopy(): string {
  return "Oppulence cannot reach the model right now. Your workspace credits were not charged. Try again later.";
}

export function modelKeyRejectedCopy(): string {
  return "The model rejected the API key for this workspace. Nothing was charged.";
}

/** Shown when a connected source cannot refresh because the model is unreachable. */
export function refreshPausedModelCopy(): string {
  return "Automatic refresh is paused because Oppulence cannot reach the model right now. The source is still connected; reconnecting will not fix it.";
}

export function friendlyAgentError(message: string, subject: "agent" | "run" = "agent"): string {
  if (/openrouter_credits|upstream_credits_exhausted|upstream provider account/i.test(message)) {
    return modelOutageCopy();
  }
  if (
    /status 402|requires more credits|insufficient_credits|credits_exhausted|out of (?:AI )?credits|insufficient credits for cloud run preflight/i.test(
      message,
    )
  ) {
    return "This workspace is out of AI credits. Ask an administrator to add credits, then try again.";
  }
  if (/subscription not active for cloud run preflight/i.test(message)) {
    return "An active subscription is required before this workflow can run.";
  }
  if (/daily credit limit exceeded for cloud run preflight/i.test(message)) {
    return "This workspace has used its daily AI credits. Try again tomorrow.";
  }
  if (/monthly credit limit exceeded for cloud run preflight/i.test(message)) {
    return "This workspace has used its monthly AI credits.";
  }
  if (/cloud run queue is at (?:global|per-user) capacity/i.test(message)) {
    return "Too many workflows are running right now. Try again in a moment.";
  }
  // A bad or missing provider key comes back wrapped in a Temporal activity
  // error. Match it before the generic activity rewrite, or dogfooding looks
  // like a random failure instead of a credential problem.
  if (/status 401|missing authentication header|invalid api key|invalid_api_key/i.test(message)) {
    return modelKeyRejectedCopy();
  }
  if (/\brate limit\b|too many requests|\(429\)/i.test(message)) {
    return "Too many requests were sent from this workspace. Wait a moment, then try again.";
  }
  // Connector and sandbox refusals are wrapped in the same Temporal activity
  // error as a random failure. Name the connection before that rewrite.
  if (/google is not connected/i.test(message)) {
    return "Connect Google, then try again.";
  }
  if (/refresh token is invalid/i.test(message)) {
    return "Google stopped accepting the sign-in. Reconnect, then try again.";
  }
  if (/google connection is missing the .+ scope|reconnect Google to grant it/i.test(message)) {
    return "Google is missing a permission. Reconnect, then try again.";
  }
  if (/could not obtain a google access token/i.test(message)) {
    return "Google could not authorize this. Reconnect, then try again.";
  }
  if (/HubSpot is not connected/i.test(message)) {
    return "Connect HubSpot, then try again.";
  }
  if (/HubSpot is not configured/i.test(message)) {
    return "HubSpot is not set up for this workspace yet.";
  }
  if (/that product is not connected yet/i.test(message)) {
    return "Connect that product under Settings, then try again.";
  }
  if (/Composio is not configured/i.test(message)) {
    return "More products are not set up for this workspace yet.";
  }
  if (/Composio rejected this deployment's project key/i.test(message)) {
    return "More products could not be reached. Try again later.";
  }
  if (/sandbox executor is not configured|sandbox image is not configured/i.test(message)) {
    return "Running code is not set up for this workspace yet.";
  }
  if (/sandbox execution failed/i.test(message)) {
    return "The code could not finish. Try again.";
  }
  if (/tool is not on the allowlist/i.test(message)) {
    return subject === "run"
      ? "This tool is not available in this run."
      : "This tool is not available in this chat.";
  }
  if (/llm gateway call failed/i.test(message)) {
    return "The model could not be reached. Try again.";
  }
  if (/\blimit exceeded \(/i.test(message)) {
    return runLimitCopy();
  }
  if (/abandoned before Temporal workflow start was confirmed/i.test(message)) {
    return "This run did not start. Try again.";
  }
  if (/run went silent: no heartbeat/i.test(message)) {
    return "This run stopped responding. Try again.";
  }
  if (/starttoclose timeout|timeoutType: StartToClose|activity timeout/i.test(message)) {
    return "This run took too long. Try again.";
  }
  if (/activity error|scheduledEventID|startedEventID/i.test(message)) {
    return subject === "run"
      ? "This run could not finish. Please try again."
      : "The agent could not complete this request. Please try again.";
  }
  return message;
}

const BARE_AGENT_STATUS = new RegExp(
  "^(?:" +
    [
      "Request failed(?:: \\d+\\b.*| \\(\\d+\\))",
      "Failed to (?:load|save) file \\(\\d+\\)",
      "Could not delete agent \\(\\d+\\)",
      "Agent stream failed \\(\\d+\\)",
    ].join("|") +
    ")$",
);

/** The stored decision is granted or denied. The chat says what the person did. */
export function approvalDecisionCopy(status: ApprovalRequest["status"]): string {
  switch (status) {
    case "granted":
      return "Approved";
    case "denied":
      return "Denied";
    case "resolving":
      return "Submitting decision…";
    default:
      return "";
  }
}

/**
 * A denied tool stores a worker reason. The chat says whether the tool can be used.
 * A code with no sentence is not shown as the result.
 */
export function toolFailureCopy(result: unknown): string {
  const raw = typeof result === "string" ? result.trim() : "";
  switch (raw) {
    case "not on the allowlist for this session":
    case "not on the allowlist for this run":
      return "This tool is not available in this chat.";
    case "subagents disabled":
      return "Related agents are turned off for this chat.";
    case "tool requires approval but HITL is disabled":
      return "This tool needs approval, and approval is turned off.";
    case "denied by registry":
    case "Denied by policy":
    case "tool_not_allowed":
      return "This tool is not allowed.";
    case "connector_unavailable":
      return "Connect the account this tool needs, then try again.";
    case "upstream_credits_exhausted":
      return modelOutageCopy();
    case "runtime_deadline_exceeded":
    case "runtime_llm_budget_exceeded":
    case "runtime_tool_budget_exceeded":
      return runLimitCopy();
    case "runtime_artifact_too_large":
    case "runtime_event_too_large":
      return "This result is too large to keep.";
    default: {
      if (!raw || /^[a-z0-9_:-]+$/.test(raw)) return "This tool could not finish.";
      const explained = friendlyAgentError(raw);
      return explained === raw ? raw : explained;
    }
  }
}

/**
 * A finished tool stores only how many bytes came back. The chat says it finished.
 * Empty arguments are not a parameter list.
 */
export function toolResultCopy(result: unknown): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const keys = Object.keys(result);
  if (keys.length === 1 && keys[0] === "resultBytes") return "Finished.";
  return null;
}

export function toolArgumentsVisible(input: unknown): boolean {
  if (input == null || input === "") return false;
  if (typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 0) {
    return false;
  }
  return true;
}

export function runLimitCopy(): string {
  return "This run reached its limit.";
}

export function runFailedCopy(): string {
  return "This run could not finish.";
}

/**
 * A chat action should keep a specific failure. A status code with no sentence
 * is replaced by the action's own fallback. A rejected key, a rate limit, and
 * an out-of-credits provider still use the sentences we already explain.
 */
export function shownAgentError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message) return fallback;
  const friendly = friendlyAgentError(message);
  if (friendly !== message) return friendly;
  if (BARE_AGENT_STATUS.test(message)) return fallback;
  return message;
}

export function parseAgentSessionsResponse(value: unknown): AgentSessionSummary[] {
  return ListAgentSessions200Response.parse(value).sessions.map(
    ({ sessionId, agent, title, createdAt, lastActivityAt }) => ({
      sessionId,
      agent,
      title,
      createdAt,
      lastActivityAt,
    }),
  );
}

export function parseAgentSessionEventsResponse(value: unknown): {
  events: DurableAgentSessionEvent[];
  nextSeq?: number | null;
} {
  return ListAgentSessionEvents200Response.parse(value);
}

export type AgentHistoryItem =
  | {
      id: string;
      type: "message";
      role: "user" | "assistant";
      content: string;
      timestamp: number;
    }
  | {
      id: string;
      type: "tool";
      name: string;
      input: unknown;
      result?: unknown;
      status: "pending" | "running" | "completed" | "error";
      timestamp: number;
    }
  | {
      id: string;
      type: "approval";
      approvalId: string;
      name: string;
      trustTier: string;
      input: unknown;
      status: "pending" | "resolving" | "granted" | "denied";
      timestamp: number;
    };

export type ApprovalRequest = Extract<AgentHistoryItem, { type: "approval" }>;

export type ReasoningBlock = {
  id: string;
  type: "reasoning";
  content: string;
  isStreaming: boolean;
  timestamp: number;
};

export type ConversationItem = AgentHistoryItem | ReasoningBlock;

function toolEventId(event: KnownAgentStreamEvent): string {
  return `tool-${event.turnSeq ?? "unknown"}-${String(event.data.callIndex ?? "unknown")}`;
}

/** Applies one validated transcript event without mutating existing state. */
export function applyAgentEvent(
  items: AgentHistoryItem[],
  event: KnownAgentStreamEvent,
  now?: number,
): AgentHistoryItem[];
export function applyAgentEvent(
  items: ConversationItem[],
  event: KnownAgentStreamEvent,
  now?: number,
): ConversationItem[];
export function applyAgentEvent(
  items: ConversationItem[],
  event: KnownAgentStreamEvent,
  now = Date.now(),
): ConversationItem[] {
  switch (event.type) {
    case "agent.message": {
      const content = event.data.content;
      const id = `assistant-${event.seq}`;
      if (!content || items.some((item) => item.id === id)) return items;
      return [...items, { id, type: "message", role: "assistant", content, timestamp: now }];
    }
    case "agent.tool_call_started": {
      const id = toolEventId(event);
      if (items.some((item) => item.id === id)) {
        return items.map((item) =>
          item.id === id && item.type === "tool" ? { ...item, status: "running" } : item,
        );
      }
      return [
        ...items,
        {
          id,
          type: "tool",
          name: event.data.tool,
          input: {},
          status: "running",
          timestamp: now,
        },
      ];
    }
    case "agent.tool_call_completed": {
      const id = toolEventId(event);
      const failed = Boolean(event.data.error || event.data.errorCode);
      return items.map((item) =>
        item.id === id && item.type === "tool"
          ? {
              ...item,
              result: failed
                ? event.data.error || event.data.errorCode
                : { resultBytes: event.data.resultBytes ?? 0 },
              status: failed ? "error" : "completed",
            }
          : item,
      );
    }
    case "agent.tool_denied": {
      const id = `tool-denied-${event.seq}`;
      if (items.some((item) => item.id === id)) return items;
      return [
        ...items,
        {
          id,
          type: "tool",
          name: event.data.tool,
          input: {},
          result: event.data.reason,
          status: "error",
          timestamp: now,
        },
      ];
    }
    case "agent.approval_requested": {
      const approvalId = event.data.approvalId;
      if (
        !approvalId ||
        items.some((item) => item.type === "approval" && item.approvalId === approvalId)
      ) {
        return items;
      }
      return [
        ...items,
        {
          id: `approval-${approvalId}`,
          type: "approval",
          approvalId,
          name: event.data.tool,
          trustTier: event.data.trustTier,
          input: event.data.args ?? {},
          status: "pending",
          timestamp: now,
        },
      ];
    }
    case "agent.approval_resolved": {
      const approvalId = event.data.approvalId;
      if (!approvalId) return items;
      return items.map((item) =>
        item.type === "approval" && item.approvalId === approvalId
          ? { ...item, status: event.data.decision }
          : item,
      );
    }
    default:
      return items;
  }
}

export function conversationFromAgentEvents(
  events: DurableAgentSessionEvent[],
): AgentHistoryItem[] {
  let items: AgentHistoryItem[] = [];
  for (const rawEvent of events) {
    const event = parseKnownAgentStreamEvent(AgentStreamEventSchema.parse(rawEvent));
    if (!event) continue;

    if (event.type === "agent.turn_started" && event.data.input) {
      items = [
        ...items,
        {
          id: `user-event-${event.seq}`,
          type: "message",
          role: "user",
          content: event.data.input,
          timestamp: Date.now(),
        },
      ];
    } else {
      items = applyAgentEvent(items, event);
    }
  }
  return items;
}
