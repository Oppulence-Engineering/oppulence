import { describe, expect, it } from "vitest";

import { agentToolLabel } from "@/lib/agents/agent-tools";

describe("agent tool labels", () => {
  it("names granted tools the way the product talks", () => {
    expect(agentToolLabel("echo")).toBe("Echo");
    expect(agentToolLabel("workflow.read")).toBe("Workflows");
    expect(agentToolLabel("run_history.read")).toBe("Run history");
    expect(agentToolLabel("relationship.read")).toBe("Read workspace memory");
    expect(agentToolLabel("relationship.create")).toBe("Add a company");
    expect(agentToolLabel("connector.read.composio_tool_search")).toBe("Search more tools");
    expect(agentToolLabel("demo.payment")).toBe("Payment demo");
    expect(agentToolLabel("subagent.delegate")).toBe("Delegate to an agent");
  });

  it("turns an unknown tool id into words", () => {
    expect(agentToolLabel("relationship.identity.decide")).toBe("Review a possible duplicate");
    expect(agentToolLabel("person.attribute.retract")).toBe("Remove a profile field");
    expect(agentToolLabel("partner.custom_action")).toBe("Partner custom action");
  });
});
