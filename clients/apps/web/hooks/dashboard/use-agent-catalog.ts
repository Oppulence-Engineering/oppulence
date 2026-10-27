"use client";

import "client-only";

import { useCallback, useMemo, useState } from "react";

import { useAgentSummaries } from "@/hooks/queries/use-agents";
import { useConsolePreferences } from "@/hooks/queries/use-console";

/**
 * An empty saved default is Assistant. New chats already start there, so the
 * settings menu has to show that instead of asking for a choice that was made.
 */
export function shownDefaultAgent(stored: string | null | undefined): string {
  const slug = stored?.trim() ?? "";
  return slug || "assistant";
}

/**
 * A choice made in this visit wins. Otherwise the saved console default is
 * the agent a new chat starts with. A browser-only preference is not read:
 * nothing in the product writes one, so it could not stay in step with Settings.
 */
export function configuredAgentSlug(
  override: string | null,
  stored: string | null | undefined,
): string {
  const chosen = override?.trim();
  if (chosen) return chosen;
  return shownDefaultAgent(stored);
}

/**
 * Owns agent discovery and selection. Selection remains an explicit override
 * so changing the persisted default elsewhere does not overwrite a choice
 * made during the current dashboard session.
 */
export function useAgentCatalog() {
  const preferences = useConsolePreferences();
  const [selectedAgentOverride, setSelectedAgent] = useState<string | null>(null);
  const configuredAgent = configuredAgentSlug(
    selectedAgentOverride,
    preferences.data?.defaultAgentSlug,
  );
  const { data: agents = [], refetch } = useAgentSummaries();
  const agentOptions = useMemo(() => {
    const slugs = agents.map((agent) => agent.slug.replace(/\.[^/.]+$/, ""));
    return Array.from(new Set(["assistant", ...slugs]));
  }, [agents]);
  const selectedAgent = agentOptions.includes(configuredAgent) ? configuredAgent : "assistant";
  const refreshAgents = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    agents,
    agentOptions,
    refreshAgents,
    selectedAgent,
    setSelectedAgent,
  };
}
