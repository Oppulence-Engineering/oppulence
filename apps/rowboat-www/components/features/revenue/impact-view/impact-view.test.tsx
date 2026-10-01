import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { overdueDirectionLines } from "./impact-view";

const source = fs.readFileSync(path.join(import.meta.dirname, "impact-view.tsx"), "utf8");

describe("ImpactView", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function ImpactView");
    expect(source).toContain("Measure company risk");
    expect(source).toContain("Run Promise Leak Audit");
    expect(source).toContain("auditLaunchLabel");
    expect(source).toContain("needsConnect");
    expect(source).toContain("Company exposure");
    expect(source).toContain("No active company risks.");
    expect(source).toContain("Your companies and people were not changed.");
    expect(source).not.toContain("Measure portfolio risk");
    expect(source).not.toContain("Relationship exposure");
    expect(source).not.toContain("No active relationship risks.");
    expect(source).not.toContain("underlying relationship records");
    expect(source).not.toContain("Promises missed");
  });

  it("calls an open past-due promise overdue, and keeps a mutual one in the total", () => {
    expect(
      overdueDirectionLines({ overdueCommitments: 1, overdueByUs: 1, overdueByThem: 0 }),
    ).toEqual([
      { label: "Overdue from us", value: 1 },
      { label: "Overdue from them", value: 0 },
    ]);
    expect(
      overdueDirectionLines({ overdueCommitments: 2, overdueByUs: 0, overdueByThem: 1 }),
    ).toEqual([
      { label: "Overdue from us", value: 0 },
      { label: "Overdue from them", value: 1 },
      { label: "Overdue together", value: 1 },
    ]);
  });
});
