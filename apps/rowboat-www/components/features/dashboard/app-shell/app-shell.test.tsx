import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(import.meta.dirname, "app-shell.tsx"), "utf8");

describe("AppShellSidebar", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function AppShellSidebar");
  });

  it("opens product help instead of the marketing blog", () => {
    expect(source).toContain('onOpenSettings?.("help")');
    expect(source).not.toContain('href="/blog"');
  });

  it("describes preferences as the controls that page actually has", () => {
    expect(source).toContain("Default agent and anonymous usage data.");
    expect(source).not.toContain("reasoning, notifications, privacy, and memory");
    expect(source).toContain("This workspace does not send browser or email notifications.");
    expect(source).not.toContain("Configure browser and workspace notification preferences.");
    expect(source).toContain("Theme and language are in Appearance.");
    expect(source).not.toContain("Tune product branding, navigation, and workspace layout.");
  });

  it("describes appearance as the controls that page actually has", () => {
    expect(source).toContain("Set the theme and the interface language.");
    expect(source).not.toContain("window preferences");
  });

  it("shows the current workspace without a click that does nothing", () => {
    expect(source).toContain("data-current-workspace");
    expect(source).not.toContain("onSelect={(event) => event.preventDefault()}");
  });

  it("opens security from the account menu instead of promising session management", () => {
    expect(source).toContain('onOpenSettings?.("security")');
    expect(source).not.toContain("Manage sessions");
  });

  it("describes permissions and security without authorization jargon", () => {
    expect(source).toContain("Who you are and what this session can do.");
    expect(source).toContain("Review this session and what it can open.");
    expect(source).not.toContain("authorized workspace resources");
    expect(source).not.toContain("authorized evidence access");
  });
});
