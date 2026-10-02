import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { dismissReasonLabel, snoozeWakeCopy } from "@/lib/revenue/revenue";
import {
  recoveryEmptyDescription,
  recoveryFilterName,
  recoveryFollowUpName,
  recoveryCompanyName,
  recoveryRemainderLabel,
  recoveryShownLabel,
  recoveryStatusLabel,
  newActionIntro,
} from "@/components/features/revenue/queue-view/queue-view";

const source = fs.readFileSync(path.join(import.meta.dirname, "queue-view.tsx"), "utf8");

describe("QueueView", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function QueueView");
    expect(source).toContain("recoveryQueueActions(recoveryRows)");
    expect(source).toContain('useRevenueActions(filter, ACTION_QUEUE_PAGE, "recovery")');
    expect(source).toContain("actionPageHasMore");
    expect(source).toContain("recoveryPage.length + extraActions.length");
    expect(source).not.toContain("loadedRecoveryCount.current");
    expect(source).not.toContain("=== ACTION_QUEUE_PAGE");
    expect(source).not.toContain("ListFilter");
    expect(recoveryFilterName("open")).toBe("Recovery, Open");
    expect(recoveryFilterName("snoozed")).toBe("Recovery, Snoozed");
    expect(source).toContain("aria-label={recoveryFilterName(filter)}");
    expect(source).toContain("aria-label={recoveryCompanyName(");
    expect(source).toContain("value={relationshipId || undefined}");
    expect(source).not.toContain("relationships[0]");
    expect(source).toContain("aria-label={recoveryFollowUpName(actionType)}");
    expect(recoveryCompanyName("Dogfood Harbor")).toBe("Company, Dogfood Harbor");
    expect(recoveryCompanyName("Choose a company")).toBe("Company, Choose a company");
    expect(recoveryFollowUpName("warm_follow_up")).toBe("Follow-up, Warm follow-up");
    expect(source).not.toContain('aria-label="Filter recovery actions"');
  });

  it("points an empty workspace at Companies and names the action", () => {
    expect(source).toContain("{newActionIntro(relationships.length > 0 || hasMoreCompanies)}");
    expect(newActionIntro(true)).toBe(
      "Add a follow-up for a company already in this workspace.",
    );
    expect(newActionIntro(false)).toBe("Add a company before a follow-up can be created.");
    expect(source).not.toContain("manual follow-up");
    expect(source).toContain("No companies yet. Add one in Companies, or run an audit to find them.");
    expect(source).toContain("Add a company");
    expect(source).toContain("onOpenCompanies");
    expect(source).toContain("openCompanyCreate(onOpenCompanies)");
    expect(source).not.toContain("Relationships tab");
    expect(source).toContain("ACTION_TYPE_LABELS[t]");
    expect(source).toContain('record.kind === "person"');
    expect(source).toContain('errMessage(relationshipsQuery.error, "Could not load companies.")');
    expect(source).not.toContain("Could not load relationships.");
    expect(source).toContain('errMessage(actionsQuery.error, "Could not load recovery.")');
    expect(source).not.toContain("Could not load the queue.");
    expect(recoveryShownLabel(0)).toBeNull();
    expect(recoveryShownLabel(1)).toBe("1 shown");
    expect(recoveryShownLabel(4)).toBe("4 shown");
    expect(recoveryShownLabel(100, true)).toBe("100+ shown");
    expect(recoveryShownLabel(101, false)).toBe("101 shown");
    expect(recoveryRemainderLabel()).toBe("Show the next follow-ups");
    expect(recoveryEmptyDescription("all")).toBe("No recovery drafts right now.");
    expect(recoveryEmptyDescription("snoozed")).toBe("Nothing is snoozed right now.");
    expect(recoveryEmptyDescription("handled")).toBe("Nothing has been handled yet.");
    expect(recoveryEmptyDescription("dismissed")).toBe("Nothing has been dismissed.");
    expect(recoveryStatusLabel("open")).toBe("Held");
    expect(recoveryStatusLabel("snoozed")).toBe("Snoozed");
    expect(recoveryStatusLabel("handled")).toBe("Handled");
    expect(recoveryStatusLabel("dismissed")).toBe("Dismissed");
    expect(source).toContain("recoveryStatusLabel(action.queueStatus)");
    expect(source).not.toContain('open ? "Held" : action.queueStatus');
    expect(source).toContain("recoveryEmptyDescription(filter)");
    expect(source).not.toContain("Nothing in the ${filter}");
    expect(source).toContain("Run Promise Leak Audit");
    expect(source).not.toContain("Run audit</>");
    expect(source).toContain("or draft recovery from a promise.");
    expect(source).toContain('{ label: "Draft from a confirmed promise" }');
    expect(source).not.toContain("from a commitment");
    expect(source).not.toContain("confirmed commitments");
    expect(source).toContain('placeholder="Why this follow-up is needed"');
    expect(source).not.toContain("Why now? (reason)");
    expect(dismissReasonLabel("resolved_by_new_evidence")).toBe("Newer evidence arrived");
    expect(dismissReasonLabel("not_relevant")).toBe("Not relevant");
    expect(dismissReasonLabel("already handled by hand")).toBe("already handled by hand");
    expect(snoozeWakeCopy("")).toBe("");
    expect(snoozeWakeCopy(new Date(Date.now() - 2 * 86_400_000).toISOString())).toMatch(
      /^Snooze ended \d+ days ago\.$/,
    );
    expect(snoozeWakeCopy(new Date(Date.now() + 7 * 86_400_000).toISOString())).toMatch(
      /^Comes back \d+ days from now\.$/,
    );
    expect(source).toContain("dismissReasonLabel(action.dismissReason)");
    expect(source).toContain("snoozeWakeCopy(action.snoozedUntil)");
    expect(source).not.toContain("{action.dismissReason}");
  });
});
