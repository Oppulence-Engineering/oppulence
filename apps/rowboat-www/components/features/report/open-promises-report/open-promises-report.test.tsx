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
    expect(source).toContain("that still look open");
    expect(source).toContain("See the message each promise came from");
    expect(source).not.toContain("See exact message evidence");
    expect(source).toContain("Open commitments");
    expect(source).not.toContain("Open the register");
    expect(source).not.toContain("complete ledger");
    expect(source).not.toContain("no evidence of fulfillment");
    expect(source).not.toContain("fulfilment");
  });
});
