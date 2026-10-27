import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  agentCreateFailureCopy,
  agentLoadTitle,
  agentProblemDetail,
  agentWorkspaceCount,
} from "./agents-view";

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
    expect(source).toContain("{agentProviderLabel(selected.provider)}");
    expect(source).toContain("agentConnectionLabel(name)");
    expect(source).not.toContain('selected.connectorReqs?.join(", ")');
    expect(source).toContain("calledModelLabel(selected.model)");
    expect(source).not.toContain('{selected.provider || "Workspace default"}');
    expect(source).not.toContain('{selected.model || "Workspace default"}');
    expect(source).toContain("shownAgentError(\n          agentsQuery.error,");
    expect(source).toContain('"Could not refresh agents. Try again."');
    expect(source).toContain('"Could not load agents."');
    expect(source).toContain('shownAgentError(cause, "Could not delete this agent.")');
    expect(source).toContain('shownAgentError(cause, "Could not create agent")');
    expect(source).not.toContain("title={tool}");
    expect(source).toContain("setError(null)");
    expect(source).toContain("agents.length === 0 && !agentsQuery.isError && !error");
    expect(source).toContain('?? "Could not create agent"');
    expect(source).toContain("agentCreateFailureCopy(agentProblemDetail(body))");
    expect(source).not.toContain("Could not create agent (${response.status})");
    expect(source).not.toContain("not in the capability registry");
  });

  it("names a duplicate short name and keeps a registry phrase off the dialog", () => {
    expect(agentProblemDetail({ detail: "an agent with this slug already exists" })).toBe(
      "an agent with this slug already exists",
    );
    expect(agentProblemDetail({ message: "an agent with this slug already exists" })).toBe(
      "an agent with this slug already exists",
    );
    expect(agentProblemDetail({ detail: "  slug and name are required  " })).toBe(
      "slug and name are required",
    );
    expect(agentProblemDetail({})).toBe("");
    expect(agentCreateFailureCopy("an agent with this slug already exists")).toBe(
      "An agent with this short name already exists.",
    );
    expect(agentCreateFailureCopy("slug and name are required")).toBe(
      "Enter a display name and a short name.",
    );
    expect(agentCreateFailureCopy("invalid limits")).toBe("Those limits could not be saved.");
    expect(agentCreateFailureCopy('unknown tool "shell" (not in the capability registry)')).toBe(
      "That tool is not available.",
    );
    expect(agentCreateFailureCopy("could not create agent")).toBeNull();
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
