import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { reportSourceQuote } from "./open-promises-report";

const source = fs.readFileSync(path.join(import.meta.dirname, "open-promises-report.tsx"), "utf8");

describe("OpenPromisesReportClient", () => {
  it("keeps a source sentence when the stored excerpt is blank", () => {
    expect(reportSourceQuote("   ")).toBe("");
    expect(reportSourceQuote("  I'll send the harbor note.  ")).toBe(
      "I'll send the harbor note.",
    );
    expect(source).toContain("reportSourceQuote(item.sourceQuote)");
    expect(source).not.toContain("{item.sourceQuote}");
  });

  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function OpenPromisesReportClient");
  });

  it("waits for a settled source list before painting the connect step", () => {
    expect(source).toContain("sourcesQuery.isPending || (!scanId && scansQuery.isPending)");
    expect(source).not.toContain("sourcesQuery.isLoading || (!scanId && scansQuery.isLoading)");
    expect(source).toContain(
      'title={reconnect ? "Reconnect Google" : "Connect Gmail and Calendar"}',
    );
    expect(source).toContain('title="Find promises in your mail"');
    expect(source).not.toContain('title="Open promises"');
    expect(source).toContain("See the message each promise came from");
    expect(source).not.toContain("See exact message evidence");
    expect(source).toContain("Open commitments");
    expect(source).not.toContain("Open the register");
    expect(source).not.toContain("complete ledger");
    expect(source).not.toContain("no evidence of fulfillment");
    expect(source).toContain("The first read has not started yet.");
    expect(source).toContain("auditFailureCopy(reason)");
    expect(source).toContain('shownRequestError(e, "Could not start the scan.")');
    expect(source).toContain(
      'shownRequestError(error, "Google authorization could not be started.")',
    );
    expect(source).toContain(
      'shownRequestError(error, "The report could not be downloaded.")',
    );
    expect(source).toContain(
      'shownRequestError(reportQuery.error, "The report could not load. Try again.")',
    );
    expect(source).not.toContain('{reason || "No reason was recorded."}');
    expect(source).toContain("conversations read.");
    expect(source).not.toContain("evidence records");
    expect(source).not.toContain("evidence backfill");
    expect(source).not.toContain("Syncing Google evidence");
    expect(source).not.toContain("fulfilment");
  });

  it("names a past audit in the picker", () => {
    expect(source).toContain("auditHistoryLabel(scan.status)");
    expect(source).toContain("Show earlier audits");
    expect(source).toContain("earlierAuditsError");
    expect(source).not.toContain('scan.status === "completed" ? "Completed" : scan.status');
  });

  it("names a mutual promise as shared", () => {
    expect(source).toContain("{promiseDirectionLabel(item.direction)}");
    expect(source).toContain('Stat label="We both promised"');
    expect(source).not.toContain(
      'item.direction === "promised_by_them" ? "they owe us" : "we owe them"',
    );
  });

  it("prints a promise due date on the reader's calendar", () => {
    expect(source).toContain("{promiseDueLabel(item.dueAt)}");
    expect(source).not.toContain("item.dueAt.slice(0, 10)");
  });
});
