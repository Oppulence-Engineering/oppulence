import { ListAgentSessions200Response } from "@/lib/api/generated/zod/agent-sessions/agent-sessions";
import { isOptionalRequestFailure, requestJson, type RequestJsonFn } from "@/lib/api/request-json";
import type { SessionMeta } from "@/lib/agents/chat-sessions";

const CHAT_SESSIONS_PATH = "/agent-sessions";

/** One page of chat history. The sidebar asks for the next page explicitly. */
export const CHAT_SESSION_PAGE = 50;

/** One chat-history page. hasMore is the server's look past this page. */
export type ChatSessionPage = {
  sessions: SessionMeta[];
  hasMore: boolean;
};

function sessionTitle(session: {
  agent: string;
  title?: string | null;
  lastActivityAt?: string | null;
  createdAt: string;
}): string {
  return (
    session.title ||
    `${session.agent} · ${new Date(session.lastActivityAt || session.createdAt).toLocaleDateString()}`
  );
}

/** Rows from a history page. A bare array is a test fixture that has no flag. */
export function chatSessionRows(
  page: ChatSessionPage | readonly SessionMeta[] | null | undefined,
): SessionMeta[] {
  if (!page) return [];
  if (Array.isArray(page)) return [...page];
  return page.sessions ?? [];
}

/** True only when the server says another conversation exists past this page. */
export function chatSessionPageHasMore(
  page: ChatSessionPage | readonly SessionMeta[] | null | undefined,
): boolean {
  if (!page || Array.isArray(page)) return false;
  return Boolean(page.hasMore);
}

export async function loadChatSessions(
  request: RequestJsonFn,
  signal?: AbortSignal,
  offset = 0,
): Promise<ChatSessionPage> {
  const query = new URLSearchParams();
  if (offset > 0) query.set("offset", String(offset));
  const path = query.size > 0 ? `${CHAT_SESSIONS_PATH}?${query}` : CHAT_SESSIONS_PATH;
  try {
    const data = await request({
      path,
      schema: ListAgentSessions200Response,
      signal,
    });
    return {
      sessions: data.sessions.map((session) => ({
        runId: session.sessionId,
        title: sessionTitle(session),
        agent: session.agent,
        updatedAt: new Date(session.lastActivityAt || session.createdAt).getTime(),
      })),
      hasMore: Boolean(data.hasMore),
    };
  } catch (error) {
    if (isOptionalRequestFailure(error)) return { sessions: [], hasMore: false };
    throw error;
  }
}

export function fetchChatSessions(signal?: AbortSignal, offset = 0): Promise<ChatSessionPage> {
  return loadChatSessions(requestJson, signal, offset);
}
