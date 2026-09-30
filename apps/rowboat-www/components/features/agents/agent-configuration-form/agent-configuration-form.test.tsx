import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(import.meta.dirname, "agent-configuration-form.tsx"),
  "utf8",
);
const tools = fs.readFileSync(
  path.join(import.meta.dirname, "../../../../lib/agents/agent-tools.ts"),
  "utf8",
);

describe("AgentConfigurationForm", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function AgentConfigurationForm");
  });

  it("offers workspace tools and hides developer surfaces until enabled", () => {
    expect(tools).toContain('label: "Read workspace memory"');
    expect(tools).toContain('label: "Create task"');
    expect(source).toContain("visibleTools(selectedTools)");
    expect(tools).toContain('"echo"');
    expect(tools).toContain('"conduit.read"');
    expect(source).not.toContain("Read relationship memory");
    expect(tools).not.toContain("Read relationship memory");
    expect(source).not.toContain("Create internal task");
    expect(tools).not.toContain("Create internal task");
  });
});
