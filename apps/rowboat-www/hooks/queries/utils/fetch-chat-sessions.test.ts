import { describe, expect, it, vi } from "vitest";

import { CHAT_SESSION_PAGE, loadChatSessions } from "./fetch-chat-sessions";

describe("loadChatSessions", () => {
  it("asks for the next page by offset", async () => {
    const request = vi.fn().mockResolvedValue({ sessions: [] });
    await loadChatSessions(request, undefined, CHAT_SESSION_PAGE);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/agent-sessions?offset=50" }),
    );
  });

  it("leaves the first page unpaged", async () => {
    const request = vi.fn().mockResolvedValue({ sessions: [] });
    await loadChatSessions(request);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: "/agent-sessions" }));
  });
});
