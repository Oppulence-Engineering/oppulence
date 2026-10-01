import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { outcomeKindLabel, outcomeSourceLabel } from "@/components/features/revenue/audit-sheet/audit-sheet";

const source = fs.readFileSync(path.join(import.meta.dirname, "audit-sheet.tsx"), "utf8");

describe("AuditSheet", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function AuditSheet");
  });

  it("names an outcome and where it was seen", () => {
    expect(outcomeKindLabel("deal_advanced")).toBe("Deal moved forward");
    expect(outcomeKindLabel("onboarding_progressed")).toBe("Onboarding moved forward");
    expect(outcomeSourceLabel("user")).toBe("Logged by you");
    expect(outcomeSourceLabel("gmail")).toBe("Gmail");
    expect(outcomeSourceLabel("outbound")).toBe("Sent from here");
    expect(source).toContain("outcomeKindLabel(o.kind)");
    expect(source).toContain("outcomeSourceLabel(o.source)");
    expect(source).not.toContain("{o.source}");
    expect(source).not.toContain("OUTCOME_LABELS[o.kind] ?? o.kind");
  });
});
