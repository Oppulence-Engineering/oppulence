import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(import.meta.dirname, "use-agent-run.ts"), "utf8");

describe("useAgentRun", () => {
  it("explains a rate limit when sending, stopping, or opening a chat fails", () => {
    expect(source).toContain(
      'friendlyAgentError(error instanceof Error ? error.message : "Failed to send message")',
    );
    expect(source).toContain(
      'friendlyAgentError(error instanceof Error ? error.message : "Could not stop the run")',
    );
    expect(source).toContain(
      'friendlyAgentError(\n            error instanceof Error ? error.message : "Could not resolve the approval",\n          )',
    );
    expect(source).toContain("setChatError(friendlyAgentError(message))");
    expect(source).toContain("const explained = friendlyAgentError(message);");
  });
});
