import { describe, expect, it } from "vitest";

import { dashboardArtifactSubtitle } from "@/lib/dashboard/dashboard-artifacts";

describe("dashboardArtifactSubtitle", () => {
  it("names an opened workflow, run, and connected-tools file", () => {
    expect(dashboardArtifactSubtitle({ kind: "task" })).toBe("Workflow");
    expect(dashboardArtifactSubtitle({ kind: "taskrun" })).toBe("Run");
    expect(dashboardArtifactSubtitle({ kind: "run" })).toBe("Run");
    expect(dashboardArtifactSubtitle({ kind: "config", name: "mcp.json" })).toBe("Connected tools");
    expect(dashboardArtifactSubtitle({ kind: "config", name: "models.json" })).toBe("Model");
    expect(dashboardArtifactSubtitle({ kind: "config", markdown: true })).toBe("Note");
    expect(dashboardArtifactSubtitle({ kind: "agent", markdown: true })).toBe("Agent");
    expect(
      dashboardArtifactSubtitle({
        kind: "agent",
        readOnlyAgent: true,
        sourceLabel: "Built-in",
      }),
    ).toBe("Built-in agent");
    expect(dashboardArtifactSubtitle({ kind: "agent" })).toBe("Agent definition");
  });
});
