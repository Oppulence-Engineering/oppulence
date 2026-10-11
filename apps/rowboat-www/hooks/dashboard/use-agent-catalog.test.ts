import { describe, expect, it } from "vitest";

import { configuredAgentSlug, shownDefaultAgent } from "@/hooks/dashboard/use-agent-catalog";

describe("configured agent", () => {
  it("uses Assistant when no default has been saved", () => {
    expect(shownDefaultAgent("")).toBe("assistant");
    expect(shownDefaultAgent(undefined)).toBe("assistant");
    expect(configuredAgentSlug(null, "")).toBe("assistant");
  });

  it("uses the saved console default, and a visit choice over that", () => {
    expect(configuredAgentSlug(null, "concierge")).toBe("concierge");
    expect(configuredAgentSlug("concierge-slack", "assistant")).toBe("concierge-slack");
  });
});
