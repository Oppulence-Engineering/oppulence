import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  outcomeKindLabel,
  outcomeSourceLabel,
  policyReasonLabel,
  policySnapshotLines,
  revisionActionLabel,
  revisionChannelLabel,
} from "@/components/features/revenue/audit-sheet/audit-sheet";
import { MANUAL_OUTCOMES } from "@/lib/revenue/revenue";

const source = fs.readFileSync(path.join(import.meta.dirname, "audit-sheet.tsx"), "utf8");

describe("AuditSheet", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function AuditSheet");
  });

  it("names an outcome and where it was seen", () => {
    expect(outcomeKindLabel("deal_advanced")).toBe("Deal moved forward");
    expect(outcomeKindLabel("onboarding_progressed")).toBe("Onboarding moved forward");
    expect(outcomeKindLabel("replied")).toBe("They replied");
    expect(outcomeKindLabel("sent")).toBe("Message sent");
    expect(outcomeKindLabel("bad_recommendation")).toBe("Not a good suggestion");
    expect(outcomeKindLabel("churned")).toBe("They left");
    expect(MANUAL_OUTCOMES.find((item) => item.value === "replied")?.label).toBe("They replied");
    expect(MANUAL_OUTCOMES.find((item) => item.value === "bad_recommendation")?.label).toBe(
      "Not a good suggestion",
    );
    expect(outcomeSourceLabel("user")).toBe("Logged by you");
    expect(outcomeSourceLabel("gmail")).toBe("Gmail");
    expect(outcomeSourceLabel("outbound")).toBe("Sent from here");
    expect(source).toContain("outcomeKindLabel(o.kind)");
    expect(source).toContain("outcomeSourceLabel(o.source)");
    expect(source).not.toContain("{o.source}");
    expect(source).not.toContain("OUTCOME_LABELS[o.kind] ?? o.kind");
  });

  it("names a revision action and channel", () => {
    expect(revisionActionLabel("warm_follow_up")).toBe("Warm follow-up");
    expect(revisionActionLabel("crm_update")).toBe("CRM update");
    expect(revisionChannelLabel("email")).toBe("Email");
    expect(revisionChannelLabel("crm_task")).toBe("CRM task");
    expect(revisionChannelLabel("calendar")).toBe("Calendar");
    expect(source).toContain("revisionActionLabel(r.actionType)");
    expect(source).toContain("revisionChannelLabel(r.channel)");
    expect(source).not.toContain("{r.actionType}");
    expect(source).not.toContain("{r.channel}");
  });

  it("names a policy reason instead of the facade code", () => {
    expect(policyReasonLabel("suppression.opted_out")).toBe("This person opted out");
    expect(policyReasonLabel("verification.mailbox_mismatch")).toBe(
      "Verification Mailbox Mismatch",
    );
    expect(
      policySnapshotLines({
        status: "passed",
        mailbox: "avery@acme.com",
        checkedAt: "2026-07-12T12:00:00Z",
      }),
    ).toEqual([
      "Status: Cleared",
      "Mailbox: avery@acme.com",
      "Checked At: 2026-07-12T12:00:00Z",
    ]);
    expect(policySnapshotLines({ reason: "review_required", optedOut: false })).toEqual([
      "Reason: Review required",
      "Opted Out: No",
    ]);
    expect(policySnapshotLines({ note: "  ", skipped: null })).toEqual([]);
    expect(source).toContain("policySnapshotLines(value)");
    expect(source).not.toContain("JSON.stringify(v, null, 2)");
    expect(source).toContain("policyReasonLabel(code)");
    expect(source).not.toContain("font-mono text-[10px]");
    expect(source).toContain("setSheetError(message)");
    expect(source).toContain('errMessage(e, "Could not load the history.")');
    expect(source).toContain('errMessage(e, "Could not record the outcome.")');
  });
});
