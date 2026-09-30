import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "agent-configuration-form.tsx"),
  "utf8",
);
const tools = fs.readFileSync(
  path.join(import.meta.dirname, "../../../../lib/agents/agent-tools.ts"),
  "utf8",
);

describe("AgentConfigurationForm", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function AgentConfigurationForm");
  });

  it("offers workspace tools and hides developer surfaces until enabled", () => {
    expect(tools).toContain('label: "Look up companies and promises"');
    expect(tools).not.toContain('label: "Read workspace memory"');
    expect(tools).toContain('label: "Send a Gmail message after you approve it"');
    expect(tools).not.toContain('label: "Send email"');
    expect(tools).toContain('label: "Create task"');
    expect(source).toContain("visibleTools(selectedTools)");
    expect(source).toContain("agentInstructionsCopy(");
    expect(source).toContain("agentToolLabel");
    expect(source).toContain("aria-label={`Remove ${label}`}");
    expect(source).not.toContain("title={label === value ? undefined : value}");
    expect(source).toContain("agentSlugTitle(slug)");
    expect(source).toContain("More tools");
    expect(source).toContain("Connected services");
    expect(source).not.toContain("registered name");
    expect(source).not.toContain("connector.custom.action");
    expect(source).not.toContain("slack:messages.read");
    expect(source).not.toContain("Required connection scopes");
    expect(source).toContain(">Short name</Label>");
    expect(source).toContain("The short name is fixed after an agent is created.");
    expect(source).not.toContain(">Agent ID</Label>");
    expect(source).not.toContain("The ID is fixed");
    expect(source).toContain("Safety limits");
    expect(source).toContain("Reply limit");
    expect(source).toContain("Model call limit");
    expect(source).toContain("Tool use limit");
    expect(source).toContain("Spending limit (USD)");
    expect(source).not.toContain("Maximum tool calls");
    expect(source).not.toContain("Spend ceiling");
    expect(source).not.toContain("Maximum AI calls");
    expect(tools).toContain('"echo"');
    expect(tools).toContain('"conduit.read"');
    expect(source).not.toContain("Read relationship memory");
    expect(tools).not.toContain("Read relationship memory");
    expect(source).not.toContain("Create internal task");
    expect(tools).not.toContain("Create internal task");
    expect(tools).toContain('description: "Add a task in this workspace."');
    expect(tools).toContain('description: "Add a note in this workspace."');
    expect(tools).toContain('description: "Repeat a short message."');
    expect(tools).not.toContain("never send");
    expect(source).toContain("Sign-in stays with Oppulence.");
    expect(source).not.toContain("Sign-in stays with the provider.");
  });
});
