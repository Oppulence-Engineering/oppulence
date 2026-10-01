import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(import.meta.dirname, "revenue-panel.tsx"), "utf8");

describe("RevenuePanel", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function RevenuePanel");
  });

  it("names a failed commitments load without the internal queue name", () => {
    expect(source).toContain('"Could not load commitments."');
    expect(source).not.toContain("Commitment Queue");
  });

  it("opens the home overdue count as its own slice", () => {
    expect(source).toContain("subscribeDueCommitments");
    expect(source).toContain("overdueOnly={Boolean(overdueBefore)}");
    expect(source).toContain("dueBefore: overdueBefore ?? \"\"");
  });
});
