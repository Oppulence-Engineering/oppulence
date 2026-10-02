import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(import.meta.dirname, "use-agent-run.ts"), "utf8");

describe("useAgentRun", () => {
  it("explains a rate limit when sending, stopping, or opening a chat fails", () => {
    expect(source).toContain('shownAgentError(error, "Failed to send message")');
    expect(source).toContain('shownAgentError(error, "Could not stop the run")');
    expect(source).toContain('shownAgentError(error, "Could not resolve the approval")');
    expect(source).toContain(
      'shownAgentError(new Error(message), "Could not load conversation")',
    );
    expect(source).toContain("const explained = friendlyAgentError(message);");
  });
});
