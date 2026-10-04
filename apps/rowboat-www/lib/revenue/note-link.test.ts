import { describe, expect, it } from "vitest";

import { noteIdFromHash, workspaceNoteHref } from "@/lib/revenue/note-link";

describe("workspace note links", () => {
  it("keeps the notes tab and the note id", () => {
    expect(
      workspaceNoteHref(
        {
          origin: "http://127.0.0.1:18083",
          pathname: "/app/revenue",
          search: "?tab=commitments&focus=1",
        },
        "note 1",
      ),
    ).toBe("http://127.0.0.1:18083/app/revenue?tab=notes&focus=1#note=note%201");
  });

  it("reads the note id back from the hash", () => {
    expect(noteIdFromHash("#note=note%201")).toBe("note 1");
    expect(noteIdFromHash("")).toBeNull();
    expect(noteIdFromHash("#note=")).toBeNull();
    expect(noteIdFromHash("#other=1")).toBeNull();
    expect(noteIdFromHash("#note=%E0%A4%A")).toBeNull();
  });
});
