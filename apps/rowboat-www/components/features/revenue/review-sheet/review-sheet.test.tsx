import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  executionFailureCopy,
  reconciliationErrorCopy,
  reconciliationStatusLabel,
} from "@/components/features/revenue/review-sheet/review-sheet";

const source = fs.readFileSync(path.join(import.meta.dirname, "review-sheet.tsx"), "utf8");

describe("ReviewSheet", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function ReviewSheet");
  });

  it("names an uncertain provider check", () => {
    expect(reconciliationStatusLabel("manual_review")).toBe("This needs a person to check it.");
    expect(reconciliationStatusLabel("not_found")).toBe("The provider has no record of this send.");
    expect(reconciliationStatusLabel("pending")).toBe("Still checking with the provider.");
    expect(
      reconciliationErrorCopy("provider marker was not found after bounded reconciliation attempts"),
    ).toBe("");
    expect(reconciliationErrorCopy("execution idempotency key is missing")).toBe(
      "This send has no receipt to check.",
    );
    expect(source).toContain("reconciliationStatusLabel(action.reconciliationStatus)");
    expect(source).not.toContain("{action.reconciliationStatus");
  });

  it("names why the last send attempt stopped", () => {
    expect(executionFailureCopy("revenue: google is not connected for the assigned user")).toBe(
      "Connect Google for the person who will send this, then try again.",
    );
    expect(executionFailureCopy("revenue: action has no proposed message")).toBe(
      "Write the message before sending.",
    );
    expect(executionFailureCopy("gmail returned 403")).toBe(
      "Google refused this send. Reconnect Gmail, then try again.",
    );
    expect(executionFailureCopy("revenue: something unexpected happened")).toBe(
      "The last attempt did not send. Fix the draft, then try again.",
    );
    expect(executionFailureCopy("")).toBe("");
    expect(source).toContain("executionFailureCopy(action.executionError)");
    expect(source).toContain("The last attempt did not send");
    expect(source).not.toContain("{action.executionError}");
  });

  it("names a dismissal and a snooze on the review sheet", () => {
    expect(source).toContain("dismissReasonLabel(action.dismissReason)");
    expect(source).toContain("snoozeWakeCopy(action.snoozedUntil)");
    expect(source).toContain("<AlertTitle>Dismissed</AlertTitle>");
    expect(source).toContain("setActionError(message)");
    expect(source).toContain('errMessage(e, "Could not load the original email.")');
  });
});
