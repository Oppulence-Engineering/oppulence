import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { agentWorkspaceCount } from "./agents-view";

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
    expect(source).toContain(
      'friendlyAgentError(\n          agentsQuery.error instanceof Error ? agentsQuery.error.message : "Could not load agents",\n        )',
    );
    expect(source).not.toContain("title={tool}");
    expect(source).toContain("setError(null)");
    expect(source).toContain("agents.length === 0 && !agentsQuery.isError && !error");
  });

  it("counts a failed empty load separately from an empty workspace", () => {
    expect(agentWorkspaceCount(0, true)).toBe("Couldn't load");
    expect(agentWorkspaceCount(0, false)).toBe("0 agents in this workspace");
    expect(agentWorkspaceCount(1, false)).toBe("1 agent in this workspace");
    expect(agentWorkspaceCount(3, true)).toBe("3 agents in this workspace");
  });
});
