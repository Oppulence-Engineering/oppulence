import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(import.meta.dirname, "audit-sheet.tsx"), "utf8");

describe("ActionAuditSheet", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function ActionAuditSheet");
  });

  it("names a proposal status the same way the approval queue does", () => {
    expect(source).toContain("actionStatusLabel(p.status)");
    expect(source).toContain("{actionKindLabel(p.kind)}");
    expect(source).not.toContain(">{p.kind}<");
    expect(source).toContain(
      'setError(friendlyRevenueError(errMessage(e, "Could not load the audit trail.")))',
    );
    expect(source).not.toContain('p.status.replace(/_/g, " ")');
    expect(source).not.toContain("Executed Unconfirmed");
  });
});
