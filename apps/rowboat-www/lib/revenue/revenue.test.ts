import { beforeEach, describe, expect, it, vi } from "vitest";

import { dashboardRequest } from "@/lib/auth/dashboard-fetch";
import {
  attentionReasonLabel,
  auditFailureCopy,
  examinedConversationCount,
  companyLinkedInAction,
  companyLinkedInURL,
  explainedRevenueError,
  friendlyRevenueError,
  shownRequestError,
  getRelationshipChanges,
  getRelationshipConversationReview,
  getRelationshipCommunicationTimeline,
  getRelationshipGraph,
  getRelationshipTimelinePage,
  googleSourceHealth,
  interactionCountLabel,
  latestCompletedScan,
  listScans,
  relationshipSourceHealth,
  semanticSearch,
} from "@/lib/revenue/revenue";

vi.mock("@/lib/auth/dashboard-fetch", () => ({
  dashboardRequest: vi.fn(),
  toDashboardAPIPath: (path: string) => path,
  redirectBrowserIfUnauthorized: () => undefined,
  loginURL: (returnTo = "/app") => `/api/auth/workos/login?return_to=${returnTo}`,
}));

const mockFetch = vi.mocked(dashboardRequest);

beforeEach(() => mockFetch.mockReset());

describe("examined conversations", () => {
  it("counts what was read once coverage is known", () => {
    expect(
      examinedConversationCount({
        threadsSeen: 90,
        threadsDeepRead: 8,
        threadsSnippetOnly: 2,
        threadsSkipped: 80,
      }),
    ).toBe(10);
  });

  it("keeps the sweep total when an older audit has no coverage", () => {
    expect(examinedConversationCount({ threadsSeen: 12 })).toBe(12);
    expect(examinedConversationCount(null)).toBe(0);
  });
});

describe("attention reason labels", () => {
  it("names an exposure reason instead of the stored code", () => {
    expect(attentionReasonLabel("quiet_account")).toBe("Quiet company");
    expect(attentionReasonLabel("source_degradation")).toBe("Source needs reconnecting");
    expect(attentionReasonLabel("missing_next_step")).toBe("No next step");
    expect(attentionReasonLabel("unresolved_risk")).toBe("Unresolved risk");
    expect(attentionReasonLabel("requested_follow_up_due")).toBe("Follow-up due");
    expect(attentionReasonLabel("custom_signal")).toBe("Custom Signal");
    expect(attentionReasonLabel("source_degradation")).not.toBe("source degradation");
  });
});

describe("getRelationshipGraph", () => {
  it("returns an empty portfolio for a legacy API with no relationships", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "invalid relationshipId" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ relationships: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const graph = await getRelationshipGraph({ scope: "portfolio", depth: 1 });

    expect(graph).toMatchObject({ scope: "portfolio", depth: 1, nodes: [], edges: [] });
    expect(mockFetch.mock.calls[1]?.[0]).toBe("/relationships");
  });

  it("reports an incomplete legacy fan-out instead of silently dropping relationships", async () => {
    const relationshipGraph = {
      contractVersion: "2026-08-01",
      generatedAt: "2026-09-17T20:00:00Z",
      asOf: "2026-09-17T20:00:00Z",
      historical: false,
      scope: "relationship",
      relationshipId: "relationship-1",
      depth: 1,
      nodes: [],
      edges: [],
      permissions: {
        canView: true,
        canContribute: false,
        canApprove: false,
        canExecute: false,
        canSaveViews: false,
      },
    };
    mockFetch
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "invalid relationshipId" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            relationships: Array.from({ length: 5 }, (_, index) => ({
              categories: [],
              displayName: `Relationship ${String(index + 1)}`,
              engagement: "unknown",
              health: "unknown",
              id: `00000000-0000-4000-8000-00000000000${String(index + 1)}`,
              kind: "company",
              lifecycle: "prospect",
              milestones: [],
              projectorVersion: 1,
              resourceRefs: [],
              risks: [],
              sentiment: "unknown",
              stateVersion: 1,
              status: "active",
            })),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response("temporarily unavailable", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        }),
      );
    for (let index = 0; index < 4; index += 1) {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(relationshipGraph), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    await expect(getRelationshipGraph({ scope: "portfolio", depth: 1 })).rejects.toThrow(
      "1 of 5 company graphs failed",
    );
  });
});

describe("listScans", () => {
  it("loads server audit history instead of browser-local ids", async () => {
    const scan = {
      id: "00000000-0000-4000-8000-000000000001",
      status: "completed",
      mode: "local",
      lookbackDays: 90,
    };
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ scans: [scan] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(listScans()).resolves.toEqual([scan]);
    expect(mockFetch.mock.calls[0]?.[0]).toBe("/revenue-leak-scans?limit=10");
  });
});

describe("semanticSearch", () => {
  it("forwards cancellation and preserves unavailable capability state", async () => {
    const controller = new AbortController();
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ available: false, matches: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(semanticSearch("renewal risk", controller.signal)).resolves.toEqual({
      available: false,
      matches: [],
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "/revenue-search?q=renewal+risk",
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});

it("opens the latest report for a stale but authorized Google source", () => {
  expect(
    googleSourceHealth([
      {
        source: "google",
        accounts: [{ status: "stale", missingScopes: [] }],
      },
    ]),
  ).toBe("ready");
  expect(
    latestCompletedScan([
      { id: "failed", status: "failed" },
      { id: "empty-complete", status: "completed", threadsSeen: 0 },
      { id: "latest-complete", status: "completed", threadsSeen: 12 },
      { id: "older-complete", status: "completed", threadsSeen: 8 },
    ])?.id,
  ).toBe("latest-complete");
});

// Source health is unified across the shell and report. Old account rows can
// remain after OAuth creates a replacement connection, so readiness is true
// when any Google account is healthy rather than false when any row is dead.
it("lets one healthy Google account win over stale dead account rows", () => {
  expect(
    relationshipSourceHealth([
      {
        source: "google",
        status: "reconnect_required",
        missingScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      },
      { source: "google", status: "disconnected", missingScopes: [] },
      { source: "google", status: "live", missingScopes: [] },
    ]),
  ).toBe("ready");
});

describe("getRelationshipCommunicationTimeline", () => {
  it("treats a missing communication-intelligence route as an empty timeline", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "not found", code: "not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getRelationshipCommunicationTimeline("rel-1")).resolves.toEqual({
      items: [],
      hasMore: false,
    });
  });

  it("keeps the cursor when an earlier page of mail exists", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [{ id: "mail-1" }],
          hasMore: true,
          nextBefore: "2026-09-01T00:00:00Z",
          nextBeforeId: "a1162000-0000-4000-8000-000000000002",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(getRelationshipCommunicationTimeline("rel-1")).resolves.toEqual({
      items: [{ id: "mail-1" }],
      hasMore: true,
      nextBefore: "2026-09-01T00:00:00Z",
      nextBeforeId: "a1162000-0000-4000-8000-000000000002",
    });
  });
});

describe("getRelationshipTimelinePage", () => {
  it("keeps the cursor when older activity exists", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          observations: [{ id: "obs-1" }],
          hasMore: true,
          nextBefore: "2026-08-01T00:00:00Z",
          nextBeforeId: "a1160000-0000-4000-8000-000000000002",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(getRelationshipTimelinePage("rel-1")).resolves.toEqual({
      observations: [{ id: "obs-1" }],
      hasMore: true,
      nextBefore: "2026-08-01T00:00:00Z",
      nextBeforeId: "a1160000-0000-4000-8000-000000000002",
    });
  });

  it("asks for rows that share the boundary time", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ observations: [], hasMore: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await getRelationshipTimelinePage("rel-1", 50, {
      before: "2026-06-01T00:00:00Z",
      beforeId: "a1160000-0000-4000-8000-000000000002",
    });
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      "/relationships/rel-1/timeline?limit=50&before=2026-06-01T00%3A00%3A00Z&beforeId=a1160000-0000-4000-8000-000000000002",
    );
  });
});

describe("getRelationshipChanges", () => {
  it("loads the two newest snapshots first", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ snapshots: [{ id: "snap-3" }], hasMore: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getRelationshipChanges("rel-1")).resolves.toEqual({
      snapshots: [{ id: "snap-3" }],
      hasMore: true,
    });
    expect(mockFetch.mock.calls[0]?.[0]).toBe("/relationships/rel-1/changes?limit=2");
  });

  it("asks for the snapshots hidden behind the newest two", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ snapshots: [{ id: "snap-1" }], hasMore: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(getRelationshipChanges("rel-1", 2)).resolves.toEqual({
      snapshots: [{ id: "snap-1" }],
      hasMore: false,
    });
    expect(mockFetch.mock.calls[0]?.[0]).toBe("/relationships/rel-1/changes?limit=2&offset=2");
  });
});

describe("getRelationshipConversationReview", () => {
  it("asks for the conversations hidden behind the newest page", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          reviewItems: [{ id: "review-oldest", exactQuote: "Oldest sheet promise quote" }],
          governanceReceipts: [{ receiptId: "receipt-oldest" }],
          hasMore: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(getRelationshipConversationReview("rel-1", 200)).resolves.toEqual({
      reviewItems: [{ id: "review-oldest", exactQuote: "Oldest sheet promise quote" }],
      governanceReceipts: [{ receiptId: "receipt-oldest" }],
      hasMore: false,
    });
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      "/relationships/rel-1/conversation-review?offset=200",
    );
  });
});

describe("explainedRevenueError", () => {
  it("keeps a short fallback when the failure is not one we explain", () => {
    expect(explainedRevenueError(new Error("upstream"), "Could not load connections.")).toBe(
      "Could not load connections.",
    );
    expect(explainedRevenueError(new Error("  "), "Could not load connections.")).toBe(
      "Could not load connections.",
    );
    expect(
      explainedRevenueError(new Error("Request failed (429)"), "Could not load connections."),
    ).toBe("Too many requests were sent from this workspace. Wait a moment, then try again.");
    expect(
      explainedRevenueError(
        new Error("Composio request failed (503)"),
        "Additional products are temporarily unavailable.",
      ),
    ).toBe(
      "The Oppulence API returned an error (503). Confirm rowboat-api is running on port 18080, then reload.",
    );
  });
});

describe("shownRequestError", () => {
  it("replaces a bare status code and keeps a specific sentence", () => {
    const company = "Could not create the company.";
    expect(shownRequestError(new Error("Request failed (500)"), company)).toBe(company);
    expect(shownRequestError(new Error("Console request failed (500)."), "Could not save.")).toBe(
      "Could not save.",
    );
    expect(
      shownRequestError(new Error("Workflow request failed (409)"), "Could not create workflow"),
    ).toBe("Could not create workflow");
    expect(
      shownRequestError(
        new Error("Composio request failed (500)"),
        "Could not start the connection.",
      ),
    ).toBe("Could not start the connection.");
    expect(
      shownRequestError(new Error("Export failed (500)"), "Could not export the record."),
    ).toBe("Could not export the record.");
    expect(
      shownRequestError(
        new Error("Report export failed (500)"),
        "The report could not be downloaded.",
      ),
    ).toBe("The report could not be downloaded.");
    expect(
      shownRequestError(
        new Error("Report export failed (429)"),
        "The report could not be downloaded.",
      ),
    ).toBe("Too many requests were sent from this workspace. Wait a moment, then try again.");
    expect(shownRequestError(new Error("revision conflict"), company)).toBe("revision conflict");
    expect(shownRequestError(new Error("Request failed (429)"), company)).toBe(
      "Too many requests were sent from this workspace. Wait a moment, then try again.",
    );
    expect(shownRequestError(new Error("Request failed (503)"), company)).toBe(
      [
        "The Oppulence API returned an error (503).",
        "Confirm rowboat-api is running on port 18080, then reload.",
      ].join(" "),
    );
    expect(shownRequestError("nope", "Could not save mailbox policy.")).toBe(
      "Could not save mailbox policy.",
    );
  });
});

describe("friendlyRevenueError", () => {
  it("turns Gmail rate limits into an actionable message", () => {
    expect(
      friendlyRevenueError(
        "revenue: gmail thread sweep: gmail threads.list: google api returned 429: User-rate limit exceeded",
      ),
    ).toContain("try the audit again in about 15 minutes");
    expect(friendlyRevenueError("rate limit exceeded")).toBe(
      "Too many requests were sent from this workspace. Wait a moment, then try again.",
    );
    expect(friendlyRevenueError("Report export failed (429)")).toBe(
      "Too many requests were sent from this workspace. Wait a moment, then try again.",
    );
    expect(friendlyRevenueError("Request failed (503)")).toBe(
      "The Oppulence API returned an error (503). Confirm rowboat-api is running on port 18080, then reload.",
    );
    expect(friendlyRevenueError("Report export failed (503)")).toBe(
      "The Oppulence API returned an error (503). Confirm rowboat-api is running on port 18080, then reload.",
    );
    expect(friendlyRevenueError("Export failed (503)")).toBe(
      "The Oppulence API returned an error (503). Confirm rowboat-api is running on port 18080, then reload.",
    );
  });

  it("explains a failed audit without the provider payload", () => {
    expect(auditFailureCopy("google api /gmail returned 503: Backend Error")).toBe(
      "Google could not finish reading your mail. Try the audit again in a few minutes.",
    );
    expect(auditFailureCopy("scan abandoned (process restart)")).toBe(
      "The audit stopped before it finished. Run it again.",
    );
    expect(
      auditFailureCopy(
        "revenue: gmail thread sweep: google api returned 401: Request had invalid authentication credentials.",
      ),
    ).toBe("Google stopped accepting the authorization. Reconnect, then run the audit again.");
    expect(
      auditFailureCopy(
        "revenue: gmail thread sweep: gmail threads.list: google api returned 429: User-rate limit exceeded",
      ),
    ).toContain("try the audit again in about 15 minutes");
  });
});

describe("companyLinkedInURL", () => {
  it("uses an exact company reference and otherwise falls back to LinkedIn search", () => {
    expect(companyLinkedInURL("Solomon AI", [])).toContain("keywords=Solomon%20AI");
    expect(companyLinkedInURL("Solomon AI", ["linkedin:company:solomon-ai"])).toBe(
      "https://www.linkedin.com/company/solomon-ai",
    );
    expect(
      companyLinkedInURL("Solomon AI", [], "https://www.linkedin.com/company/solomon-ai-inc"),
    ).toBe("https://www.linkedin.com/company/solomon-ai-inc");
    expect(companyLinkedInURL("Acme", [], "https://linkedin.com/company/acme")).toBe(
      "https://linkedin.com/company/acme",
    );
    expect(companyLinkedInURL("Acme", [], "  www.linkedin.com/company/acme  ")).toBe(
      "https://www.linkedin.com/company/acme",
    );
    expect(companyLinkedInURL("Acme", [], "javascript:alert(1)")).toContain("keywords=Acme");
    expect(companyLinkedInAction("Acme", [], null)).toEqual({
      href: companyLinkedInURL("Acme", []),
      label: "Find profile",
    });
    expect(companyLinkedInAction("Acme", ["linkedin:company:acme"], null).label).toBe(
      "View profile",
    );
    expect(companyLinkedInAction("Acme", [], "https://www.linkedin.com/company/acme").label).toBe(
      "View profile",
    );
  });
});

it("labels interaction counts grammatically", () => {
  expect(interactionCountLabel(1)).toBe("1 email thread");
  expect(interactionCountLabel(2)).toBe("2 email threads");
});

// An absent count is not a count of zero. An account last touched eighteen
// hours ago was labelled "0 interactions" because the total had never been
// computed — a number nobody counted, stated as fact.
it("interactionCountLabel does not invent a zero", () => {
  expect(interactionCountLabel(undefined)).toBe("—");
  expect(interactionCountLabel(null)).toBe("—");
  expect(interactionCountLabel(0)).toBe("0 email threads");
});
