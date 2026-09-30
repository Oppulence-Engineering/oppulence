import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(import.meta.dirname, "app-settings.tsx"), "utf8");

describe("SettingsView", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function SettingsView");
  });

  it("uses workspace words for access and help", () => {
    expect(source).toContain("Standard workspace access");
    expect(source).toContain("shared companies, people, and evidence");
    expect(source).toContain("from entering this workspace.");
    expect(source).toContain("where the product should go next.");
    expect(source).toContain("Review the Oppulence API reference.");
    expect(source).not.toContain("Standard relationship access");
    expect(source).not.toContain("relationship model");
    expect(source).not.toContain("relationship intelligence");
    expect(source).not.toContain("Relationship API");
    expect(source).not.toContain("Cloud relationship engine");
    expect(source).not.toContain("/api/rowboat/v1/relationships");
    expect(source).not.toContain("window.location.reload()");
    expect(source).toContain('fetch("/readyz"');
    expect(source).toContain("Check again");
  });
});
