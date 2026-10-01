"use client";

import "client-only";

import { useCallback, useEffect, useState } from "react";
import { useRemoteChatSessions } from "@/hooks/queries/use-chat-sessions";
import {
  chatSessionPageHasMore,
  chatSessionRows,
  fetchChatSessions,
} from "@/hooks/queries/utils/fetch-chat-sessions";

import {
  conversationFromAgentEvents,
  type AgentHistoryItem,
  type ConversationItem,
} from "@/lib/agents/agent-history";
import { ListAgentSessionEvents200Response } from "@/lib/api/generated/zod/agent-sessions/agent-sessions";
import type { DurableAgentSessionEvent } from "@/lib/api/generated/client/model/durableAgentSessionEvent";
import { requestDashboardJson } from "@/lib/dashboard/dashboard-json";
import {
  listSessions,
  loadSession,
  mergeSessionLists,
  saveSession,
  type SessionMeta,
  type SessionScope,
} from "@/lib/agents/chat-sessions";
import type { AgentRunSnapshot } from "@/hooks/dashboard/use-agent-run";

type ChatMessage = Extract<AgentHistoryItem, { type: "message" }>;

type UseChatSessionsOptions = {
  activeRunId: string | null;
  conversation: ConversationItem[];
  onBeginOpen: () => void;
  onFailedOpen: (message: string) => void;
  onOpen: (snapshot: AgentRunSnapshot) => void;
  onSelectAgent: (agent: string) => void;
  scope: SessionScope;
  selectedAgent: string;
};

/**
 * Owns the local transcript cache and durable history projection. The server
 * event log remains authoritative; the memory cache only avoids repeat loads
 * during one authenticated browser session.
 */
export function useChatSessions({
  activeRunId,
  conversation,
  onBeginOpen,
  onFailedOpen,
  onOpen,
  onSelectAgent,
  scope,
  selectedAgent,
}: UseChatSessionsOptions) {
  const remoteSessionsQuery = useRemoteChatSessions();
  const [earlierSessions, setEarlierSessions] = useState<SessionMeta[]>([]);
  const [laterHasMore, setLaterHasMore] = useState<boolean | null>(null);
  const [loadingEarlierSessions, setLoadingEarlierSessions] = useState(false);
  const [earlierSessionsError, setEarlierSessionsError] = useState<string | null>(null);
  const remoteSessions = chatSessionRows(remoteSessionsQuery.data);
  // The memory cache contains at most 30 entries, so deriving this projection
  // during render is safer than duplicating synchronized session-list state.
  const sessions = mergeSessionLists(listSessions(scope), remoteSessions, earlierSessions);
  const hasMoreSessions =
    laterHasMore ??
    (remoteSessions.length > 0 && chatSessionPageHasMore(remoteSessionsQuery.data));
  const remoteKey = remoteSessions.map((session) => session.runId).join("\n");

  useEffect(() => {
    setEarlierSessions([]);
    setLaterHasMore(null);
    setEarlierSessionsError(null);
  }, [remoteKey]);

  useEffect(() => {
    if (!activeRunId || conversation.length === 0) return;
    const firstMessage = conversation.find(
      (item): item is ChatMessage => item.type === "message" && item.role === "user",
    );
    saveSession(scope, {
      runId: activeRunId,
      title: (firstMessage?.content || "New conversation").slice(0, 60),
      agent: selectedAgent,
      updatedAt: Date.now(),
      items: conversation,
    });
  }, [activeRunId, conversation, scope, selectedAgent]);

  const openSession = useCallback(
    async (nextRunId: string) => {
      if (nextRunId === activeRunId) return;
      const stored = loadSession(scope, nextRunId);
      onBeginOpen();

      try {
        let items = stored?.items;
        const meta = sessions.find((entry) => entry.runId === nextRunId);
        if (!items) {
          const events: DurableAgentSessionEvent[] = [];
          let afterSeq: number | undefined;
          // Histories are deliberately bounded until the transcript view has
          // virtualized incremental loading for pathological 50k+ event runs.
          for (let page = 0; page < 50; page += 1) {
            const query = new URLSearchParams({ limit: "1000" });
            if (afterSeq !== undefined) query.set("afterSeq", String(afterSeq));
            const data = await requestDashboardJson(
              `/agent-sessions/${encodeURIComponent(nextRunId)}/events?${query}`,
              ListAgentSessionEvents200Response,
            );
            events.push(...data.events);
            if (data.nextSeq == null || data.nextSeq === afterSeq) break;
            afterSeq = data.nextSeq;
          }
          items = conversationFromAgentEvents(events);
          saveSession(scope, {
            runId: nextRunId,
            title: meta?.title || "Conversation",
            agent: meta?.agent,
            updatedAt: meta?.updatedAt || Date.now(),
            items,
          });
        }
        onOpen({ runId: nextRunId, items });
        const agent = stored?.agent || meta?.agent;
        if (agent) onSelectAgent(agent);
      } catch (error) {
        onFailedOpen(error instanceof Error ? error.message : "Could not load conversation");
      }
    },
    [activeRunId, onBeginOpen, onFailedOpen, onOpen, onSelectAgent, scope, sessions],
  );

  const loadEarlierSessions = useCallback(async () => {
    setLoadingEarlierSessions(true);
    setEarlierSessionsError(null);
    try {
      const page = await fetchChatSessions(
        undefined,
        remoteSessions.length + earlierSessions.length,
      );
      const rows = chatSessionRows(page);
      setEarlierSessions((current) => {
        const seen = new Set(current.map((session) => session.runId));
        const next = [...current];
        for (const session of rows) {
          if (!seen.has(session.runId)) next.push(session);
        }
        return next;
      });
      setLaterHasMore(chatSessionPageHasMore(page));
    } catch {
      setEarlierSessionsError("Could not load earlier conversations.");
    } finally {
      setLoadingEarlierSessions(false);
    }
  }, [earlierSessions.length, remoteSessions.length]);

  return {
    earlierSessionsError,
    hasMoreSessions,
    loadEarlierSessions,
    loadingEarlierSessions,
    openSession,
    sessions,
  };
}
