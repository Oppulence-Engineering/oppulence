import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  displayNamePlaceholder,
  helpDestination,
  mailPrivacySectionCopy,
  preferenceFormIsHidden,
  preferenceRefreshCopy,
  sessionRoleCopy,
  serviceAccessDetail,
  sessionWorkspaceCopy,
} from "@/components/features/settings/app-settings/app-settings";

const source = fs.readFileSync(path.join(import.meta.dirname, "app-settings.tsx"), "utf8");

describe("display name placeholder", () => {
  it("does not name a sample person while the profile name is empty", () => {
    expect(displayNamePlaceholder(false)).toBe("Your name");
    expect(displayNamePlaceholder(true)).toBe("Loading…");
    expect(source).not.toContain("Ada Lovelace");
    expect(source).toContain("placeholder={displayNamePlaceholder(query.isLoading)}");
  });
});

describe("SettingsView", () => {
  it("keeps the named product export at the generator path", () => {
    expect(source).toContain("export function SettingsView");
    expect(source).toContain("<NotificationsSection onNavigate={onNavigate} />");
    expect(source).toContain("<CustomizationSection onNavigate={onNavigate} />");
    expect(source).not.toContain('section === "customization" ? <AppearanceSection />');
    expect(source).not.toContain("return <PreferencesSection />");
    expect(source).toContain('aria-label="Theme"');
    expect(source).toContain('comboboxFilterName("Interface language", "English")');
  });

  it("uses workspace words for access and help", () => {
    expect(source).toContain("Review who you are and what this session can do.");
    expect(source).not.toContain("what this session can reach");
    expect(source).toContain("Standard workspace access");
    expect(source).toContain("shared companies, people, and their details");
    expect(source).not.toContain("shared companies, people, and evidence");
    expect(source).toContain(
      "Oppulence Cloud serves companies, people, and promises for this organization.",
    );
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
    expect(source).toContain(
      "Report a problem, or tell us what is missing and where the product should go next.",
    );
    expect(helpDestination("mailto:hello@oppulence.io?subject=Oppulence%20feedback").target).toBe(
      "self",
    );
    expect(helpDestination("/api/reference").target).toBe("blank");
    expect(source).toContain("openHelpDestination(item.href)");
    expect(source).not.toContain('window.open(item.href, "_blank")');
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
    expect(source).toContain("<PermissionsSection onNavigate={onNavigate} session={session} />");
    expect(source).not.toContain("from Extensions");
    expect(source).not.toContain("your Oppulence organization");
    expect(source).toContain("No organization is attached to this session.");
    expect(source).toContain("What you can do");
    expect(source).toContain('title="Workspace"');
    expect(source).toContain("Review who is signed in and what this session can open.");
    expect(source.match(/>Signed in<\/p>/g)).toHaveLength(2);
    expect(source.match(/session\.user\.email\?\.trim\(\)/g)).toHaveLength(2);
    expect(source).toContain("No email is attached to this session.");
    expect(source).toContain("Oppulence only uses what connected services return.");
    expect(
      serviceAccessDetail({
        googleConnected: false,
        connectorConnected: 0,
        loading: false,
        failed: false,
      }),
    ).toEqual({
      label: "No services connected",
      detail:
        "Nothing is connected. Connect a service before mail or calendar updates can enter this workspace.",
    });
    expect(
      serviceAccessDetail({
        googleConnected: true,
        connectorConnected: 0,
        loading: false,
        failed: false,
      }).detail,
    ).toContain("Removing a connection stops new mail");
    expect(
      serviceAccessDetail({
        googleConnected: false,
        connectorConnected: 1,
        loading: false,
        failed: false,
      }).label,
    ).toBe("Connected services");
    expect(
      serviceAccessDetail({
        googleConnected: null,
        connectorConnected: null,
        loading: true,
        failed: false,
      }).detail,
    ).toBe("Checking which services are connected.");
    expect(
      serviceAccessDetail({
        googleConnected: null,
        connectorConnected: null,
        loading: false,
        failed: true,
      }).detail,
    ).toBe("We could not check which services are connected.");
    expect(source).toContain("{serviceAccess.label}");
    expect(source).toContain("{serviceAccess.detail}");
    expect(source).not.toContain(">Connected services</p>");
    expect(source).toContain("if (!organizationId) return null");
    expect(source).toContain(">Signed in</SettingsStatus>");
    expect(source).not.toContain(">Authorized</SettingsStatus>");
    expect(source).not.toContain('title="Authorized workspace"');
    expect(source).not.toContain("Effective permissions");
    expect(source).not.toContain("authorized services");
    expect(source).toContain('empty="No role is attached to this session."');
    expect(source).toContain("sessionRoleCopy(session.user.role, session.user.permissions)");
    expect(source).not.toContain('empty="Member"');
    expect(source).not.toContain('session.user.role || "Member"');
    expect(sessionRoleCopy(undefined, [])).toBe(
      "No role is attached to this session. Standard workspace access",
    );
    expect(sessionRoleCopy("  ", ["billing:read"])).toBe(
      "No role is attached to this session. billing:read",
    );
    expect(sessionRoleCopy("owner", [])).toBe("owner · Standard workspace access");
    expect(sessionRoleCopy("admin", ["billing:read", "workspace:write"])).toBe(
      "admin · billing:read, workspace:write",
    );
    expect(source).toContain("getReadyz({");
    expect(source).toContain("Check again");
    expect(source).toContain("Browser address");
    expect(source).toContain("Where this Oppulence tab is open.");
    expect(source).not.toContain("Signed-in address");
    expect(source).toContain(
      "This session has no organization. Access stays with the signed-in account.",
    );
    expect(source).toContain(
      "This session has no organization, so there is no shared connection list. Account connections are in Connections.",
    );
    expect(source).toContain("<ConnectSection");
    expect(source.match(/<ConnectorSettings \/>/g)).toHaveLength(1);
    expect(source).toContain("useSyncExternalStore");
    expect(source).not.toContain("Organization server");
    expect(source).not.toContain(">Default</SettingsStatus>");
    expect(source).toContain("readBrowserOrigin");
    expect(source).toContain("return window.location.origin");
    expect(source).toContain(
      "The default agent for a new chat, and whether anonymous product events may be captured.",
    );
    expect(source).not.toContain("account-wide");
    expect(source).toContain("the next time you start a chat.");
    expect(source).toContain('title="Chat defaults"');
    expect(source).toContain('title="Current plan"');
    expect(source).toContain("billingStatusLabel(billing.status)");
    expect(source).toContain("planLabel(billing?.plan)");
    expect(source).not.toContain('{billing?.plan || "Free"}');
    expect(source).not.toContain('className="text-xs font-normal capitalize text-primary/60"');
    expect(source).not.toContain("{billing.status}");
    expect(source).toContain("usageSectionCopy(usage)");
    expect(source).not.toContain("Activity counted in the current billing period.");
    expect(source).not.toContain("the next time you open Oppulence.");
    expect(source).not.toContain("Metered activity");
    expect(source).not.toContain('title="Chat Defaults"');
    expect(source).not.toContain('title="Current Plan"');
    expect(source).toContain("How Oppulence looks on this device.");
    expect(source).toContain("description={mailPrivacy}");
    expect(source).not.toContain(
      'description="Choose what from mail and calendar can be shared, and which addresses stay private."',
    );
    expect(mailPrivacySectionCopy({ connected: true, failed: false })).toBe(
      "Choose what from mail and calendar can be shared, and which addresses stay private.",
    );
    expect(mailPrivacySectionCopy({ connected: false, failed: false })).toBe(
      "Connect a Google mailbox before you can choose what from mail and calendar is shared.",
    );
    expect(mailPrivacySectionCopy({ connected: null, failed: false })).toBe(
      "Checking whether a Google mailbox is connected.",
    );
    expect(mailPrivacySectionCopy({ connected: null, failed: true })).toBe(
      "Could not check whether a Google mailbox is connected.",
    );
    expect(source).not.toContain("mailbox metadata defaults");
    expect(source).not.toContain("this console");
    expect(source).not.toContain("the console");
    expect(preferenceFormIsHidden(true, false)).toBe(true);
    expect(preferenceFormIsHidden(true, true)).toBe(false);
    expect(preferenceFormIsHidden(false, false)).toBe(false);
    expect(
      source.match(/preferenceFormIsHidden\(query\.isError, query\.data != null\)/g),
    ).toHaveLength(3);
    expect(preferenceRefreshCopy("profile preference")).toBe(
      "Could not refresh your profile preference.",
    );
    expect(preferenceRefreshCopy("default agent")).toBe("Could not refresh your default agent.");
    expect(preferenceRefreshCopy("analytics preference")).toBe(
      "Could not refresh your analytics preference.",
    );
    expect(source).toContain(
      'agents.length === 0 ? "Could not load agents." : "Could not refresh agents."',
    );
  });

  it("talks about an organization only when one is attached", () => {
    const attached = sessionWorkspaceCopy("org_123");
    expect(attached.security).toBe(
      "Workspace access is controlled by the signed-in Oppulence organization.",
    );
    expect(attached.cloudDetail).toBe(
      "Companies, people, and promises for the signed-in organization.",
    );
    expect(attached.connect).toBe(
      "Shared connections for the organization are not a separate list yet. Account connections are in Connections.",
    );

    const personal = sessionWorkspaceCopy(undefined);
    expect(personal.security).toBe(
      "This session has no organization. Access stays with the signed-in account.",
    );
    expect(personal.permissions).toContain("stay with the signed-in account.");
    expect(personal.cloud).toContain("this signed-in account.");
    expect(personal.cloudDetail).toBe(
      "Companies, people, and promises for this signed-in account.",
    );
    expect(personal.connect).toBe(
      "This session has no organization, so there is no shared connection list. Account connections are in Connections.",
    );
    expect(sessionWorkspaceCopy("  ").security).toBe(personal.security);
  });
});
