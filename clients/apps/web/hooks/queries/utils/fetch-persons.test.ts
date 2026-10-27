import { describe, expect, it, vi } from "vitest";

import type { RelationshipPerson } from "@/lib/revenue/types";

import {
  PERSON_PAGE_SIZE,
  type PersonPage,
  loadPersons,
  personPageHasMore,
  personRows,
} from "./fetch-relationships";

describe("loadPersons", () => {
  it("asks for the next page by offset and keeps the server flag", async () => {
    const request = vi.fn().mockResolvedValue({ persons: [], hasMore: true });
    await expect(loadPersons(request, "", undefined, PERSON_PAGE_SIZE)).resolves.toEqual({
      persons: [],
      hasMore: true,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/relationship-persons?limit=500&offset=500",
      }),
    );
  });

  it("keeps the first page at the directory size when the directory ends", async () => {
    const request = vi.fn().mockResolvedValue({ persons: [] });
    await expect(loadPersons(request, "ada")).resolves.toEqual({
      persons: [],
      hasMore: false,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/relationship-persons?limit=500&q=ada",
      }),
    );
  });
});

describe("personPageHasMore", () => {
  it("trusts the server flag on a full page", () => {
    const persons = Array.from({ length: 500 }, (_, index) => ({
      id: `person-${index}`,
    })) as RelationshipPerson[];
    const full = { persons, hasMore: false } as PersonPage;
    expect(personPageHasMore(full)).toBe(false);
    expect(personPageHasMore({ ...full, hasMore: true })).toBe(true);
    expect(personRows(full)).toHaveLength(500);
  });

  it("treats a bare list as having no further page", () => {
    const row = { id: "person-1" } as RelationshipPerson;
    expect(personPageHasMore([])).toBe(false);
    expect(personPageHasMore(undefined)).toBe(false);
    expect(personRows([row])).toEqual([row]);
  });
});
