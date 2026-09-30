import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(import.meta.dirname, "open-promises-report.tsx"), "utf8");

describe("OpenPromisesReportClient", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function OpenPromisesReportClient");
  });

  it("waits for a settled source list before painting the connect step", () => {
    expect(source).toContain(
      "sourcesQuery.isPending || (!scanId && scansQuery.isPending)",
    );
    expect(source).not.toContain("sourcesQuery.isLoading || (!scanId && scansQuery.isLoading)");
    expect(source).toContain('title={reconnect ? "Reconnect Google" : "Connect Gmail and Calendar"}');
    expect(source).toContain('title="Find promises in your mail"');
    expect(source).not.toContain('title="Open promises"');
    expect(source).toContain("See the message each promise came from");
    expect(source).not.toContain("See exact message evidence");
    expect(source).toContain("Open commitments");
    expect(source).not.toContain("Open the register");
    expect(source).not.toContain("complete ledger");
    expect(source).not.toContain("no evidence of fulfillment");
    expect(source).toContain("The first read has not started yet.");
    expect(source).toContain("conversations read.");
    expect(source).not.toContain("evidence records");
    expect(source).not.toContain("evidence backfill");
    expect(source).not.toContain("Syncing Google evidence");
    expect(source).not.toContain("fulfilment");
  });

  it("prints a promise due date on the reader's calendar", () => {
    expect(source).toContain("{promiseDueLabel(item.dueAt)}");
    expect(source).not.toContain("item.dueAt.slice(0, 10)");
  });
});
