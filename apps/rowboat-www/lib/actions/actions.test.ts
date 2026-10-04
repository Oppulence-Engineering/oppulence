import { describe, expect, it } from "vitest";

import { actionStatusLabel } from "@/lib/actions/actions";

describe("actionStatusLabel", () => {
  it("names an unconfirmed execution the way the approval queue does", () => {
    expect(actionStatusLabel("executed_unconfirmed")).toBe("Executed · unconfirmed");
    expect(actionStatusLabel("pending")).toBe("Awaiting approval");
    expect(actionStatusLabel("approved")).toBe("Approved");
    expect(actionStatusLabel("executed")).toBe("Executed");
    expect(actionStatusLabel("rejected")).toBe("Rejected");
    expect(actionStatusLabel("failed")).toBe("Failed");
    expect(actionStatusLabel("expired")).toBe("Expired");
  });
});
