import { describe, expect, it } from "vitest";

import { sidebarAgentItem, sidebarRunLabel } from "@/hooks/queries/utils/fetch-sidebar";

describe("sidebar labels", () => {
  it("names an agent and keeps the slug as the navigation value", () => {
    expect(sidebarAgentItem({ slug: "concierge-slack", name: "Slack Concierge" })).toEqual({
      label: "Slack Concierge",
      value: "concierge-slack",
    });
    expect(sidebarAgentItem({ slug: "assistant.yaml", name: "  " })).toEqual({
      label: "assistant",
      value: "assistant",
    });
  });

  it("names a run after its workflow and capitalizes the status", () => {
    expect(
      sidebarRunLabel(
        { value: "meeting-pre-brief/run-1", label: "meeting-pre-brief · succeeded" },
        [{ value: "meeting-pre-brief", label: "Meeting Pre-Brief" }],
      ),
    ).toBe("Meeting Pre-Brief · Succeeded");
    expect(
      sidebarRunLabel({ value: "meeting-pre-brief/run-1", label: "meeting-pre-brief · queued" }),
    ).toBe("meeting-pre-brief · Queued");
  });
});
