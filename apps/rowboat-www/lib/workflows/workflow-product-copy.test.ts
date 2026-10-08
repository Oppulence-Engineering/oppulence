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
    expect(workflowProductName("oppulence-meeting-pre-brief", "Meeting Pre-Brief")).toBe(
      "Meeting pre-brief",
    );
    expect(workflowProductName("meeting-pre-brief", "Meeting Pre-Brief")).toBe("Meeting pre-brief");
    expect(workflowProductName("oppulence-attention-monitor", "Attention Monitor")).toBe(
      "Attention monitor",
    );
    expect(workflowProductName("oppulence-recommendation-review", "Recommendation Review")).toBe(
      "Recommendation review",
    );
    expect(workflowProductName("my-renewal-check", "Renewal check")).toBe("Renewal check");
    expect(workflowProductName(undefined, "Renewal check")).toBe("Renewal check");
  });

  it("describes meeting and recommendation workflows without internal wording", () => {
    expect(
      workflowProductDescription(
        "oppulence-post-meeting-processor",
        "Turn completed meetings and transcripts into evidence-linked commitments, risks, and approval-ready follow-ups.",
      ),
    ).toBe(
      "Turn a finished meeting into promises, risks, and a follow-up that waits for your approval.",
    );
    expect(
      workflowProductDescription(
        "oppulence-meeting-pre-brief",
        "Prepare evidence-linked context, commitments, risks, and goals for upcoming customer meetings.",
      ),
    ).toBe("Get the promises, risks, and goals ready before a meeting.");
    expect(
      workflowProductDescription(
        "oppulence-recommendation-review",
        "Assemble pending recommendations into a transparent, approval-ready review queue.",
      ),
    ).toBe("Collect recommendations that are waiting so you can approve them together.");
    expect(workflowProductDescription("my-renewal-check", "Watch the renewal date.")).toBe(
      "Watch the renewal date.",
    );
    expect(
      workflowProductDescription(
        "event-triage",
        "Route inbound provider/webhook events into an actionable incident or support digest.",
      ),
    ).toBe("Turn events from GitHub, Linear, or Stripe into a short list of what needs a response.");
    expect(
      workflowProductDescription(
        "data-report",
        "Run sandboxed analysis and publish a markdown report artifact.",
      ),
    ).toBe("Turn a question about your data into a written report.");
    expect(
      workflowProductDescription("oppulence-attention-monitor", "which relationships need attention"),
    ).toBe("Explain which companies need attention now and why.");
    expect(
      workflowProductDescription(
        "oppulence-connector-health-repair",
        "Monitor source freshness, scopes, retries, and backfill progress with actionable repair guidance.",
      ),
    ).toBe(
      "After a source is connected, watch whether it is current and repair it when it stops updating.",
    );
    expect(
      workflowProductDescription(
        "oppulence-connector-health-repair",
        "Monitor source freshness, scopes, retries, and backfill progress with actionable repair guidance.",
      ),
    ).not.toContain("each connected source");
  });
});
