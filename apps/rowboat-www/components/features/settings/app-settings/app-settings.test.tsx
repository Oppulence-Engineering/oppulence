import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { sessionWorkspaceCopy } from "@/components/features/settings/app-settings/app-settings";

const source = fs.readFileSync(path.join(import.meta.dirname, "app-settings.tsx"), "utf8");

describe("SettingsView", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function SettingsView");
  });

  it("uses workspace words for access and help", () => {
    expect(source).toContain("Review who you are and what this session can do.");
    expect(source).not.toContain("what this session can reach");
    expect(source).toContain("Standard workspace access");
    expect(source).toContain("shared companies, people, and their details");
    expect(source).not.toContain("shared companies, people, and evidence");
    expect(source).toContain("Oppulence Cloud serves companies, people, and promises for this organization.");
    expect(source).toContain("Companies, people, and promises for the signed-in organization.");
    expect(source).not.toContain("and evidence for this organization");
    expect(source).not.toContain("and evidence for the signed-in organization");
    expect(source).toContain("from entering this workspace.");
    expect(source).toContain('title="Service access"');
    expect(source.replace(/\s+/g, " ")).toContain(
      "stops new mail and calendar updates from entering this workspace.",
    );
    expect(source).not.toContain('title="Evidence access"');
    expect(source).not.toContain("stops new evidence");
    expect(source).toContain("where the product should go next.");
    expect(source).toContain("Review the Oppulence API reference.");
    expect(source).toContain("or review the API reference.");
    expect(source).not.toContain("product documentation");
    expect(source).not.toContain("Standard relationship access");
    expect(source).not.toContain("relationship model");
    expect(source).not.toContain("relationship intelligence");
    expect(source).not.toContain("Relationship API");
    expect(source).not.toContain("Cloud relationship engine");
    expect(source).not.toContain("/api/rowboat/v1/relationships");
    expect(source).not.toContain("window.location.reload()");
    expect(source).toContain("from Connections.");
    expect(source).not.toContain("from Extensions");
    expect(source).not.toContain("your Oppulence organization");
    expect(source).toContain("No organization is attached to this session.");
    expect(source).toContain("What you can do");
    expect(source).toContain('title="Workspace"');
    expect(source).toContain("Review who is signed in and what this session can open.");
    expect(source).toContain("Oppulence only uses what connected services return.");
    expect(source).toContain("if (!organizationId) return null");
    expect(source).toContain(">Signed in</SettingsStatus>");
    expect(source).not.toContain(">Authorized</SettingsStatus>");
    expect(source).not.toContain('title="Authorized workspace"');
    expect(source).not.toContain("Effective permissions");
    expect(source).not.toContain("authorized services");
    expect(source).toContain('empty="Member"');
    expect(source).toContain('fetch("/readyz"');
    expect(source).toContain("Check again");
    expect(source).toContain("Browser address");
    expect(source).toContain("Where this Oppulence tab is open.");
    expect(source).not.toContain("Signed-in address");
    expect(source).toContain("This session has no organization. Access stays with the signed-in account.");
    expect(source).toContain("Connections you add here stay with this signed-in account.");
    expect(source).toContain("useSyncExternalStore");
    expect(source).not.toContain("Organization server");
    expect(source).not.toContain(">Default</SettingsStatus>");
    expect(source).toContain("readBrowserOrigin");
    expect(source).toContain("return window.location.origin");
    expect(source).toContain("How you appear in Oppulence across signed-in devices.");
    expect(source).toContain("the next time you start a chat.");
    expect(source).toContain('title="Chat defaults"');
    expect(source).toContain('title="Current plan"');
    expect(source).toContain("Activity counted in the current billing period.");
    expect(source).not.toContain("the next time you open Oppulence.");
    expect(source).not.toContain("Metered activity");
    expect(source).not.toContain('title="Chat Defaults"');
    expect(source).not.toContain('title="Current Plan"');
    expect(source).toContain("How Oppulence looks on this device.");
    expect(source).toContain(
      "Choose what from mail and calendar can be shared, and which addresses stay private.",
    );
    expect(source).not.toContain("mailbox metadata defaults");
    expect(source).not.toContain("this console");
    expect(source).not.toContain("the console");
  });

  it("talks about an organization only when one is attached", () => {
    const attached = sessionWorkspaceCopy("org_123");
    expect(attached.security).toBe(
      "Workspace access is controlled by the signed-in Oppulence organization.",
    );
    expect(attached.cloudDetail).toBe(
      "Companies, people, and promises for the signed-in organization.",
    );
    expect(attached.connect).toBe("Use organization-approved connections across this workspace.");

    const personal = sessionWorkspaceCopy(undefined);
    expect(personal.security).toBe(
      "This session has no organization. Access stays with the signed-in account.",
    );
    expect(personal.permissions).toContain("stay with the signed-in account.");
    expect(personal.cloud).toContain("this signed-in account.");
    expect(personal.cloudDetail).toBe(
      "Companies, people, and promises for this signed-in account.",
    );
    expect(personal.connect).toBe("Connections you add here stay with this signed-in account.");
    expect(sessionWorkspaceCopy("  ").security).toBe(personal.security);
  });
});
