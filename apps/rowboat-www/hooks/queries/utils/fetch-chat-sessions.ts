import { ListAgentSessions200Response } from "@/lib/api/generated/zod/agent-sessions/agent-sessions";
import { isOptionalRequestFailure, requestJson, type RequestJsonFn } from "@/lib/api/request-json";
import type { SessionMeta } from "@/lib/agents/chat-sessions";

const CHAT_SESSIONS_PATH = "/agent-sessions";

/** One page of chat history. The sidebar asks for the next page explicitly. */
export const CHAT_SESSION_PAGE = 50;

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

export async function loadChatSessions(
  request: RequestJsonFn,
  signal?: AbortSignal,
  offset = 0,
): Promise<SessionMeta[]> {
  const query = new URLSearchParams();
  if (offset > 0) query.set("offset", String(offset));
  const path = query.size > 0 ? `${CHAT_SESSIONS_PATH}?${query}` : CHAT_SESSIONS_PATH;
  try {
    const data = await request({
      path,
      schema: ListAgentSessions200Response,
      signal,
    });
    return data.sessions.map((session) => ({
      runId: session.sessionId,
      title: sessionTitle(session),
      agent: session.agent,
      updatedAt: new Date(session.lastActivityAt || session.createdAt).getTime(),
    }));
  } catch (error) {
    if (isOptionalRequestFailure(error)) return [];
    throw error;
  }
}

export function fetchChatSessions(signal?: AbortSignal, offset = 0): Promise<SessionMeta[]> {
  return loadChatSessions(requestJson, signal, offset);
}
