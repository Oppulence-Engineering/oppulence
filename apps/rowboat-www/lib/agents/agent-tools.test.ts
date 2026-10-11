import { describe, expect, it } from "vitest";

import { AGENT_TOOL_CATALOG, agentToolLabel, approvalTrustCopy } from "@/lib/agents/agent-tools";

function toolDescription(name: string): string | undefined {
  return AGENT_TOOL_CATALOG.find((tool) => tool.name === name)?.description;
}

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
    expect(agentToolLabel("commitment.accept")).toBe("Accept a promise");
    expect(agentToolLabel("commitment.export")).toBe("Export promises");
    expect(agentToolLabel("commitment.unblock")).toBe("Unblock a promise");
    expect(agentToolLabel("partner.custom_action")).toBe("Partner custom action");
    expect(approvalTrustCopy("read")).toBe("This only looks things up.");
    expect(approvalTrustCopy("write")).toBe("This can change a record.");
    expect(approvalTrustCopy("act")).toBe("This can take an action.");
    expect(approvalTrustCopy("money-moving")).toBe(
      "This can spend money or send something you cannot undo.",
    );
    expect(approvalTrustCopy("custom_tier")).toBe("This needs your approval before it runs.");
    expect(approvalTrustCopy("money-moving")).not.toContain("money-moving");
  });

  it("describes mailbox and CRM tools as available after a connection", () => {
    expect(toolDescription("source.retry_sync")).toBe(
      "Try reading a source again after it is connected. This does not reconnect the account.",
    );
    expect(toolDescription("connector.read.gmail")).toBe(
      "Read Gmail messages after a mailbox is connected.",
    );
    expect(toolDescription("connector.read.calendar")).toBe(
      "Read calendar events after a calendar is connected.",
    );
    expect(toolDescription("connector.read.drive")).toBe("Read Drive files after Drive is connected.");
    expect(toolDescription("connector.write.drive_update")).toBe(
      "Update Drive files after Drive is connected.",
    );
    expect(toolDescription("connector.read.hubspot_search")).toBe(
      "Find HubSpot records after HubSpot is connected.",
    );
    expect(agentToolLabel("connector.read.gmail")).toBe("Read Gmail");
    expect(agentToolLabel("connector.read.hubspot_search")).toBe("Search HubSpot");
    expect(agentToolLabel("echo")).toBe("Echo");
    const descriptions = AGENT_TOOL_CATALOG.map((tool) => tool.description).join("\n");
    expect(descriptions).not.toContain("Read connected Gmail");
    expect(descriptions).not.toContain("the connected HubSpot account");
    expect(descriptions).not.toContain("Try reading a connected source");
  });
});
