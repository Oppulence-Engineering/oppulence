import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { agentLoadTitle, agentWorkspaceCount } from "./agents-view";

const source = fs.readFileSync(path.join(import.meta.dirname, "agents-view.tsx"), "utf8");

describe("AgentsView", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function AgentsView");
    expect(source).toContain("agentInstructionsCopy(selected)");
    expect(source).toContain("agentInstructionsCopy(source)");
    expect(source).toContain("duplicateAgentInstructions(source, instructions)");
    expect(source).not.toContain("source?.instructions");
    expect(source).not.toContain("{selected.instructions");
    expect(source).toContain("adjust its model, tools, and limits.");
    expect(source).not.toContain("safeguards");
    expect(source).toContain(">Short name</Label>");
    expect(source).not.toMatch(/>\s*Instructions\s*</);
    expect(source).toMatch(/>\s*Purpose\s*</);
    expect(source).toContain("{agentToolLabel(tool)}");
    expect(source).toContain('shownAgentError(\n          agentsQuery.error,');
    expect(source).toContain('"Could not refresh agents. Try again."');
    expect(source).toContain('"Could not load agents."');
    expect(source).toContain('shownAgentError(cause, "Could not delete this agent.")');
    expect(source).toContain('shownAgentError(cause, "Could not create agent")');
    expect(source).not.toContain("title={tool}");
    expect(source).toContain("setError(null)");
    expect(source).toContain("agents.length === 0 && !agentsQuery.isError && !error");
    expect(source).toContain(': "Could not create agent"');
    expect(source).not.toContain("Could not create agent (${response.status})");
  });

  it("counts a failed empty load separately from an empty workspace", () => {
    expect(agentWorkspaceCount(0, true)).toBe("Couldn't load");
    expect(agentWorkspaceCount(0, false)).toBe("0 agents in this workspace");
    expect(agentWorkspaceCount(1, false)).toBe("1 agent in this workspace");
    expect(agentWorkspaceCount(3, true)).toBe("3 agents in this workspace");
    expect(agentLoadTitle(true, 0)).toBe("Could not load agents");
    expect(agentLoadTitle(true, 3)).toBe("Could not refresh agents");
    expect(agentLoadTitle(false, 3)).toBe("Could not delete this agent");
    expect(source).toContain("agentLoadTitle(agentsQuery.isError, agents.length)");
  });
});
