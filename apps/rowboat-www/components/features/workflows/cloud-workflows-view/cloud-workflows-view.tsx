"use client";

import "client-only";

import * as React from "react";
import {
  ArrowClockwise,
  CaretRight,
  CheckCircle,
  Clock,
  Cloud,
  Gear,
  MagnifyingGlass,
  Pause,
  Play,
  Plus,
  Robot,
  Warning,
  XCircle,
} from "@/lib/icons";

import { friendlyAgentError } from "@/lib/agents/agent-history";
import { Badge } from "@oppulence/ui/components/badge";
import { Button } from "@oppulence/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@oppulence/ui/components/dialog";
import { Input } from "@oppulence/ui/components/input";
import { Label } from "@oppulence/ui/components/label";
import { Progress } from "@oppulence/ui/components/progress";
import { ScrollArea } from "@oppulence/ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@oppulence/ui/components/select";
import { CardDescription } from "@oppulence/ui/components/card";
import { Separator } from "@oppulence/ui/components/separator";
import { Spinner } from "@oppulence/ui/components/spinner";
import { Switch } from "@oppulence/ui/components/switch";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@oppulence/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@oppulence/ui/components/tabs";
import { Textarea } from "@oppulence/ui/components/textarea";
import { WorkspaceEmptyState } from "@/components/features/revenue/shared/shared";
import { VisualWorkflowBuilder } from "@/components/features/workflows/visual-workflow-builder/visual-workflow-builder";
import { subscribeWorkflowLibrary } from "@/lib/dashboard/workflow-library-request";
import {
  useWorkflowRuns,
  useWorkflowTasks,
  useWorkflowTemplates,
} from "@/hooks/queries/use-workflows";
import { workflowKeys } from "@/hooks/queries/utils/workflow-keys";
import { useQueryClient } from "@tanstack/react-query";
import {
  cancelCloudRun,
  compileVisualWorkflow,
  cronClockLabel,
  createCloudTask,
  deleteCloudTask,
  ensureFirstPartyWorkflows,
  getCloudRun,
  getCloudSchedule,
  instantiateCloudTemplate,
  listCloudRunEvents,
  retryCloudRun,
  transcriptNextEventsLabel,
  taskCron,
  taskVisualWorkflow,
  readableEnum,
  triggerLabel,
  runEventBody,
  runEventLabel,
  runReference,
  scheduleHealthLabel,
  scheduleMomentLabel,
  workflowListSummary,
  triggerCloudRun,
  updateCloudTask,
  type CloudRun,
  type CloudRunEvent,
  type CloudRunStatus,
  type CloudRunTrigger,
  type CloudSchedule,
  type CloudTask,
  type CloudTaskTemplate,
  type VisualWorkflowDefinition,
  type WorkflowActionKind,
} from "@/lib/workflows/cloud-workflows";
import {
  workflowProductDescription,
  workflowProductName,
} from "@/lib/workflows/workflow-product-copy";
import { comboboxFilterName } from "@/lib/a11y/combobox-filter-name";
import { cn } from "@/lib/utils";

type FilterValue<T extends string> = T | "all";
type EditorTab = "editor" | "runs" | "settings";

/**
 * A loaded page is not the whole history. The tab says 50+ while another
 * page exists, and it omits a count until the workflow's own page arrives.
 */
export function workflowRunCountLabel(count: number, hasMore: boolean, settled = true): string {
  if (!settled) return "";
  if (hasMore) return `${count}+`;
  return String(count);
}

/** The count used to be glued onto the raw tab id, so the name was "runs16". */
export function workflowEditorTabName(
  value: EditorTab,
  runCount: number,
  hasMore = false,
  settled = true,
): string {
  if (value === "runs") {
    const count = workflowRunCountLabel(runCount, hasMore, settled);
    return count ? `Runs, ${count}` : "Runs";
  }
  if (value === "settings") return "Settings";
  return "Editor";
}

/**
 * Where a workflows link opens.
 * A sidebar run carries both a workflow slug and a run id. The slug used to
 * win, so the click opened the canvas and the failure stayed hidden.
 */
export function workflowOpeningScreen(
  focus: "scheduled" | "runs",
  initialSlug?: string,
  initialRunId?: string,
): "library" | "editor" | "runs" {
  if (initialRunId) return "runs";
  if (initialSlug) return "editor";
  if (focus === "runs") return "runs";
  return "library";
}

const EDITOR_TAB_LABEL: Record<EditorTab, string> = {
  editor: "Editor",
  runs: "Runs",
  settings: "Settings",
};

/** Active panes fill the editor and clip, so a long run list can scroll to Load more. */
const EDITOR_PANE_CLASS =
  "min-h-0 flex-1 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col";

const terminalStatuses = new Set<CloudRunStatus>(["succeeded", "failed", "stopped"]);
const defaultVisualWorkflow = (): VisualWorkflowDefinition => ({
  version: 1,
  trigger: { kind: "communication" },
  actions: ["review-account", "draft-email"],
  objective: "",
  stepConfig: {
    "action:0": { scope: "matching-record" },
    "action:1": { recipient: "promise-recipient", tone: "concise" },
  },
});

/**
 * Run rows sit beside a schedule that fires in UTC. The library and the next-run
 * line already show the UTC instant when the viewer's clock differs; these rows
 * used a local-only clock, so a New York teammate saw "4:00 AM" for an 8:00 AM UTC run.
 */
function formatDate(value?: string | null): string {
  return scheduleMomentLabel(value);
}

/**
 * Last run on the library row. The runs query is one page of the newest runs,
 * so a workflow that runs once a day falls off that page. Looking the slug up
 * there then says Never, even though the task record still has lastRunAt.
 * A run that is already on the page can be newer than that stored moment, so
 * the later of the two is the one shown.
 */
export function workflowLastRunAt(
  task: { lastRunAt?: string | null },
  pageRunAt?: string | null,
): string | null {
  const stored = task.lastRunAt?.trim() ?? "";
  const paged = pageRunAt?.trim() ?? "";
  if (!stored) return paged || null;
  if (!paged) return stored;
  const storedTime = Date.parse(stored);
  const pagedTime = Date.parse(paged);
  if (Number.isNaN(storedTime)) return paged;
  if (Number.isNaN(pagedTime)) return stored;
  return pagedTime > storedTime ? paged : stored;
}

/**
 * The library row used to show only the clock next to Live. A run can fail
 * and still leave that clock looking successful. The mark belongs to the
 * moment on the row: the newest page hit when it is at least as new as the
 * stored time, otherwise the error kept on the task. That error is empty
 * when the latest recorded run did not fail. The raw error stays off the
 * row, because it names the scheduler.
 */
export function workflowLastRunMark(
  task: { lastRunAt?: string | null; lastRunError?: string | null },
  pageRun?: { createdAt?: string | null; status?: string | null } | null,
): string | null {
  const shown = workflowLastRunAt(task, pageRun?.createdAt);
  if (!shown) return null;
  const pageTime = Date.parse(pageRun?.createdAt?.trim() ?? "");
  const storedTime = Date.parse(task.lastRunAt?.trim() ?? "");
  const pageIsShown =
    Boolean(pageRun) &&
    !Number.isNaN(pageTime) &&
    (Number.isNaN(storedTime) || pageTime >= storedTime);
  if (pageIsShown) {
    if (pageRun?.status === "failed") return "Failed";
    if (pageRun?.status === "stopped") return "Stopped";
    return null;
  }
  return task.lastRunError?.trim() ? "Failed" : null;
}

/** Settings already says the schedule is in sync. That is not the last run. */
export function workflowSettingsLastRun(
  task: { lastRunAt?: string | null; lastRunError?: string | null },
  pageRun?: { createdAt?: string | null; status?: string | null } | null,
): string {
  const at = workflowLastRunAt(task, pageRun?.createdAt);
  if (!at) return "Never";
  const when = scheduleMomentLabel(at);
  const mark = workflowLastRunMark(task, pageRun);
  return mark ? `${when} · ${mark}` : when;
}

/**
 * The account run list is the newest page across every workflow. A workflow
 * that runs once a day falls off that page, so its Runs tab said there were
 * no runs while the library still showed the failed last run. The workflow's
 * own page is the list. Until that page arrives, the account page is only a
 * preview and must not be described as empty.
 */
export function workflowRunsForEditor<T extends { slug: string }>(
  slug: string,
  accountRuns: readonly T[],
  workflowRuns: readonly T[] | null,
  hasMore = false,
): { runs: T[]; settled: boolean; hasMore: boolean } {
  if (workflowRuns) {
    return {
      runs: workflowRuns.filter((run) => run.slug === slug),
      settled: true,
      hasMore,
    };
  }
  return { runs: accountRuns.filter((run) => run.slug === slug), settled: false, hasMore: false };
}

/** Status and trigger as words. The runs list used to show only an icon, so
 * every row looked the same until you opened it. */
export function runRowDetail(status: string, trigger: string): string {
  return `${readableEnum(status)} · ${triggerLabel(trigger)}`;
}

/** The visible label is the current choice. The accessible name also says
 * which filter it is, because a combobox does not name itself from that text. */
export function runStatusFilterName(value: string): string {
  return comboboxFilterName("Status", value === "all" ? "All statuses" : readableEnum(value));
}

export function runTriggerFilterName(value: string): string {
  return comboboxFilterName("Trigger", value === "all" ? "All triggers" : triggerLabel(value));
}

export function runWhereFilterName(value: string): string {
  const current = value === "api" ? "Cloud" : value === "desktop" ? "Desktop" : "Cloud or desktop";
  return comboboxFilterName("Where it runs", current);
}

/** A failed run should say why in the list. Opening it is not required to learn that. */
export function runFailureLine(run: Pick<CloudRun, "error" | "errorCode">): string | null {
  if (!run.error) return null;
  return runFailureCopy(run as CloudRun);
}

function statusTone(status: string): string {
  switch (status) {
    case "succeeded":
    case "current":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "failed":
      return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
    case "running":
    case "syncing":
      return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300";
    case "queued":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    default:
      return "border-border bg-muted/50 text-muted-foreground";
  }
}

function RunRowFailure({ run }: { run: CloudRun }) {
  const failure = runFailureLine(run);
  if (!failure) return null;
  return (
    <CardDescription className="mt-0.5 block truncate text-[11px] text-destructive">
      {failure}
    </CardDescription>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "succeeded" || status === "current")
    return <CheckCircle className="size-4" weight="fill" />;
  if (status === "failed") return <XCircle className="size-4" weight="fill" />;
  if (status === "running" || status === "syncing") return <Spinner className="size-4" />;
  if (status === "queued") return <Clock className="size-4" />;
  return <Pause className="size-4" />;
}

function shownWorkflowError(cause: unknown, fallback: string): string {
  return friendlyAgentError(cause instanceof Error ? cause.message : fallback);
}

function runFailureCopy(run: CloudRun): string {
  const message = run.error ?? "";
  const friendly = friendlyAgentError(message, "run");
  // The stored code is an API token such as llm_call_failed. Once the message
  // is rewritten, prefixing that token puts the internal name back on screen.
  if (friendly !== message) return friendly;
  return run.errorCode ? `${run.errorCode}: ${message}` : message;
}

export function scheduleLabel(task: CloudTask): string {
  const visual = taskVisualWorkflow(task);
  // Risk and profile triggers are checked on a 15-minute poll. That cron is
  // how the cloud wakes up; the library and settings still name the condition
  // the teammate chose. A real schedule is the only trigger whose clock is
  // the answer.
  switch (visual?.trigger.kind) {
    case "communication":
      return "When mail or a message arrives";
    case "profile-change":
      return "When a company or person is updated";
    case "relationship-risk":
      return "When company risk changes";
    case "commitment-risk":
      return "When a promise needs a follow-up";
    case "manual":
      return "Manual start";
    default:
      break;
  }
  const cron =
    visual?.trigger.kind === "schedule"
      ? visual.trigger.cronExpr?.trim() || taskCron(task)
      : taskCron(task);
  const intervals: Record<string, string> = {
    "*/15 * * * *": "Every 15 minutes",
    "*/30 * * * *": "Every 30 minutes",
  };
  if (cron) return intervals[cron] ?? cronClockLabel(cron);
  return "Manual start";
}

export function workflowForTask(
  task: CloudTask,
  templates: readonly Pick<CloudTaskTemplate, "slug" | "taskSlug" | "description">[] = [],
): VisualWorkflowDefinition {
  const visual = taskVisualWorkflow(task);
  if (visual) return visual;
  // These rows store instructions, not a canvas. Drawing the same two steps
  // on every one made Source health look like it reviews a company.
  return {
    version: 1,
    trigger: taskCron(task) ? { kind: "schedule", cronExpr: taskCron(task) } : { kind: "manual" },
    actions: [],
    objective: workflowListSummary(task, templates),
  };
}

/**
 * The library column counts canvas actions. The trigger already has its own
 * Starts column, so adding it here made a two-step workflow read as three.
 * A maintained workflow has no canvas, so a step count would be invented.
 */
/**
 * System workflows have no canvas. Pause and run-on-demand are the actions a
 * teammate can take; "inspect the steps" would describe a surface that is not there.
 */
export function maintainedWorkflowNotice(): string {
  return "Oppulence maintains the steps for this workflow. You can pause it and run it on demand.";
}

/**
 * Settings can rename a workspace workflow. A maintained workflow locks the
 * name, and the schedule is never edited on this page.
 */
export function workflowSettingsIntro(editable: boolean): string {
  if (editable) {
    return "Change the name. The schedule is set on the workflow, and Oppulence Cloud keeps it running.";
  }
  return "Oppulence keeps the name and the schedule. This page shows when the workflow runs.";
}

/** This dialog only asks for a name and an objective. The schedule and steps are on the next screen. */
export function createWorkflowIntro(): string {
  return "Name the workflow and what it should accomplish. The schedule and the steps come next.";
}

/** A workspace workflow can be removed. A maintained one can only be paused. */
export function deleteWorkflowConfirmCopy(name: string): string {
  const title = name.trim() || "this workflow";
  return `Remove ${title} and its runs? This cannot be undone.`;
}

export function workflowStepLabel(task: CloudTask): string {
  const visual = taskVisualWorkflow(task);
  if (!visual) return "Maintained";
  const steps = visual.actions.length;
  return steps === 1 ? "1 step" : `${steps} steps`;
}

/**
 * The library search used to read the name, schedule, and subtitle. The row
 * also prints Live or Draft, the step count, the last-run clock (and Failed
 * beside it), and Oppulence on a maintained workflow. Those words have to
 * find the workflow.
 */
export function workflowLibrarySearchText(
  task: CloudTask,
  templates: readonly Pick<CloudTaskTemplate, "slug" | "taskSlug" | "description">[] = [],
  pageRun?: { createdAt?: string | null; status?: string | null } | null,
): string {
  const lastRunAt = workflowLastRunAt(task, pageRun?.createdAt);
  const mark = workflowLastRunMark(task, pageRun);
  const lastRun = lastRunAt
    ? `${scheduleMomentLabel(lastRunAt)}${mark ? ` · ${mark}` : ""}`
    : "Never";
  return [
    taskTitle(task),
    scheduleLabel(task),
    workflowListSummary(task, templates),
    workflowStepLabel(task),
    task.active ? "Live" : "Draft",
    task.systemManaged ? "Oppulence" : "",
    lastRun,
  ].join(" ");
}

function CreateWorkflowDialog({
  templates,
  onCreated,
}: {
  templates: CloudTaskTemplate[];
  onCreated: (task: CloudTask) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [objective, setObjective] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const definition = { ...defaultVisualWorkflow(), objective: objective.trim() };
      const compiled = compileVisualWorkflow(definition);
      const task = await createCloudTask({
        name: name.trim(),
        instructions: compiled.instructions,
        active: false,
        triggers: compiled.triggers,
      });
      onCreated(task);
      setOpen(false);
      setName("");
      setObjective("");
    } catch (cause) {
      setError(shownWorkflowError(cause, "Could not create workflow"));
    } finally {
      setBusy(false);
    }
  };

  const instantiate = async (template: CloudTaskTemplate) => {
    setBusy(true);
    setError(null);
    try {
      const task = await instantiateCloudTemplate(template.slug);
      onCreated(task);
      setOpen(false);
    } catch (cause) {
      setError(shownWorkflowError(cause, "Could not add template"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button className="rounded-none" size="sm">
          <Plus className="size-4" /> New workflow
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-none sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create workflow</DialogTitle>
          <DialogDescription>{createWorkflowIntro()}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="custom">
          <TabsList aria-label="How to start" className="w-full rounded-none" variant="line">
            <TabsTrigger value="custom">Start from scratch</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>
          <TabsContent className="space-y-4 pt-4" value="custom">
            <div className="space-y-1.5">
              <Label htmlFor="workflow-name">Workflow name</Label>
              <Input
                className="rounded-none"
                id="workflow-name"
                onChange={(event) => setName(event.target.value)}
                placeholder="Follow up when a promise slips"
                value={name}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="workflow-objective">What should happen?</Label>
              <Textarea
                className="min-h-28 rounded-none"
                id="workflow-objective"
                onChange={(event) => setObjective(event.target.value)}
                placeholder="When a promise is about to slip, review the company and draft a follow-up that waits for your approval."
                value={objective}
              />
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button
                className="rounded-none"
                disabled={busy || !name.trim() || !objective.trim()}
                onClick={create}
              >
                {busy ? <Spinner className="size-4" /> : <Cloud />} Create workflow
              </Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent className="pt-4" value="templates">
            <ScrollArea className="h-80 pr-3">
              <div className="divide-y divide-border border border-border">
                {templates
                  .filter((template) => !template.firstParty)
                  .map((template) => {
                    const name = workflowProductName(template.slug, template.name);
                    return (
                      <div
                        className="flex items-start justify-between gap-4 p-3"
                        key={template.slug}
                      >
                        <div>
                          <p className="text-[13px] font-medium">{name}</p>
                          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                            {workflowProductDescription(template.slug, template.description)}
                          </p>
                        </div>
                        <Button
                          aria-label={`Use ${name}`}
                          className="rounded-none"
                          disabled={busy}
                          onClick={() => void instantiate(template)}
                          size="sm"
                          variant="outline"
                        >
                          Use
                        </Button>
                      </div>
                    );
                  })}
                {templates.filter((template) => !template.firstParty).length === 0 ? (
                  <p className="p-6 text-center text-xs text-muted-foreground">
                    No custom templates are available yet.
                  </p>
                ) : null}
              </div>
            </ScrollArea>
            {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export type WorkflowLibrarySort = "published" | "name";

/** The library calls this sort Last updated. The order is the task's update time. */
function taskTitle(task: Pick<CloudTask, "slug" | "name">): string {
  return workflowProductName(task.slug, task.name);
}

function runTitle(run: Pick<CloudRun, "slug">, tasks: readonly CloudTask[]): string {
  const task = tasks.find((item) => item.slug === run.slug);
  return taskTitle(task ?? { slug: run.slug, name: run.slug });
}

export function sortWorkflowTasks(tasks: CloudTask[], sort: WorkflowLibrarySort): CloudTask[] {
  return [...tasks].sort((left, right) =>
    sort === "name"
      ? taskTitle(left).localeCompare(taskTitle(right))
      : right.updatedAt.localeCompare(left.updatedAt),
  );
}

function WorkflowLibrary({
  tasks,
  runs,
  templates,
  busy,
  onCreated,
  onRefresh,
  onSelect,
}: {
  tasks: CloudTask[];
  runs: CloudRun[];
  templates: CloudTaskTemplate[];
  busy: boolean;
  onCreated: (task: CloudTask) => void;
  onRefresh: () => void;
  onSelect: (task: CloudTask) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<WorkflowLibrarySort>("published");
  const filtered = sortWorkflowTasks(
    tasks.filter((task) => {
      const pageRun = runs.find((run) => run.slug === task.slug);
      return workflowLibrarySearchText(task, templates, pageRun)
        .toLowerCase()
        .includes(query.trim().toLowerCase());
    }),
    sort,
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <Button
          className="rounded-none"
          onClick={() => setSort((current) => (current === "published" ? "name" : "published"))}
          size="sm"
          type="button"
          variant="outline"
        >
          Sorted by {sort === "published" ? "Last updated" : "Name"}
        </Button>
        <div className="flex items-center gap-2">
          <Button
            aria-label="Refresh workflows"
            className="rounded-none"
            disabled={busy}
            onClick={onRefresh}
            size="icon-sm"
            variant="ghost"
          >
            <ArrowClockwise className={cn(busy && "animate-spin")} />
          </Button>
          <CreateWorkflowDialog onCreated={onCreated} templates={templates} />
        </div>
      </div>
      <div className="flex h-11 shrink-0 items-center border-b border-border px-3">
        <MagnifyingGlass className="mr-2 size-4 text-muted-foreground" />
        <Input
          aria-label="Search workflows"
          className="h-8 max-w-md rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search workflows"
          value={query}
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="min-w-[760px]">
          <table className="w-full border-collapse text-left" aria-label="Workflows">
            <TableHeader>
              <TableRow className="h-9 border-b hover:bg-transparent">
                <TableHead className="h-9 px-4 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  Workflow
                </TableHead>
                <TableHead className="h-9 px-4 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  Starts
                </TableHead>
                <TableHead className="h-9 w-[110px] px-4 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  Steps
                </TableHead>
                <TableHead className="h-9 w-[110px] px-4 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="h-9 w-[150px] px-4 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                  Last run
                </TableHead>
                <TableHead className="h-9 w-8 px-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((task) => {
                const pageRun = runs.find((run) => run.slug === task.slug);
                const lastRunAt = workflowLastRunAt(task, pageRun?.createdAt);
                const lastRunMark = workflowLastRunMark(task, pageRun);
                return (
                  <TableRow
                    className="cursor-pointer border-b hover:bg-muted/35"
                    key={task.id}
                    onClick={() => onSelect(task)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(task);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <TableCell className="px-4 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge
                            className={cn(
                              "size-2 shrink-0 rounded-none p-0",
                              task.active ? "bg-emerald-500" : "bg-muted-foreground/35",
                            )}
                            variant="default"
                          />
                          <Label className="truncate text-[13px] font-medium">
                            {taskTitle(task)}
                          </Label>
                          {task.systemManaged ? (
                            <Badge className="rounded-none text-[9px]" variant="secondary">
                              Oppulence
                            </Badge>
                          ) : null}
                        </div>
                        <CardDescription className="ml-4.5 mt-0.5 truncate text-[11px]">
                          {workflowListSummary(task, templates)}
                        </CardDescription>
                      </div>
                    </TableCell>
                    <TableCell className="truncate px-4 text-[12px] text-muted-foreground">
                      {scheduleLabel(task)}
                    </TableCell>
                    <TableCell className="px-4 text-[12px] text-muted-foreground">
                      {workflowStepLabel(task)}
                    </TableCell>
                    <TableCell className="px-4 text-[12px]">
                      <Badge
                        className="font-normal"
                        variant={task.active ? "secondary" : "outline"}
                      >
                        {task.active ? "Live" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 text-[12px] text-muted-foreground">
                      {lastRunAt
                        ? `${scheduleMomentLabel(lastRunAt)}${lastRunMark ? ` · ${lastRunMark}` : ""}`
                        : "Never"}
                    </TableCell>
                    <TableCell className="px-4">
                      <CaretRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </table>
          {filtered.length === 0 ? (
            <WorkspaceEmptyState
              action={
                query.trim() ? (
                  <Button onClick={() => setQuery("")} size="sm" type="button" variant="outline">
                    Clear search
                  </Button>
                ) : undefined
              }
              description={
                query.trim()
                  ? "No workflows match this search. Try another phrase."
                  : "Create a workflow to automate recurring company follow-up."
              }
              image="workflows"
              learnMore={
                query.trim()
                  ? []
                  : [
                      { label: "Start from a trigger or schedule" },
                      { label: "Review every workflow run" },
                    ]
              }
              title="Workflows"
            />
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

function RunInspector({
  run,
  events,
  transcriptStatus,
  transcriptHasMore = false,
  loadingMoreEvents = false,
  busy,
  workflowName,
  taskExecutionTarget,
  onCancel,
  onRetry,
  onLoadMoreEvents,
}: {
  run: CloudRun | null;
  events: CloudRunEvent[];
  transcriptStatus: "loading" | "ready" | "error";
  transcriptHasMore?: boolean;
  loadingMoreEvents?: boolean;
  busy: boolean;
  workflowName?: string;
  taskExecutionTarget?: "api" | "desktop";
  onCancel: () => void;
  onRetry: () => void;
  onLoadMoreEvents?: () => void;
}) {
  if (!run)
    return (
      <div className="flex min-h-48 items-center justify-center p-5 text-center text-sm text-muted-foreground">
        Select a run to inspect its status and transcript.
      </div>
    );
  return (
    <div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge className={cn("rounded-none", statusTone(run.status))} variant="outline">
              <StatusIcon status={run.status} /> {readableEnum(run.status)}
            </Badge>
            {workflowName ? (
              <p className="mt-2 truncate text-sm font-medium">{workflowName}</p>
            ) : null}
            <p
              className="mt-1 truncate font-mono text-[10px] text-muted-foreground"
              title={run.runId}
            >
              {runReference(run.runId)}
            </p>
          </div>
          <div className="flex gap-2">
            {!terminalStatuses.has(run.status) &&
            run.executor === "api" &&
            Boolean(run.temporalWorkflowId) ? (
              <Button
                className="rounded-none"
                disabled={busy}
                onClick={onCancel}
                size="sm"
                variant="outline"
              >
                Cancel
              </Button>
            ) : null}
            {(run.status === "failed" || run.status === "stopped") &&
            taskExecutionTarget === "api" ? (
              <Button className="rounded-none" disabled={busy} onClick={onRetry} size="sm">
                Retry
              </Button>
            ) : null}
          </div>
        </div>
        {run.progressPercent != null && !terminalStatuses.has(run.status) ? (
          <div className="space-y-1">
            <Progress value={run.progressPercent} />
            <p className="text-xs text-muted-foreground">
              {run.progressMessage || `${run.progressPercent}%`}
            </p>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <Label className="font-normal text-muted-foreground">Trigger</Label>
            <p className="mt-0.5">{triggerLabel(run.trigger)}</p>
          </div>
          <div>
            <Label className="font-normal text-muted-foreground">Attempt</Label>
            <p className="mt-0.5">{run.attempt}</p>
          </div>
          <div>
            <Label className="font-normal text-muted-foreground">Started</Label>
            <p className="mt-0.5">{formatDate(run.startedAt || run.createdAt)}</p>
          </div>
          <div>
            <Label className="font-normal text-muted-foreground">Completed</Label>
            <p className="mt-0.5">{formatDate(run.completedAt)}</p>
          </div>
        </div>
        {run.summary ? (
          <p className="border border-border p-2.5 text-xs leading-5">{run.summary}</p>
        ) : null}
        {run.error ? (
          <p className="border border-destructive/30 bg-destructive/5 p-2.5 text-xs leading-5 text-destructive">
            {runFailureCopy(run)}
          </p>
        ) : null}
      </div>
      <Separator />
      <div className="p-4">
        <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Transcript
        </p>
        <ScrollArea className="h-64 pr-3">
          <ol className="space-y-3">
            {events.map((event) => (
              <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-2 text-xs" key={event.id}>
                <Badge
                  className="flex size-7 items-center justify-center rounded-none border border-border bg-background font-mono text-[10px] font-normal"
                  variant="outline"
                >
                  {event.seq}
                </Badge>
                <div className="min-w-0 border border-border p-2.5">
                  <div className="flex justify-between gap-2">
                    <Label className="font-medium">{runEventLabel(event.type)}</Label>
                    <time className="text-muted-foreground">{formatDate(event.receivedAt)}</time>
                  </div>
                  <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap font-sans leading-5 text-muted-foreground">
                    {runEventBody(event)}
                  </pre>
                </div>
              </li>
            ))}
            {events.length === 0 && transcriptStatus === "loading" ? (
              <li className="text-muted-foreground">Loading the transcript…</li>
            ) : null}
            {events.length === 0 && transcriptStatus === "error" ? (
              <li className="text-muted-foreground">The transcript could not be loaded.</li>
            ) : null}
            {events.length === 0 && transcriptStatus === "ready" ? (
              <li className="text-muted-foreground">No transcript events yet.</li>
            ) : null}
            {transcriptHasMore ? (
              <li>
                <Button
                  className="w-full rounded-none"
                  disabled={loadingMoreEvents}
                  onClick={onLoadMoreEvents}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {loadingMoreEvents ? "Loading…" : transcriptNextEventsLabel()}
                </Button>
              </li>
            ) : null}
          </ol>
        </ScrollArea>
      </div>
    </div>
  );
}

function WorkflowRuns({
  runs,
  selectedRun,
  events,
  transcriptStatus,
  transcriptHasMore = false,
  loadingMoreEvents = false,
  onLoadMoreEvents,
  busy,
  tasks,
  nextCursor,
  statusFilter,
  triggerFilter,
  executorFilter,
  onStatusFilter,
  onTriggerFilter,
  onExecutorFilter,
  onSelectRun,
  onLoadMore,
  onCancel,
  onRetry,
}: {
  runs: CloudRun[];
  selectedRun: CloudRun | null;
  events: CloudRunEvent[];
  transcriptStatus: "loading" | "ready" | "error";
  transcriptHasMore?: boolean;
  loadingMoreEvents?: boolean;
  onLoadMoreEvents?: () => void;
  busy: boolean;
  tasks: CloudTask[];
  nextCursor?: string;
  statusFilter: FilterValue<CloudRunStatus>;
  triggerFilter: FilterValue<CloudRunTrigger>;
  executorFilter: "api" | "desktop" | "all";
  onStatusFilter: (value: FilterValue<CloudRunStatus>) => void;
  onTriggerFilter: (value: FilterValue<CloudRunTrigger>) => void;
  onExecutorFilter: (value: "api" | "desktop" | "all") => void;
  onSelectRun: (run: CloudRun) => void;
  onLoadMore: () => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const selectedTask = tasks.find((task) => task.slug === selectedRun?.slug);
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(340px,0.8fr)_minmax(420px,1.2fr)]">
      <section className="flex min-h-0 flex-col border-r border-border">
        <div className="grid grid-cols-3 gap-2 border-b border-border p-3">
          <Select
            onValueChange={(value) => onStatusFilter(value as FilterValue<CloudRunStatus>)}
            value={statusFilter}
          >
            <SelectTrigger
              aria-label={runStatusFilterName(statusFilter)}
              className="rounded-none"
              size="sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="all">All statuses</SelectItem>
              {(["queued", "running", "succeeded", "failed", "stopped"] as const).map((value) => (
                <SelectItem className="rounded-none" key={value} value={value}>
                  {readableEnum(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            onValueChange={(value) => onTriggerFilter(value as FilterValue<CloudRunTrigger>)}
            value={triggerFilter}
          >
            <SelectTrigger
              aria-label={runTriggerFilterName(triggerFilter)}
              className="rounded-none"
              size="sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="all">All triggers</SelectItem>
              {(["manual", "cron", "window", "event", "retry"] as const).map((value) => (
                <SelectItem className="rounded-none" key={value} value={value}>
                  {triggerLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            onValueChange={(value) => onExecutorFilter(value as "api" | "desktop" | "all")}
            value={executorFilter}
          >
            <SelectTrigger
              aria-label={runWhereFilterName(executorFilter)}
              className="rounded-none"
              size="sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="all">Cloud or desktop</SelectItem>
              <SelectItem value="api">Cloud</SelectItem>
              <SelectItem value="desktop">Desktop</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div>
            {runs.map((run) => (
              <Button
                className={cn(
                  "h-auto min-h-14 w-full justify-start gap-3 rounded-none border-b border-border px-3 text-left font-normal hover:bg-muted/35",
                  selectedRun?.runId === run.runId && "bg-muted/50",
                )}
                key={run.id}
                onClick={() => onSelectRun(run)}
                type="button"
                variant="ghost"
              >
                <StatusIcon status={run.status} />
                <div className="min-w-0 flex-1">
                  <Label className="block truncate text-[12px] font-medium">
                    {runTitle(run, tasks)}
                  </Label>
                  <CardDescription className="mt-0.5 block text-[11px]">
                    {runRowDetail(run.status, run.trigger)} · {formatDate(run.createdAt)}
                  </CardDescription>
                  <RunRowFailure run={run} />
                </div>
                <CaretRight className="size-4 text-muted-foreground" />
              </Button>
            ))}
            {runs.length === 0 ? (
              <p className="p-10 text-center text-xs text-muted-foreground">
                No runs match these filters.
              </p>
            ) : null}
            {nextCursor ? (
              <Button
                className="w-full rounded-none"
                onClick={onLoadMore}
                size="sm"
                variant="ghost"
              >
                Load more
              </Button>
            ) : null}
          </div>
        </ScrollArea>
      </section>
      <ScrollArea className="min-h-0">
        <RunInspector
          busy={busy}
          events={events}
          loadingMoreEvents={loadingMoreEvents}
          onCancel={onCancel}
          onLoadMoreEvents={onLoadMoreEvents}
          onRetry={onRetry}
          run={selectedRun}
          taskExecutionTarget={selectedTask?.executionTarget}
          transcriptHasMore={transcriptHasMore}
          transcriptStatus={transcriptStatus}
          workflowName={selectedRun ? runTitle(selectedRun, tasks) : undefined}
        />
      </ScrollArea>
    </div>
  );
}

function WorkflowEditor({
  task,
  templates,
  schedule,
  runs,
  selectedRun,
  events,
  transcriptStatus,
  transcriptHasMore = false,
  loadingMoreEvents = false,
  onLoadMoreEvents,
  busy,
  onBack,
  onRun,
  onSelectRun,
  onCancel,
  onRetry,
  onUpdate,
  onDelete,
}: {
  task: CloudTask;
  templates: CloudTaskTemplate[];
  schedule: CloudSchedule | null;
  runs: CloudRun[];
  selectedRun: CloudRun | null;
  events: CloudRunEvent[];
  transcriptStatus: "loading" | "ready" | "error";
  transcriptHasMore?: boolean;
  loadingMoreEvents?: boolean;
  onLoadMoreEvents?: () => void;
  busy: boolean;
  onBack: () => void;
  onRun: () => void;
  onSelectRun: (run: CloudRun) => void;
  onCancel: () => void;
  onRetry: () => void;
  onUpdate: (patch: {
    active?: boolean;
    instructions?: string;
    name?: string;
    triggers?: Record<string, unknown>;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const editable = !task.systemManaged;
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const original = workflowForTask(task, templates);
  // The editor remounts when the task revision changes. Run now updates that
  // revision after it selects the new run, which was throwing the user back
  // onto the canvas. A selected run means this mount should open on Runs.
  const [tab, setTab] = React.useState<EditorTab>(selectedRun ? "runs" : "editor");
  const [name, setName] = React.useState(taskTitle(task));
  const [workflow, setWorkflow] = React.useState(original);
  const dirty =
    editable &&
    (name.trim() !== taskTitle(task) || JSON.stringify(workflow) !== JSON.stringify(original));
  const scopedRunsQuery = useWorkflowRuns({ slug: task.slug });
  const scopedRuns = scopedRunsQuery.isSuccess
    ? (scopedRunsQuery.data.pages.flatMap((page) => page.runs) as CloudRun[])
    : null;
  const {
    runs: taskRuns,
    settled: taskRunsSettled,
    hasMore: taskRunsHasMore,
  } = workflowRunsForEditor(
    task.slug,
    runs,
    scopedRuns,
    scopedRunsQuery.isSuccess && scopedRunsQuery.hasNextPage,
  );

  const save = async () => {
    const compiled = compileVisualWorkflow(workflow);
    await onUpdate({
      name: name.trim(),
      instructions: compiled.instructions,
      triggers: compiled.triggers,
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2 text-[13px]">
          <Button className="rounded-none px-1.5" onClick={onBack} size="sm" variant="ghost">
            Workflows
          </Button>
          <CaretRight className="size-3 text-muted-foreground" />
          <Label className="truncate font-medium">{taskTitle(task)}</Label>
          {task.systemManaged ? <Robot className="size-3.5 text-muted-foreground" /> : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge className="rounded-none" variant={task.active ? "secondary" : "outline"}>
            {task.active ? "Live" : "Draft"}
          </Badge>
          <Switch
            aria-label="Workflow live status"
            checked={task.active}
            disabled={busy}
            onCheckedChange={(active) => void onUpdate({ active })}
            size="sm"
          />
          {editable ? (
            <Button
              className="rounded-none"
              disabled={!dirty || busy || !name.trim()}
              onClick={() => void save()}
              size="sm"
              variant="outline"
            >
              {busy ? <Spinner className="size-4" /> : null} Save
            </Button>
          ) : null}
          <Button
            className="rounded-none"
            disabled={busy || !task.active}
            onClick={() => {
              // Selecting the run in the parent does not change this tab, so
              // Run now looked like a no-op while the request succeeded.
              setTab("runs");
              onRun();
            }}
            size="sm"
            type="button"
          >
            <Play weight="fill" /> Run now
          </Button>
        </div>
      </div>
      <Tabs
        className="flex min-h-0 flex-1 flex-col"
        onValueChange={(value) => setTab(value as EditorTab)}
        value={tab}
      >
        <TabsList
          aria-label="Workflow"
          className="h-10 shrink-0 justify-start gap-5 rounded-none border-b border-border bg-transparent px-3"
        >
          {(["editor", "runs", "settings"] as const).map((value) => (
            <TabsTrigger
              aria-label={workflowEditorTabName(
                value,
                taskRuns.length,
                taskRunsHasMore,
                value === "runs" ? taskRunsSettled : true,
              )}
              className={cn(
                "h-full rounded-none border-b bg-transparent px-0 text-[12px] shadow-none data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
                tab === value
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              key={value}
              value={value}
            >
              {value === "settings" ? <Gear className="size-3.5" /> : null}
              {EDITOR_TAB_LABEL[value]}
              {value === "runs" && taskRunsSettled ? (
                <Badge className="rounded-none text-[9px]" variant="secondary">
                  {workflowRunCountLabel(taskRuns.length, taskRunsHasMore)}
                </Badge>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent className={EDITOR_PANE_CLASS} value="editor">
          {task.systemManaged ? (
            <p className="shrink-0 border-b border-border px-4 py-2 text-[12px] text-muted-foreground">
              {maintainedWorkflowNotice()}
            </p>
          ) : null}
          <VisualWorkflowBuilder
            aria-label={`${taskTitle(task)} workflow editor`}
            disabled={!editable}
            onChange={setWorkflow}
            value={workflow}
          />
        </TabsContent>
        <TabsContent className={EDITOR_PANE_CLASS} value="runs">
          <div className="grid h-full min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)]">
            <ScrollArea className="h-full min-h-0 border-r border-border">
              {taskRuns.map((run) => (
                <Button
                  className={cn(
                    "h-auto min-h-14 w-full justify-start gap-3 rounded-none border-b border-border px-3 text-left font-normal hover:bg-muted/35",
                    selectedRun?.runId === run.runId && "bg-muted/50",
                  )}
                  key={run.id}
                  onClick={() => onSelectRun(run)}
                  type="button"
                  variant="ghost"
                >
                  <StatusIcon status={run.status} />
                  <div className="min-w-0 flex-1">
                    <Label className="block truncate text-[12px] font-medium">
                      {readableEnum(run.status)}
                    </Label>
                    <CardDescription className="text-[11px]">
                      {triggerLabel(run.trigger)} · {formatDate(run.createdAt)}
                    </CardDescription>
                    <RunRowFailure run={run} />
                  </div>
                  <CaretRight className="size-4 text-muted-foreground" />
                </Button>
              ))}
              {taskRuns.length === 0 ? (
                <p className="p-8 text-center text-xs text-muted-foreground">
                  {taskRunsSettled ? "No runs yet." : "Loading runs…"}
                </p>
              ) : null}
              {taskRunsHasMore ? (
                <Button
                  className="w-full rounded-none"
                  disabled={scopedRunsQuery.isFetchingNextPage}
                  onClick={() => void scopedRunsQuery.fetchNextPage()}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {scopedRunsQuery.isFetchingNextPage ? "Loading…" : "Load more"}
                </Button>
              ) : null}
            </ScrollArea>
            <ScrollArea className="h-full min-h-0">
              <RunInspector
                busy={busy}
                events={events}
                loadingMoreEvents={loadingMoreEvents}
                onCancel={onCancel}
                onLoadMoreEvents={onLoadMoreEvents}
                onRetry={onRetry}
                run={selectedRun}
                taskExecutionTarget={task.executionTarget}
                transcriptHasMore={transcriptHasMore}
                transcriptStatus={transcriptStatus}
                workflowName={taskTitle(task)}
              />
            </ScrollArea>
          </div>
        </TabsContent>
        <TabsContent className={EDITOR_PANE_CLASS} value="settings">
          <ScrollArea className="h-full min-h-0 flex-1">
            <div className="mx-auto max-w-2xl space-y-7 px-6 py-7">
              <div>
                <h2 className="text-[15px] font-medium">Workflow settings</h2>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {workflowSettingsIntro(editable)}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="workflow-editor-name">Name</Label>
                <Input
                  className="rounded-none"
                  disabled={!editable}
                  id="workflow-editor-name"
                  onChange={(event) => setName(event.target.value)}
                  value={name}
                />
              </div>
              <div className="border border-border">
                <div className="grid grid-cols-2">
                  <div className="border-r border-border p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                      Starts
                    </p>
                    <p className="mt-2 text-[13px]">{scheduleLabel(task)}</p>
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                      Next run
                    </p>
                    <p className="mt-2 text-[13px]">{scheduleMomentLabel(schedule?.nextDueAt)}</p>
                  </div>
                </div>
                <div className="border-t border-border p-4">
                  <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    Last run
                  </p>
                  <p className="mt-2 text-[13px]">
                    {workflowSettingsLastRun(
                      task,
                      runs.find((run) => run.slug === task.slug),
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between border-y border-border py-4">
                <div>
                  <p className="text-[13px] font-medium">Run in Oppulence Cloud</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Runs continue even when the desktop app is closed.
                  </p>
                </div>
                <Badge
                  className={cn(
                    "rounded-none",
                    statusTone(schedule?.health || task.scheduleSyncState),
                  )}
                  variant="outline"
                >
                  <StatusIcon status={schedule?.health || task.scheduleSyncState} />{" "}
                  {scheduleHealthLabel(schedule?.health || task.scheduleSyncState)}
                </Badge>
              </div>
              {task.systemManaged ? (
                <p className="text-[11px] text-muted-foreground">{maintainedWorkflowNotice()}</p>
              ) : null}
              {editable ? (
                <div className="flex justify-end">
                  <Button
                    className="rounded-none"
                    disabled={!dirty || busy || !name.trim()}
                    onClick={() => void save()}
                  >
                    Save settings
                  </Button>
                </div>
              ) : null}
              {editable ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <p className="max-w-md text-[12px] text-muted-foreground">
                    {confirmingDelete
                      ? deleteWorkflowConfirmCopy(taskTitle(task))
                      : "Remove this workflow and its runs."}
                  </p>
                  {confirmingDelete ? (
                    <div className="flex gap-2">
                      <Button
                        className="rounded-none"
                        disabled={busy}
                        onClick={() => setConfirmingDelete(false)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Cancel
                      </Button>
                      <Button
                        className="rounded-none"
                        disabled={busy}
                        onClick={() => void onDelete()}
                        size="sm"
                        type="button"
                        variant="destructive"
                      >
                        Confirm remove
                      </Button>
                    </div>
                  ) : (
                    <Button
                      className="rounded-none"
                      disabled={busy}
                      onClick={() => setConfirmingDelete(true)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Remove workflow
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function CloudWorkflowsView({
  focus = "scheduled",
  initialRunId,
  initialSlug,
}: {
  focus?: "scheduled" | "runs";
  initialRunId?: string;
  initialSlug?: string;
}) {
  const queryClient = useQueryClient();
  const [selectedSlug, setSelectedSlug] = React.useState(initialSlug || "");
  const [selectedRun, setSelectedRun] = React.useState<CloudRun | null>(null);
  const [events, setEvents] = React.useState<CloudRunEvent[]>([]);
  const [transcriptNextSeq, setTranscriptNextSeq] = React.useState<number | null>(null);
  const [loadingMoreEvents, setLoadingMoreEvents] = React.useState(false);
  const transcriptExtended = React.useRef(false);
  const [transcriptRunId, setTranscriptRunId] = React.useState<string | null>(null);
  const [transcriptPhase, setTranscriptPhase] = React.useState<"loading" | "ready" | "error">(
    "ready",
  );
  const [schedule, setSchedule] = React.useState<CloudSchedule | null>(null);
  const [screen, setScreen] = React.useState<"library" | "editor" | "runs">(
    workflowOpeningScreen(focus, initialSlug, initialRunId),
  );
  const [statusFilter, setStatusFilter] = React.useState<FilterValue<CloudRunStatus>>("all");
  const [triggerFilter, setTriggerFilter] = React.useState<FilterValue<CloudRunTrigger>>("all");
  const [executorFilter, setExecutorFilter] = React.useState<"api" | "desktop" | "all">("all");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const tasksQuery = useWorkflowTasks();
  const templatesQuery = useWorkflowTemplates();
  const runsQuery = useWorkflowRuns({
    status: statusFilter,
    trigger: triggerFilter,
    executor: executorFilter,
  });
  const tasks = (tasksQuery.data ?? []) as CloudTask[];
  const templates = (templatesQuery.data ?? []) as CloudTaskTemplate[];
  const runs = (runsQuery.data?.pages.flatMap((page) => page.runs) ?? []) as CloudRun[];
  const nextCursor = runsQuery.hasNextPage ? runsQuery.data?.pages.at(-1)?.nextCursor : undefined;
  const loading = tasksQuery.isPending || templatesQuery.isPending || runsQuery.isPending;
  const queryCause = tasksQuery.error ?? templatesQuery.error ?? runsQuery.error;
  const queryError =
    queryCause instanceof Error
      ? friendlyAgentError(queryCause.message)
      : queryCause
        ? "Could not load workflows"
        : null;

  React.useEffect(() => subscribeWorkflowLibrary(() => setScreen("library")), []);

  const selectedTask = tasks.find((task) => task.slug === selectedSlug);
  const selectedTaskSlug = selectedTask?.slug;
  const selectedTaskRevision = selectedTask?.revision;
  const selectedRunID = selectedRun?.runId;
  const selectedRunSlug = selectedRun?.slug;
  const selectedRunStatus = selectedRun?.status;
  const transcriptStatus: "loading" | "ready" | "error" = !selectedRunID
    ? "ready"
    : transcriptRunId === selectedRunID
      ? transcriptPhase
      : "loading";

  const selectRun = React.useCallback((run: CloudRun | null) => {
    setSelectedRun(run);
    setEvents([]);
    setTranscriptNextSeq(null);
    setTranscriptRunId(run?.runId ?? null);
    setTranscriptPhase(run ? "loading" : "ready");
    if (run) setSelectedSlug(run.slug);
  }, []);

  const refresh = React.useCallback(async () => {
    setError(null);
    try {
      await ensureFirstPartyWorkflows();
      await queryClient.invalidateQueries({ queryKey: workflowKeys.all });
    } catch (cause) {
      setError(shownWorkflowError(cause, "Could not load workflows"));
    }
  }, [queryClient]);

  React.useEffect(() => {
    void ensureFirstPartyWorkflows()
      .then(() => queryClient.invalidateQueries({ queryKey: workflowKeys.tasks() }))
      .catch((cause) => setError(shownWorkflowError(cause, "Could not load workflows")));
  }, [queryClient]);

  React.useEffect(() => {
    setSelectedSlug((current) => current || tasks[0]?.slug || "");
  }, [tasks]);

  React.useEffect(() => {
    setSelectedRun((current) => {
      if (!current) {
        return initialRunId ? runs.find((run) => run.runId === initialRunId) || null : null;
      }
      return runs.find((run) => run.runId === current.runId) || current;
    });
  }, [initialRunId, runs]);

  React.useEffect(() => {
    if (!initialSlug || !initialRunId) return;
    let cancelled = false;
    void getCloudRun(initialSlug, initialRunId)
      .then((run) => {
        if (!cancelled) selectRun(run);
      })
      .catch((cause) => {
        if (!cancelled) setError(shownWorkflowError(cause, "Could not load workflow run"));
      });
    return () => {
      cancelled = true;
    };
  }, [initialRunId, initialSlug, selectRun]);

  React.useEffect(() => {
    if (!selectedTaskSlug || screen !== "editor") return;
    let cancelled = false;
    void getCloudSchedule(selectedTaskSlug)
      .then((value) => {
        if (!cancelled) setSchedule(value);
      })
      .catch((cause) => {
        if (!cancelled) setError(shownWorkflowError(cause, "Could not load schedule"));
      });
    return () => {
      cancelled = true;
    };
  }, [screen, selectedTaskRevision, selectedTaskSlug]);

  React.useEffect(() => {
    if (!selectedRunID || !selectedRunSlug || !selectedRunStatus) return;
    let cancelled = false;
    transcriptExtended.current = false;
    const load = async () => {
      try {
        const [nextEvents, nextRun] = await Promise.all([
          listCloudRunEvents(selectedRunSlug, selectedRunID),
          getCloudRun(selectedRunSlug, selectedRunID),
        ]);
        if (!cancelled) {
          setEvents((current) => {
            const pageIds = new Set(nextEvents.events.map((event) => event.id));
            const later = current.filter((event) => !pageIds.has(event.id));
            return later.length > 0 ? [...nextEvents.events, ...later] : nextEvents.events;
          });
          if (!transcriptExtended.current) setTranscriptNextSeq(nextEvents.nextSeq);
          setSelectedRun(nextRun);
          setTranscriptRunId(selectedRunID);
          setTranscriptPhase("ready");
        }
      } catch (cause) {
        if (!cancelled) {
          setError(shownWorkflowError(cause, "Could not refresh workflow run"));
          setTranscriptRunId(selectedRunID);
          setTranscriptPhase("error");
        }
      }
    };
    void load();
    if (terminalStatuses.has(selectedRunStatus))
      return () => {
        cancelled = true;
      };
    const timer = window.setInterval(() => {
      void load();
      void queryClient.invalidateQueries({ queryKey: workflowKeys.all });
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [queryClient, selectedRunID, selectedRunSlug, selectedRunStatus]);

  const loadMoreEvents = async () => {
    if (
      !selectedRunSlug ||
      !selectedRunID ||
      transcriptNextSeq == null ||
      loadingMoreEvents
    ) {
      return;
    }
    setLoadingMoreEvents(true);
    try {
      const page = await listCloudRunEvents(selectedRunSlug, selectedRunID, transcriptNextSeq);
      transcriptExtended.current = true;
      setEvents((current) => {
        const seen = new Set(current.map((event) => event.id));
        return [...current, ...page.events.filter((event) => !seen.has(event.id))];
      });
      setTranscriptNextSeq(page.nextSeq);
    } catch (cause) {
      setError(shownWorkflowError(cause, "Could not load more events"));
    } finally {
      setLoadingMoreEvents(false);
    }
  };

  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(shownWorkflowError(cause, "Workflow operation failed"));
    } finally {
      setBusy(false);
    }
  };

  const invalidateRuns = () => queryClient.invalidateQueries({ queryKey: workflowKeys.all });

  const replaceTask = (task: CloudTask) => {
    queryClient.setQueryData(workflowKeys.tasks(), (current: CloudTask[] | undefined) =>
      [...(current ?? []).filter((item) => item.id !== task.id), task].sort(
        (a, b) => Number(b.systemManaged) - Number(a.systemManaged) || a.name.localeCompare(b.name),
      ),
    );
    setSelectedSlug(task.slug);
  };

  if (loading)
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading workflows
      </div>
    );

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background text-[13px]"
      data-slot="cloud-workflows-view"
    >
      {(error ?? queryError) ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          <Warning className="size-4" /> {error ?? queryError}
        </div>
      ) : null}

      {screen === "library" ? (
        <WorkflowLibrary
          busy={busy}
          onCreated={(task) => {
            replaceTask(task);
            setSchedule(null);
            setScreen("editor");
          }}
          onRefresh={() => void refresh()}
          onSelect={(task) => {
            setSelectedSlug(task.slug);
            selectRun(null);
            setSchedule(null);
            setScreen("editor");
          }}
          runs={runs}
          tasks={tasks}
          templates={templates}
        />
      ) : screen === "runs" ? (
        <WorkflowRuns
          busy={busy}
          events={events}
          loadingMoreEvents={loadingMoreEvents}
          onLoadMoreEvents={() => void loadMoreEvents()}
          transcriptHasMore={transcriptNextSeq != null}
          transcriptStatus={transcriptStatus}
          executorFilter={executorFilter}
          nextCursor={nextCursor}
          onCancel={() =>
            selectedRun &&
            void perform(async () => {
              selectRun(await cancelCloudRun(selectedRun));
              await invalidateRuns();
            })
          }
          onExecutorFilter={setExecutorFilter}
          onLoadMore={() => nextCursor && void runsQuery.fetchNextPage()}
          onRetry={() =>
            selectedRun &&
            void perform(async () => {
              selectRun(await retryCloudRun(selectedRun));
              await invalidateRuns();
            })
          }
          onSelectRun={selectRun}
          onStatusFilter={setStatusFilter}
          onTriggerFilter={setTriggerFilter}
          runs={runs}
          selectedRun={selectedRun}
          statusFilter={statusFilter}
          tasks={tasks}
          triggerFilter={triggerFilter}
        />
      ) : selectedTask ? (
        <WorkflowEditor
          busy={busy}
          events={events}
          loadingMoreEvents={loadingMoreEvents}
          onLoadMoreEvents={() => void loadMoreEvents()}
          transcriptHasMore={transcriptNextSeq != null}
          transcriptStatus={transcriptStatus}
          templates={templates}
          key={`${selectedTask.id}:${selectedTask.revision}`}
          onBack={() => {
            selectRun(null);
            setScreen("library");
          }}
          onCancel={() =>
            selectedRun &&
            void perform(async () => {
              selectRun(await cancelCloudRun(selectedRun));
              await invalidateRuns();
            })
          }
          onRetry={() =>
            selectedRun &&
            void perform(async () => {
              selectRun(await retryCloudRun(selectedRun));
              await invalidateRuns();
            })
          }
          onRun={() =>
            void perform(async () => {
              const run = await triggerCloudRun(
                selectedTask.slug,
                "Started from the visual workflow editor.",
              );
              selectRun(run);
              await invalidateRuns();
            })
          }
          onSelectRun={selectRun}
          onUpdate={(patch) =>
            perform(async () => {
              replaceTask(await updateCloudTask(selectedTask, patch));
            })
          }
          onDelete={() =>
            perform(async () => {
              await deleteCloudTask(selectedTask);
              queryClient.setQueryData(workflowKeys.tasks(), (current: CloudTask[] | undefined) =>
                (current ?? []).filter((item) => item.id !== selectedTask.id),
              );
              selectRun(null);
              setSchedule(null);
              setSelectedSlug("");
              setScreen("library");
            })
          }
          runs={runs}
          schedule={schedule}
          selectedRun={selectedRun}
          task={selectedTask}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          No workflow selected.
        </div>
      )}
    </div>
  );
}
