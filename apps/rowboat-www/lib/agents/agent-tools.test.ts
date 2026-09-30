import { describe, expect, it } from "vitest";

import { agentToolLabel } from "@/lib/agents/agent-tools";

describe("agent tool labels", () => {
  it("names granted tools the way the product talks", () => {
    expect(agentToolLabel("echo")).toBe("Echo");
    expect(agentToolLabel("workflow.read")).toBe("Workflows");
    expect(agentToolLabel("run_history.read")).toBe("Past runs");
    expect(agentToolLabel("relationship.read")).toBe("Look up companies and promises");
    expect(agentToolLabel("source.retry_sync")).toBe("Sync a source again");
    expect(agentToolLabel("connector.write.gmail_send")).toBe(
      "Send a Gmail message after you approve it",
    );
    expect(agentToolLabel("tool_result.read")).toBe("Earlier results");
    expect(agentToolLabel("relationship.create")).toBe("Add a company");
    expect(agentToolLabel("connector.read.composio_tool_search")).toBe("Find another tool");
    expect(agentToolLabel("connector.read.composio_tool_describe")).toBe("See what another tool does");
    expect(agentToolLabel("connector.write.composio_tool_execute")).toBe(
      "Run another tool after you approve it",
    );
    expect(agentToolLabel("relationship.assertion.retract")).toBe("Remove a saved detail");
    expect(agentToolLabel("relationship.attention.decide")).toBe("Update what needs attention");
    expect(agentToolLabel("workspace.read")).toBe("This workspace");
    expect(agentToolLabel("demo.payment")).toBe("Payment demo");
    expect(agentToolLabel("subagent.delegate")).toBe("Delegate to an agent");
  });

  it("turns an unknown tool id into words", () => {
    expect(agentToolLabel("relationship.identity.decide")).toBe("Review a possible duplicate");
    expect(agentToolLabel("person.attribute.retract")).toBe("Remove a profile field");
    expect(agentToolLabel("partner.custom_action")).toBe("Partner custom action");
  });
});
