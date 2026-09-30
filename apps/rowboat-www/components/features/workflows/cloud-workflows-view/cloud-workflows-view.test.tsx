import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  runRowDetail,
  scheduleLabel,
  sortWorkflowTasks,
  workflowForTask,
} from "@/components/features/workflows/cloud-workflows-view/cloud-workflows-view";
import {
  readableEnum,
  runEventLabel,
  scheduleHealthLabel,
  workflowListSummary,
  type CloudTask,
} from "@/lib/workflows/cloud-workflows";

const source = fs.readFileSync(path.join(import.meta.dirname, "cloud-workflows-view.tsx"), "utf8");

const task = (name: string, updatedAt: string): CloudTask =>
  ({ name, updatedAt }) as CloudTask;

describe("CloudWorkflowsView", () => {
  it("shows run status and trigger tokens as words", () => {
    expect(readableEnum("succeeded")).toBe("Succeeded");
    expect(readableEnum("cron")).toBe("Cron");
    expect(readableEnum("")).toBe("");
    expect(runRowDetail("failed", "cron")).toBe("Failed · Cron");
    expect(source).toContain("runRowDetail(run.status, run.trigger)");
    expect(source).toContain("workflowName={task.name}");
  });

  it("names schedule health and transcript events", () => {
    expect(scheduleHealthLabel("current")).toBe("In sync");
    expect(scheduleHealthLabel("failed")).toBe("Needs repair");
    expect(runEventLabel("temporal.failed")).toBe("Failed");
    expect(runEventLabel("runtime.tool_call_started")).toBe("Tool call started");
    expect(runEventLabel("desktop.llm_stream_event")).toBe("LLM stream event");
  });

  it("names weekday crons that the first-party templates use", () => {
    const digest = { triggers: { cronExpr: "0 8 * * 1-5" } } as CloudTask;
    const followups = { triggers: { cronExpr: "0 17 * * 1-5" } } as CloudTask;
    expect(scheduleLabel(digest)).toBe("Weekdays at 8:00 AM");
    expect(scheduleLabel(followups)).toBe("Weekdays at 5:00 PM");
  });

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

  it("uses the template description when a workflow has no canvas objective", () => {
    const meeting = {
      name: "Meeting Pre-Brief",
      slug: "oppulence-meeting-pre-brief",
      templateSlug: "meeting-pre-brief",
      instructions: "Use connector.read.calendar for upcoming meetings.",
      triggers: { cronExpr: "*/30 * * * *" },
    } as CloudTask;
    expect(
      workflowListSummary(meeting, [
        {
          slug: "meeting-pre-brief",
          taskSlug: "oppulence-meeting-pre-brief",
          description: "Prepare evidence-linked context for upcoming customer meetings.",
        },
      ]),
    ).toBe("Prepare evidence-linked context for upcoming customer meetings.");
    expect(
      workflowListSummary({
        ...meeting,
        triggers: {
          workflow: {
            version: 1,
            trigger: { kind: "manual" },
            actions: ["write-brief"],
            objective: "Brief me before the Acme call.",
          },
        },
      }),
    ).toBe("Brief me before the Acme call.");
  });

  it("opens a managed workflow on its template description", () => {
    const meeting = {
      name: "Meeting Pre-Brief",
      slug: "oppulence-meeting-pre-brief",
      templateSlug: "meeting-pre-brief",
      triggers: { cronExpr: "*/30 * * * *" },
    } as CloudTask;
    expect(
      workflowForTask(meeting, [
        {
          slug: "meeting-pre-brief",
          taskSlug: "oppulence-meeting-pre-brief",
          description: "Prepare evidence-linked context for upcoming customer meetings.",
        },
      ]).objective,
    ).toBe("Prepare evidence-linked context for upcoming customer meetings.");
  });
});
