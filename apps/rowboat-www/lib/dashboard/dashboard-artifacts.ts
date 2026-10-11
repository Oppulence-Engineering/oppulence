"use client";

import "client-only";

import {
  AgentViewSchema,
  agentArtifactTitle,
  agentSourceLabel,
  parseAgentDocument,
} from "@/lib/agents/agent-schemas";
import {
  GetBackgroundTask200Response,
  GetBackgroundTaskRun200Response,
} from "@/lib/api/generated/zod/background-tasks/background-tasks";
import { dashboardFetch } from "@/lib/auth/client";
import { requestDashboardJson } from "@/lib/dashboard/dashboard-json";
import type { SelectedResource } from "@/lib/dashboard/dashboard-resource";
import {
  JsonObjectSchema,
  MutationResponseSchema,
  RunFileResponseSchema,
  TextContentResponseSchema,
  parseJsonObject,
} from "@/lib/dashboard/dashboard-schemas";

export type ArtifactFileType = "json" | "markdown";

export type DashboardArtifact = {
  title: string;
  subtitle: string;
  text: string;
  readOnly: boolean;
  fileType: ArtifactFileType;
};

/**
 * The opened record names what it is. A workflow is not a background task,
 * and a connected-tools file is not an MCP config.
 */
export function dashboardArtifactSubtitle(input: {
  kind: string;
  markdown?: boolean;
  name?: string;
  readOnlyAgent?: boolean;
  sourceLabel?: string;
}): string {
  if (input.kind === "agent") {
    if (input.markdown) return "Agent";
    if (input.readOnlyAgent && input.sourceLabel) return `${input.sourceLabel} agent`;
    return "Agent definition";
  }
  if (input.kind === "config") {
    if (input.markdown) return "Note";
    const name = input.name?.toLowerCase() ?? "";
    if (name.includes("mcp")) return "Connected tools";
    if (name.includes("model")) return "Model";
    return "Settings";
  }
  if (input.kind === "task") return "Workflow";
  return "Run";
}

function stripExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, "");
}

function detectFileType(name: string): ArtifactFileType {
  return /\.(md|markdown)$/i.test(name) ? "markdown" : "json";
}

async function readTextContent(url: string, missingIsEmpty: boolean): Promise<string> {
  const response = await dashboardFetch(url);
  if (!response.ok) {
    if (response.status === 404 && missingIsEmpty) return "";
    throw new Error(`Failed to load file (${response.status})`);
  }
  const data = TextContentResponseSchema.parse(await response.json());
  return data.content ?? data.raw ?? "";
}

export async function loadDashboardArtifact(
  resource: SelectedResource,
): Promise<DashboardArtifact> {
  const detectedFileType = detectFileType(resource.name);

  if (resource.kind === "agent") {
    const id = stripExtension(resource.name) || resource.name;
    if (detectedFileType === "markdown") {
      return {
        title: resource.name,
        subtitle: dashboardArtifactSubtitle({ kind: "agent", markdown: true }),
        text: await readTextContent(
          `/api/rowboat/v1/agents/${encodeURIComponent(id)}?format=yaml`,
          true,
        ),
        readOnly: false,
        fileType: "markdown",
      };
    }
    const agent = await requestDashboardJson(`/agents/${encodeURIComponent(id)}`, AgentViewSchema);
    const source = agent.source ?? "";
    const readOnly = source === "builtin" || source === "gitops";
    return {
      title: agentArtifactTitle(agent.name, id),
      subtitle: dashboardArtifactSubtitle({
        kind: "agent",
        readOnlyAgent: readOnly,
        sourceLabel: agentSourceLabel(source || "builtin"),
      }),
      text: JSON.stringify(parseAgentDocument(agent, id), null, 2),
      readOnly,
      fileType: "json",
    };
  }

  if (resource.kind === "config") {
    const lowerName = resource.name.toLowerCase();
    if (detectedFileType === "markdown") {
      return {
        title: resource.name,
        subtitle: dashboardArtifactSubtitle({ kind: "config", markdown: true }),
        text: await readTextContent(
          `/api/rowboat/config?file=${encodeURIComponent(resource.name)}`,
          true,
        ),
        readOnly: false,
        fileType: "markdown",
      };
    }
    if (lowerName.includes("mcp")) {
      const data = await requestDashboardJson("/mcp", JsonObjectSchema);
      return {
        title: resource.name,
        subtitle: dashboardArtifactSubtitle({ kind: "config", name: resource.name }),
        text: JSON.stringify(data, null, 2),
        readOnly: false,
        fileType: "json",
      };
    }
    if (lowerName.includes("model")) {
      const data = await requestDashboardJson("/models", JsonObjectSchema);
      return {
        title: resource.name,
        subtitle: dashboardArtifactSubtitle({ kind: "config", name: resource.name }),
        text: JSON.stringify(data, null, 2),
        readOnly: false,
        fileType: "json",
      };
    }
    const data = await requestDashboardJson(
      `/config/${encodeURIComponent(resource.name)}`,
      JsonObjectSchema,
    );
    return {
      title: resource.name,
      subtitle: dashboardArtifactSubtitle({ kind: "config", name: resource.name }),
      text: JSON.stringify(data, null, 2),
      readOnly: false,
      fileType: "json",
    };
  }

  if (resource.kind === "task") {
    const data = await requestDashboardJson(
      `/background-tasks/${encodeURIComponent(resource.name)}`,
      GetBackgroundTask200Response,
    );
    return {
      title: resource.name,
      subtitle: dashboardArtifactSubtitle({ kind: "task" }),
      text: JSON.stringify(data, null, 2),
      readOnly: true,
      fileType: "json",
    };
  }

  if (resource.kind === "taskrun") {
    const [slug, ...runParts] = resource.name.split("/");
    const data = await requestDashboardJson(
      `/background-tasks/${encodeURIComponent(slug)}/runs/${encodeURIComponent(
        runParts.join("/"),
      )}`,
      GetBackgroundTaskRun200Response,
    );
    return {
      title: resource.name,
      subtitle: dashboardArtifactSubtitle({ kind: "taskrun" }),
      text: JSON.stringify(data, null, 2),
      readOnly: true,
      fileType: "json",
    };
  }

  const data = await requestDashboardJson(
    `/api/rowboat/run?file=${encodeURIComponent(resource.name)}`,
    RunFileResponseSchema,
  );
  return {
    title: resource.name,
    subtitle: dashboardArtifactSubtitle({ kind: "run" }),
    text: data.parsed !== undefined ? JSON.stringify(data.parsed, null, 2) : (data.raw ?? ""),
    readOnly: true,
    fileType: detectedFileType,
  };
}

async function writePlainText(url: string, text: string): Promise<void> {
  const response = await dashboardFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "text/plain" },
    body: text,
  });
  if (!response.ok) throw new Error(`Failed to save file (${response.status})`);
}

async function saveModelConfiguration(
  next: Record<string, unknown>,
  previous: Record<string, unknown>,
): Promise<void> {
  const nextProviders = JsonObjectSchema.parse(next.providers ?? {});
  const previousProviders = JsonObjectSchema.parse(previous.providers ?? {});
  for (const name of Object.keys(previousProviders).filter(
    (name) => !Object.hasOwn(nextProviders, name),
  )) {
    await requestDashboardJson(
      `/models/providers/${encodeURIComponent(name)}`,
      MutationResponseSchema,
      { method: "DELETE" },
    );
  }
  for (const [name, provider] of Object.entries(nextProviders)) {
    await requestDashboardJson(
      `/models/providers/${encodeURIComponent(name)}`,
      MutationResponseSchema,
      { method: "PUT", body: JSON.stringify(provider) },
    );
  }
  if (next.defaults) {
    await requestDashboardJson("/models/default", MutationResponseSchema, {
      method: "PUT",
      body: JSON.stringify(JsonObjectSchema.parse(next.defaults)),
    });
  }
}

async function saveMcpConfiguration(
  next: Record<string, unknown>,
  previous: Record<string, unknown>,
): Promise<void> {
  const nextServers = JsonObjectSchema.parse(next.mcpServers ?? next);
  const previousServers = JsonObjectSchema.parse(previous.mcpServers ?? {});
  for (const name of Object.keys(previousServers).filter(
    (name) => !Object.hasOwn(nextServers, name),
  )) {
    await requestDashboardJson(`/mcp/${encodeURIComponent(name)}`, MutationResponseSchema, {
      method: "DELETE",
    });
  }
  for (const [name, server] of Object.entries(nextServers)) {
    await requestDashboardJson(`/mcp/${encodeURIComponent(name)}`, MutationResponseSchema, {
      method: "PUT",
      body: JSON.stringify(server),
    });
  }
}

export async function saveDashboardArtifact(
  resource: SelectedResource,
  fileType: ArtifactFileType,
  text: string,
  original: string,
): Promise<string> {
  if (resource.kind === "agent") {
    if (fileType === "markdown") {
      await writePlainText(`/api/rowboat/agent?file=${encodeURIComponent(resource.name)}`, text);
      return text;
    }
    const document = parseJsonObject(text);
    const id = stripExtension(resource.name) || resource.name;
    await requestDashboardJson(`/agents/${encodeURIComponent(id)}`, MutationResponseSchema, {
      method: "PUT",
      body: JSON.stringify(document),
    });
    return JSON.stringify(document, null, 2);
  }

  if (resource.kind !== "config") {
    throw new Error("This resource is read-only");
  }
  if (fileType === "markdown") {
    await writePlainText(`/api/rowboat/config?file=${encodeURIComponent(resource.name)}`, text);
    return text;
  }

  const document = parseJsonObject(text);
  const previous = original ? parseJsonObject(original) : {};
  const lowerName = resource.name.toLowerCase();
  if (lowerName.includes("model")) {
    await saveModelConfiguration(document, previous);
  } else if (lowerName.includes("mcp")) {
    await saveMcpConfiguration(document, previous);
  } else {
    throw new Error("Unsupported config file");
  }
  return JSON.stringify(document, null, 2);
}
