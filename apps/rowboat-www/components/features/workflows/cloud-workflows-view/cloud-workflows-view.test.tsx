import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { sortWorkflowTasks } from "@/components/features/workflows/cloud-workflows-view/cloud-workflows-view";
import type { CloudTask } from "@/lib/workflows/cloud-workflows";

const source = fs.readFileSync(path.join(import.meta.dirname, "cloud-workflows-view.tsx"), "utf8");

const task = (name: string, updatedAt: string): CloudTask =>
  ({ name, updatedAt }) as CloudTask;

describe("CloudWorkflowsView", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function CloudWorkflowsView");
  });

  it("opens the runs tab when Run now is clicked", () => {
    expect(source).toContain('setTab("runs")');
    expect(source).toContain('useState<EditorTab>(selectedRun ? "runs" : "editor")');
    expect(source).toContain("onRun();");
  });

  it("sorts the library by the label on the sort control", () => {
    const tasks = [
      task("Bravo", "2026-01-01T00:00:00Z"),
      task("Alpha", "2026-06-01T00:00:00Z"),
      task("Charlie", "2026-03-01T00:00:00Z"),
    ];
    expect(sortWorkflowTasks(tasks, "published").map((item) => item.name)).toEqual([
      "Alpha",
      "Charlie",
      "Bravo",
    ]);
    expect(sortWorkflowTasks(tasks, "name").map((item) => item.name)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
  });
});
