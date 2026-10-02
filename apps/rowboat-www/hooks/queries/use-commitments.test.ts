import { describe, expect, it } from "vitest";

import { keptRegisterPage } from "@/hooks/queries/use-commitments";

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

  it("does not invent rows for a first load that fails", () => {
    expect(keptRegisterPage(undefined, true)).toBeNull();
    expect(keptRegisterPage({ entries: [], hasMore: false }, true)).toBeNull();
  });
});
