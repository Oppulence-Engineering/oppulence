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
  calledModelLabel,
  readableEnum,
  runEventBody,
  runEventLabel,
  runReference,
  scheduleHealthLabel,
  workflowListSummary,
  type CloudTask,
} from "@/lib/workflows/cloud-workflows";

const source = fs.readFileSync(path.join(import.meta.dirname, "cloud-workflows-view.tsx"), "utf8");

const task = (name: string, updatedAt: string): CloudTask => ({ name, updatedAt }) as CloudTask;

describe("CloudWorkflowsView", () => {
  it("shows run status and trigger tokens as words", () => {
    expect(readableEnum("succeeded")).toBe("Succeeded");
    expect(readableEnum("cron")).toBe("Cron");
    expect(readableEnum("")).toBe("");
    expect(runRowDetail("failed", "cron")).toBe("Failed · Cron");
    expect(source).toContain("runRowDetail(run.status, run.trigger)");
    expect(source).toContain("workflowName={taskTitle(task)}");
    expect(source).toContain('friendlyAgentError(message, "run")');
  });

  it("names schedule health and transcript events", () => {
    expect(scheduleHealthLabel("current")).toBe("In sync");
    expect(scheduleHealthLabel("failed")).toBe("Needs repair");
    expect(runEventLabel("temporal.failed")).toBe("Failed");
    expect(runEventLabel("runtime.tool_call_started")).toBe("Tool call started");
    expect(runEventLabel("runtime.llm_call_started")).toBe("Model call started");
    expect(runEventLabel("desktop.llm_stream_event")).toBe("LLM stream event");
  });

  it("describes a transcript row without the worker payload", () => {
    expect(
      runEventBody({
        type: "temporal.queued",
        event: { message: "Queued by Temporal schedule." },
      }),
    ).toBe("Queued on the schedule.");
    expect(
      runEventBody({
        type: "temporal.running",
        event: { message: "API worker claimed the run." },
      }),
    ).toBe("Oppulence Cloud started this run.");
    expect(
      runEventBody({
        type: "runtime.llm_call_started",
        event: {
          model: "openai/gpt-4.1",
          prompt_version: "cloud-runtime-v1",
        },
      }),
    ).toBe("Calling GPT-4.1.");
    expect(calledModelLabel("openai/gpt-4o-mini")).toBe("GPT-4o mini");
    expect(calledModelLabel("anthropic/claude-3-5-sonnet")).toBe("Claude 3.5 Sonnet");
    expect(calledModelLabel("workspace-default")).toBe("workspace-default");
    expect(
      runEventBody({
        type: "temporal.failed",
        event: {
          message: "Failed.",
          error:
            'llm upstream returned status 401: {"error":{"message":"Missing Authentication header"}}',
        },
      }),
    ).toBe("The AI provider rejected the API key for this workspace. Nothing was charged.");
    expect(runEventBody({ type: "runtime.unknown", event: { prompt_version: "cloud-runtime-v1" } })).toBe(
      "Recorded an update.",
    );
    expect(runEventBody({ event: "Agent step 1." })).toBe("Agent step 1.");
    expect(source).toContain("runEventBody(event)");
    expect(source).not.toContain("JSON.stringify(event.event");
    expect(runReference("sched-temporal-c9522e0b-4fc9-47a3-9fbf-434c9faf2262")).toBe(
      "c9522e0b-4fc9-47a3-9fbf-434c9faf2262",
    );
    expect(runReference("api-trigger-9f")).toBe("9f");
    expect(runReference("retry-1")).toBe("1");
    expect(runReference("manual-run")).toBe("manual-run");
    expect(source).toContain("runReference(run.runId)");
    expect(source).toContain("title={run.runId}");
  });

  it("names weekday crons that the first-party templates use", () => {
    const digest = { triggers: { cronExpr: "0 8 * * 1-5" } } as CloudTask;
    const followups = { triggers: { cronExpr: "0 17 * * 1-5" } } as CloudTask;
    expect(scheduleLabel(digest)).toBe("Weekdays at 8:00 AM");
    expect(scheduleLabel(followups)).toBe("Weekdays at 5:00 PM");
    expect(
      scheduleLabel({
        triggers: {
          workflow: {
            version: 1,
            trigger: { kind: "relationship-risk" },
            actions: ["review-account"],
          },
        },
      } as CloudTask),
    ).toBe("When company risk changes");
    expect(workflowListSummary({ name: "Untitled", triggers: {} } as CloudTask)).toBe(
      "Recurring company follow-up",
    );
    expect(
      workflowListSummary(
        {
          slug: "oppulence-relationship-refresh",
          name: "Relationship Refresh",
          triggers: {},
        } as CloudTask,
        [
          {
            slug: "relationship-refresh",
            taskSlug: "oppulence-relationship-refresh",
            description:
              "Continuously summarize relationship state, evidence freshness, commitments, and material changes.",
          },
        ],
      ),
    ).toBe(
      "Summarize each company's latest state, evidence freshness, commitments, and material changes.",
    );
    expect(
      workflowListSummary(
        {
          slug: "oppulence-attention-monitor",
          name: "Attention Monitor",
          triggers: {},
        } as CloudTask,
        [
          {
            slug: "attention-monitor",
            taskSlug: "oppulence-attention-monitor",
            description: "Explain which relationships need attention now and why.",
          },
        ],
      ),
    ).toBe("Explain which companies need attention now and why.");
    expect(source).toContain("automate recurring company follow-up");
    expect(source).not.toContain("recurring relationship work");
    expect(source).toContain("review the company and draft a concise recovery email");
    expect(source).not.toContain("review the account");
    expect(source).toContain("Oppulence Cloud keeps the schedule.");
    expect(source).not.toContain("cloud runtime");
    expect(source).not.toContain("View settings");
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

  it("does not invent HubSpot writes for a system workflow without a canvas", () => {
    const meeting = {
      name: "Post-Meeting Processor",
      slug: "oppulence-post-meeting-processor",
      templateSlug: "post-meeting-processor",
      triggers: { cronExpr: "*/15 * * * *" },
    } as CloudTask;
    expect(workflowForTask(meeting).actions).toEqual(["review-account", "write-brief"]);
    expect(source).not.toContain("update-crm-note");
  });
});
