import { describe, expect, it } from "vitest";

import {
  requestWorkflowLibrary,
  subscribeWorkflowLibrary,
} from "@/lib/dashboard/workflow-library-request";

describe("workflow library request", () => {
  it("tells a mounted canvas to show the list", () => {
    let calls = 0;
    const unsubscribe = subscribeWorkflowLibrary(() => {
      calls += 1;
    });
    requestWorkflowLibrary();
    requestWorkflowLibrary();
    unsubscribe();
    requestWorkflowLibrary();
    expect(calls).toBe(2);
  });
});
