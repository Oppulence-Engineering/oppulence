import { describe, expect, it } from "vitest";

import { workflowProductDescription, workflowProductName } from "./workflow-product-copy";

describe("workflow product copy", () => {
  it("renames first-party jobs without touching a custom workflow", () => {
    expect(workflowProductName("oppulence-post-meeting-processor", "Post-Meeting Processor")).toBe(
      "Meeting follow-up",
    );
    expect(workflowProductName("post-meeting-processor", "Post-Meeting Processor")).toBe(
      "Meeting follow-up",
    );
    expect(
      workflowProductName("oppulence-connector-health-repair", "Connector Health and Repair"),
    ).toBe("Source health");
    expect(workflowProductName("connector-health-repair", "Connector Health and Repair")).toBe(
      "Source health",
    );
    expect(workflowProductName("oppulence-relationship-refresh", "Relationship Refresh")).toBe(
      "Company refresh",
    );
    expect(workflowProductName("my-renewal-check", "Renewal check")).toBe("Renewal check");
    expect(workflowProductName(undefined, "Renewal check")).toBe("Renewal check");
  });

  it("keeps a stored description when the system name is the only rewrite", () => {
    expect(
      workflowProductDescription(
        "oppulence-post-meeting-processor",
        "Turn completed meetings into follow-ups.",
      ),
    ).toBe("Turn completed meetings into follow-ups.");
    expect(
      workflowProductDescription("oppulence-attention-monitor", "which relationships need attention"),
    ).toBe("Explain which companies need attention now and why.");
    expect(
      workflowProductDescription(
        "oppulence-connector-health-repair",
        "Monitor source freshness, scopes, retries, and backfill progress with actionable repair guidance.",
      ),
    ).toBe("Watch whether each connected source is current, and repair the ones that stop updating.");
  });
});
