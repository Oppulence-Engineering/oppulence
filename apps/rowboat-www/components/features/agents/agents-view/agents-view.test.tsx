import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(import.meta.dirname, "agents-view.tsx"), "utf8");

describe("AgentsView", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function AgentsView");
    expect(source).toContain("agentInstructionsCopy(selected)");
    expect(source).not.toContain("{selected.instructions");
    expect(source).toContain("adjust its model, tools, and limits.");
    expect(source).not.toContain("safeguards");
    expect(source).toContain(">Short name</Label>");
    expect(source).not.toMatch(/>\s*Instructions\s*</);
    expect(source).toMatch(/>\s*Purpose\s*</);
  });
});
