import { describe, expect, it } from "vitest";

import type { RequestJsonFn } from "@/lib/api/request-json";
import {
  loadMoreWorkspaceNotes,
  loadWorkspaceNotes,
  WORKSPACE_NOTE_PAGE,
} from "@/hooks/queries/utils/fetch-workspace-notes";

function companies(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `company-${String(index)}`,
    kind: "company",
    displayName: `Cedar ${String(index)}`,
  }));
}

describe("loadWorkspaceNotes", () => {
  it("reads every company note in one request", async () => {
    const paths: string[] = [];
    const request: RequestJsonFn = async (input) => {
      paths.push(input.path);
      if (input.path.startsWith("/workspace-notes")) {
        return {
          notes: [
            {
              externalId: "note-1",
              title: "Renewal context",
              body: "Use the updated terms.",
              meetingLinked: false,
              liveLinked: false,
              relationshipId: "company-0",
              relationshipName: "Cedar 0",
              occurredAt: "2026-09-03T12:00:00Z",
              eventType: "note",
            },
          ],
          hasMore: false,
        };
      }
      return { relationships: companies(8), hasMore: false };
    };

    const page = await loadWorkspaceNotes(request);

    expect(paths).toEqual([
      "/relationships",
      `/workspace-notes?limit=${String(WORKSPACE_NOTE_PAGE)}`,
    ]);
    expect(paths.some((path) => path.includes("/timeline"))).toBe(false);
    expect(page.notes.map((note) => note.title)).toEqual(["Renewal context"]);
    expect(page.relationships).toHaveLength(8);
    expect(page.failedTimelineCount).toBe(0);
    expect(page.timelineCursors).toEqual([]);
    expect(page.hasMoreNotes).toBe(false);
  });

  it("asks for the next note page without another company timeline", async () => {
    const paths: string[] = [];
    const request: RequestJsonFn = async (input) => {
      paths.push(input.path);
      if (input.path.startsWith("/workspace-notes")) {
        const offset = new URLSearchParams(input.path.split("?")[1]).get("offset");
        if (offset === "1") {
          return {
            notes: [
              {
                externalId: "note-2",
                title: "Older note",
                body: "",
                relationshipId: "company-1",
                relationshipName: "Cedar 1",
                occurredAt: "2026-09-01T12:00:00Z",
                eventType: "note",
              },
            ],
            hasMore: false,
          };
        }
        return {
          notes: [
            {
              externalId: "note-1",
              title: "Newest note",
              body: "",
              relationshipId: "company-0",
              relationshipName: "Cedar 0",
              occurredAt: "2026-09-03T12:00:00Z",
              eventType: "note",
            },
          ],
          hasMore: true,
        };
      }
      return { relationships: companies(1), hasMore: false };
    };

    const first = await loadWorkspaceNotes(request);
    const more = await loadMoreWorkspaceNotes(request, {
      relationships: first.relationships,
      timelineCursors: first.timelineCursors,
    });

    expect(first.timelineCursors).toEqual([
      { relationshipId: "__workspace_notes__", before: "1" },
    ]);
    expect(paths.filter((path) => path.includes("/timeline"))).toEqual([]);
    expect(paths.filter((path) => path.startsWith("/workspace-notes"))).toEqual([
      `/workspace-notes?limit=${String(WORKSPACE_NOTE_PAGE)}`,
      `/workspace-notes?limit=${String(WORKSPACE_NOTE_PAGE)}&offset=1`,
    ]);
    expect(more.notes.map((note) => note.title)).toEqual(["Older note"]);
    expect(more.hasMoreNotes).toBe(false);
  });
});
