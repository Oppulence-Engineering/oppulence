import { z } from "zod";

import { comboboxFilterName } from "@/lib/a11y/combobox-filter-name";

const NonEmptyStringSchema = z.string().trim().min(1);

export const AgentViewSchema = z
  .object({
    slug: NonEmptyStringSchema.optional(),
    name: NonEmptyStringSchema.optional(),
    source: z.string().optional(),
    instructions: z.string().optional(),
    model: NonEmptyStringSchema.optional(),
    provider: NonEmptyStringSchema.optional(),
    enabledTools: z.array(z.string()).default([]),
    subagentRefs: z.array(z.string()).default([]),
    connectorReqs: z.array(z.string()).default([]),
    limits: z.record(z.string(), z.unknown()).optional(),
  })
  .strip();

export type AgentView = z.infer<typeof AgentViewSchema>;

const AgentListEntrySchema = AgentViewSchema.extend({
  slug: NonEmptyStringSchema,
});

export const AgentsResponseSchema = z.object({
  agents: z.array(z.union([NonEmptyStringSchema, AgentListEntrySchema])),
});

export type AgentSummary = {
  slug: string;
  name: string;
  source: string;
  instructions?: string;
  model?: string;
  provider?: string;
  enabledTools: string[];
  subagentRefs: string[];
  connectorReqs: string[];
  limits?: Record<string, unknown>;
};

/**
 * Chat and settings store the agent slug because runs are keyed by it.
 * The label people see is the name from the same record.
 */
export function agentDisplayName(
  agents: readonly Pick<AgentSummary, "slug" | "name">[],
  slug: string,
): string {
  const match = agents.find(
    (agent) => agent.slug === slug || agent.slug.replace(/\.[^/.]+$/, "") === slug,
  );
  const name = match?.name.trim();
  return name || slug;
}

/**
 * A closed select cannot read its menu item. Until the catalog arrives, a
 * neutral label is clearer than flashing the stored slug.
 */
export function visibleAgentLabel(
  agents: readonly Pick<AgentSummary, "slug" | "name">[],
  slug: string,
): string {
  if (agents.length === 0) return "Agent";
  return agentDisplayName(agents, slug);
}

/**
 * The composer select's visible word is the agent. A combobox does not use
 * that word as its name, so "Agent" alone never says which one is selected.
 * Before the catalog loads there is no choice to add.
 */
export function agentSelectName(
  agents: readonly Pick<AgentSummary, "slug" | "name">[],
  slug: string,
): string {
  const label = visibleAgentLabel(agents, slug);
  if (agents.length === 0) return label;
  return comboboxFilterName("Agent", label);
}

const AGENT_SOURCE_LABELS: Record<string, string> = {
  builtin: "Oppulence",
  gitops: "Managed",
  tenant: "Workspace",
  unknown: "Custom",
};

/**
 * First-party agents ship a runtime prompt. That prompt names the old product
 * and the tool ids the model calls. The agents page is for people, so these
 * three get a description of the job instead of that prompt.
 */
const MAINTAINED_AGENT_INSTRUCTIONS: Record<string, string> = {
  assistant:
    "Answers questions about this workspace. It can look up companies, promises, and workflows, and it can draft the next step. Anything that writes waits for your approval.",
  concierge:
    "Handles requests that need connected tools. It can look up records and prepare notes or tasks. Sending and other writes wait for your approval.",
  "concierge-slack":
    "Works from Slack. It can read a thread, check mail and calendar, and prepare a reply. Messages it posts wait for your approval.",
};

function isRuntimePrompt(text: string): boolean {
  return /rowboat|run_history|mission_control|agent\.rowboat/i.test(text);
}

/**
 * Workspace agents show the instructions their author wrote. Maintained agents
 * keep the runtime prompt on the server and show a description of the job.
 */
export function agentInstructionsCopy(input: {
  slug: string;
  source?: string;
  instructions?: string;
}): string {
  const slug = input.slug.trim();
  const source = input.source?.trim() || "";
  const stored = input.instructions?.trim() || "";
  if (source === "tenant") return stored || "No additional instructions.";
  const maintained = MAINTAINED_AGENT_INSTRUCTIONS[slug];
  if (maintained && source !== "unknown") return maintained;
  if (
    (source === "builtin" || source === "gitops") &&
    (!stored || isRuntimePrompt(stored))
  ) {
    return "Oppulence maintains this agent. Its instructions stay with the product.";
  }
  return stored || "No additional instructions.";
}

/**
 * The customize dialog shows the same purpose as the agent page. Leaving that
 * text unchanged keeps the maintained runtime prompt on the copy. Editing it
 * saves what the person wrote.
 */
export function duplicateAgentInstructions(
  source: { slug: string; source?: string; instructions?: string } | undefined,
  drafted: string,
): string {
  const draft = drafted.trim();
  if (!source) return draft;
  const shown = agentInstructionsCopy(source).trim();
  const stored = source.instructions?.trim() || "";
  if (draft === shown && stored) return stored;
  return draft;
}

/**
 * Delegation buttons only have the slug. Known agents use their product name;
 * any other slug is shown as words.
 */
/**
 * Configuration opens by slug, because that is how the agent is stored.
 * The panel title is the name a person gave it. A slug used as the name
 * is still shown as the product title.
 */
export function agentArtifactTitle(name: string | undefined, slug: string): string {
  const trimmed = name?.trim() || "";
  if (trimmed && trimmed !== slug.trim()) return trimmed;
  return agentSlugTitle(slug);
}

export function agentSlugTitle(slug: string): string {
  const known: Record<string, string> = {
    assistant: "Assistant",
    concierge: "Concierge",
    "concierge-slack": "Slack Concierge",
  };
  const match = known[slug.trim()];
  if (match) return match;
  const words = slug.replace(/[._-]+/g, " ").trim();
  if (!words) return slug;
  return words.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const AGENT_PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  google: "Google",
};

/** The agents page names the provider. The stored slug stays on the agent. */
export function agentProviderLabel(provider?: string | null): string {
  const trimmed = provider?.trim() ?? "";
  if (!trimmed) return "Workspace default";
  const known = AGENT_PROVIDER_LABELS[trimmed.toLowerCase()];
  if (known) return known;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** The API stores a source enum. The agents page badge is a product label. */
export function agentSourceLabel(source: string): string {
  const known = AGENT_SOURCE_LABELS[source];
  if (known) return known;
  const words = source.replace(/[_-]+/g, " ").trim();
  if (!words) return "Custom";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Validates and normalizes the list projection returned by the agents API. */
export function parseAgentsResponse(value: unknown): AgentSummary[] {
  return AgentsResponseSchema.parse(value).agents.map((agent) => {
    if (typeof agent === "string") {
      return {
        slug: agent,
        name: agent,
        source: "unknown",
        enabledTools: [],
        subagentRefs: [],
        connectorReqs: [],
      };
    }

    return {
      ...agent,
      name: agent.name ?? agent.slug,
      source: agent.source ?? "unknown",
      enabledTools: agent.enabledTools ?? [],
      subagentRefs: agent.subagentRefs ?? [],
      connectorReqs: agent.connectorReqs ?? [],
    };
  });
}

/**
 * Converts the API's agent projection into the editable Agent document shape.
 * Defaults are deliberate because managed/legacy projections may omit fields;
 * malformed field types are rejected instead of leaking into the editor.
 */
export function parseAgentDocument(value: unknown, fallbackSlug: string): Record<string, unknown> {
  const agent = AgentViewSchema.parse(value);
  const slug = agent.slug ?? fallbackSlug;
  const name = agent.name ?? slug;
  const spec: Record<string, unknown> = {
    instructions: agent.instructions ?? "",
    tools: agent.enabledTools ?? [],
  };

  if (agent.model) spec.model = agent.model;
  if (agent.provider) spec.provider = agent.provider;
  if (agent.subagentRefs?.length) spec.subagents = agent.subagentRefs;
  if (agent.connectorReqs?.length) {
    spec.connections = agent.connectorReqs.map((scope) => ({ scope }));
  }
  if (agent.limits) spec.limits = agent.limits;

  return {
    apiVersion: "agent.rowboat.dev/v1",
    kind: "Agent",
    metadata: { slug, name },
    spec,
  };
}
