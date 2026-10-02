import { describe, expect, it } from "vitest";

import { chatSessionsLoadError } from "./use-chat-sessions";

describe("chatSessionsLoadError", () => {
  it("names a failed first page instead of an empty history", () => {
    expect(chatSessionsLoadError(null, true)).toBe("Could not load conversations.");
    expect(chatSessionsLoadError(null, false)).toBeNull();
  });

  it("keeps the earlier-page sentence when that request failed", () => {
    expect(chatSessionsLoadError("Could not load earlier conversations.", true)).toBe(
      "Could not load earlier conversations.",
    );
  });

  it("names a failed refresh when conversations are already listed", () => {
    expect(chatSessionsLoadError(null, true, true)).toBe(
      "Could not refresh conversations. Try again.",
    );
    expect(chatSessionsLoadError(null, false, true)).toBeNull();
  });
});
