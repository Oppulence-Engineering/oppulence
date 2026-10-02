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
    expect(source).toContain("Shared organization connections are not a separate list yet.");
    expect(source).not.toContain("Manage organization-approved, shared cloud connections.");
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

  it("lets the closed sidebar collapse", () => {
    const theme = fs.readFileSync(
      path.join(import.meta.dirname, "../../../../app/(product)/product-sim-theme.css"),
      "utf8",
    );
    const rule = theme.slice(
      theme.indexOf('[data-slot="app-sidebar"]'),
      theme.indexOf("[data-sidebar-nav]"),
    );
    expect(source).toContain('open ? "w-[var(--shell-sidebar-width,252px)]" : "w-0 border-r-0"');
    expect(rule).not.toContain("width:");
  });

  it("offers the conversations past the first page of history", () => {
    expect(source).toContain("Show earlier conversations");
    expect(source).toContain("onLoadMoreSessions");
    expect(source).toContain("sessionsLoadError");
    expect(source).toContain("sessions.length === 0 && !sessionsLoadError");
    expect(source).toContain("onRetrySessions");
  });

  it("explains a failed sidebar load with the same sentences as the rest of the app", () => {
    expect(source).toContain('sidebarQueryError(sources.error, "Source status unavailable")');
    expect(source).toContain(
      'className="block whitespace-normal text-left text-[15px] font-normal leading-5"',
    );
    expect(source).toContain('sidebarQueryError(agentsQuery.error, "Could not load agents")');
    expect(source).toContain('sidebarQueryError(tasksQuery.error, "Could not load schedules")');
    expect(source).toContain('sidebarQueryError(runsQuery.error, "Could not load runs")');
    expect(source).not.toContain('label: "Source status unavailable"');
  });

  it("describes permissions and security without authorization jargon", () => {
    expect(source).toContain("Who you are and what this session can do.");
    expect(source).toContain("Review this session and what it can open.");
    expect(source).not.toContain("authorized workspace resources");
    expect(source).not.toContain("authorized evidence access");
  });
});
