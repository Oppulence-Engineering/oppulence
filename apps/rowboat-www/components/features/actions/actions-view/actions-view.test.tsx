import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(import.meta.dirname, "actions-view.tsx"), "utf8");

describe("ActionsView", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function ActionsView");
  });

  it("describes approvals without implementation tokens", () => {
    expect(source).toContain("Nothing happens until you approve one.");
    expect(source).toContain("this action cannot run yet");
    expect(source).not.toContain("scoped token");
    expect(source).not.toContain("Act seam");
    expect(source).not.toContain("Closed-loop");
  });
});
