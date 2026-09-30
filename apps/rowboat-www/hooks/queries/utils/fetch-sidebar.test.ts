import { describe, expect, it } from "vitest";

import {
  previewSidebarRuns,
  sidebarAgentItem,
  sidebarRunCountLabel,
  sidebarRunLabel,
  SIDEBAR_RUN_PREVIEW,
} from "@/hooks/queries/utils/fetch-sidebar";

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
    ).toBe("Meeting pre-brief · Succeeded");
    expect(
      sidebarRunLabel({ value: "meeting-pre-brief/run-1", label: "meeting-pre-brief · queued" }),
    ).toBe("Meeting pre-brief · Queued");
    expect(
      sidebarRunLabel(
        {
          value: "oppulence-relationship-refresh/run-1",
          label: "oppulence-relationship-refresh · failed",
        },
        [{ value: "oppulence-relationship-refresh", label: "Relationship Refresh" }],
      ),
    ).toBe("Company refresh · Failed");
  });
});

describe("sidebar run preview", () => {
  const run = (index: number) => ({
    runId: `run-${index}`,
    slug: "meeting-pre-brief",
    status: "failed",
  });

  it("counts every run when the list fits in the sidebar", () => {
    const preview = previewSidebarRuns([run(1), run(2)]);
    expect(preview.truncated).toBe(false);
    expect(preview.items).toHaveLength(2);
    expect(sidebarRunCountLabel(preview)).toBe("2");
  });

  it("marks a longer history so the badge is not read as the total", () => {
    const preview = previewSidebarRuns(
      Array.from({ length: SIDEBAR_RUN_PREVIEW + 3 }, (_, index) => run(index)),
    );
    expect(preview.truncated).toBe(true);
    expect(preview.items).toHaveLength(SIDEBAR_RUN_PREVIEW);
    expect(sidebarRunCountLabel(preview)).toBe(`${SIDEBAR_RUN_PREVIEW}+`);
  });

  it("omits the badge when there are no runs", () => {
    expect(sidebarRunCountLabel(previewSidebarRuns([]))).toBe("");
    expect(sidebarRunCountLabel(previewSidebarRuns([{ slug: "missing-id" }]))).toBe("");
  });
});
