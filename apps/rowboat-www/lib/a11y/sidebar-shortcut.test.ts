import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SIDEBAR_TOGGLE_KEY, sidebarShortcutTitle } from "@/lib/a11y/sidebar-shortcut";

describe("sidebar shortcut titles", () => {
  it("names the bare bracket key the shell listens for", () => {
    expect(SIDEBAR_TOGGLE_KEY).toBe("[");
    expect(sidebarShortcutTitle("Collapse sidebar")).toBe("Collapse sidebar [");
    expect(sidebarShortcutTitle("Toggle sidebar")).toBe("Toggle sidebar [");
    expect(sidebarShortcutTitle("Collapse sidebar")).not.toContain("[ ]");
  });

  it("uses that key on the edge, the header, and the command palette", () => {
    const edge = readFileSync(
      new URL(
        "../../components/features/dashboard/app-shell/app-shell.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const header = readFileSync(
      new URL(
        "../../components/features/dashboard/dashboard-shell/dashboard-shell.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const palette = readFileSync(
      new URL(
        "../../components/features/dashboard/command-palette/command-palette.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(edge).toContain('title={sidebarShortcutTitle("Collapse sidebar")}');
    expect(edge).not.toContain("Collapse sidebar  [ ]");
    expect(header).toContain('title={sidebarShortcutTitle("Toggle sidebar")}');
    expect(header).toContain("event.key === SIDEBAR_TOGGLE_KEY");
    expect(header).not.toContain('title="Toggle sidebar  ["');
    expect(palette).toContain("<CommandShortcut>{SIDEBAR_TOGGLE_KEY}</CommandShortcut>");
  });
});
