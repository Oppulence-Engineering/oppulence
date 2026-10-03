import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  auditEmptyDescription,
  auditListFailureCopy,
  auditRefreshCopy,
} from "@/components/features/revenue/scans-view/scans-view";

const source = fs.readFileSync(path.join(import.meta.dirname, "scans-view.tsx"), "utf8");

describe("ScansView", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function ScansView");
    expect(source).toContain(">Companies</TableHead>");
    expect(source).not.toContain(">Relationships</TableHead>");
    expect(source).toContain(">Conversations</TableHead>");
    expect(source).toContain(">Follow-up signals</TableHead>");
    expect(source).toContain("examinedConversationCount(scan)");
    expect(source).not.toContain(">Threads</TableHead>");
    expect(source).not.toContain(">Candidates</TableHead>");
    expect(source).toContain("follow-ups that have gone quiet");
    expect(source).toContain("to find promises in your mail.");
    expect(source).toContain("Run Promise Leak Audit");
    expect(source).not.toContain("> Run audit");
    expect(source).not.toContain("stalled client");
    expect(source).not.toContain("commitment register");
    expect(source).toContain("Reads the mail you connect");
    expect(source).toContain("Nothing is sent without approval");
    expect(source).toContain("auditFailureCopy(scan.error)");
    expect(source).not.toContain("{scan.error}");
    expect(auditListFailureCopy()).toBe("Audits could not load. Try again.");
    expect(auditRefreshCopy()).toBe("Could not refresh audits. Try again.");
    expect(auditEmptyDescription({ needsConnect: false, needsReconnect: true })).toBe(
      "Reconnect Google before an audit can read your mail.",
    );
    expect(auditEmptyDescription({ needsConnect: true, needsReconnect: false })).toBe(
      "Connect Gmail and Calendar before an audit can read your mail.",
    );
    expect(auditEmptyDescription({ needsConnect: false, needsReconnect: false })).toBe(
      "No audits yet! Run your first audit to find promises in your mail.",
    );
    expect(auditEmptyDescription({ needsConnect: true, needsReconnect: true })).not.toMatch(
      /Run your first audit/,
    );
    expect(source).toContain("loadFailed && rows.length === 0");
    expect(source).toContain("refreshFailed");
    expect(source).toContain("auditListFailureCopy()");
    expect(source).toContain("Show earlier audits");
    expect(source).toContain("earlierAuditsError");
    expect(source).not.toContain("Promise Leak Audit explained");
    expect(source).not.toContain("How evidence becomes commitments");
  });
});
