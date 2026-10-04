import { describe, expect, it } from "vitest";

import {
  connectedSourceCount,
  googleNeedsReconnect,
  revenueTabFromParam,
  revenueTabSearch,
  sidebarGroupFallback,
  sidebarQueryError,
  sourceHealth,
  sourceMeterVisible,
  trialDaysRemaining,
  workspaceLabel,
} from "@/components/features/dashboard/app-shell/app-shell";
import { auditHistoryLabel, auditLaunchLabel, googleAuditLaunch } from "@/lib/revenue/revenue";
import type { RelationshipSourceStatus } from "@/lib/revenue/types";

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe("workspace label", () => {
  it("shows the saved profile name ahead of the account name", () => {
    expect(
      workspaceLabel({ preferenceName: "Ada Lovelace", deviceName: "Local", userName: "Dev" }),
    ).toBe("Ada Lovelace");
  });

  it("falls back to the account name when the profile name is blank", () => {
    expect(
      workspaceLabel({ preferenceName: "  ", deviceName: null, userName: "dev@solomon-ai.co" }),
    ).toBe("dev");
    expect(workspaceLabel({ preferenceName: "", userName: "" })).toBe("Workspace");
  });

  it("keeps a saved name that contains an @ sign", () => {
    expect(
      workspaceLabel({ preferenceName: "Ada @ Northwind", userName: "dev@solomon-ai.co" }),
    ).toBe("Ada @ Northwind");
  });
});

describe("sidebar trial banner", () => {
  it("counts the whole days left on a trial", () => {
    expect(trialDaysRemaining({ status: "trialing", trialExpiresAt: inDays(28.5) })).toBe(29);
  });

  it("stays silent for every account that is not trialing", () => {
    // A paid account keeps the date of the trial it converted from. Reading the
    // date without the status would put a trial banner on a paying customer.
    expect(trialDaysRemaining({ status: "active", trialExpiresAt: inDays(28) })).toBeNull();
    expect(trialDaysRemaining({ status: "trialing", trialExpiresAt: null })).toBeNull();
    expect(trialDaysRemaining(undefined)).toBeNull();
  });

  it("never counts below zero once the trial has expired", () => {
    expect(trialDaysRemaining({ status: "trialing", trialExpiresAt: inDays(-3) })).toBe(0);
  });
});

describe("sidebar source status", () => {
  const source = (over: Partial<RelationshipSourceStatus> = {}) =>
    ({ status: "streaming", completeness: "complete", ...over }) as RelationshipSourceStatus;

  it("says nothing is connected when no source reports", () => {
    expect(sourceHealth([]).tone).toBe("idle");
    expect(sourceMeterVisible(0, 0)).toBe(false);
    expect(sourceMeterVisible(undefined, undefined)).toBe(false);
  });

  it("shows the meter once a source exists, including a ratio of zero", () => {
    expect(sourceMeterVisible(2, 0)).toBe(true);
    expect(sourceMeterVisible(2, 2)).toBe(true);
  });

  it("reports a healthy portfolio of sources", () => {
    expect(sourceHealth([source(), source()])).toEqual({
      tone: "ok",
      label: "Sources are current",
    });
  });

  // A source that stopped reporting hides risk rather than showing it, so it
  // must win over a source that is merely still catching up.
  it("ranks a disconnected source above one that is only syncing", () => {
    const health = sourceHealth([
      source({ status: "backfilling", completeness: "partial" }),
      source({ status: "reconnect_required" }),
    ]);
    expect(health).toEqual({ tone: "attention", label: "1 source needs reconnecting" });
  });

  it("counts sources that are behind", () => {
    expect(
      sourceHealth([source({ status: "stale" }), source({ completeness: "partial" })]),
    ).toEqual({ tone: "attention", label: "2 sources are behind" });
  });

  // The status card's meter reads "connected / total". A source that needs
  // reconnecting delivers nothing, so counting it would show a full meter over
  // a dead grant.
  it("explains a rate limit instead of calling the source list unavailable", () => {
    expect(sidebarQueryError(new Error("Request failed (429)"), "Source status unavailable")).toBe(
      "Too many requests were sent from this workspace. Wait a moment, then try again.",
    );
    expect(sidebarQueryError(new Error("Request failed (503)"), "Could not load runs")).toBe(
      "The Oppulence API returned an error (503). Confirm rowboat-api is running on port 18080, then reload.",
    );
    expect(sidebarQueryError(new Error("Request failed (500)"), "Could not load agents")).toBe(
      "Could not load agents",
    );
    expect(sidebarGroupFallback(false, "agents")).toBe("Could not load agents");
    expect(sidebarGroupFallback(true, "schedules")).toBe("Could not refresh schedules");
    expect(sidebarGroupFallback(true, "runs")).toBe("Could not refresh runs");
    expect(sidebarQueryError(new Error("  "), "Source status unavailable")).toBe(
      "Source status unavailable",
    );
  });

  it("does not count a source that stopped reporting as connected", () => {
    expect(
      connectedSourceCount([
        source(),
        source({ status: "reconnect_required" }),
        source({ status: "disconnected" }),
        source({ status: "backfilling", completeness: "partial" }),
      ]),
    ).toBe(2);
  });
});

describe("audit reconnect guard", () => {
  const google = (status: string, sourceAccountId = "me@x.co") =>
    ({ source: "google", sourceAccountId, status }) as RelationshipSourceStatus;

  it("sends the user to reconnect when every Google account stopped", () => {
    expect(googleNeedsReconnect([google("reconnect_required")])).toBe(true);
    expect(googleNeedsReconnect([google("disconnected"), google("reconnect_required", "b")])).toBe(
      true,
    );
  });

  // The desktop app can record a reconnect under "default" while the failed
  // row keeps the email. One working account means the audit can run.
  it("lets the audit run when any Google account works again", () => {
    expect(
      googleNeedsReconnect([google("reconnect_required"), google("connected", "default")]),
    ).toBe(false);
  });

  // A missing reconnect flag is not permission to start the scan. No Google
  // rows means there is no mailbox to read, so the button connects instead.
  it("does not treat a missing mailbox as a dead grant", () => {
    expect(googleNeedsReconnect([])).toBe(false);
    expect(
      googleNeedsReconnect([
        { source: "slack", status: "reconnect_required" } as RelationshipSourceStatus,
      ]),
    ).toBe(false);
    expect(googleAuditLaunch([])).toBe("connect");
    expect(
      googleAuditLaunch([{ source: "slack", status: "connected" } as RelationshipSourceStatus]),
    ).toBe("connect");
  });

  it("runs the audit only when a Google account can be read", () => {
    expect(googleAuditLaunch([google("connected")])).toBe("run");
    expect(googleAuditLaunch([google("reconnect_required"), google("live", "default")])).toBe(
      "run",
    );
    expect(googleAuditLaunch([google("reconnect_required")])).toBe("reconnect");
    expect(googleAuditLaunch([google("not_connected")])).toBe("reconnect");
    expect(
      auditLaunchLabel({
        needsReconnect: false,
        needsConnect: true,
        scanning: false,
        scanningLabel: "Auditing…",
        runLabel: "Run Promise Leak Audit",
      }),
    ).toBe("Connect Gmail & Calendar");
    expect(auditHistoryLabel("completed")).toBe("Completed");
    expect(auditHistoryLabel("failed")).toBe("Failed");
    expect(auditHistoryLabel("running")).toBe("In progress");
    expect(auditHistoryLabel("pending")).toBe("In progress");
    expect(auditHistoryLabel("failed")).not.toBe("failed");
  });
});

describe("revenue tab address", () => {
  it("round-trips every tab through the query string", () => {
    for (const tab of ["people", "queue", "scans", "workspace", "commitments"] as const) {
      const search = revenueTabSearch(tab);
      expect(revenueTabFromParam(new URLSearchParams(search).get("tab"))).toBe(tab);
    }
    expect(revenueTabSearch("commitments")).toBe("");
  });

  // A hand-edited or stale link must not render an empty view.
  it("falls back to Commitments for an unknown or inherited key", () => {
    expect(revenueTabFromParam("bogus")).toBe("commitments");
    expect(revenueTabFromParam("toString")).toBe("commitments");
    expect(revenueTabFromParam(null)).toBe("commitments");
  });
});
