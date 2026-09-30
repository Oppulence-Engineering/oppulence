import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(import.meta.dirname, "shared.tsx"), "utf8");

describe("WorkspaceEmptyState", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function WorkspaceEmptyState");
  });

  it("does not invent help articles when a surface forgets a learn-more list", () => {
    expect(source).toContain("learnMore = []");
    expect(source).not.toContain("Introduction to tasks");
    expect(source).not.toContain("Notes, Tasks, and Email sending");
    expect(source).toContain("What to expect");
    expect(source).not.toContain("Learn more");
  });
});
