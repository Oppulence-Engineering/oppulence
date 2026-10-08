import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  digestFailureCopy,
  digestRefreshCopy,
  impactEmptyBody,
  impactRefreshCopy,
  digestLoopCopy,
  digestPreviewBadge,
  digestSignalLabel,
  recordedPromisePrefix,
  impactAccountTotal,
  funnelBarPercent,
  impactExposureTitle,
  longestOverdueCopy,
  statReadsAsGood,
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
    expect(source).toContain('digestSignalLabel(a.detector ?? "")');
    expect(source).toContain("priorityTone(a.priority ?? 0).label");
    expect(source).not.toContain("{a.priority}");
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
    expect(impactEmptyBody({ needsConnect: false, needsReconnect: true })).toBe(
      "Reconnect Google. Replies, meetings, and wins show up here after an audit.",
    );
    expect(impactEmptyBody({ needsConnect: true, needsReconnect: false })).toContain(
      "Connect Gmail and Calendar.",
    );
    expect(impactEmptyBody({ needsConnect: false, needsReconnect: false })).toContain(
      "Run an audit",
    );
    expect(recordedPromisePrefix(0)).toBe("");
    expect(recordedPromisePrefix(1)).toBe("1 promise is already in Commitments. ");
    expect(recordedPromisePrefix(2, true)).toBe("2+ promises are already in Commitments. ");
    expect(
      impactEmptyBody({ needsConnect: true, needsReconnect: false, knownPromiseCount: 1 }),
    ).toBe(
      "1 promise is already in Commitments. Connect Gmail and Calendar. Replies, meetings, and wins show up here after an audit.",
    );
    expect(digestPreviewBadge()).toBe("Preview of open loops");
    expect(source).toContain("digestPreviewBadge()");
    expect(source).toContain("knownPromiseCount");
    expect(source).not.toContain("emailed while you have open loops");
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

  it("reserves missed communication for a promise that is past due", () => {
    expect(impactExposureTitle(0)).toBe("What is putting these companies at risk now");
    expect(impactExposureTitle(1)).toBe("What missed communication is putting at risk now");
    expect(impactExposureTitle(Number.NaN)).toBe("What is putting these companies at risk now");
    expect(source).toContain("impactExposureTitle(data.overdueCommitments)");
  });

  it("keeps a zero or an unknown rate in the normal color", () => {
    expect(statReadsAsGood(0)).toBe(false);
    expect(statReadsAsGood(2)).toBe(true);
    expect(statReadsAsGood("—")).toBe(false);
    expect(statReadsAsGood("0%")).toBe(false);
    expect(statReadsAsGood("40%")).toBe(true);
    expect(source).toContain("statReadsAsGood(value)");
  });

  it("leaves a zero funnel count empty and keeps a small count visible", () => {
    expect(funnelBarPercent(0, 1)).toBe(0);
    expect(funnelBarPercent(0, 8)).toBe(0);
    expect(funnelBarPercent(1, 1)).toBe(100);
    expect(funnelBarPercent(1, 100)).toBe(2);
    expect(funnelBarPercent(50, 100)).toBe(50);
    expect(source).toContain("funnelBarPercent(f.value, maxFunnel)");
    expect(source).not.toContain("Math.max(2, (f.value / maxFunnel) * 100)");
  });

  it("says there is no longest overdue when nothing is past due", () => {
    expect(longestOverdueCopy(0)).toBe("None");
    expect(longestOverdueCopy(1)).toBe("1 day");
    expect(longestOverdueCopy(3)).toBe("3 days");
    expect(longestOverdueCopy(Number.NaN)).toBe("None");
    expect(source).toContain("longestOverdueCopy(data.longestOverdueDays)");
    expect(source).not.toContain('suffix=" days"');
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

  it("names who a digest loop is for", () => {
    expect(
      digestLoopCopy({
        recipient: "buyer@quay.example",
        reason: "You confirmed this follow-up from the meeting.",
      }),
    ).toBe("buyer@quay.example. You confirmed this follow-up from the meeting.");
    expect(digestLoopCopy({ recipient: "  ", reason: "Waiting on a reply." })).toBe(
      "a contact. Waiting on a reply.",
    );
    expect(
      digestLoopCopy({
        recipient: "ada@acme.example",
        reason: "You confirmed this follow-up from source evidence meeting/abc.",
      }),
    ).toBe("ada@acme.example. You confirmed this follow-up from the meeting.");
    expect(digestLoopCopy({ recipient: "ada@acme.example", reason: "" })).toBe("ada@acme.example");
    expect(source).toContain("digestLoopCopy(a)");
    expect(source).not.toContain("{a.reason}");
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
