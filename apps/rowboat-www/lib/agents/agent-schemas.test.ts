import { describe, expect, it } from "vitest";

import {
  agentArtifactTitle,
  agentDisplayName,
  agentInstructionsCopy,
  agentSlugTitle,
  agentSourceLabel,
  duplicateAgentInstructions,
  parseAgentDocument,
  parseAgentsResponse,
  agentSelectName,
  visibleAgentLabel,
} from "@/lib/agents/agent-schemas";

describe("agent schemas", () => {
  it("validates and normalizes agent list responses", () => {
    expect(
      parseAgentsResponse({
        agents: [
          "assistant",
          {
            slug: "renewal-reviewer",
            name: "Renewal reviewer",
            enabledTools: ["crm.lookup"],
          },
        ],
      }),
    ).toEqual([
      {
        slug: "assistant",
        name: "assistant",
        source: "unknown",
        enabledTools: [],
        subagentRefs: [],
        connectorReqs: [],
      },
      {
        slug: "renewal-reviewer",
        name: "Renewal reviewer",
        source: "unknown",
        enabledTools: ["crm.lookup"],
        subagentRefs: [],
        connectorReqs: [],
      },
    ]);
    expect(() => parseAgentsResponse({ agents: [{ name: "Missing slug" }] })).toThrow();
  });

  it("shows the agent name while the stored value stays the slug", () => {
    const agents = [{ slug: "concierge-slack", name: "Slack Concierge" }];
    expect(agentDisplayName(agents, "concierge-slack")).toBe("Slack Concierge");
    expect(agentDisplayName(agents, "missing")).toBe("missing");
    expect(visibleAgentLabel([], "assistant")).toBe("Agent");
    expect(agentSelectName([], "assistant")).toBe("Agent");
    expect(visibleAgentLabel(agents, "concierge-slack")).toBe("Slack Concierge");
    expect(agentSelectName(agents, "concierge-slack")).toBe("Agent, Slack Concierge");
  });

  it("describes a maintained agent without its runtime prompt", () => {
    const runtime =
      "You are a helpful, careful cloud assistant running as a durable Rowboat agent. Use run_history.";
    expect(agentInstructionsCopy({ slug: "assistant", source: "builtin", instructions: runtime })).toBe(
      "Answers questions about this workspace. It can look up companies, promises, and workflows, and it can draft the next step. Anything that writes waits for your approval.",
    );
    expect(
      agentInstructionsCopy({ slug: "concierge-slack", source: "builtin", instructions: runtime }),
    ).toContain("Works from Slack");
    expect(
      agentInstructionsCopy({ slug: "custom-pack", source: "gitops", instructions: runtime }),
    ).toBe("Oppulence maintains this agent. Its instructions stay with the product.");
    expect(
      agentInstructionsCopy({
        slug: "renewal-reviewer",
        source: "tenant",
        instructions: "Watch renewals and draft the next note.",
      }),
    ).toBe("Watch renewals and draft the next note.");
    expect(runtime).toContain("Rowboat");
    const shown = agentInstructionsCopy({
      slug: "assistant",
      source: "builtin",
      instructions: runtime,
    });
    expect(duplicateAgentInstructions({ slug: "assistant", source: "builtin", instructions: runtime }, shown)).toBe(
      runtime,
    );
    expect(
      duplicateAgentInstructions(
        { slug: "assistant", source: "builtin", instructions: runtime },
        "Answer in one sentence.",
      ),
    ).toBe("Answer in one sentence.");
    expect(duplicateAgentInstructions(undefined, "  Draft a follow-up.  ")).toBe("Draft a follow-up.");
  });

  it("names an agent source the way the product talks", () => {
    expect(agentSourceLabel("builtin")).toBe("Oppulence");
    expect(agentSourceLabel("gitops")).toBe("Managed");
    expect(agentSourceLabel("tenant")).toBe("Workspace");
    expect(agentSourceLabel("unknown")).toBe("Custom");
    expect(agentSourceLabel("")).toBe("Custom");
    expect(agentSourceLabel("partner_pack")).toBe("Partner pack");
    expect(agentSlugTitle("assistant")).toBe("Assistant");
    expect(agentSlugTitle("concierge-slack")).toBe("Slack Concierge");
    expect(agentSlugTitle("renewal-reviewer")).toBe("Renewal Reviewer");
    expect(agentArtifactTitle("Assistant", "assistant")).toBe("Assistant");
    expect(agentArtifactTitle("assistant", "assistant")).toBe("Assistant");
    expect(agentArtifactTitle(undefined, "concierge-slack")).toBe("Slack Concierge");
    expect(agentArtifactTitle("Renewal reviewer", "renewal-reviewer")).toBe("Renewal reviewer");
  });

  it("rejects malformed projection fields before creating an editor document", () => {
    expect(() =>
      parseAgentDocument(
        {
          slug: "assistant",
          enabledTools: ["crm.lookup", 42],
        },
        "fallback",
      ),
    ).toThrow();
  });
});
