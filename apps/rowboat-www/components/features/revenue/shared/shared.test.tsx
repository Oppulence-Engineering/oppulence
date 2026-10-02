import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { priorityComponentLabel } from "@/lib/revenue/revenue";

const source = fs.readFileSync(path.join(import.meta.dirname, "shared.tsx"), "utf8");

describe("WorkspaceEmptyState", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function WorkspaceEmptyState");
  });

  it("does not invent help articles when a surface forgets a learn-more list", () => {
    expect(source).toContain("learnMore = []");
    expect(source).not.toContain("Introduction to tasks");
    expect(source).not.toContain("Notes, Tasks, and Email sending");
    expect(source).toContain("What to expect");
    expect(source).not.toContain("Learn more");
  });

  it("names earlier outcomes in the ranking breakdown", () => {
    expect(priorityComponentLabel("outcome_learning")).toBe("Earlier outcomes");
    expect(priorityComponentLabel("evidence_quality")).toBe("Evidence quality");
    expect(priorityComponentLabel("contact_risk_penalty")).toBe("Contact risk");
    expect(priorityComponentLabel("urgency")).toBe("Urgency");
    expect(source).toContain("priorityComponentLabel(key)");
    expect(source).toContain("return shownRequestError(e, fallback);");
    expect(source).not.toContain("return e instanceof Error ? e.message : fallback;");
    expect(source).not.toContain("PRIORITY_COMPONENT_LABELS[key] ?? key");
  });
});
