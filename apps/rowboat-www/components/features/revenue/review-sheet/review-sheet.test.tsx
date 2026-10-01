import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
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
    expect(source).toContain("reconciliationStatusLabel(action.reconciliationStatus)");
    expect(source).not.toContain("{action.reconciliationStatus");
  });
});
