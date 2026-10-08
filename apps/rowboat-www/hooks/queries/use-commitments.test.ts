import { describe, expect, it } from "vitest";

import { keptRegisterPage, registerLoadNotice } from "@/hooks/queries/use-commitments";

describe("keptRegisterPage", () => {
  it("keeps a loaded page when the next fetch fails", () => {
    const previous = {
      entries: [{ id: "commitment-1" }],
      hasMore: true,
    };
    expect(keptRegisterPage(previous, true)).toEqual(previous);
  });

  it("drops the previous page when the next fetch succeeds", () => {
    expect(
      keptRegisterPage({ entries: [{ id: "commitment-1" }], hasMore: false }, false),
    ).toBeNull();
  });

  it("keeps a loaded empty page when the next fetch fails", () => {
    expect(keptRegisterPage({ entries: [], hasMore: false, entriesKnown: true }, true)).toEqual({
      entries: [],
      hasMore: false,
    });
  });

  it("does not invent rows for a first load that fails", () => {
    expect(keptRegisterPage(undefined, true)).toBeNull();
    expect(keptRegisterPage({ entries: [], hasMore: false }, true)).toBeNull();
    expect(keptRegisterPage({ entries: [], hasMore: false, entriesKnown: false }, true)).toBeNull();
  });
});

describe("registerLoadNotice", () => {
  it("names a refresh when the register page already arrived", () => {
    expect(registerLoadNotice(new Error("Request failed (500)"), true)).toBe(
      "Could not refresh promises. Try again.",
    );
    expect(registerLoadNotice(new Error("Request failed (500)"), false)).toBe(
      "Promises could not be loaded.",
    );
    expect(registerLoadNotice(new Error("Request failed (429)"), true)).toBe(
      "Too many requests were sent from this workspace. Wait a moment, then try again.",
    );
  });
});
