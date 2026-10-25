// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  graphSavedViews,
  graphViewsStorageKey,
  readLegacyGraphViews,
  noteFavorites,
  noteTemplates,
} from "@/lib/console/console-resources";
import type { ConsoleResource } from "@/lib/console/console";

const state = {
  scope: "portfolio" as const,
  query: "",
  layout: "force" as const,
  density: 0.72,
  hideIsolated: false,
  focusDepth: 0 as const,
  changedSinceReview: false,
};
const timestamps = {
  createdAt: "2026-09-17T12:00:00Z",
  updatedAt: "2026-09-17T12:00:00Z",
  sortOrder: 0,
};

describe("console resource projections", () => {
  let values: Map<string, string>;
  let storage: Pick<Storage, "getItem" | "setItem">;

  beforeEach(() => {
    values = new Map();
    storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    };
  });

  it("separates templates and favorites by validated payload shape", () => {
    const resources: ConsoleResource[] = [
      {
        ...timestamps,
        id: "11111111-1111-4111-8111-111111111111",
        kind: "note_template",
        name: "Review",
        payload: { title: "Review", body: "Agenda" },
      },
      {
        ...timestamps,
        id: "22222222-2222-4222-8222-222222222222",
        kind: "note_favorite",
        payload: { noteId: "note-1" },
      },
    ];

    expect(noteTemplates(resources)[0]?.payload.title).toBe("Review");
    expect(noteFavorites(resources)[0]?.payload.noteId).toBe("note-1");
  });

  it("keeps offline saved graph views scoped to the signed-in user", () => {
    const userAKey = graphViewsStorageKey("user-a")!;
    const userBKey = graphViewsStorageKey("user-b")!;
    const view = {
      id: "33333333-3333-4333-8333-333333333333",
      label: "Portfolio",
      createdAt: timestamps.createdAt,
      updatedAt: timestamps.updatedAt,
      state,
    };

    storage.setItem(userAKey, JSON.stringify([view]));

    expect(graphViewsStorageKey()).toBeNull();
    expect(readLegacyGraphViews(storage, userAKey)).toEqual([view]);
    expect(readLegacyGraphViews(storage, userBKey)).toEqual([]);
    expect(readLegacyGraphViews(storage, null)).toEqual([]);
  });
});
