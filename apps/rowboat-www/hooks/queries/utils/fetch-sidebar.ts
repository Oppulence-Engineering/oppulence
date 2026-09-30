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

export async function loadSidebarRuns(
  request: RequestJsonFn,
  signal?: AbortSignal,
): Promise<SidebarNavItem[]> {
  try {
    const data = await request({
      path: "/background-task-runs",
      schema: SidebarRunListSchema,
      signal,
    });
    return (data.runs ?? [])
      .filter((run) => typeof run.runId === "string" && typeof run.slug === "string")
      .slice(0, 8)
      .map((run) => ({
        value: `${run.slug}/${run.runId}`,
        label: run.status ? `${run.slug} · ${run.status}` : run.slug,
      }));
  } catch (error) {
    if (isOptionalRequestFailure(error)) return [];
    throw error;
  }
}

export function fetchSidebarAgents(signal?: AbortSignal): Promise<string[]> {
  return loadAgentSlugs(requestJson, signal);
}

export function fetchSidebarTasks(signal?: AbortSignal): Promise<SidebarNavItem[]> {
  return loadSidebarTasks(requestJson, signal);
}

export function fetchSidebarRuns(signal?: AbortSignal): Promise<SidebarNavItem[]> {
  return loadSidebarRuns(requestJson, signal);
}
