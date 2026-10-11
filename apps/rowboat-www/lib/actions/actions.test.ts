import { describe, expect, it } from "vitest";

import { actionFailureReasonCopy, actionStatusLabel } from "@/lib/actions/actions";

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

  it("hides an act-seam payload when an action fails", () => {
    expect(
      actionFailureReasonCopy(
        'actions: execution outcome is ambiguous: act seam returned 500: {"error":"boom"}',
      ),
    ).toBe("This action may already have run. Check it before trying again.");
    expect(actionFailureReasonCopy("actions: act seam returned 400: missing target")).toBe(
      "This action could not run. Try again.",
    );
    expect(actionFailureReasonCopy("The customer asked to wait.")).toBe(
      "The customer asked to wait.",
    );
    expect(actionFailureReasonCopy("")).toBe("");
  });
});
