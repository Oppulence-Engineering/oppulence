import { z } from "zod";

import { isOptionalRequestFailure, requestJson, type RequestJsonFn } from "@/lib/api/request-json";
import { loadAgentSlugs } from "@/hooks/queries/utils/fetch-agents";
import { workflowProductName } from "@/lib/workflows/workflow-product-copy";

const SidebarTaskSchema = z
  .object({
    slug: z.string(),
    name: z.string().optional(),
    active: z.boolean().optional(),
  })
  .passthrough();

const SidebarTaskListSchema = z
  .object({
    tasks: z.array(SidebarTaskSchema).optional(),
  })
  .passthrough();

const SidebarRunSchema = z
  .object({
    runId: z.string(),
    slug: z.string(),
    status: z.string().optional(),
  })
  .passthrough();

const SidebarRunListSchema = z
  .object({
    runs: z.array(SidebarRunSchema).optional(),
  })
  .passthrough();

export type SidebarNavItem = { label: string; value: string };

/** Recent runs in the sidebar. The account list is much longer; this is only a preview. */
export const SIDEBAR_RUN_PREVIEW = 8;

export type SidebarRunPreview = {
  items: SidebarNavItem[];
  /**
   * The account has more runs than the sidebar lists. The nav badge must not
   * treat the preview length as the total.
   */
  truncated: boolean;
};

const EMPTY_RUN_PREVIEW: SidebarRunPreview = { items: [], truncated: false };

/**
 * The sidebar opens an agent by slug. The row people see is the agent name,
 * the same label as the Agents page and the composer.
 */
export function sidebarAgentItem(agent: { slug: string; name: string }): SidebarNavItem {
  const value = agent.slug.replace(/\.[^/.]+$/, "");
  return { value, label: agent.name.trim() || value };
}

/**
 * Run rows are stored as `slug · status`. The slug is the workflow id; the
 * sidebar already has that workflow's name on the task list.
 */
export function sidebarRunLabel(
  run: SidebarNavItem,
  tasks: readonly SidebarNavItem[] = [],
): string {
  const slug = run.value.split("/")[0] ?? "";
  const stored = tasks.find((task) => task.value === slug)?.label || slug;
  const workflow = workflowProductName(slug, stored);
  const marker = " · ";
  const splitAt = run.label.indexOf(marker);
  const status = splitAt >= 0 ? run.label.slice(splitAt + marker.length).trim() : "";
  if (!status) return workflow;
  return `${workflow} · ${status.charAt(0).toUpperCase()}${status.slice(1)}`;
}

/**
 * Sidebar labels only. Generated background-task contracts are strictObject
 * and would empty the nav when the API adds fields the client has not regenerated.
 */
export async function loadSidebarTasks(
  request: RequestJsonFn,
  signal?: AbortSignal,
): Promise<SidebarNavItem[]> {
  try {
    const data = await request({
      path: "/background-tasks",
      schema: SidebarTaskListSchema,
      signal,
    });
    return (data.tasks ?? [])
      .filter((task) => typeof task.slug === "string")
      .map((task) => ({
        value: task.slug,
        label: workflowProductName(task.slug, task.name || task.slug),
      }));
  } catch (error) {
    if (isOptionalRequestFailure(error)) return [];
    throw error;
  }
}

/**
 * Keep a short preview for the sidebar. A longer account history still comes
 * back from the runs list, so the badge has to say the preview is incomplete.
 */
export function previewSidebarRuns(
  runs: readonly { runId?: string; slug?: string; status?: string }[],
): SidebarRunPreview {
  const eligible = runs.filter(
    (run): run is { runId: string; slug: string; status?: string } =>
      typeof run.runId === "string" && typeof run.slug === "string",
  );
  return {
    truncated: eligible.length > SIDEBAR_RUN_PREVIEW,
    items: eligible.slice(0, SIDEBAR_RUN_PREVIEW).map((run) => ({
      value: `${run.slug}/${run.runId}`,
      label: run.status ? `${run.slug} · ${run.status}` : run.slug,
    })),
  };
}

/** Badge text for the runs group. An exact number is only honest when every run is listed. */
export function sidebarRunCountLabel(preview: SidebarRunPreview): string {
  if (preview.items.length === 0) return "";
  if (preview.truncated) return `${preview.items.length}+`;
  return String(preview.items.length);
}

export async function loadSidebarRuns(
  request: RequestJsonFn,
  signal?: AbortSignal,
): Promise<SidebarRunPreview> {
  try {
    const data = await request({
      path: "/background-task-runs",
      schema: SidebarRunListSchema,
      signal,
    });
    return previewSidebarRuns(data.runs ?? []);
  } catch (error) {
    if (isOptionalRequestFailure(error)) return EMPTY_RUN_PREVIEW;
    throw error;
  }
}

export function fetchSidebarAgents(signal?: AbortSignal): Promise<string[]> {
  return loadAgentSlugs(requestJson, signal);
}

export function fetchSidebarTasks(signal?: AbortSignal): Promise<SidebarNavItem[]> {
  return loadSidebarTasks(requestJson, signal);
}

export function fetchSidebarRuns(signal?: AbortSignal): Promise<SidebarRunPreview> {
  return loadSidebarRuns(requestJson, signal);
}
