import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(import.meta.dirname, "queue-view.tsx"), "utf8");

describe("QueueView", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function QueueView");
    expect(source).not.toContain("ListFilter");
    expect(source).toContain('aria-label="Filter recovery actions"');
  });

  it("points an empty workspace at Companies and names the action", () => {
    expect(source).toContain("No companies yet. Add one in Companies, or run an audit to find them.");
    expect(source).not.toContain("Relationships tab");
    expect(source).toContain("ACTION_TYPE_LABELS[t]");
    expect(source).toContain('errMessage(relationshipsQuery.error, "Could not load companies.")');
    expect(source).not.toContain("Could not load relationships.");
  });
});
