import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { dashboardNotFoundCopy } from "@/lib/dashboard/dashboard-json";
import { schemaMismatchCopy } from "@/lib/api/request-json";
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

  it("does not name the command-line backend or the response format", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "lib/dashboard/dashboard-json.ts"),
      "utf8",
    );
    const requestSource = fs.readFileSync(
      path.join(process.cwd(), "lib/api/request-json.ts"),
      "utf8",
    );
    expect(dashboardNotFoundCopy()).toBe("This could not be found.");
    expect(source).toContain("dashboardNotFoundCopy()");
    expect(source).toContain("schemaMismatchCopy()");
    expect(source).not.toContain("CLI backend");
    expect(source).not.toContain("malformed JSON");
    expect(requestSource).not.toContain("malformed JSON");
    expect(schemaMismatchCopy()).toBe(
      "This page could not read the latest data. Refresh and try again.",
    );
  });
});
