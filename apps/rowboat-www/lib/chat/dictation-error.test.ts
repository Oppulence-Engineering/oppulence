import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { dictationErrorMessage } from "@/lib/chat/dictation-error";

describe("dictationErrorMessage", () => {
  it("explains a blocked microphone and stays quiet when dictation is cancelled", () => {
    expect(dictationErrorMessage("not-allowed")).toBe(
      "Microphone access is blocked. Allow the microphone for this site to dictate.",
    );
    expect(dictationErrorMessage("audio-capture")).toBe("No microphone was found.");
    expect(dictationErrorMessage("no-speech")).toBe("No speech was heard. Try dictating again.");
    expect(dictationErrorMessage("aborted")).toBeNull();
    expect(dictationErrorMessage("something-new")).toBe(
      "Dictation stopped before any text was added.",
    );
  });

  it("shows the dictation failure on the composer instead of only the console", () => {
    const button = readFileSync(
      resolve(process.cwd(), "components/ai-elements/prompt-input.tsx"),
      "utf8",
    );
    const composer = readFileSync(
      resolve(
        process.cwd(),
        "components/features/dashboard/chat-route-provider/chat-route-provider.tsx",
      ),
      "utf8",
    );
    expect(button).toContain("dictationErrorMessage(event.error)");
    expect(button).not.toContain("console.error");
    expect(composer).toContain("onDictationError={setChatError}");
  });
});
