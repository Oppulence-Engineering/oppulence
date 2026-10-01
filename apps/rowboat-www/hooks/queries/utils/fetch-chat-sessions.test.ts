import { describe, expect, it, vi } from "vitest";

import type { SessionMeta } from "@/lib/agents/chat-sessions";

import {
  CHAT_SESSION_PAGE,
  type ChatSessionPage,
  chatSessionPageHasMore,
  chatSessionRows,
  loadChatSessions,
} from "./fetch-chat-sessions";

const session = {
  agent: "assistant",
  channel: "web",
  continuationToken: null,
  costUnits: 0,
  createdAt: "2026-06-01T00:00:00Z",
  llmCalls: 0,
  sessionId: "exact-chat-001",
  status: "completed" as const,
  title: "Exact Chat Last",
  toolCalls: 0,
  turns: 0,
};

describe("loadChatSessions", () => {
  it("asks for the next page by offset and keeps the server flag", async () => {
    const request = vi.fn().mockResolvedValue({ sessions: [session], hasMore: true });
    await expect(loadChatSessions(request, undefined, CHAT_SESSION_PAGE)).resolves.toMatchObject({
      hasMore: true,
      sessions: [expect.objectContaining({ runId: "exact-chat-001", title: "Exact Chat Last" })],
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/agent-sessions?offset=50" }),
    );
  });

  it("leaves the first page unpaged when the history ends", async () => {
    const request = vi.fn().mockResolvedValue({ sessions: [] });
    await expect(loadChatSessions(request)).resolves.toEqual({ sessions: [], hasMore: false });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: "/agent-sessions" }));
  });
});

describe("chatSessionPageHasMore", () => {
  it("trusts the server flag on a full page", () => {
    const sessions = Array.from({ length: 50 }, (_, index) => ({
      runId: `exact-chat-${index}`,
      title: `Exact Chat ${index}`,
      updatedAt: 0,
    })) as SessionMeta[];
    const full = { sessions, hasMore: false } as ChatSessionPage;
    expect(chatSessionPageHasMore(full)).toBe(false);
    expect(chatSessionPageHasMore({ ...full, hasMore: true })).toBe(true);
    expect(chatSessionRows(full)).toHaveLength(50);
  });

  it("treats a bare list as having no further page", () => {
    const row = { runId: "exact-chat-001", title: "Exact Chat Last", updatedAt: 0 };
    expect(chatSessionPageHasMore([])).toBe(false);
    expect(chatSessionPageHasMore(undefined)).toBe(false);
    expect(chatSessionRows([row])).toEqual([row]);
  });
});
