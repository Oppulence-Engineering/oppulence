import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  runFailureLine,
  runRowDetail,
  runStatusFilterName,
  runTriggerFilterName,
  runWhereFilterName,
  scheduleLabel,
  sortWorkflowTasks,
  workflowEditorTabName,
  workflowRunCountLabel,
  workflowForTask,
  workflowOpeningScreen,
  workflowLastRunAt,
  workflowLastRunMark,
  workflowSettingsLastRun,
  workflowRunsForEditor,
  maintainedWorkflowNotice,
  workflowSettingsIntro,
  createWorkflowIntro,
  workflowStepLabel,
} from "@/components/features/workflows/cloud-workflows-view/cloud-workflows-view";
import {
  calledModelLabel,
  readableEnum,
  runEventBody,
  triggerLabel,
  runEventLabel,
  runReference,
  scheduleHealthLabel,
  scheduleMomentLabel,
  workflowListSummary,
  type CloudTask,
} from "@/lib/workflows/cloud-workflows";

const source = fs.readFileSync(path.join(import.meta.dirname, "cloud-workflows-view.tsx"), "utf8");

const task = (name: string, updatedAt: string): CloudTask => ({ name, updatedAt }) as CloudTask;

describe("CloudWorkflowsView", () => {
  it("treats a workflow search miss as a filter, not an empty library", () => {
    expect(source).toContain("No workflows match this search. Try another phrase.");
    expect(source).toContain("Clear search");
    expect(source).toContain("query.trim()\n                  ? []");
    expect(source).toContain("Start from a trigger or schedule");
    expect(source).toContain("aria-label={`Use ${name}`}");
  });

  it("names editor tabs without gluing the run count onto the id", () => {
    expect(workflowEditorTabName("editor", 16)).toBe("Editor");
    expect(workflowEditorTabName("settings", 16)).toBe("Settings");
    expect(workflowEditorTabName("runs", 16)).toBe("Runs, 16");
    expect(workflowEditorTabName("runs", 1)).toBe("Runs, 1");
    expect(workflowEditorTabName("runs", 50, true)).toBe("Runs, 50+");
    expect(workflowEditorTabName("runs", 6, false, false)).toBe("Runs");
    expect(workflowRunCountLabel(50, true)).toBe("50+");
    expect(workflowRunCountLabel(9, false)).toBe("9");
    expect(workflowRunCountLabel(6, false, false)).toBe("");
    expect(source).toContain("workflowEditorTabName(");
    expect(source).toContain("taskRunsHasMore");
    expect(source).toContain('aria-label="Workflow"');
    expect(source).toContain('subscribeWorkflowLibrary(() => setScreen("library"))');
  });

  it("counts canvas actions as steps and not the trigger", () => {
    const twoSteps = {
      triggers: {
        workflow: {
          version: 1,
          trigger: { kind: "schedule", cronExpr: "*/15 * * * *" },
          actions: ["review-account", "write-brief"],
        },
      },
    } as CloudTask;
    const oneStep = {
      triggers: {
        workflow: {
          version: 1,
          trigger: { kind: "manual" },
          actions: ["review-account"],
        },
      },
    } as CloudTask;
    expect(workflowStepLabel(twoSteps)).toBe("2 steps");
    expect(workflowStepLabel(oneStep)).toBe("1 step");
    expect(source).toContain("{workflowStepLabel(task)}");
    expect(source).not.toContain("actions.length + 1");
    expect(source).toContain('aria-label="How to start"');
  });

  it("opens a sidebar run on the runs list instead of the canvas", () => {
    expect(workflowOpeningScreen("runs", "company-refresh", "run-1")).toBe("runs");
    expect(workflowOpeningScreen("scheduled", "company-refresh", "run-1")).toBe("runs");
    expect(workflowOpeningScreen("scheduled", "company-refresh")).toBe("editor");
    expect(workflowOpeningScreen("runs")).toBe("runs");
    expect(workflowOpeningScreen("scheduled")).toBe("library");
    expect(source).toContain("workflowOpeningScreen(focus, initialSlug, initialRunId)");
  });
  it("shows run status and trigger tokens as words", () => {
    expect(readableEnum("succeeded")).toBe("Succeeded");
    expect(readableEnum("cron")).toBe("Cron");
    expect(readableEnum("")).toBe("");
    expect(triggerLabel("window")).toBe("Time window");
    expect(triggerLabel("cron")).toBe("Scheduled");
    expect(triggerLabel("event")).toBe("Incoming event");
    expect(triggerLabel("manual")).toBe("Started by hand");
    expect(runRowDetail("failed", "cron")).toBe("Failed · Scheduled");
    expect(runRowDetail("failed", "window")).toBe("Failed · Time window");
    expect(source).toContain("runRowDetail(run.status, run.trigger)");
    expect(runFailureLine({ error: "", errorCode: "" })).toBeNull();
    expect(
      runFailureLine({
        error:
          'llm upstream returned status 401: {"error":{"message":"Missing Authentication header"}}',
        errorCode: "llm_call_failed",
      }),
    ).toBe("The AI provider rejected the API key for this workspace. Nothing was charged.");
    expect(source.match(/<RunRowFailure run=\{run\} \/>/g)).toHaveLength(2);
    expect(source).toContain("triggerLabel(run.trigger)");
    expect(source).not.toContain("{readableEnum(run.trigger)}");
    expect(source).toContain("workflowName={taskTitle(task)}");
    expect(source).toContain('friendlyAgentError(message, "run")');
  });

  it("names schedule health and transcript events", () => {
    expect(scheduleHealthLabel("current")).toBe("In sync");
    expect(scheduleHealthLabel("failed")).toBe("Needs repair");
    expect(runEventLabel("temporal.failed")).toBe("Failed");
    expect(runEventLabel("runtime.tool_call_started")).toBe("Tool call started");
    expect(runEventLabel("runtime.llm_call_started")).toBe("Model call started");
    expect(runEventLabel("desktop.llm_stream_event")).toBe("Model stream");
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
    expect(runEventBody({ event: "Agent step 1." })).toBe("Step 1.");
    expect(source).toContain("runEventBody(event)");
    expect(source).not.toContain("JSON.stringify(event.event");
    expect(runReference("sched-temporal-c9522e0b-4fc9-47a3-9fbf-434c9faf2262")).toBe(
      "c9522e0b",
    );
    expect(runReference("241dea88-95d9-4d7b-add0-075e93288cdd")).toBe("241dea88");
    expect(runReference("api-trigger-9f")).toBe("9f");
    expect(runReference("retry-1")).toBe("1");
    expect(runReference("manual-run")).toBe("manual-run");
    expect(source).toContain("runReference(run.runId)");
    expect(source).toContain("title={run.runId}");
  });

  it("names weekday crons that the first-party templates use", () => {
    const digest = { triggers: { cronExpr: "0 8 * * 1-5" } } as CloudTask;
    const followups = { triggers: { cronExpr: "0 17 * * 1-5" } } as CloudTask;
    expect(scheduleLabel(digest)).toBe("Weekdays at 8:00 AM UTC");
    expect(scheduleLabel(followups)).toBe("Weekdays at 5:00 PM UTC");
    expect(scheduleLabel({ triggers: { cronExpr: "0 8 * * *" } } as CloudTask)).toBe(
      "Every day at 8:00 AM UTC",
    );
    expect(scheduleLabel({ triggers: { cronExpr: "*/15 * * * *" } } as CloudTask)).toBe(
      "Every 15 minutes",
    );
    expect(scheduleMomentLabel("2026-10-01T08:00:00Z", "UTC")).toBe("Oct 1, 8:00 AM");
    expect(scheduleMomentLabel("2026-10-01T08:00:00Z", "America/New_York")).toBe(
      "Oct 1, 4:00 AM (Oct 1, 8:00 AM UTC)",
    );
    expect(scheduleMomentLabel(null, "America/New_York")).toBe("—");
    expect(source).toContain("scheduleMomentLabel(lastRunAt)");
    expect(source).toContain("scheduleMomentLabel(schedule?.nextDueAt)");
    expect(source).toContain("return scheduleMomentLabel(value)");
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
    expect(
      scheduleLabel({
        triggers: {
          workflow: {
            version: 1,
            trigger: { kind: "profile-change" },
            actions: ["review-account"],
          },
        },
      } as CloudTask),
    ).toBe("When a company or person is updated");
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
      "Summarize what is new for each company, including open promises.",
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
    expect(source).toContain("workflowProductDescription(template.slug, template.description)");
    expect(source).not.toContain("{template.description}");
    expect(source).toContain(
      "When a promise is about to slip, review the company and draft a follow-up that waits for your approval.",
    );
    expect(source).toContain('placeholder="Follow up when a promise slips"');
    expect(source).not.toContain("Recover at-risk commitments");
    expect(source).not.toContain("concise recovery email");
    expect(source).not.toContain("review the account");
    expect(source).toContain("When a promise needs a follow-up");
    expect(source).not.toContain("When a commitment needs recovery");
    expect(source).toContain("When mail or a message arrives");
    expect(source).toContain("Oppulence keeps the name and the schedule.");
    expect(source).toContain("Oppulence Cloud keeps it running.");
    expect(source).not.toContain("Oppulence Cloud keeps the schedule.");
    expect(source).not.toContain("cloud runtime");
    expect(source).not.toContain("View settings");
    expect(source).toContain("{createWorkflowIntro()}");
    expect(createWorkflowIntro()).toBe(
      "Name the workflow and what it should accomplish. The schedule and the steps come next.",
    );
    expect(source).not.toContain("You can choose when it starts and what it does next.");
    expect(source).toContain("Create workflow");
    expect(source).not.toContain("Create draft");
    expect(source).not.toContain("configure the trigger and actions on the canvas");
    expect(source).toContain("All statuses");
    expect(source).toContain("Cloud or desktop");
    expect(runStatusFilterName("all")).toBe("Status, All statuses");
    expect(runStatusFilterName("failed")).toBe("Status, Failed");
    expect(runTriggerFilterName("all")).toBe("Trigger, All triggers");
    expect(runTriggerFilterName("cron")).toBe("Trigger, Scheduled");
    expect(runWhereFilterName("all")).toBe("Where it runs, Cloud or desktop");
    expect(runWhereFilterName("api")).toBe("Where it runs, Cloud");
    expect(source).toContain("aria-label={runStatusFilterName(statusFilter)}");
    expect(source).toContain("aria-label={runTriggerFilterName(triggerFilter)}");
    expect(source).toContain("aria-label={runWhereFilterName(executorFilter)}");
    expect(source).not.toContain(">All status<");
    expect(source).not.toContain("All runtimes");
  });

  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function CloudWorkflowsView");
  });

  it("opens the runs tab when Run now is clicked", () => {
    expect(source).toContain('setTab("runs")');
    expect(source).toContain('useState<EditorTab>(selectedRun ? "runs" : "editor")');
    expect(source).toContain("onRun();");
  });

  it("shows a workflow's own last run when that run is off the first page", () => {
    expect(workflowLastRunAt({ lastRunAt: "2026-09-30T09:00:00.063Z" }, undefined)).toBe(
      "2026-09-30T09:00:00.063Z",
    );
    expect(workflowLastRunAt({ lastRunAt: null }, undefined)).toBeNull();
    expect(workflowLastRunAt({}, "2026-09-30T18:15:00Z")).toBe("2026-09-30T18:15:00Z");
    expect(
      workflowLastRunAt(
        { lastRunAt: "2026-09-30T09:00:00Z" },
        "2026-09-30T18:15:00.252Z",
      ),
    ).toBe("2026-09-30T18:15:00.252Z");
    expect(
      workflowLastRunAt({ lastRunAt: "2026-09-30T18:15:00.558Z" }, "2026-09-30T18:00:00Z"),
    ).toBe("2026-09-30T18:15:00.558Z");
    expect(source).toContain("workflowLastRunAt(");
    expect(source).not.toContain("const lastRun = runs.find((run) => run.slug === task.slug)");
    expect(workflowLastRunMark({ lastRunAt: "2026-09-30T09:00:00Z" }, null)).toBeNull();
    expect(
      workflowLastRunMark(
        { lastRunAt: "2026-09-30T09:00:00Z", lastRunError: "activity error" },
        null,
      ),
    ).toBe("Failed");
    expect(
      workflowLastRunMark(
        { lastRunAt: "2026-09-30T09:00:00Z", lastRunError: "stale" },
        { createdAt: "2026-09-30T18:30:00Z", status: "succeeded" },
      ),
    ).toBeNull();
    expect(
      workflowLastRunMark(
        { lastRunAt: "2026-09-30T18:30:00.539Z", lastRunError: "" },
        { createdAt: "2026-09-30T18:30:00.548Z", status: "failed" },
      ),
    ).toBe("Failed");
    expect(
      workflowLastRunMark(
        { lastRunAt: "2026-09-30T18:30:00Z" },
        { createdAt: "2026-09-30T18:30:00Z", status: "stopped" },
      ),
    ).toBe("Stopped");
    expect(source).toContain("workflowLastRunMark(");
    expect(source).not.toContain("lastRunError}");
    expect(
      workflowSettingsLastRun(
        { lastRunAt: "2026-09-30T09:00:00Z", lastRunError: "activity error" },
        null,
      ),
    ).toMatch(/ · Failed$/);
    expect(workflowSettingsLastRun({ lastRunAt: null, lastRunError: null }, null)).toBe("Never");
    expect(
      workflowSettingsLastRun(
        { lastRunAt: "2026-09-30T18:30:00Z", lastRunError: "stale" },
        { createdAt: "2026-09-30T18:30:00Z", status: "succeeded" },
      ),
    ).not.toContain("Failed");
    expect(source).toContain("workflowSettingsLastRun(");
  });

  it("loads a workflow's own runs when they are off the account page", () => {
    const account = [{ slug: "oppulence-post-meeting-processor", runId: "recent" }];
    const daily = { slug: "oppulence-attention-monitor", runId: "morning" };
    expect(workflowRunsForEditor("oppulence-attention-monitor", account, null)).toEqual({
      runs: [],
      settled: false,
      hasMore: false,
    });
    expect(workflowRunsForEditor("oppulence-attention-monitor", account, [daily])).toEqual({
      runs: [daily],
      settled: true,
      hasMore: false,
    });
    expect(workflowRunsForEditor("oppulence-attention-monitor", account, [daily], true)).toEqual({
      runs: [daily],
      settled: true,
      hasMore: true,
    });
    expect(
      workflowRunsForEditor("oppulence-post-meeting-processor", account, null).runs,
    ).toEqual(account);
    expect(source).toContain("useWorkflowRuns({ slug: task.slug })");
    expect(source).toContain('taskRunsSettled ? "No runs yet." : "Loading runs…"');
    const runsAt = source.indexOf('value="runs"');
    const runsPane = source.slice(runsAt - 80, runsAt + 500);
    expect(runsPane).toContain("EDITOR_PANE_CLASS");
    expect(runsPane).toContain('className="h-full min-h-0 border-r border-border"');
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
    expect(source).toContain("Last updated");
    expect(source).not.toContain("Last published");
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
    ).toBe("Get the promises, risks, and goals ready before a meeting.");
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
      ]    ).objective,
    ).toBe("Get the promises, risks, and goals ready before a meeting.");
  });

  it("does not invent steps for a system workflow without a canvas", () => {
    const meeting = {
      name: "Post-Meeting Processor",
      slug: "oppulence-post-meeting-processor",
      templateSlug: "post-meeting-processor",
      triggers: { cronExpr: "*/15 * * * *" },
    } as CloudTask;
    const sourceHealth = {
      name: "Connector Health and Repair",
      slug: "oppulence-connector-health-repair",
      triggers: { cronExpr: "*/30 * * * *" },
    } as CloudTask;
    expect(workflowForTask(meeting).actions).toEqual([]);
    expect(workflowForTask(sourceHealth).actions).toEqual([]);
    expect(workflowStepLabel(meeting)).toBe("Maintained");
    expect(workflowStepLabel(sourceHealth)).toBe("Maintained");
    expect(workflowForTask(meeting).objective).toBe(
      "Turn a finished meeting into promises, risks, and a follow-up that waits for your approval.",
    );
    expect(source).not.toContain("update-crm-note");
    expect(source).not.toContain('return ["review-account", "write-brief"]');
    expect(maintainedWorkflowNotice()).toBe(
      "Oppulence maintains the steps for this workflow. You can pause it and run it on demand.",
    );
    expect(workflowSettingsIntro(false)).toBe(
      "Oppulence keeps the name and the schedule. This page shows when the workflow runs.",
    );
    expect(workflowSettingsIntro(true)).toBe(
      "Change the name. The schedule is set on the workflow, and Oppulence Cloud keeps it running.",
    );
    expect(source).toContain("{workflowSettingsIntro(editable)}");
    expect(source).not.toContain("Name, schedule, and where the workflow runs.");
    expect(source).toContain("maintainedWorkflowNotice()");
    expect(source).not.toContain("You can pause it, inspect it, and run it");
  });
});
