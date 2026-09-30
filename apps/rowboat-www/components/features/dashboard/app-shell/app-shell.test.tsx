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
  });

  it("describes permissions and security without authorization jargon", () => {
    expect(source).toContain("Who you are and what this session can do.");
    expect(source).toContain("Review this session and what it can open.");
    expect(source).not.toContain("authorized workspace resources");
    expect(source).not.toContain("authorized evidence access");
  });
});
