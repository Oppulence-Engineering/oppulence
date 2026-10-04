import { beforeEach, describe, expect, it } from "vitest";

import {
  dismissDueCommitments,
  requestDueCommitments,
  subscribeDueCommitments,
} from "@/lib/dashboard/commitment-due-request";

describe("commitment due request", () => {
  beforeEach(() => {
    const drain = subscribeDueCommitments(() => {});
    drain();
  });

  it("selects due promises when the register mounts later", async () => {
    let selected = 0;
    requestDueCommitments();
    const unsubscribe = subscribeDueCommitments(() => {
      selected += 1;
    });
    expect(selected).toBe(1);
    // A strict-mode remount happens before the next task. The click still applies.
    unsubscribe();
    const again = subscribeDueCommitments(() => {
      selected += 1;
    });
    expect(selected).toBe(2);
    again();
    await Promise.resolve();
    const later = subscribeDueCommitments(() => {
      selected += 1;
    });
    expect(selected).toBe(2);
    later();
  });

  it("does not reopen the past-due slice after the reader leaves it", async () => {
    let selected = 0;
    requestDueCommitments();
    dismissDueCommitments();
    const unsubscribe = subscribeDueCommitments(() => {
      selected += 1;
    });
    expect(selected).toBe(0);
    unsubscribe();
    await Promise.resolve();
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
