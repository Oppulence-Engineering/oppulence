"use client";

import "client-only";

import { useCallback, useMemo, useState } from "react";

import { useAgentSummaries } from "@/hooks/queries/use-agents";
import { usePref } from "@/lib/console/console-prefs";

/**
 * Owns agent discovery and selection. Selection remains an explicit override
 * so changing the persisted default elsewhere does not overwrite a choice
 * made during the current dashboard session.
 */
export function useAgentCatalog() {
  const preferredAgent = usePref("default-agent");
  const [selectedAgentOverride, setSelectedAgent] = useState<string | null>(null);
  const configuredAgent = selectedAgentOverride ?? preferredAgent ?? "assistant";
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
