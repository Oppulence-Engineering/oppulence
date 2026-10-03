import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  digestFailureCopy,
  digestRefreshCopy,
  impactRefreshCopy,
  digestSignalLabel,
  impactAccountTotal,
  overdueDirectionLines,
} from "./impact-view";

const source = fs.readFileSync(path.join(import.meta.dirname, "impact-view.tsx"), "utf8");

describe("ImpactView", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function ImpactView");
    expect(source).toContain("Measure company risk");
    expect(source).toContain("Run Promise Leak Audit");
    expect(source).toContain("auditLaunchLabel");
    expect(source).toContain("needsConnect");
    expect(source).toContain("Company exposure");
    expect(source).toContain("At-risk companies of ${accountTotal}");
    expect(source).toContain("Critical companies");
    expect(source).toContain("Why companies are exposed");
    expect(source).toContain("each company contributes");
    expect(source).toContain("Updated from live company state");
    expect(source).toContain("not company behaviour.");
    expect(source).toContain("companies are exposed because a connected source");
    expect(source).not.toContain("At-risk accounts");
    expect(source).not.toContain("Critical accounts");
    expect(source).not.toContain("Why accounts are exposed");
    expect(source).not.toContain("each account contributes");
    expect(source).not.toContain("live account state");
    expect(source).not.toContain("not account behaviour");
    expect(source).toContain("No active company risks.");
    expect(source).toContain("attentionReasonLabel(risk.reason)");
    expect(source).toContain("attentionReasonLabel(d.detector)");
    expect(source).toContain("digestSignalLabel(a.detector)");
    expect(source).toContain("recoveryOpenCount(data.open, taskCount)");
    expect(source).toContain("data.openTasks");
    expect(source).toContain("data.atRiskRelationships");
    expect(source).not.toContain("atRiskPulseCount(");
    expect(source).not.toContain("recoveryPulseCount(");
    expect(source).toContain("digest?.top ?? []");
    expect(source).toContain("digestFailed && digestTop.length === 0");
    expect(digestFailureCopy()).toBe("The weekly digest could not load. Try again.");
    expect(digestRefreshCopy()).toBe("Could not refresh the weekly digest. Try again.");
    expect(impactRefreshCopy()).toBe("Could not refresh impact. Try again.");
    expect(source).toContain("if (!impactQuery.error || impactQuery.data) return;");
    expect(source).toContain("message={impactRefreshCopy()}");
    expect(source).toContain("digest?.openCount");
    expect(source).not.toContain("digestWithoutTasks(");
    expect(source).toContain("digestTop.map(");
    expect(source).toContain("riskReasons.map(");
    expect(source).not.toContain("digestTop.slice(0, 3)");
    expect(source).not.toContain("riskReasons.slice(0, 5)");
    expect(source).not.toContain("{a.detector}");
    expect(source).not.toContain("DETECTOR_LABELS[d.detector]");
    expect(source).not.toContain('risk.reason.replaceAll("_", " ")');
    expect(source).toContain("Your companies and people were not changed.");
    expect(source).not.toContain("Measure portfolio risk");
    expect(source).not.toContain("Relationship exposure");
    expect(source).not.toContain("No active relationship risks.");
    expect(source).not.toContain("underlying relationship records");
    expect(source).not.toContain("Promises missed");
  });

  it("calls an open past-due promise overdue, and keeps a mutual one in the total", () => {
    expect(
      overdueDirectionLines({ overdueCommitments: 1, overdueByUs: 1, overdueByThem: 0 }),
    ).toEqual([
      { label: "Overdue from us", value: 1 },
      { label: "Overdue from them", value: 0 },
    ]);
    expect(
      overdueDirectionLines({ overdueCommitments: 2, overdueByUs: 0, overdueByThem: 1 }),
    ).toEqual([
      { label: "Overdue from us", value: 0 },
      { label: "Overdue from them", value: 1 },
      { label: "Overdue together", value: 1 },
    ]);
  });

  it("names a digest signal that arrived as a stored token", () => {
    expect(digestSignalLabel("commitment_due")).toBe("Promise due");
    expect(digestSignalLabel("conversation_action_pack")).toBe("Conversation action pack");
    expect(digestSignalLabel("Follow-up due")).toBe("Follow-up due");
    expect(digestSignalLabel("manual")).toBe("Added by you");
    expect(digestSignalLabel("Manual")).toBe("Added by you");
    expect(digestSignalLabel("")).toBe("");
    expect(source).toContain(">Signal</TableHead>");
    expect(source).not.toContain(">Detector</TableHead>");
  });

  it("counts companies in the account total and leaves a person out", () => {
    expect(impactAccountTotal([{ kind: "company" }, { kind: "person" }], 2)).toBe("1");
    expect(impactAccountTotal(undefined, 2)).toBe("2");
    const page = Array.from({ length: 200 }, () => ({ kind: "company" }));
    expect(impactAccountTotal(page, 201, true)).toBe("200+");
    expect(impactAccountTotal(page, 201, false)).toBe("200");
    expect(source).toContain("relationshipPageHasMore(relationshipsQuery.data)");
  });
});
