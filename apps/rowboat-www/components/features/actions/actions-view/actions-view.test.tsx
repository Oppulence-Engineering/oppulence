import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  approvalListFailureCopy,
  approvalRefreshFailureCopy,
} from "@/components/features/actions/actions-view/actions-view";

const source = fs.readFileSync(path.join(import.meta.dirname, "actions-view.tsx"), "utf8");

describe("ActionsView", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function ActionsView");
  });

  it("describes approvals without implementation tokens", () => {
    expect(source).toContain("Actions an agent proposes wait here. Nothing happens until you approve one.");
    expect(source).not.toContain("Finance actions");
    expect(source).not.toContain("every finance action");
    expect(source).toContain("Actions an agent wants to take");
    expect(approvalListFailureCopy()).toBe("Agent approvals could not load. Try again.");
    expect(approvalRefreshFailureCopy()).toBe("Could not refresh agent approvals. Try again.");
    expect(source).toContain("proposalsQuery.isError && !unavailable && proposals.length === 0");
    expect(source).toContain("setError(approvalRefreshFailureCopy())");
    expect(source).toContain("unavailable || shown === 0");
    expect(source).toContain("approvalListFailureCopy()");
    expect(source).toContain("Nothing happens until you approve");
    expect(source).toContain("Approve and run");
    expect(source).not.toContain("Agent proposals");
    expect(source).not.toContain("anything executes");
    expect(source).not.toContain("Approve & execute");
    expect(source).toContain("this action cannot run yet");
    expect(source).not.toContain("actionFailure(proposalsQuery.error");
    expect(source).toContain("actionFailure(e, \"Could not approve the action.\")");
    expect(source).toContain("actionFailure(e, \"Execution failed.\")");
    expect(source).toContain("actionFailure(e, \"Could not reject the action.\")");
    expect(source).toContain("return friendlyRevenueError(errMessage(error, fallback))");
    expect(source).toContain("actionStatusLabel(status)");
    expect(source).not.toContain("scoped token");
    expect(source).not.toContain("Act seam");
    expect(source).not.toContain("Closed-loop");
  });
});
