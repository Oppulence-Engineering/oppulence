import { beforeEach, describe, expect, it } from "vitest";

import {
  requestDueCommitments,
  subscribeDueCommitments,
} from "@/lib/dashboard/commitment-due-request";

describe("commitment due request", () => {
  beforeEach(() => {
    const drain = subscribeDueCommitments(() => {});
    drain();
  });

  it("selects due promises when the register mounts later", () => {
    let selected = 0;
    requestDueCommitments();
    const unsubscribe = subscribeDueCommitments(() => {
      selected += 1;
    });
    expect(selected).toBe(1);
    unsubscribe();
    const again = subscribeDueCommitments(() => {
      selected += 1;
    });
    expect(selected).toBe(1);
    again();
  });

  it("selects due promises when the register is already showing", () => {
    let selected = 0;
    const unsubscribe = subscribeDueCommitments(() => {
      selected += 1;
    });
    requestDueCommitments();
    expect(selected).toBe(1);
    unsubscribe();
  });
});
