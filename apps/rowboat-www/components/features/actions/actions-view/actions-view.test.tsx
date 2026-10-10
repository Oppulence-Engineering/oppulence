import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { actionKindLabel, actionParamsLines } from "@/lib/actions/actions";
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
    expect(source).toContain("proposalsQuery.isError && !unavailable && !approvalsLoaded");
    expect(source).toContain("setError(approvalRefreshFailureCopy())");
    expect(source).toContain("unavailable || !approvalsLoaded");
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
    expect(actionKindLabel("conduit.dunning.advance")).toBe("Advance dunning");
    expect(actionKindLabel("send_invoice")).toBe("Send Invoice");
    expect(actionKindLabel("")).toBe("Action");
    expect(actionParamsLines('{"amount":100,"step":2}')).toEqual(["Amount: 100", "Step: 2"]);
    expect(actionParamsLines("not json")).toEqual(["not json"]);
    expect(actionParamsLines("")).toEqual([]);
    expect(source).toContain("<Ref>{actionKindLabel(p.kind)}</Ref>");
    expect(source).not.toContain("<Ref>{p.kind}</Ref>");
    expect(source).toContain("actionParamsLines(p.paramsJson)");
    expect(source).not.toContain("JSON.stringify(JSON.parse(raw)");
    expect(source).not.toContain("scoped token");
    expect(source).not.toContain("Act seam");
    expect(source).not.toContain("Closed-loop");
  });
});
