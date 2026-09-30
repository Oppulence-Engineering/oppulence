import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(import.meta.dirname, "scans-view.tsx"), "utf8");

describe("ScansView", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function ScansView");
    expect(source).toContain(">Companies</TableHead>");
    expect(source).not.toContain(">Relationships</TableHead>");
    expect(source).toContain("follow-ups that have gone quiet");
    expect(source).toContain("to find promises in your mail.");
    expect(source).not.toContain("stalled client");
    expect(source).not.toContain("commitment register");
    expect(source).toContain("Reads the mail you connect");
    expect(source).toContain("Nothing is sent without approval");
    expect(source).not.toContain("Promise Leak Audit explained");
    expect(source).not.toContain("How evidence becomes commitments");
  });
});
