import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { recoveryShownLabel } from "@/components/features/revenue/queue-view/queue-view";

const source = fs.readFileSync(path.join(import.meta.dirname, "queue-view.tsx"), "utf8");

describe("QueueView", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function QueueView");
    expect(source).not.toContain("ListFilter");
    expect(source).toContain('aria-label="Filter recovery actions"');
  });

  it("points an empty workspace at Companies and names the action", () => {
    expect(source).toContain("Add a follow-up for a company already in this workspace.");
    expect(source).not.toContain("manual follow-up");
    expect(source).toContain("No companies yet. Add one in Companies, or run an audit to find them.");
    expect(source).toContain("Add a company");
    expect(source).toContain("onOpenCompanies");
    expect(source).not.toContain("Relationships tab");
    expect(source).toContain("ACTION_TYPE_LABELS[t]");
    expect(source).toContain('errMessage(relationshipsQuery.error, "Could not load companies.")');
    expect(source).not.toContain("Could not load relationships.");
    expect(source).toContain('errMessage(actionsQuery.error, "Could not load recovery.")');
    expect(source).not.toContain("Could not load the queue.");
    expect(recoveryShownLabel(0)).toBeNull();
    expect(recoveryShownLabel(1)).toBe("1 shown");
    expect(recoveryShownLabel(4)).toBe("4 shown");
    expect(source).toContain('placeholder="Why this follow-up is needed"');
    expect(source).not.toContain("Why now? (reason)");
  });
});
