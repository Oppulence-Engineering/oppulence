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
  });
});
